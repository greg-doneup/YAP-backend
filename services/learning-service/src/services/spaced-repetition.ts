import { MongoClient, Db, Collection } from 'mongodb';
import { A2SpacedRepetitionItem, A2_SPACED_REPETITION_VOCABULARY } from '../models/a2-lesson-data';

/**
 * Spaced Repetition Schedule Interface
 * Tracks when vocabulary/grammar should be reviewed
 */
export interface SpacedRepetitionSchedule {
  _id?: string;
  userId: string;
  itemId: string; // word or grammar concept ID
  itemType: 'vocabulary' | 'grammar';
  language: string;
  
  // Learning progress
  firstLearned: Date;
  lastReviewed: Date;
  nextReviewDate: Date;
  
  // Algorithm parameters (SM-2 based)
  repetitionInterval: number; // days
  easeFactor: number; // 1.3 to 2.5
  consecutiveCorrect: number;
  totalReviews: number;
  
  // Performance history
  reviewHistory: Array<{
    date: Date;
    performanceScore: number; // 0-5 scale
    responseTime: number; // milliseconds
    contextUsed: string; // lesson or practice context
  }>;
  
  // Current status
  status: 'learning' | 'review' | 'mastered' | 'difficult';
  masteryLevel: number; // 0-1, 0.8+ = mastered
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Daily Review Queue Interface
 * Items scheduled for review today
 */
export interface DailyReviewQueue {
  _id?: string;
  userId: string;
  date: Date;
  language: string;
  
  // Review items
  vocabularyItems: string[]; // item IDs
  grammarItems: string[];
  
  // Queue statistics
  totalItems: number;
  completedItems: number;
  averagePerformance: number;
  
  // Timing
  estimatedTime: number; // minutes
  actualTime: number; // minutes
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Spaced Repetition Engine
 * Implements SM-2 algorithm for optimal review scheduling
 */
export class SpacedRepetitionEngine {
  private db: Db;
  private scheduleCollection: Collection<SpacedRepetitionSchedule>;
  private queueCollection: Collection<DailyReviewQueue>;

  constructor(db: Db) {
    this.db = db;
    this.scheduleCollection = db.collection<SpacedRepetitionSchedule>('spaced_repetition_schedule');
    this.queueCollection = db.collection<DailyReviewQueue>('daily_review_queue');
  }

  /**
   * Initialize spaced repetition system
   */
  async initializeSystem(): Promise<void> {
    // Create indexes for optimal performance
    await this.scheduleCollection.createIndex({ userId: 1, itemId: 1 }, { unique: true });
    await this.scheduleCollection.createIndex({ userId: 1, nextReviewDate: 1 });
    await this.scheduleCollection.createIndex({ userId: 1, status: 1 });
    
    await this.queueCollection.createIndex({ userId: 1, date: 1 }, { unique: true });
    await this.queueCollection.createIndex({ userId: 1, language: 1 });
    
    console.log('✅ Spaced repetition system initialized');
  }

  /**
   * Add new vocabulary item to spaced repetition schedule
   */
  async addVocabularyItem(
    userId: string, 
    word: string, 
    lessonNumber: number, 
    language: string = 'spanish'
  ): Promise<void> {
    const vocabularyItem = A2_SPACED_REPETITION_VOCABULARY.find(item => item.word === word);
    if (!vocabularyItem) {
      console.warn(`Vocabulary item not found: ${word}`);
      return;
    }

    const schedule: SpacedRepetitionSchedule = {
      userId,
      itemId: word,
      itemType: 'vocabulary',
      language,
      firstLearned: new Date(),
      lastReviewed: new Date(),
      nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day later
      repetitionInterval: 1,
      easeFactor: 2.5, // Starting ease factor
      consecutiveCorrect: 0,
      totalReviews: 0,
      reviewHistory: [],
      status: 'learning',
      masteryLevel: 0.0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.scheduleCollection.replaceOne(
      { userId, itemId: word },
      schedule,
      { upsert: true }
    );
  }

  /**
   * Calculate next review date using SM-2 algorithm
   */
  private calculateNextReview(
    currentSchedule: SpacedRepetitionSchedule,
    performanceScore: number
  ): { nextReviewDate: Date; newInterval: number; newEaseFactor: number } {
    let { easeFactor, repetitionInterval } = currentSchedule;
    
    // Update ease factor based on performance (SM-2 algorithm)
    easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - performanceScore) * (0.08 + (5 - performanceScore) * 0.02)));
    
    // Calculate next interval
    if (performanceScore >= 3) {
      // Correct response
      if (currentSchedule.consecutiveCorrect === 0) {
        repetitionInterval = 1;
      } else if (currentSchedule.consecutiveCorrect === 1) {
        repetitionInterval = 6;
      } else {
        repetitionInterval = Math.round(repetitionInterval * easeFactor);
      }
    } else {
      // Incorrect response - reset to beginning
      repetitionInterval = 1;
    }
    
    // Calculate next review date
    const nextReviewDate = new Date(Date.now() + repetitionInterval * 24 * 60 * 60 * 1000);
    
    return {
      nextReviewDate,
      newInterval: repetitionInterval,
      newEaseFactor: easeFactor
    };
  }

  /**
   * Update schedule after review
   */
  async updateScheduleAfterReview(
    userId: string,
    itemId: string,
    performanceScore: number,
    responseTime: number,
    contextUsed: string
  ): Promise<void> {
    const schedule = await this.scheduleCollection.findOne({ userId, itemId });
    if (!schedule) {
      console.warn(`Schedule not found for user ${userId}, item ${itemId}`);
      return;
    }

    const { nextReviewDate, newInterval, newEaseFactor } = this.calculateNextReview(
      schedule,
      performanceScore
    );

    // Update performance tracking
    const isCorrect = performanceScore >= 3;
    const newConsecutiveCorrect = isCorrect ? schedule.consecutiveCorrect + 1 : 0;
    
    // Calculate mastery level (based on consecutive correct answers and ease factor)
    const masteryLevel = Math.min(
      1.0,
      (newConsecutiveCorrect * 0.2) + (newEaseFactor - 1.3) / 1.2 * 0.3
    );

    // Determine status
    let status: SpacedRepetitionSchedule['status'] = 'learning';
    if (masteryLevel >= 0.8) {
      status = 'mastered';
    } else if (performanceScore < 2 && schedule.totalReviews > 3) {
      status = 'difficult';
    } else if (schedule.totalReviews > 0) {
      status = 'review';
    }

    // Update schedule
    await this.scheduleCollection.updateOne(
      { userId, itemId },
      {
        $set: {
          lastReviewed: new Date(),
          nextReviewDate,
          repetitionInterval: newInterval,
          easeFactor: newEaseFactor,
          consecutiveCorrect: newConsecutiveCorrect,
          masteryLevel,
          status,
          updatedAt: new Date()
        },
        $inc: { totalReviews: 1 },
        $push: {
          reviewHistory: {
            date: new Date(),
            performanceScore,
            responseTime,
            contextUsed
          }
        }
      }
    );
  }

  /**
   * Get items due for review today
   */
  async getDailyReviewItems(
    userId: string,
    maxItems: number = 20,
    language: string = 'spanish'
  ): Promise<SpacedRepetitionSchedule[]> {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    
    return await this.scheduleCollection
      .find({
        userId,
        language,
        nextReviewDate: { $lte: today },
        status: { $in: ['learning', 'review', 'difficult'] }
      })
      .sort({ nextReviewDate: 1, status: 1 }) // Overdue first, then by status
      .limit(maxItems)
      .toArray();
  }

  /**
   * Generate daily review queue
   */
  async generateDailyReviewQueue(
    userId: string,
    language: string = 'spanish'
  ): Promise<DailyReviewQueue> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check if queue already exists for today
    const existingQueue = await this.queueCollection.findOne({
      userId,
      date: today,
      language
    });
    
    if (existingQueue) {
      return existingQueue;
    }

    // Get review items
    const reviewItems = await this.getDailyReviewItems(userId, 30, language);
    
    // Separate vocabulary and grammar items
    const vocabularyItems = reviewItems.filter(item => item.itemType === 'vocabulary').map(item => item.itemId);
    const grammarItems = reviewItems.filter(item => item.itemType === 'grammar').map(item => item.itemId);
    
    // Estimate time (30 seconds per vocabulary item, 60 seconds per grammar item)
    const estimatedTime = Math.round(
      (vocabularyItems.length * 0.5) + (grammarItems.length * 1.0)
    );
    
    // Create queue
    const queue: DailyReviewQueue = {
      userId,
      date: today,
      language,
      vocabularyItems,
      grammarItems,
      totalItems: vocabularyItems.length + grammarItems.length,
      completedItems: 0,
      averagePerformance: 0,
      estimatedTime,
      actualTime: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await this.queueCollection.insertOne(queue);
    return queue;
  }

  /**
   * Get user's spaced repetition statistics
   */
  async getUserStatistics(
    userId: string,
    language: string = 'spanish'
  ): Promise<{
    totalItems: number;
    masteredItems: number;
    difficultItems: number;
    reviewsDueToday: number;
    averagePerformance: number;
    streakDays: number;
  }> {
    const [totalItems, masteredItems, difficultItems, reviewsDueToday] = await Promise.all([
      this.scheduleCollection.countDocuments({ userId, language }),
      this.scheduleCollection.countDocuments({ userId, language, status: 'mastered' }),
      this.scheduleCollection.countDocuments({ userId, language, status: 'difficult' }),
      this.scheduleCollection.countDocuments({
        userId,
        language,
        nextReviewDate: { $lte: new Date() },
        status: { $in: ['learning', 'review', 'difficult'] }
      })
    ]);

    // Calculate average performance from recent reviews
    const recentReviews = await this.scheduleCollection
      .find({ userId, language, 'reviewHistory.0': { $exists: true } })
      .project({ reviewHistory: { $slice: -10 } })
      .toArray();
    
    const allRecentScores = recentReviews.flatMap(schedule => 
      schedule.reviewHistory.map((review: any) => review.performanceScore)
    );
    
    const averagePerformance = allRecentScores.length > 0 
      ? allRecentScores.reduce((sum, score) => sum + score, 0) / allRecentScores.length
      : 0;

    // Calculate streak days (simplified - days with completed reviews)
    const streakDays = 0; // Would need more complex calculation

    return {
      totalItems,
      masteredItems,
      difficultItems,
      reviewsDueToday,
      averagePerformance,
      streakDays
    };
  }

  /**
   * Reset difficult items for re-learning
   */
  async resetDifficultItems(userId: string, language: string = 'spanish'): Promise<number> {
    const result = await this.scheduleCollection.updateMany(
      { userId, language, status: 'difficult' },
      {
        $set: {
          status: 'learning',
          repetitionInterval: 1,
          consecutiveCorrect: 0,
          masteryLevel: 0,
          nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          updatedAt: new Date()
        }
      }
    );
    
    return result.modifiedCount;
  }
}

// Export singleton instance
let spacedRepetitionEngine: SpacedRepetitionEngine | null = null;

export function initializeSpacedRepetitionEngine(db: Db): SpacedRepetitionEngine {
  if (!spacedRepetitionEngine) {
    spacedRepetitionEngine = new SpacedRepetitionEngine(db);
  }
  return spacedRepetitionEngine;
}

export function getSpacedRepetitionEngine(): SpacedRepetitionEngine {
  if (!spacedRepetitionEngine) {
    throw new Error('Spaced Repetition Engine not initialized. Call initializeSpacedRepetitionEngine first.');
  }
  return spacedRepetitionEngine;
}
