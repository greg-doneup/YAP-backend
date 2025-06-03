import { Request, Response, NextFunction } from 'express';
import { MongoClient, Db } from 'mongodb';

// Security event types for offchain profile operations
enum OffchainSecurityEventType {
  PROFILE_ACCESS = 'profile_access',
  PROFILE_UPDATE = 'profile_update',
  POINTS_CHANGE = 'points_change',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  DATA_VALIDATION_FAILED = 'data_validation_failed',
  XSS_ATTEMPT = 'xss_attempt',
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  OWNERSHIP_VIOLATION = 'ownership_violation',
  LEADERBOARD_ACCESS = 'leaderboard_access',
  XP_MANIPULATION_ATTEMPT = 'xp_manipulation_attempt'
}

// Security context interface
interface OffchainSecurityContext {
  userId: string;
  walletAddress: string;
  action: string;
  ip: string;
  userAgent: string;
  timestamp: Date;
  riskScore: number;
  eventType: OffchainSecurityEventType;
  metadata?: Record<string, any>;
}

// In-memory storage for rate limiting and security tracking
class OffchainSecurityStore {
  private rateLimitStore = new Map<string, { count: number; resetTime: number }>();
  private securityEvents: OffchainSecurityContext[] = [];
  private suspiciousIPs = new Set<string>();
  private blockedIPs = new Set<string>();
  
  // Track rate limits
  trackRequest(key: string, windowMs: number, maxRequests: number): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const record = this.rateLimitStore.get(key);
    
    if (!record || now > record.resetTime) {
      this.rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return { allowed: true, remaining: maxRequests - 1 };
    }
    
    record.count++;
    this.rateLimitStore.set(key, record);
    return { allowed: record.count <= maxRequests, remaining: Math.max(0, maxRequests - record.count) };
  }
  
  // Log security events
  logSecurityEvent(event: OffchainSecurityContext): void {
    this.securityEvents.push(event);
    
    // Keep only last 1000 events to prevent memory issues
    if (this.securityEvents.length > 1000) {
      this.securityEvents.shift();
    }
    
    // Auto-block IPs with too many suspicious events
    const recentSuspiciousEvents = this.securityEvents.filter(
      e => e.ip === event.ip && 
      e.timestamp.getTime() > Date.now() - 300000 && // Last 5 minutes
      e.riskScore > 7
    );
    
    if (recentSuspiciousEvents.length >= 5) {
      this.blockedIPs.add(event.ip);
      console.warn(`Auto-blocked IP ${event.ip} due to suspicious activity`);
    }
  }
  
  // Get security metrics
  getMetrics() {
    const now = Date.now();
    const last24h = this.securityEvents.filter(e => e.timestamp.getTime() > now - 86400000);
    
    return {
      totalEvents: this.securityEvents.length,
      eventsLast24h: last24h.length,
      blockedIPs: Array.from(this.blockedIPs),
      suspiciousIPs: Array.from(this.suspiciousIPs),
      eventsByType: this.groupEventsByType(last24h),
      highRiskEvents: last24h.filter(e => e.riskScore > 8).length,
      timestamp: new Date().toISOString()
    };
  }
  
  private groupEventsByType(events: OffchainSecurityContext[]) {
    return events.reduce((acc, event) => {
      acc[event.eventType] = (acc[event.eventType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
  
  // Check if IP is blocked
  isBlocked(ip: string): boolean {
    return this.blockedIPs.has(ip);
  }
  
  // Mark IP as suspicious
  markSuspicious(ip: string): void {
    this.suspiciousIPs.add(ip);
  }
}

// Main security middleware class
export class OffchainProfileSecurityMiddleware {
  private store = new OffchainSecurityStore();
  private mongoClient: MongoClient | null = null;

  constructor() {
    this.initializeDatabase();
  }

  private async initializeDatabase() {
    try {
      const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
      this.mongoClient = new MongoClient(mongoUri);
      await this.mongoClient.connect();
      console.log('✅ Offchain profile security middleware connected to MongoDB');
    } catch (error) {
      console.error('❌ Failed to connect offchain profile security middleware to MongoDB:', error);
      // Continue without MongoDB - use in-memory storage
    }
  }
  
  // Security headers middleware
  offchainSecurityHeaders() {
    return (_req: Request, res: Response, next: NextFunction) => {
      // Enhanced security headers for offchain profile service
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self'; " +
        "font-src 'self'; " +
        "object-src 'none'; " +
        "media-src 'self'; " +
        "frame-src 'none';"
      );
      res.setHeader('Permissions-Policy', 
        'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
      );
      
      next();
    };
  }
  
  // Rate limiting middleware with configurable limits
  offchainRateLimit(requests: number = 50, windowMinutes: number = 15) {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip = this.getClientIP(req);
      
      // Check if IP is blocked
      if (this.store.isBlocked(ip)) {
        this.logSecurityEvent(req, OffchainSecurityEventType.RATE_LIMIT_EXCEEDED, 10, {
          reason: 'IP blocked due to previous violations',
          blockedIP: ip
        });
        return res.status(429).json({ 
          error: 'Too many requests - IP temporarily blocked',
          retryAfter: '1 hour'
        });
      }
      
      const key = `rate_limit:${ip}`;
      const windowMs = windowMinutes * 60 * 1000;
      const result = this.store.trackRequest(key, windowMs, requests);
      
      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', requests.toString());
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + windowMs).toISOString());
      
      if (!result.allowed) {
        this.logSecurityEvent(req, OffchainSecurityEventType.RATE_LIMIT_EXCEEDED, 6, {
          limit: requests,
          window: windowMinutes,
          currentCount: result.remaining
        });
        
        return res.status(429).json({ 
          error: 'Rate limit exceeded',
          limit: requests,
          window: `${windowMinutes} minutes`,
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }
      
      next();
    };
  }
  
  // Data validation middleware
  validateOffchainData() {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        // Input sanitization and validation
        if (req.body) {
          const sanitized = this.sanitizeInput(req.body);
          req.body = sanitized;
          
          // Check for malicious patterns
          const maliciousContent = this.detectMaliciousContent(JSON.stringify(req.body));
          if (maliciousContent.detected) {
            this.logSecurityEvent(req, maliciousContent.type, 9, {
              maliciousPattern: maliciousContent.pattern,
              sanitizedData: 'blocked'
            });
            
            return res.status(400).json({ 
              error: 'Invalid input detected',
              code: 'VALIDATION_FAILED'
            });
          }
          
          // Validate offchain-specific data
          const validationResult = this.validateOffchainProfileData(req.body);
          if (!validationResult.valid) {
            this.logSecurityEvent(req, OffchainSecurityEventType.DATA_VALIDATION_FAILED, 5, {
              errors: validationResult.errors
            });
            
            return res.status(400).json({
              error: 'Data validation failed',
              details: validationResult.errors
            });
          }
        }
        
        next();
      } catch (error) {
        console.error('Data validation error:', error);
        this.logSecurityEvent(req, OffchainSecurityEventType.DATA_VALIDATION_FAILED, 7, {
          error: error instanceof Error ? error.message : 'Unknown validation error'
        });
        
        res.status(500).json({ error: 'Validation error occurred' });
      }
    };
  }
  
  // Ownership enforcement for offchain profile data
  enforceOffchainOwnership() {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = (req as any).user;
      const targetWallet = req.params.walletAddress || req.body.walletAddress;
      
      if (!user || !user.walletAddress) {
        this.logSecurityEvent(req, OffchainSecurityEventType.UNAUTHORIZED_ACCESS, 8, {
          reason: 'No authenticated user'
        });
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Allow access to own data or admin access
      if (targetWallet && targetWallet !== user.walletAddress && !user.roles?.includes('admin')) {
        this.logSecurityEvent(req, OffchainSecurityEventType.OWNERSHIP_VIOLATION, 9, {
          userWallet: user.walletAddress,
          targetWallet: targetWallet,
          action: req.method + ' ' + req.path
        });
        
        return res.status(403).json({ 
          error: 'Access denied - insufficient permissions',
          code: 'OWNERSHIP_VIOLATION'
        });
      }
      
      next();
    };
  }
  
  // Audit logging for offchain profile changes
  auditOffchainChanges() {
    const self = this;
    return (req: Request, res: Response, next: NextFunction) => {
      const user = (req as any).user;
      const originalSend = res.json;
      
      res.json = function(body: any) {
        // Determine event type based on request
        let eventType = OffchainSecurityEventType.PROFILE_ACCESS;
        let riskScore = 1;
        
        if (req.path.includes('/points')) {
          eventType = OffchainSecurityEventType.POINTS_CHANGE;
          riskScore = 3;
          
          // Check for suspicious point changes
          if (req.body?.points && req.body.points > 1000) {
            eventType = OffchainSecurityEventType.XP_MANIPULATION_ATTEMPT;
            riskScore = 8;
          }
        } else if (req.path.includes('/leaderboard')) {
          eventType = OffchainSecurityEventType.LEADERBOARD_ACCESS;
          riskScore = 1;
        } else if (req.method === 'PUT' || req.method === 'PATCH') {
          eventType = OffchainSecurityEventType.PROFILE_UPDATE;
          riskScore = 2;
        }
        
        // Log the operation
        self.logSecurityEvent(req, eventType, riskScore, {
          userId: user?.walletAddress,
          action: `${req.method} ${req.path}`,
          statusCode: res.statusCode,
          responseSize: JSON.stringify(body).length,
          requestBody: req.method !== 'GET' ? req.body : undefined
        });
        
        return originalSend.call(this, body);
      };
      
      next();
    };
  }
  
  // Get security metrics
  async getSecurityMetrics() {
    return this.store.getMetrics();
  }
  
  // Helper methods
  private getClientIP(req: Request): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
           req.headers['x-real-ip'] as string ||
           req.socket.remoteAddress ||
           'unknown';
  }
  
  private sanitizeInput(input: any): any {
    if (typeof input === 'string') {
      // Basic XSS protection
      return input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        .trim();
    }
    
    if (Array.isArray(input)) {
      return input.map(item => this.sanitizeInput(item));
    }
    
    if (input && typeof input === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(input)) {
        sanitized[key] = this.sanitizeInput(value);
      }
      return sanitized;
    }
    
    return input;
  }
  
  private detectMaliciousContent(content: string): { detected: boolean; type: OffchainSecurityEventType; pattern?: string } {
    const patterns = [
      { pattern: /<script|javascript:|on\w+=/i, type: OffchainSecurityEventType.XSS_ATTEMPT },
      { pattern: /(\b(union|select|insert|delete|update|drop|create|alter|exec|execute)\b)|(-{2})|(\|\|)/i, type: OffchainSecurityEventType.SQL_INJECTION_ATTEMPT },
      { pattern: /\.\.(\/|\\)/g, type: OffchainSecurityEventType.SUSPICIOUS_ACTIVITY }
    ];
    
    for (const { pattern, type } of patterns) {
      if (pattern.test(content)) {
        return { detected: true, type, pattern: pattern.toString() };
      }
    }
    
    return { detected: false, type: OffchainSecurityEventType.PROFILE_ACCESS };
  }
  
  private validateOffchainProfileData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Validate points range
    if (data.points !== undefined) {
      if (typeof data.points !== 'number' || data.points < 0 || data.points > 1000000) {
        errors.push('Points must be a number between 0 and 1,000,000');
      }
    }
    
    // Validate XP range
    if (data.xp !== undefined) {
      if (typeof data.xp !== 'number' || data.xp < 0 || data.xp > 10000000) {
        errors.push('XP must be a number between 0 and 10,000,000');
      }
    }
    
    // Validate level
    if (data.level !== undefined) {
      if (typeof data.level !== 'number' || data.level < 1 || data.level > 1000) {
        errors.push('Level must be a number between 1 and 1000');
      }
    }
    
    // Validate username
    if (data.username !== undefined) {
      if (typeof data.username !== 'string' || data.username.length > 50) {
        errors.push('Username must be a string with maximum 50 characters');
      }
    }
    
    // Validate wallet address format
    if (data.walletAddress !== undefined) {
      if (typeof data.walletAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(data.walletAddress)) {
        errors.push('Invalid wallet address format');
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  private logSecurityEvent(
    req: Request, 
    eventType: OffchainSecurityEventType, 
    riskScore: number, 
    metadata: Record<string, any> = {}
  ): void {
    const user = (req as any).user;
    const context: OffchainSecurityContext = {
      userId: user?.walletAddress || 'anonymous',
      walletAddress: user?.walletAddress || '',
      action: `${req.method} ${req.path}`,
      ip: this.getClientIP(req),
      userAgent: req.headers['user-agent'] || '',
      timestamp: new Date(),
      riskScore,
      eventType,
      metadata: {
        ...metadata,
        query: req.query,
        params: req.params
      }
    };
    
    this.store.logSecurityEvent(context);
    
    // Also log to MongoDB if available
    this.logToMongoDB(context);
    
    // Log high-risk events to console
    if (riskScore > 7) {
      console.warn(`High-risk security event: ${eventType}`, {
        ip: context.ip,
        user: context.userId,
        riskScore,
        metadata
      });
    }
  }
  
  private async logToMongoDB(context: OffchainSecurityContext): Promise<void> {
    if (!this.mongoClient) return;
    
    try {
      const db = this.mongoClient.db(process.env.MONGO_DB_NAME || 'yap');
      await db.collection('security_audit').insertOne({
        ...context,
        service: 'offchain-profile-service',
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Failed to log security event to MongoDB:', error);
    }
  }
}

export const offchainProfileSecurityMiddleware = new OffchainProfileSecurityMiddleware();
export { OffchainSecurityEventType, OffchainSecurityContext };
