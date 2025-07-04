/**
 * Database Schema for YAP Pricing Matrix System
 * MongoDB Collections for subscription and usage tracking
 */

import { Schema, model, Document } from 'mongoose';

// ================================
// User Subscription Schema
// ================================

export interface IUserSubscription extends Document {
  userId: string;
  email: string;
  tierId: string;
  status: 'active' | 'cancelled' | 'expired' | 'trial' | 'past_due' | 'suspended';
  billingCycle: 'monthly' | 'annual';
  
  // Dates
  startDate: Date;
  endDate: Date;
  trialEndDate?: Date;
  cancelledAt?: Date;
  suspendedAt?: Date;
  
  // Payment
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  autoRenew: boolean;
  
  // Usage tracking (reset monthly)
  usage: {
    dailyLessonsUsed: number;
    voiceEvaluationsUsed: number;
    pronunciationScoringUsed: number;
    grammarChecksUsed: number;
    ttsGenerationsUsed: number;
    apiCallsUsed: number;
    storageUsed: number; // GB
    lastResetDate: Date;
    currentPeriodStart: Date;
  };
  
  // Metadata
  metadata: {
    trialUsed: boolean;
    originalTier: string;
    upgradeHistory: Array<{
      fromTier: string;
      toTier: string;
      date: Date;
      reason?: string;
    }>;
    cancellationReason?: string;
    cancellationFeedback?: string;
    referralCode?: string;
    promotionCode?: string;
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const UserSubscriptionSchema = new Schema<IUserSubscription>({
  userId: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, index: true },
  tierId: { type: String, required: true, index: true },
  status: { 
    type: String, 
    enum: ['active', 'cancelled', 'expired', 'trial', 'past_due', 'suspended'],
    default: 'trial',
    index: true
  },
  billingCycle: { 
    type: String, 
    enum: ['monthly', 'annual'],
    default: 'monthly'
  },
  
  // Dates
  startDate: { type: Date, required: true, default: Date.now },
  endDate: { type: Date, required: true },
  trialEndDate: { type: Date },
  cancelledAt: { type: Date },
  suspendedAt: { type: Date },
  
  // Payment
  stripeCustomerId: { type: String, sparse: true, index: true },
  stripeSubscriptionId: { type: String, sparse: true, index: true },
  currentPeriodStart: { type: Date, required: true, default: Date.now },
  currentPeriodEnd: { type: Date, required: true },
  autoRenew: { type: Boolean, default: true },
  
  // Usage tracking
  usage: {
    dailyLessonsUsed: { type: Number, default: 0 },
    voiceEvaluationsUsed: { type: Number, default: 0 },
    pronunciationScoringUsed: { type: Number, default: 0 },
    grammarChecksUsed: { type: Number, default: 0 },
    ttsGenerationsUsed: { type: Number, default: 0 },
    apiCallsUsed: { type: Number, default: 0 },
    storageUsed: { type: Number, default: 0 },
    lastResetDate: { type: Date, default: Date.now },
    currentPeriodStart: { type: Date, default: Date.now }
  },
  
  // Metadata
  metadata: {
    trialUsed: { type: Boolean, default: false },
    originalTier: { type: String, required: true },
    upgradeHistory: [{
      fromTier: { type: String, required: true },
      toTier: { type: String, required: true },
      date: { type: Date, default: Date.now },
      reason: { type: String }
    }],
    cancellationReason: { type: String },
    cancellationFeedback: { type: String },
    referralCode: { type: String },
    promotionCode: { type: String }
  }
}, {
  timestamps: true,
  collection: 'user_subscriptions'
});

// Indexes for performance
UserSubscriptionSchema.index({ userId: 1, status: 1 });
UserSubscriptionSchema.index({ tierId: 1, status: 1 });
UserSubscriptionSchema.index({ stripeSubscriptionId: 1 }, { sparse: true });
UserSubscriptionSchema.index({ endDate: 1, status: 1 });

export const UserSubscription = model<IUserSubscription>('UserSubscription', UserSubscriptionSchema);

// ================================
// Usage Record Schema
// ================================

export interface IUsageRecord extends Document {
  userId: string;
  subscriptionId: string;
  serviceType: 'learning' | 'voice' | 'pronunciation' | 'grammar' | 'tts' | 'api' | 'storage';
  endpoint: string;
  method: string;
  
  // Usage details
  timestamp: Date;
  processingTime: number; // milliseconds
  success: boolean;
  errorCode?: string;
  
  // Cost calculation
  costPerUnit: number; // micro USD
  units: number;
  totalCost: number; // micro USD
  
  // Request metadata
  metadata: {
    userAgent?: string;
    ipAddress?: string;
    requestSize?: number; // bytes
    responseSize?: number; // bytes
    audioLength?: number; // seconds for audio services
    textLength?: number; // characters for text services
    modelUsed?: string; // AI model identifier
    qualityLevel?: string;
  };
  
  // Billing period
  billingPeriod: {
    start: Date;
    end: Date;
  };
}

const UsageRecordSchema = new Schema<IUsageRecord>({
  userId: { type: String, required: true, index: true },
  subscriptionId: { type: String, required: true, index: true },
  serviceType: { 
    type: String, 
    enum: ['learning', 'voice', 'pronunciation', 'grammar', 'tts', 'api', 'storage'],
    required: true,
    index: true
  },
  endpoint: { type: String, required: true },
  method: { type: String, required: true },
  
  // Usage details
  timestamp: { type: Date, required: true, default: Date.now, index: true },
  processingTime: { type: Number, required: true },
  success: { type: Boolean, required: true, index: true },
  errorCode: { type: String },
  
  // Cost calculation
  costPerUnit: { type: Number, required: true },
  units: { type: Number, required: true, default: 1 },
  totalCost: { type: Number, required: true },
  
  // Request metadata
  metadata: {
    userAgent: { type: String },
    ipAddress: { type: String, select: false }, // Security: don't select by default
    requestSize: { type: Number },
    responseSize: { type: Number },
    audioLength: { type: Number },
    textLength: { type: Number },
    modelUsed: { type: String },
    qualityLevel: { type: String }
  },
  
  // Billing period
  billingPeriod: {
    start: { type: Date, required: true },
    end: { type: Date, required: true }
  }
}, {
  timestamps: false, // We have our own timestamp
  collection: 'usage_records'
});

// Compound indexes for efficient querying
UsageRecordSchema.index({ userId: 1, timestamp: -1 });
UsageRecordSchema.index({ userId: 1, serviceType: 1, timestamp: -1 });
UsageRecordSchema.index({ subscriptionId: 1, timestamp: -1 });
UsageRecordSchema.index({ 'billingPeriod.start': 1, 'billingPeriod.end': 1 });
UsageRecordSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 }); // 1 year TTL

export const UsageRecord = model<IUsageRecord>('UsageRecord', UsageRecordSchema);

// ================================
// Billing Summary Schema
// ================================

export interface IBillingSummary extends Document {
  userId: string;
  subscriptionId: string;
  period: {
    start: Date;
    end: Date;
    type: 'monthly' | 'annual';
  };
  
  // Usage summary
  usage: {
    totalRequests: number;
    totalCost: number; // micro USD
    serviceBreakdown: {
      learning: { requests: number; cost: number };
      voice: { requests: number; cost: number };
      pronunciation: { requests: number; cost: number };
      grammar: { requests: number; cost: number };
      tts: { requests: number; cost: number };
      api: { requests: number; cost: number };
      storage: { requests: number; cost: number };
    };
  };
  
  // Billing details
  billing: {
    subscriptionFee: number; // cents
    usageOverage: number; // cents
    discounts: number; // cents
    taxes: number; // cents
    total: number; // cents
    currency: string;
    status: 'draft' | 'finalized' | 'paid' | 'failed';
  };
  
  // Payment information
  payment: {
    stripeInvoiceId?: string;
    paymentDate?: Date;
    paymentMethod?: string;
    transactionId?: string;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const BillingSummarySchema = new Schema<IBillingSummary>({
  userId: { type: String, required: true, index: true },
  subscriptionId: { type: String, required: true, index: true },
  
  period: {
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    type: { type: String, enum: ['monthly', 'annual'], required: true }
  },
  
  usage: {
    totalRequests: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    serviceBreakdown: {
      learning: { requests: { type: Number, default: 0 }, cost: { type: Number, default: 0 } },
      voice: { requests: { type: Number, default: 0 }, cost: { type: Number, default: 0 } },
      pronunciation: { requests: { type: Number, default: 0 }, cost: { type: Number, default: 0 } },
      grammar: { requests: { type: Number, default: 0 }, cost: { type: Number, default: 0 } },
      tts: { requests: { type: Number, default: 0 }, cost: { type: Number, default: 0 } },
      api: { requests: { type: Number, default: 0 }, cost: { type: Number, default: 0 } },
      storage: { requests: { type: Number, default: 0 }, cost: { type: Number, default: 0 } }
    }
  },
  
  billing: {
    subscriptionFee: { type: Number, required: true },
    usageOverage: { type: Number, default: 0 },
    discounts: { type: Number, default: 0 },
    taxes: { type: Number, default: 0 },
    total: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    status: { 
      type: String, 
      enum: ['draft', 'finalized', 'paid', 'failed'],
      default: 'draft'
    }
  },
  
  payment: {
    stripeInvoiceId: { type: String },
    paymentDate: { type: Date },
    paymentMethod: { type: String },
    transactionId: { type: String }
  }
}, {
  timestamps: true,
  collection: 'billing_summaries'
});

// Indexes
BillingSummarySchema.index({ userId: 1, 'period.start': -1 });
BillingSummarySchema.index({ subscriptionId: 1, 'period.start': -1 });
BillingSummarySchema.index({ 'billing.status': 1, 'period.end': 1 });

export const BillingSummary = model<IBillingSummary>('BillingSummary', BillingSummarySchema);

// ================================
// Feature Toggle Schema
// ================================

export interface IFeatureToggle extends Document {
  featureName: string;
  description: string;
  enabled: boolean;
  tiersEnabled: string[]; // Array of tier IDs
  rolloutPercentage: number; // 0-100
  conditions: {
    userAttributes?: Record<string, any>;
    dateRange?: {
      start: Date;
      end: Date;
    };
    usageThreshold?: {
      metric: string;
      operator: 'gt' | 'lt' | 'eq';
      value: number;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

const FeatureToggleSchema = new Schema<IFeatureToggle>({
  featureName: { type: String, required: true, unique: true, index: true },
  description: { type: String, required: true },
  enabled: { type: Boolean, default: false },
  tiersEnabled: [{ type: String }],
  rolloutPercentage: { type: Number, min: 0, max: 100, default: 0 },
  
  conditions: {
    userAttributes: { type: Schema.Types.Mixed },
    dateRange: {
      start: { type: Date },
      end: { type: Date }
    },
    usageThreshold: {
      metric: { type: String },
      operator: { type: String, enum: ['gt', 'lt', 'eq'] },
      value: { type: Number }
    }
  }
}, {
  timestamps: true,
  collection: 'feature_toggles'
});

export const FeatureToggle = model<IFeatureToggle>('FeatureToggle', FeatureToggleSchema);

// ================================
// Export all models
// ================================

export {
  UserSubscription,
  UsageRecord,
  BillingSummary,
  FeatureToggle
};
