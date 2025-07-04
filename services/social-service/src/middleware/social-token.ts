/**
 * Social Service Token Integration
 * 
 * Handles token validation and spending for social features:
 * - Weekly leaderboard staking mechanics
 * - Community challenge pool participation
 * - Referral reward automation
 * - Social feature unlocks and premium access
 */

import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import Redis from 'ioredis';

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
      canStake: boolean;
      currentStake: number;
      poolInfo: any;
    };
  };
}

interface LeaderboardStakeRequest {
  leaderboardId: string;
  stakeAmount: number;
  competitionWeek: string;
}

interface ChallengeJoinRequest {
  challengeId: string;
  entryFee: number;
  teamSize?: number;
}

interface ReferralRewardRequest {
  referredUserId: string;
  rewardType: 'signup' | 'first_lesson' | 'exam_pass';
  rewardAmount: number;
}

export class SocialTokenMiddleware {
  private sharedServiceUrl: string;
  private redis: Redis;

  constructor(
    sharedServiceUrl: string = process.env.SHARED_SERVICE_URL || 'http://shared-services:8080',
    redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379'
  ) {
    this.sharedServiceUrl = sharedServiceUrl;
    this.redis = new Redis(redisUrl);
  }

  /**
   * Validate leaderboard staking request
   */
  public validateLeaderboardStaking = async (
    req: TokenValidationRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { leaderboardId, stakeAmount, competitionWeek } = req.body as LeaderboardStakeRequest;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      console.log(`[SOCIAL-TOKEN] Validating leaderboard staking for user ${userId}: ${stakeAmount} tokens`);

      const validation = await this.validateStakingEligibility(userId, leaderboardId, stakeAmount, competitionWeek);
      req.tokenValidation = validation;
      next();

    } catch (error) {
      console.error('[SOCIAL-TOKEN] Error validating leaderboard staking:', error);
      res.status(500).json({ 
        error: 'Staking validation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Validate community challenge participation
   */
  public validateChallengeParticipation = async (
    req: TokenValidationRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { challengeId, entryFee, teamSize } = req.body as ChallengeJoinRequest;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      console.log(`[SOCIAL-TOKEN] Validating challenge participation for user ${userId}: ${entryFee} tokens`);

      const validation = await this.validateChallengeEntry(userId, challengeId, entryFee, teamSize);
      req.tokenValidation = validation;
      next();

    } catch (error) {
      console.error('[SOCIAL-TOKEN] Error validating challenge participation:', error);
      res.status(500).json({ 
        error: 'Challenge validation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Process social token spending (staking or challenge entry)
   */
  public processSocialSpending = async (
    req: TokenValidationRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      const validation = req.tokenValidation;

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
        const spendingType = req.path.includes('leaderboard') ? 'leaderboard_staking' : 'challenge_entry';
        const success = await this.processTokenSpending(userId, validation.tokenCost, spendingType, req.body);
        
        if (!success) {
          res.status(402).json({ error: 'Failed to process payment' });
          return;
        }
      }

      next();

    } catch (error) {
      console.error('[SOCIAL-TOKEN] Error processing social spending:', error);
      res.status(500).json({ 
        error: 'Payment processing failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Process referral rewards
   */
  public processReferralReward = async (
    req: TokenValidationRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { referredUserId, rewardType, rewardAmount } = req.body as ReferralRewardRequest;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      console.log(`[SOCIAL-TOKEN] Processing referral reward for user ${userId}: ${rewardAmount} tokens`);

      // Validate referral eligibility
      const isValid = await this.validateReferralReward(userId, referredUserId, rewardType);
      if (!isValid) {
        res.status(400).json({ error: 'Invalid referral reward request' });
        return;
      }

      // Distribute referral reward
      const success = await this.distributeReferralReward(userId, rewardAmount, rewardType, referredUserId);
      if (success) {
        req.body.rewardProcessed = true;
        req.body.rewardAmount = rewardAmount;
      }

      next();

    } catch (error) {
      console.error('[SOCIAL-TOKEN] Error processing referral reward:', error);
      // Don't fail the request if reward processing fails
      next();
    }
  };

  /**
   * Validate staking eligibility for leaderboards
   */
  private async validateStakingEligibility(
    userId: string, 
    leaderboardId: string, 
    stakeAmount: number, 
    competitionWeek: string
  ): Promise<{
    canProcess: boolean;
    requiresTokens: boolean;
    tokenCost: number;
    allowanceRemaining: number;
    reason: string;
    stakingData?: any;
  }> {
    try {
      // Check if user already staked in this competition
      const existingStakeKey = `stake:${userId}:${leaderboardId}:${competitionWeek}`;
      const existingStake = await this.redis.get(existingStakeKey);
      
      if (existingStake) {
        return {
          canProcess: false,
          requiresTokens: false,
          tokenCost: 0,
          allowanceRemaining: 0,
          reason: 'Already staked in this competition',
          stakingData: { canStake: false, currentStake: parseInt(existingStake) }
        };
      }

      // Validate minimum and maximum stake amounts
      const minStake = 1;
      const maxStake = 50;
      
      if (stakeAmount < minStake || stakeAmount > maxStake) {
        return {
          canProcess: false,
          requiresTokens: false,
          tokenCost: 0,
          allowanceRemaining: 0,
          reason: `Stake amount must be between ${minStake} and ${maxStake} tokens`,
          stakingData: { canStake: false, currentStake: 0 }
        };
      }

      // Validate token spending
      const response = await axios.post(`${this.sharedServiceUrl}/tokens/validate-spending`, {
        userId,
        amount: stakeAmount,
        featureId: 'weeklyLeaderboardStaking'
      });

      if (response.status === 200) {
        const poolInfo = await this.getLeaderboardPoolInfo(leaderboardId, competitionWeek);
        
        return {
          canProcess: response.data.canSpend,
          requiresTokens: true,
          tokenCost: stakeAmount,
          allowanceRemaining: 0, // Not applicable for staking
          reason: response.data.canSpend 
            ? `Can stake ${stakeAmount} tokens in leaderboard competition`
            : `Insufficient tokens: ${response.data.reason || 'Unknown'}`,
          stakingData: {
            canStake: response.data.canSpend,
            currentStake: 0,
            poolInfo
          }
        };
      } else {
        // Fallback
        return {
          canProcess: true, // Assume sufficient tokens
          requiresTokens: true,
          tokenCost: stakeAmount,
          allowanceRemaining: 0,
          reason: 'Token service unavailable, assuming sufficient balance',
          stakingData: { canStake: true, currentStake: 0 }
        };
      }

    } catch (error) {
      console.error('[SOCIAL-TOKEN] Error validating staking eligibility:', error);
      return {
        canProcess: false,
        requiresTokens: true,
        tokenCost: stakeAmount,
        allowanceRemaining: 0,
        reason: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        stakingData: { canStake: false, currentStake: 0 }
      };
    }
  }

  /**
   * Validate challenge entry eligibility
   */
  private async validateChallengeEntry(
    userId: string, 
    challengeId: string, 
    entryFee: number, 
    teamSize?: number
  ): Promise<{
    canProcess: boolean;
    requiresTokens: boolean;
    tokenCost: number;
    allowanceRemaining: number;
    reason: string;
  }> {
    try {
      // Check if user already joined this challenge
      const participantKey = `challenge:${challengeId}:participants`;
      const isParticipant = await this.redis.sismember(participantKey, userId);
      
      if (isParticipant) {
        return {
          canProcess: false,
          requiresTokens: false,
          tokenCost: 0,
          allowanceRemaining: 0,
          reason: 'Already participating in this challenge'
        };
      }

      // Validate entry fee
      if (entryFee < 1 || entryFee > 20) {
        return {
          canProcess: false,
          requiresTokens: false,
          tokenCost: 0,
          allowanceRemaining: 0,
          reason: 'Entry fee must be between 1 and 20 tokens'
        };
      }

      // Check challenge capacity
      const currentParticipants = await this.redis.scard(participantKey);
      const maxParticipants = 100; // Default max capacity
      
      if (currentParticipants >= maxParticipants) {
        return {
          canProcess: false,
          requiresTokens: false,
          tokenCost: 0,
          allowanceRemaining: 0,
          reason: 'Challenge is at full capacity'
        };
      }

      // Validate token spending
      const response = await axios.post(`${this.sharedServiceUrl}/tokens/validate-spending`, {
        userId,
        amount: entryFee,
        featureId: 'communityChallengeEntry'
      });

      if (response.status === 200) {
        return {
          canProcess: response.data.canSpend,
          requiresTokens: true,
          tokenCost: entryFee,
          allowanceRemaining: 0,
          reason: response.data.canSpend 
            ? `Can join challenge with ${entryFee} token entry fee`
            : `Insufficient tokens: ${response.data.reason || 'Unknown'}`
        };
      } else {
        // Fallback
        return {
          canProcess: true,
          requiresTokens: true,
          tokenCost: entryFee,
          allowanceRemaining: 0,
          reason: 'Token service unavailable, assuming sufficient balance'
        };
      }

    } catch (error) {
      console.error('[SOCIAL-TOKEN] Error validating challenge entry:', error);
      return {
        canProcess: false,
        requiresTokens: true,
        tokenCost: entryFee,
        allowanceRemaining: 0,
        reason: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Process token spending for social features
   */
  private async processTokenSpending(
    userId: string, 
    amount: number, 
    spendingType: string, 
    metadata: any
  ): Promise<boolean> {
    try {
      const featureId = spendingType === 'leaderboard_staking' 
        ? 'weeklyLeaderboardStaking' 
        : 'communityChallengeEntry';
      
      const response = await axios.post(`${this.sharedServiceUrl}/tokens/spend`, {
        userId,
        amount,
        featureId,
        transactionType: spendingType,
        metadata: {
          ...metadata,
          feature: 'Social features',
          timestamp: new Date().toISOString()
        }
      });

      if (response.status === 200) {
        // Track spending in Redis for analytics
        if (spendingType === 'leaderboard_staking') {
          const stakeKey = `stake:${userId}:${metadata.leaderboardId}:${metadata.competitionWeek}`;
          await this.redis.setex(stakeKey, 7 * 24 * 60 * 60, amount.toString()); // 7 days expiry
        } else if (spendingType === 'challenge_entry') {
          const participantKey = `challenge:${metadata.challengeId}:participants`;
          await this.redis.sadd(participantKey, userId);
          await this.redis.expire(participantKey, 30 * 24 * 60 * 60); // 30 days expiry
        }
      }

      return response.status === 200;

    } catch (error) {
      console.error('[SOCIAL-TOKEN] Error processing token spending:', error);
      return false;
    }
  }

  /**
   * Validate referral reward eligibility
   */
  private async validateReferralReward(
    referrerId: string, 
    referredUserId: string, 
    rewardType: string
  ): Promise<boolean> {
    try {
      // Check if reward already processed for this referral
      const rewardKey = `referral:${referrerId}:${referredUserId}:${rewardType}`;
      const alreadyRewarded = await this.redis.exists(rewardKey);
      
      if (alreadyRewarded) {
        return false;
      }

      // Validate referral relationship
      const referralKey = `referral:${referredUserId}:referrer`;
      const actualReferrer = await this.redis.get(referralKey);
      
      return actualReferrer === referrerId;

    } catch (error) {
      console.error('[SOCIAL-TOKEN] Error validating referral reward:', error);
      return false;
    }
  }

  /**
   * Distribute referral reward
   */
  private async distributeReferralReward(
    referrerId: string, 
    rewardAmount: number, 
    rewardType: string, 
    referredUserId: string
  ): Promise<boolean> {
    try {
      const response = await axios.post(`${this.sharedServiceUrl}/rewards/distribute`, {
        userId: referrerId,
        amount: rewardAmount,
        rewardType: `referral_${rewardType}`,
        source: 'referral_program',
        metadata: {
          referredUserId,
          rewardType,
          timestamp: new Date().toISOString()
        }
      });

      if (response.status === 200) {
        // Mark reward as processed
        const rewardKey = `referral:${referrerId}:${referredUserId}:${rewardType}`;
        await this.redis.setex(rewardKey, 365 * 24 * 60 * 60, rewardAmount.toString()); // 1 year expiry
      }

      return response.status === 200;

    } catch (error) {
      console.error('[SOCIAL-TOKEN] Error distributing referral reward:', error);
      return false;
    }
  }

  /**
   * Get leaderboard pool information
   */
  private async getLeaderboardPoolInfo(leaderboardId: string, competitionWeek: string): Promise<any> {
    try {
      const poolKey = `leaderboard:${leaderboardId}:${competitionWeek}:pool`;
      const poolData = await this.redis.hgetall(poolKey);
      
      return {
        totalStaked: parseInt(poolData.totalStaked || '0'),
        participantCount: parseInt(poolData.participantCount || '0'),
        prizeDistribution: {
          first: '50%',
          second: '30%',
          third: '20%'
        }
      };

    } catch (error) {
      console.error('[SOCIAL-TOKEN] Error getting pool info:', error);
      return {
        totalStaked: 0,
        participantCount: 0,
        prizeDistribution: { first: '50%', second: '30%', third: '20%' }
      };
    }
  }
}

export default SocialTokenMiddleware;
