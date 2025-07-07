/**
 * Enhanced Learning Progression Middleware
 * 
 * Integrates progression validation, prerequisite checking, and token-based
 * skip-ahead functionality into all learning service endpoints.
 */

import { Request, Response, NextFunction } from 'express';
import { progressionValidator, ProgressionValidationResult } from '../services/progression-validator';
import { getUserProgress } from '../clients/db';

interface ProgressionRequest extends Request {
  user?: {
    id: string;
    tokenBalance?: number;
  };
  progressionValidation?: ProgressionValidationResult;
}

export class LearningProgressionMiddleware {

  /**
   * Validate lesson access with full progression checking
   */
  validateLessonAccess() {
    return async (req: ProgressionRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.user?.id) {
          return res.status(401).json({
            error: 'authentication_required',
            message: 'User authentication required for lesson access'
          });
        }

        const userId = req.user.id;
        const lessonId = req.params.lessonId;

        if (!lessonId) {
          return res.status(400).json({
            error: 'lesson_id_required',
            message: 'Lesson ID is required'
          });
        }

        console.log(`[PROGRESSION-MW] Validating lesson access: ${userId} -> ${lessonId}`);

        // Get user progress
        const userProgress = await getUserProgress(userId);
        if (!userProgress) {
          return res.status(404).json({
            error: 'user_progress_not_found',
            message: 'User progress not found'
          });
        }

        // Validate lesson access
        const validation = await progressionValidator.validateLessonAccess(
          userId,
          lessonId,
          userProgress
        );

        if (!validation.canAccess) {
          return res.status(403).json({
            error: 'lesson_access_denied',
            message: validation.reason,
            requiresTokens: validation.requiresTokens,
            tokenCost: validation.tokenCost,
            skipAheadAvailable: validation.skipAheadAvailable,
            missingPrerequisites: validation.missingPrerequisites
          });
        }

        // Attach validation result to request for use in route handlers
        req.progressionValidation = validation;
        
        console.log(`[PROGRESSION-MW] Lesson access granted: ${userId} -> ${lessonId}`);
        next();

      } catch (error) {
        console.error('[PROGRESSION-MW] Error validating lesson access:', error);
        res.status(500).json({
          error: 'progression_validation_failed',
          message: 'Failed to validate lesson access'
        });
      }
    };
  }

  /**
   * Validate level access for level-based endpoints
   */
  validateLevelAccess() {
    return async (req: ProgressionRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.user?.id) {
          return res.status(401).json({
            error: 'authentication_required',
            message: 'User authentication required for level access'
          });
        }

        const userId = req.user.id;
        const targetLevel = req.params.level || req.query.level as string;

        if (!targetLevel) {
          return res.status(400).json({
            error: 'level_required',
            message: 'CEFR level is required'
          });
        }

        console.log(`[PROGRESSION-MW] Validating level access: ${userId} -> ${targetLevel}`);

        // Get user progress and token balance
        const userProgress = await getUserProgress(userId);
        if (!userProgress) {
          return res.status(404).json({
            error: 'user_progress_not_found',
            message: 'User progress not found'
          });
        }

        const userTokenBalance = req.user.tokenBalance || 0;

        // Validate level access
        const validation = await progressionValidator.validateLevelAccess(
          userId,
          targetLevel,
          userProgress,
          userTokenBalance
        );

        if (!validation.canAccess) {
          return res.status(403).json({
            error: 'level_access_denied',
            message: validation.reason,
            requiresTokens: validation.requiresTokens,
            tokenCost: validation.tokenCost,
            skipAheadAvailable: validation.skipAheadAvailable,
            missingPrerequisites: validation.missingPrerequisites
          });
        }

        // Attach validation result to request
        req.progressionValidation = validation;
        
        console.log(`[PROGRESSION-MW] Level access granted: ${userId} -> ${targetLevel}`);
        next();

      } catch (error) {
        console.error('[PROGRESSION-MW] Error validating level access:', error);
        res.status(500).json({
          error: 'level_validation_failed',
          message: 'Failed to validate level access'
        });
      }
    };
  }

  /**
   * Handle skip-ahead token spending
   */
  processSkipAhead() {
    return async (req: ProgressionRequest, res: Response, next: NextFunction) => {
      try {
        const skipAhead = req.query.skipAhead === 'true' || req.body.skipAhead === true;
        
        if (!skipAhead) {
          return next(); // No skip-ahead requested, continue normally
        }

        if (!req.user?.id) {
          return res.status(401).json({
            error: 'authentication_required',
            message: 'User authentication required for skip-ahead'
          });
        }

        const userId = req.user.id;
        const targetLevel = req.params.level || req.query.level as string || req.body.level;

        if (!targetLevel) {
          return res.status(400).json({
            error: 'level_required',
            message: 'Target level is required for skip-ahead'
          });
        }

        console.log(`[PROGRESSION-MW] Processing skip-ahead: ${userId} -> ${targetLevel}`);

        // Get user progress and token balance
        const userProgress = await getUserProgress(userId);
        if (!userProgress) {
          return res.status(404).json({
            error: 'user_progress_not_found',
            message: 'User progress not found'
          });
        }

        const userTokenBalance = req.user.tokenBalance || 0;

        // Process level unlock with tokens
        const unlockResult = await progressionValidator.unlockLevelWithTokens(
          userId,
          targetLevel,
          userProgress,
          userTokenBalance
        );

        if (!unlockResult.success) {
          return res.status(402).json({
            error: 'skip_ahead_failed',
            message: unlockResult.reason,
            tokensRequired: await this.getSkipAheadCost(targetLevel),
            currentBalance: userTokenBalance
          });
        }

        // TODO: Update user progress with new unlocked level
        // TODO: Record transaction in token system

        console.log(`[PROGRESSION-MW] Skip-ahead successful: ${userId} -> ${targetLevel} (${unlockResult.tokensSpent} tokens)`);
        
        // Attach unlock result to request
        (req as any).skipAheadResult = unlockResult;
        
        next();

      } catch (error) {
        console.error('[PROGRESSION-MW] Error processing skip-ahead:', error);
        res.status(500).json({
          error: 'skip_ahead_error',
          message: 'Failed to process skip-ahead request'
        });
      }
    };
  }

  /**
   * Get progression status for user
   */
  getProgressionStatus() {
    return async (req: ProgressionRequest, res: Response) => {
      try {
        if (!req.user?.id) {
          return res.status(401).json({
            error: 'authentication_required',
            message: 'User authentication required'
          });
        }

        const userId = req.user.id;
        console.log(`[PROGRESSION-MW] Getting progression status for: ${userId}`);

        // Get user progress
        const userProgress = await getUserProgress(userId);
        if (!userProgress) {
          return res.status(404).json({
            error: 'user_progress_not_found',
            message: 'User progress not found'
          });
        }

        // Get progression status
        const status = await progressionValidator.getProgressionStatus(userId, userProgress);

        res.json({
          userId,
          progressionStatus: status,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('[PROGRESSION-MW] Error getting progression status:', error);
        res.status(500).json({
          error: 'progression_status_error',
          message: 'Failed to get progression status'
        });
      }
    };
  }

  /**
   * Validate lesson prerequisites specifically
   */
  validateLessonPrerequisites() {
    return async (req: ProgressionRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.user?.id) {
          return res.status(401).json({
            error: 'authentication_required',
            message: 'User authentication required'
          });
        }

        const userId = req.user.id;
        const lessonId = req.params.lessonId || req.body.lessonId;

        if (!lessonId) {
          return res.status(400).json({
            error: 'lesson_id_required',
            message: 'Lesson ID is required for prerequisite validation'
          });
        }

        console.log(`[PROGRESSION-MW] Validating lesson prerequisites: ${userId} -> ${lessonId}`);

        // Get user progress
        const userProgress = await getUserProgress(userId);
        if (!userProgress) {
          return res.status(404).json({
            error: 'user_progress_not_found',
            message: 'User progress not found'
          });
        }

        // Check if lesson is in user's completed lessons
        const isCompleted = userProgress.completedLessons?.includes(lessonId) || false;
        
        if (isCompleted && req.method === 'POST') {
          // User trying to complete an already completed lesson
          console.log(`[PROGRESSION-MW] Lesson already completed: ${userId} -> ${lessonId}`);
          
          // Allow retry but mark as such
          (req as any).isRetry = true;
        }

        // TODO: Add more sophisticated prerequisite checking
        // - Check if previous lessons in sequence are completed
        // - Validate level progression
        // - Check time-based restrictions (spaced repetition)

        next();

      } catch (error) {
        console.error('[PROGRESSION-MW] Error validating lesson prerequisites:', error);
        res.status(500).json({
          error: 'prerequisite_validation_failed',
          message: 'Failed to validate lesson prerequisites'
        });
      }
    };
  }

  /**
   * Helper method to get skip-ahead cost for a level
   */
  private async getSkipAheadCost(targetLevel: string): Promise<number> {
    // This should match the logic in progression-validator.ts
    const levelPrefix = targetLevel.substring(0, 2);
    const costs = {
      'A1': 3, 'A2': 5, 'B1': 10, 'B2': 15, 'C1': 25, 'C2': 50
    };
    return costs[levelPrefix as keyof typeof costs] || 10;
  }

  /**
   * Middleware to check daily lesson limits with progression context
   */
  validateDailyLessonAccess() {
    return async (req: ProgressionRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.user?.id) {
          return res.status(401).json({
            error: 'authentication_required',
            message: 'User authentication required'
          });
        }

        const userId = req.user.id;
        
        // TODO: Integrate with existing daily allowance system
        // Check if user has remaining daily lessons
        // If not, check if they want to spend tokens for extra lessons
        // Consider progression level for token costs (higher levels might cost more)

        console.log(`[PROGRESSION-MW] Validating daily lesson access for: ${userId}`);
        
        next();

      } catch (error) {
        console.error('[PROGRESSION-MW] Error validating daily lesson access:', error);
        res.status(500).json({
          error: 'daily_lesson_validation_failed',
          message: 'Failed to validate daily lesson access'
        });
      }
    };
  }
}

// Export singleton instance
export const learningProgressionMiddleware = new LearningProgressionMiddleware();
