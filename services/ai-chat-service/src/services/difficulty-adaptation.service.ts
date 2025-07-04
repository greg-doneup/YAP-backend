import { ConversationContext, VocabularyItem } from '../types/chat-session';
import { yapServiceClient } from './yap-service-client';
import { logger } from '../utils/logger';

export interface DifficultyMetrics {
  comprehensionScore: number;     // 0-100
  responseComplexity: number;     // 1-10
  vocabularyRetention: number;    // 0-100
  pronunciationAccuracy: number;  // 0-100
  conversationFlow: number;       // 1-10
  errorRate: number;             // 0-1
}

export interface AdaptationDecision {
  action: 'increase' | 'decrease' | 'maintain' | 'review';
  targetDifficulty: number;
  reasoning: string;
  suggestedActivities: string[];
  vocabularyFocus: string[];
  grammarPoints: string[];
}

export interface LessonIntegration {
  currentLesson?: {
    id: string;
    title: string;
    objectives: string[];
    vocabularyGoals: VocabularyItem[];
    grammarFocus: string[];
  };
  recommendedNext?: {
    lessons: string[];
    practiceAreas: string[];
  };
  progressAlignment: {
    onTrack: boolean;
    adjustmentNeeded: string[];
  };
}

/**
 * Intelligent Difficulty Adaptation Service
 * Dynamically adjusts conversation difficulty based on user performance
 */
export class DifficultyAdaptationService {
  private readonly adaptationThresholds = {
    comprehension: { increase: 85, decrease: 60 },
    pronunciation: { increase: 80, decrease: 55 },
    vocabulary: { increase: 90, decrease: 70 },
    flow: { increase: 8, decrease: 5 }
  };

  /**
   * Analyze user performance and recommend difficulty adjustments
   */
  async analyzeDifficultyMetrics(
    context: ConversationContext,
    recentMessages: any[],
    pronunciationHistory: any[]
  ): Promise<DifficultyMetrics> {
    try {
      logger.info('Analyzing difficulty metrics', {
        userId: context.userId,
        messagesAnalyzed: recentMessages.length,
        currentDifficulty: context.difficulty
      });

      // Analyze comprehension based on response relevance
      const comprehensionScore = this.analyzeComprehension(recentMessages);

      // Analyze response complexity
      const responseComplexity = this.analyzeResponseComplexity(recentMessages);

      // Check vocabulary retention
      const vocabularyRetention = this.analyzeVocabularyRetention(
        context.vocabularyIntroduced,
        recentMessages
      );

      // Calculate pronunciation accuracy from recent assessments
      const pronunciationAccuracy = this.calculatePronunciationAccuracy(pronunciationHistory);

      // Evaluate conversation flow quality
      const conversationFlow = this.evaluateConversationFlow(recentMessages);

      // Calculate error rate
      const errorRate = this.calculateErrorRate(recentMessages);

      const metrics: DifficultyMetrics = {
        comprehensionScore,
        responseComplexity,
        vocabularyRetention,
        pronunciationAccuracy,
        conversationFlow,
        errorRate
      };

      logger.info('Difficulty metrics calculated', metrics);
      return metrics;
    } catch (error) {
      logger.error('Failed to analyze difficulty metrics', { error });
      throw error;
    }
  }

  /**
   * Make adaptation decision based on performance metrics
   */
  async makeAdaptationDecision(
    metrics: DifficultyMetrics,
    currentContext: ConversationContext
  ): Promise<AdaptationDecision> {
    try {
      const thresholds = this.adaptationThresholds;
      let action: 'increase' | 'decrease' | 'maintain' | 'review' = 'maintain';
      let reasoning = '';
      const suggestedActivities: string[] = [];
      const vocabularyFocus: string[] = [];
      const grammarPoints: string[] = [];

      // Decision logic based on multiple metrics
      const shouldIncrease = 
        metrics.comprehensionScore >= thresholds.comprehension.increase &&
        metrics.pronunciationAccuracy >= thresholds.pronunciation.increase &&
        metrics.vocabularyRetention >= thresholds.vocabulary.increase &&
        metrics.conversationFlow >= thresholds.flow.increase &&
        metrics.errorRate < 0.1;

      const shouldDecrease = 
        metrics.comprehensionScore <= thresholds.comprehension.decrease ||
        metrics.pronunciationAccuracy <= thresholds.pronunciation.decrease ||
        metrics.errorRate > 0.3;

      const needsReview = 
        metrics.vocabularyRetention <= thresholds.vocabulary.decrease ||
        metrics.conversationFlow <= thresholds.flow.decrease;

      if (shouldIncrease && currentContext.difficulty < 10) {
        action = 'increase';
        reasoning = 'Excellent performance across all metrics, ready for increased challenge';
        suggestedActivities.push('complex scenarios', 'abstract topics', 'debate exercises');
      } else if (shouldDecrease) {
        action = 'decrease';
        reasoning = 'Performance indicators suggest need for simpler content';
        suggestedActivities.push('basic vocabulary review', 'simple sentence structures');
      } else if (needsReview) {
        action = 'review';
        reasoning = 'Vocabulary retention or conversation flow needs reinforcement';
        suggestedActivities.push('vocabulary games', 'guided practice');
      }

      // Determine vocabulary focus areas
      if (metrics.vocabularyRetention < 80) {
        vocabularyFocus.push('recently introduced words', 'high-frequency terms');
      }

      // Identify grammar points to emphasize
      if (metrics.errorRate > 0.2) {
        grammarPoints.push('sentence structure', 'verb conjugation');
      }

      const targetDifficulty = this.calculateTargetDifficulty(
        currentContext.difficulty,
        action,
        metrics
      );

      const decision: AdaptationDecision = {
        action,
        targetDifficulty,
        reasoning,
        suggestedActivities,
        vocabularyFocus,
        grammarPoints
      };

      logger.info('Adaptation decision made', decision);
      return decision;
    } catch (error) {
      logger.error('Failed to make adaptation decision', { error });
      throw error;
    }
  }

  /**
   * Apply difficulty adaptation to conversation context
   */
  async applyAdaptation(
    context: ConversationContext,
    decision: AdaptationDecision
  ): Promise<ConversationContext> {
    const updatedContext = { ...context };
    
    // Update difficulty level
    updatedContext.difficulty = decision.targetDifficulty;
    
    // Add learning goals based on adaptation
    updatedContext.learningGoals = [
      ...updatedContext.learningGoals,
      ...decision.suggestedActivities
    ];

    // Log adaptation for analytics
    try {
      await yapServiceClient.logChatInteraction(
        context.userId,
        context.sessionId,
        {
          userMessage: 'DIFFICULTY_ADAPTATION',
          aiResponse: `Difficulty adjusted: ${decision.action} to level ${decision.targetDifficulty}`,
          responseTime: 0,
          cefrLevel: context.cefrLevel,
          language: context.language,
          // Add custom metadata for adaptation tracking
          adaptationData: {
            previousDifficulty: context.difficulty,
            newDifficulty: decision.targetDifficulty,
            reasoning: decision.reasoning,
            action: decision.action
          }
        } as any
      );
    } catch (error) {
      logger.warn('Failed to log adaptation decision', { error });
    }

    logger.info('Difficulty adaptation applied', {
      userId: context.userId,
      previousDifficulty: context.difficulty,
      newDifficulty: decision.targetDifficulty,
      action: decision.action
    });

    return updatedContext;
  }

  // Private analysis methods
  private analyzeComprehension(messages: any[]): number {
    // Analyze response relevance, timing, and accuracy
    // This would use NLP to assess how well responses match questions
    return Math.random() * 40 + 60; // Mock: 60-100
  }

  private analyzeResponseComplexity(messages: any[]): number {
    // Analyze sentence length, vocabulary sophistication, grammar complexity
    if (messages.length === 0) return 5;
    
    const avgLength = messages.reduce((sum, msg) => 
      sum + (msg.content?.length || 0), 0) / messages.length;
    
    return Math.min(Math.max(Math.floor(avgLength / 20), 1), 10);
  }

  private analyzeVocabularyRetention(introduced: VocabularyItem[], messages: any[]): number {
    // Check if recently introduced vocabulary is being used correctly
    if (introduced.length === 0) return 100;
    
    const recentVocab = introduced.slice(-10); // Last 10 words
    const usedCorrectly = recentVocab.filter(vocab => 
      messages.some(msg => msg.content?.toLowerCase().includes(vocab.word.toLowerCase()))
    );
    
    return (usedCorrectly.length / recentVocab.length) * 100;
  }

  private calculatePronunciationAccuracy(history: any[]): number {
    if (history.length === 0) return 75; // Default
    
    const recentScores = history.slice(-5).map(h => h.overallScore || 75);
    return recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;
  }

  private evaluateConversationFlow(messages: any[]): number {
    // Assess naturalness, turn-taking, topic coherence
    // This would analyze conversation patterns and coherence
    return Math.random() * 3 + 7; // Mock: 7-10
  }

  private calculateErrorRate(messages: any[]): number {
    // Calculate grammatical and semantic errors
    // This would use language processing to detect errors
    return Math.random() * 0.3; // Mock: 0-30% error rate
  }

  private calculateTargetDifficulty(
    current: number,
    action: string,
    metrics: DifficultyMetrics
  ): number {
    switch (action) {
      case 'increase':
        return Math.min(current + 1, 10);
      case 'decrease':
        return Math.max(current - 1, 1);
      case 'review':
        return Math.max(current - 0.5, 1);
      default:
        return current;
    }
  }
}

export const difficultyAdaptationService = new DifficultyAdaptationService();
