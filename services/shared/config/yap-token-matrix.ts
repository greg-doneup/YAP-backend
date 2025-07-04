/**
 * YAP Token Cost Matrix Configuration
 * Based on the official YAP Token Cost Matrix specification
 * 
 * This file implements the complete matrix with:
 * - Daily allowances and reset mechanics (00:00 UTC)
 * - Token costs for additional usage
 * - Reward structures for achievements
 * - Real-time YAP/USD pricing integration
 */

export interface TokenMatrixConfig {
  feature: string;
  freeAllowance: number | 'unlimited' | 'none';
  allowancePeriod: 'daily' | 'weekly' | 'none';
  resetTime: string; // UTC time for daily resets
  tokenCosts: {
    [key: string]: number; // Token points from matrix
  };
  rewards: {
    [key: string]: number | 'dynamic'; // Token rewards for achievements or dynamic
  };
  notes?: string;
}

export interface PricingTier {
  id: string;
  name: string;
  unlimitedFeatures?: string[];
  customAllowances?: { [feature: string]: number };
}

/**
 * Feature IDs enumeration derived from the token matrix
 */
export type FeatureId = keyof typeof YAP_TOKEN_MATRIX;

/**
 * Available feature IDs as a constant array
 */
export const FEATURE_IDS = [
  'dailyLessons',
  'vocabularyPractice', 
  'streakSystem',
  'aiSpeechChat',
  'aiTextChat',
  'unitExamSkipAhead',
  'unitExam',
  'pronunciationLesson',
  'weeklyLeaderboard',
  'referral',
  'feedbackSurvey',
  'bugBounty',
  'communityChallenge',
  'adaptiveReviewQuiz',
  'storyMode',
  'eventPass'
] as const;

/**
 * YAP Token Cost Matrix - Complete Feature Configuration
 * Each feature maps directly to the matrix specification
 */
export const YAP_TOKEN_MATRIX: { [featureId: string]: TokenMatrixConfig } = {
  // Daily Lessons - Core learning feature
  dailyLessons: {
    feature: 'Daily lessons',
    freeAllowance: 5,
    allowancePeriod: 'daily',
    resetTime: '00:00', // UTC
    tokenCosts: {
      extraLesson: 1,                    // 1 token per extra lesson
      unlimitedDay: 3,                   // 3 tokens -> unlimited for rest of day
      unlimitedWeek: 20,                 // 20 tokens -> unlimited for 7 days
      unlimitedMonth: 75                 // 75 tokens -> unlimited for 30 days
    },
    rewards: {
      pass85Percent: 1,                  // 85% Pass = 1 token
      pass100Percent: 2,                 // 100% Pass = 2 tokens
      perfectScoreBonus: 1               // Additional 1 token for 100% (fires once per lesson)
    },
    notes: 'Counter resets at 00:00 UTC'
  },

  // Quizzes - Performance-based rewards only
  quizzes: {
    feature: 'Quizzes',
    freeAllowance: 'unlimited',
    allowancePeriod: 'none',
    resetTime: '00:00',
    tokenCosts: {},                      // No costs - always free
    rewards: {
      pass90Percent: 2,                  // 90% Pass = 2 tokens
      fail: 0                            // Fail gives nothing
    },
    notes: 'Unlimited attempts'
  },

  // Weekly Quiz - Sunday special
  weeklyQuiz: {
    feature: 'Weekly Quiz',
    freeAllowance: 'unlimited',
    allowancePeriod: 'weekly',
    resetTime: '00:00', // Sunday
    tokenCosts: {},                      // No costs
    rewards: {
      passFirstTry: 5                    // Pass = 5 tokens on first try
    },
    notes: 'Unlimited attempts for Sunday'
  },

  // Placement Test - Always free, no rewards
  placementTest: {
    feature: 'Placement test',
    freeAllowance: 'unlimited',
    allowancePeriod: 'none',
    resetTime: '00:00',
    tokenCosts: {},
    rewards: {},
    notes: 'Sets starting CEFR unit'
  },

  // Daily Streak Milestones - Automatic rewards
  dailyStreakMilestones: {
    feature: 'Daily Streak Milestones',
    freeAllowance: 'unlimited',
    allowancePeriod: 'none',
    resetTime: '00:00',
    tokenCosts: {},
    rewards: {
      day3: 1,                           // Day 3 = 1 token
      day7: 3,                           // Day 7 = 3 tokens
      day15: 10,                         // Day 15 = 10 tokens
      day30: 10,                         // Day 30 = 10 tokens
      everyDay15After30: 10              // Every 15 days after day 30
    },
    notes: 'Break resets counter'
  },

  // AI Speech Chat - Time-based allowances
  aiSpeechChat: {
    feature: 'AI speech chat',
    freeAllowance: 15, // minutes per day
    allowancePeriod: 'daily',
    resetTime: '00:00',
    tokenCosts: {
      extraMinutes15: 1                  // 1 token = 15 min (stackable)
    },
    rewards: {},
    notes: 'Stackable: 45 min extra = 3 tokens'
  },

  // AI Text Chat - Message-based allowances
  aiTextChat: {
    feature: 'AI text chat',
    freeAllowance: 25, // messages per day
    allowancePeriod: 'daily',
    resetTime: '00:00',
    tokenCosts: {
      unlimitedHour: 2                   // 2 tokens = unlimited messages for 1 hour
    },
    rewards: {},
    notes: 'Timer starts on first paid message'
  },

  // Unit Exam (Skip-ahead only) - Premium feature
  unitExamSkipAhead: {
    feature: 'Unit exam (skip-ahead only)',
    freeAllowance: 'none',
    allowancePeriod: 'none',
    resetTime: '00:00',
    tokenCosts: {
      twoAttempts: 1                     // 1 token = 2 attempts
    },
    rewards: {
      pass: 3                            // Pass = 3 tokens + unit unlocked
    },
    notes: 'New exam requires new spend'
  },

  // Unit Exam - Regular with optional staking
  unitExam: {
    feature: 'Unit Exam',
    freeAllowance: 'unlimited',
    allowancePeriod: 'none',
    resetTime: '00:00',
    tokenCosts: {
      optionalStake: 1                   // Optional: stake 1 token before starting
    },
    rewards: {
      score95Percent: 1,                 // Score >= 95% -> earn 1 token
      passWithStake: 1.5                 // Pass = 1.5x normal reward if staked
    },
    notes: 'Fail on first attempt -> no reward (staked token is lost)'
  },

  // Pronunciation Lesson - Detailed feedback
  pronunciationLesson: {
    feature: 'Pronunciation lesson (detailed feedback)',
    freeAllowance: 'none',
    allowancePeriod: 'none',
    resetTime: '00:00',
    tokenCosts: {
      detailedFeedback: 2                // 2 tokens per lesson
    },
    rewards: {},
    notes: 'Lesson length is 5-8 min, in-depth feedback'
  },

  // Weekly Leaderboard - Competition staking
  weeklyLeaderboard: {
    feature: 'Weekly leaderboard',
    freeAllowance: 'none',
    allowancePeriod: 'weekly',
    resetTime: '00:00', // Monday
    tokenCosts: {
      stakeToEnter: 1                    // Stake 1 token to enter
    },
    rewards: {
      rank1: 15,                         // Rank 1 = 15 tokens
      rank2: 12,                         // Rank 2 = 12 tokens
      rank3: 9,                          // Rank 3 = 9 tokens
      rank4to20: 3                       // Rank 4-20 = 3 tokens each
    },
    notes: 'Stakes refunded only as prizes. Users who did not place 1-20: tokens kicked back to YAP as revenue'
  },

  // Referral System - Social rewards
  referral: {
    feature: 'Referral',
    freeAllowance: 'unlimited',
    allowancePeriod: 'none',
    resetTime: '00:00',
    tokenCosts: {},
    rewards: {
      bothUsers: 5                       // Both users get 5 when referral completes 5 lessons
    },
    notes: 'No cap'
  },

  // Feedback Survey - Quality assurance
  feedbackSurvey: {
    feature: 'Feedback Survey',
    freeAllowance: 'unlimited',
    allowancePeriod: 'none',
    resetTime: '00:00',
    tokenCosts: {},
    rewards: {
      submitted: 2                       // 2 tokens for submitted surveys
    },
    notes: 'Once per unique survey ID'
  },

  // Bug Bounty - Security rewards
  bugBounty: {
    feature: 'Bug Bounty',
    freeAllowance: 'unlimited',
    allowancePeriod: 'none',
    resetTime: '00:00',
    tokenCosts: {},
    rewards: {
      validatedBug: 5                    // 5 tokens for every validated unique bug
    },
    notes: 'Once per unique bug reported'
  },

  // Community Challenge - Pool-based competition
  communityChallenge: {
    feature: 'Community challenge',
    freeAllowance: 1, // first quest free
    allowancePeriod: 'none',
    resetTime: '00:00',
    tokenCosts: {
      joinNewQuest: 1                    // 1 token to join new quest
    },
    rewards: {
      poolSplit: 'dynamic'               // Pool splits equally; each join adds 2 to pool
    },
    notes: 'Quest finishes when goal met'
  },

  // Adaptive Review Quiz - AI-generated
  adaptiveReviewQuiz: {
    feature: 'Adaptive Review Quiz',
    freeAllowance: 'none',
    allowancePeriod: 'none',
    resetTime: '00:00',
    tokenCosts: {
      generateSet: 1                     // 1 token to generate set
    },
    rewards: {
      pass95Percent: 1                   // Pass >= 95% = 1 token
    },
    notes: 'AI picks weak points from all lessons done'
  },

  // Story Mode - Interactive dialogue
  storyMode: {
    feature: 'Story Mode',
    freeAllowance: 'none',
    allowancePeriod: 'none',
    resetTime: '00:00',
    tokenCosts: {
      unlock: 2                          // 2 tokens to unlock
    },
    rewards: {
      pass90Percent: 1                   // Pass >= 90% = 1 token
    },
    notes: 'Interactive dialogue'
  },

  // Event Pass - Limited-time cultural events
  eventPass: {
    feature: 'Event Pass',
    freeAllowance: 'none',
    allowancePeriod: 'none',
    resetTime: '00:00',
    tokenCosts: {
      joinEvent: 1                       // 1 token to join event
    },
    rewards: {
      perfectScore: 2                    // 100% score = 2 tokens
    },
    notes: 'Limited-time cultural event'
  }
};

/**
 * Token Economics Configuration
 */
export const TOKEN_ECONOMICS = {
  // Base pricing for mainnet
  BASE_COST_USD: 0.05,                  // $0.05 per token point
  
  // Burn/treasury split
  BURN_PERCENTAGE: 50,                  // 50% of all spending burned
  TREASURY_PERCENTAGE: 50,              // 50% of all spending to treasury
  
  // Beta conversion
  BETA_POINT_USD_VALUE: 0.05,           // Beta points worth $0.05 each
  
  // Oracle settings
  ORACLE_UPDATE_INTERVAL: 300,          // 5 minutes
  ORACLE_DEVIATION_THRESHOLD: 0.01,     // 1% price deviation triggers update
  FALLBACK_YAP_PRICE_USD: 0.05,         // Fallback price if oracle fails
  
  // Daily reset
  DAILY_RESET_UTC_HOUR: 0,              // 00:00 UTC
  DAILY_RESET_UTC_MINUTE: 0
};

/**
 * Pricing Tiers for Premium Users
 * These users can have modified allowances or unlimited access
 */
export const PRICING_TIERS: { [tierId: string]: PricingTier } = {
  free: {
    id: 'free',
    name: 'Free User',
    // Uses standard matrix allowances
  },
  
  premium: {
    id: 'premium',
    name: 'Premium User',
    unlimitedFeatures: [
      'dailyLessons',
      'aiSpeechChat',
      'aiTextChat'
    ]
  },
  
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise User',
    unlimitedFeatures: [
      'dailyLessons',
      'aiSpeechChat',
      'aiTextChat',
      'pronunciationLesson',
      'adaptiveReviewQuiz',
      'storyMode'
    ]
  }
};

/**
 * Get feature configuration by feature ID
 */
export function getFeatureConfig(featureId: string): TokenMatrixConfig | null {
  return YAP_TOKEN_MATRIX[featureId] || null;
}

/**
 * Calculate token cost for a feature action
 * @param featureId Feature identifier
 * @param action Specific action within the feature
 * @param currentYAPPriceUSD Current YAP token price in USD (for mainnet)
 * @param isBeta Whether this is beta (testnet) mode
 * @returns Token amount needed
 */
export function calculateTokenCost(
  featureId: string, 
  action: string, 
  currentYAPPriceUSD?: number,
  isBeta: boolean = true
): number {
  const config = getFeatureConfig(featureId);
  if (!config) {
    throw new Error(`Unknown feature: ${featureId}`);
  }

  const tokenPoints = config.tokenCosts[action];
  if (tokenPoints === undefined) {
    throw new Error(`Unknown action '${action}' for feature '${featureId}'`);
  }

  // Beta mode: 1 token = 1 point (literal matrix values)
  if (isBeta) {
    return tokenPoints;
  }

  // Mainnet mode: Calculate YAP tokens needed
  if (!currentYAPPriceUSD || currentYAPPriceUSD <= 0) {
    throw new Error('Valid YAP price required for mainnet calculations');
  }

  const totalCostUSD = tokenPoints * TOKEN_ECONOMICS.BASE_COST_USD;
  return totalCostUSD / currentYAPPriceUSD;
}

/**
 * Calculate token reward for a feature achievement
 * @param featureId Feature identifier
 * @param achievement Specific achievement
 * @returns Token reward amount (or 0 for dynamic rewards)
 */
export function calculateTokenReward(featureId: string, achievement: string): number {
  const config = getFeatureConfig(featureId);
  if (!config) {
    throw new Error(`Unknown feature: ${featureId}`);
  }

  const reward = config.rewards[achievement];
  if (reward === undefined) {
    throw new Error(`Unknown achievement '${achievement}' for feature '${featureId}'`);
  }

  return typeof reward === 'number' ? reward : 0;
}

/**
 * Check if user has unlimited access to a feature
 * @param tierId User's pricing tier
 * @param featureId Feature to check
 * @returns Whether user has unlimited access
 */
export function hasUnlimitedAccess(tierId: string, featureId: string): boolean {
  const tier = PRICING_TIERS[tierId];
  if (!tier || !tier.unlimitedFeatures) {
    return false;
  }
  
  return tier.unlimitedFeatures.includes(featureId);
}

/**
 * Get custom allowance for a user's tier
 * @param tierId User's pricing tier
 * @param featureId Feature to check
 * @returns Custom allowance or null if using standard
 */
export function getCustomAllowance(tierId: string, featureId: string): number | null {
  const tier = PRICING_TIERS[tierId];
  if (!tier || !tier.customAllowances) {
    return null;
  }
  
  return tier.customAllowances[featureId] || null;
}

/**
 * Validate token matrix configuration on startup
 */
export function validateTokenMatrix(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check that all features have required fields
  for (const [featureId, config] of Object.entries(YAP_TOKEN_MATRIX)) {
    if (!config.feature) {
      errors.push(`Feature ${featureId} missing name`);
    }
    
    if (config.allowancePeriod === 'daily' && !config.resetTime) {
      errors.push(`Feature ${featureId} with daily allowance missing reset time`);
    }
    
    // Validate token costs are positive numbers
    for (const [action, cost] of Object.entries(config.tokenCosts)) {
      if (typeof cost === 'number' && cost <= 0) {
        errors.push(`Feature ${featureId} action ${action} has invalid cost: ${cost}`);
      }
    }
  }
  
  // Check token economics configuration
  if (TOKEN_ECONOMICS.BASE_COST_USD <= 0) {
    errors.push('BASE_COST_USD must be positive');
  }
  
  if (TOKEN_ECONOMICS.BURN_PERCENTAGE + TOKEN_ECONOMICS.TREASURY_PERCENTAGE !== 100) {
    errors.push('Burn and treasury percentages must sum to 100');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get all features that have daily allowances
 */
export function getDailyAllowanceFeatures(): string[] {
  return Object.keys(YAP_TOKEN_MATRIX).filter(
    featureId => YAP_TOKEN_MATRIX[featureId].allowancePeriod === 'daily'
  );
}

/**
 * Get all features that have weekly allowances
 */
export function getWeeklyAllowanceFeatures(): string[] {
  return Object.keys(YAP_TOKEN_MATRIX).filter(
    featureId => YAP_TOKEN_MATRIX[featureId].allowancePeriod === 'weekly'
  );
}

export default YAP_TOKEN_MATRIX;
