import { ConversationContext, VocabularyItem } from '../types/chat-session';
import { logger } from '../utils/logger';

export class ContextManager {
  /**
   * Update conversation context based on user interaction
   */
  updateContext(
    context: ConversationContext,
    userMessage: string,
    hasAudio: boolean
  ): ConversationContext {
    const updatedContext = { ...context };

    // Update message count
    updatedContext.messagesExchanged += 1;
    updatedContext.lastInteraction = new Date();

    // Update conversation flow based on message count
    updatedContext.conversationFlow = this.determineConversationFlow(
      updatedContext.messagesExchanged
    );

    // Analyze user message for learning patterns
    this.analyzeUserMessage(updatedContext, userMessage);

    // Track pronunciation practice if audio is provided
    if (hasAudio) {
      this.trackPronunciationPractice(updatedContext);
    }

    logger.debug(`Updated context for session ${context.sessionId}`, {
      messagesExchanged: updatedContext.messagesExchanged,
      conversationFlow: updatedContext.conversationFlow,
      currentTopic: updatedContext.currentTopic
    });

    return updatedContext;
  }

  /**
   * Determine conversation flow based on message count
   */
  private determineConversationFlow(messageCount: number): 'intro' | 'main' | 'practice' | 'wrap-up' {
    if (messageCount <= 2) return 'intro';
    if (messageCount <= 15) return 'main';
    if (messageCount <= 25) return 'practice';
    return 'wrap-up';
  }

  /**
   * Analyze user message for learning insights
   */
  private analyzeUserMessage(context: ConversationContext, message: string): void {
    // Add null/undefined check
    if (!message || typeof message !== 'string') {
      return;
    }
    
    const words = message.toLowerCase().split(/\s+/);
    
    // Simple vocabulary tracking - in production this would be more sophisticated
    words.forEach(word => {
      if (word.length > 3 && !this.isBasicWord(word, context.language)) {
        const existingVocab = context.vocabularyIntroduced.find(v => v.word === word);
        if (!existingVocab) {
          // User used a new vocabulary word
          const vocabItem: VocabularyItem = {
            word,
            meaning: `User used: ${word}`,
            example: message,
            difficulty: context.cefrLevel,
            category: context.currentTopic
          };
          context.vocabularyIntroduced.push(vocabItem);
        }
      }
    });

    // Update topic if it seems to have changed
    this.updateTopicIfNeeded(context, message);
  }

  /**
   * Check if word is considered basic for the language
   */
  private isBasicWord(word: string, language: string): boolean {
    const basicSpanish = ['que', 'con', 'para', 'por', 'como', 'pero', 'muy', 'todo', 'este', 'esta'];
    const basicFrench = ['que', 'avec', 'pour', 'par', 'comme', 'mais', 'très', 'tout', 'cette', 'cette'];
    
    if (language === 'spanish') {
      return basicSpanish.includes(word);
    } else if (language === 'french') {
      return basicFrench.includes(word);
    }
    
    return false;
  }

  /**
   * Update current topic based on message content
   */
  private updateTopicIfNeeded(context: ConversationContext, message: string): void {
    const lowerMessage = message.toLowerCase();
    
    // Simple keyword-based topic detection
    const topics = {
      'food': ['comida', 'restaurante', 'comer', 'food', 'restaurant', 'eat', 'nourriture', 'manger'],
      'travel': ['viaje', 'viajar', 'hotel', 'travel', 'trip', 'voyage', 'voyager'],
      'work': ['trabajo', 'oficina', 'work', 'job', 'travail', 'bureau'],
      'family': ['familia', 'padre', 'madre', 'family', 'father', 'mother', 'famille', 'père', 'mère'],
      'weather': ['tiempo', 'lluvia', 'sol', 'weather', 'rain', 'sun', 'temps', 'pluie', 'soleil']
    };

    for (const [topic, keywords] of Object.entries(topics)) {
      if (keywords.some(keyword => lowerMessage.includes(keyword))) {
        if (context.currentTopic !== topic) {
          logger.debug(`Topic changed from ${context.currentTopic} to ${topic}`);
          context.currentTopic = topic;
        }
        break;
      }
    }
  }

  /**
   * Track pronunciation practice patterns
   */
  private trackPronunciationPractice(context: ConversationContext): void {
    // In production, this would analyze pronunciation issues from audio feedback
    // For now, we'll simulate common issues based on language
    
    if (context.language === 'spanish' && !context.pronunciationIssues.some(issue => issue.word === 'rolled R')) {
      context.pronunciationIssues.push({
        word: 'rolled R',
        issue: 'difficulty with rolled R pronunciation',
        timestamp: new Date()
      });
    } else if (context.language === 'french' && !context.pronunciationIssues.some(issue => issue.word === 'nasal sounds')) {
      context.pronunciationIssues.push({
        word: 'nasal sounds',
        issue: 'difficulty with French nasal sounds',
        timestamp: new Date()
      });
    }
  }

  /**
   * Get learning recommendations based on context
   */
  getLearningRecommendations(context: ConversationContext): string[] {
    const recommendations: string[] = [];

    // Vocabulary recommendations
    if (context.vocabularyIntroduced.length < 5) {
      recommendations.push('Try using more varied vocabulary');
    }

    // Grammar recommendations based on CEFR level
    if (context.cefrLevel === 'A1' && context.messagesExchanged > 10) {
      recommendations.push('Practice forming questions');
    } else if (context.cefrLevel === 'A2' && context.messagesExchanged > 10) {
      recommendations.push('Try using past tense verbs');
    } else if (context.cefrLevel === 'B1' && context.messagesExchanged > 10) {
      recommendations.push('Express your opinions more');
    }

    // Pronunciation recommendations
    if (context.pronunciationIssues.length > 0) {
      recommendations.push(`Focus on: ${context.pronunciationIssues.join(', ')}`);
    }

    return recommendations;
  }

  /**
   * Reset context for new conversation
   */
  resetContext(context: ConversationContext): ConversationContext {
    return {
      ...context,
      messagesExchanged: 0,
      vocabularyIntroduced: [],
      pronunciationIssues: [],
      conversationFlow: 'intro',
      lastInteraction: new Date(),
      currentTopic: 'general'
    };
  }
}
