/**
 * Beta/Mainnet Configuration for YAP Token System
 * 
 * Manages environment-specific settings for beta (testnet) vs mainnet modes.
 * Handles the transition from beta points to real YAP tokens.
 * 
 * Key Features:
 * - Environment detection and configuration
 * - Beta point to token conversion logic
 * - Oracle settings per environment
 * - Feature flag management
 * - Migration utilities for beta-to-mainnet transition
 */

import { TOKEN_ECONOMICS } from './yap-token-matrix';

export type Environment = 'beta' | 'mainnet' | 'development';

export interface EnvironmentConfig {
  environment: Environment;
  chainId: number;
  rpcUrl: string;
  contractAddresses: {
    yapToken: string;
    tokenSpendingManager: string;
    enhancedRewards: string;
    stakingPool: string;
    oracle: string;
  };
  oracleConfig: {
    updateInterval: number; // seconds
    deviationThreshold: number; // percentage (0.01 = 1%)
    fallbackPrice: number; // USD
    healthCheckInterval: number; // seconds
  };
  features: {
    realTimeOracle: boolean;
    stakingRewards: boolean;
    burnMechanism: boolean;
    leaderboardStaking: boolean;
    dynamicPricing: boolean;
  };
  limits: {
    maxTokensPerTransaction: number;
    maxDailySpend: number;
    maxRewardClaim: number;
  };
  conversion: {
    betaPointsToTokens: number; // Ratio for migration
    conversionDeadline?: Date;
    gracePeriodDays: number;
  };
}

/**
 * Beta Environment Configuration
 * Uses point-based system with simulated token mechanics
 */
export const BETA_CONFIG: EnvironmentConfig = {
  environment: 'beta',
  chainId: 11155111, // Sepolia testnet
  rpcUrl: process.env.BETA_RPC_URL || 'https://sepolia.infura.io/v3/',
  
  contractAddresses: {
    yapToken: process.env.BETA_YAP_TOKEN || '0x1234567890123456789012345678901234567890',
    tokenSpendingManager: process.env.BETA_SPENDING_MANAGER || '0x2345678901234567890123456789012345678901',
    enhancedRewards: process.env.BETA_REWARDS_CONTRACT || '0x3456789012345678901234567890123456789012',
    stakingPool: process.env.BETA_STAKING_POOL || '0x4567890123456789012345678901234567890123',
    oracle: process.env.BETA_ORACLE || '0x5678901234567890123456789012345678901234',
  },

  oracleConfig: {
    updateInterval: 3600, // 1 hour for beta
    deviationThreshold: 0.05, // 5% threshold for beta
    fallbackPrice: TOKEN_ECONOMICS.BETA_POINT_USD_VALUE,
    healthCheckInterval: 1800, // 30 minutes
  },

  features: {
    realTimeOracle: false, // Use fixed pricing in beta
    stakingRewards: true,
    burnMechanism: false, // No burning in beta
    leaderboardStaking: true,
    dynamicPricing: false, // Fixed point values
  },

  limits: {
    maxTokensPerTransaction: 1000, // 1000 beta points
    maxDailySpend: 5000, // 5000 beta points
    maxRewardClaim: 500, // 500 beta points
  },

  conversion: {
    betaPointsToTokens: 1, // 1:1 conversion ratio
    gracePeriodDays: 90, // 90 days to convert
  },
};

/**
 * Mainnet Environment Configuration
 * Full token mechanics with real economic impact
 */
export const MAINNET_CONFIG: EnvironmentConfig = {
  environment: 'mainnet',
  chainId: 1, // Ethereum mainnet
  rpcUrl: process.env.MAINNET_RPC_URL || 'https://mainnet.infura.io/v3/',
  
  contractAddresses: {
    yapToken: process.env.MAINNET_YAP_TOKEN || '0x0000000000000000000000000000000000000000',
    tokenSpendingManager: process.env.MAINNET_SPENDING_MANAGER || '0x0000000000000000000000000000000000000000',
    enhancedRewards: process.env.MAINNET_REWARDS_CONTRACT || '0x0000000000000000000000000000000000000000',
    stakingPool: process.env.MAINNET_STAKING_POOL || '0x0000000000000000000000000000000000000000',
    oracle: process.env.MAINNET_ORACLE || '0x0000000000000000000000000000000000000000',
  },

  oracleConfig: {
    updateInterval: TOKEN_ECONOMICS.ORACLE_UPDATE_INTERVAL,
    deviationThreshold: TOKEN_ECONOMICS.ORACLE_DEVIATION_THRESHOLD,
    fallbackPrice: TOKEN_ECONOMICS.FALLBACK_YAP_PRICE_USD,
    healthCheckInterval: 300, // 5 minutes
  },

  features: {
    realTimeOracle: true,
    stakingRewards: true,
    burnMechanism: true, // 50% burn mechanism active
    leaderboardStaking: true,
    dynamicPricing: true, // Real YAP/USD pricing
  },

  limits: {
    maxTokensPerTransaction: 10000, // 10k YAP tokens
    maxDailySpend: 50000, // 50k YAP tokens
    maxRewardClaim: 5000, // 5k YAP tokens
  },

  conversion: {
    betaPointsToTokens: 1, // Historical conversion rate
    gracePeriodDays: 0, // No ongoing conversion in mainnet
  },
};

/**
 * Development Environment Configuration
 * Local testing with relaxed limits
 */
export const DEVELOPMENT_CONFIG: EnvironmentConfig = {
  environment: 'development',
  chainId: 31337, // Hardhat local network
  rpcUrl: 'http://localhost:8545',
  
  contractAddresses: {
    yapToken: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    tokenSpendingManager: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    enhancedRewards: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    stakingPool: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    oracle: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
  },

  oracleConfig: {
    updateInterval: 60, // 1 minute for testing
    deviationThreshold: 0.1, // 10% threshold for testing
    fallbackPrice: 0.05, // $0.05 fallback
    healthCheckInterval: 30, // 30 seconds
  },

  features: {
    realTimeOracle: true,
    stakingRewards: true,
    burnMechanism: true,
    leaderboardStaking: true,
    dynamicPricing: true,
  },

  limits: {
    maxTokensPerTransaction: 1000000, // 1M tokens for testing
    maxDailySpend: 10000000, // 10M tokens for testing
    maxRewardClaim: 100000, // 100k tokens for testing
  },

  conversion: {
    betaPointsToTokens: 1,
    gracePeriodDays: 365, // Long grace period for testing
  },
};

/**
 * Environment configuration registry
 */
export const ENVIRONMENT_CONFIGS: Record<Environment, EnvironmentConfig> = {
  beta: BETA_CONFIG,
  mainnet: MAINNET_CONFIG,
  development: DEVELOPMENT_CONFIG,
};

/**
 * Current environment detection
 */
export function getCurrentEnvironment(): Environment {
  const env = process.env.YAP_ENVIRONMENT?.toLowerCase() as Environment;
  
  if (env && ENVIRONMENT_CONFIGS[env]) {
    return env;
  }
  
  // Fallback based on NODE_ENV
  if (process.env.NODE_ENV === 'production') {
    return 'mainnet';
  } else if (process.env.NODE_ENV === 'development') {
    return 'development';
  }
  
  // Default to beta
  return 'beta';
}

/**
 * Get current environment configuration
 */
export function getCurrentConfig(): EnvironmentConfig {
  const env = getCurrentEnvironment();
  return ENVIRONMENT_CONFIGS[env];
}

/**
 * Check if running in beta mode
 */
export function isBetaMode(): boolean {
  return getCurrentEnvironment() === 'beta';
}

/**
 * Check if running in mainnet mode
 */
export function isMainnetMode(): boolean {
  return getCurrentEnvironment() === 'mainnet';
}

/**
 * Check if running in development mode
 */
export function isDevelopmentMode(): boolean {
  return getCurrentEnvironment() === 'development';
}

/**
 * Get feature flag value
 */
export function isFeatureEnabled(feature: keyof EnvironmentConfig['features']): boolean {
  const config = getCurrentConfig();
  return config.features[feature];
}

/**
 * Get contract address for current environment
 */
export function getContractAddress(contract: keyof EnvironmentConfig['contractAddresses']): string {
  const config = getCurrentConfig();
  const address = config.contractAddresses[contract];
  
  if (!address || address === '0x0000000000000000000000000000000000000000') {
    throw new Error(`Contract address for ${contract} not configured in ${config.environment} environment`);
  }
  
  return address;
}

/**
 * Get oracle configuration for current environment
 */
export function getOracleConfig(): EnvironmentConfig['oracleConfig'] {
  const config = getCurrentConfig();
  return config.oracleConfig;
}

/**
 * Get transaction limits for current environment
 */
export function getTransactionLimits(): EnvironmentConfig['limits'] {
  const config = getCurrentConfig();
  return config.limits;
}

/**
 * Beta to mainnet conversion utilities
 */
export class ConversionUtils {
  /**
   * Convert beta points to mainnet tokens
   */
  static convertBetaPointsToTokens(betaPoints: number): number {
    const config = getCurrentConfig();
    return betaPoints * config.conversion.betaPointsToTokens;
  }

  /**
   * Check if conversion is still available
   */
  static isConversionAvailable(): boolean {
    const config = getCurrentConfig();
    
    if (!config.conversion.conversionDeadline) {
      return true; // No deadline set
    }
    
    return new Date() < config.conversion.conversionDeadline;
  }

  /**
   * Get days remaining for conversion
   */
  static getDaysRemainingForConversion(): number | null {
    const config = getCurrentConfig();
    
    if (!config.conversion.conversionDeadline) {
      return null; // No deadline
    }
    
    const now = new Date();
    const deadline = config.conversion.conversionDeadline;
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
  }

  /**
   * Calculate conversion value in USD
   */
  static calculateConversionValueUSD(betaPoints: number): number {
    return betaPoints * TOKEN_ECONOMICS.BETA_POINT_USD_VALUE;
  }
}

/**
 * Environment transition utilities
 */
export class EnvironmentUtils {
  /**
   * Validate environment configuration
   */
  static validateConfig(config: EnvironmentConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Validate contract addresses
    for (const [name, address] of Object.entries(config.contractAddresses)) {
      if (!address || address === '0x0000000000000000000000000000000000000000') {
        if (config.environment === 'mainnet') {
          errors.push(`Missing ${name} contract address for mainnet`);
        }
      }
    }
    
    // Validate oracle configuration
    if (config.oracleConfig.updateInterval <= 0) {
      errors.push('Oracle update interval must be positive');
    }
    
    if (config.oracleConfig.deviationThreshold <= 0 || config.oracleConfig.deviationThreshold >= 1) {
      errors.push('Oracle deviation threshold must be between 0 and 1');
    }
    
    if (config.oracleConfig.fallbackPrice <= 0) {
      errors.push('Oracle fallback price must be positive');
    }
    
    // Validate limits
    if (config.limits.maxTokensPerTransaction <= 0) {
      errors.push('Max tokens per transaction must be positive');
    }
    
    if (config.limits.maxDailySpend <= 0) {
      errors.push('Max daily spend must be positive');
    }
    
    if (config.limits.maxRewardClaim <= 0) {
      errors.push('Max reward claim must be positive');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get configuration summary for debugging
   */
  static getConfigSummary(): {
    environment: Environment;
    chainId: number;
    featuresEnabled: string[];
    oracleEnabled: boolean;
    conversionAvailable: boolean;
  } {
    const config = getCurrentConfig();
    const featuresEnabled = Object.entries(config.features)
      .filter(([_, enabled]) => enabled)
      .map(([feature, _]) => feature);

    return {
      environment: config.environment,
      chainId: config.chainId,
      featuresEnabled,
      oracleEnabled: config.features.realTimeOracle,
      conversionAvailable: ConversionUtils.isConversionAvailable(),
    };
  }
}

export default {
  BETA_CONFIG,
  MAINNET_CONFIG,
  DEVELOPMENT_CONFIG,
  ENVIRONMENT_CONFIGS,
  getCurrentEnvironment,
  getCurrentConfig,
  isBetaMode,
  isMainnetMode,
  isDevelopmentMode,
  isFeatureEnabled,
  getContractAddress,
  getOracleConfig,
  getTransactionLimits,
  ConversionUtils,
  EnvironmentUtils,
};
