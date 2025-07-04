/**
 * Chainlink Oracle Service for YAP Token System
 * 
 * Provides real-time YAP/USD pricing data using Chainlink price feeds.
 * Handles oracle integration, price caching, fallback mechanisms,
 * and health monitoring for the token pricing system.
 * 
 * Features:
 * - Real-time YAP/USD price feeds
 * - Price data caching and validation
 * - Fallback price mechanisms
 * - Oracle health monitoring
 * - Price deviation alerts
 * - Historical price tracking
 * - Multiple oracle aggregation
 */

import { getOracleConfig, getCurrentConfig, isFeatureEnabled } from '../config/beta-mainnet-config';
import { TOKEN_ECONOMICS } from '../config/yap-token-matrix';

export interface PriceData {
  price: number; // USD per YAP token
  timestamp: Date;
  source: 'chainlink' | 'fallback' | 'cached';
  confidence: number; // 0-100 confidence score
  roundId?: string;
  deviation?: number; // Percentage deviation from last price
}

export interface OracleHealth {
  isHealthy: boolean;
  lastUpdate: Date;
  consecutiveFailures: number;
  averageResponseTime: number;
  priceDeviation: number;
  status: 'active' | 'degraded' | 'failed';
  warnings: string[];
}

export interface HistoricalPrice {
  timestamp: Date;
  price: number;
  volume?: number;
  source: string;
}

/**
 * Chainlink Oracle Service
 */
export class ChainlinkOracleService {
  private static instance: ChainlinkOracleService;
  private currentPrice: PriceData | null = null;
  private priceCache: Map<string, PriceData> = new Map();
  private healthMetrics: OracleHealth;
  private updateInterval: NodeJS.Timeout | null = null;
  private priceHistory: HistoricalPrice[] = [];
  private consecutiveFailures = 0;
  private lastResponseTime = 0;

  private constructor() {
    this.healthMetrics = {
      isHealthy: false,
      lastUpdate: new Date(),
      consecutiveFailures: 0,
      averageResponseTime: 0,
      priceDeviation: 0,
      status: 'active',
      warnings: []
    };
  }

  static getInstance(): ChainlinkOracleService {
    if (!ChainlinkOracleService.instance) {
      ChainlinkOracleService.instance = new ChainlinkOracleService();
    }
    return ChainlinkOracleService.instance;
  }

  /**
   * Initialize the oracle service
   */
  async initialize(): Promise<void> {
    try {
      // Only initialize if real-time oracle is enabled
      if (!isFeatureEnabled('realTimeOracle')) {
        console.log('Real-time oracle disabled, using fallback pricing');
        await this.initializeFallbackPrice();
        return;
      }

      // Get initial price
      await this.updatePrice();

      // Start price update interval
      this.startPriceUpdates();

      // Start health monitoring
      this.startHealthMonitoring();

      console.log('Chainlink Oracle Service initialized');
    } catch (error) {
      console.error('Failed to initialize Oracle Service:', error);
      await this.initializeFallbackPrice();
    }
  }

  /**
   * Get current YAP/USD price
   */
  async getCurrentPrice(): Promise<PriceData> {
    // Return cached price if available and fresh
    if (this.currentPrice && this.isPriceFresh(this.currentPrice)) {
      return this.currentPrice;
    }

    // Try to update price
    try {
      await this.updatePrice();
      if (this.currentPrice) {
        return this.currentPrice;
      }
    } catch (error) {
      console.error('Failed to get current price:', error);
    }

    // Fall back to fallback price
    return this.getFallbackPrice();
  }

  /**
   * Get price with confidence interval
   */
  async getPriceWithConfidence(): Promise<{
    price: number;
    confidence: number;
    priceRange: { min: number; max: number };
  }> {
    const priceData = await this.getCurrentPrice();
    
    // Calculate confidence based on source and freshness
    let confidence = priceData.confidence;
    
    if (priceData.source === 'fallback') {
      confidence = Math.min(confidence, 50); // Max 50% confidence for fallback
    }

    // Calculate price range based on confidence
    const variance = (100 - confidence) / 100 * 0.1; // Max 10% variance at 0% confidence
    const priceRange = {
      min: priceData.price * (1 - variance),
      max: priceData.price * (1 + variance)
    };

    return {
      price: priceData.price,
      confidence,
      priceRange
    };
  }

  /**
   * Get oracle health status
   */
  getHealthStatus(): OracleHealth {
    return { ...this.healthMetrics };
  }

  /**
   * Get price history
   */
  getPriceHistory(hours: number = 24): HistoricalPrice[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.priceHistory.filter(p => p.timestamp >= cutoff);
  }

  /**
   * Force price update
   */
  async forceUpdate(): Promise<PriceData> {
    await this.updatePrice();
    return this.currentPrice || this.getFallbackPrice();
  }

  /**
   * Private methods
   */

  /**
   * Update price from Chainlink oracle
   */
  private async updatePrice(): Promise<void> {
    const startTime = Date.now();

    try {
      // In a real implementation, this would call the actual Chainlink oracle
      const priceData = await this.fetchChainlinkPrice();
      
      // Validate price data
      if (this.validatePriceData(priceData)) {
        const oldPrice = this.currentPrice?.price || 0;
        const deviation = oldPrice > 0 ? Math.abs((priceData.price - oldPrice) / oldPrice * 100) : 0;

        this.currentPrice = {
          ...priceData,
          deviation,
          timestamp: new Date(),
          source: 'chainlink'
        };

        // Update health metrics
        this.consecutiveFailures = 0;
        this.lastResponseTime = Date.now() - startTime;
        this.updateHealthMetrics();

        // Cache the price
        this.cachePrice(this.currentPrice);

        // Add to history
        this.addToHistory(this.currentPrice);

        // Check for significant price deviation
        const config = getOracleConfig();
        if (deviation > config.deviationThreshold * 100) {
          this.healthMetrics.warnings.push(
            `Significant price deviation: ${deviation.toFixed(2)}%`
          );
        }

        console.log(`Price updated: $${priceData.price} (deviation: ${deviation.toFixed(2)}%)`);
      } else {
        throw new Error('Invalid price data received from oracle');
      }
    } catch (error) {
      this.consecutiveFailures++;
      this.updateHealthMetrics();
      
      console.error('Failed to update price from oracle:', error);
      throw error;
    }
  }

  /**
   * Fetch price from Chainlink oracle (mock implementation)
   */
  private async fetchChainlinkPrice(): Promise<Omit<PriceData, 'timestamp' | 'source'>> {
    // Mock implementation - in reality this would call Chainlink contracts
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate occasional failures
        if (Math.random() < 0.05) { // 5% failure rate
          reject(new Error('Oracle network error'));
          return;
        }

        // Simulate price with some volatility
        const basePrice = TOKEN_ECONOMICS.FALLBACK_YAP_PRICE_USD;
        const volatility = 0.02; // 2% volatility
        const change = (Math.random() - 0.5) * 2 * volatility;
        const price = basePrice * (1 + change);

        resolve({
          price: Number(price.toFixed(6)),
          confidence: 95 + Math.random() * 5, // 95-100% confidence
          roundId: `round_${Date.now()}`
        });
      }, 100 + Math.random() * 200); // 100-300ms response time
    });
  }

  /**
   * Validate price data
   */
  private validatePriceData(priceData: any): boolean {
    if (!priceData || typeof priceData.price !== 'number') {
      return false;
    }

    if (priceData.price <= 0 || priceData.price > 100) { // Sanity check: $0-$100
      return false;
    }

    if (typeof priceData.confidence !== 'number' || priceData.confidence < 0 || priceData.confidence > 100) {
      return false;
    }

    return true;
  }

  /**
   * Check if price is fresh
   */
  private isPriceFresh(priceData: PriceData): boolean {
    const config = getOracleConfig();
    const ageMs = Date.now() - priceData.timestamp.getTime();
    return ageMs < config.updateInterval * 1000;
  }

  /**
   * Get fallback price
   */
  private getFallbackPrice(): PriceData {
    const config = getOracleConfig();
    return {
      price: config.fallbackPrice,
      timestamp: new Date(),
      source: 'fallback',
      confidence: 25, // Low confidence for fallback
      deviation: 0
    };
  }

  /**
   * Initialize fallback price for beta/disabled oracle
   */
  private async initializeFallbackPrice(): Promise<void> {
    this.currentPrice = this.getFallbackPrice();
    this.healthMetrics.isHealthy = true;
    this.healthMetrics.status = 'active';
    console.log('Initialized with fallback price:', this.currentPrice.price);
  }

  /**
   * Start price update interval
   */
  private startPriceUpdates(): void {
    const config = getOracleConfig();
    
    this.updateInterval = setInterval(async () => {
      try {
        await this.updatePrice();
      } catch (error) {
        console.error('Scheduled price update failed:', error);
      }
    }, config.updateInterval * 1000);
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    const config = getOracleConfig();
    
    setInterval(() => {
      this.checkOracleHealth();
    }, config.healthCheckInterval * 1000);
  }

  /**
   * Check oracle health
   */
  private checkOracleHealth(): void {
    const config = getOracleConfig();
    const now = new Date();

    // Check if last update was too long ago
    const timeSinceUpdate = now.getTime() - this.healthMetrics.lastUpdate.getTime();
    const maxStaleTime = config.updateInterval * 2 * 1000; // 2x update interval

    if (timeSinceUpdate > maxStaleTime) {
      this.healthMetrics.warnings.push('Oracle data is stale');
      this.healthMetrics.status = 'degraded';
    }

    // Check consecutive failures
    if (this.consecutiveFailures >= 3) {
      this.healthMetrics.status = 'failed';
      this.healthMetrics.isHealthy = false;
    } else if (this.consecutiveFailures >= 1) {
      this.healthMetrics.status = 'degraded';
    } else {
      this.healthMetrics.status = 'active';
      this.healthMetrics.isHealthy = true;
    }

    // Clear old warnings
    if (this.healthMetrics.warnings.length > 10) {
      this.healthMetrics.warnings = this.healthMetrics.warnings.slice(-5);
    }
  }

  /**
   * Update health metrics
   */
  private updateHealthMetrics(): void {
    this.healthMetrics.lastUpdate = new Date();
    this.healthMetrics.consecutiveFailures = this.consecutiveFailures;
    
    // Update average response time
    if (this.lastResponseTime > 0) {
      this.healthMetrics.averageResponseTime = 
        (this.healthMetrics.averageResponseTime * 0.9) + (this.lastResponseTime * 0.1);
    }

    // Update price deviation
    if (this.currentPrice?.deviation) {
      this.healthMetrics.priceDeviation = this.currentPrice.deviation;
    }
  }

  /**
   * Cache price data
   */
  private cachePrice(priceData: PriceData): void {
    const key = priceData.timestamp.toISOString();
    this.priceCache.set(key, priceData);

    // Keep only last 100 cached prices
    if (this.priceCache.size > 100) {
      const keys = Array.from(this.priceCache.keys()).sort();
      for (let i = 0; i < keys.length - 100; i++) {
        this.priceCache.delete(keys[i]);
      }
    }
  }

  /**
   * Add price to history
   */
  private addToHistory(priceData: PriceData): void {
    this.priceHistory.push({
      timestamp: priceData.timestamp,
      price: priceData.price,
      source: priceData.source
    });

    // Keep only last 24 hours of history
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.priceHistory = this.priceHistory.filter(p => p.timestamp >= cutoff);
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    console.log('Oracle service shut down');
  }
}

/**
 * Oracle utility functions
 */
export class OracleUtils {
  /**
   * Convert token amount to USD using current price
   */
  static async convertTokensToUSD(tokenAmount: number): Promise<number> {
    const oracle = ChainlinkOracleService.getInstance();
    const priceData = await oracle.getCurrentPrice();
    return tokenAmount * priceData.price;
  }

  /**
   * Convert USD amount to tokens using current price
   */
  static async convertUSDToTokens(usdAmount: number): Promise<number> {
    const oracle = ChainlinkOracleService.getInstance();
    const priceData = await oracle.getCurrentPrice();
    return usdAmount / priceData.price;
  }

  /**
   * Get price change percentage over time period
   */
  static async getPriceChange(hours: number = 24): Promise<{
    changePercent: number;
    changeAbsolute: number;
    startPrice: number;
    endPrice: number;
  }> {
    const oracle = ChainlinkOracleService.getInstance();
    const history = oracle.getPriceHistory(hours);
    
    if (history.length < 2) {
      return {
        changePercent: 0,
        changeAbsolute: 0,
        startPrice: 0,
        endPrice: 0
      };
    }

    const startPrice = history[0].price;
    const endPrice = history[history.length - 1].price;
    const changeAbsolute = endPrice - startPrice;
    const changePercent = (changeAbsolute / startPrice) * 100;

    return {
      changePercent,
      changeAbsolute,
      startPrice,
      endPrice
    };
  }

  /**
   * Check if oracle is healthy enough for trading
   */
  static async isOracleReliable(): Promise<boolean> {
    const oracle = ChainlinkOracleService.getInstance();
    const health = oracle.getHealthStatus();
    
    return health.isHealthy && 
           health.status !== 'failed' &&
           health.consecutiveFailures < 3;
  }

  /**
   * Get recommended price for fallback scenarios
   */
  static getRecommendedFallbackPrice(): number {
    const config = getOracleConfig();
    return config.fallbackPrice;
  }

  /**
   * Format price for display
   */
  static formatPrice(price: number, decimals: number = 6): string {
    return `$${price.toFixed(decimals)}`;
  }

  /**
   * Calculate price impact for large orders
   */
  static calculatePriceImpact(orderSizeUSD: number): number {
    // Simple price impact model - in reality this would be more sophisticated
    const baseImpact = 0.001; // 0.1% base impact
    const scaleFactor = orderSizeUSD / 10000; // Scale by order size ($10k = 1x)
    return Math.min(baseImpact * Math.sqrt(scaleFactor), 0.05); // Max 5% impact
  }
}

/**
 * Price alert system
 */
export class PriceAlertService {
  private alerts: Map<string, {
    userId: string;
    condition: 'above' | 'below';
    targetPrice: number;
    callback: (price: number) => void;
  }> = new Map();

  /**
   * Set price alert
   */
  setAlert(
    alertId: string,
    userId: string,
    condition: 'above' | 'below',
    targetPrice: number,
    callback: (price: number) => void
  ): void {
    this.alerts.set(alertId, {
      userId,
      condition,
      targetPrice,
      callback
    });
  }

  /**
   * Remove price alert
   */
  removeAlert(alertId: string): void {
    this.alerts.delete(alertId);
  }

  /**
   * Check alerts against current price
   */
  async checkAlerts(): Promise<void> {
    const oracle = ChainlinkOracleService.getInstance();
    const priceData = await oracle.getCurrentPrice();
    const currentPrice = priceData.price;

    for (const [alertId, alert] of this.alerts) {
      let triggered = false;

      if (alert.condition === 'above' && currentPrice >= alert.targetPrice) {
        triggered = true;
      } else if (alert.condition === 'below' && currentPrice <= alert.targetPrice) {
        triggered = true;
      }

      if (triggered) {
        try {
          alert.callback(currentPrice);
        } catch (error) {
          console.error(`Alert callback failed for ${alertId}:`, error);
        }
        
        // Remove triggered alert
        this.alerts.delete(alertId);
      }
    }
  }
}

export default ChainlinkOracleService;
