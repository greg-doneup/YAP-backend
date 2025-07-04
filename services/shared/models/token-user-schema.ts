/**
 * Token-Based User Schema for YAP Token Cost Matrix
 * Replaces subscription-based schemas with token balance and allowance tracking
 */

import { Schema, model, Document } from 'mongoose';

// ================================
// Token User Schema
// ================================

export interface ITokenUser extends Document {
  userId: string;
  email: string;
  
  // Token balances
  testTokens: number;        // Beta/testnet points
  yapTokens: number;         // Mainnet YAP tokens (18 decimal precision)
  
  // Daily allowances for features with free limits
  dailyAllowances: {
    [featureId: string]: {
      used: number;           // Usage count for today
      resetDate: Date;        // Last reset timestamp (UTC)
      unlimitedUntil?: Date;  // If unlimited access purchased
      extraMinutes?: number;  // For time-based features (AI speech)
    };
  };
  
  // Streak tracking for milestone rewards
  streakData: {
    currentStreak: number;
    lastLessonDate?: Date;
    milestonesEarned: number[]; // Array of milestone days earned (3, 7, 15, 30, etc.)
  };
  
  // Timestamps
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TokenUserSchema = new Schema<ITokenUser>({
  userId: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, index: true },
  
  // Token balances
  testTokens: { type: Number, default: 0, min: 0 },
  yapTokens: { type: Number, default: 0, min: 0 },
  
  // Daily allowances - Dynamic schema for all features
  dailyAllowances: {
    type: Schema.Types.Mixed,
    default: {}
  },
  
  // Streak tracking
  streakData: {
    currentStreak: { type: Number, default: 0, min: 0 },
    lastLessonDate: { type: Date },
    milestonesEarned: [{ type: Number }]
  },
  
  // Timestamps
  lastUpdated: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'token_users'
});

// Indexes for performance
TokenUserSchema.index({ userId: 1 });
TokenUserSchema.index({ email: 1 });
TokenUserSchema.index({ 'streakData.currentStreak': -1 });
TokenUserSchema.index({ lastUpdated: -1 });

export const TokenUser = model<ITokenUser>('TokenUser', TokenUserSchema);

// ================================
// Token Transaction Schema
// ================================

export interface ITokenTransaction extends Document {
  userId: string;
  transactionType: 'spend' | 'earn' | 'stake' | 'reward';
  amount: number;           // Token amount (positive for all types)
  feature: string;          // Feature ID from token matrix
  action?: string;          // Specific action within feature
  
  // Transaction details
  timestamp: Date;
  isBeta: boolean;          // Whether this was a beta transaction
  yapPriceUSD?: number;     // YAP price at transaction time (mainnet only)
  
  // Blockchain integration
  blockchainTxHash?: string; // Smart contract transaction hash
  burnAmount?: number;       // Amount burned (50% for spending)
  treasuryAmount?: number;   // Amount to treasury (50% for spending)
  
  // Metadata
  metadata: {
    endpoint?: string;
    processingTime?: number;  // Processing time in ms
    score?: number;          // For reward transactions
    examResult?: boolean;    // For exam-based rewards
    stakingPoolId?: string;  // For staking transactions
    [key: string]: any;
  };
}

const TokenTransactionSchema = new Schema<ITokenTransaction>({
  userId: { type: String, required: true, index: true },
  transactionType: { 
    type: String, 
    enum: ['spend', 'earn', 'stake', 'reward'],
    required: true,
    index: true
  },
  amount: { type: Number, required: true, min: 0 },
  feature: { type: String, required: true, index: true },
  action: { type: String },
  
  // Transaction details
  timestamp: { type: Date, required: true, default: Date.now, index: true },
  isBeta: { type: Boolean, required: true, default: true },
  yapPriceUSD: { type: Number, min: 0 },
  
  // Blockchain integration
  blockchainTxHash: { type: String, sparse: true, index: true },
  burnAmount: { type: Number, min: 0 },
  treasuryAmount: { type: Number, min: 0 },
  
  // Metadata
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: false, // Using custom timestamp field
  collection: 'token_transactions'
});

// Indexes for analytics and reporting
TokenTransactionSchema.index({ userId: 1, timestamp: -1 });
TokenTransactionSchema.index({ feature: 1, transactionType: 1 });
TokenTransactionSchema.index({ timestamp: -1, transactionType: 1 });
TokenTransactionSchema.index({ blockchainTxHash: 1 }, { sparse: true });

export const TokenTransaction = model<ITokenTransaction>('TokenTransaction', TokenTransactionSchema);

// ================================
// Daily Allowance Schema
// ================================

export interface IDailyAllowance extends Document {
  userId: string;
  date: Date;               // UTC date (YYYY-MM-DD)
  featureId: string;
  
  // Usage tracking
  used: number;
  limit: number;            // Free allowance limit
  unlimited: boolean;       // If unlimited access purchased
  unlimitedUntil?: Date;    // Expiry of unlimited access
  
  // Reset tracking
  resetAt: Date;            // Next reset time (00:00 UTC)
  lastReset: Date;          // Last actual reset time
}

const DailyAllowanceSchema = new Schema<IDailyAllowance>({
  userId: { type: String, required: true, index: true },
  date: { type: Date, required: true, index: true },
  featureId: { type: String, required: true, index: true },
  
  // Usage tracking
  used: { type: Number, default: 0, min: 0 },
  limit: { type: Number, required: true, min: 0 },
  unlimited: { type: Boolean, default: false },
  unlimitedUntil: { type: Date },
  
  // Reset tracking
  resetAt: { type: Date, required: true },
  lastReset: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'daily_allowances'
});

// Compound indexes for efficient queries
DailyAllowanceSchema.index({ userId: 1, date: 1, featureId: 1 }, { unique: true });
DailyAllowanceSchema.index({ date: 1, featureId: 1 });
DailyAllowanceSchema.index({ resetAt: 1 });

export const DailyAllowance = model<IDailyAllowance>('DailyAllowance', DailyAllowanceSchema);

// ================================
// Staking Pool Schema (for competitions)
// ================================

export interface IStakingPool extends Document {
  poolId: string;
  poolType: 'weekly_leaderboard' | 'community_challenge';
  
  // Pool details
  name: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  
  // Participants and stakes
  participants: Array<{
    userId: string;
    stakedAmount: number;
    joinedAt: Date;
    rank?: number;        // Final ranking (set when completed)
    reward?: number;      // Reward amount (set when completed)
  }>;
  
  // Pool economics
  totalStaked: number;
  totalRewards: number;   // Total rewards to distribute
  burnAmount: number;     // Amount burned from losing stakes
  
  // Competition rules
  rules: {
    entryStake: number;   // Required stake to join
    maxParticipants?: number;
    rewardStructure: Array<{
      rankFrom: number;
      rankTo: number;
      rewardAmount: number;
    }>;
  };
  
  // Metadata
  metadata: {
    [key: string]: any;
  };
}

const StakingPoolSchema = new Schema<IStakingPool>({
  poolId: { type: String, required: true, unique: true, index: true },
  poolType: { 
    type: String, 
    enum: ['weekly_leaderboard', 'community_challenge'],
    required: true,
    index: true
  },
  
  // Pool details
  name: { type: String, required: true },
  description: { type: String },
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true, index: true },
  status: { 
    type: String, 
    enum: ['pending', 'active', 'completed', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  // Participants
  participants: [{
    userId: { type: String, required: true },
    stakedAmount: { type: Number, required: true, min: 0 },
    joinedAt: { type: Date, default: Date.now },
    rank: { type: Number, min: 1 },
    reward: { type: Number, min: 0 }
  }],
  
  // Pool economics
  totalStaked: { type: Number, default: 0, min: 0 },
  totalRewards: { type: Number, default: 0, min: 0 },
  burnAmount: { type: Number, default: 0, min: 0 },
  
  // Competition rules
  rules: {
    entryStake: { type: Number, required: true, min: 0 },
    maxParticipants: { type: Number, min: 1 },
    rewardStructure: [{
      rankFrom: { type: Number, required: true, min: 1 },
      rankTo: { type: Number, required: true, min: 1 },
      rewardAmount: { type: Number, required: true, min: 0 }
    }]
  },
  
  // Metadata
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  collection: 'staking_pools'
});

// Indexes for pool queries
StakingPoolSchema.index({ poolType: 1, status: 1 });
StakingPoolSchema.index({ startDate: 1, endDate: 1 });
StakingPoolSchema.index({ 'participants.userId': 1 });

export const StakingPool = model<IStakingPool>('StakingPool', StakingPoolSchema);

// ================================
// Utility Functions
// ================================

/**
 * Get current UTC date as a date string (YYYY-MM-DD)
 */
export function getCurrentUTCDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Get next UTC midnight for daily resets
 */
export function getNextUTCMidnight(): Date {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCDate(midnight.getUTCDate() + 1);
  midnight.setUTCHours(0, 0, 0, 0);
  return midnight;
}

/**
 * Check if two dates are on the same UTC day
 */
export function isSameUTCDay(date1: Date, date2: Date): boolean {
  return date1.toISOString().split('T')[0] === date2.toISOString().split('T')[0];
}

/**
 * Create a new staking pool for weekly leaderboards
 */
export async function createWeeklyLeaderboardPool(
  startDate: Date,
  endDate: Date
): Promise<IStakingPool> {
  const poolId = `weekly_leaderboard_${startDate.toISOString().split('T')[0]}`;
  
  const pool = new StakingPool({
    poolId,
    poolType: 'weekly_leaderboard',
    name: `Weekly Leaderboard - ${startDate.toISOString().split('T')[0]}`,
    description: 'Weekly language learning competition with token stakes and rewards',
    startDate,
    endDate,
    status: 'pending',
    participants: [],
    totalStaked: 0,
    totalRewards: 0,
    burnAmount: 0,
    rules: {
      entryStake: 1, // 1 token to enter
      rewardStructure: [
        { rankFrom: 1, rankTo: 1, rewardAmount: 15 },  // 1st place: 15 tokens
        { rankFrom: 2, rankTo: 2, rewardAmount: 12 },  // 2nd place: 12 tokens
        { rankFrom: 3, rankTo: 3, rewardAmount: 9 },   // 3rd place: 9 tokens
        { rankFrom: 4, rankTo: 20, rewardAmount: 3 }   // 4th-20th: 3 tokens each
      ]
    },
    metadata: {}
  });
  
  return await pool.save();
}

/**
 * Initialize daily allowances for a user
 */
export async function initializeDailyAllowances(userId: string): Promise<void> {
  const today = getCurrentUTCDateString();
  const todayDate = new Date(today);
  const nextMidnight = getNextUTCMidnight();
  
  // Features with daily allowances from the token matrix
  const dailyFeatures = [
    { featureId: 'dailyLessons', limit: 5 },
    { featureId: 'aiSpeechChat', limit: 15 }, // 15 minutes
    { featureId: 'aiTextChat', limit: 25 }    // 25 messages
  ];
  
  for (const feature of dailyFeatures) {
    const existingAllowance = await DailyAllowance.findOne({
      userId,
      date: todayDate,
      featureId: feature.featureId
    });
    
    if (!existingAllowance) {
      await new DailyAllowance({
        userId,
        date: todayDate,
        featureId: feature.featureId,
        used: 0,
        limit: feature.limit,
        unlimited: false,
        resetAt: nextMidnight,
        lastReset: new Date()
      }).save();
    }
  }
}
