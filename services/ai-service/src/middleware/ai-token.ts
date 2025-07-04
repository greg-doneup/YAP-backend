/**
 * AI Service Token Integration Middleware
 * 
 * Handles token validation and allowance management for AI text chat features:
 * - Daily text chat message limits (25 messages/day free)
 * - Unlimited hour pass mechanics (2 tokens = unlimited messages for 1 hour)
 * - Token-based model access validation
 * - Message tracking and transaction recording
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
    unlimitedUntil?: Date;
  };
}

interface TextChatRequest {
  userId: string;
  message: string;
  conversationId?: string;
  modelType?: 'gpt-3.5' | 'gpt-4' | 'claude' | 'basic';
  requestUnlimitedHour?: boolean;
}

export class AITokenMiddleware {
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
   * Validate text chat message allowance
   */
  public validateTextChatAllowance = async (
    req: TokenValidationRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { requestUnlimitedHour } = req.body as TextChatRequest;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      console.log(`[AI-TOKEN] Validating text chat for user ${userId}, unlimited hour: ${requestUnlimitedHour}`);

      // Check for active unlimited hour pass first
      const unlimitedStatus = await this.checkUnlimitedHourStatus(userId);
      
      if (unlimitedStatus.isActive) {
        req.tokenValidation = {
          canProcess: true,
          requiresTokens: false,
          tokenCost: 0,
          allowanceRemaining: Infinity,
          reason: `Unlimited hour active until ${unlimitedStatus.expiresAt?.toISOString()}`,
          unlimitedUntil: unlimitedStatus.expiresAt
        };
        next();
        return;
      }

      // Handle unlimited hour purchase request
      if (requestUnlimitedHour) {
        const unlimitedValidation = await this.validateUnlimitedHourPurchase(userId);
        req.tokenValidation = unlimitedValidation;
        next();
        return;
      }

      // Validate daily message allowance
      const allowanceValidation = await this.validateDailyMessageAllowance(userId);
      req.tokenValidation = allowanceValidation;
      next();

    } catch (error) {
      console.error('[AI-TOKEN] Error validating text chat allowance:', error);
      res.status(500).json({ 
        error: 'Token validation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Check if user has active unlimited hour pass
   */
  private async checkUnlimitedHourStatus(userId: string): Promise<{
    isActive: boolean;
    expiresAt?: Date;
  }> {
    try {
      // Check Redis cache first
      const cacheKey = `ai:unlimited:${userId}`;
      const cachedExpiry = await this.redis.get(cacheKey);
      
      if (cachedExpiry) {
        const expiresAt = new Date(cachedExpiry);
        if (expiresAt > new Date()) {
          return { isActive: true, expiresAt };
        } else {
          // Expired, remove from cache
          await this.redis.del(cacheKey);
        }
      }

      // Query shared service for unlimited status
      const response = await axios.post(`${this.sharedServiceUrl}/allowance/check-unlimited`, {
        userId,
        featureId: 'aiTextChat'
      });

      if (response.status === 200 && response.data.isUnlimited) {
        const expiresAt = new Date(response.data.unlimitedUntil);
        
        // Cache the result
        await this.redis.setex(cacheKey, Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000)), expiresAt.toISOString());
        
        return { isActive: true, expiresAt };
      }

      return { isActive: false };

    } catch (error) {
      console.error('[AI-TOKEN] Error checking unlimited hour status:', error);
      return { isActive: false };
    }
  }

  /**
   * Validate unlimited hour purchase
   */
  private async validateUnlimitedHourPurchase(userId: string): Promise<{
    canProcess: boolean;
    requiresTokens: boolean;
    tokenCost: number;
    allowanceRemaining: number;
    reason: string;
  }> {
    try {
      const tokenCost = 2; // 2 tokens for unlimited hour

      const response = await axios.post(`${this.sharedServiceUrl}/tokens/validate-spending`, {
        userId,
        amount: tokenCost,
        featureId: 'aiTextChat_unlimitedHour'
      });

      if (response.status === 200) {
        return {
          canProcess: response.data.canSpend,
          requiresTokens: true,
          tokenCost,
          allowanceRemaining: 0, // Not applicable for purchase
          reason: response.data.canSpend 
            ? 'Can purchase unlimited hour' 
            : `Insufficient tokens: ${response.data.reason || 'Unknown'}`
        };
      } else {
        // Fallback validation
        return {
          canProcess: true, // Assume sufficient tokens for now
          requiresTokens: true,
          tokenCost,
          allowanceRemaining: 0,
          reason: 'Token service unavailable, assuming sufficient balance'
        };
      }

    } catch (error) {
      console.error('[AI-TOKEN] Error validating unlimited hour purchase:', error);
      return {
        canProcess: false,
        requiresTokens: true,
        tokenCost: 2,
        allowanceRemaining: 0,
        reason: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Validate daily message allowance
   */
  private async validateDailyMessageAllowance(userId: string): Promise<{
    canProcess: boolean;
    requiresTokens: boolean;
    tokenCost: number;
    allowanceRemaining: number;
    reason: string;
  }> {
    try {
      const response = await axios.post(`${this.sharedServiceUrl}/allowance/validate`, {
        userId,
        featureId: 'aiTextChat',
        quantity: 1,
        unit: 'messages'
      });

      if (response.status === 200) {
        const data = response.data;
        return {
          canProcess: data.canUseAllowance || false,
          requiresTokens: !data.canUseAllowance,
          tokenCost: data.tokenCost || 0,
          allowanceRemaining: data.allowanceRemaining || 0,
          reason: data.reason || 'Unknown'
        };
      } else {
        // Fallback validation
        return await this.fallbackDailyValidation(userId);
      }

    } catch (error) {
      console.error('[AI-TOKEN] Error validating daily allowance:', error);
      return await this.fallbackDailyValidation(userId);
    }
  }

  /**
   * Fallback validation when shared services are unavailable
   */
  private async fallbackDailyValidation(userId: string): Promise<{
    canProcess: boolean;
    requiresTokens: boolean;
    tokenCost: number;
    allowanceRemaining: number;
    reason: string;
  }> {
    try {
      // Check local Redis cache for daily usage
      const dailyKey = `ai:daily:${userId}:${new Date().toISOString().split('T')[0]}`;
      const dailyUsage = parseInt(await this.redis.get(dailyKey) || '0');
      const dailyLimit = 25; // 25 messages per day

      if (dailyUsage < dailyLimit) {
        return {
          canProcess: true,
          requiresTokens: false,
          tokenCost: 0,
          allowanceRemaining: dailyLimit - dailyUsage - 1,
          reason: `Daily allowance sufficient (${dailyLimit - dailyUsage} remaining)`
        };
      } else {
        return {
          canProcess: true, // Assume user has tokens
          requiresTokens: true,
          tokenCost: 1, // 1 token per message over allowance
          allowanceRemaining: 0,
          reason: 'Daily allowance exceeded, requires tokens'
        };
      }

    } catch (error) {
      console.error('[AI-TOKEN] Fallback validation error:', error);
      return {
        canProcess: false,
        requiresTokens: false,
        tokenCost: 0,
        allowanceRemaining: 0,
        reason: `Fallback validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Process token spending for text chat
   */
  public processTextChatSpending = async (
    req: TokenValidationRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      const validation = req.tokenValidation;
      const { requestUnlimitedHour } = req.body as TextChatRequest;

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

      // Process unlimited hour purchase
      if (requestUnlimitedHour && validation.requiresTokens) {
        const success = await this.processUnlimitedHourPurchase(userId, validation.tokenCost);
        if (!success) {
          res.status(402).json({ error: 'Failed to process unlimited hour purchase' });
          return;
        }
      }

      // Process regular message spending
      if (!requestUnlimitedHour && validation.requiresTokens) {
        const success = await this.processMessageSpending(userId, validation.tokenCost);
        if (!success) {
          res.status(402).json({ error: 'Failed to process message payment' });
          return;
        }
      }

      // Update usage tracking
      if (!requestUnlimitedHour) {
        await this.updateDailyUsage(userId);
      }

      next();

    } catch (error) {
      console.error('[AI-TOKEN] Error processing text chat spending:', error);
      res.status(500).json({ 
        error: 'Payment processing failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Process unlimited hour purchase
   */
  private async processUnlimitedHourPurchase(userId: string, tokenCost: number): Promise<boolean> {
    try {
      // Spend tokens through shared service
      const response = await axios.post(`${this.sharedServiceUrl}/tokens/spend`, {
        userId,
        amount: tokenCost,
        featureId: 'aiTextChat_unlimitedHour',
        transactionType: 'unlimited_hour_purchase',
        metadata: {
          duration: '1 hour',
          feature: 'AI text chat'
        }
      });

      if (response.status === 200) {
        // Set unlimited hour in cache
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
        const cacheKey = `ai:unlimited:${userId}`;
        await this.redis.setex(cacheKey, 3600, expiresAt.toISOString());

        console.log(`[AI-TOKEN] Unlimited hour activated for user ${userId} until ${expiresAt.toISOString()}`);
        return true;
      }

      return false;

    } catch (error) {
      console.error('[AI-TOKEN] Error processing unlimited hour purchase:', error);
      return false;
    }
  }

  /**
   * Process regular message token spending
   */
  private async processMessageSpending(userId: string, tokenCost: number): Promise<boolean> {
    try {
      const response = await axios.post(`${this.sharedServiceUrl}/tokens/spend`, {
        userId,
        amount: tokenCost,
        featureId: 'aiTextChat',
        transactionType: 'message_over_allowance',
        metadata: {
          messageCount: 1,
          feature: 'AI text chat'
        }
      });

      return response.status === 200;

    } catch (error) {
      console.error('[AI-TOKEN] Error processing message spending:', error);
      return false;
    }
  }

  /**
   * Update daily usage tracking
   */
  private async updateDailyUsage(userId: string): Promise<void> {
    try {
      const dailyKey = `ai:daily:${userId}:${new Date().toISOString().split('T')[0]}`;
      await this.redis.incr(dailyKey);
      await this.redis.expire(dailyKey, 24 * 60 * 60); // Expire in 24 hours

    } catch (error) {
      console.error('[AI-TOKEN] Error updating daily usage:', error);
    }
  }

  /**
   * Get user's current text chat status
   */
  public getTextChatStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Check unlimited status
      const unlimitedStatus = await this.checkUnlimitedHourStatus(userId);
      
      // Get daily usage
      const dailyKey = `ai:daily:${userId}:${new Date().toISOString().split('T')[0]}`;
      const dailyUsage = parseInt(await this.redis.get(dailyKey) || '0');
      const dailyLimit = 25;

      res.json({
        unlimited: unlimitedStatus,
        dailyUsage,
        dailyLimit,
        dailyRemaining: Math.max(0, dailyLimit - dailyUsage),
        canSendMessage: unlimitedStatus.isActive || dailyUsage < dailyLimit
      });

    } catch (error) {
      console.error('[AI-TOKEN] Error getting text chat status:', error);
      res.status(500).json({ 
        error: 'Failed to get status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
}

export default AITokenMiddleware;
