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
  decrby(key: string, amount: number): Promise<number>;
  lpush(key: string, value: string): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<void>;
}

export class ProfileTokenMiddleware {
  private redisClient: RedisClient;

  constructor(redisClient: RedisClient) {
    this.redisClient = redisClient;
  }

  // Validate token balance display access
  async validateBalanceAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Check if user has basic access (free tier gets limited info)
      const userTier = await this.getUserTier(userId);
      req.tokenTransaction = {
        amount: 0,
        type: 'balance_access',
        metadata: { tier: userTier, access_level: this.getAccessLevel(userTier) }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Token validation failed' });
    }
  }

  // Validate streak management operations
  async validateStreakManagement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { action } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const tokenCost = this.getStreakActionCost(action);
      const userBalance = await this.getUserTokenBalance(userId);

      if (userBalance < tokenCost) {
        res.status(402).json({ 
          error: 'Insufficient tokens',
          required: tokenCost,
          available: userBalance
        });
        return;
      }

      req.tokenTransaction = {
        amount: tokenCost,
        type: 'streak_management',
        metadata: { action, userId }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Streak validation failed' });
    }
  }

  // Validate profile customization features
  async validateProfileCustomization(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { customizationType, options } = req.body;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const tokenCost = this.getCustomizationCost(customizationType, options);
      const userBalance = await this.getUserTokenBalance(userId);

      if (userBalance < tokenCost) {
        res.status(402).json({ 
          error: 'Insufficient tokens for customization',
          required: tokenCost,
          available: userBalance
        });
        return;
      }

      req.tokenTransaction = {
        amount: tokenCost,
        type: 'profile_customization',
        metadata: { customizationType, options, userId }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Customization validation failed' });
    }
  }

  // Validate achievement unlock operations
  async validateAchievementUnlock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { achievementId } = req.params;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const tokenCost = await this.getAchievementUnlockCost(achievementId);
      const userBalance = await this.getUserTokenBalance(userId);

      if (userBalance < tokenCost) {
        res.status(402).json({ 
          error: 'Insufficient tokens for achievement unlock',
          required: tokenCost,
          available: userBalance
        });
        return;
      }

      req.tokenTransaction = {
        amount: tokenCost,
        type: 'achievement_unlock',
        metadata: { achievementId, userId }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Achievement validation failed' });
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
  private async getUserTier(userId: string): Promise<string> {
    const tier = await this.redisClient.get(`user:${userId}:tier`);
    return tier || 'free';
  }

  private getAccessLevel(tier: string): string {
    const levels = {
      'free': 'basic',
      'premium': 'advanced',
      'pro': 'full'
    };
    return levels[tier] || 'basic';
  }

  private getStreakActionCost(action: string): number {
    const costs = {
      'freeze': 10,
      'repair': 25,
      'boost': 15,
      'extend': 20
    };
    return costs[action] || 0;
  }

  private getCustomizationCost(type: string, options: any): number {
    const baseCosts = {
      'avatar': 50,
      'badge': 30,
      'theme': 40,
      'title': 35
    };
    
    const base = baseCosts[type] || 0;
    const premium = options?.premium ? base * 2 : 0;
    return base + premium;
  }

  private async getAchievementUnlockCost(achievementId: string): Promise<number> {
    const cost = await this.redisClient.get(`achievement:${achievementId}:cost`);
    return parseInt(cost || '0');
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
