/**
 * Allowance Validator for YAP Token System
 * 
 * Validates user allowances against the token matrix configuration.
 * Ensures users can only consume features within their allocated allowances
 * and provides comprehensive validation for token-based transactions.
 * 
 * Features:
 * - Real-time allowance validation
 * - Multi-feature bulk validation
 * - Tier-specific allowance checking
 * - Custom allowance support
 * - Validation caching for performance
 * - Detailed validation error reporting
 */

import { 
  FeatureId, 
  getFeatureConfig, 
  hasUnlimitedAccess, 
  getCustomAllowance,
  PRICING_TIERS 
} from '../config/yap-token-matrix';
import { getCurrentConfig, isBetaMode } from '../config/beta-mainnet-config';

export interface ValidationContext {
  userId: string;
  tierId: string;
  userTokenBalance?: number;
  userAllowances?: { [featureId: string]: number };
  isBeta?: boolean;
  currentYAPPriceUSD?: number;
}

export interface AllowanceValidationResult {
  isValid: boolean;
  featureId: FeatureId;
  requestedQuantity: number;
  allowanceStatus: {
    hasUnlimitedAccess: boolean;
    totalAllowance: number | 'unlimited' | 'none';
    usedAllowance: number;
    remainingAllowance: number | 'unlimited';
    allowancePeriod: 'daily' | 'weekly' | 'none';
    nextResetTime?: Date;
  };
  validationErrors: string[];
  suggestions?: string[];
}

export interface TokenValidationResult {
  isValid: boolean;
  featureId: FeatureId;
  action: string;
  requestedQuantity: number;
  tokenRequirement: {
    requiredTokens: number;
    availableTokens: number;
    shortfall: number;
    costInUSD?: number;
  };
  validationErrors: string[];
  suggestions?: string[];
}

export interface BulkValidationResult {
  overallValid: boolean;
  individualResults: (AllowanceValidationResult | TokenValidationResult)[];
  totalTokensRequired: number;
  totalTokensAvailable: number;
  totalShortfall: number;
  summary: {
    passedValidations: number;
    failedValidations: number;
    warnings: string[];
  };
}

/**
 * Main allowance validator class
 */
export class AllowanceValidator {
  private context: ValidationContext;
  private validationCache: Map<string, any> = new Map();
  private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes

  constructor(context: ValidationContext) {
    this.context = context;
    this.validateContext();
  }

  /**
   * Validate allowance for a single feature usage
   */
  async validateFeatureAllowance(
    featureId: FeatureId, 
    requestedQuantity: number = 1
  ): Promise<AllowanceValidationResult> {
    const cacheKey = `allowance:${this.context.userId}:${featureId}:${requestedQuantity}`;
    
    // Check cache first
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      return cached;
    }

    const config = getFeatureConfig(featureId as string);
    if (!config) {
      return {
        isValid: false,
        featureId,
        requestedQuantity,
        allowanceStatus: {
          hasUnlimitedAccess: false,
          totalAllowance: 'none',
          usedAllowance: 0,
          remainingAllowance: 0,
          allowancePeriod: 'none'
        },
        validationErrors: [`Feature '${featureId}' not found in token matrix`],
        suggestions: ['Check if the feature ID is correct']
      };
    }

    const result: AllowanceValidationResult = {
      isValid: false,
      featureId,
      requestedQuantity,
      allowanceStatus: {
        hasUnlimitedAccess: false,
        totalAllowance: config.freeAllowance,
        usedAllowance: 0,
        remainingAllowance: 0,
        allowancePeriod: config.allowancePeriod
      },
      validationErrors: [],
      suggestions: []
    };

    try {
      // Check for unlimited access through tier
      const hasUnlimited = hasUnlimitedAccess(this.context.tierId, featureId as string);
      if (hasUnlimited) {
        result.isValid = true;
        result.allowanceStatus.hasUnlimitedAccess = true;
        result.allowanceStatus.remainingAllowance = 'unlimited';
        this.setCachedResult(cacheKey, result);
        return result;
      }

      // Check if feature has no allowance (token-only)
      if (config.freeAllowance === 'none') {
        result.isValid = false;
        result.validationErrors.push('This feature requires token payment - no free allowance available');
        if (!result.suggestions) result.suggestions = [];
        result.suggestions.push('Use token payment validation instead of allowance validation');
        this.setCachedResult(cacheKey, result);
        return result;
      }

      // Check unlimited features
      if (config.freeAllowance === 'unlimited') {
        result.isValid = true;
        result.allowanceStatus.remainingAllowance = 'unlimited';
        this.setCachedResult(cacheKey, result);
        return result;
      }

      // Handle numeric allowances
      const baseAllowance = config.freeAllowance as number;
      const customAllowance = getCustomAllowance(this.context.tierId, featureId as string);
      const totalAllowance = customAllowance !== null ? customAllowance : baseAllowance;

      result.allowanceStatus.totalAllowance = totalAllowance;

      // Get current usage
      const currentUsage = this.context.userAllowances?.[featureId as string] || 0;
      result.allowanceStatus.usedAllowance = currentUsage;

      const remainingAllowance = Math.max(0, totalAllowance - currentUsage);
      result.allowanceStatus.remainingAllowance = remainingAllowance;

      // Validate requested quantity
      if (requestedQuantity <= 0) {
        result.validationErrors.push('Requested quantity must be positive');
      } else if (requestedQuantity > remainingAllowance) {
        result.validationErrors.push(
          `Insufficient allowance: requested ${requestedQuantity}, available ${remainingAllowance}`
        );
        if (!result.suggestions) result.suggestions = [];
        result.suggestions.push(
          `You can use ${remainingAllowance} from your allowance and pay tokens for the remaining ${requestedQuantity - remainingAllowance}`
        );
      } else {
        result.isValid = true;
      }

      // Add reset time information
      if (config.allowancePeriod !== 'none') {
        result.allowanceStatus.nextResetTime = this.calculateNextResetTime(config.allowancePeriod);
      }

    } catch (error) {
      result.validationErrors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    this.setCachedResult(cacheKey, result);
    return result;
  }

  /**
   * Validate token requirement for a feature action
   */
  async validateTokenRequirement(
    featureId: FeatureId,
    action: string,
    requestedQuantity: number = 1
  ): Promise<TokenValidationResult> {
    const cacheKey = `token:${this.context.userId}:${featureId}:${action}:${requestedQuantity}`;
    
    // Check cache first
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      return cached;
    }

    const config = getFeatureConfig(featureId as string);
    if (!config) {
      return {
        isValid: false,
        featureId,
        action,
        requestedQuantity,
        tokenRequirement: {
          requiredTokens: 0,
          availableTokens: this.context.userTokenBalance || 0,
          shortfall: 0
        },
        validationErrors: [`Feature '${featureId}' not found in token matrix`]
      };
    }

    const result: TokenValidationResult = {
      isValid: false,
      featureId,
      action,
      requestedQuantity,
      tokenRequirement: {
        requiredTokens: 0,
        availableTokens: this.context.userTokenBalance || 0,
        shortfall: 0
      },
      validationErrors: [],
      suggestions: []
    };

    try {
      // Check if action exists for this feature
      const baseCost = config.tokenCosts[action];
      if (baseCost === undefined) {
        result.validationErrors.push(`Action '${action}' not available for feature '${featureId}'`);
        if (!result.suggestions) result.suggestions = [];
        result.suggestions.push(`Available actions: ${Object.keys(config.tokenCosts).join(', ')}`);
        this.setCachedResult(cacheKey, result);
        return result;
      }

      // Calculate required tokens
      let requiredTokens = baseCost * requestedQuantity;

      // Apply tier discounts
      const discount = this.getTierDiscount(this.context.tierId);
      if (discount > 0) {
        requiredTokens = Math.ceil(requiredTokens * (1 - discount / 100));
      }

      result.tokenRequirement.requiredTokens = requiredTokens;

      // Calculate cost in USD for mainnet
      if (!isBetaMode() && this.context.currentYAPPriceUSD) {
        const costInUSD = (baseCost * requestedQuantity * 0.05); // $0.05 per token point
        result.tokenRequirement.costInUSD = costInUSD;
      }

      // Check if user has sufficient tokens
      const availableTokens = this.context.userTokenBalance || 0;
      result.tokenRequirement.availableTokens = availableTokens;

      if (availableTokens >= requiredTokens) {
        result.isValid = true;
      } else {
        const shortfall = requiredTokens - availableTokens;
        result.tokenRequirement.shortfall = shortfall;
        result.validationErrors.push(
          `Insufficient tokens: required ${requiredTokens}, available ${availableTokens}, shortfall ${shortfall}`
        );
        
        if (result.tokenRequirement.costInUSD) {
          const shortfallUSD = (shortfall / requiredTokens) * result.tokenRequirement.costInUSD;
          if (!result.suggestions) result.suggestions = [];
          result.suggestions.push(`You need approximately $${shortfallUSD.toFixed(2)} worth of YAP tokens`);
        }
      }

    } catch (error) {
      result.validationErrors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    this.setCachedResult(cacheKey, result);
    return result;
  }

  /**
   * Validate multiple features/actions in bulk
   */
  async validateBulkRequirements(
    requirements: Array<{
      type: 'allowance' | 'token';
      featureId: FeatureId;
      action?: string;
      quantity?: number;
    }>
  ): Promise<BulkValidationResult> {
    const individualResults: (AllowanceValidationResult | TokenValidationResult)[] = [];
    let totalTokensRequired = 0;
    let passedValidations = 0;
    const warnings: string[] = [];

    for (const req of requirements) {
      try {
        if (req.type === 'allowance') {
          const result = await this.validateFeatureAllowance(req.featureId, req.quantity || 1);
          individualResults.push(result);
          if (result.isValid) passedValidations++;
        } else if (req.type === 'token' && req.action) {
          const result = await this.validateTokenRequirement(req.featureId, req.action, req.quantity || 1);
          individualResults.push(result);
          totalTokensRequired += result.tokenRequirement.requiredTokens;
          if (result.isValid) passedValidations++;
        }
      } catch (error) {
        warnings.push(`Failed to validate ${req.featureId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const totalTokensAvailable = this.context.userTokenBalance || 0;
    const totalShortfall = Math.max(0, totalTokensRequired - totalTokensAvailable);
    const overallValid = individualResults.every(r => r.isValid) && totalShortfall === 0;

    return {
      overallValid,
      individualResults,
      totalTokensRequired,
      totalTokensAvailable,
      totalShortfall,
      summary: {
        passedValidations,
        failedValidations: individualResults.length - passedValidations,
        warnings
      }
    };
  }

  /**
   * Check if user can afford a specific token cost
   */
  canAffordTokenCost(tokenCost: number): boolean {
    const available = this.context.userTokenBalance || 0;
    return available >= tokenCost;
  }

  /**
   * Get allowance summary for all features
   */
  async getAllowanceSummary(): Promise<{
    [featureId: string]: {
      totalAllowance: number | string;
      usedAllowance: number;
      remainingAllowance: number | string;
      allowancePeriod: string;
      hasUnlimitedAccess: boolean;
      nextResetTime?: Date;
    }
  }> {
    const summary: any = {};

    // Get all features from the token matrix
    const allFeatures = Object.keys(this.context.userAllowances || {});

    for (const featureId of allFeatures) {
      try {
        const validation = await this.validateFeatureAllowance(featureId as FeatureId, 0);
        summary[featureId] = validation.allowanceStatus;
      } catch (error) {
        console.error(`Failed to get allowance summary for ${featureId}:`, error);
      }
    }

    return summary;
  }

  /**
   * Validate context data
   */
  private validateContext(): void {
    if (!this.context.userId) {
      throw new Error('User ID is required for validation');
    }

    if (!this.context.tierId) {
      throw new Error('Tier ID is required for validation');
    }

    if (!PRICING_TIERS[this.context.tierId]) {
      throw new Error(`Invalid tier ID: ${this.context.tierId}`);
    }

    if (!isBetaMode() && (!this.context.currentYAPPriceUSD || this.context.currentYAPPriceUSD <= 0)) {
      throw new Error('Valid YAP price required for mainnet validation');
    }
  }

  /**
   * Get tier-specific discount percentage
   */
  private getTierDiscount(tierId: string): number {
    switch (tierId) {
      case 'premium':
        return 10; // 10% discount
      case 'enterprise':
        return 20; // 20% discount
      default:
        return 0;
    }
  }

  /**
   * Calculate next reset time
   */
  private calculateNextResetTime(period: 'daily' | 'weekly'): Date {
    const now = new Date();
    const nextReset = new Date();
    nextReset.setUTCHours(0, 0, 0, 0);

    if (period === 'daily') {
      if (now >= nextReset) {
        nextReset.setUTCDate(nextReset.getUTCDate() + 1);
      }
    } else if (period === 'weekly') {
      // Set to next Monday
      const daysUntilMonday = (1 + 7 - now.getUTCDay()) % 7 || 7;
      nextReset.setUTCDate(now.getUTCDate() + daysUntilMonday);
    }

    return nextReset;
  }

  /**
   * Cache management
   */
  private getCachedResult(key: string): any {
    const cached = this.validationCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }
    return null;
  }

  private setCachedResult(key: string, data: any): void {
    this.validationCache.set(key, {
      data,
      timestamp: Date.now()
    });

    // Clean up old cache entries
    if (this.validationCache.size > 100) {
      const entries = Array.from(this.validationCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Remove oldest 20 entries
      for (let i = 0; i < 20; i++) {
        this.validationCache.delete(entries[i][0]);
      }
    }
  }

  /**
   * Clear validation cache
   */
  clearCache(): void {
    this.validationCache.clear();
  }
}

/**
 * Utility functions for validation
 */
export class ValidationUtils {
  /**
   * Create validation context from user data
   */
  static createValidationContext(userData: {
    userId: string;
    tierId: string;
    tokenBalance?: number;
    allowances?: { [featureId: string]: number };
    yapPrice?: number;
  }): ValidationContext {
    return {
      userId: userData.userId,
      tierId: userData.tierId,
      userTokenBalance: userData.tokenBalance,
      userAllowances: userData.allowances,
      isBeta: isBetaMode(),
      currentYAPPriceUSD: userData.yapPrice
    };
  }

  /**
   * Format validation error messages for user display
   */
  static formatValidationErrors(errors: string[]): string {
    if (errors.length === 0) return '';
    if (errors.length === 1) return errors[0];
    
    return `Multiple validation errors:\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;
  }

  /**
   * Generate user-friendly suggestions
   */
  static generateSuggestions(result: AllowanceValidationResult | TokenValidationResult): string[] {
    const suggestions: string[] = [];

    if ('allowanceStatus' in result) {
      // Allowance validation result
      if (!result.isValid && result.allowanceStatus.remainingAllowance === 0) {
        if (result.allowanceStatus.nextResetTime) {
          suggestions.push(`Your allowance resets at ${result.allowanceStatus.nextResetTime.toLocaleString()}`);
        }
        suggestions.push('Consider upgrading your tier for more allowances');
      }
    } else {
      // Token validation result
      if (!result.isValid && result.tokenRequirement.shortfall > 0) {
        suggestions.push('Purchase more YAP tokens to complete this action');
        if (result.tokenRequirement.costInUSD) {
          suggestions.push(`Estimated cost: $${result.tokenRequirement.costInUSD.toFixed(2)}`);
        }
      }
    }

    return suggestions;
  }
}

export default AllowanceValidator;
