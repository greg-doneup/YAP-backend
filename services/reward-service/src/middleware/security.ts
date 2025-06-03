/**
 * Enhanced Security Middleware for Reward Service
 * Provides comprehensive security features for cryptocurrency reward operations
 * including rate limiting, input validation, audit logging, transaction monitoring,
 * and protection against common attacks
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Security event types for reward service audit logging
 */
export enum RewardSecurityEventType {
  // Authentication events
  ACCESS_GRANTED = 'access_granted',
  ACCESS_DENIED = 'access_denied',
  INVALID_TOKEN = 'invalid_token',
  
  // Reward-specific events
  REWARD_CLAIM = 'reward_claim',
  TRANSACTION_INITIATED = 'transaction_initiated',
  TRANSACTION_COMPLETED = 'transaction_completed',
  TRANSACTION_FAILED = 'transaction_failed',
  WALLET_ACCESS = 'wallet_access',
  ETHEREUM_INTERACTION = 'ethereum_interaction',
  
  // High-risk financial events
  LARGE_REWARD_CLAIM = 'large_reward_claim',
  SUSPICIOUS_TRANSACTION = 'suspicious_transaction',
  RAPID_CLAIMS = 'rapid_claims',
  UNUSUAL_PATTERN = 'unusual_pattern',
  
  // Security violations
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  INVALID_INPUT = 'invalid_input',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  XSS_ATTEMPT = 'xss_attempt',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  
  // System events
  HEALTH_CHECK = 'health_check',
  SERVICE_ERROR = 'service_error',
  BLOCKCHAIN_ERROR = 'blockchain_error'
}

/**
 * Risk levels for reward operations
 */
export enum RewardRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Security context for tracking reward requests
 */
interface RewardSecurityContext {
  userId?: string;
  clientIp: string;
  userAgent: string;
  requestId: string;
  endpoint: string;
  method: string;
  walletAddress?: string;
  transactionValue?: string;
  riskLevel?: RewardRiskLevel;
}

/**
 * Transaction monitoring data
 */
interface TransactionMonitor {
  userId: string;
  walletAddress: string;
  lastTransaction: Date;
  dailyTransactionCount: number;
  dailyTransactionValue: string;
  suspiciousActivityScore: number;
}

/**
 * Reward Service Security Middleware Class
 */
export class RewardSecurityMiddleware {
  private requestCounts: Map<string, { count: number; windowStart: Date }> = new Map();
  private failedAttempts: Map<string, { count: number; lastAttempt: Date }> = new Map();
  private transactionMonitors: Map<string, TransactionMonitor> = new Map();
  private securityMetrics: Map<string, number> = new Map();
  private auditLog: any[] = []; // In-memory storage for now
  
  // Security thresholds
  private readonly MAX_DAILY_TRANSACTIONS = 10;
  private readonly MAX_DAILY_VALUE = '1000.0'; // In token units
  private readonly SUSPICIOUS_ACTIVITY_THRESHOLD = 5;
  private readonly LARGE_TRANSACTION_THRESHOLD = '100.0';

  constructor() {
    this.initializeMetrics();
    console.log('✅ Reward security middleware initialized (in-memory mode)');
  }

  /**
   * Initialize security metrics
   */
  private initializeMetrics() {
    this.securityMetrics.set('total_requests', 0);
    this.securityMetrics.set('blocked_requests', 0);
    this.securityMetrics.set('failed_authentications', 0);
    this.securityMetrics.set('security_violations', 0);
    this.securityMetrics.set('reward_claims', 0);
    this.securityMetrics.set('transactions_initiated', 0);
    this.securityMetrics.set('transactions_completed', 0);
    this.securityMetrics.set('transactions_failed', 0);
    this.securityMetrics.set('high_risk_operations', 0);
    this.securityMetrics.set('suspicious_activities', 0);
  }

  /**
   * Enhanced rate limiting for reward service endpoints
   */
  rewardRateLimit(maxRequests: number = 50, windowMinutes: number = 15) {
    return (req: Request, res: Response, next: NextFunction) => {
      const clientIp = this.getClientIp(req);
      const endpoint = this.categorizeEndpoint(req.path);
      const now = new Date();
      const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

      // Stricter rate limits for financial operations
      const endpointLimits: { [key: string]: number } = {
        'complete': 10,      // 10 reward claims per window
        'ethereum': 5,       // 5 ethereum transactions per window
        'wallet': 20,        // 20 wallet operations per window
        'health': 100,       // 100 health checks per window
        'default': maxRequests
      };

      const actualLimit = endpointLimits[endpoint] || endpointLimits.default;
      const key = `${clientIp}:${endpoint}`;

      // Clean old entries
      this.cleanOldRateLimitEntries(windowStart);

      // Check current count
      const current = this.requestCounts.get(key);
      if (!current || current.windowStart < windowStart) {
        this.requestCounts.set(key, { count: 1, windowStart: now });
      } else {
        current.count++;
        if (current.count > actualLimit) {
          this.incrementMetric('blocked_requests');
          this.logSecurityEvent(RewardSecurityEventType.RATE_LIMIT_EXCEEDED, {
            userId: this.getUserIdFromRequest(req),
            clientIp,
            userAgent: req.headers['user-agent'] || 'unknown',
            requestId: req.headers['x-request-id'] as string || crypto.randomUUID(),
            endpoint: req.path,
            method: req.method,
            riskLevel: this.assessRiskLevel(endpoint, current.count)
          }, {
            count: current.count,
            limit: actualLimit,
            endpointCategory: endpoint,
            severity: 'high'
          });

          return res.status(429).json({
            error: 'rate_limit_exceeded',
            message: `Too many ${endpoint} requests. Financial operations are rate limited for security.`,
            retryAfter: windowMinutes * 60,
            endpoint: endpoint,
            type: 'financial_security_limit'
          });
        }
      }

      this.incrementMetric('total_requests');
      next();
    };
  }

  /**
   * Transaction monitoring and validation
   */
  monitorTransactions() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const context = this.createSecurityContext(req);
      const userId = context.userId;
      
      if (!userId) {
        this.logSecurityEvent(RewardSecurityEventType.UNAUTHORIZED_ACCESS, context, {
          reason: 'missing_user_id',
          endpoint: req.path
        });
        return res.status(401).json({
          error: 'unauthorized',
          message: 'User authentication required for financial operations'
        });
      }

      try {
        // Get or create transaction monitor for user
        let monitor = this.transactionMonitors.get(userId);
        if (!monitor) {
          monitor = {
            userId,
            walletAddress: req.body?.walletAddress || 'unknown',
            lastTransaction: new Date(0),
            dailyTransactionCount: 0,
            dailyTransactionValue: '0',
            suspiciousActivityScore: 0
          };
          this.transactionMonitors.set(userId, monitor);
        }

        // Check for suspicious patterns
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        // Reset daily counters if it's a new day
        if (monitor.lastTransaction < oneDayAgo) {
          monitor.dailyTransactionCount = 0;
          monitor.dailyTransactionValue = '0';
        }

        // Check transaction limits
        if (monitor.dailyTransactionCount >= this.MAX_DAILY_TRANSACTIONS) {
          this.logSecurityEvent(RewardSecurityEventType.SUSPICIOUS_ACTIVITY, context, {
            reason: 'daily_transaction_limit_exceeded',
            dailyCount: monitor.dailyTransactionCount,
            limit: this.MAX_DAILY_TRANSACTIONS
          });
          return res.status(429).json({
            error: 'daily_limit_exceeded',
            message: 'Daily transaction limit exceeded for security protection'
          });
        }

        // Check for rapid transactions (potential bot behavior)
        const timeSinceLastTransaction = now.getTime() - monitor.lastTransaction.getTime();
        if (timeSinceLastTransaction < 30000) { // Less than 30 seconds
          monitor.suspiciousActivityScore += 1;
          this.logSecurityEvent(RewardSecurityEventType.RAPID_CLAIMS, context, {
            timeSinceLastTransaction,
            suspiciousScore: monitor.suspiciousActivityScore
          });
        }

        // Block if suspicious activity score is too high
        if (monitor.suspiciousActivityScore >= this.SUSPICIOUS_ACTIVITY_THRESHOLD) {
          this.incrementMetric('suspicious_activities');
          this.logSecurityEvent(RewardSecurityEventType.SUSPICIOUS_ACTIVITY, context, {
            reason: 'high_suspicious_activity_score',
            score: monitor.suspiciousActivityScore,
            threshold: this.SUSPICIOUS_ACTIVITY_THRESHOLD
          });
          return res.status(403).json({
            error: 'suspicious_activity',
            message: 'Account temporarily restricted due to suspicious activity'
          });
        }

        // Update monitor
        monitor.lastTransaction = now;
        monitor.dailyTransactionCount += 1;

        // Add monitor to request for later use
        (req as any).transactionMonitor = monitor;

        next();
      } catch (error: any) {
        this.logSecurityEvent(RewardSecurityEventType.SERVICE_ERROR, context, {
          error: error.message,
          stage: 'transaction_monitoring'
        });
        next(error);
      }
    };
  }

  /**
   * Input validation and sanitization for reward data
   */
  validateRewardData() {
    return (req: Request, res: Response, next: NextFunction) => {
      const context = this.createSecurityContext(req);

      try {
        // Validate and sanitize request body
        if (req.body && typeof req.body === 'object') {
          req.body = this.sanitizeRewardData(req.body, context);
        }

        // Validate query parameters
        if (req.query && typeof req.query === 'object') {
          for (const [key, value] of Object.entries(req.query)) {
            if (typeof value === 'string') {
              // Check for SQL injection patterns
              if (this.detectSQLInjection(value)) {
                this.logSecurityEvent(RewardSecurityEventType.SQL_INJECTION_ATTEMPT, context, {
                  parameter: key,
                  value: this.hashSensitiveData(value),
                  detectedPatterns: 'SQL_INJECTION'
                });
                return res.status(400).json({
                  error: 'invalid_input',
                  message: 'Invalid query parameter detected'
                });
              }

              // Sanitize the value
              req.query[key] = this.sanitizeInput(value);
            }
          }
        }

        // Additional validation for wallet addresses
        if (req.body?.walletAddress && !this.isValidWalletAddress(req.body.walletAddress)) {
          this.logSecurityEvent(RewardSecurityEventType.INVALID_INPUT, context, {
            field: 'walletAddress',
            value: this.hashSensitiveData(req.body.walletAddress)
          });
          return res.status(400).json({
            error: 'invalid_wallet_address',
            message: 'Invalid wallet address format'
          });
        }

        next();
      } catch (error: any) {
        this.logSecurityEvent(RewardSecurityEventType.INVALID_INPUT, context, {
          error: error.message,
          endpoint: req.path
        });
        return res.status(400).json({
          error: 'validation_failed',
          message: 'Request validation failed'
        });
      }
    };
  }

  /**
   * Audit logging for reward operations
   */
  auditRewardOperations() {
    return (req: Request, res: Response, next: NextFunction) => {
      const context = this.createSecurityContext(req);
      const startTime = Date.now();

      // Add transaction value to context if present
      if (req.body?.value) {
        context.transactionValue = req.body.value;
        context.riskLevel = this.assessTransactionRisk(req.body.value);
      }

      // Store reference to middleware
      req.app.locals.rewardSecurity = this;

      // Override res.json to capture response data
      const originalJson = res.json;
      res.json = function(this: Response, body: any) {
        const responseTime = Date.now() - startTime;
        const statusCode = this.statusCode;

        // Log the operation
        const middleware = req.app.locals.rewardSecurity as RewardSecurityMiddleware;
        if (middleware) {
          const eventType = middleware.determineEventType(req.path, req.method, statusCode, body);
          
          // Capture transaction hash if present
          const details: any = {
            statusCode,
            responseTime,
            endpoint: req.path,
            method: req.method,
            success: statusCode < 400
          };

          if (body?.txHash) {
            details.transactionHash = body.txHash;
            middleware.incrementMetric('transactions_completed');
          }

          if (statusCode >= 400) {
            middleware.incrementMetric('transactions_failed');
          }

          middleware.logSecurityEvent(eventType, context, details);

          // Increment appropriate metrics
          if (statusCode >= 400) {
            middleware.incrementMetric('security_violations');
          } else if (req.path.includes('/complete')) {
            middleware.incrementMetric('reward_claims');
          } else if (req.path.includes('/ethereum')) {
            middleware.incrementMetric('transactions_initiated');
          }

          // Track high-risk operations
          if (context.riskLevel === RewardRiskLevel.HIGH || context.riskLevel === RewardRiskLevel.CRITICAL) {
            middleware.incrementMetric('high_risk_operations');
          }
        }

        return originalJson.call(this, body);
      };

      next();
    };
  }

  /**
   * Security headers middleware
   */
  rewardSecurityHeaders() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Set security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'");
      
      // Financial service specific headers
      res.setHeader('X-Financial-Service', 'reward-service');
      res.setHeader('X-Security-Level', 'high');
      
      // Remove potentially revealing headers
      res.removeHeader('X-Powered-By');
      res.removeHeader('Server');

      next();
    };
  }

  /**
   * Ownership enforcement for reward operations
   */
  enforceRewardOwnership() {
    return (req: Request, res: Response, next: NextFunction) => {
      const context = this.createSecurityContext(req);
      const userId = this.getUserIdFromRequest(req);
      const requestedUserId = req.params.userId || req.body?.userId;

      // Check if user is accessing their own rewards
      if (requestedUserId && userId !== requestedUserId) {
        // Allow admin access (if user has admin role)
        const userRoles = (req as any).user?.roles || [];
        if (!userRoles.includes('admin')) {
          this.logSecurityEvent(RewardSecurityEventType.UNAUTHORIZED_ACCESS, context, {
            reason: 'unauthorized_reward_access',
            requestedUserId,
            actualUserId: userId
          });
          return res.status(403).json({
            error: 'forbidden',
            message: 'You can only access your own rewards'
          });
        }
      }

      next();
    };
  }

  /**
   * Get security metrics including financial operation statistics
   */
  async getSecurityMetrics() {
    const metrics: any = Object.fromEntries(this.securityMetrics);
    
    // Calculate additional statistics from in-memory data
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get recent events from audit log
    const recentEvents = this.auditLog.filter(event => 
      new Date(event.timestamp) >= oneHourAgo
    ).length;

    const dailyEvents = this.auditLog.filter(event => 
      new Date(event.timestamp) >= oneDayAgo
    ).length;

    // Get high-risk operations
    const highRiskOperations = this.auditLog.filter(event => 
      new Date(event.timestamp) >= oneDayAgo &&
      (event.riskLevel === RewardRiskLevel.HIGH || event.riskLevel === RewardRiskLevel.CRITICAL)
    ).length;

    // Get event type counts
    const eventTypes: { [key: string]: number } = {};
    this.auditLog.filter(event => new Date(event.timestamp) >= oneDayAgo)
      .forEach(event => {
        eventTypes[event.eventType] = (eventTypes[event.eventType] || 0) + 1;
      });

    const topEventTypes = Object.entries(eventTypes)
      .map(([type, count]) => ({ _id: type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    metrics.recent_events_1h = recentEvents;
    metrics.daily_events_24h = dailyEvents;
    metrics.high_risk_operations_24h = highRiskOperations;
    metrics.top_event_types = topEventTypes;
    metrics.active_transaction_monitors = this.transactionMonitors.size;
    metrics.audit_log_size = this.auditLog.length;

    return {
      ...metrics,
      timestamp: new Date().toISOString(),
      service: 'reward-service',
      security_level: 'high',
      financial_operations: true,
      storage_mode: 'in-memory'
    };
  }

  // Public method to determine event type (needed by audit middleware)
  public determineEventType(path: string, method: string, statusCode: number, body?: any): RewardSecurityEventType {
    if (statusCode >= 400) {
      if (statusCode === 401) return RewardSecurityEventType.ACCESS_DENIED;
      if (statusCode === 429) return RewardSecurityEventType.RATE_LIMIT_EXCEEDED;
      if (path.includes('/ethereum') || path.includes('/complete')) {
        return RewardSecurityEventType.TRANSACTION_FAILED;
      }
      return RewardSecurityEventType.SERVICE_ERROR;
    }

    if (path.includes('/complete')) {
      if (body?.txHash) return RewardSecurityEventType.TRANSACTION_COMPLETED;
      return RewardSecurityEventType.REWARD_CLAIM;
    }
    if (path.includes('/ethereum')) return RewardSecurityEventType.ETHEREUM_INTERACTION;
    if (path.includes('/health')) return RewardSecurityEventType.HEALTH_CHECK;
    
    return RewardSecurityEventType.ACCESS_GRANTED;
  }

  // Public method to increment metrics (needed by audit middleware)
  public incrementMetric(metric: string) {
    const current = this.securityMetrics.get(metric) || 0;
    this.securityMetrics.set(metric, current + 1);
  }

  // Private helper methods
  private getClientIp(req: Request): string {
    return req.headers['x-forwarded-for']?.toString().split(',')[0] ||
           req.headers['x-real-ip'] as string ||
           req.connection?.remoteAddress ||
           'unknown';
  }

  private createSecurityContext(req: Request): RewardSecurityContext {
    return {
      userId: this.getUserIdFromRequest(req),
      clientIp: this.getClientIp(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: req.headers['x-request-id'] as string || crypto.randomUUID(),
      endpoint: req.path,
      method: req.method,
      walletAddress: req.body?.walletAddress,
      transactionValue: req.body?.value
    };
  }

  private getUserIdFromRequest(req: Request): string | undefined {
    return (req as any).user?.sub || (req as any).user?.userId;
  }

  private categorizeEndpoint(path: string): string {
    if (path.includes('/complete')) return 'complete';
    if (path.includes('/ethereum')) return 'ethereum';
    if (path.includes('/wallet')) return 'wallet';
    if (path.includes('/health')) return 'health';
    return 'default';
  }

  private assessRiskLevel(endpoint: string, requestCount: number): RewardRiskLevel {
    if (endpoint === 'complete' && requestCount > 5) return RewardRiskLevel.HIGH;
    if (endpoint === 'ethereum' && requestCount > 3) return RewardRiskLevel.CRITICAL;
    if (requestCount > 10) return RewardRiskLevel.MEDIUM;
    return RewardRiskLevel.LOW;
  }

  private assessTransactionRisk(value?: string): RewardRiskLevel {
    if (!value) return RewardRiskLevel.LOW;
    
    const numValue = parseFloat(value);
    if (numValue >= parseFloat(this.LARGE_TRANSACTION_THRESHOLD)) {
      return RewardRiskLevel.HIGH;
    }
    if (numValue >= 50) {
      return RewardRiskLevel.MEDIUM;
    }
    return RewardRiskLevel.LOW;
  }

  private sanitizeRewardData(data: any, context: RewardSecurityContext): any {
    if (typeof data === 'string') {
      return this.sanitizeInput(data);
    } else if (Array.isArray(data)) {
      return data.map(item => this.sanitizeRewardData(item, context));
    } else if (data && typeof data === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        // Check for XSS attempts in string values
        if (typeof value === 'string' && this.detectXSS(value)) {
          this.logSecurityEvent(RewardSecurityEventType.XSS_ATTEMPT, context, {
            field: key,
            value: this.hashSensitiveData(value)
          });
          throw new Error('XSS attempt detected');
        }
        sanitized[key] = this.sanitizeRewardData(value, context);
      }
      return sanitized;
    }
    return data;
  }

  private sanitizeInput(input: string): string {
    // Basic HTML/script sanitization without external dependencies
    return input
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .replace(/script/gi, '') // Remove script keywords
      .trim();
  }

  private detectSQLInjection(input: string): boolean {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|OR|AND)\b)/gi,
      /(--|#|\*|\/\*|\*\/)/g,
      /'|\"|;|\||&/g
    ];
    
    return sqlPatterns.some(pattern => pattern.test(input));
  }

  private detectXSS(input: string): boolean {
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi
    ];
    
    return xssPatterns.some(pattern => pattern.test(input));
  }

  private isValidWalletAddress(address: string): boolean {
    // Ethereum address validation (0x + 40 hex characters)
    const ethPattern = /^0x[a-fA-F0-9]{40}$/;
    
    // Sei/Cosmos address validation (sei + bech32 format)
    const seiPattern = /^sei[0-9a-z]{39}$/;
    
    return ethPattern.test(address) || seiPattern.test(address);
  }

  private logSecurityEvent(eventType: RewardSecurityEventType, context: RewardSecurityContext, details: any = {}) {
    const event = {
      eventType,
      timestamp: new Date(),
      userId: context.userId,
      clientIp: context.clientIp,
      userAgent: context.userAgent,
      requestId: context.requestId,
      endpoint: context.endpoint,
      method: context.method,
      walletAddress: context.walletAddress,
      transactionValue: context.transactionValue,
      riskLevel: context.riskLevel || RewardRiskLevel.LOW,
      details,
      service: 'reward-service'
    };

    // Store in memory
    this.auditLog.push(event);
    
    // Keep only recent events (last 1000 to prevent memory bloat)
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }

    // Log to console for immediate visibility
    const riskEmoji = context.riskLevel === RewardRiskLevel.CRITICAL ? '🚨' : 
                     context.riskLevel === RewardRiskLevel.HIGH ? '⚠️' : 
                     context.riskLevel === RewardRiskLevel.MEDIUM ? '⚡' : '🔒';
    
    console.log(`${riskEmoji} [REWARD-SECURITY] ${eventType}: ${context.clientIp} -> ${context.endpoint}`);
  }

  private hashSensitiveData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 8);
  }

  private cleanOldRateLimitEntries(cutoff: Date) {
    for (const [key, data] of this.requestCounts.entries()) {
      if (data.windowStart < cutoff) {
        this.requestCounts.delete(key);
      }
    }
  }
}

// Export singleton instance
export const rewardSecurityMiddleware = new RewardSecurityMiddleware();
