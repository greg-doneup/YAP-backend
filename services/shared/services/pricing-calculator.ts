/**
 * YAP Token Pricing Calculator Service
 * 
 * Centralized service for calculating token costs, managing allowances,
 * and handling pricing logic based on the YAP Token Cost Matrix.
 * 
 * Features:
 * - Calculate exact token costs for features and actions
 * - Handle daily/weekly allowance tracking
 * - Support beta (points) vs mainnet (YAP tokens) modes
 * - Real-time pricing based on oracle data
 * - Bulk cost calculations for complex operations
 */

import { 
  FeatureId, 
  YAP_TOKEN_MATRIX, 
  TOKEN_ECONOMICS,
  PRICING_TIERS,
  calculateTokenCost,
  calculateTokenReward,
  hasUnlimitedAccess,
  getCustomAllowance,
  getFeatureConfig
} from '../config/yap-token-matrix';

export interface PricingContext {
  userId: string;
  tierId: string; // free, premium, enterprise
  isBeta: boolean;
  currentYAPPriceUSD?: number;
  userAllowances?: { [featureId: string]: number };
  userTokenBalance?: number;
}

export interface CostCalculation {
  featureId: FeatureId;
  action: string;
  baseCost: number; // Token points from matrix
  finalCost: number; // Actual tokens needed (after discounts, etc.)
  costInUSD?: number; // USD equivalent (mainnet only)
  allowanceUsed: boolean;
  allowanceRemaining?: number;
  unlimitedAccess: boolean;
  discountApplied?: number; // Percentage discount
  reason?: string; // Explanation of pricing decision
}

export interface BulkCostCalculation {
  totalCost: number;
  totalCostUSD?: number;
  calculations: CostCalculation[];
  canAfford: boolean;
  shortfall?: number; // How many tokens short if insufficient balance
}

export interface RewardCalculation {
  featureId: FeatureId;
  achievement: string;
  baseReward: number | 'dynamic';
  finalReward: number;
  bonusMultiplier?: number;
  reason?: string;
}

/**
 * Main pricing calculator service
 */
export class PricingCalculator {
  private context: PricingContext;

  constructor(context: PricingContext) {
    this.context = context;
  }

  /**
   * Calculate cost for a single feature action
   */
  async calculateCost(
    featureId: FeatureId, 
    action: string, 
    quantity: number = 1
  ): Promise<CostCalculation> {
    const config = getFeatureConfig(featureId as string);
    if (!config) {
      throw new Error(`Unknown feature: ${featureId}`);
    }

    // Check for unlimited access first
    const hasUnlimited = hasUnlimitedAccess(this.context.tierId, featureId as string);
    if (hasUnlimited) {
      return {
        featureId,
        action,
        baseCost: 0,
        finalCost: 0,
        costInUSD: 0,
        allowanceUsed: false,
        unlimitedAccess: true,
        reason: `Unlimited access via ${this.context.tierId} tier`
      };
    }

    // Get base cost from matrix
    const baseCost = config.tokenCosts[action];
    if (baseCost === undefined) {
      throw new Error(`Unknown action '${action}' for feature '${featureId}'`);
    }

    // Check allowances
    const allowanceInfo = await this.checkAllowance(featureId, quantity);
    
    // If allowance covers the request
    if (allowanceInfo.covers) {
      return {
        featureId,
        action,
        baseCost: baseCost * quantity,
        finalCost: 0,
        costInUSD: 0,
        allowanceUsed: true,
        allowanceRemaining: allowanceInfo.remaining,
        unlimitedAccess: false,
        reason: 'Covered by daily/weekly allowance'
      };
    }

    // Calculate actual token cost
    let finalCost: number;
    let costInUSD: number | undefined;

    if (this.context.isBeta) {
      // Beta mode: direct token points
      finalCost = baseCost * quantity;
    } else {
      // Mainnet mode: convert to YAP tokens
      if (!this.context.currentYAPPriceUSD || this.context.currentYAPPriceUSD <= 0) {
        throw new Error('Valid YAP price required for mainnet calculations');
      }
      
      const totalCostUSD = baseCost * quantity * TOKEN_ECONOMICS.BASE_COST_USD;
      finalCost = totalCostUSD / this.context.currentYAPPriceUSD;
      costInUSD = totalCostUSD;
    }

    // Apply any tier-specific discounts
    const discount = this.getTierDiscount(this.context.tierId);
    if (discount > 0) {
      finalCost = finalCost * (1 - discount / 100);
    }

    return {
      featureId,
      action,
      baseCost: baseCost * quantity,
      finalCost: Math.ceil(finalCost), // Round up to nearest token
      costInUSD,
      allowanceUsed: false,
      allowanceRemaining: allowanceInfo.remaining,
      unlimitedAccess: false,
      discountApplied: discount > 0 ? discount : undefined,
      reason: discount > 0 ? `${discount}% tier discount applied` : 'Standard pricing'
    };
  }

  /**
   * Calculate costs for multiple feature actions in bulk
   */
  async calculateBulkCost(
    requests: Array<{ featureId: FeatureId; action: string; quantity?: number }>
  ): Promise<BulkCostCalculation> {
    const calculations: CostCalculation[] = [];
    let totalCost = 0;
    let totalCostUSD = 0;

    for (const request of requests) {
      const calc = await this.calculateCost(
        request.featureId, 
        request.action, 
        request.quantity || 1
      );
      calculations.push(calc);
      totalCost += calc.finalCost;
      if (calc.costInUSD) {
        totalCostUSD += calc.costInUSD;
      }
    }

    const canAfford = this.context.userTokenBalance 
      ? this.context.userTokenBalance >= totalCost 
      : true; // Assume can afford if balance not provided

    const shortfall = canAfford ? undefined : totalCost - (this.context.userTokenBalance || 0);

    return {
      totalCost,
      totalCostUSD: totalCostUSD > 0 ? totalCostUSD : undefined,
      calculations,
      canAfford,
      shortfall
    };
  }

  /**
   * Calculate reward for an achievement
   */
  async calculateReward(
    featureId: FeatureId, 
    achievement: string,
    context?: any // Additional context for dynamic rewards
  ): Promise<RewardCalculation> {
    const config = getFeatureConfig(featureId as string);
    if (!config) {
      throw new Error(`Unknown feature: ${featureId}`);
    }

    const baseReward = config.rewards[achievement];
    if (baseReward === undefined) {
      throw new Error(`Unknown achievement '${achievement}' for feature '${featureId}'`);
    }

    let finalReward: number;
    let reason: string | undefined;

    // Handle dynamic rewards (e.g., community challenges)
    if (baseReward === 'dynamic') {
      finalReward = this.calculateDynamicReward(featureId, achievement, context);
      reason = 'Dynamic reward based on pool/participation';
    } else {
      finalReward = baseReward;
    }

    // Apply any tier-specific bonuses
    const bonusMultiplier = this.getTierRewardBonus(this.context.tierId);
    if (bonusMultiplier > 1) {
      finalReward = Math.floor(finalReward * bonusMultiplier);
      reason = `${((bonusMultiplier - 1) * 100).toFixed(0)}% tier bonus applied`;
    }

    return {
      featureId,
      achievement,
      baseReward,
      finalReward,
      bonusMultiplier: bonusMultiplier > 1 ? bonusMultiplier : undefined,
      reason
    };
  }

  /**
   * Check if user has sufficient allowance for a feature
   */
  private async checkAllowance(
    featureId: FeatureId, 
    quantity: number
  ): Promise<{ covers: boolean; remaining: number }> {
    const config = getFeatureConfig(featureId as string);
    if (!config || config.freeAllowance === 'none') {
      return { covers: false, remaining: 0 };
    }

    if (config.freeAllowance === 'unlimited') {
      return { covers: true, remaining: Infinity };
    }

    // Get custom allowance for user's tier
    const customAllowance = getCustomAllowance(this.context.tierId, featureId as string);
    const baseAllowance = customAllowance !== null ? customAllowance : config.freeAllowance as number;

    // Get current usage from context
    const currentUsage = this.context.userAllowances?.[featureId] || 0;
    const remaining = Math.max(0, baseAllowance - currentUsage);

    return {
      covers: remaining >= quantity,
      remaining: remaining - (remaining >= quantity ? quantity : 0)
    };
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
   * Get tier-specific reward bonus multiplier
   */
  private getTierRewardBonus(tierId: string): number {
    switch (tierId) {
      case 'premium':
        return 1.1; // 10% bonus
      case 'enterprise':
        return 1.2; // 20% bonus
      default:
        return 1.0;
    }
  }

  /**
   * Calculate dynamic rewards (e.g., community challenge pools)
   */
  private calculateDynamicReward(
    featureId: FeatureId, 
    achievement: string, 
    context?: any
  ): number {
    // Example for community challenges
    if (featureId === 'communityChallenge' && achievement === 'poolSplit') {
      const participants = context?.participants || 1;
      const poolSize = participants * 2; // Each join adds 2 to pool
      return Math.floor(poolSize / participants);
    }

    // Default fallback
    return 1;
  }

  /**
   * Get pricing summary for a feature
   */
  async getFeaturePricingSummary(featureId: FeatureId): Promise<{
    feature: string;
    freeAllowance: number | string;
    allowancePeriod: string;
    costs: { [action: string]: number };
    rewards: { [achievement: string]: number | string };
    hasUnlimitedAccess: boolean;
  }> {
    const config = getFeatureConfig(featureId as string);
    if (!config) {
      throw new Error(`Unknown feature: ${featureId}`);
    }

    const hasUnlimited = hasUnlimitedAccess(this.context.tierId, featureId as string);
    const customAllowance = getCustomAllowance(this.context.tierId, featureId as string);

    return {
      feature: config.feature,
      freeAllowance: customAllowance !== null ? customAllowance : config.freeAllowance,
      allowancePeriod: config.allowancePeriod,
      costs: config.tokenCosts,
      rewards: config.rewards,
      hasUnlimitedAccess: hasUnlimited
    };
  }
}

/**
 * Static utility functions
 */
export class PricingUtils {
  /**
   * Convert token points to USD
   */
  static tokensToUSD(tokenPoints: number, isBeta: boolean = true): number {
    if (isBeta) {
      return tokenPoints * TOKEN_ECONOMICS.BETA_POINT_USD_VALUE;
    }
    return tokenPoints * TOKEN_ECONOMICS.BASE_COST_USD;
  }

  /**
   * Convert USD to YAP tokens (mainnet only)
   */
  static usdToYAPTokens(usdAmount: number, yapPriceUSD: number): number {
    if (yapPriceUSD <= 0) {
      throw new Error('Invalid YAP price');
    }
    return usdAmount / yapPriceUSD;
  }

  /**
   * Calculate burn and treasury split
   */
  static calculateTokenDistribution(tokenAmount: number): {
    burned: number;
    treasury: number;
  } {
    const burned = Math.floor(tokenAmount * TOKEN_ECONOMICS.BURN_PERCENTAGE / 100);
    const treasury = tokenAmount - burned;
    
    return { burned, treasury };
  }

  /**
   * Validate pricing context
   */
  static validatePricingContext(context: PricingContext): void {
    if (!context.userId) {
      throw new Error('User ID required');
    }
    
    if (!context.tierId) {
      throw new Error('Tier ID required');
    }
    
    if (!PRICING_TIERS[context.tierId]) {
      throw new Error(`Invalid tier: ${context.tierId}`);
    }
    
    if (!context.isBeta && (!context.currentYAPPriceUSD || context.currentYAPPriceUSD <= 0)) {
      throw new Error('Valid YAP price required for mainnet mode');
    }
  }
}

export default PricingCalculator;
