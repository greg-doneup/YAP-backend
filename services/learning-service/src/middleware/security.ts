/**
 * Enhanced Security Middleware for Learning Service
 * Provides comprehensive security features including rate limiting, input validation,
 * audit logging, and protection against common attacks
 */

import { Request, Response, NextFunction } from 'express';
import { MongoClient, Db } from 'mongodb';
import crypto from 'crypto';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Security event types for audit logging
 */
export enum SecurityEventType {
  // Authentication events
  ACCESS_GRANTED = 'access_granted',
  ACCESS_DENIED = 'access_denied',
  INVALID_TOKEN = 'invalid_token',
  
  // Learning-specific events
  LESSON_ACCESS = 'lesson_access',
  QUIZ_ATTEMPT = 'quiz_attempt',
  PROGRESS_UPDATE = 'progress_update',
  CONTENT_ACCESS = 'content_access',
  
  // Security violations
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  INVALID_INPUT = 'invalid_input',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  XSS_ATTEMPT = 'xss_attempt',
  
  // System events
  HEALTH_CHECK = 'health_check',
  SERVICE_ERROR = 'service_error'
}

/**
 * Security context for tracking requests
 */
interface SecurityContext {
  userId?: string;
  clientIp: string;
  userAgent: string;
  requestId: string;
  endpoint: string;
  method: string;
}

/**
 * Learning Service Security Middleware Class
 */
export class LearningSecurityMiddleware {
  private mongoClient: MongoClient | null = null;
  private auditDb: Db | null = null;
  private requestCounts: Map<string, { count: number; windowStart: Date }> = new Map();
  private failedAttempts: Map<string, { count: number; lastAttempt: Date }> = new Map();
  private securityMetrics: Map<string, number> = new Map();

  constructor() {
    this.initializeDatabase();
    this.initializeMetrics();
  }

  /**
   * Initialize MongoDB connection for audit logging
   */
  private async initializeDatabase() {
    try {
      const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
      const dbName = process.env.MONGO_DB_NAME || 'yap';
      
      this.mongoClient = new MongoClient(mongoUri);
      await this.mongoClient.connect();
      this.auditDb = this.mongoClient.db(dbName);
      
      console.log('✅ Learning security middleware connected to MongoDB');
      
      // Create indexes for efficient querying
      await this.auditDb.collection('learning_security_audit').createIndex({ timestamp: 1 });
      await this.auditDb.collection('learning_security_audit').createIndex({ eventType: 1 });
      await this.auditDb.collection('learning_security_audit').createIndex({ clientIp: 1 });
      await this.auditDb.collection('learning_security_audit').createIndex({ userId: 1 });
    } catch (error) {
      console.error('❌ Failed to connect learning security middleware to MongoDB:', error);
      // Continue without audit logging if MongoDB is not available
    }
  }

  /**
   * Initialize security metrics
   */
  private initializeMetrics() {
    this.securityMetrics.set('total_requests', 0);
    this.securityMetrics.set('blocked_requests', 0);
    this.securityMetrics.set('failed_authentications', 0);
    this.securityMetrics.set('security_violations', 0);
    this.securityMetrics.set('learning_access_attempts', 0);
  }

  /**
   * Enhanced rate limiting for learning service endpoints
   */
  learningRateLimit(maxRequests: number = 100, windowMinutes: number = 5) {
    return (req: Request, res: Response, next: NextFunction) => {
      const clientIp = this.getClientIp(req);
      const endpoint = this.categorizeEndpoint(req.path);
      const now = new Date();
      const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

      // Different rate limits for different endpoint types
      const endpointLimits: { [key: string]: number } = {
        'quiz': 50,          // 50 quiz attempts per window
        'lessons': 80,       // 80 lesson access per window
        'progress': 30,      // 30 progress updates per window
        'daily': 20,         // 20 daily content access per window
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
          this.logSecurityEvent(SecurityEventType.RATE_LIMIT_EXCEEDED, {
            userId: this.getUserIdFromRequest(req),
            clientIp,
            userAgent: req.headers['user-agent'] || 'unknown',
            requestId: req.headers['x-request-id'] as string || crypto.randomUUID(),
            endpoint: req.path,
            method: req.method
          }, {
            count: current.count,
            limit: actualLimit,
            endpointCategory: endpoint
          });

          return res.status(429).json({
            error: 'rate_limit_exceeded',
            message: `Too many ${endpoint} requests. Please try again later.`,
            retryAfter: windowMinutes * 60,
            endpoint: endpoint
          });
        }
      }

      this.incrementMetric('total_requests');
      next();
    };
  }

  /**
   * Input validation and sanitization for learning data
   */
  validateLearningData() {
    return (req: Request, res: Response, next: NextFunction) => {
      const context = this.createSecurityContext(req);

      try {
        // Validate and sanitize request body
        if (req.body && typeof req.body === 'object') {
          req.body = this.sanitizeLearningData(req.body, context);
        }

        // Validate query parameters
        if (req.query && typeof req.query === 'object') {
          for (const [key, value] of Object.entries(req.query)) {
            if (typeof value === 'string') {
              // Check for SQL injection patterns
              if (this.detectSQLInjection(value)) {
                this.logSecurityEvent(SecurityEventType.SQL_INJECTION_ATTEMPT, context, {
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

        next();
      } catch (error: any) {
        this.logSecurityEvent(SecurityEventType.INVALID_INPUT, context, {
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
   * Audit logging for learning operations
   */
  auditLearningOperations() {
    return (req: Request, res: Response, next: NextFunction) => {
      const context = this.createSecurityContext(req);
      const startTime = Date.now();

      // Override res.json to capture response data
      const originalJson = res.json;
      res.json = function(this: Response, body: any) {
        const responseTime = Date.now() - startTime;
        const statusCode = this.statusCode;

        // Log the operation
        const middleware = req.app.locals.learningSecurity as LearningSecurityMiddleware;
        if (middleware) {
          const eventType = middleware.determineEventType(req.path, req.method, statusCode);
          middleware.logSecurityEvent(eventType, context, {
            statusCode,
            responseTime,
            endpoint: req.path,
            method: req.method,
            success: statusCode < 400
          });

          if (statusCode >= 400) {
            middleware.incrementMetric('security_violations');
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
  learningSecurityHeaders() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Set security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'");
      
      // Remove potentially revealing headers
      res.removeHeader('X-Powered-By');
      res.removeHeader('Server');

      next();
    };
  }

  /**
   * Ownership enforcement for learning resources
   */
  enforceLearningOwnership() {
    return (req: Request, res: Response, next: NextFunction) => {
      const context = this.createSecurityContext(req);
      const userId = this.getUserIdFromRequest(req);
      const requestedUserId = req.params.userId;

      // Check if user is accessing their own learning data
      if (requestedUserId && userId !== requestedUserId) {
        // Allow admin access (if user has admin role)
        const userRoles = (req as any).user?.roles || [];
        if (!userRoles.includes('admin')) {
          this.logSecurityEvent(SecurityEventType.ACCESS_DENIED, context, {
            reason: 'unauthorized_learning_access',
            requestedUserId,
            actualUserId: userId
          });
          return res.status(403).json({
            error: 'forbidden',
            message: 'You can only access your own learning data'
          });
        }
      }

      this.incrementMetric('learning_access_attempts');
      next();
    };
  }

  /**
   * Get security metrics
   */
  async getSecurityMetrics() {
    const metrics: any = Object.fromEntries(this.securityMetrics);
    
    if (this.auditDb) {
      try {
        const collection = this.auditDb.collection('learning_security_audit');
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Get recent activity counts
        const recentEvents = await collection.countDocuments({
          timestamp: { $gte: oneHourAgo }
        });

        const dailyEvents = await collection.countDocuments({
          timestamp: { $gte: oneDayAgo }
        });

        metrics.recent_events_1h = recentEvents;
        metrics.daily_events_24h = dailyEvents;

        // Get top event types
        const topEventTypes = await collection.aggregate([
          { $match: { timestamp: { $gte: oneDayAgo } } },
          { $group: { _id: '$eventType', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ]).toArray();

        metrics.top_event_types = topEventTypes;
      } catch (error) {
        console.error('Error fetching security metrics:', error);
      }
    }

    return {
      ...metrics,
      timestamp: new Date().toISOString(),
      service: 'learning-service'
    };
  }

  // Private helper methods
  private getClientIp(req: Request): string {
    return req.headers['x-forwarded-for']?.toString().split(',')[0] ||
           req.headers['x-real-ip'] as string ||
           req.connection?.remoteAddress ||
           'unknown';
  }

  private createSecurityContext(req: Request): SecurityContext {
    return {
      userId: this.getUserIdFromRequest(req),
      clientIp: this.getClientIp(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: req.headers['x-request-id'] as string || crypto.randomUUID(),
      endpoint: req.path,
      method: req.method
    };
  }

  private getUserIdFromRequest(req: Request): string | undefined {
    return (req as any).user?.sub || (req as any).user?.userId;
  }

  private categorizeEndpoint(path: string): string {
    if (path.includes('/quiz')) return 'quiz';
    if (path.includes('/lessons')) return 'lessons';
    if (path.includes('/progress')) return 'progress';
    if (path.includes('/daily')) return 'daily';
    return 'default';
  }

  private sanitizeLearningData(data: any, context: SecurityContext): any {
    if (typeof data === 'string') {
      return this.sanitizeInput(data);
    } else if (Array.isArray(data)) {
      return data.map(item => this.sanitizeLearningData(item, context));
    } else if (data && typeof data === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        // Check for XSS attempts in string values
        if (typeof value === 'string' && this.detectXSS(value)) {
          this.logSecurityEvent(SecurityEventType.XSS_ATTEMPT, context, {
            field: key,
            value: this.hashSensitiveData(value)
          });
          throw new Error('XSS attempt detected');
        }
        sanitized[key] = this.sanitizeLearningData(value, context);
      }
      return sanitized;
    }
    return data;
  }

  private sanitizeInput(input: string): string {
    // Use DOMPurify to sanitize HTML content
    const sanitized = DOMPurify.sanitize(input, { 
      ALLOWED_TAGS: [],  // Remove all HTML tags
      ALLOWED_ATTR: []   // Remove all attributes
    });
    
    // Additional sanitization for special characters
    return sanitized
      .replace(/[<>]/g, '') // Remove any remaining angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
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

  private determineEventType(path: string, method: string, statusCode: number): SecurityEventType {
    if (statusCode >= 400) {
      if (statusCode === 401) return SecurityEventType.ACCESS_DENIED;
      if (statusCode === 429) return SecurityEventType.RATE_LIMIT_EXCEEDED;
      return SecurityEventType.SERVICE_ERROR;
    }

    if (path.includes('/quiz')) return SecurityEventType.QUIZ_ATTEMPT;
    if (path.includes('/lessons')) return SecurityEventType.LESSON_ACCESS;
    if (path.includes('/progress')) return SecurityEventType.PROGRESS_UPDATE;
    if (path.includes('/health')) return SecurityEventType.HEALTH_CHECK;
    
    return SecurityEventType.CONTENT_ACCESS;
  }

  private async logSecurityEvent(eventType: SecurityEventType, context: SecurityContext, details: any = {}) {
    const event = {
      eventType,
      timestamp: new Date(),
      userId: context.userId,
      clientIp: context.clientIp,
      userAgent: context.userAgent,
      requestId: context.requestId,
      endpoint: context.endpoint,
      method: context.method,
      details,
      service: 'learning-service'
    };

    // Log to console for immediate visibility
    console.log(`🔒 [LEARNING-SECURITY] ${eventType}: ${context.clientIp} -> ${context.endpoint}`);

    // Store in database if available
    if (this.auditDb) {
      try {
        await this.auditDb.collection('learning_security_audit').insertOne(event);
      } catch (error) {
        console.error('Failed to log security event to database:', error);
      }
    }
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

  private incrementMetric(metric: string) {
    const current = this.securityMetrics.get(metric) || 0;
    this.securityMetrics.set(metric, current + 1);
  }
}

// Export singleton instance
export const learningSecurityMiddleware = new LearningSecurityMiddleware();
