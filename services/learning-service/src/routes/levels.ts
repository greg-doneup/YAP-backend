/**
 * Level Management Routes
 * 
 * Handles CEFR level progression, unlocking, and skip-ahead functionality
 */

import { Router } from "express";
import { learningProgressionMiddleware } from "../middleware/progression-middleware";
import { progressionValidator } from "../services/progression-validator";
import { getUserProgress, updateUserProgress } from "../clients/db";

const router = Router();

/**
 * GET /levels/status
 * Get user's current level progression status
 */
router.get("/status", learningProgressionMiddleware.getProgressionStatus());

/**
 * GET /levels/available
 * Get all available CEFR levels and their unlock status for the user
 */
router.get("/available", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({
        error: 'authentication_required',
        message: 'User authentication required'
      });
    }

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
    
    // Define all CEFR levels with metadata
    const allLevels = [
      { level: 'A1.1', title: 'Beginner 1', description: 'Basic greetings and introductions', category: 'A1' },
      { level: 'A1.2', title: 'Beginner 2', description: 'Simple personal information', category: 'A1' },
      { level: 'A1.3', title: 'Beginner 3', description: 'Basic needs and requests', category: 'A1' },
      { level: 'A2.1', title: 'Elementary 1', description: 'Simple conversations', category: 'A2' },
      { level: 'A2.2', title: 'Elementary 2', description: 'Past and future events', category: 'A2' },
      { level: 'A2.3', title: 'Elementary 3', description: 'Expressing opinions', category: 'A2' },
      { level: 'B1.1', title: 'Intermediate 1', description: 'Complex conversations', category: 'B1' },
      { level: 'B1.2', title: 'Intermediate 2', description: 'Abstract concepts', category: 'B1' },
      { level: 'B1.3', title: 'Intermediate 3', description: 'Detailed discussions', category: 'B1' },
      { level: 'B2.1', title: 'Upper-Intermediate 1', description: 'Professional communication', category: 'B2' },
      { level: 'B2.2', title: 'Upper-Intermediate 2', description: 'Complex arguments', category: 'B2' },
      { level: 'B2.3', title: 'Upper-Intermediate 3', description: 'Specialized topics', category: 'B2' },
      { level: 'C1.1', title: 'Advanced 1', description: 'Fluent expression', category: 'C1' },
      { level: 'C1.2', title: 'Advanced 2', description: 'Academic language', category: 'C1' },
      { level: 'C1.3', title: 'Advanced 3', description: 'Professional fluency', category: 'C1' },
      { level: 'C2.1', title: 'Proficiency 1', description: 'Native-like mastery', category: 'C2' },
      { level: 'C2.2', title: 'Proficiency 2', description: 'Literary expression', category: 'C2' },
      { level: 'C2.3', title: 'Proficiency 3', description: 'Perfect mastery', category: 'C2' }
    ];

    // Add unlock status and skip-ahead info to each level
    const levelsWithStatus = await Promise.all(allLevels.map(async (levelInfo) => {
      const validation = await progressionValidator.validateLevelAccess(
        userId, 
        levelInfo.level, 
        userProgress, 
        (req as any).user?.tokenBalance || 0
      );

      return {
        ...levelInfo,
        unlocked: status.unlockedLevels.includes(levelInfo.level),
        canAccess: validation.canAccess,
        requiresTokens: validation.requiresTokens,
        tokenCost: validation.tokenCost,
        skipAheadAvailable: validation.skipAheadAvailable,
        missingPrerequisites: validation.missingPrerequisites,
        isCurrent: levelInfo.level === status.currentLevel,
        isNext: levelInfo.level === status.nextAvailableLevel
      };
    }));

    res.json({
      userId,
      currentStatus: status,
      levels: levelsWithStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting available levels:', error);
    res.status(500).json({
      error: 'levels_fetch_failed',
      message: 'Failed to get available levels'
    });
  }
});

/**
 * POST /levels/:level/unlock
 * Unlock a specific CEFR level with tokens (skip-ahead)
 */
router.post("/:level/unlock",
  learningProgressionMiddleware.processSkipAhead(),
  async (req, res) => {
    try {
      const { level } = req.params;
      const userId = (req as any).user?.id;
      
      if (!userId) {
        return res.status(401).json({
          error: 'authentication_required',
          message: 'User authentication required'
        });
      }

      const skipAheadResult = (req as any).skipAheadResult;
      
      if (!skipAheadResult?.success) {
        return res.status(402).json({
          error: 'level_unlock_failed',
          message: skipAheadResult?.reason || 'Failed to unlock level',
          level
        });
      }

      // Update user progress with new unlocked level
      const userProgress = await getUserProgress(userId);
      if (userProgress) {
        const currentLevelIndex = ['A1.1', 'A1.2', 'A1.3', 'A2.1', 'A2.2', 'A2.3', 'B1.1', 'B1.2', 'B1.3', 'B2.1', 'B2.2', 'B2.3', 'C1.1', 'C1.2', 'C1.3', 'C2.1', 'C2.2', 'C2.3']
          .indexOf(userProgress.level?.toString() || 'A1.1');
        const newLevelIndex = ['A1.1', 'A1.2', 'A1.3', 'A2.1', 'A2.2', 'A2.3', 'B1.1', 'B1.2', 'B1.3', 'B2.1', 'B2.2', 'B2.3', 'C1.1', 'C1.2', 'C1.3', 'C2.1', 'C2.2', 'C2.3']
          .indexOf(level);

        if (newLevelIndex > currentLevelIndex) {
          await updateUserProgress(userId, {
            level: newLevelIndex + 1, // Store as 1-based index
            lastActivity: new Date().toISOString()
          });
        }
      }

      res.json({
        success: true,
        level,
        unlockDetails: {
          tokensSpent: skipAheadResult.tokensSpent,
          previousLevel: userProgress?.level,
          newLevel: skipAheadResult.newLevel,
          unlockedAt: new Date().toISOString()
        },
        message: `Successfully unlocked ${level} with ${skipAheadResult.tokensSpent} tokens`
      });

    } catch (error) {
      console.error('Error unlocking level:', error);
      res.status(500).json({
        error: 'level_unlock_error',
        message: 'Failed to process level unlock'
      });
    }
  }
);

/**
 * GET /levels/:level/requirements
 * Get requirements to unlock a specific level
 */
router.get("/:level/requirements", async (req, res) => {
  try {
    const { level } = req.params;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({
        error: 'authentication_required',
        message: 'User authentication required'
      });
    }

    // Get user progress
    const userProgress = await getUserProgress(userId);
    if (!userProgress) {
      return res.status(404).json({
        error: 'user_progress_not_found',
        message: 'User progress not found'
      });
    }

    // Validate level access to get requirements
    const validation = await progressionValidator.validateLevelAccess(
      userId,
      level,
      userProgress,
      (req as any).user?.tokenBalance || 0
    );

    res.json({
      level,
      currentLevel: userProgress.level,
      requirements: {
        canAccess: validation.canAccess,
        prerequisitesMet: validation.prerequisitesMet,
        missingPrerequisites: validation.missingPrerequisites,
        skipAheadOptions: {
          available: validation.skipAheadAvailable,
          tokenCost: validation.tokenCost,
          userBalance: (req as any).user?.tokenBalance || 0,
          canAfford: ((req as any).user?.tokenBalance || 0) >= validation.tokenCost
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting level requirements:', error);
    res.status(500).json({
      error: 'requirements_fetch_failed',
      message: 'Failed to get level requirements'
    });
  }
});

/**
 * POST /levels/validate-access
 * Validate access to multiple levels at once
 */
router.post("/validate-access", async (req, res) => {
  try {
    const { levels } = req.body;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({
        error: 'authentication_required',
        message: 'User authentication required'
      });
    }

    if (!levels || !Array.isArray(levels)) {
      return res.status(400).json({
        error: 'invalid_levels',
        message: 'Levels array is required'
      });
    }

    // Get user progress
    const userProgress = await getUserProgress(userId);
    if (!userProgress) {
      return res.status(404).json({
        error: 'user_progress_not_found',
        message: 'User progress not found'
      });
    }

    // Validate access for each level
    const validationResults = await Promise.all(
      levels.map(async (level: string) => {
        const validation = await progressionValidator.validateLevelAccess(
          userId,
          level,
          userProgress,
          (req as any).user?.tokenBalance || 0
        );

        return {
          level,
          ...validation
        };
      })
    );

    res.json({
      userId,
      validations: validationResults,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error validating level access:', error);
    res.status(500).json({
      error: 'validation_failed',
      message: 'Failed to validate level access'
    });
  }
});

export default router;
