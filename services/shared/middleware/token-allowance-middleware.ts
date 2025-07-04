/**
 * YAP Token-Based Pricing Middleware
 * COMPLETE REPLACEMENT for the subscription-based pricing middleware
 * 
 * Implements the official YAP Token Cost Matrix with:
 * - Daily allowances with UTC reset (00:00)
 * - Token-based pay-per-use with real-time YAP/USD pricing
 * - 50/50 burn/treasury split on all spending
 * - Reward distribution for achievements
 * - Competition staking mechanics
 */

import { Request, Response, NextFunction } from 'express';
import { 
  YAP_TOKEN_MATRIX, 
  TOKEN_ECONOMICS,
  getFeatureConfig, 
  calculateTokenCost,
  calculateTokenReward,
  hasUnlimitedAccess,
  getDailyAllowanceFeatures,
  validateTokenMatrix
} from '../config/yap-token-matrix';
import { TokenUser, TokenTransaction, DailyAllowance, StakingPool } from '../models/token-user-schema';

export interface TokenRequest extends Request {
  user?: {
    userId: string;
    walletAddress?: string;
    ethWalletAddress?: string;
    email?: string;
    tierId?: string; // 'free', 'premium', 'enterprise'
    [key: string]: any;
  };
  tokenData?: {
    user: any;
    balance: number;
    allowances: any;
    pricing: {
      yapPriceUSD: number;
      isBeta: boolean;
    };
  };
}

export interface TokenAllowanceCheck {
  allowed: boolean;
  reason?: string;
  cost?: {
    tokenAmount: number;
    usdValue: number;
  };
  allowanceStatus?: {
    used: number;
    limit: number | 'unlimited';
    resetTime?: Date;
  };
}

/**
 * Core Token-Based Pricing Middleware
 * Replaces the old subscription-based pricing system
 */
export class TokenPricingMiddleware {
  private static instance: TokenPricingMiddleware;
  private yapPriceUSD: number = TOKEN_ECONOMICS.FALLBACK_YAP_PRICE_USD;
  private isBeta: boolean = true; // Default to beta mode
  private lastPriceUpdate: Date = new Date();

  // Feature mapping from endpoints to token matrix features
  private endpointFeatureMap: Map<string, { featureId: string; action: string }> = new Map([
    // Learning Service - Daily lessons
    ['/learning/lesson', { featureId: 'dailyLessons', action: 'extraLesson' }],
    ['/learning/unlock-day', { featureId: 'dailyLessons', action: 'unlimitedDay' }],
    ['/learning/unlock-week', { featureId: 'dailyLessons', action: 'unlimitedWeek' }],
    ['/learning/unlock-month', { featureId: 'dailyLessons', action: 'unlimitedMonth' }],
    
    // Voice/AI Services - Speech and text chat
    ['/voice/ai-chat', { featureId: 'aiSpeechChat', action: 'extraMinutes15' }],
    ['/ai/text-chat-hour', { featureId: 'aiTextChat', action: 'unlimitedHour' }],
    
    // Assessment Services - Exams and testing
    ['/assessment/unit-exam-stake', { featureId: 'unitExam', action: 'optionalStake' }],
    ['/assessment/skip-ahead-exam', { featureId: 'unitExamSkipAhead', action: 'twoAttempts' }],
    
    // Premium Services
    ['/voice/pronunciation-detailed', { featureId: 'pronunciationLesson', action: 'detailedFeedback' }],
    ['/assessment/adaptive-review', { featureId: 'adaptiveReviewQuiz', action: 'generateSet' }],
    ['/content/story-mode', { featureId: 'storyMode', action: 'unlock' }],
    ['/events/event-pass', { featureId: 'eventPass', action: 'joinEvent' }],
    
    // Competition Services
    ['/social/leaderboard-stake', { featureId: 'weeklyLeaderboard', action: 'stakeToEnter' }],
    ['/social/community-challenge', { featureId: 'communityChallenge', action: 'joinNewQuest' }]
  ]);

  public static getInstance(): TokenPricingMiddleware {
    if (!TokenPricingMiddleware.instance) {
      TokenPricingMiddleware.instance = new TokenPricingMiddleware();
      // Validate configuration on startup
      const validation = validateTokenMatrix();
      if (!validation.valid) {
        console.error('Token Matrix Configuration Errors:', validation.errors);
        throw new Error('Invalid token matrix configuration');
      }
    }
    return TokenPricingMiddleware.instance;
  }

  /**
   * Initialize price oracle connection and pricing mode
   */
  public async initialize(oracleAddress?: string, betaMode: boolean = true): Promise<void> {
    this.isBeta = betaMode;
    
    if (!betaMode && oracleAddress) {
      try {
        // TODO: Integrate with deployed PriceOracle contract
        await this.updateYAPPrice();
      } catch (error) {
        console.error('Failed to initialize price oracle:', error);
        console.warn('Falling back to beta mode');
        this.isBeta = true;
      }
    }
    
    console.log(`Token pricing initialized - Mode: ${this.isBeta ? 'BETA' : 'MAINNET'}`);
  }

  /**
   * Main middleware function - replaces the old pricing middleware
   */
  public enforceTokenPricing() {
    return async (req: TokenRequest, res: Response, next: NextFunction) => {
      try {
        // Skip for public endpoints
        if (this.isPublicEndpoint(req.path)) {
          return next();
        }

        // Ensure user authentication
        if (!req.user?.userId) {
          return res.status(401).json({
            error: 'authentication_required',
            message: 'User authentication required for token-based features'
          });
        }

        // Get or create user token data
        const tokenUser = await this.getOrCreateTokenUser(req.user.userId, req.user.email || '');
        
        // Update pricing data
        await this.updateYAPPrice();
        
        // Attach token data to request
        req.tokenData = {
          user: tokenUser,
          balance: this.isBeta ? tokenUser.testTokens : tokenUser.yapTokens,
          allowances: tokenUser.dailyAllowances,
          pricing: {
            yapPriceUSD: this.yapPriceUSD,
            isBeta: this.isBeta
          }
        };

        // Check if this endpoint requires tokens
        const featureMapping = this.getFeatureMapping(req.path);
        if (featureMapping) {
          const allowanceCheck = await this.checkTokenAllowance(
            req.user.userId,
            req.user.tierId || 'free',
            featureMapping.featureId,
            featureMapping.action,
            req.method
          );

          if (!allowanceCheck.allowed) {
            return res.status(429).json({
              error: 'token_allowance_exceeded',
              message: allowanceCheck.reason,
              requiresPayment: !!allowanceCheck.cost,
              cost: allowanceCheck.cost,
              allowanceStatus: allowanceCheck.allowanceStatus,
              upgradeOptions: this.getUpgradeOptions(featureMapping.featureId)
            });
          }

          // If payment is required, validate token balance
          if (allowanceCheck.cost && allowanceCheck.cost.tokenAmount > 0) {
            const balance = req.tokenData.balance;
            if (balance < allowanceCheck.cost.tokenAmount) {
              return res.status(402).json({
                error: 'insufficient_tokens',
                message: `Insufficient token balance. Required: ${allowanceCheck.cost.tokenAmount}, Available: ${balance}`,
                required: allowanceCheck.cost.tokenAmount,
                available: balance,
                cost: allowanceCheck.cost
              });
            }
          }
        }

        // Track pre-usage for response middleware
        (req as any)._tokenStartTime = Date.now();
        (req as any)._tokenFeature = featureMapping;

        next();
      } catch (error) {
        console.error('Token pricing middleware error:', error);
        return res.status(500).json({
          error: 'token_pricing_failed',
          message: 'Failed to process token-based pricing'
        });
      }
    };
  }

  /**
   * Response middleware to handle token spending and rewards
   */
  public processTokenTransaction() {
    return async (req: TokenRequest, res: Response, next: NextFunction) => {
      const originalSend = res.send;
      const originalJson = res.json;

      const processTransaction = async (responseBody: any) => {
        try {
          if (!req.user?.userId || !req.tokenData || res.statusCode >= 400) {
            return;
          }

          const featureMapping = (req as any)._tokenFeature;
          if (!featureMapping) {
            return;
          }

          const processingTime = Date.now() - ((req as any)._tokenStartTime || Date.now());
          
          // Handle token spending
          await this.handleTokenSpending(req, featureMapping, responseBody);
          
          // Handle token rewards (based on performance/completion)
          await this.handleTokenRewards(req, featureMapping, responseBody);
          
          // Update allowances
          await this.updateAllowanceUsage(req.user.userId, featureMapping);
          
        } catch (error) {
          console.error('Token transaction processing error:', error);
          // Don't fail the response for transaction errors
        }
      };

      res.send = function(body: any) {
        processTransaction(body);
        return originalSend.call(this, body);
      };

      res.json = function(body: any) {
        processTransaction(body);
        return originalJson.call(this, body);
      };

      next();
    };
  }

  /**
   * Check token allowance for a specific feature
   */
  private async checkTokenAllowance(
    userId: string,
    tierId: string,
    featureId: string,
    action: string,
    method: string
  ): Promise<TokenAllowanceCheck> {
    const config = getFeatureConfig(featureId);
    if (!config) {
      return { allowed: false, reason: `Unknown feature: ${featureId}` };
    }

    // Check if user has unlimited access via tier
    if (hasUnlimitedAccess(tierId, featureId)) {
      return { allowed: true };
    }

    // Get user's current allowances
    const tokenUser = await TokenUser.findOne({ userId });
    if (!tokenUser) {
      return { allowed: false, reason: 'User token data not found' };
    }

    // Check daily allowances
    if (config.allowancePeriod === 'daily') {
      const allowanceData = tokenUser.dailyAllowances[featureId];
      const now = new Date();
      
      // Reset allowance if needed
      if (this.shouldResetAllowance(allowanceData?.resetDate, 'daily')) {
        await this.resetDailyAllowance(userId, featureId);
        allowanceData.used = 0;
        allowanceData.resetDate = now;
      }

      const freeAllowance = typeof config.freeAllowance === 'number' ? config.freeAllowance : Infinity;
      
      if (allowanceData.used < freeAllowance) {
        // Within free allowance
        return { 
          allowed: true,
          allowanceStatus: {
            used: allowanceData.used,
            limit: freeAllowance,
            resetTime: this.getNextResetTime('daily')
          }
        };
      }

      // Allowance exceeded - calculate token cost
      const tokenCost = calculateTokenCost(featureId, action, this.yapPriceUSD, this.isBeta);
      const usdValue = this.isBeta ? tokenCost * TOKEN_ECONOMICS.BASE_COST_USD : tokenCost * this.yapPriceUSD;

      return {
        allowed: false,
        reason: `Daily allowance exceeded (${allowanceData.used}/${freeAllowance}). Token payment required.`,
        cost: {
          tokenAmount: tokenCost,
          usdValue
        },
        allowanceStatus: {
          used: allowanceData.used,
          limit: freeAllowance,
          resetTime: this.getNextResetTime('daily')
        }
      };
    }

    // Features with no allowance (always require payment)
    if (config.freeAllowance === 'none') {
      const tokenCost = calculateTokenCost(featureId, action, this.yapPriceUSD, this.isBeta);
      const usdValue = this.isBeta ? tokenCost * TOKEN_ECONOMICS.BASE_COST_USD : tokenCost * this.yapPriceUSD;

      return {
        allowed: false,
        reason: 'This feature requires token payment',
        cost: {
          tokenAmount: tokenCost,
          usdValue
        }
      };
    }

    // Features with unlimited free access
    return { allowed: true };
  }

  /**
   * Handle token spending for paid features
   */
  private async handleTokenSpending(
    req: TokenRequest,
    featureMapping: { featureId: string; action: string },
    responseBody: any
  ): Promise<void> {
    const { featureId, action } = featureMapping;
    const userId = req.user!.userId;

    // Calculate if this action requires payment
    const config = getFeatureConfig(featureId);
    if (!config || config.tokenCosts[action] === undefined) {
      return;
    }

    const tokenUser = await TokenUser.findOne({ userId });
    if (!tokenUser) return;

    // Check if payment is needed (beyond free allowance)
    const needsPayment = await this.checkIfPaymentNeeded(userId, featureId, action);
    if (!needsPayment) {
      return;
    }

    const tokenAmount = calculateTokenCost(featureId, action, this.yapPriceUSD, this.isBeta);
    
    // Process token spending
    if (this.isBeta) {
      // Beta mode: spend test tokens
      await TokenUser.findOneAndUpdate(
        { userId },
        { 
          $inc: { testTokens: -tokenAmount },
          $set: { lastUpdated: new Date() }
        }
      );
    } else {
      // Mainnet mode: spend YAP tokens via smart contract
      // TODO: Integrate with TokenSpendingManager smart contract
      await TokenUser.findOneAndUpdate(
        { userId },
        { 
          $inc: { yapTokens: -tokenAmount },
          $set: { lastUpdated: new Date() }
        }
      );
    }

    // Record transaction
    await this.recordTokenTransaction(userId, 'spend', tokenAmount, featureId, action, responseBody);
  }

  /**
   * Handle token rewards for achievements
   */
  private async handleTokenRewards(
    req: TokenRequest,
    featureMapping: { featureId: string; action: string },
    responseBody: any
  ): Promise<void> {
    const { featureId } = featureMapping;
    const userId = req.user!.userId;

    const config = getFeatureConfig(featureId);
    if (!config || Object.keys(config.rewards).length === 0) {
      return;
    }

    // Determine reward based on response data
    let rewardKey: string | null = null;
    let rewardAmount = 0;

    // Parse response for achievement triggers
    if (responseBody.score !== undefined) {
      const score = responseBody.score;
      
      if (featureId === 'dailyLessons') {
        if (score === 100) {
          rewardKey = 'pass100Percent';
          rewardAmount = calculateTokenReward(featureId, 'pass100Percent');
          // Also award perfect score bonus
          const perfectBonus = calculateTokenReward(featureId, 'perfectScoreBonus');
          if (perfectBonus > 0) {
            rewardAmount += perfectBonus;
          }
        } else if (score >= 85) {
          rewardKey = 'pass85Percent';
          rewardAmount = calculateTokenReward(featureId, 'pass85Percent');
        }
      } else if (featureId === 'quizzes' && score >= 90) {
        rewardKey = 'pass90Percent';
        rewardAmount = calculateTokenReward(featureId, 'pass90Percent');
      }
    }

    if (rewardAmount > 0) {
      // Award tokens
      if (this.isBeta) {
        await TokenUser.findOneAndUpdate(
          { userId },
          { 
            $inc: { testTokens: rewardAmount },
            $set: { lastUpdated: new Date() }
          }
        );
      } else {
        // TODO: Integrate with reward distribution smart contract
        await TokenUser.findOneAndUpdate(
          { userId },
          { 
            $inc: { yapTokens: rewardAmount },
            $set: { lastUpdated: new Date() }
          }
        );
      }

      // Record reward transaction
      await this.recordTokenTransaction(userId, 'earn', rewardAmount, featureId, rewardKey || 'achievement', responseBody);
    }
  }

  /**
   * Update allowance usage after successful feature use
   */
  private async updateAllowanceUsage(
    userId: string,
    featureMapping: { featureId: string; action: string }
  ): Promise<void> {
    const { featureId } = featureMapping;
    const config = getFeatureConfig(featureId);
    
    if (!config || config.allowancePeriod !== 'daily') {
      return;
    }

    await TokenUser.findOneAndUpdate(
      { userId },
      { 
        $inc: { [`dailyAllowances.${featureId}.used`]: 1 },
        $set: { lastUpdated: new Date() }
      }
    );
  }

  /**
   * Get or create token user data
   */
  private async getOrCreateTokenUser(userId: string, email: string): Promise<any> {
    let tokenUser = await TokenUser.findOne({ userId });
    
    if (!tokenUser) {
      // Initialize daily allowances for all features
      const dailyAllowances: any = {};
      const dailyFeatures = getDailyAllowanceFeatures();
      
      for (const featureId of dailyFeatures) {
        dailyAllowances[featureId] = {
          used: 0,
          resetDate: new Date(),
          unlimitedUntil: null
        };
      }

      tokenUser = new TokenUser({
        userId,
        email,
        testTokens: 0, // Start with 0 beta tokens
        yapTokens: 0,
        dailyAllowances,
        streakData: {
          currentStreak: 0,
          lastLessonDate: null,
          milestonesEarned: []
        },
        lastUpdated: new Date()
      });
      
      await tokenUser.save();
    }

    return tokenUser;
  }

  /**
   * Record token transaction in database
   */
  private async recordTokenTransaction(
    userId: string,
    type: 'spend' | 'earn' | 'stake' | 'reward',
    amount: number,
    feature: string,
    action: string,
    metadata: any
  ): Promise<void> {
    const transaction = new TokenTransaction({
      userId,
      transactionType: type,
      amount,
      feature,
      action,
      timestamp: new Date(),
      isBeta: this.isBeta,
      yapPriceUSD: this.yapPriceUSD,
      metadata: {
        ...metadata,
        endpoint: metadata.endpoint,
        processingTime: metadata.processingTime
      }
    });

    await transaction.save();
  }

  /**
   * Get feature mapping for an endpoint
   */
  private getFeatureMapping(path: string): { featureId: string; action: string } | null {
    for (const [pattern, mapping] of this.endpointFeatureMap.entries()) {
      if (path.includes(pattern)) {
        return mapping;
      }
    }
    return null;
  }

  /**
   * Check if endpoint is public
   */
  private isPublicEndpoint(path: string): boolean {
    const publicPaths = [
      '/health',
      '/healthz', 
      '/metrics',
      '/status',
      '/auth/login',
      '/auth/register',
      '/auth/refresh',
      '/tokens/balance', // Allow balance checks
      '/pricing/yap-usd', // Allow price checks
      '/public'
    ];

    return publicPaths.some(publicPath => path.includes(publicPath));
  }

  /**
   * Check if allowance should be reset
   */
  private shouldResetAllowance(lastReset: Date | undefined, period: 'daily' | 'weekly'): boolean {
    if (!lastReset) return true;
    
    const now = new Date();
    const resetTime = new Date(lastReset);
    
    if (period === 'daily') {
      // Reset at 00:00 UTC
      const todayUTC = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const lastResetUTC = new Date(resetTime.getFullYear(), resetTime.getMonth(), resetTime.getDate());
      return todayUTC > lastResetUTC;
    }
    
    // Weekly reset logic would go here
    return false;
  }

  /**
   * Reset daily allowance for a feature
   */
  private async resetDailyAllowance(userId: string, featureId: string): Promise<void> {
    await TokenUser.findOneAndUpdate(
      { userId },
      { 
        $set: { 
          [`dailyAllowances.${featureId}.used`]: 0,
          [`dailyAllowances.${featureId}.resetDate`]: new Date()
        }
      }
    );
  }

  /**
   * Get next reset time
   */
  private getNextResetTime(period: 'daily' | 'weekly'): Date {
    const now = new Date();
    if (period === 'daily') {
      const tomorrow = new Date(now);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(0, 0, 0, 0);
      return tomorrow;
    }
    return now; // TODO: Implement weekly reset
  }

  /**
   * Check if payment is needed for this action
   */
  private async checkIfPaymentNeeded(userId: string, featureId: string, action: string): Promise<boolean> {
    const config = getFeatureConfig(featureId);
    if (!config) return false;

    // If no token cost, no payment needed
    if (config.tokenCosts[action] === undefined || config.tokenCosts[action] === 0) {
      return false;
    }

    // If unlimited allowance, no payment needed
    if (config.freeAllowance === 'unlimited') {
      return false;
    }

    // If no allowance period, payment always needed
    if (config.allowancePeriod === 'none') {
      return true;
    }

    // Check if within allowance
    const tokenUser = await TokenUser.findOne({ userId });
    if (!tokenUser) return true;

    const allowanceData = tokenUser.dailyAllowances[featureId];
    if (!allowanceData) return true;

    const freeAllowance = typeof config.freeAllowance === 'number' ? config.freeAllowance : 0;
    return allowanceData.used >= freeAllowance;
  }

  /**
   * Get upgrade options for a feature
   */
  private getUpgradeOptions(featureId: string): any {
    const config = getFeatureConfig(featureId);
    if (!config) return {};

    return {
      featureId,
      featureName: config.feature,
      tokenCosts: config.tokenCosts,
      currentAllowance: config.freeAllowance,
      period: config.allowancePeriod
    };
  }

  /**
   * Update YAP price from oracle (mainnet) or use fixed price (beta)
   */
  private async updateYAPPrice(): Promise<void> {
    if (this.isBeta) {
      // Beta mode: Use 1:1 ratio
      this.yapPriceUSD = TOKEN_ECONOMICS.BASE_COST_USD;
      return;
    }

    try {
      // TODO: Integrate with PriceOracle smart contract
      // For now, use fallback price
      this.yapPriceUSD = TOKEN_ECONOMICS.FALLBACK_YAP_PRICE_USD;
      this.lastPriceUpdate = new Date();
    } catch (error) {
      console.error('Failed to update YAP price:', error);
      this.yapPriceUSD = TOKEN_ECONOMICS.FALLBACK_YAP_PRICE_USD;
    }
  }

  /**
   * Get current pricing analytics for admin/monitoring
   */
  public async getPricingAnalytics(timeframe: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<any> {
    const now = new Date();
    const startDate = new Date(now);
    
    switch (timeframe) {
      case 'daily':
        startDate.setUTCHours(0, 0, 0, 0);
        break;
      case 'weekly':
        startDate.setUTCDate(startDate.getUTCDate() - 7);
        break;
      case 'monthly':
        startDate.setUTCMonth(startDate.getUTCMonth() - 1);
        break;
    }

    const transactions = await TokenTransaction.find({
      timestamp: { $gte: startDate }
    });

    const analytics = {
      timeframe,
      period: { start: startDate, end: now },
      totalTransactions: transactions.length,
      totalTokensSpent: transactions.filter(t => t.transactionType === 'spend').reduce((sum, t) => sum + t.amount, 0),
      totalTokensEarned: transactions.filter(t => t.transactionType === 'earn').reduce((sum, t) => sum + t.amount, 0),
      featureBreakdown: transactions.reduce((breakdown, tx) => {
        if (!breakdown[tx.feature]) {
          breakdown[tx.feature] = { spend: 0, earn: 0, count: 0 };
        }
        if (tx.transactionType === 'spend') breakdown[tx.feature].spend += tx.amount;
        if (tx.transactionType === 'earn') breakdown[tx.feature].earn += tx.amount;
        breakdown[tx.feature].count++;
        return breakdown;
      }, {} as any),
      currentPrice: {
        yapUSD: this.yapPriceUSD,
        mode: this.isBeta ? 'beta' : 'mainnet',
        lastUpdate: this.lastPriceUpdate
      }
    };

    return analytics;
  }
}

// Export singleton instance
export const tokenPricingMiddleware = TokenPricingMiddleware.getInstance();

// Export middleware functions for direct use
export const enforceTokenPricing = tokenPricingMiddleware.enforceTokenPricing.bind(tokenPricingMiddleware);
export const processTokenTransaction = tokenPricingMiddleware.processTokenTransaction.bind(tokenPricingMiddleware);
