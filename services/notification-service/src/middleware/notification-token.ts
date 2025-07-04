interface Request {
  user?: {
    id: string;
    tokens: number;
  };
  body?: any;
  params?: any;
  tokenTransaction?: {
    amount: number;
    type: string;
    metadata: any;
  };
}

interface Response {
  status(code: number): { json(data: any): void };
}

interface NextFunction {
  (): void;
}

interface RedisClient {
  get(key: string): Promise<string | null>;
  hget(key: string, field: string): Promise<string | null>;
  decrby(key: string, amount: number): Promise<number>;
  lpush(key: string, value: string): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<void>;
}

export class NotificationTokenMiddleware {
  private redisClient: RedisClient;

  constructor(redisClient: RedisClient) {
    this.redisClient = redisClient;
  }

  // Validate premium notification features
  async validatePremiumNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { notificationType, features } = req.body || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const tokenCost = this.getPremiumNotificationCost(notificationType, features);
      const userBalance = await this.getUserTokenBalance(userId);

      if (userBalance < tokenCost) {
        res.status(402).json({ 
          error: 'Insufficient tokens for premium notifications',
          required: tokenCost,
          available: userBalance
        });
        return;
      }

      req.tokenTransaction = {
        amount: tokenCost,
        type: 'premium_notifications',
        metadata: { notificationType, features, userId }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Premium notification validation failed' });
    }
  }

  // Validate custom notification campaigns
  async validateCustomCampaigns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { campaignType, targetCount, channels } = req.body || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const tokenCost = this.getCustomCampaignCost(campaignType, targetCount, channels);
      const userBalance = await this.getUserTokenBalance(userId);

      if (userBalance < tokenCost) {
        res.status(402).json({ 
          error: 'Insufficient tokens for custom campaigns',
          required: tokenCost,
          available: userBalance
        });
        return;
      }

      req.tokenTransaction = {
        amount: tokenCost,
        type: 'custom_campaigns',
        metadata: { campaignType, targetCount, channels, userId }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Custom campaign validation failed' });
    }
  }

  // Validate notification scheduling and automation
  async validateSchedulingFeatures(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { schedulingType, frequency, duration } = req.body || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const tokenCost = this.getSchedulingCost(schedulingType, frequency, duration);
      const userBalance = await this.getUserTokenBalance(userId);

      if (userBalance < tokenCost) {
        res.status(402).json({ 
          error: 'Insufficient tokens for scheduling features',
          required: tokenCost,
          available: userBalance
        });
        return;
      }

      req.tokenTransaction = {
        amount: tokenCost,
        type: 'notification_scheduling',
        metadata: { schedulingType, frequency, duration, userId }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Scheduling validation failed' });
    }
  }

  // Validate advanced analytics and tracking
  async validateAnalyticsFeatures(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { analyticsType, dataRange } = req.body || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const tokenCost = this.getAnalyticsCost(analyticsType, dataRange);
      const userBalance = await this.getUserTokenBalance(userId);

      if (userBalance < tokenCost) {
        res.status(402).json({ 
          error: 'Insufficient tokens for analytics features',
          required: tokenCost,
          available: userBalance
        });
        return;
      }

      req.tokenTransaction = {
        amount: tokenCost,
        type: 'notification_analytics',
        metadata: { analyticsType, dataRange, userId }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Analytics validation failed' });
    }
  }

  // Validate basic notification access (free tier)
  async validateBasicNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Basic notifications are free, just log the access
      req.tokenTransaction = {
        amount: 0,
        type: 'basic_notifications',
        metadata: { userId, access: 'free_tier' }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Basic notification validation failed' });
    }
  }

  // Process token spending after successful operation
  async processTokenSpending(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { user, tokenTransaction } = req;
      
      if (!user || !tokenTransaction || tokenTransaction.amount === 0) {
        next();
        return;
      }

      // Deduct tokens and log transaction
      await this.deductTokens(user.id, tokenTransaction.amount);
      await this.logTokenTransaction(user.id, tokenTransaction);

      // Update user's token balance in request for response
      user.tokens -= tokenTransaction.amount;
      
      next();
    } catch (error) {
      res.status(500).json({ error: 'Token processing failed' });
    }
  }

  // Helper methods
  private getPremiumNotificationCost(notificationType: string, features: any[]): number {
    const baseCosts = {
      'push_notification': 5,
      'email_notification': 3,
      'sms_notification': 15,
      'in_app_notification': 2,
      'webhook_notification': 8
    };

    const base = baseCosts[notificationType] || 5;
    const featureCost = features.length * 2; // 2 tokens per premium feature
    return base + featureCost;
  }

  private getCustomCampaignCost(campaignType: string, targetCount: number, channels: string[]): number {
    const baseCosts = {
      'broadcast': 50,
      'targeted': 75,
      'personalized': 100,
      'automated': 125
    };

    const base = baseCosts[campaignType] || 50;
    const targetMultiplier = Math.max(1, Math.floor(targetCount / 100)); // Cost increases per 100 targets
    const channelMultiplier = channels.length;

    return base * targetMultiplier * channelMultiplier;
  }

  private getSchedulingCost(schedulingType: string, frequency: string, duration: number): number {
    const baseCosts = {
      'one_time': 10,
      'recurring': 25,
      'conditional': 40,
      'smart_timing': 60
    };

    const frequencyMultipliers = {
      'daily': 1,
      'weekly': 0.7,
      'monthly': 0.5,
      'custom': 1.2
    };

    const base = baseCosts[schedulingType] || 10;
    const frequencyMultiplier = frequencyMultipliers[frequency] || 1;
    const durationDays = Math.max(1, Math.floor(duration / (24 * 60 * 60 * 1000))); // Convert ms to days
    
    return Math.floor(base * frequencyMultiplier * Math.min(durationDays, 30)); // Cap at 30 days
  }

  private getAnalyticsCost(analyticsType: string, dataRange: string): number {
    const baseCosts = {
      'basic_metrics': 20,
      'detailed_analytics': 40,
      'custom_reports': 60,
      'real_time_tracking': 80
    };

    const rangeMultipliers = {
      'week': 0.5,
      'month': 1,
      'quarter': 2,
      'year': 4
    };

    const base = baseCosts[analyticsType] || 20;
    const rangeMultiplier = rangeMultipliers[dataRange] || 1;

    return Math.floor(base * rangeMultiplier);
  }

  private async getUserTokenBalance(userId: string): Promise<number> {
    const balance = await this.redisClient.get(`user:${userId}:tokens`);
    return parseInt(balance || '0');
  }

  private async deductTokens(userId: string, amount: number): Promise<void> {
    await this.redisClient.decrby(`user:${userId}:tokens`, amount);
  }

  private async logTokenTransaction(userId: string, transaction: any): Promise<void> {
    const logEntry = JSON.stringify({
      ...transaction,
      timestamp: new Date().toISOString(),
      userId
    });
    
    await this.redisClient.lpush(`user:${userId}:token_history`, logEntry);
    await this.redisClient.ltrim(`user:${userId}:token_history`, 0, 99); // Keep last 100 transactions
  }
}
