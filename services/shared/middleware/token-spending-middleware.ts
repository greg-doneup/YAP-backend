/**
 * Token Spending Middleware for YAP Token System
 * 
 * Handles token-based transactions and spending logic for the YAP platform.
 * Integrates with the pricing calculator and allowance validator to ensure
 * proper token deduction and spending limits.
 * 
 * Features:
 * - Automatic token spending for paid features
 * - Pre-transaction validation and authorization
 * - Transaction history tracking
 * - Spending limits enforcement
 * - Burn/treasury distribution
 * - Error handling and rollback support
 * - Real-time balance updates
 */

import { FeatureId } from '../config/yap-token-matrix';
import { getCurrentConfig, getTransactionLimits } from '../config/beta-mainnet-config';
import { PricingCalculator, PricingContext } from '../services/pricing-calculator';
import { AllowanceValidator, ValidationContext } from '../validators/allowance-validator';

// Request/response types for middleware
export interface AuthenticatedRequest {
  user?: {
    id: string;
    tierId: string;
    tokenBalance: number;
    allowances: { [featureId: string]: number };
    [key: string]: any;
  };
  body?: {
    featureId?: FeatureId;
    action?: string;
    quantity?: number;
    [key: string]: any;
  };
  query?: {
    [key: string]: string;
  };
  params?: {
    [key: string]: string;
  };
  [key: string]: any;
}

export interface MiddlewareResponse {
  status: (code: number) => MiddlewareResponse;
  json: (data: any) => MiddlewareResponse;
  [key: string]: any;
}

export type NextFunction = (error?: any) => void;

export interface TokenTransaction {
  id: string;
  userId: string;
  featureId: FeatureId;
  action: string;
  quantity: number;
  tokenAmount: number;
  costUSD?: number;
  transactionType: 'spend' | 'reward' | 'refund';
  status: 'pending' | 'completed' | 'failed' | 'rolled_back';
  metadata: {
    tierId: string;
    discountApplied?: number;
    allowanceUsed?: number;
    burnAmount?: number;
    treasuryAmount?: number;
    originalTransactionId?: string;
  };
  timestamp: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export interface SpendingResult {
  success: boolean;
  transactionId: string;
  tokensSpent: number;
  costUSD?: number;
  allowanceUsed: number;
  newBalance: number;
  burnAmount?: number;
  treasuryAmount?: number;
  errorMessage?: string;
}

/**
 * Token Spending Service
 */
export class TokenSpendingService {
  private static instance: TokenSpendingService;
  private pendingTransactions: Map<string, TokenTransaction> = new Map();

  private constructor() {}

  static getInstance(): TokenSpendingService {
    if (!TokenSpendingService.instance) {
      TokenSpendingService.instance = new TokenSpendingService();
    }
    return TokenSpendingService.instance;
  }

  /**
   * Process a token spending transaction
   */
  async processSpending(
    userId: string,
    featureId: FeatureId,
    action: string,
    quantity: number = 1,
    userContext: {
      tierId: string;
      tokenBalance: number;
      allowances: { [featureId: string]: number };
      yapPrice?: number;
    }
  ): Promise<SpendingResult> {
    const transactionId = this.generateTransactionId();
    
    try {
      // Create pricing context
      const pricingContext: PricingContext = {
        userId,
        tierId: userContext.tierId,
        isBeta: getCurrentConfig().environment === 'beta',
        currentYAPPriceUSD: userContext.yapPrice,
        userAllowances: userContext.allowances,
        userTokenBalance: userContext.tokenBalance
      };

      // Calculate costs and validate
      const pricingCalculator = new PricingCalculator(pricingContext);
      const costCalculation = await pricingCalculator.calculateCost(featureId, action, quantity);

      // Create validation context
      const validationContext: ValidationContext = {
        userId,
        tierId: userContext.tierId,
        userTokenBalance: userContext.tokenBalance,
        userAllowances: userContext.allowances,
        isBeta: pricingContext.isBeta,
        currentYAPPriceUSD: userContext.yapPrice
      };

      // Validate allowances first
      const allowanceValidator = new AllowanceValidator(validationContext);
      const allowanceValidation = await allowanceValidator.validateFeatureAllowance(featureId, quantity);

      let tokensToSpend = 0;
      let allowanceUsed = 0;
      let quantityAfterAllowance = quantity;

      // Use allowance first if available
      if (allowanceValidation.isValid && allowanceValidation.allowanceStatus.remainingAllowance !== 'unlimited') {
        const remainingAllowance = allowanceValidation.allowanceStatus.remainingAllowance as number;
        allowanceUsed = Math.min(quantity, remainingAllowance);
        quantityAfterAllowance = quantity - allowanceUsed;
      } else if (allowanceValidation.allowanceStatus.hasUnlimitedAccess) {
        // Unlimited access - no tokens needed
        return {
          success: true,
          transactionId,
          tokensSpent: 0,
          allowanceUsed: quantity,
          newBalance: userContext.tokenBalance,
          costUSD: 0
        };
      }

      // Calculate token cost for remaining quantity
      if (quantityAfterAllowance > 0) {
        const tokenCostCalculation = await pricingCalculator.calculateCost(featureId, action, quantityAfterAllowance);
        tokensToSpend = tokenCostCalculation.finalCost;

        // Validate token payment
        const tokenValidation = await allowanceValidator.validateTokenRequirement(featureId, action, quantityAfterAllowance);
        if (!tokenValidation.isValid) {
          return {
            success: false,
            transactionId,
            tokensSpent: 0,
            allowanceUsed: 0,
            newBalance: userContext.tokenBalance,
            errorMessage: tokenValidation.validationErrors.join('; ')
          };
        }
      }

      // Check spending limits
      const limits = getTransactionLimits();
      if (tokensToSpend > limits.maxTokensPerTransaction) {
        return {
          success: false,
          transactionId,
          tokensSpent: 0,
          allowanceUsed: 0,
          newBalance: userContext.tokenBalance,
          errorMessage: `Transaction exceeds maximum limit of ${limits.maxTokensPerTransaction} tokens`
        };
      }

      // Create transaction record
      const transaction: TokenTransaction = {
        id: transactionId,
        userId,
        featureId,
        action,
        quantity,
        tokenAmount: tokensToSpend,
        costUSD: costCalculation.costInUSD,
        transactionType: 'spend',
        status: 'pending',
        metadata: {
          tierId: userContext.tierId,
          discountApplied: costCalculation.discountApplied,
          allowanceUsed
        },
        timestamp: new Date()
      };

      this.pendingTransactions.set(transactionId, transaction);

      // Calculate burn and treasury amounts
      let burnAmount = 0;
      let treasuryAmount = 0;
      
      if (tokensToSpend > 0 && getCurrentConfig().features.burnMechanism) {
        const distribution = this.calculateTokenDistribution(tokensToSpend);
        burnAmount = distribution.burned;
        treasuryAmount = distribution.treasury;
        
        transaction.metadata.burnAmount = burnAmount;
        transaction.metadata.treasuryAmount = treasuryAmount;
      }

      // Execute the spending
      const newBalance = userContext.tokenBalance - tokensToSpend;
      
      // Update transaction status
      transaction.status = 'completed';
      transaction.completedAt = new Date();

      // Save transaction and update balances
      await this.saveTransaction(transaction);
      await this.updateUserBalance(userId, newBalance);
      await this.updateUserAllowance(userId, featureId, allowanceUsed);

      // Remove from pending
      this.pendingTransactions.delete(transactionId);

      return {
        success: true,
        transactionId,
        tokensSpent: tokensToSpend,
        costUSD: costCalculation.costInUSD,
        allowanceUsed,
        newBalance,
        burnAmount,
        treasuryAmount
      };

    } catch (error) {
      // Handle transaction failure
      const transaction = this.pendingTransactions.get(transactionId);
      if (transaction) {
        transaction.status = 'failed';
        transaction.errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.saveTransaction(transaction);
      }

      this.pendingTransactions.delete(transactionId);

      return {
        success: false,
        transactionId,
        tokensSpent: 0,
        allowanceUsed: 0,
        newBalance: userContext.tokenBalance,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process a token reward transaction
   */
  async processReward(
    userId: string,
    featureId: FeatureId,
    achievement: string,
    userContext: {
      tierId: string;
      tokenBalance: number;
    }
  ): Promise<SpendingResult> {
    const transactionId = this.generateTransactionId();

    try {
      const pricingContext: PricingContext = {
        userId,
        tierId: userContext.tierId,
        isBeta: getCurrentConfig().environment === 'beta',
        userTokenBalance: userContext.tokenBalance
      };

      const pricingCalculator = new PricingCalculator(pricingContext);
      const rewardCalculation = await pricingCalculator.calculateReward(featureId, achievement);

      // Check reward limits
      const limits = getTransactionLimits();
      if (rewardCalculation.finalReward > limits.maxRewardClaim) {
        return {
          success: false,
          transactionId,
          tokensSpent: 0,
          allowanceUsed: 0,
          newBalance: userContext.tokenBalance,
          errorMessage: `Reward exceeds maximum limit of ${limits.maxRewardClaim} tokens`
        };
      }

      // Create reward transaction
      const transaction: TokenTransaction = {
        id: transactionId,
        userId,
        featureId,
        action: achievement,
        quantity: 1,
        tokenAmount: rewardCalculation.finalReward,
        transactionType: 'reward',
        status: 'pending',
        metadata: {
          tierId: userContext.tierId
        },
        timestamp: new Date()
      };

      this.pendingTransactions.set(transactionId, transaction);

      // Execute the reward
      const newBalance = userContext.tokenBalance + rewardCalculation.finalReward;
      
      // Update transaction status
      transaction.status = 'completed';
      transaction.completedAt = new Date();

      // Save transaction and update balance
      await this.saveTransaction(transaction);
      await this.updateUserBalance(userId, newBalance);

      // Remove from pending
      this.pendingTransactions.delete(transactionId);

      return {
        success: true,
        transactionId,
        tokensSpent: -rewardCalculation.finalReward, // Negative for reward
        allowanceUsed: 0,
        newBalance
      };

    } catch (error) {
      const transaction = this.pendingTransactions.get(transactionId);
      if (transaction) {
        transaction.status = 'failed';
        transaction.errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.saveTransaction(transaction);
      }

      this.pendingTransactions.delete(transactionId);

      return {
        success: false,
        transactionId,
        tokensSpent: 0,
        allowanceUsed: 0,
        newBalance: userContext.tokenBalance,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Rollback a transaction
   */
  async rollbackTransaction(transactionId: string): Promise<boolean> {
    try {
      const transaction = await this.getTransaction(transactionId);
      if (!transaction || transaction.status !== 'completed') {
        return false;
      }

      // Create rollback transaction
      const rollbackTransaction: TokenTransaction = {
        id: this.generateTransactionId(),
        userId: transaction.userId,
        featureId: transaction.featureId,
        action: `rollback_${transaction.action}`,
        quantity: transaction.quantity,
        tokenAmount: -transaction.tokenAmount, // Reverse the amount
        transactionType: 'refund',
        status: 'completed',
        metadata: {
          tierId: transaction.metadata.tierId,
          originalTransactionId: transactionId
        },
        timestamp: new Date(),
        completedAt: new Date()
      };

      // Get current balance and update
      const currentBalance = await this.getUserBalance(transaction.userId);
      const newBalance = currentBalance + Math.abs(transaction.tokenAmount);

      // Save rollback transaction and update balance
      await this.saveTransaction(rollbackTransaction);
      await this.updateUserBalance(transaction.userId, newBalance);

      // Mark original transaction as rolled back
      transaction.status = 'rolled_back';
      await this.saveTransaction(transaction);

      return true;
    } catch (error) {
      console.error('Rollback failed:', error);
      return false;
    }
  }

  /**
   * Get user transaction history
   */
  async getTransactionHistory(
    userId: string, 
    limit: number = 50, 
    offset: number = 0
  ): Promise<TokenTransaction[]> {
    // In real implementation, this would query the database
    return [];
  }

  /**
   * Get pending transactions for a user
   */
  getPendingTransactions(userId: string): TokenTransaction[] {
    return Array.from(this.pendingTransactions.values())
      .filter(t => t.userId === userId);
  }

  /**
   * Private helper methods
   */
  private generateTransactionId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateTokenDistribution(tokenAmount: number): { burned: number; treasury: number } {
    const config = getCurrentConfig();
    // Using 50/50 split as per TOKEN_ECONOMICS
    const burned = Math.floor(tokenAmount * 0.5);
    const treasury = tokenAmount - burned;
    return { burned, treasury };
  }

  // Database operations (placeholders - would be implemented with actual database)
  private async saveTransaction(transaction: TokenTransaction): Promise<void> {
    // Save to database
    console.log('Saving transaction:', transaction.id);
  }

  private async getTransaction(transactionId: string): Promise<TokenTransaction | null> {
    // Get from database
    return null;
  }

  private async updateUserBalance(userId: string, newBalance: number): Promise<void> {
    // Update user balance in database
    console.log(`Updating balance for user ${userId}: ${newBalance}`);
  }

  private async updateUserAllowance(userId: string, featureId: FeatureId, used: number): Promise<void> {
    // Update user allowance in database
    console.log(`Updating allowance for user ${userId}, feature ${featureId}: +${used}`);
  }

  private async getUserBalance(userId: string): Promise<number> {
    // Get user balance from database
    return 0;
  }
}

/**
 * Express middleware for token spending
 */
export function tokenSpendingMiddleware(options: {
  featureIdField?: string;
  actionField?: string;
  quantityField?: string;
  autoSpend?: boolean;
} = {}) {
  const {
    featureIdField = 'featureId',
    actionField = 'action',
    quantityField = 'quantity',
    autoSpend = false
  } = options;

  return async (req: AuthenticatedRequest, res: MiddlewareResponse, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const featureId = req.body?.[featureIdField] || req.query?.[featureIdField] || req.params?.[featureIdField];
      const action = req.body?.[actionField] || req.query?.[actionField] || req.params?.[actionField];
      const quantity = parseInt(req.body?.[quantityField] || req.query?.[quantityField] || '1');

      if (!featureId || !action) {
        if (autoSpend) {
          return res.status(400).json({ 
            error: 'Feature ID and action are required for token spending',
            required: { featureId, action }
          });
        } else {
          // If not auto-spending, just continue
          return next();
        }
      }

      const spendingService = TokenSpendingService.getInstance();
      
      if (autoSpend) {
        // Automatically process the spending
        const result = await spendingService.processSpending(
          req.user.id,
          featureId as FeatureId,
          action,
          quantity,
          {
            tierId: req.user.tierId,
            tokenBalance: req.user.tokenBalance,
            allowances: req.user.allowances
          }
        );

        if (!result.success) {
          return res.status(402).json({ 
            error: 'Payment required',
            message: result.errorMessage,
            tokenInfo: {
              required: result.tokensSpent,
              available: req.user.tokenBalance
            }
          });
        }

        // Attach spending result to request for downstream use
        req.spendingResult = result;
        
        // Update user context with new balance
        req.user.tokenBalance = result.newBalance;
      } else {
        // Just validate without spending
        const pricingContext: PricingContext = {
          userId: req.user.id,
          tierId: req.user.tierId,
          isBeta: getCurrentConfig().environment === 'beta',
          userAllowances: req.user.allowances,
          userTokenBalance: req.user.tokenBalance
        };

        const pricingCalculator = new PricingCalculator(pricingContext);
        const costCalculation = await pricingCalculator.calculateCost(featureId as FeatureId, action, quantity);

        // Attach cost calculation to request
        req.costCalculation = costCalculation;
      }

      next();
    } catch (error) {
      console.error('Token spending middleware error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
}

/**
 * Middleware for token rewards
 */
export function tokenRewardMiddleware(options: {
  featureIdField?: string;
  achievementField?: string;
  autoReward?: boolean;
} = {}) {
  const {
    featureIdField = 'featureId',
    achievementField = 'achievement',
    autoReward = false
  } = options;

  return async (req: AuthenticatedRequest, res: MiddlewareResponse, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(); // No user, skip rewards
      }

      const featureId = req.body?.[featureIdField] || req.query?.[featureIdField] || req.params?.[featureIdField];
      const achievement = req.body?.[achievementField] || req.query?.[achievementField] || req.params?.[achievementField];

      if (!featureId || !achievement) {
        return next(); // No feature/achievement specified, continue
      }

      const spendingService = TokenSpendingService.getInstance();

      if (autoReward) {
        // Automatically process the reward
        const result = await spendingService.processReward(
          req.user.id,
          featureId as FeatureId,
          achievement,
          {
            tierId: req.user.tierId,
            tokenBalance: req.user.tokenBalance
          }
        );

        if (result.success) {
          // Attach reward result to request
          req.rewardResult = result;
          
          // Update user context with new balance
          req.user.tokenBalance = result.newBalance;
        } else {
          console.error('Reward processing failed:', result.errorMessage);
        }
      }

      next();
    } catch (error) {
      console.error('Token reward middleware error:', error);
      // Don't block the request for reward errors
      next();
    }
  };
}

/**
 * Utility functions
 */
export class SpendingUtils {
  /**
   * Format spending result for API response
   */
  static formatSpendingResult(result: SpendingResult): any {
    return {
      success: result.success,
      transaction: {
        id: result.transactionId,
        tokensSpent: result.tokensSpent,
        costUSD: result.costUSD,
        allowanceUsed: result.allowanceUsed
      },
      balance: {
        new: result.newBalance,
        spent: result.tokensSpent
      },
      distribution: result.burnAmount ? {
        burned: result.burnAmount,
        treasury: result.treasuryAmount
      } : undefined,
      error: result.errorMessage
    };
  }

  /**
   * Calculate daily spending for a user
   */
  static async calculateDailySpending(userId: string): Promise<number> {
    // In real implementation, this would query transactions from the last 24 hours
    return 0;
  }

  /**
   * Check if user is within spending limits
   */
  static async checkSpendingLimits(userId: string, additionalSpend: number): Promise<{
    withinLimits: boolean;
    dailySpent: number;
    dailyLimit: number;
    remaining: number;
  }> {
    const limits = getTransactionLimits();
    const dailySpent = await this.calculateDailySpending(userId);
    const totalSpend = dailySpent + additionalSpend;
    
    return {
      withinLimits: totalSpend <= limits.maxDailySpend,
      dailySpent,
      dailyLimit: limits.maxDailySpend,
      remaining: Math.max(0, limits.maxDailySpend - totalSpend)
    };
  }
}

export default {
  TokenSpendingService,
  tokenSpendingMiddleware,
  tokenRewardMiddleware,
  SpendingUtils,
};
