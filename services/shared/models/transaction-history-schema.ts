/**
 * Transaction History Schema
 * 
 * MongoDB schema for storing all YAP token transactions, allowance usage,
 * and token spending history for analytics and user transaction tracking.
 */

// Mock Mongoose interfaces for type safety
interface Schema {
  new (definition: any, options?: any): any;
}

interface Model<T> {
  findById(id: string): Promise<T | null>;
  find(filter: any): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  updateOne(filter: any, update: any): Promise<void>;
  deleteOne(filter: any): Promise<void>;
}

// Mock Mongoose
const MockSchema = function(this: any, definition: any, options?: any) {
  this.definition = definition;
  this.options = options;
} as any;

MockSchema.Types = {
  ObjectId: 'ObjectId',
  String: String,
  Number: Number,
  Date: Date,
  Boolean: Boolean,
  Array: Array,
  Mixed: 'Mixed'
};

export interface TokenTransaction {
  _id?: string;
  userId: string;
  transactionType: 'spending' | 'earning' | 'allowance_reset' | 'transfer' | 'stake' | 'unstake' | 'reward';
  amount: number; // Token amount (in wei/smallest unit)
  amountUSD?: number; // USD equivalent at time of transaction
  featureId?: string; // Which feature was used (lesson, voice_chat, etc.)
  description: string; // Human-readable transaction description
  
  // Transaction context
  walletAddress?: string; // User's wallet address if applicable
  contractAddress?: string; // Smart contract address involved
  blockNumber?: number; // Blockchain block number
  transactionHash?: string; // Blockchain transaction hash
  gasUsed?: number; // Gas consumed for blockchain transactions
  gasPriceGwei?: number; // Gas price in Gwei
  
  // Pricing context
  yapPriceUSD?: number; // YAP price in USD at transaction time
  oracleSource?: string; // Price oracle source used
  priceTimestamp?: Date; // When the price was retrieved
  
  // Allowance tracking
  dailyAllowanceUsed?: number; // Daily allowance used in this transaction
  remainingDailyAllowance?: number; // Remaining daily allowance after transaction
  weeklyAllowanceUsed?: number; // Weekly allowance used
  remainingWeeklyAllowance?: number; // Remaining weekly allowance
  
  // Status and processing
  status: 'pending' | 'confirmed' | 'failed' | 'refunded';
  errorMessage?: string; // Error message if transaction failed
  retryCount?: number; // Number of retry attempts
  processingStarted?: Date; // When transaction processing started
  confirmedAt?: Date; // When transaction was confirmed
  
  // Metadata
  userAgent?: string; // Client user agent
  ipAddress?: string; // Client IP address (hashed for privacy)
  deviceInfo?: {
    platform: string;
    browser?: string;
    version?: string;
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  
  // Indexes for efficient querying
  __indexes?: string[];
}

export interface TransactionSummary {
  userId: string;
  date: Date; // Daily summary date
  
  // Daily totals
  totalSpent: number;
  totalEarned: number;
  totalTransactions: number;
  
  // Breakdown by transaction type
  spendingTransactions: number;
  earningTransactions: number;
  allowanceResets: number;
  
  // Breakdown by feature
  featureUsage: {
    featureId: string;
    transactionCount: number;
    totalSpent: number;
  }[];
  
  // Allowance usage
  dailyAllowanceUsed: number;
  weeklyAllowanceUsed: number;
  
  // USD equivalents
  totalSpentUSD: number;
  totalEarnedUSD: number;
  averageYapPriceUSD: number;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionAnalytics {
  userId: string;
  period: 'daily' | 'weekly' | 'monthly';
  startDate: Date;
  endDate: Date;
  
  // Transaction metrics
  totalTransactions: number;
  totalVolume: number; // Total YAP volume
  totalVolumeUSD: number; // Total USD volume
  averageTransactionSize: number;
  
  // User behavior
  mostUsedFeatures: {
    featureId: string;
    usageCount: number;
    percentageOfTotal: number;
  }[];
  
  // Spending patterns
  peakUsageHours: number[];
  peakUsageDays: string[];
  spendingTrend: 'increasing' | 'decreasing' | 'stable';
  
  // Allowance efficiency
  allowanceUtilization: number; // Percentage of allowance used
  freeVsPaidRatio: number; // Ratio of free allowance to paid usage
  
  generatedAt: Date;
}

// Transaction History Schema
export const TransactionHistorySchema = new MockSchema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  transactionType: {
    type: String,
    enum: ['spending', 'earning', 'allowance_reset', 'transfer', 'stake', 'unstake', 'reward'],
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  amountUSD: {
    type: Number,
    min: 0
  },
  featureId: {
    type: String,
    index: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  
  // Transaction context
  walletAddress: {
    type: String,
    index: true
  },
  contractAddress: String,
  blockNumber: {
    type: Number,
    index: true
  },
  transactionHash: {
    type: String,
    unique: true,
    sparse: true // Allow null values but enforce uniqueness when present
  },
  gasUsed: Number,
  gasPriceGwei: Number,
  
  // Pricing context
  yapPriceUSD: Number,
  oracleSource: String,
  priceTimestamp: Date,
  
  // Allowance tracking
  dailyAllowanceUsed: Number,
  remainingDailyAllowance: Number,
  weeklyAllowanceUsed: Number,
  remainingWeeklyAllowance: Number,
  
  // Status and processing
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed', 'refunded'],
    default: 'pending',
    index: true
  },
  errorMessage: String,
  retryCount: {
    type: Number,
    default: 0
  },
  processingStarted: Date,
  confirmedAt: {
    type: Date,
    index: true
  },
  
  // Metadata
  userAgent: String,
  ipAddress: String, // Should be hashed
  deviceInfo: {
    platform: String,
    browser: String,
    version: String
  }
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt
  collection: 'token_transactions'
});

// Transaction Summary Schema
export const TransactionSummarySchema = new MockSchema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  
  // Daily totals
  totalSpent: {
    type: Number,
    default: 0
  },
  totalEarned: {
    type: Number,
    default: 0
  },
  totalTransactions: {
    type: Number,
    default: 0
  },
  
  // Breakdown by transaction type
  spendingTransactions: {
    type: Number,
    default: 0
  },
  earningTransactions: {
    type: Number,
    default: 0
  },
  allowanceResets: {
    type: Number,
    default: 0
  },
  
  // Breakdown by feature
  featureUsage: [{
    featureId: String,
    transactionCount: Number,
    totalSpent: Number
  }],
  
  // Allowance usage
  dailyAllowanceUsed: {
    type: Number,
    default: 0
  },
  weeklyAllowanceUsed: {
    type: Number,
    default: 0
  },
  
  // USD equivalents
  totalSpentUSD: {
    type: Number,
    default: 0
  },
  totalEarnedUSD: {
    type: Number,
    default: 0
  },
  averageYapPriceUSD: Number
}, {
  timestamps: true,
  collection: 'transaction_summaries'
});

// Analytics Schema
export const TransactionAnalyticsSchema = new MockSchema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  period: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    required: true
  },
  startDate: {
    type: Date,
    required: true,
    index: true
  },
  endDate: {
    type: Date,
    required: true,
    index: true
  },
  
  // Transaction metrics
  totalTransactions: Number,
  totalVolume: Number,
  totalVolumeUSD: Number,
  averageTransactionSize: Number,
  
  // User behavior
  mostUsedFeatures: [{
    featureId: String,
    usageCount: Number,
    percentageOfTotal: Number
  }],
  
  // Spending patterns
  peakUsageHours: [Number],
  peakUsageDays: [String],
  spendingTrend: {
    type: String,
    enum: ['increasing', 'decreasing', 'stable']
  },
  
  // Allowance efficiency
  allowanceUtilization: Number,
  freeVsPaidRatio: Number,
  
  generatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'transaction_analytics'
});

// Compound indexes for efficient querying
TransactionHistorySchema.index({ userId: 1, createdAt: -1 });
TransactionHistorySchema.index({ userId: 1, transactionType: 1, createdAt: -1 });
TransactionHistorySchema.index({ userId: 1, featureId: 1, createdAt: -1 });
TransactionHistorySchema.index({ status: 1, createdAt: -1 });
TransactionHistorySchema.index({ transactionHash: 1 }, { unique: true, sparse: true });
TransactionHistorySchema.index({ blockNumber: -1 });

TransactionSummarySchema.index({ userId: 1, date: -1 }, { unique: true });
TransactionAnalyticsSchema.index({ userId: 1, period: 1, startDate: -1 });

/**
 * Service class for transaction history operations
 */
export class TransactionHistoryService {
  private TransactionModel: Model<TokenTransaction>;
  private SummaryModel: Model<TransactionSummary>;
  private AnalyticsModel: Model<TransactionAnalytics>;

  constructor() {
    // Mock model initialization
    this.TransactionModel = {} as Model<TokenTransaction>;
    this.SummaryModel = {} as Model<TransactionSummary>;
    this.AnalyticsModel = {} as Model<TransactionAnalytics>;
  }

  /**
   * Create a new transaction record
   */
  async createTransaction(transactionData: Partial<TokenTransaction>): Promise<TokenTransaction> {
    const transaction = await this.TransactionModel.create(transactionData);
    
    // Update daily summary asynchronously
    this.updateDailySummary(transactionData.userId!, new Date()).catch(error => {
      console.error('Failed to update daily summary:', error);
    });
    
    return transaction;
  }

  /**
   * Update transaction status
   */
  async updateTransactionStatus(
    transactionId: string, 
    status: TokenTransaction['status'],
    additionalData?: Partial<TokenTransaction>
  ): Promise<void> {
    const updateData = {
      status,
      ...additionalData,
      ...(status === 'confirmed' && { confirmedAt: new Date() })
    };

    await this.TransactionModel.updateOne({ _id: transactionId }, updateData);
  }

  /**
   * Get user transaction history with pagination
   */
  async getUserTransactions(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      transactionType?: string;
      featureId?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{
    transactions: TokenTransaction[];
    total: number;
    hasMore: boolean;
  }> {
    const {
      limit = 50,
      offset = 0,
      transactionType,
      featureId,
      startDate,
      endDate
    } = options;

    const filter: any = { userId };
    
    if (transactionType) filter.transactionType = transactionType;
    if (featureId) filter.featureId = featureId;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = startDate;
      if (endDate) filter.createdAt.$lte = endDate;
    }

    // Mock implementation
    const transactions: TokenTransaction[] = [];
    const total = 0;
    
    return {
      transactions,
      total,
      hasMore: total > offset + limit
    };
  }

  /**
   * Update daily transaction summary
   */
  private async updateDailySummary(userId: string, date: Date): Promise<void> {
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    // Aggregate daily transactions
    // In real implementation, this would use MongoDB aggregation pipeline
    const summary: Partial<TransactionSummary> = {
      userId,
      date: dayStart,
      totalSpent: 0,
      totalEarned: 0,
      totalTransactions: 0
      // ... other calculated fields
    };

    // Upsert summary
    await this.SummaryModel.updateOne(
      { userId, date: dayStart },
      summary,
      // { upsert: true } // In real implementation
    );
  }

  /**
   * Generate transaction analytics for a user
   */
  async generateAnalytics(
    userId: string,
    period: 'daily' | 'weekly' | 'monthly',
    startDate: Date,
    endDate: Date
  ): Promise<TransactionAnalytics> {
    // Mock implementation - in real app this would aggregate transaction data
    const analytics: TransactionAnalytics = {
      userId,
      period,
      startDate,
      endDate,
      totalTransactions: 0,
      totalVolume: 0,
      totalVolumeUSD: 0,
      averageTransactionSize: 0,
      mostUsedFeatures: [],
      peakUsageHours: [],
      peakUsageDays: [],
      spendingTrend: 'stable',
      allowanceUtilization: 0,
      freeVsPaidRatio: 0,
      generatedAt: new Date()
    };

    // Save analytics
    await this.AnalyticsModel.create(analytics);
    
    return analytics;
  }

  /**
   * Get transaction statistics for a user
   */
  async getUserStats(userId: string, days: number = 30): Promise<{
    totalSpent: number;
    totalEarned: number;
    transactionCount: number;
    averageDaily: number;
    mostUsedFeature: string;
    recentActivity: TokenTransaction[];
  }> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    // Mock implementation
    return {
      totalSpent: 0,
      totalEarned: 0,
      transactionCount: 0,
      averageDaily: 0,
      mostUsedFeature: 'lessons',
      recentActivity: []
    };
  }
}
