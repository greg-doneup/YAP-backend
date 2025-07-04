/**
 * Oracle Fallback Service for YAP Token System
 * 
 * Provides fallback pricing mechanisms when the primary Chainlink oracle
 * fails or becomes unreliable. Implements multiple fallback strategies
 * and graceful degradation to ensure pricing continuity.
 * 
 * Features:
 * - Multiple fallback pricing sources
 * - Automatic failover detection and switching
 * - Price validation and confidence scoring
 * - Fallback strategy prioritization
 * - Emergency manual override capabilities
 * - Fallback performance monitoring
 */

import { PriceData } from './chainlink-oracle';
import { getOracleConfig, getCurrentConfig } from '../config/beta-mainnet-config';
import { TOKEN_ECONOMICS } from '../config/yap-token-matrix';

export interface FallbackSource {
  id: string;
  name: string;
  type: 'fixed' | 'api' | 'manual' | 'calculated';
  priority: number; // Lower number = higher priority
  isActive: boolean;
  confidence: number; // Base confidence level
  lastUsed?: Date;
  successRate: number; // 0-100
  averageResponseTime: number; // milliseconds
}

export interface FallbackStrategy {
  id: string;
  name: string;
  sources: FallbackSource[];
  weightingMethod: 'priority' | 'confidence' | 'weighted_average';
  minConfidence: number;
  maxAge: number; // seconds
}

export interface FallbackResult {
  price: number;
  confidence: number;
  source: FallbackSource;
  strategy: string;
  timestamp: Date;
  alternatives?: Array<{
    source: string;
    price: number;
    confidence: number;
  }>;
}

/**
 * Oracle Fallback Service
 */
export class OracleFallbackService {
  private static instance: OracleFallbackService;
  private fallbackSources: Map<string, FallbackSource> = new Map();
  private fallbackStrategies: Map<string, FallbackStrategy> = new Map();
  private lastPrices: Map<string, { price: number; timestamp: Date }> = new Map();
  private manualOverride: PriceData | null = null;
  private performanceMetrics: Map<string, any> = new Map();

  private constructor() {
    this.initializeFallbackSources();
    this.initializeFallbackStrategies();
  }

  static getInstance(): OracleFallbackService {
    if (!OracleFallbackService.instance) {
      OracleFallbackService.instance = new OracleFallbackService();
    }
    return OracleFallbackService.instance;
  }

  /**
   * Get fallback price when primary oracle fails
   */
  async getFallbackPrice(reason: string = 'primary_oracle_failure'): Promise<FallbackResult> {
    console.log(`Getting fallback price due to: ${reason}`);

    // Check for manual override first
    if (this.manualOverride && this.isManualOverrideValid()) {
      return {
        price: this.manualOverride.price,
        confidence: this.manualOverride.confidence,
        source: {
          id: 'manual_override',
          name: 'Manual Override',
          type: 'manual',
          priority: 0,
          isActive: true,
          confidence: this.manualOverride.confidence,
          successRate: 100,
          averageResponseTime: 0
        },
        strategy: 'manual_override',
        timestamp: new Date()
      };
    }

    // Try fallback strategies in order
    const strategies = Array.from(this.fallbackStrategies.values())
      .sort((a, b) => a.sources[0].priority - b.sources[0].priority);

    for (const strategy of strategies) {
      try {
        const result = await this.executeStrategy(strategy);
        if (result && result.confidence >= strategy.minConfidence) {
          this.updatePerformanceMetrics(result.source.id, true, 0);
          return result;
        }
      } catch (error) {
        console.error(`Fallback strategy ${strategy.id} failed:`, error);
      }
    }

    // Ultimate fallback - use configured fallback price
    const config = getOracleConfig();
    const ultimateSource: FallbackSource = {
      id: 'ultimate_fallback',
      name: 'Ultimate Fallback',
      type: 'fixed',
      priority: 999,
      isActive: true,
      confidence: 25, // Low confidence
      successRate: 100,
      averageResponseTime: 0
    };

    return {
      price: config.fallbackPrice,
      confidence: 25,
      source: ultimateSource,
      strategy: 'ultimate_fallback',
      timestamp: new Date()
    };
  }

  /**
   * Set manual price override
   */
  setManualOverride(price: number, confidence: number = 75, expiryMinutes: number = 60): void {
    this.manualOverride = {
      price,
      confidence,
      timestamp: new Date(),
      source: 'fallback' as const,
      deviation: 0
    };

    // Set expiry
    setTimeout(() => {
      this.manualOverride = null;
      console.log('Manual price override expired');
    }, expiryMinutes * 60 * 1000);

    console.log(`Manual price override set: $${price} (confidence: ${confidence}%, expires in ${expiryMinutes}min)`);
  }

  /**
   * Clear manual override
   */
  clearManualOverride(): void {
    this.manualOverride = null;
    console.log('Manual price override cleared');
  }

  /**
   * Get all available fallback sources
   */
  getFallbackSources(): FallbackSource[] {
    return Array.from(this.fallbackSources.values());
  }

  /**
   * Update fallback source status
   */
  updateSourceStatus(sourceId: string, isActive: boolean): void {
    const source = this.fallbackSources.get(sourceId);
    if (source) {
      source.isActive = isActive;
      console.log(`Fallback source ${sourceId} ${isActive ? 'activated' : 'deactivated'}`);
    }
  }

  /**
   * Get fallback performance metrics
   */
  getPerformanceMetrics(): Map<string, any> {
    return new Map(this.performanceMetrics);
  }

  /**
   * Test all fallback sources
   */
  async testAllSources(): Promise<Map<string, { success: boolean; price?: number; error?: string; responseTime: number }>> {
    const results = new Map();

    for (const source of this.fallbackSources.values()) {
      if (!source.isActive) {
        results.set(source.id, { success: false, error: 'Source inactive', responseTime: 0 });
        continue;
      }

      const startTime = Date.now();
      try {
        const price = await this.fetchFromSource(source);
        const responseTime = Date.now() - startTime;
        results.set(source.id, { success: true, price, responseTime });
      } catch (error) {
        const responseTime = Date.now() - startTime;
        results.set(source.id, { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error',
          responseTime 
        });
      }
    }

    return results;
  }

  /**
   * Private methods
   */

  /**
   * Initialize fallback sources
   */
  private initializeFallbackSources(): void {
    const sources: FallbackSource[] = [
      {
        id: 'last_known_good',
        name: 'Last Known Good Price',
        type: 'calculated',
        priority: 1,
        isActive: true,
        confidence: 60,
        successRate: 95,
        averageResponseTime: 5
      },
      {
        id: 'time_weighted_average',
        name: 'Time-Weighted Average',
        type: 'calculated',
        priority: 2,
        isActive: true,
        confidence: 55,
        successRate: 90,
        averageResponseTime: 10
      },
      {
        id: 'coingecko_api',
        name: 'CoinGecko API',
        type: 'api',
        priority: 3,
        isActive: true,
        confidence: 70,
        successRate: 85,
        averageResponseTime: 500
      },
      {
        id: 'coinmarketcap_api',
        name: 'CoinMarketCap API',
        type: 'api',
        priority: 4,
        isActive: true,
        confidence: 70,
        successRate: 80,
        averageResponseTime: 800
      },
      {
        id: 'fixed_fallback',
        name: 'Fixed Fallback Price',
        type: 'fixed',
        priority: 5,
        isActive: true,
        confidence: 30,
        successRate: 100,
        averageResponseTime: 0
      }
    ];

    sources.forEach(source => {
      this.fallbackSources.set(source.id, source);
    });
  }

  /**
   * Initialize fallback strategies
   */
  private initializeFallbackStrategies(): void {
    const strategies: FallbackStrategy[] = [
      {
        id: 'priority_cascade',
        name: 'Priority Cascade',
        sources: Array.from(this.fallbackSources.values())
          .sort((a, b) => a.priority - b.priority),
        weightingMethod: 'priority',
        minConfidence: 30,
        maxAge: 300 // 5 minutes
      },
      {
        id: 'confidence_weighted',
        name: 'Confidence Weighted Average',
        sources: Array.from(this.fallbackSources.values())
          .filter(s => s.confidence >= 50),
        weightingMethod: 'confidence',
        minConfidence: 50,
        maxAge: 180 // 3 minutes
      },
      {
        id: 'emergency_fallback',
        name: 'Emergency Fallback',
        sources: [this.fallbackSources.get('fixed_fallback')!],
        weightingMethod: 'priority',
        minConfidence: 0,
        maxAge: 3600 // 1 hour
      }
    ];

    strategies.forEach(strategy => {
      this.fallbackStrategies.set(strategy.id, strategy);
    });
  }

  /**
   * Execute a fallback strategy
   */
  private async executeStrategy(strategy: FallbackStrategy): Promise<FallbackResult | null> {
    const activeSources = strategy.sources.filter(s => s.isActive);
    
    if (activeSources.length === 0) {
      throw new Error(`No active sources for strategy ${strategy.id}`);
    }

    const sourceResults: Array<{ source: FallbackSource; price: number; confidence: number }> = [];

    // Fetch from all sources in the strategy
    for (const source of activeSources) {
      try {
        const startTime = Date.now();
        const price = await this.fetchFromSource(source);
        const responseTime = Date.now() - startTime;
        
        // Update source metrics
        source.averageResponseTime = (source.averageResponseTime * 0.9) + (responseTime * 0.1);
        
        if (price > 0) {
          sourceResults.push({
            source,
            price,
            confidence: this.calculateDynamicConfidence(source, price, responseTime)
          });
        }
      } catch (error) {
        console.error(`Source ${source.id} failed:`, error);
        this.updatePerformanceMetrics(source.id, false, 0);
      }
    }

    if (sourceResults.length === 0) {
      return null;
    }

    // Apply weighting method
    let finalPrice: number;
    let finalConfidence: number;
    let primarySource: FallbackSource;

    switch (strategy.weightingMethod) {
      case 'priority':
        // Use highest priority (lowest number) source
        const priorityResult = sourceResults
          .sort((a, b) => a.source.priority - b.source.priority)[0];
        finalPrice = priorityResult.price;
        finalConfidence = priorityResult.confidence;
        primarySource = priorityResult.source;
        break;

      case 'confidence':
        // Use highest confidence source
        const confidenceResult = sourceResults
          .sort((a, b) => b.confidence - a.confidence)[0];
        finalPrice = confidenceResult.price;
        finalConfidence = confidenceResult.confidence;
        primarySource = confidenceResult.source;
        break;

      case 'weighted_average':
        // Calculate weighted average by confidence
        const totalWeight = sourceResults.reduce((sum, r) => sum + r.confidence, 0);
        finalPrice = sourceResults.reduce((sum, r) => sum + (r.price * r.confidence), 0) / totalWeight;
        finalConfidence = totalWeight / sourceResults.length;
        primarySource = sourceResults[0].source; // Use first source as primary
        break;

      default:
        throw new Error(`Unknown weighting method: ${strategy.weightingMethod}`);
    }

    return {
      price: finalPrice,
      confidence: finalConfidence,
      source: primarySource,
      strategy: strategy.id,
      timestamp: new Date(),
      alternatives: sourceResults.slice(1).map(r => ({
        source: r.source.id,
        price: r.price,
        confidence: r.confidence
      }))
    };
  }

  /**
   * Fetch price from a specific source
   */
  private async fetchFromSource(source: FallbackSource): Promise<number> {
    switch (source.type) {
      case 'fixed':
        const config = getOracleConfig();
        return config.fallbackPrice;

      case 'calculated':
        return this.getCalculatedPrice(source.id);

      case 'api':
        return this.fetchFromAPI(source.id);

      case 'manual':
        if (this.manualOverride) {
          return this.manualOverride.price;
        }
        throw new Error('No manual override set');

      default:
        throw new Error(`Unknown source type: ${source.type}`);
    }
  }

  /**
   * Get calculated price (last known good, averages, etc.)
   */
  private getCalculatedPrice(sourceId: string): number {
    switch (sourceId) {
      case 'last_known_good':
        // Return the most recent reliable price
        const lastPrice = this.lastPrices.get('primary_oracle');
        if (lastPrice && Date.now() - lastPrice.timestamp.getTime() < 3600000) { // 1 hour
          return lastPrice.price;
        }
        throw new Error('No recent reliable price available');

      case 'time_weighted_average':
        // Calculate time-weighted average from recent prices
        const recentPrices = Array.from(this.lastPrices.values())
          .filter(p => Date.now() - p.timestamp.getTime() < 1800000) // 30 minutes
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        
        if (recentPrices.length === 0) {
          throw new Error('No recent prices for average calculation');
        }

        // Simple average for now - could implement true time weighting
        const sum = recentPrices.reduce((acc, p) => acc + p.price, 0);
        return sum / recentPrices.length;

      default:
        throw new Error(`Unknown calculated price type: ${sourceId}`);
    }
  }

  /**
   * Fetch from external API (mock implementation)
   */
  private async fetchFromAPI(sourceId: string): Promise<number> {
    // Mock implementation - in reality would call actual APIs
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate API failures
        if (Math.random() < 0.1) { // 10% failure rate
          reject(new Error(`${sourceId} API unavailable`));
          return;
        }

        // Return price with some variation
        const basePrice = TOKEN_ECONOMICS.FALLBACK_YAP_PRICE_USD;
        const variation = (Math.random() - 0.5) * 0.02; // ±1% variation
        resolve(basePrice * (1 + variation));
      }, 200 + Math.random() * 800); // 200-1000ms response time
    });
  }

  /**
   * Calculate dynamic confidence based on source performance
   */
  private calculateDynamicConfidence(source: FallbackSource, price: number, responseTime: number): number {
    let confidence = source.confidence;

    // Adjust for response time
    if (responseTime > 2000) { // > 2 seconds
      confidence *= 0.8;
    } else if (responseTime < 500) { // < 500ms
      confidence *= 1.1;
    }

    // Adjust for success rate
    confidence *= (source.successRate / 100);

    // Adjust for price reasonableness
    const config = getOracleConfig();
    const deviation = Math.abs(price - config.fallbackPrice) / config.fallbackPrice;
    if (deviation > 0.2) { // > 20% deviation
      confidence *= 0.7;
    }

    return Math.min(Math.max(confidence, 0), 100);
  }

  /**
   * Check if manual override is still valid
   */
  private isManualOverrideValid(): boolean {
    if (!this.manualOverride) return false;
    
    // Check if override has expired (assume 1 hour default)
    const ageMs = Date.now() - this.manualOverride.timestamp.getTime();
    return ageMs < 3600000; // 1 hour
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(sourceId: string, success: boolean, responseTime: number): void {
    const metrics = this.performanceMetrics.get(sourceId) || {
      totalRequests: 0,
      successfulRequests: 0,
      averageResponseTime: 0
    };

    metrics.totalRequests++;
    if (success) {
      metrics.successfulRequests++;
    }

    if (responseTime > 0) {
      metrics.averageResponseTime = (metrics.averageResponseTime * 0.9) + (responseTime * 0.1);
    }

    // Update success rate in the source
    const source = this.fallbackSources.get(sourceId);
    if (source) {
      source.successRate = (metrics.successfulRequests / metrics.totalRequests) * 100;
    }

    this.performanceMetrics.set(sourceId, metrics);
  }

  /**
   * Store price for future fallback calculations
   */
  storePriceForFallback(source: string, price: number): void {
    this.lastPrices.set(source, {
      price,
      timestamp: new Date()
    });

    // Keep only last 10 prices per source
    if (this.lastPrices.size > 100) {
      const entries = Array.from(this.lastPrices.entries());
      entries.sort((a, b) => b[1].timestamp.getTime() - a[1].timestamp.getTime());
      
      this.lastPrices.clear();
      entries.slice(0, 50).forEach(([key, value]) => {
        this.lastPrices.set(key, value);
      });
    }
  }
}

/**
 * Utility functions for fallback management
 */
export class FallbackUtils {
  /**
   * Validate fallback price against reasonable bounds
   */
  static validateFallbackPrice(price: number): { valid: boolean; reason?: string } {
    if (price <= 0) {
      return { valid: false, reason: 'Price must be positive' };
    }

    if (price > 1000) { // Sanity check: max $1000 per token
      return { valid: false, reason: 'Price exceeds maximum reasonable value' };
    }

    const config = getOracleConfig();
    const deviation = Math.abs(price - config.fallbackPrice) / config.fallbackPrice;
    
    if (deviation > 0.5) { // > 50% deviation
      return { valid: false, reason: 'Price deviates too much from expected value' };
    }

    return { valid: true };
  }

  /**
   * Format fallback result for logging/display
   */
  static formatFallbackResult(result: FallbackResult): string {
    return `Price: $${result.price.toFixed(6)} | Source: ${result.source.name} | Confidence: ${result.confidence.toFixed(1)}% | Strategy: ${result.strategy}`;
  }

  /**
   * Get recommended fallback configuration for environment
   */
  static getRecommendedConfig(): {
    enabledSources: string[];
    primaryStrategy: string;
    minConfidence: number;
  } {
    const env = getCurrentConfig().environment;

    switch (env) {
      case 'mainnet':
        return {
          enabledSources: ['last_known_good', 'time_weighted_average', 'coingecko_api', 'coinmarketcap_api'],
          primaryStrategy: 'confidence_weighted',
          minConfidence: 50
        };

      case 'beta':
        return {
          enabledSources: ['last_known_good', 'fixed_fallback'],
          primaryStrategy: 'priority_cascade',
          minConfidence: 30
        };

      case 'development':
        return {
          enabledSources: ['fixed_fallback'],
          primaryStrategy: 'emergency_fallback',
          minConfidence: 0
        };

      default:
        return {
          enabledSources: ['fixed_fallback'],
          primaryStrategy: 'emergency_fallback',
          minConfidence: 0
        };
    }
  }
}

export default OracleFallbackService;
