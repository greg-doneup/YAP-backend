import { ConversationContext, VocabularyItem } from '../types/chat-session';
import { yapServiceClient } from './yap-service-client';
import { logger } from '../utils/logger';

export interface Lesson {
  id: string;
  title: string;
  description: string;
  cefrLevel: string;
  language: string;
  objectives: string[];
  vocabularyGoals: VocabularyItem[];
  grammarFocus: string[];
  estimatedDuration: number; // minutes
  prerequisites: string[];
  followUpActivities: string[];
}

export interface LessonProgress {
  lessonId: string;
  userId: string;
  startTime: Date;
  completionPercentage: number;
  objectivesMet: string[];
  vocabularyMastered: string[];
  timeSpent: number;
  difficultyRating: number;
  needsReview: string[];
}

export interface ConversationAlignment {
  alignedWithLesson: boolean;
  currentObjective: string;
  vocabularyOpportunities: VocabularyItem[];
  grammarReinforcement: string[];
  suggestedTransitions: string[];
  nextMilestone: string;
}

/**
 * Lesson Integration Service
 * Aligns chat conversations with structured learning objectives
 */
export class LessonIntegrationService {
  private readonly lessonObjectivePatterns = {
    vocabulary: /introduce|learn|practice.*words?|vocabulary/i,
    grammar: /grammar|structure|conjugat|tense/i,
    conversation: /speak|talk|discuss|conversation/i,
    pronunciation: /pronounc|accent|sound/i,
    comprehension: /understand|listen|comprehension/i
  };

  /**
   * Get current lesson context for user
   */
  async getCurrentLessonContext(userId: string, language: string): Promise<Lesson | null> {
    try {
      // This would call the learning service to get current lesson
      const response = await yapServiceClient.getLearnerCurrentLesson(userId, language);
      
      if (response) {
        logger.info('Retrieved current lesson context', {
          userId,
          lessonId: response.id,
          title: response.title
        });
        return response;
      }

      // Mock lesson for development
      const mockLesson: Lesson = {
        id: 'spanish-b1-daily-routine',
        title: 'Daily Routines and Time Expressions',
        description: 'Practice describing daily activities and time-related vocabulary',
        cefrLevel: 'B1',
        language: language,
        objectives: [
          'Use reflexive verbs for daily activities',
          'Express time and frequency',
          'Describe personal routines',
          'Ask about others\' schedules'
        ],
        vocabularyGoals: [
          {
            word: 'levantarse',
            meaning: 'to get up',
            example: 'Me levanto a las siete',
            difficulty: 'intermediate',
            category: 'reflexive verbs'
          },
          {
            word: 'desayunar',
            meaning: 'to have breakfast',
            example: 'Desayuno cereales y café',
            difficulty: 'basic',
            category: 'meals'
          }
        ],
        grammarFocus: ['reflexive verbs', 'time expressions', 'present tense'],
        estimatedDuration: 45,
        prerequisites: ['basic present tense', 'common verbs'],
        followUpActivities: ['weekend routine dialogue', 'time scheduling practice']
      };

      return mockLesson;
    } catch (error) {
      logger.error('Failed to get current lesson context', { error, userId });
      return null;
    }
  }

  /**
   * Analyze how conversation aligns with lesson objectives
   */
  async analyzeConversationAlignment(
    conversation: any[],
    lesson: Lesson | null,
    context: ConversationContext
  ): Promise<ConversationAlignment> {
    try {
      if (!lesson) {
        return {
          alignedWithLesson: false,
          currentObjective: 'General conversation practice',
          vocabularyOpportunities: [],
          grammarReinforcement: [],
          suggestedTransitions: ['Start a structured lesson to improve learning efficiency'],
          nextMilestone: 'Begin structured learning path'
        };
      }

      logger.info('Analyzing conversation alignment with lesson', {
        lessonId: lesson.id,
        messagesCount: conversation.length
      });

      // Analyze which objectives are being addressed
      const addressedObjectives = this.identifyAddressedObjectives(conversation, lesson.objectives);
      
      // Find vocabulary opportunities
      const vocabularyOpportunities = this.findVocabularyOpportunities(
        conversation,
        lesson.vocabularyGoals,
        context.vocabularyIntroduced
      );

      // Identify grammar reinforcement opportunities
      const grammarReinforcement = this.identifyGrammarOpportunities(
        conversation,
        lesson.grammarFocus
      );

      // Generate transition suggestions
      const suggestedTransitions = this.generateTransitionSuggestions(
        lesson,
        addressedObjectives,
        vocabularyOpportunities
      );

      // Determine next milestone
      const nextMilestone = this.determineNextMilestone(lesson, addressedObjectives);

      const alignment: ConversationAlignment = {
        alignedWithLesson: addressedObjectives.length > 0,
        currentObjective: addressedObjectives[0] || lesson.objectives[0] || 'General conversation practice',
        vocabularyOpportunities,
        grammarReinforcement,
        suggestedTransitions,
        nextMilestone
      };

      logger.info('Conversation alignment analyzed', {
        aligned: alignment.alignedWithLesson,
        objectivesAddressed: addressedObjectives.length,
        vocabOpportunities: vocabularyOpportunities.length
      });

      return alignment;
    } catch (error) {
      logger.error('Failed to analyze conversation alignment', { error });
      throw error;
    }
  }

  /**
   * Generate lesson-aware conversation prompts
   */
  async generateLessonAwarePrompts(
    lesson: Lesson | null,
    alignment: ConversationAlignment,
    userMessage: string,
    context: ConversationContext
  ): Promise<{
    systemPrompt: string;
    vocabularyHints: VocabularyItem[];
    grammarFocus: string[];
    objectiveTracking: string;
  }> {
    try {
      if (!lesson) {
        return {
          systemPrompt: 'Continue the natural conversation while introducing appropriate vocabulary.',
          vocabularyHints: [],
          grammarFocus: [],
          objectiveTracking: 'Free conversation mode'
        };
      }

      // Build lesson-aware system prompt
      let systemPrompt = `You are helping the user practice: "${lesson.title}". `;
      
      if (alignment.currentObjective) {
        systemPrompt += `Current focus: ${alignment.currentObjective}. `;
      }

      if (alignment.vocabularyOpportunities.length > 0) {
        const vocabWords = alignment.vocabularyOpportunities.map(v => v.word).join(', ');
        systemPrompt += `Try to naturally incorporate these vocabulary words: ${vocabWords}. `;
      }

      if (alignment.grammarReinforcement.length > 0) {
        systemPrompt += `Emphasize these grammar points: ${alignment.grammarReinforcement.join(', ')}. `;
      }

      systemPrompt += `Maintain natural conversation flow while guiding toward lesson objectives.`;

      // Select vocabulary hints based on context
      const vocabularyHints = this.selectContextualVocabulary(
        alignment.vocabularyOpportunities,
        userMessage,
        3 // Max hints
      );

      // Determine objective tracking
      const objectiveTracking = alignment.currentObjective || 'General conversation practice';

      const result = {
        systemPrompt,
        vocabularyHints,
        grammarFocus: alignment.grammarReinforcement,
        objectiveTracking
      };

      logger.info('Generated lesson-aware prompts', {
        lessonId: lesson.id,
        vocabHints: vocabularyHints.length,
        grammarPoints: alignment.grammarReinforcement.length
      });

      return result;
    } catch (error) {
      logger.error('Failed to generate lesson-aware prompts', { error });
      throw error;
    }
  }

  /**
   * Update lesson progress based on conversation
   */
  async updateLessonProgress(
    userId: string,
    lesson: Lesson,
    conversation: any[],
    vocabularyUsed: VocabularyItem[],
    timeSpent: number
  ): Promise<void> {
    try {
      // Calculate completion percentage
      const completionPercentage = this.calculateLessonCompletion(
        lesson,
        conversation,
        vocabularyUsed
      );

      // Identify mastered vocabulary
      const vocabularyMastered = vocabularyUsed.map(v => v.word);

      // Determine what needs review
      const needsReview = this.identifyReviewAreas(lesson, conversation, vocabularyUsed);

      const progress: LessonProgress = {
        lessonId: lesson.id,
        userId,
        startTime: new Date(),
        completionPercentage,
        objectivesMet: this.identifyAddressedObjectives(conversation, lesson.objectives),
        vocabularyMastered,
        timeSpent,
        difficultyRating: this.assessLessonDifficulty(conversation),
        needsReview
      };

      // Update progress via learning service
      await this.updateLearningServiceProgress(progress);

      logger.info('Lesson progress updated', {
        userId,
        lessonId: lesson.id,
        completion: completionPercentage,
        vocabularyMastered: vocabularyMastered.length
      });
    } catch (error) {
      logger.error('Failed to update lesson progress', { error });
    }
  }

  // Private helper methods
  private identifyAddressedObjectives(conversation: any[], objectives: string[]): string[] {
    return objectives.filter(objective => {
      const pattern = this.createObjectivePattern(objective);
      return conversation.some(msg => pattern.test(msg.content || ''));
    });
  }

  private findVocabularyOpportunities(
    conversation: any[],
    lessonVocab: VocabularyItem[],
    introducedVocab: VocabularyItem[]
  ): VocabularyItem[] {
    const introducedWords = new Set(introducedVocab.map(v => v.word.toLowerCase()));
    
    return lessonVocab.filter(vocab => 
      !introducedWords.has(vocab.word.toLowerCase())
    ).slice(0, 5); // Limit to 5 opportunities
  }

  private identifyGrammarOpportunities(conversation: any[], grammarFocus: string[]): string[] {
    // Analyze conversation for grammar usage and identify reinforcement opportunities
    return grammarFocus.filter(point => {
      // Simple pattern matching - in production, this would use NLP
      return conversation.some(msg => 
        this.lessonObjectivePatterns.grammar.test(msg.content || '')
      );
    });
  }

  private generateTransitionSuggestions(
    lesson: Lesson,
    addressedObjectives: string[],
    vocabularyOpportunities: VocabularyItem[]
  ): string[] {
    const suggestions: string[] = [];

    if (addressedObjectives.length === 0) {
      suggestions.push(`Let's start working on: ${lesson.objectives[0]}`);
    }

    if (vocabularyOpportunities.length > 0 && vocabularyOpportunities[0]) {
      suggestions.push(`Perfect opportunity to practice: ${vocabularyOpportunities[0].word}`);
    }

    return suggestions;
  }

  private determineNextMilestone(lesson: Lesson, addressedObjectives: string[]): string {
    const remaining = lesson.objectives.filter(obj => !addressedObjectives.includes(obj));
    return remaining[0] || 'Complete current lesson and move to follow-up activities';
  }

  private selectContextualVocabulary(
    opportunities: VocabularyItem[],
    userMessage: string,
    maxHints: number
  ): VocabularyItem[] {
    // Select vocabulary that's contextually relevant to user's message
    return opportunities.slice(0, maxHints);
  }

  private calculateLessonCompletion(
    lesson: Lesson,
    conversation: any[],
    vocabularyUsed: VocabularyItem[]
  ): number {
    const objectiveWeight = 0.6;
    const vocabularyWeight = 0.4;

    const objectivesCompleted = this.identifyAddressedObjectives(conversation, lesson.objectives);
    const objectiveProgress = (objectivesCompleted.length / lesson.objectives.length) * objectiveWeight;

    const vocabularyProgress = (vocabularyUsed.length / lesson.vocabularyGoals.length) * vocabularyWeight;

    return Math.min((objectiveProgress + vocabularyProgress) * 100, 100);
  }

  private identifyReviewAreas(
    lesson: Lesson,
    conversation: any[],
    vocabularyUsed: VocabularyItem[]
  ): string[] {
    const reviewAreas: string[] = [];

    // Check for unused vocabulary
    const unusedVocab = lesson.vocabularyGoals.filter(
      goal => !vocabularyUsed.some(used => used.word === goal.word)
    );

    if (unusedVocab.length > 0) {
      reviewAreas.push(`Vocabulary: ${unusedVocab.map(v => v.word).join(', ')}`);
    }

    return reviewAreas;
  }

  private assessLessonDifficulty(conversation: any[]): number {
    // Assess how difficult the lesson was for the user based on conversation patterns
    return Math.random() * 5 + 5; // Mock: 5-10 scale
  }

  private createObjectivePattern(objective: string): RegExp {
    // Create regex pattern to match objective content in conversation
    const keywords = objective.toLowerCase().split(' ').filter(word => word.length > 3);
    return new RegExp(keywords.join('|'), 'i');
  }

  private async updateLearningServiceProgress(progress: LessonProgress): Promise<void> {
    try {
      // Transform LessonProgress to the expected format
      const updateData = {
        userId: progress.userId,
        lessonId: progress.lessonId,
        chatInteraction: true,
        vocabularyPracticed: progress.vocabularyMastered,
        grammarPracticed: [], // Extract from context if needed
        objectivesProgress: progress.objectivesMet.reduce((acc, obj) => {
          acc[obj] = 1; // Mark as completed
          return acc;
        }, {} as Record<string, number>),
        completionPercentage: progress.completionPercentage
      };

      await yapServiceClient.updateLessonProgress(updateData);
    } catch (error) {
      logger.warn('Failed to update learning service progress', { error });
    }
  }
}

export const lessonIntegrationService = new LessonIntegrationService();
