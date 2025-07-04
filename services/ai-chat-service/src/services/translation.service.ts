import OpenAI from 'openai';
import { logger } from '../utils/logger';

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface BatchTranslationResult {
  translations: TranslationResult[];
  errors: string[];
}

/**
 * Translation service for AI chat responses
 * Provides real-time translation from target language to user's native language
 */
export class TranslationService {
  private openai: OpenAI;
  private cache: Map<string, string> = new Map();
  private readonly CACHE_SIZE_LIMIT = 1000;

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey: apiKey
    });
  }

  /**
   * Get user's native language from profile service
   */
  async getUserNativeLanguage(userId: string): Promise<string> {
    try {
      const profileServiceUrl = process.env.PROFILE_SERVICE_URL || 'http://profile:3003';
      const response = await fetch(`${profileServiceUrl}/profile/${userId}`);
      
      if (!response.ok) {
        logger.warn(`Failed to fetch profile for user ${userId}, using default language`);
        return 'english'; // Default fallback
      }
      
      const profile = await response.json() as { native_language?: string };
      return profile.native_language || 'english'; // Default to English if not set
    } catch (error) {
      logger.error('Error fetching user native language:', error);
      return 'english'; // Default fallback
    }
  }

  /**
   * Translate AI response from user's native language to learning language for display
   * The AI should respond in the user's native language, and we provide the learning language translation
   */
  async translateResponse(
    text: string,
    targetLanguage: 'spanish' | 'french', // The language being learned
    userId: string,
    context?: {
      cefrLevel: string;
      conversationTopic?: string;
      isLearningContext?: boolean;
    }
  ): Promise<TranslationResult> {
    try {
      // Get user's native language (this is the target language for translation)
      const userNativeLanguage = await this.getUserNativeLanguage(userId);
      
      // AI responds in learning language, translate TO user's native language
      const sourceLanguage = targetLanguage; // learning language is source (spanish/french)
      const targetLangCode = userNativeLanguage; // native language is target (english)
      
      // Check cache first
      const cacheKey = `${sourceLanguage}-${targetLangCode}-${text}`;
      if (this.cache.has(cacheKey)) {
        return {
          originalText: text,
          translatedText: this.cache.get(cacheKey)!,
          sourceLanguage: targetLanguage, // learning language
          targetLanguage: userNativeLanguage // native language
        };
      }

      // Prepare translation prompt with language learning context
      const prompt = this.buildTranslationPrompt(text, sourceLanguage, targetLangCode, context);

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: prompt
          },
          {
            role: 'user',
            content: text
          }
        ],
        max_tokens: 300,
        temperature: 0.3, // Lower temperature for more consistent translations
      });

      const translatedText = completion.choices[0]?.message?.content?.trim() || text;

      // Cache the translation
      this.cacheTranslation(cacheKey, translatedText);

      return {
        originalText: text,
        translatedText,
        sourceLanguage: targetLanguage, // learning language
        targetLanguage: userNativeLanguage // native language
      };

    } catch (error) {
      logger.error('Translation error:', error);
      
      const sourceLanguage = await this.getUserNativeLanguage(userId);
      
      // Return original text as fallback
      return {
        originalText: text,
        translatedText: text,
        sourceLanguage,
        targetLanguage
      };
    }
  }

  /**
   * Translate multiple texts in batch for efficiency
   */
  async translateBatch(
    texts: string[],
    targetLanguage: 'spanish' | 'french', // The language being learned
    userId: string,
    context?: {
      cefrLevel: string;
      conversationTopic?: string;
      isLearningContext?: boolean;
    }
  ): Promise<BatchTranslationResult> {
    const translations: TranslationResult[] = [];
    const errors: string[] = [];

    // Process in chunks to avoid API limits
    const chunkSize = 5;
    for (let i = 0; i < texts.length; i += chunkSize) {
      const chunk = texts.slice(i, i + chunkSize);
      
      try {
        const chunkTranslations = await Promise.all(
          chunk.map(text => this.translateResponse(text, targetLanguage, userId, context))
        );
        translations.push(...chunkTranslations);
      } catch (error) {
        logger.error(`Batch translation error for chunk ${i}:`, error);
        errors.push(`Failed to translate chunk starting at index ${i}`);
        
        // Add fallback translations for failed chunk
        const sourceLanguage = await this.getUserNativeLanguage(userId);
        chunk.forEach(text => {
          translations.push({
            originalText: text,
            translatedText: text,
            sourceLanguage,
            targetLanguage
          });
        });
      }
    }

    return { translations, errors };
  }

  /**
   * Translate suggested responses for better UX
   */
  async translateSuggestedResponses(
    suggestions: string[],
    targetLanguage: 'spanish' | 'french', // The language being learned
    userId: string
  ): Promise<Array<{ original: string; translation: string }>> {
    try {
      const result = await this.translateBatch(suggestions, targetLanguage, userId, {
        cefrLevel: 'A1', // Simplified for suggestions
        isLearningContext: true
      });

      return result.translations.map(t => ({
        original: t.originalText,
        translation: t.translatedText
      }));
    } catch (error) {
      logger.error('Error translating suggested responses:', error);
      return suggestions.map(s => ({ original: s, translation: s }));
    }
  }

  /**
   * Build context-aware translation prompt
   */
  private buildTranslationPrompt(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    context?: {
      cefrLevel: string;
      conversationTopic?: string;
      isLearningContext?: boolean;
    }
  ): string {
    const languageMap: Record<string, string> = {
      spanish: 'Spanish',
      french: 'French',
      english: 'English'
    };

    const sourceLang = languageMap[sourceLanguage] || sourceLanguage;
    const targetLang = languageMap[targetLanguage] || targetLanguage;

    let prompt = `You are a professional translator specializing in language learning contexts. 
Translate the following ${sourceLang} text to ${targetLang}.`;

    if (context?.isLearningContext) {
      prompt += `

CONTEXT: This is part of a language learning conversation at ${context.cefrLevel} level.`;
      
      if (context.conversationTopic) {
        prompt += ` The conversation topic is: ${context.conversationTopic}.`;
      }

      prompt += `

TRANSLATION GUIDELINES:
- Provide natural, conversational translations
- Maintain the tone and intent of the original
- Use simple, clear language appropriate for language learners
- If there are idiomatic expressions, translate them naturally but preserve meaning
- For learning vocabulary, provide straightforward translations
- Keep the same level of formality as the original`;
    }

    prompt += `

Respond with ONLY the translation, no explanations or additional text.`;

    return prompt;
  }

  /**
   * Cache management
   */
  private cacheTranslation(key: string, translation: string): void {
    // Implement LRU-like behavior
    if (this.cache.size >= this.CACHE_SIZE_LIMIT) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, translation);
  }

  /**
   * Clear translation cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Translation cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; limit: number; hitRate?: number } {
    return {
      size: this.cache.size,
      limit: this.CACHE_SIZE_LIMIT
    };
  }

  /**
   * Validate supported languages
   */
  isSupportedLanguage(language: string): boolean {
    const supportedLanguages = ['spanish', 'french', 'english'];
    return supportedLanguages.includes(language.toLowerCase());
  }
}
