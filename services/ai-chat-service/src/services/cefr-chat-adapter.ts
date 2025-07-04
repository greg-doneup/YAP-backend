import OpenAI from 'openai';
import { CEFR_PROMPTS } from '../prompts/cefr-prompts';
import { CONVERSATION_SCENARIOS } from '../prompts/conversation-scenarios';
import { ConversationContext, ChatMessage, VocabularyItem } from '../types/chat-session';
import { TranslationService } from './translation.service';
import { logger } from '../utils/logger';

export class CEFRChatAdapter {
  private openai: OpenAI;
  private translationService: TranslationService;

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey: apiKey
    });
    this.translationService = new TranslationService(apiKey);
  }

  /**
   * Generate AI response adapted to user's CEFR level with translation
   */
  async generateResponse(
    userMessage: string,
    context: ConversationContext,
    conversationHistory: ChatMessage[],
    vocabularyRecommendations?: string[],
    pronunciationResult?: any,
    includeTranslation: boolean = true,
    userId?: string
  ): Promise<{
    response: string;
    responseTranslation?: string;
    vocabularyIntroduced: VocabularyItem[];
    pronunciationFocus: string[];
    pronunciationFocusTranslations?: string[];
    suggestedResponses: string[];
    suggestedResponsesTranslations?: Array<{ original: string; translation: string }>;
  }> {
    try {
      // Get user's native language for AI responses
      let userNativeLanguage = 'english'; // Default fallback
      if (userId) {
        try {
          userNativeLanguage = await this.translationService.getUserNativeLanguage(userId);
        } catch (error) {
          logger.warn('Failed to get user native language, using default:', error);
        }
      }

      const prompt = this.buildPrompt(context, conversationHistory, userMessage, userNativeLanguage);
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: prompt },
          ...this.formatConversationHistory(conversationHistory),
          { role: 'user', content: userMessage }
        ],
        max_tokens: 300,
        temperature: 0.7,
      });

      const aiResponse = completion.choices[0]?.message?.content || '';
      
      // Analyze response for vocabulary and pronunciation focus
      const analysis = this.analyzeResponse(aiResponse, context);
      
      // Generate translations if requested
      let responseTranslation: string | undefined;
      let pronunciationFocusTranslations: string[] | undefined;
      let suggestedResponsesTranslations: Array<{ original: string; translation: string }> | undefined;

      if (includeTranslation && userId) {
        try {
          // Translate the main AI response
          const mainTranslation = await this.translationService.translateResponse(
            aiResponse,
            context.language as 'spanish' | 'french',
            userId,
            {
              cefrLevel: context.cefrLevel,
              conversationTopic: context.currentTopic,
              isLearningContext: true
            }
          );
          responseTranslation = mainTranslation.translatedText;

          // Translate pronunciation focus items
          if (analysis.pronunciationFocus.length > 0) {
            const focusTranslations = await this.translationService.translateBatch(
              analysis.pronunciationFocus,
              context.language as 'spanish' | 'french',
              userId
            );
            pronunciationFocusTranslations = focusTranslations.translations.map(t => t.translatedText);
          }

          // Translate suggested responses
          if (analysis.suggestedResponses.length > 0) {
            suggestedResponsesTranslations = await this.translationService.translateSuggestedResponses(
              analysis.suggestedResponses,
              context.language as 'spanish' | 'french',
              userId
            );
          }
        } catch (translationError) {
          logger.warn('Translation failed, continuing without translations:', translationError);
        }
      }
      
      const result: {
        response: string;
        responseTranslation?: string;
        vocabularyIntroduced: VocabularyItem[];
        pronunciationFocus: string[];
        pronunciationFocusTranslations?: string[];
        suggestedResponses: string[];
        suggestedResponsesTranslations?: Array<{ original: string; translation: string }>;
      } = {
        response: aiResponse,
        vocabularyIntroduced: analysis.vocabulary,
        pronunciationFocus: analysis.pronunciationFocus,
        suggestedResponses: analysis.suggestedResponses
      };

      if (responseTranslation) {
        result.responseTranslation = responseTranslation;
      }

      if (pronunciationFocusTranslations) {
        result.pronunciationFocusTranslations = pronunciationFocusTranslations;
      }

      if (suggestedResponsesTranslations) {
        result.suggestedResponsesTranslations = suggestedResponsesTranslations;
      }

      return result;
    } catch (error) {
      logger.error('Error generating AI response:', error);
      return await this.getFallbackResponse(context, includeTranslation, userId);
    }
  }

  /**
   * Build appropriate prompt based on CEFR level and conversation mode
   */
  private buildPrompt(
    context: ConversationContext,
    conversationHistory: ChatMessage[],
    userMessage: string,
    userNativeLanguage: string = 'english'
  ): string {
    const languagePrompts = CEFR_PROMPTS[context.language as keyof typeof CEFR_PROMPTS];
    const cefrConfig = languagePrompts?.[context.cefrLevel as keyof typeof languagePrompts];
    
    if (!cefrConfig) {
      throw new Error(`No CEFR configuration found for ${context.language} ${context.cefrLevel}`);
    }

    let basePrompt = cefrConfig.instructions;

    // Add scenario-specific instructions if in scenario mode
    if (context.conversationFlow === 'practice' && context.currentTopic in CONVERSATION_SCENARIOS) {
      const scenario = CONVERSATION_SCENARIOS[context.currentTopic as keyof typeof CONVERSATION_SCENARIOS];
      const scenarioPrompt = scenario.prompts[context.cefrLevel];
      if (scenarioPrompt) {
        basePrompt += `\n\nSCENARIO: ${scenarioPrompt}`;
      }
    }

    // Add conversation context
    basePrompt += `\n\nCONVERSATION CONTEXT:
- Current topic: ${context.currentTopic}
- Messages exchanged: ${context.messagesExchanged}
- User's current level: ${context.cefrLevel}
- Learning goals: ${context.learningGoals.join(', ')}
- Vocabulary already introduced: ${context.vocabularyIntroduced.map(v => v.word).join(', ')}
- Pronunciation issues to focus on: ${context.pronunciationIssues.join(', ')}`;

    // Add adaptive instructions based on conversation flow
    switch (context.conversationFlow) {
      case 'intro':
        basePrompt += '\n\nThis is the beginning of the conversation. Start with a warm greeting and gentle introduction to the topic.';
        break;
      case 'main':
        basePrompt += '\n\nWe are in the main conversation. Engage naturally while staying within CEFR constraints.';
        break;
      case 'practice':
        basePrompt += '\n\nFocus on practicing specific vocabulary and structures. Provide gentle corrections and encouragement.';
        break;
      case 'wrap-up':
        basePrompt += '\n\nWe are concluding the conversation. Summarize what was learned and encourage the student.';
        break;
    }

    basePrompt += `\n\nIMPORTANT: 
- Respond in ${context.language} (the language the student is learning)
- Keep vocabulary appropriate for ${context.cefrLevel} level
- If the user makes mistakes, correct them naturally by modeling correct usage
- Ask engaging questions to continue the conversation
- Introduce 1-2 new vocabulary words maximum per response
- Be encouraging and supportive`;

    return basePrompt;
  }

  /**
   * Format conversation history for OpenAI API
   */
  private formatConversationHistory(history: ChatMessage[]): Array<{role: 'user' | 'assistant', content: string}> {
    return history.slice(-10).map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));
  }

  /**
   * Analyze AI response to extract vocabulary and pronunciation focus
   */
  private analyzeResponse(response: string, context: ConversationContext): {
    vocabulary: VocabularyItem[];
    pronunciationFocus: string[];
    suggestedResponses: string[];
  } {
    const words = response.toLowerCase().match(/\b\w+\b/g) || [];
    const languagePrompts = CEFR_PROMPTS[context.language as keyof typeof CEFR_PROMPTS];
    const cefrConfig = languagePrompts?.[context.cefrLevel as keyof typeof languagePrompts];
    
    // Find new vocabulary (words not in basic CEFR vocabulary)
    const newVocabulary: VocabularyItem[] = [];
    const basicVocab = cefrConfig?.vocabulary || [];
    
    words.forEach(word => {
      if (!basicVocab.includes(word) && word.length > 3) {
        // This is simplified - in production, you'd have a more sophisticated vocabulary database
        newVocabulary.push({
          word,
          meaning: `meaning of ${word}`, // Would come from vocabulary database
          example: `Example with ${word}`,
          difficulty: context.cefrLevel,
          category: context.currentTopic
        });
      }
    });

    // Generate pronunciation focus based on language
    const pronunciationFocus: string[] = [];
    if (context.language === 'spanish') {
      if (response.includes('rr') || response.includes('r')) pronunciationFocus.push('rolled R');
      if (response.includes('ñ')) pronunciationFocus.push('ñ sound');
      if (response.includes('j')) pronunciationFocus.push('soft J sound');
    } else if (context.language === 'french') {
      if (response.includes('on') || response.includes('an')) pronunciationFocus.push('nasal sounds');
      if (response.includes('eu')) pronunciationFocus.push('eu sound');
      if (response.includes('u')) pronunciationFocus.push('French u');
    }

    // Generate suggested responses based on CEFR level
    const suggestedResponses = this.generateSuggestedResponses(context);

    return {
      vocabulary: newVocabulary.slice(0, 2), // Limit to 2 new words
      pronunciationFocus,
      suggestedResponses
    };
  }

  /**
   * Generate suggested responses for the user
   */
  private generateSuggestedResponses(context: ConversationContext): string[] {
    const level = context.cefrLevel;
    const language = context.language;

    if (language === 'spanish') {
      switch (level) {
        case 'A1':
          return ['Sí', 'No', '¿Cómo?', 'No entiendo', 'Gracias'];
        case 'A2':
          return ['Me gusta', 'No me gusta', '¿Puedes repetir?', 'Eso es interesante', '¿Qué piensas?'];
        case 'B1':
          return ['En mi opinión...', 'Creo que...', 'No estoy de acuerdo', 'Es una buena idea', '¿Podrías explicar?'];
        default:
          return ['Sí', 'No', 'Gracias'];
      }
    } else if (language === 'french') {
      switch (level) {
        case 'A1':
          return ['Oui', 'Non', 'Comment?', 'Je ne comprends pas', 'Merci'];
        case 'A2':
          return ['J\'aime', 'Je n\'aime pas', 'Pouvez-vous répéter?', 'C\'est intéressant', 'Que pensez-vous?'];
        case 'B1':
          return ['À mon avis...', 'Je pense que...', 'Je ne suis pas d\'accord', 'C\'est une bonne idée', 'Pourriez-vous expliquer?'];
        default:
          return ['Oui', 'Non', 'Merci'];
      }
    }

    return ['Yes', 'No', 'Thank you'];
  }

  /**
   * Provide fallback response when AI fails
   */
  private async getFallbackResponse(
    context: ConversationContext, 
    includeTranslation: boolean = true, 
    userId?: string
  ): Promise<{
    response: string;
    responseTranslation?: string;
    vocabularyIntroduced: VocabularyItem[];
    pronunciationFocus: string[];
    pronunciationFocusTranslations?: string[];
    suggestedResponses: string[];
    suggestedResponsesTranslations?: Array<{ original: string; translation: string }>;
  }> {
    const language = context.language;
    let response = '';
    
    if (language === 'spanish') {
      response = '¡Hola! ¿Cómo estás? Estoy aquí para practicar español contigo.';
    } else if (language === 'french') {
      response = 'Bonjour! Comment allez-vous? Je suis ici pour pratiquer le français avec vous.';
    } else {
      response = 'Hello! How are you? I\'m here to practice with you.';
    }

    const suggestedResponses = this.generateSuggestedResponses(context);
    let responseTranslation: string | undefined;
    let suggestedResponsesTranslations: Array<{ original: string; translation: string }> | undefined;

    if (includeTranslation && userId && (language === 'spanish' || language === 'french')) {
      try {
        // Translate fallback response
        const translation = await this.translationService.translateResponse(
          response,
          language as 'spanish' | 'french',
          userId,
          { cefrLevel: context.cefrLevel, isLearningContext: true }
        );
        responseTranslation = translation.translatedText;

        // Translate suggested responses
        suggestedResponsesTranslations = await this.translationService.translateSuggestedResponses(
          suggestedResponses,
          language as 'spanish' | 'french',
          userId
        );
      } catch (error) {
        logger.warn('Failed to translate fallback response:', error);
      }
    }

    const result: {
      response: string;
      responseTranslation?: string;
      vocabularyIntroduced: VocabularyItem[];
      pronunciationFocus: string[];
      pronunciationFocusTranslations?: string[];
      suggestedResponses: string[];
      suggestedResponsesTranslations?: Array<{ original: string; translation: string }>;
    } = {
      response,
      vocabularyIntroduced: [],
      pronunciationFocus: [],
      suggestedResponses
    };

    if (responseTranslation) {
      result.responseTranslation = responseTranslation;
    }

    if (suggestedResponsesTranslations) {
      result.suggestedResponsesTranslations = suggestedResponsesTranslations;
    }

    return result;
  }
}
