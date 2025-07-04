/**
 * YAP Pricing Tiers Configuration
 * Defines all pricing tiers, features, and limits for the platform
 */

export interface PricingFeatures {
  // Learning Features
  dailyLessons: number; // -1 for unlimited
  voiceEvaluations: number;
  pronunciationScoring: number;
  grammarChecks: number;
  ttsGenerations: number;
  
  // Advanced Features
  advancedAnalytics: boolean;
  prioritySupport: boolean;
  cloudStorage: number; // GB
  offlineAccess: boolean;
  customLearningPaths: boolean;
  bugBountyAccess: boolean;
  
  // AI Features
  aiTutor: boolean;
  speechAnalysis: boolean;
  personalizedContent: boolean;
  
  // Collaboration Features
  teamManagement: boolean;
  progressSharing: boolean;
  competitiveLeaderboards: boolean;
}

export interface PricingLimits {
  // Rate Limits
  requestsPerMinute: number;
  requestsPerDay: number;
  requestsPerMonth: number;
  
  // Service Limits
  maxFileUploadSize: number; // MB
  maxAudioLength: number; // seconds
  maxSessionDuration: number; // minutes
  
  // API Limits
  apiCallsPerDay: number;
  webhookDeliveries: number;
  dataExportFrequency: 'daily' | 'weekly' | 'monthly' | 'unlimited';
}

export interface PricingTier {
  id: string;
  name: string;
  description: string;
  price: number; // USD per month
  annual_discount: number; // percentage
  popular: boolean;
  features: PricingFeatures;
  limits: PricingLimits;
  stripe_price_id?: string;
  stripe_annual_price_id?: string;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Perfect for getting started with language learning',
    price: 0,
    annual_discount: 0,
    popular: false,
    features: {
      // Learning Features
      dailyLessons: 1,
      voiceEvaluations: 5,
      pronunciationScoring: 3,
      grammarChecks: 10,
      ttsGenerations: 20,
      
      // Advanced Features
      advancedAnalytics: false,
      prioritySupport: false,
      cloudStorage: 0.1,
      offlineAccess: false,
      customLearningPaths: false,
      bugBountyAccess: false,
      
      // AI Features
      aiTutor: false,
      speechAnalysis: false,
      personalizedContent: false,
      
      // Collaboration Features
      teamManagement: false,
      progressSharing: false,
      competitiveLeaderboards: true
    },
    limits: {
      // Rate Limits
      requestsPerMinute: 10,
      requestsPerDay: 100,
      requestsPerMonth: 1000,
      
      // Service Limits
      maxFileUploadSize: 5,
      maxAudioLength: 30,
      maxSessionDuration: 30,
      
      // API Limits
      apiCallsPerDay: 50,
      webhookDeliveries: 10,
      dataExportFrequency: 'weekly'
    }
  },
  {
    id: 'basic',
    name: 'Basic',
    description: 'Enhanced learning with more practice opportunities',
    price: 9.99,
    annual_discount: 20,
    popular: false,
    features: {
      // Learning Features
      dailyLessons: 3,
      voiceEvaluations: 25,
      pronunciationScoring: 15,
      grammarChecks: 50,
      ttsGenerations: 100,
      
      // Advanced Features
      advancedAnalytics: true,
      prioritySupport: false,
      cloudStorage: 1,
      offlineAccess: true,
      customLearningPaths: false,
      bugBountyAccess: false,
      
      // AI Features
      aiTutor: false,
      speechAnalysis: true,
      personalizedContent: true,
      
      // Collaboration Features
      teamManagement: false,
      progressSharing: true,
      competitiveLeaderboards: true
    },
    limits: {
      // Rate Limits
      requestsPerMinute: 30,
      requestsPerDay: 500,
      requestsPerMonth: 10000,
      
      // Service Limits
      maxFileUploadSize: 25,
      maxAudioLength: 120,
      maxSessionDuration: 60,
      
      // API Limits
      apiCallsPerDay: 200,
      webhookDeliveries: 50,
      dataExportFrequency: 'weekly'
    }
  },
  {
    id: 'premium',
    name: 'Premium',
    description: 'Unlimited learning with AI-powered features',
    price: 19.99,
    annual_discount: 25,
    popular: true,
    features: {
      // Learning Features
      dailyLessons: -1, // unlimited
      voiceEvaluations: 100,
      pronunciationScoring: 50,
      grammarChecks: 200,
      ttsGenerations: 500,
      
      // Advanced Features
      advancedAnalytics: true,
      prioritySupport: true,
      cloudStorage: 5,
      offlineAccess: true,
      customLearningPaths: true,
      bugBountyAccess: false,
      
      // AI Features
      aiTutor: true,
      speechAnalysis: true,
      personalizedContent: true,
      
      // Collaboration Features
      teamManagement: false,
      progressSharing: true,
      competitiveLeaderboards: true
    },
    limits: {
      // Rate Limits
      requestsPerMinute: 60,
      requestsPerDay: 2000,
      requestsPerMonth: 50000,
      
      // Service Limits
      maxFileUploadSize: 100,
      maxAudioLength: 300,
      maxSessionDuration: 120,
      
      // API Limits
      apiCallsPerDay: 1000,
      webhookDeliveries: 200,
      dataExportFrequency: 'daily'
    }
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Full platform access with team management and bug bounty',
    price: 49.99,
    annual_discount: 30,
    popular: false,
    features: {
      // Learning Features
      dailyLessons: -1,
      voiceEvaluations: -1,
      pronunciationScoring: -1,
      grammarChecks: -1,
      ttsGenerations: -1,
      
      // Advanced Features
      advancedAnalytics: true,
      prioritySupport: true,
      cloudStorage: 50,
      offlineAccess: true,
      customLearningPaths: true,
      bugBountyAccess: true,
      
      // AI Features
      aiTutor: true,
      speechAnalysis: true,
      personalizedContent: true,
      
      // Collaboration Features
      teamManagement: true,
      progressSharing: true,
      competitiveLeaderboards: true
    },
    limits: {
      // Rate Limits
      requestsPerMinute: 120,
      requestsPerDay: -1, // unlimited
      requestsPerMonth: -1, // unlimited
      
      // Service Limits
      maxFileUploadSize: 500,
      maxAudioLength: -1, // unlimited
      maxSessionDuration: -1, // unlimited
      
      // API Limits
      apiCallsPerDay: -1, // unlimited
      webhookDeliveries: -1, // unlimited
      dataExportFrequency: 'unlimited'
    }
  }
];

/**
 * Get pricing tier by ID
 */
export function getPricingTier(tierId: string): PricingTier | undefined {
  return PRICING_TIERS.find(tier => tier.id === tierId);
}

/**
 * Get default tier for new users
 */
export function getDefaultTier(): PricingTier {
  return PRICING_TIERS[0]; // Free tier
}

/**
 * Check if a feature is available for a tier
 */
export function hasFeature(tierId: string, feature: keyof PricingFeatures): boolean {
  const tier = getPricingTier(tierId);
  return tier ? tier.features[feature] as boolean : false;
}

/**
 * Get usage limit for a tier
 */
export function getUsageLimit(tierId: string, limitType: keyof PricingLimits): number {
  const tier = getPricingTier(tierId);
  return tier ? tier.limits[limitType] as number : 0;
}

/**
 * Check if usage is within limits
 */
export function isWithinLimit(tierId: string, limitType: keyof PricingLimits, currentUsage: number): boolean {
  const limit = getUsageLimit(tierId, limitType);
  return limit === -1 || currentUsage <= limit; // -1 means unlimited
}

/**
 * Get recommended tier based on usage patterns
 */
export function getRecommendedTier(usage: Partial<PricingLimits>): PricingTier {
  for (let i = PRICING_TIERS.length - 1; i >= 0; i--) {
    const tier = PRICING_TIERS[i];
    const withinLimits = Object.entries(usage).every(([key, value]) => {
      const limit = tier.limits[key as keyof PricingLimits];
      return limit === -1 || (value as number) <= (limit as number);
    });
    
    if (withinLimits) {
      return tier;
    }
  }
  
  return PRICING_TIERS[PRICING_TIERS.length - 1]; // Enterprise tier
}

/**
 * Calculate annual pricing with discount
 */
export function getAnnualPrice(tier: PricingTier): number {
  const monthlyTotal = tier.price * 12;
  const discount = monthlyTotal * (tier.annual_discount / 100);
  return monthlyTotal - discount;
}

/**
 * Get tier comparison data for frontend
 */
export function getTierComparison() {
  return PRICING_TIERS.map(tier => ({
    ...tier,
    annualPrice: getAnnualPrice(tier),
    monthlySavings: tier.price * (tier.annual_discount / 100),
    featuresCount: Object.values(tier.features).filter(Boolean).length
  }));
}
