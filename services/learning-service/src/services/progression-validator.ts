/**
 * Progression Validator Service
 * 
 * Handles CEFR level progression validation, prerequisite checking,
 * and token-based skip-ahead logic for the learning service.
 */

import { UserProgress } from "../types/lesson";

export interface ProgressionValidationResult {
  canAccess: boolean;
  reason: string;
  requiresTokens: boolean;
  tokenCost: number;
  skipAheadAvailable: boolean;
  prerequisitesMet: boolean;
  missingPrerequisites: string[];
}

export interface LevelUnlockResult {
  success: boolean;
  newLevel: string;
  tokensSpent: number;
  reason: string;
}

export interface PrerequisiteCheck {
  type: 'lesson' | 'level' | 'skill' | 'assessment';
  id: string;
  completed: boolean;
  required: boolean;
}

/**
 * CEFR Level Progression Configuration
 */
const CEFR_PROGRESSION_CONFIG = {
  levels: [
    'A1.1', 'A1.2', 'A1.3',
    'A2.1', 'A2.2', 'A2.3', 
    'B1.1', 'B1.2', 'B1.3',
    'B2.1', 'B2.2', 'B2.3',
    'C1.1', 'C1.2', 'C1.3',
    'C2.1', 'C2.2', 'C2.3'
  ],
  
  // Prerequisites for each level
  prerequisites: {
    'A1.2': { previousLevel: 'A1.1', minLessons: 3, minAccuracy: 0.7 },
    'A1.3': { previousLevel: 'A1.2', minLessons: 3, minAccuracy: 0.7 },
    'A2.1': { previousLevel: 'A1.3', minLessons: 4, minAccuracy: 0.75, placementTest: true },
    'A2.2': { previousLevel: 'A2.1', minLessons: 4, minAccuracy: 0.75 },
    'A2.3': { previousLevel: 'A2.2', minLessons: 4, minAccuracy: 0.75 },
    'B1.1': { previousLevel: 'A2.3', minLessons: 5, minAccuracy: 0.8, placementTest: true },
    'B1.2': { previousLevel: 'B1.1', minLessons: 5, minAccuracy: 0.8 },
    'B1.3': { previousLevel: 'B1.2', minLessons: 5, minAccuracy: 0.8 },
    'B2.1': { previousLevel: 'B1.3', minLessons: 6, minAccuracy: 0.85, placementTest: true },
    'B2.2': { previousLevel: 'B2.1', minLessons: 6, minAccuracy: 0.85 },
    'B2.3': { previousLevel: 'B2.2', minLessons: 6, minAccuracy: 0.85 },
    'C1.1': { previousLevel: 'B2.3', minLessons: 8, minAccuracy: 0.9, placementTest: true },
    'C1.2': { previousLevel: 'C1.1', minLessons: 8, minAccuracy: 0.9 },
    'C1.3': { previousLevel: 'C1.2', minLessons: 8, minAccuracy: 0.9 },
    'C2.1': { previousLevel: 'C1.3', minLessons: 10, minAccuracy: 0.95, placementTest: true },
    'C2.2': { previousLevel: 'C2.1', minLessons: 10, minAccuracy: 0.95 },
    'C2.3': { previousLevel: 'C2.2', minLessons: 10, minAccuracy: 0.95 }
  },

  // Token costs for skipping ahead
  skipAheadCosts: {
    'A1': 3,  // A1.x levels cost 3 tokens to skip
    'A2': 5,  // A2.x levels cost 5 tokens to skip
    'B1': 10, // B1.x levels cost 10 tokens to skip
    'B2': 15, // B2.x levels cost 15 tokens to skip
    'C1': 25, // C1.x levels cost 25 tokens to skip
    'C2': 50  // C2.x levels cost 50 tokens to skip
  }
};

export class ProgressionValidator {
  
  /**
   * Validate if user can access a specific CEFR level
   */
  async validateLevelAccess(
    userId: string, 
    targetLevel: string, 
    userProgress: UserProgress,
    userTokenBalance: number = 0
  ): Promise<ProgressionValidationResult> {
    
    try {
      console.log(`[PROGRESSION] Validating level access: ${userId} -> ${targetLevel}`);
      
      // Check if target level exists
      if (!CEFR_PROGRESSION_CONFIG.levels.includes(targetLevel)) {
        return {
          canAccess: false,
          reason: `Invalid CEFR level: ${targetLevel}`,
          requiresTokens: false,
          tokenCost: 0,
          skipAheadAvailable: false,
          prerequisitesMet: false,
          missingPrerequisites: [`Invalid level: ${targetLevel}`]
        };
      }

      const currentLevelIndex = CEFR_PROGRESSION_CONFIG.levels.indexOf(userProgress.level?.toString() || 'A1.1');
      const targetLevelIndex = CEFR_PROGRESSION_CONFIG.levels.indexOf(targetLevel);
      
      // User can always access current level or previous levels
      if (targetLevelIndex <= currentLevelIndex) {
        return {
          canAccess: true,
          reason: 'Level already unlocked',
          requiresTokens: false,
          tokenCost: 0,
          skipAheadAvailable: false,
          prerequisitesMet: true,
          missingPrerequisites: []
        };
      }

      // Check if trying to skip multiple levels (only allow skipping 1 level ahead)
      const levelGap = targetLevelIndex - currentLevelIndex;
      if (levelGap > 1) {
        return {
          canAccess: false,
          reason: `Cannot skip ${levelGap} levels. Complete previous levels first or unlock them individually.`,
          requiresTokens: false,
          tokenCost: 0,
          skipAheadAvailable: false,
          prerequisitesMet: false,
          missingPrerequisites: CEFR_PROGRESSION_CONFIG.levels.slice(currentLevelIndex + 1, targetLevelIndex)
        };
      }

      // Check prerequisites for the target level
      const prerequisiteCheck = await this.checkPrerequisites(targetLevel, userProgress);
      
      if (prerequisiteCheck.prerequisitesMet) {
        return {
          canAccess: true,
          reason: 'Prerequisites met, level unlocked',
          requiresTokens: false,
          tokenCost: 0,
          skipAheadAvailable: false,
          prerequisitesMet: true,
          missingPrerequisites: []
        };
      }

      // Prerequisites not met, check skip-ahead option
      const tokenCost = this.calculateSkipAheadCost(targetLevel);
      const canSkipAhead = userTokenBalance >= tokenCost;

      return {
        canAccess: canSkipAhead,
        reason: canSkipAhead 
          ? `Can unlock with ${tokenCost} tokens` 
          : `Missing prerequisites and insufficient tokens (need ${tokenCost}, have ${userTokenBalance})`,
        requiresTokens: true,
        tokenCost,
        skipAheadAvailable: true,
        prerequisitesMet: false,
        missingPrerequisites: prerequisiteCheck.missingPrerequisites
      };

    } catch (error) {
      console.error('[PROGRESSION] Error validating level access:', error);
      return {
        canAccess: false,
        reason: 'Validation error occurred',
        requiresTokens: false,
        tokenCost: 0,
        skipAheadAvailable: false,
        prerequisitesMet: false,
        missingPrerequisites: ['Validation error']
      };
    }
  }

  /**
   * Validate lesson access with prerequisite checking
   */
  async validateLessonAccess(
    userId: string,
    lessonId: string,
    userProgress: UserProgress
  ): Promise<ProgressionValidationResult> {
    
    try {
      console.log(`[PROGRESSION] Validating lesson access: ${userId} -> ${lessonId}`);
      
      // Get lesson details (would need to implement getLessonById)
      // For now, extract level from lessonId pattern
      const lessonLevel = this.extractLevelFromLessonId(lessonId);
      
      if (!lessonLevel) {
        return {
          canAccess: false,
          reason: 'Cannot determine lesson level',
          requiresTokens: false,
          tokenCost: 0,
          skipAheadAvailable: false,
          prerequisitesMet: false,
          missingPrerequisites: ['Invalid lesson ID']
        };
      }

      // Validate level access first
      const levelValidation = await this.validateLevelAccess(userId, lessonLevel, userProgress);
      
      if (!levelValidation.canAccess) {
        return levelValidation;
      }

      // Check if previous lessons in the same level are completed
      const prerequisiteLessons = await this.getPrerequisiteLessons(lessonId, userProgress);
      const missingLessons = prerequisiteLessons.filter(lesson => !lesson.completed);

      if (missingLessons.length > 0) {
        return {
          canAccess: false,
          reason: `Complete previous lessons first: ${missingLessons.map(l => l.id).join(', ')}`,
          requiresTokens: true,
          tokenCost: 1, // 1 token per lesson skip
          skipAheadAvailable: true,
          prerequisitesMet: false,
          missingPrerequisites: missingLessons.map(l => l.id)
        };
      }

      return {
        canAccess: true,
        reason: 'All prerequisites met',
        requiresTokens: false,
        tokenCost: 0,
        skipAheadAvailable: false,
        prerequisitesMet: true,
        missingPrerequisites: []
      };

    } catch (error) {
      console.error('[PROGRESSION] Error validating lesson access:', error);
      return {
        canAccess: false,
        reason: 'Lesson validation error',
        requiresTokens: false,
        tokenCost: 0,
        skipAheadAvailable: false,
        prerequisitesMet: false,
        missingPrerequisites: ['Validation error']
      };
    }
  }

  /**
   * Process level unlock with tokens
   */
  async unlockLevelWithTokens(
    userId: string,
    targetLevel: string,
    userProgress: UserProgress,
    userTokenBalance: number
  ): Promise<LevelUnlockResult> {
    
    try {
      console.log(`[PROGRESSION] Processing level unlock: ${userId} -> ${targetLevel}`);
      
      const validation = await this.validateLevelAccess(userId, targetLevel, userProgress, userTokenBalance);
      
      if (!validation.requiresTokens || !validation.skipAheadAvailable) {
        return {
          success: false,
          newLevel: userProgress.level?.toString() || 'A1.1',
          tokensSpent: 0,
          reason: 'Level unlock not available or not required'
        };
      }

      if (userTokenBalance < validation.tokenCost) {
        return {
          success: false,
          newLevel: userProgress.level?.toString() || 'A1.1',
          tokensSpent: 0,
          reason: `Insufficient tokens: need ${validation.tokenCost}, have ${userTokenBalance}`
        };
      }

      // TODO: Integrate with token service to actually spend tokens
      // await this.tokenService.spendTokens(userId, validation.tokenCost, 'level_unlock', targetLevel);

      return {
        success: true,
        newLevel: targetLevel,
        tokensSpent: validation.tokenCost,
        reason: `Successfully unlocked ${targetLevel} with ${validation.tokenCost} tokens`
      };

    } catch (error) {
      console.error('[PROGRESSION] Error unlocking level:', error);
      return {
        success: false,
        newLevel: userProgress.level?.toString() || 'A1.1',
        tokensSpent: 0,
        reason: 'Level unlock failed due to error'
      };
    }
  }

  /**
   * Check prerequisites for a specific level
   */
  private async checkPrerequisites(
    targetLevel: string, 
    userProgress: UserProgress
  ): Promise<{ prerequisitesMet: boolean; missingPrerequisites: string[] }> {
    
    const config = CEFR_PROGRESSION_CONFIG.prerequisites[targetLevel as keyof typeof CEFR_PROGRESSION_CONFIG.prerequisites];
    
    if (!config) {
      // No prerequisites defined, assume accessible
      return { prerequisitesMet: true, missingPrerequisites: [] };
    }

    const missing: string[] = [];

    // Check previous level completion
    if (config.previousLevel) {
      const currentLevelIndex = CEFR_PROGRESSION_CONFIG.levels.indexOf(userProgress.level?.toString() || 'A1.1');
      const requiredLevelIndex = CEFR_PROGRESSION_CONFIG.levels.indexOf(config.previousLevel);
      
      if (currentLevelIndex < requiredLevelIndex) {
        missing.push(`Complete ${config.previousLevel} first`);
      }
    }

    // Check minimum lessons completed
    if (config.minLessons) {
      const completedCount = userProgress.completedLessons?.length || 0;
      if (completedCount < config.minLessons) {
        missing.push(`Complete at least ${config.minLessons} lessons (currently ${completedCount})`);
      }
    }

    // Check placement test if required
    if ('placementTest' in config && config.placementTest === true) {
      // TODO: Check if user has passed the placement test for this level
      // For now, assume not taken
      missing.push(`Pass ${targetLevel} placement test`);
    }

    return {
      prerequisitesMet: missing.length === 0,
      missingPrerequisites: missing
    };
  }

  /**
   * Calculate token cost for skipping to a specific level
   */
  private calculateSkipAheadCost(targetLevel: string): number {
    const levelPrefix = targetLevel.substring(0, 2); // Extract A1, A2, B1, etc.
    return CEFR_PROGRESSION_CONFIG.skipAheadCosts[levelPrefix as keyof typeof CEFR_PROGRESSION_CONFIG.skipAheadCosts] || 10;
  }

  /**
   * Extract CEFR level from lesson ID
   */
  private extractLevelFromLessonId(lessonId: string): string | null {
    // Pattern matching for lesson IDs like "a1-1-greetings", "b2-3-business", etc.
    const match = lessonId.match(/^([abc][12])[-_](\d)/i);
    if (match) {
      const level = match[1].toUpperCase();
      const sublevel = match[2];
      return `${level}.${sublevel}`;
    }
    
    // Alternative pattern matching
    const altMatch = lessonId.match(/^([abc][12])[._](\d)/i);
    if (altMatch) {
      const level = altMatch[1].toUpperCase();
      const sublevel = altMatch[2];
      return `${level}.${sublevel}`;
    }
    
    return null;
  }

  /**
   * Get prerequisite lessons for a specific lesson
   */
  private async getPrerequisiteLessons(
    lessonId: string, 
    userProgress: UserProgress
  ): Promise<PrerequisiteCheck[]> {
    
    // TODO: Implement actual lesson dependency logic
    // For now, return empty array (no lesson-level prerequisites)
    return [];
  }

  /**
   * Get user's current progression status
   */
  async getProgressionStatus(userId: string, userProgress: UserProgress): Promise<{
    currentLevel: string;
    nextAvailableLevel: string | null;
    canAdvance: boolean;
    advancementRequirements: string[];
    unlockedLevels: string[];
  }> {
    
    const currentLevel = userProgress.level?.toString() || 'A1.1';
    const currentIndex = CEFR_PROGRESSION_CONFIG.levels.indexOf(currentLevel);
    
    const unlockedLevels = CEFR_PROGRESSION_CONFIG.levels.slice(0, currentIndex + 1);
    
    let nextAvailableLevel: string | null = null;
    let canAdvance = false;
    let advancementRequirements: string[] = [];

    if (currentIndex < CEFR_PROGRESSION_CONFIG.levels.length - 1) {
      nextAvailableLevel = CEFR_PROGRESSION_CONFIG.levels[currentIndex + 1];
      const prerequisiteCheck = await this.checkPrerequisites(nextAvailableLevel, userProgress);
      canAdvance = prerequisiteCheck.prerequisitesMet;
      advancementRequirements = prerequisiteCheck.missingPrerequisites;
    }

    return {
      currentLevel,
      nextAvailableLevel,
      canAdvance,
      advancementRequirements,
      unlockedLevels
    };
  }
}

// Export singleton instance
export const progressionValidator = new ProgressionValidator();
