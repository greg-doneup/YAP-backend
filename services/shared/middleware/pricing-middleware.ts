/**
 * YAP Token-Based Pricing Middleware
 * Implements the YAP Token Cost Matrix with daily allowances and token-based payments
 * Integrates with existing security middleware to enforce token limits and track usage
 */

import { Request, Response, NextFunction } from 'express';
import { UserSubscription, UsageRecord } from '../models/pricing-schema';
import { YAP_TOKEN_MATRIX, getFeatureConfig, calculateTokenCost } from '../config/yap-token-matrix';

export interface PricingRequest extends Request {
  user?: {
    userId: string;
    walletAddress?: string;
    ethWalletAddress?: string;
    email?: string;
    [key: string]: any;
  };
  pricing?: {
    subscription: any;
    tier: any;
    usage: any;
  };
}

export interface ServiceUsageConfig {
  serviceType: 'learning' | 'voice' | 'pronunciation' | 'grammar' | 'tts' | 'api' | 'storage';
  featureKey: string;
  limitKey: string;
  costPerUnit: number; // micro USD
  units?: number; // default 1
}

/**
 * Main Pricing Middleware Class
 * Extends existing security infrastructure with pricing enforcement
 */
export class PricingMiddleware {
  private static instance: PricingMiddleware;

  // Service configuration mapping
  private serviceConfigs: Map<string, ServiceUsageConfig> = new Map([
    // Learning Service
    ['/learning/daily', { serviceType: 'learning', featureKey: 'dailyLessons', limitKey: 'requestsPerDay', costPerUnit: 100, units: 1 }],
    ['/learning/quiz', { serviceType: 'learning', featureKey: 'dailyLessons', limitKey: 'requestsPerDay', costPerUnit: 150, units: 1 }],
    
    // Voice Services
    ['/voice/evaluate', { serviceType: 'voice', featureKey: 'voiceEvaluations', limitKey: 'requestsPerDay', costPerUnit: 500, units: 1 }],
    ['/pronunciation/score', { serviceType: 'pronunciation', featureKey: 'pronunciationScoring', limitKey: 'requestsPerDay', costPerUnit: 300, units: 1 }],
    
    // Grammar Service
    ['/grammar/check', { serviceType: 'grammar', featureKey: 'grammarChecks', limitKey: 'requestsPerDay', costPerUnit: 200, units: 1 }],
    
    // TTS Service
    ['/tts/generate', { serviceType: 'tts', featureKey: 'ttsGenerations', limitKey: 'requestsPerDay', costPerUnit: 250, units: 1 }],
    
    // API Access
    ['/api/', { serviceType: 'api', featureKey: 'apiCallsPerDay', limitKey: 'apiCallsPerDay', costPerUnit: 50, units: 1 }]
  ]);

  public static getInstance(): PricingMiddleware {
    if (!PricingMiddleware.instance) {
      PricingMiddleware.instance = new PricingMiddleware();
    }
    return PricingMiddleware.instance;
  }

  /**
   * Main pricing middleware function
   * Checks usage limits and enforces pricing restrictions
   */
  public enforcePricing() {
    return async (req: PricingRequest, res: Response, next: NextFunction) => {
      try {
        // Skip pricing for health checks and public endpoints
        if (this.isPublicEndpoint(req.path)) {
          return next();
        }

        // Ensure user is authenticated
        if (!req.user?.userId) {
          return res.status(401).json({
            error: 'authentication_required',
            message: 'User authentication required for pricing enforcement'
          });
        }

        // Get user subscription and current usage
        const subscription = await this.getUserSubscription(req.user.userId);
        const tier = getPricingTier(subscription.tierId);
        
        if (!tier) {
          return res.status(500).json({
            error: 'invalid_tier',
            message: 'User has invalid pricing tier'
          });
        }

        // Attach pricing info to request for other middleware
        req.pricing = {
          subscription,
          tier,
          usage: subscription.usage
        };

        // Check service-specific limits
        const serviceConfig = this.getServiceConfig(req.path);
        if (serviceConfig) {
          const limitCheck = await this.checkServiceLimits(
            req.user.userId,
            serviceConfig,
            tier,
            subscription.usage
          );

          if (!limitCheck.allowed) {
            return res.status(429).json({
              error: 'usage_limit_exceeded',
              message: limitCheck.message,
              details: {
                currentTier: tier.name,
                feature: serviceConfig.featureKey,
                usageCount: limitCheck.currentUsage,
                limit: limitCheck.limit,
                upgradeUrl: '/pricing',
                resetDate: subscription.usage.lastResetDate
              }
            });
          }
        }

        // Check feature access for premium features
        const featureCheck = this.checkFeatureAccess(req.path, tier);
        if (!featureCheck.allowed) {
          return res.status(403).json({
            error: 'premium_feature_required',
            message: featureCheck.message,
            details: {
              currentTier: tier.name,
              requiredFeature: featureCheck.feature,
              upgradeUrl: '/pricing'
            }
          });
        }

        // Pre-track usage (actual tracking happens in response middleware)
        this.preTrackUsage(req);

        next();
      } catch (error) {
        console.error('Pricing middleware error:', error);
        return res.status(500).json({
          error: 'pricing_check_failed',
          message: 'Failed to validate pricing limits'
        });
      }
    };
  }

  /**
   * Response middleware to track actual usage after successful request
   */
  public trackUsage() {
    return (req: PricingRequest, res: Response, next: NextFunction) => {
      const originalSend = res.send;
      const originalJson = res.json;

      // Intercept response to track usage
      const trackUsageAfterResponse = async (body: any) => {
        try {
          if (req.user?.userId && res.statusCode < 400) {
            const serviceConfig = this.getServiceConfig(req.path);
            if (serviceConfig && req.pricing) {
              await this.recordUsage(req, serviceConfig, body);
              await this.updateSubscriptionUsage(req.user.userId, serviceConfig);
            }
          }
        } catch (error) {
          console.error('Usage tracking error:', error);
          // Don't fail the response for tracking errors
        }
      };

      res.send = function(body: any) {
        trackUsageAfterResponse(body);
        return originalSend.call(this, body);
      };

      res.json = function(body: any) {
        trackUsageAfterResponse(body);
        return originalJson.call(this, body);
      };

      next();
    };
  }

  /**
   * Feature gating decorator for premium features
   */
  public requiresFeature(featureName: string) {
    return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
      const method = descriptor.value;
      descriptor.value = async function(...args: any[]) {
        const req = args[0] as PricingRequest;
        
        if (!req.pricing?.tier) {
          throw new Error('Pricing information not available');
        }

        if (!hasFeature(req.pricing.tier.id, featureName as any)) {
          throw new Error(`Feature '${featureName}' requires premium subscription`);
        }

        return method.apply(this, args);
      };
    };
  }

  /**
   * Get or create user subscription
   */
  private async getUserSubscription(userId: string) {
    let subscription = await UserSubscription.findOne({ userId });
    
    if (!subscription) {
      // Create default free subscription for new users
      subscription = new UserSubscription({
        userId,
        email: '', // Will be populated later
        tierId: 'free',
        status: 'active',
        billingCycle: 'monthly',
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year for free
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        autoRenew: true,
        usage: {
          dailyLessonsUsed: 0,
          voiceEvaluationsUsed: 0,
          pronunciationScoringUsed: 0,
          grammarChecksUsed: 0,
          ttsGenerationsUsed: 0,
          apiCallsUsed: 0,
          storageUsed: 0,
          lastResetDate: new Date(),
          currentPeriodStart: new Date()
        },
        metadata: {
          trialUsed: false,
          originalTier: 'free',
          upgradeHistory: []
        }
      });
      
      await subscription.save();
    }

    // Reset usage if period has expired
    await this.resetUsageIfNeeded(subscription);
    
    return subscription;
  }

  /**
   * Check if current period has expired and reset usage
   */
  private async resetUsageIfNeeded(subscription: any) {
    const now = new Date();
    const periodEnd = new Date(subscription.usage.currentPeriodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    if (now > periodEnd) {
      subscription.usage = {
        ...subscription.usage,
        dailyLessonsUsed: 0,
        voiceEvaluationsUsed: 0,
        pronunciationScoringUsed: 0,
        grammarChecksUsed: 0,
        ttsGenerationsUsed: 0,
        apiCallsUsed: 0,
        lastResetDate: now,
        currentPeriodStart: now
      };

      subscription.currentPeriodStart = now;
      subscription.currentPeriodEnd = periodEnd;
      
      await subscription.save();
    }
  }

  /**
   * Check service-specific usage limits
   */
  private async checkServiceLimits(
    userId: string,
    serviceConfig: ServiceUsageConfig,
    tier: any,
    usage: any
  ) {
    const currentUsage = this.getCurrentUsageCount(usage, serviceConfig.featureKey);
    const limit = tier.features[serviceConfig.featureKey];

    // -1 means unlimited
    if (limit === -1) {
      return { allowed: true, currentUsage, limit };
    }

    const allowed = currentUsage < limit;
    
    return {
      allowed,
      currentUsage,
      limit,
      message: allowed 
        ? null 
        : `${serviceConfig.featureKey} limit exceeded (${currentUsage}/${limit}). Upgrade to continue.`
    };
  }

  /**
   * Check feature access for premium features
   */
  private checkFeatureAccess(path: string, tier: any) {
    // Map endpoints to required features
    const featureMap: { [key: string]: string } = {
      '/learning/custom-path': 'customLearningPaths',
      '/analytics/advanced': 'advancedAnalytics',
      '/support/priority': 'prioritySupport',
      '/bug-bounty': 'bugBountyAccess',
      '/ai/tutor': 'aiTutor',
      '/speech/analysis': 'speechAnalysis'
    };

    for (const [endpoint, feature] of Object.entries(featureMap)) {
      if (path.includes(endpoint)) {
        const hasAccess = tier.features[feature];
        return {
          allowed: hasAccess,
          feature,
          message: hasAccess 
            ? null 
            : `Access to ${feature} requires premium subscription`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Get service configuration for endpoint
   */
  private getServiceConfig(path: string): ServiceUsageConfig | null {
    for (const [pattern, config] of this.serviceConfigs.entries()) {
      if (path.includes(pattern)) {
        return config;
      }
    }
    return null;
  }

  /**
   * Get current usage count for a feature
   */
  private getCurrentUsageCount(usage: any, featureKey: string): number {
    const usageMap: { [key: string]: string } = {
      'dailyLessons': 'dailyLessonsUsed',
      'voiceEvaluations': 'voiceEvaluationsUsed',
      'pronunciationScoring': 'pronunciationScoringUsed',
      'grammarChecks': 'grammarChecksUsed',
      'ttsGenerations': 'ttsGenerationsUsed',
      'apiCallsPerDay': 'apiCallsUsed'
    };

    const usageField = usageMap[featureKey];
    return usageField ? usage[usageField] || 0 : 0;
  }

  /**
   * Pre-track usage before request processing
   */
  private preTrackUsage(req: PricingRequest) {
    // Add timestamp for processing time calculation
    (req as any)._pricingStartTime = Date.now();
  }

  /**
   * Record detailed usage after successful request
   */
  private async recordUsage(req: PricingRequest, serviceConfig: ServiceUsageConfig, responseBody: any) {
    const processingTime = Date.now() - ((req as any)._pricingStartTime || Date.now());
    
    const usageRecord = new UsageRecord({
      userId: req.user!.userId,
      subscriptionId: req.pricing!.subscription._id,
      serviceType: serviceConfig.serviceType,
      endpoint: req.path,
      method: req.method,
      timestamp: new Date(),
      processingTime,
      success: true,
      costPerUnit: serviceConfig.costPerUnit,
      units: serviceConfig.units || 1,
      totalCost: serviceConfig.costPerUnit * (serviceConfig.units || 1),
      metadata: {
        userAgent: req.headers['user-agent'],
        requestSize: req.headers['content-length'] ? parseInt(req.headers['content-length'] as string) : 0,
        responseSize: JSON.stringify(responseBody).length,
        audioLength: responseBody?.audioLength,
        textLength: responseBody?.text?.length
      },
      billingPeriod: {
        start: req.pricing!.subscription.currentPeriodStart,
        end: req.pricing!.subscription.currentPeriodEnd
      }
    });

    await usageRecord.save();
  }

  /**
   * Update subscription usage counters
   */
  private async updateSubscriptionUsage(userId: string, serviceConfig: ServiceUsageConfig) {
    const updateField = this.getUsageUpdateField(serviceConfig.featureKey);
    
    if (updateField) {
      await UserSubscription.findOneAndUpdate(
        { userId },
        { 
          $inc: { [`usage.${updateField}`]: serviceConfig.units || 1 },
          updatedAt: new Date()
        }
      );
    }
  }

  /**
   * Map feature keys to usage update fields
   */
  private getUsageUpdateField(featureKey: string): string | null {
    const fieldMap: { [key: string]: string } = {
      'dailyLessons': 'dailyLessonsUsed',
      'voiceEvaluations': 'voiceEvaluationsUsed',
      'pronunciationScoring': 'pronunciationScoringUsed',
      'grammarChecks': 'grammarChecksUsed',
      'ttsGenerations': 'ttsGenerationsUsed',
      'apiCallsPerDay': 'apiCallsUsed'
    };

    return fieldMap[featureKey] || null;
  }

  /**
   * Check if endpoint is public (no pricing enforcement)
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
      '/pricing',
      '/public'
    ];

    return publicPaths.some(publicPath => path.includes(publicPath));
  }

  /**
   * Get pricing analytics for a user
   */
  public async getUserPricingAnalytics(userId: string) {
    const subscription = await UserSubscription.findOne({ userId });
    if (!subscription) {
      throw new Error('User subscription not found');
    }

    const tier = getPricingTier(subscription.tierId);
    const periodStart = subscription.usage.currentPeriodStart;
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    // Get usage records for current period
    const usageRecords = await UsageRecord.find({
      userId,
      timestamp: { $gte: periodStart, $lte: periodEnd }
    });

    // Calculate analytics
    const totalCost = usageRecords.reduce((sum, record) => sum + record.totalCost, 0);
    const totalRequests = usageRecords.length;
    
    const serviceBreakdown = usageRecords.reduce((breakdown, record) => {
      const service = record.serviceType;
      if (!breakdown[service]) {
        breakdown[service] = { requests: 0, cost: 0 };
      }
      breakdown[service].requests++;
      breakdown[service].cost += record.totalCost;
      return breakdown;
    }, {} as any);

    return {
      subscription,
      tier,
      currentPeriod: { start: periodStart, end: periodEnd },
      usage: subscription.usage,
      analytics: {
        totalCost,
        totalRequests,
        serviceBreakdown,
        utilizationPercentage: this.calculateUtilization(subscription.usage, tier),
        recommendedTier: this.getRecommendedTierForUser(subscription.usage)
      }
    };
  }

  /**
   * Calculate utilization percentage for each feature
   */
  private calculateUtilization(usage: any, tier: any) {
    const utilization: { [key: string]: number } = {};
    
    const features = [
      'dailyLessons',
      'voiceEvaluations', 
      'pronunciationScoring',
      'grammarChecks',
      'ttsGenerations'
    ];

    features.forEach(feature => {
      const used = this.getCurrentUsageCount(usage, feature);
      const limit = tier.features[feature];
      
      if (limit === -1) {
        utilization[feature] = 0; // Unlimited
      } else {
        utilization[feature] = Math.min(100, (used / limit) * 100);
      }
    });

    return utilization;
  }

  /**
   * Get recommended tier based on current usage
   */
  private getRecommendedTierForUser(usage: any) {
    // Find the lowest tier that accommodates current usage
    for (const tier of PRICING_TIERS) {
      const withinLimits = Object.entries(tier.features).every(([feature, limit]) => {
        if (typeof limit === 'number') {
          const currentUsage = this.getCurrentUsageCount(usage, feature);
          return limit === -1 || currentUsage <= limit;
        }
        return true;
      });

      if (withinLimits) {
        return tier;
      }
    }

    return PRICING_TIERS[PRICING_TIERS.length - 1]; // Enterprise
  }
}

// Export singleton instance and decorator
export const pricingMiddleware = PricingMiddleware.getInstance();
export const requiresFeature = pricingMiddleware.requiresFeature.bind(pricingMiddleware);
