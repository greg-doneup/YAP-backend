/**
 * Assessment Service Token Integration
 * 
 * Handles token validation and spending for assessment features:
 * - Unit exam staking mechanics (optional 1 token stake)
 * - Skip-ahead exam costs (1 token = 2 attempts)
 * - Reward distribution for exam passes (score ≥95% = 1 token)
 * - Adaptive review quiz generation
 */

import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import IORedis from 'ioredis';

interface TokenValidationRequest extends Request {
  user?: {
    id: string;
    address?: string;
  };
  tokenValidation?: {
    canProcess: boolean;
    requiresTokens: boolean;
    tokenCost: number;
    allowanceRemaining: number;
    reason: string;
    stakingData?: {
      staked: boolean;
      stakedAmount: number;
    };
  };
}

interface ExamRequest {
  userId: string;
  examId: string;
  unitId: string;
  examType: 'regular' | 'skip_ahead';
  stakeTokens?: boolean;
  attemptNumber?: number;
}

interface ExamResult {
  score: number;
  passed: boolean;
  examId: string;
  unitId: string;
  examType: string;
  wasStaked: boolean;
  rewardsEarned: number;
}

export class AssessmentTokenMiddleware {
  private sharedServiceUrl: string;
  private redis: IORedis;

  constructor(
    sharedServiceUrl: string = process.env.SHARED_SERVICE_URL || 'http://shared-services:8080',
    redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379'
  ) {
    this.sharedServiceUrl = sharedServiceUrl;
    this.redis = new IORedis(redisUrl);
  }

  /**
   * Validate unit exam access and staking
   */
  public validateUnitExamAccess = async (
    req: TokenValidationRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { examType, stakeTokens, attemptNumber = 1 } = req.body as ExamRequest;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      console.log(`[ASSESSMENT-TOKEN] Validating ${examType} exam access for user ${userId}, stake: ${stakeTokens}`);

      let validation;

      if (examType === 'skip_ahead') {
        validation = await this.validateSkipAheadExam(userId, attemptNumber);
      } else {
        validation = await this.validateRegularExam(userId, stakeTokens || false);
      }

      req.tokenValidation = validation;
      next();

    } catch (error) {
      console.error('[ASSESSMENT-TOKEN] Error validating exam access:', error);
      res.status(500).json({ 
        error: 'Exam validation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Validate skip-ahead exam (1 token = 2 attempts)
   */
  private async validateSkipAheadExam(userId: string, attemptNumber: number): Promise<{
    canProcess: boolean;
    requiresTokens: boolean;
    tokenCost: number;
    allowanceRemaining: number;
    reason: string;
  }> {
    try {
      // Skip-ahead exams cost 1 token for 2 attempts
      const tokenCost = attemptNumber <= 2 ? (attemptNumber === 1 ? 1 : 0) : 1;

      if (tokenCost === 0) {
        return {
          canProcess: true,
          requiresTokens: false,
          tokenCost: 0,
          allowanceRemaining: 0,
          reason: 'Using second attempt from previous purchase'
        };
      }

      // Validate token spending
      const response = await axios.post(`${this.sharedServiceUrl}/tokens/validate-spending`, {
        userId,
        amount: tokenCost,
        featureId: 'unitExamSkipAhead_twoAttempts'
      });

      if (response.status === 200) {
        return {
          canProcess: response.data.canSpend,
          requiresTokens: true,
          tokenCost,
          allowanceRemaining: 0, // Not applicable
          reason: response.data.canSpend 
            ? `Can purchase ${attemptNumber <= 2 ? '2 attempts' : 'additional attempts'}`
            : `Insufficient tokens: ${response.data.reason || 'Unknown'}`
        };
      } else {
        // Fallback
        return {
          canProcess: true, // Assume sufficient tokens
          requiresTokens: true,
          tokenCost,
          allowanceRemaining: 0,
          reason: 'Token service unavailable, assuming sufficient balance'
        };
      }

    } catch (error) {
      console.error('[ASSESSMENT-TOKEN] Error validating skip-ahead exam:', error);
      return {
        canProcess: false,
        requiresTokens: true,
        tokenCost: 1,
        allowanceRemaining: 0,
        reason: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Validate regular exam (free, optional staking)
   */
  private async validateRegularExam(userId: string, stakeTokens: boolean): Promise<{
    canProcess: boolean;
    requiresTokens: boolean;
    tokenCost: number;
    allowanceRemaining: number;
    reason: string;
    stakingData?: {
      staked: boolean;
      stakedAmount: number;
    };
  }> {
    try {
      // Regular exams are always free
      if (!stakeTokens) {
        return {
          canProcess: true,
          requiresTokens: false,
          tokenCost: 0,
          allowanceRemaining: 0,
          reason: 'Regular exam is free',
          stakingData: {
            staked: false,
            stakedAmount: 0
          }
        };
      }

      // Validate optional staking (1 token)
      const stakeCost = 1;
      const response = await axios.post(`${this.sharedServiceUrl}/tokens/validate-spending`, {
        userId,
        amount: stakeCost,
        featureId: 'unitExam_optionalStake'
      });

      if (response.status === 200) {
        return {
          canProcess: response.data.canSpend,
          requiresTokens: true,
          tokenCost: stakeCost,
          allowanceRemaining: 0,
          reason: response.data.canSpend 
            ? 'Can stake 1 token for enhanced rewards'
            : `Insufficient tokens for staking: ${response.data.reason || 'Unknown'}`,
          stakingData: {
            staked: response.data.canSpend,
            stakedAmount: response.data.canSpend ? stakeCost : 0
          }
        };
      } else {
        // Fallback
        return {
          canProcess: true, // Allow exam without staking
          requiresTokens: false,
          tokenCost: 0,
          allowanceRemaining: 0,
          reason: 'Token service unavailable, proceeding without staking',
          stakingData: {
            staked: false,
            stakedAmount: 0
          }
        };
      }

    } catch (error) {
      console.error('[ASSESSMENT-TOKEN] Error validating regular exam:', error);
      return {
        canProcess: true, // Always allow free exam
        requiresTokens: false,
        tokenCost: 0,
        allowanceRemaining: 0,
        reason: 'Proceeding with free exam (validation error)',
        stakingData: {
          staked: false,
          stakedAmount: 0
        }
      };
    }
  }

  /**
   * Process exam token spending (staking or attempts)
   */
  public processExamSpending = async (
    req: TokenValidationRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      const validation = req.tokenValidation;
      const { examId, examType } = req.body as ExamRequest;

      if (!userId || !validation) {
        res.status(400).json({ error: 'Missing validation data' });
        return;
      }

      if (!validation.canProcess) {
        res.status(402).json({ 
          error: 'Payment required',
          reason: validation.reason,
          tokenCost: validation.tokenCost
        });
        return;
      }

      // Process token spending if required
      if (validation.requiresTokens && validation.tokenCost > 0) {
        const success = await this.processTokenSpending(userId, validation.tokenCost, examType, examId);
        if (!success) {
          res.status(402).json({ error: 'Failed to process payment' });
          return;
        }
      }

      // Track exam start in Redis for attempt counting
      if (examType === 'skip_ahead') {
        await this.trackExamAttempt(userId, examId);
      }

      next();

    } catch (error) {
      console.error('[ASSESSMENT-TOKEN] Error processing exam spending:', error);
      res.status(500).json({ 
        error: 'Payment processing failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Process exam rewards based on results
   */
  public processExamRewards = async (
    req: TokenValidationRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      const examResult = req.body as ExamResult;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      console.log(`[ASSESSMENT-TOKEN] Processing exam rewards for user ${userId}, score: ${examResult.score}`);

      const rewards = await this.calculateExamRewards(examResult);
      
      if (rewards.tokenReward > 0) {
        const success = await this.distributeExamReward(userId, rewards);
        if (success) {
          console.log(`[ASSESSMENT-TOKEN] Distributed ${rewards.tokenReward} tokens to user ${userId}`);
        }
      }

      // Add reward info to response
      req.body.rewardsCalculated = rewards;
      next();

    } catch (error) {
      console.error('[ASSESSMENT-TOKEN] Error processing exam rewards:', error);
      // Don't fail the request if reward processing fails
      next();
    }
  };

  /**
   * Process token spending for exams
   */
  private async processTokenSpending(userId: string, amount: number, examType: string, examId: string): Promise<boolean> {
    try {
      const featureId = examType === 'skip_ahead' ? 'unitExamSkipAhead_twoAttempts' : 'unitExam_optionalStake';
      
      const response = await axios.post(`${this.sharedServiceUrl}/tokens/spend`, {
        userId,
        amount,
        featureId,
        transactionType: examType === 'skip_ahead' ? 'exam_purchase' : 'exam_staking',
        metadata: {
          examId,
          examType,
          feature: 'Unit exam'
        }
      });

      return response.status === 200;

    } catch (error) {
      console.error('[ASSESSMENT-TOKEN] Error processing token spending:', error);
      return false;
    }
  }

  /**
   * Track exam attempts for skip-ahead exams
   */
  private async trackExamAttempt(userId: string, examId: string): Promise<void> {
    try {
      const attemptKey = `exam:attempts:${userId}:${examId}`;
      await this.redis.incr(attemptKey);
      await this.redis.expire(attemptKey, 24 * 60 * 60); // Expire in 24 hours

    } catch (error) {
      console.error('[ASSESSMENT-TOKEN] Error tracking exam attempt:', error);
    }
  }

  /**
   * Calculate exam rewards based on results
   */
  private async calculateExamRewards(examResult: ExamResult): Promise<{
    tokenReward: number;
    bonusMultiplier: number;
    rewardType: string;
  }> {
    try {
      if (examResult.examType === 'skip_ahead') {
        // Skip-ahead exam: Pass = 3 tokens + unit unlocked
        if (examResult.passed) {
          return {
            tokenReward: 3,
            bonusMultiplier: 1.0,
            rewardType: 'skip_ahead_pass'
          };
        }
      } else {
        // Regular exam: Score ≥ 95% = 1 token
        if (examResult.score >= 95) {
          const bonusMultiplier = examResult.wasStaked ? 1.5 : 1.0;
          return {
            tokenReward: 1,
            bonusMultiplier,
            rewardType: examResult.wasStaked ? 'exam_staked_pass' : 'exam_pass'
          };
        }
      }

      return {
        tokenReward: 0,
        bonusMultiplier: 1.0,
        rewardType: 'no_reward'
      };

    } catch (error) {
      console.error('[ASSESSMENT-TOKEN] Error calculating exam rewards:', error);
      return {
        tokenReward: 0,
        bonusMultiplier: 1.0,
        rewardType: 'calculation_error'
      };
    }
  }

  /**
   * Distribute exam rewards
   */
  private async distributeExamReward(userId: string, rewards: {
    tokenReward: number;
    bonusMultiplier: number;
    rewardType: string;
  }): Promise<boolean> {
    try {
      const response = await axios.post(`${this.sharedServiceUrl}/rewards/distribute`, {
        userId,
        amount: Math.floor(rewards.tokenReward * rewards.bonusMultiplier),
        rewardType: rewards.rewardType,
        source: 'exam_completion',
        metadata: {
          baseReward: rewards.tokenReward,
          multiplier: rewards.bonusMultiplier,
          rewardType: rewards.rewardType
        }
      });

      return response.status === 200;

    } catch (error) {
      console.error('[ASSESSMENT-TOKEN] Error distributing exam reward:', error);
      return false;
    }
  }

  /**
   * Get user's exam status and attempt counts
   */
  public getExamStatus = async (req: TokenValidationRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { examId } = req.query;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      let examStatus = {};

      if (examId) {
        // Get specific exam status
        const attemptKey = `exam:attempts:${userId}:${examId}`;
        const attempts = parseInt(await this.redis.get(attemptKey) || '0');
        
        examStatus = {
          examId,
          attemptsUsed: attempts,
          attemptsRemaining: Math.max(0, 2 - attempts), // Skip-ahead exams have 2 attempts
          canTakeExam: attempts < 2 || attempts === 0
        };
      } else {
        // Get overall exam status
        examStatus = {
          skipAheadExamsAvailable: true, // Would query actual availability
          regularExamsUnlimited: true,
          stakingAvailable: true
        };
      }

      res.json({
        success: true,
        status: examStatus
      });

    } catch (error) {
      console.error('[ASSESSMENT-TOKEN] Error getting exam status:', error);
      res.status(500).json({ 
        error: 'Failed to get exam status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
}

export default AssessmentTokenMiddleware;
