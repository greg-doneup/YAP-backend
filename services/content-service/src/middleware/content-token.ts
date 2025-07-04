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

export class ContentTokenMiddleware {
  private redisClient: RedisClient;

  constructor(redisClient: RedisClient) {
    this.redisClient = redisClient;
  }

  // Validate premium content access
  async validatePremiumContentAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { contentId, contentType } = req.params || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const tokenCost = await this.getContentAccessCost(contentId, contentType);
      const userBalance = await this.getUserTokenBalance(userId);

      if (userBalance < tokenCost) {
        res.status(402).json({ 
          error: 'Insufficient tokens for premium content access',
          required: tokenCost,
          available: userBalance
        });
        return;
      }

      req.tokenTransaction = {
        amount: tokenCost,
        type: 'premium_content_access',
        metadata: { contentId, contentType, userId }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Content access validation failed' });
    }
  }

  // Validate content creation tools
  async validateContentCreation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { toolType, features } = req.body || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const tokenCost = this.getCreationToolCost(toolType, features);
      const userBalance = await this.getUserTokenBalance(userId);

      if (userBalance < tokenCost) {
        res.status(402).json({ 
          error: 'Insufficient tokens for content creation tools',
          required: tokenCost,
          available: userBalance
        });
        return;
      }

      req.tokenTransaction = {
        amount: tokenCost,
        type: 'content_creation',
        metadata: { toolType, features, userId }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Content creation validation failed' });
    }
  }

  // Validate marketplace transactions
  async validateMarketplaceTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { transactionType, amount, targetUserId } = req.body || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const tokenCost = this.getMarketplaceCost(transactionType, amount);
      const userBalance = await this.getUserTokenBalance(userId);

      if (userBalance < tokenCost) {
        res.status(402).json({ 
          error: 'Insufficient tokens for marketplace transaction',
          required: tokenCost,
          available: userBalance
        });
        return;
      }

      req.tokenTransaction = {
        amount: tokenCost,
        type: 'marketplace_transaction',
        metadata: { transactionType, amount, targetUserId, userId }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Marketplace validation failed' });
    }
  }

  // Validate content upload/publishing
  async validateContentPublishing(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { contentType, visibility, features } = req.body || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const tokenCost = this.getPublishingCost(contentType, visibility, features);
      const userBalance = await this.getUserTokenBalance(userId);

      if (userBalance < tokenCost) {
        res.status(402).json({ 
          error: 'Insufficient tokens for content publishing',
          required: tokenCost,
          available: userBalance
        });
        return;
      }

      req.tokenTransaction = {
        amount: tokenCost,
        type: 'content_publishing',
        metadata: { contentType, visibility, features, userId }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Content publishing validation failed' });
    }
  }

  // Validate basic content access (free tier)
  async validateBasicContentAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Basic content is free, just log the access
      req.tokenTransaction = {
        amount: 0,
        type: 'basic_content_access',
        metadata: { userId, access: 'free_tier' }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Basic content access validation failed' });
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
  private async getContentAccessCost(contentId: string, contentType: string): Promise<number> {
    // Check if content has custom pricing
    const customCost = await this.redisClient.hget(`content:${contentId}`, 'token_cost');
    if (customCost) {
      return parseInt(customCost);
    }

    // Default costs by content type
    const defaultCosts = {
      'premium_lesson': 50,
      'expert_content': 75,
      'exclusive_video': 40,
      'interactive_exercise': 30,
      'advanced_grammar': 35,
      'pronunciation_guide': 25
    };

    return defaultCosts[contentType] || 20;
  }

  private getCreationToolCost(toolType: string, features: any[]): number {
    const baseCosts = {
      'video_editor': 100,
      'audio_editor': 75,
      'quiz_builder': 50,
      'lesson_creator': 125,
      'presentation_maker': 80,
      'assessment_builder': 90
    };

    const base = baseCosts[toolType] || 50;
    const featureCost = features.length * 10; // 10 tokens per premium feature
    return base + featureCost;
  }

  private getMarketplaceCost(transactionType: string, amount: number): number {
    const fees = {
      'content_purchase': Math.max(5, amount * 0.05), // 5% fee, minimum 5 tokens
      'content_sale': Math.max(3, amount * 0.03), // 3% fee, minimum 3 tokens
      'tip_creator': 0, // No fee for tipping
      'commission_work': Math.max(10, amount * 0.1) // 10% fee, minimum 10 tokens
    };

    return Math.floor(fees[transactionType] || 0);
  }

  private getPublishingCost(contentType: string, visibility: string, features: any[]): number {
    const baseCosts = {
      'lesson': 25,
      'video': 40,
      'audio': 20,
      'quiz': 15,
      'presentation': 30,
      'assessment': 35
    };

    const visibilityMultiplier = {
      'public': 1,
      'community': 1.5,
      'premium': 2,
      'exclusive': 3
    };

    const base = baseCosts[contentType] || 20;
    const multiplier = visibilityMultiplier[visibility] || 1;
    const featureCost = features.length * 5; // 5 tokens per publishing feature

    return Math.floor(base * multiplier + featureCost);
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
