/**
 * Token Integration for Learning Service
 * 
 * Integrates the YAP token system into the learning service to:
 * - Track daily lesson allowances (5 free lessons per day)
 * - Validate token spending for premium features
 * - Handle lesson completion rewards
 * - Manage quiz attempt costs and staking
 */

import { Request, Response, NextFunction } from 'express';

// Learning Service specific types
interface LearningRequest extends Request {
  user?: {
    id: string;
    tokenData?: UserTokenData;
  };
  learningContext?: {
    lessonId: string;
    difficulty: string;
    isDaily: boolean;
  };
}

interface UserTokenData {
  userId: string;
  tokenBalance: number;
  dailyAllowances: {
    lessons: number;
    aiChatMessages: number;
    speechMinutes: number;
    examAttempts: number;
    lastReset: Date;
  };
  stakingPools: string[];
  totalEarned: number;
  totalSpent: number;
}

// Learning-specific feature IDs
type LearningFeatureId = 
  | 'lesson_completion'
  | 'lesson_retry'
  | 'pronunciation_detailed'
  | 'story_mode_unlock'
  | 'unit_skip'
  | 'exam_attempt';

// Mock services for Learning Service integration  
class LearningAllowanceValidator {
  async validateLessonAccess(userId: string, isDaily: boolean = true): Promise<{
    canAccess: boolean;
    reason: string;
    dailyLessonsRemaining: number;
    requiresTokens: boolean;
    tokenCost: number;
  }> {
    console.log(`[LEARNING-TOKEN] Validating lesson access for ${userId}, daily: ${isDaily}`);
    
    // TODO: Replace with actual shared service integration
    const mockAllowances = {
      dailyLessonsUsed: 2,
      dailyLessonsLimit: 5
    };
    
    const remaining = mockAllowances.dailyLessonsLimit - mockAllowances.dailyLessonsUsed;
    
    if (isDaily && remaining > 0) {
      return {
        canAccess: true,
        reason: 'Daily allowance available',
        dailyLessonsRemaining: remaining,
        requiresTokens: false,
        tokenCost: 0
      };
    }
    
    return {
      canAccess: true, // Assume sufficient tokens for now
      reason: 'Token payment required',
      dailyLessonsRemaining: 0,
      requiresTokens: true,
      tokenCost: 10 // Cost for extra lessons
    };
  }
  
  async validateTokenSpending(userId: string, cost: number, featureId: LearningFeatureId) {
    console.log(`[LEARNING-TOKEN] Validating spending: ${userId}, cost: ${cost}, feature: ${featureId}`);
    return {
      canSpend: true,
      reason: 'Sufficient balance',
      newBalance: 140 // Mock new balance after spending
    };
  }
}

class LearningPricingCalculator {
  calculateLessonCost(isDaily: boolean, difficulty: string, retryCount: number = 0): number {
    if (isDaily && retryCount === 0) {
      return 0; // Daily lessons are free on first attempt
    }
    
    const baseCosts = {
      'beginner': 5,
      'intermediate': 8,
      'advanced': 12
    };
    
    const baseCost = baseCosts[difficulty as keyof typeof baseCosts] || 8;
    return baseCost + (retryCount * 2); // Increase cost for retries
  }
  
  async calculateFeatureCost(featureId: LearningFeatureId, context?: any): Promise<number> {
    const costs: { [K in LearningFeatureId]: number } = {
      'lesson_completion': 0,
      'lesson_retry': 5,
      'pronunciation_detailed': 3,
      'story_mode_unlock': 15,
      'unit_skip': 25,
      'exam_attempt': 10
    };
    return costs[featureId];
  }
}

class LearningRewardCalculator {
  calculateLessonReward(difficulty: string, score: number, isFirstCompletion: boolean): number {
    const baseRewards = {
      'beginner': 5,
      'intermediate': 8,
      'advanced': 12
    };
    
    const baseReward = baseRewards[difficulty as keyof typeof baseRewards] || 8;
    const scoreMultiplier = Math.max(0.5, score / 100); // 50%-100% based on score
    const firstTimeBonus = isFirstCompletion ? 2 : 1;
    
    return Math.floor(baseReward * scoreMultiplier * firstTimeBonus);
  }
  
  calculateStreakBonus(streakDays: number): number {
    if (streakDays < 3) return 0;
    if (streakDays < 7) return 5;
    if (streakDays < 30) return 10;
    return 20; // 30+ day streak
  }
}

class LearningTransactionHistory {
  async recordLessonTransaction(data: {
    userId: string;
    type: 'spend' | 'earn';
    amount: number;
    lessonId?: string;
    featureId: LearningFeatureId;
    metadata?: any;
  }): Promise<void> {
    console.log('[LEARNING-TOKEN] Recording transaction:', data);
    // TODO: Replace with actual shared service integration
  }
}

export class LearningTokenMiddleware {
  private allowanceValidator: LearningAllowanceValidator;
  private pricingCalculator: LearningPricingCalculator;
  private rewardCalculator: LearningRewardCalculator;
  private transactionHistory: LearningTransactionHistory;

  constructor() {
    this.allowanceValidator = new LearningAllowanceValidator();
    this.pricingCalculator = new LearningPricingCalculator();
    this.rewardCalculator = new LearningRewardCalculator();
    this.transactionHistory = new LearningTransactionHistory();
  }

  /**
   * Middleware to validate lesson access and allowances
   */
  validateLessonAccess() {
    return async (req: LearningRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.user?.id) {
          return res.status(401).json({
            error: 'authentication_required',
            message: 'User authentication required for lesson access'
          });
        }

        const userId = req.user.id;
        const isDaily = req.path.includes('/daily') || req.query.type === 'daily';
        
        console.log(`[LEARNING-TOKEN] Validating lesson access for ${userId}, daily: ${isDaily}`);
        
        const validation = await this.allowanceValidator.validateLessonAccess(userId, isDaily);
        
        if (!validation.canAccess) {
          return res.status(402).json({
            error: 'lesson_access_denied',
            message: validation.reason,
            dailyLessonsRemaining: validation.dailyLessonsRemaining,
            requiresTokens: validation.requiresTokens,
            tokenCost: validation.tokenCost
          });
        }

        // Attach validation result to request
        (req as any).lessonValidation = validation;
        
        console.log(`[LEARNING-TOKEN] Lesson access validated for ${userId}`);
        next();
      } catch (error) {
        console.error('[LEARNING-TOKEN] Error validating lesson access:', error);
        res.status(500).json({
          error: 'lesson_validation_failed',
          message: 'Failed to validate lesson access'
        });
      }
    };
  }

  /**
   * Middleware to validate token spending for premium learning features
   */
  validateLearningFeature(featureId: LearningFeatureId) {
    return async (req: LearningRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.user?.id) {
          return res.status(401).json({
            error: 'authentication_required',
            message: 'User authentication required'
          });
        }

        const userId = req.user.id;
        console.log(`[LEARNING-TOKEN] Validating feature: ${featureId} for ${userId}`);
        
        const cost = await this.pricingCalculator.calculateFeatureCost(featureId, req.body);
        
        if (cost > 0) {
          const validation = await this.allowanceValidator.validateTokenSpending(userId, cost, featureId);
          
          if (!validation.canSpend) {
            return res.status(402).json({
              error: 'insufficient_tokens',
              message: validation.reason,
              required: cost,
              featureId
            });
          }
        }

        // Attach spending info to request
        (req as any).featureSpending = {
          featureId,
          cost,
          requiresPayment: cost > 0
        };

        console.log(`[LEARNING-TOKEN] Feature validated: ${featureId}, cost: ${cost}`);
        next();
      } catch (error) {
        console.error('[LEARNING-TOKEN] Error validating learning feature:', error);
        res.status(500).json({
          error: 'feature_validation_failed',
          message: 'Failed to validate learning feature'
        });
      }
    };
  }

  /**
   * Middleware to process lesson completion rewards
   */
  processLessonCompletion() {
    return async (req: LearningRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.user?.id) {
          return next();
        }

        const userId = req.user.id;
        const { score, difficulty, lessonId, isFirstCompletion, streakDays } = req.body;
        
        console.log(`[LEARNING-TOKEN] Processing lesson completion for ${userId}`);
        
        // Calculate rewards
        const lessonReward = this.rewardCalculator.calculateLessonReward(
          difficulty || 'intermediate',
          score || 80,
          isFirstCompletion || false
        );
        
        const streakBonus = this.rewardCalculator.calculateStreakBonus(streakDays || 0);
        const totalReward = lessonReward + streakBonus;
        
        if (totalReward > 0) {
          // Record reward transaction
          await this.transactionHistory.recordLessonTransaction({
            userId,
            type: 'earn',
            amount: totalReward,
            lessonId,
            featureId: 'lesson_completion',
            metadata: {
              score,
              difficulty,
              lessonReward,
              streakBonus,
              isFirstCompletion
            }
          });
        }

        // Attach reward info to response
        (req as any).lessonRewards = {
          lessonReward,
          streakBonus,
          totalReward
        };

        console.log(`[LEARNING-TOKEN] Lesson completion processed: ${totalReward} tokens earned`);
        next();
      } catch (error) {
        console.error('[LEARNING-TOKEN] Error processing lesson completion:', error);
        // Don't fail the request, just log the error
        next();
      }
    };
  }

  /**
   * Middleware to process token spending after successful feature usage
   */
  processLearningSpending() {
    return async (req: LearningRequest, res: Response, next: NextFunction) => {
      try {
        const spending = (req as any).featureSpending;
        const validation = (req as any).lessonValidation;
        
        if (!spending?.requiresPayment && !validation?.requiresTokens) {
          return next();
        }

        const userId = req.user?.id;
        if (!userId) {
          return next();
        }

        console.log(`[LEARNING-TOKEN] Processing learning spending for ${userId}`);
        
        // Record spending transaction
        if (spending?.requiresPayment) {
          await this.transactionHistory.recordLessonTransaction({
            userId,
            type: 'spend',
            amount: spending.cost,
            featureId: spending.featureId,
            metadata: {
              source: 'learning_feature',
              path: req.path
            }
          });
        }
        
        if (validation?.requiresTokens) {
          await this.transactionHistory.recordLessonTransaction({
            userId,
            type: 'spend',
            amount: validation.tokenCost,
            featureId: 'lesson_completion',
            metadata: {
              source: 'extra_lesson',
              dailyAllowanceExhausted: true
            }
          });
        }

        console.log(`[LEARNING-TOKEN] Learning spending processed successfully`);
        next();
      } catch (error) {
        console.error('[LEARNING-TOKEN] Error processing learning spending:', error);
        // Don't fail the request, just log the error
        next();
      }
    };
  }

  /**
   * Get user's learning-specific token status
   */
  async getUserLearningStatus(userId: string): Promise<{
    dailyLessonsRemaining: number;
    totalLessonsCompleted: number;
    tokensEarnedFromLessons: number;
    currentStreak: number;
    availableStoryModes: string[];
  } | null> {
    try {
      console.log(`[LEARNING-TOKEN] Getting learning status for: ${userId}`);
      
      // TODO: Query from database
      return {
        dailyLessonsRemaining: 3,
        totalLessonsCompleted: 47,
        tokensEarnedFromLessons: 380,
        currentStreak: 7,
        availableStoryModes: ['basic_conversation', 'travel_scenarios']
      };
    } catch (error) {
      console.error('[LEARNING-TOKEN] Error getting learning status:', error);
      return null;
    }
  }
}

// Export singleton instance
export const learningTokenMiddleware = new LearningTokenMiddleware();

// Export middleware functions for easy use
export const validateLessonAccess = learningTokenMiddleware.validateLessonAccess.bind(learningTokenMiddleware);
export const validateLearningFeature = learningTokenMiddleware.validateLearningFeature.bind(learningTokenMiddleware);
export const processLessonCompletion = learningTokenMiddleware.processLessonCompletion.bind(learningTokenMiddleware);
export const processLearningSpending = learningTokenMiddleware.processLearningSpending.bind(learningTokenMiddleware);
