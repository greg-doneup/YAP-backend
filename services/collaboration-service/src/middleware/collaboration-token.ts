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

export class CollaborationTokenMiddleware {
  private redisClient: RedisClient;

  constructor(redisClient: RedisClient) {
    this.redisClient = redisClient;
  }

  // Validate group creation
  async validateGroupCreation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { groupType, isPrivate } = req.body || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const tokenCost = this.getGroupCreationCost(groupType, isPrivate);
      const userBalance = await this.getUserTokenBalance(userId);

      if (userBalance < tokenCost) {
        res.status(402).json({ 
          error: 'Insufficient tokens for group creation',
          required: tokenCost,
          available: userBalance
        });
        return;
      }

      req.tokenTransaction = {
        amount: tokenCost,
        type: 'group_creation',
        metadata: { groupType, isPrivate, userId }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Group creation validation failed' });
    }
  }

  // Validate study session hosting
  async validateSessionHosting(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { sessionType, maxParticipants, duration } = req.body || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const tokenCost = this.getSessionHostingCost(sessionType, maxParticipants, duration);
      const userBalance = await this.getUserTokenBalance(userId);

      if (userBalance < tokenCost) {
        res.status(402).json({ 
          error: 'Insufficient tokens for session hosting',
          required: tokenCost,
          available: userBalance
        });
        return;
      }

      req.tokenTransaction = {
        amount: tokenCost,
        type: 'session_hosting',
        metadata: { sessionType, maxParticipants, duration, userId }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Session hosting validation failed' });
    }
  }

  // Validate premium collaboration features
  async validatePremiumFeatures(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { featureType, options } = req.body || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const tokenCost = this.getPremiumFeatureCost(featureType, options);
      const userBalance = await this.getUserTokenBalance(userId);

      if (userBalance < tokenCost) {
        res.status(402).json({ 
          error: 'Insufficient tokens for premium features',
          required: tokenCost,
          available: userBalance
        });
        return;
      }

      req.tokenTransaction = {
        amount: tokenCost,
        type: 'premium_collaboration',
        metadata: { featureType, options, userId }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Premium feature validation failed' });
    }
  }

  // Validate mentorship access
  async validateMentorshipAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const { mentorshipType, duration } = req.body || {};

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const tokenCost = this.getMentorshipCost(mentorshipType, duration);
      const userBalance = await this.getUserTokenBalance(userId);

      if (userBalance < tokenCost) {
        res.status(402).json({ 
          error: 'Insufficient tokens for mentorship access',
          required: tokenCost,
          available: userBalance
        });
        return;
      }

      req.tokenTransaction = {
        amount: tokenCost,
        type: 'mentorship_access',
        metadata: { mentorshipType, duration, userId }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Mentorship validation failed' });
    }
  }

  // Validate basic collaboration access (free features)
  async validateBasicAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Basic features are free, just log the access
      req.tokenTransaction = {
        amount: 0,
        type: 'basic_collaboration',
        metadata: { userId, access: 'free_tier' }
      };

      next();
    } catch (error) {
      res.status(500).json({ error: 'Basic access validation failed' });
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
  private getGroupCreationCost(groupType: string, isPrivate: boolean): number {
    const baseCosts = {
      'study': 25,
      'practice': 20,
      'conversation': 30,
      'project': 40
    };
    
    const base = baseCosts[groupType] || 25;
    const privacy = isPrivate ? base * 0.5 : 0; // 50% extra for private groups
    return base + privacy;
  }

  private getSessionHostingCost(sessionType: string, maxParticipants: number, duration: number): number {
    const baseCosts = {
      'tutoring': 50,
      'group_study': 30,
      'conversation_practice': 25,
      'pronunciation': 35
    };
    
    const base = baseCosts[sessionType] || 30;
    const participantMultiplier = Math.max(1, Math.floor(maxParticipants / 5)); // Cost increases every 5 participants
    const durationMultiplier = Math.max(1, Math.floor(duration / 60)); // Cost increases every hour
    
    return base * participantMultiplier * durationMultiplier;
  }

  private getPremiumFeatureCost(featureType: string, options: any): number {
    const costs = {
      'screen_sharing': 15,
      'recording': 25,
      'advanced_chat': 10,
      'file_sharing': 20,
      'whiteboard': 30
    };
    
    const base = costs[featureType] || 15;
    const premium = options?.premium ? base * 2 : 0;
    return base + premium;
  }

  private getMentorshipCost(mentorshipType: string, duration: number): number {
    const hourlyRates = {
      'basic': 100,
      'advanced': 150,
      'expert': 200,
      'native_speaker': 250
    };
    
    const hourlyRate = hourlyRates[mentorshipType] || 100;
    const hours = Math.max(1, Math.floor(duration / 60));
    return hourlyRate * hours;
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
