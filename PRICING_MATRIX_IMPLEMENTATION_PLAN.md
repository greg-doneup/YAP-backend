# YAP Pricing Matrix Implementation Plan

## Overview

This document outlines the implementation plan for integrating a comprehensive pricing matrix system into the YAP platform, leveraging existing infrastructure and adding new premium features.

## Current Infrastructure Assessment

### ✅ Existing Foundation
- **Points System**: Comprehensive XP tracking and history
- **Rate Limiting**: Service-specific limits across all 14 services
- **Security Middleware**: Real-time monitoring and audit logging
- **Blockchain Integration**: Token rewards, vesting, achievement badges
- **Billing Infrastructure**: Usage tracking with DynamoDB storage
- **User Tiers**: Basic tier system via burned token tracking

### 🎯 Implementation Strategy

## Phase 1: User Tier System (Week 1-2)

### 1.1 Define Pricing Tiers
```typescript
interface PricingTier {
  id: string;
  name: string;
  price: number; // USD per month
  features: {
    dailyLessons: number;
    voiceEvaluations: number;
    pronunciationScoring: number;
    grammarChecks: number;
    ttsGenerations: number;
    advancedAnalytics: boolean;
    prioritySupport: boolean;
    cloudStorage: number; // GB
    offlineAccess: boolean;
    customLearningPaths: boolean;
    bugBountyAccess: boolean;
  };
  limits: {
    requestsPerMinute: number;
    requestsPerDay: number;
    requestsPerMonth: number;
  };
}

const PRICING_TIERS: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    features: {
      dailyLessons: 1,
      voiceEvaluations: 10,
      pronunciationScoring: 5,
      grammarChecks: 20,
      ttsGenerations: 50,
      advancedAnalytics: false,
      prioritySupport: false,
      cloudStorage: 0.1,
      offlineAccess: false,
      customLearningPaths: false,
      bugBountyAccess: false
    },
    limits: {
      requestsPerMinute: 10,
      requestsPerDay: 100,
      requestsPerMonth: 1000
    }
  },
  {
    id: 'basic',
    name: 'Basic',
    price: 9.99,
    features: {
      dailyLessons: 5,
      voiceEvaluations: 50,
      pronunciationScoring: 25,
      grammarChecks: 100,
      ttsGenerations: 200,
      advancedAnalytics: true,
      prioritySupport: false,
      cloudStorage: 1,
      offlineAccess: true,
      customLearningPaths: false,
      bugBountyAccess: false
    },
    limits: {
      requestsPerMinute: 30,
      requestsPerDay: 500,
      requestsPerMonth: 10000
    }
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 19.99,
    features: {
      dailyLessons: -1, // unlimited
      voiceEvaluations: 200,
      pronunciationScoring: 100,
      grammarChecks: 500,
      ttsGenerations: 1000,
      advancedAnalytics: true,
      prioritySupport: true,
      cloudStorage: 5,
      offlineAccess: true,
      customLearningPaths: true,
      bugBountyAccess: false
    },
    limits: {
      requestsPerMinute: 60,
      requestsPerDay: 2000,
      requestsPerMonth: 50000
    }
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 49.99,
    features: {
      dailyLessons: -1,
      voiceEvaluations: -1,
      pronunciationScoring: -1,
      grammarChecks: -1,
      ttsGenerations: -1,
      advancedAnalytics: true,
      prioritySupport: true,
      cloudStorage: 50,
      offlineAccess: true,
      customLearningPaths: true,
      bugBountyAccess: true
    },
    limits: {
      requestsPerMinute: 120,
      requestsPerDay: -1,
      requestsPerMonth: -1
    }
  }
];
```

### 1.2 Database Schema Updates

#### User Subscription Model
```typescript
interface UserSubscription {
  userId: string;
  tierId: string;
  status: 'active' | 'cancelled' | 'expired' | 'trial';
  startDate: Date;
  endDate: Date;
  autoRenew: boolean;
  paymentMethod?: string;
  usage: {
    dailyLessonsUsed: number;
    voiceEvaluationsUsed: number;
    pronunciationScoringUsed: number;
    grammarChecksUsed: number;
    ttsGenerationsUsed: number;
    lastResetDate: Date;
  };
  metadata: {
    trialUsed: boolean;
    upgradeDate?: Date;
    downgradeDate?: Date;
    cancellationReason?: string;
  };
}
```

#### Usage Tracking Model
```typescript
interface UsageRecord {
  userId: string;
  serviceType: string;
  endpoint: string;
  timestamp: Date;
  cost: number; // in micro USD
  metadata: {
    success: boolean;
    processingTime: number;
    dataSize?: number;
  };
}
```

## Phase 2: Service Integration (Week 3-4)

### 2.1 Pricing Middleware

Create centralized pricing middleware that integrates with existing security middleware:

```typescript
// services/shared/middleware/pricing.ts
export class PricingMiddleware {
  async checkUsageLimits(req: Request, res: Response, next: NextFunction) {
    const userId = req.user?.userId;
    const serviceType = this.getServiceType(req.path);
    
    // Get user's current tier and usage
    const subscription = await this.getSubscription(userId);
    const currentUsage = await this.getCurrentUsage(userId, serviceType);
    
    // Check limits
    const allowed = this.checkLimits(subscription.tier, currentUsage, serviceType);
    
    if (!allowed) {
      return res.status(429).json({
        error: 'usage_limit_exceeded',
        message: 'Upgrade your plan to continue using this feature',
        currentTier: subscription.tier.name,
        upgradeUrl: '/pricing'
      });
    }
    
    // Track usage
    await this.trackUsage(userId, serviceType, req.path);
    next();
  }
}
```

### 2.2 Feature Gating

Implement feature gating for premium capabilities:

```typescript
// Decorator for premium features
export function requiresPremium(feature: string) {
  return function(target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    descriptor.value = async function(...args: any[]) {
      const req = args[0];
      const subscription = await getSubscription(req.user.userId);
      
      if (!subscription.tier.features[feature]) {
        throw new Error(`Feature '${feature}' requires premium subscription`);
      }
      
      return method.apply(this, args);
    };
  };
}

// Usage example in learning service
@requiresPremium('customLearningPaths')
async generateCustomPath(req: Request, res: Response) {
  // Premium feature implementation
}
```

## Phase 3: Enhanced Analytics (Week 5-6)

### 3.1 Advanced Analytics Dashboard

Extend existing dashboard capabilities for premium users:

```typescript
interface AdvancedAnalytics {
  learningVelocity: {
    wordsPerDay: number;
    lessonsPerWeek: number;
    retentionRate: number;
  };
  performanceMetrics: {
    pronunciationImprovement: number;
    grammarAccuracy: number;
    voiceClarity: number;
  };
  competitiveAnalysis: {
    userRanking: number;
    percentile: number;
    streakComparison: number;
  };
  predictiveInsights: {
    estimatedProficiency: string;
    recommendedStudyTime: number;
    weaknessAreas: string[];
  };
}
```

### 3.2 Usage Analytics

Implement comprehensive usage tracking:

```typescript
// services/analytics/src/pricing-analytics.ts
export class PricingAnalytics {
  async trackFeatureUsage(userId: string, feature: string, metadata: any) {
    await this.recordUsage({
      userId,
      feature,
      timestamp: new Date(),
      metadata,
      tierId: await this.getUserTier(userId)
    });
  }
  
  async generateUsageReport(userId: string, period: 'day' | 'week' | 'month') {
    // Generate detailed usage reports for premium users
  }
  
  async predictUsagePatterns(userId: string) {
    // ML-based usage prediction for tier recommendations
  }
}
```

## Phase 4: Bug Bounty Integration (Week 7-8)

### 4.1 Bug Bounty Platform

Integrate bug bounty access for enterprise users:

```typescript
interface BugBountyAccess {
  userId: string;
  accessLevel: 'viewer' | 'reporter' | 'validator';
  eligiblePrograms: string[];
  reputationScore: number;
  submissionHistory: {
    totalSubmissions: number;
    acceptedSubmissions: number;
    totalReward: number;
  };
}

// Middleware for bug bounty access
export function requiresBugBountyAccess(level: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const subscription = await getSubscription(req.user.userId);
    
    if (!subscription.tier.features.bugBountyAccess) {
      return res.status(403).json({
        error: 'access_denied',
        message: 'Bug bounty access requires Enterprise tier',
        upgradeUrl: '/pricing'
      });
    }
    
    next();
  };
}
```

### 4.2 Security Integration

Extend existing security infrastructure for bug bounty reporting:

```typescript
// Enhanced security monitoring for bug bounty
export class BugBountySecurityMonitor extends SecurityMiddleware {
  async reportSecurityIssue(req: Request, res: Response) {
    const report = {
      reporterId: req.user.userId,
      severity: req.body.severity,
      category: req.body.category,
      description: req.body.description,
      proof: req.body.proof,
      timestamp: new Date()
    };
    
    await this.validateBugBountyAccess(req.user.userId);
    await this.submitSecurityReport(report);
    
    res.json({ 
      message: 'Security report submitted successfully',
      reportId: report.id 
    });
  }
}
```

## Phase 5: Payment Integration (Week 9-10)

### 5.1 Payment Processing

Integrate with payment providers (Stripe recommended):

```typescript
// services/payment/src/subscription.ts
export class SubscriptionService {
  async createSubscription(userId: string, tierId: string, paymentMethod: string) {
    const tier = PRICING_TIERS.find(t => t.id === tierId);
    
    // Create Stripe subscription
    const subscription = await stripe.subscriptions.create({
      customer: await this.getStripeCustomer(userId),
      items: [{ price: tier.stripePriceId }],
      default_payment_method: paymentMethod
    });
    
    // Update user subscription in database
    await this.updateUserSubscription(userId, {
      tierId,
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      stripeSubscriptionId: subscription.id
    });
  }
  
  async handleWebhook(event: Stripe.Event) {
    switch (event.type) {
      case 'invoice.payment_succeeded':
        await this.renewSubscription(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailure(event.data.object);
        break;
    }
  }
}
```

### 5.2 Billing Integration

Extend existing billing infrastructure:

```typescript
// Extend services/observability-service/src/routes/billing.ts
router.get('/subscription-usage/:userId', async (req, res) => {
  const { userId } = req.params;
  const period = req.query.period || 'month';
  
  const usage = await getBillingUsage(userId, period);
  const subscription = await getSubscription(userId);
  const tier = PRICING_TIERS.find(t => t.id === subscription.tierId);
  
  res.json({
    tier: tier.name,
    usage,
    limits: tier.limits,
    utilizationPercentage: calculateUtilization(usage, tier.limits),
    recommendedTier: getRecommendedTier(usage)
  });
});
```

## Phase 6: Frontend Integration (Week 11-12)

### 6.1 Pricing Pages

Create comprehensive pricing interface:

```typescript
// YAP-frontend/src/app/modules/pricing/
interface PricingPageComponent {
  tiers: PricingTier[];
  currentUserTier: string;
  usage: UserUsage;
  
  async upgradeTier(tierId: string) {
    // Handle tier upgrade with payment
  }
  
  async cancelSubscription() {
    // Handle subscription cancellation
  }
}
```

### 6.2 Usage Dashboard

Extend existing dashboard with usage tracking:

```typescript
// Extend YAP-frontend/src/app/modules/dashboard/dashboard/dashboard.page.ts
interface UsageDashboard {
  subscription: UserSubscription;
  usage: CurrentUsage;
  analytics: AdvancedAnalytics; // Premium only
  
  getUsagePercentage(feature: string): number;
  getRecommendedTier(): PricingTier;
  showUpgradePrompt(): boolean;
}
```

## Implementation Timeline

| Phase | Duration | Deliverables | Dependencies |
|-------|----------|-------------|--------------|
| **Phase 1** | Week 1-2 | Tier definitions, database schema | None |
| **Phase 2** | Week 3-4 | Service integration, feature gating | Phase 1 |
| **Phase 3** | Week 5-6 | Advanced analytics, usage tracking | Phase 2 |
| **Phase 4** | Week 7-8 | Bug bounty integration | Phase 3 |
| **Phase 5** | Week 9-10 | Payment processing, billing | Phase 4 |
| **Phase 6** | Week 11-12 | Frontend integration, testing | Phase 5 |

## Risk Assessment

### Low Risk ✅
- **Existing Infrastructure**: Rate limiting and security already implemented
- **Database**: MongoDB schema extensions are straightforward
- **API Integration**: REST API patterns already established

### Medium Risk ⚠️
- **Payment Integration**: Requires careful testing with Stripe webhooks
- **Feature Migration**: Moving existing features behind premium gates
- **Performance Impact**: Additional middleware may affect response times

### High Risk ❌
- **User Experience**: Poorly implemented limits could frustrate users
- **Revenue Impact**: Incorrect pricing could affect business metrics
- **Security**: Payment processing requires enhanced security measures

## Success Metrics

### Technical Metrics
- **Response Time**: < 200ms additional latency from pricing middleware
- **Uptime**: 99.9% availability for payment processing
- **Error Rate**: < 0.1% for subscription operations

### Business Metrics
- **Conversion Rate**: Target 5% free-to-paid conversion
- **Retention**: 90% monthly retention for paid users
- **Usage Growth**: 20% increase in feature usage per tier

### User Experience Metrics
- **Satisfaction**: > 4.5/5 rating for premium features
- **Support Tickets**: < 2% increase related to pricing
- **Churn Rate**: < 5% monthly churn for paid tiers

## Next Steps

1. **Immediate**: Review and approve pricing tier structure
2. **Week 1**: Begin database schema implementation
3. **Week 2**: Start middleware development and testing
4. **Week 3**: Begin service integration rollout
5. **Ongoing**: Monitor metrics and user feedback

This implementation plan leverages YAP's existing robust infrastructure while adding comprehensive pricing capabilities that scale from free users to enterprise customers with bug bounty access.
