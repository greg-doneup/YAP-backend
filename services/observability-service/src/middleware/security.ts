import { Request, Response, NextFunction } from 'express';

// Security event types for observability service
enum ObservabilitySecurityEventType {
  METRICS_ACCESS = 'metrics_access',
  BILLING_ACCESS = 'billing_access',
  USAGE_EVENT_INGESTION = 'usage_event_ingestion',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  DATA_VALIDATION_FAILED = 'data_validation_failed',
  XSS_ATTEMPT = 'xss_attempt',
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  METRICS_SCRAPING = 'metrics_scraping',
  BILLING_MANIPULATION_ATTEMPT = 'billing_manipulation_attempt',
  EXCESSIVE_EVENTS = 'excessive_events'
}

// Security context interface
interface ObservabilitySecurityContext {
  userId: string;
  action: string;
  ip: string;
  userAgent: string;
  timestamp: Date;
  riskScore: number;
  eventType: ObservabilitySecurityEventType;
  metadata?: Record<string, any>;
}

// In-memory storage for rate limiting and security tracking
class ObservabilitySecurityStore {
  private rateLimitStore = new Map<string, { count: number; resetTime: number }>();
  private securityEvents: ObservabilitySecurityContext[] = [];
  private suspiciousIPs = new Set<string>();
  private blockedIPs = new Set<string>();
  private eventCounts = new Map<string, { count: number; window: number }>();
  
  // Track rate limits with different limits for different endpoints
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
  
  // Track event ingestion for monitoring abuse
  trackEventIngestion(ip: string): { allowed: boolean; count: number } {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    const maxEvents = 100; // Max 100 events per minute per IP
    
    const key = `events:${ip}`;
    const record = this.eventCounts.get(key);
    
    if (!record || now > record.window) {
      this.eventCounts.set(key, { count: 1, window: now + windowMs });
      return { allowed: true, count: 1 };
    }
    
    record.count++;
    this.eventCounts.set(key, record);
    return { allowed: record.count <= maxEvents, count: record.count };
  }
  
  // Log security events
  logSecurityEvent(event: ObservabilitySecurityContext): void {
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
    
    if (recentSuspiciousEvents.length >= 3) {
      this.blockedIPs.add(event.ip);
      console.warn(`Auto-blocked IP ${event.ip} due to suspicious observability activity`);
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
      activeRateLimits: this.rateLimitStore.size,
      timestamp: new Date().toISOString()
    };
  }
  
  private groupEventsByType(events: ObservabilitySecurityContext[]) {
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

// Main security middleware class for observability service
export class ObservabilitySecurityMiddleware {
  private store = new ObservabilitySecurityStore();
  
  // Security headers middleware
  observabilitySecurityHeaders() {
    return (_req: Request, res: Response, next: NextFunction) => {
      // Enhanced security headers for observability service
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self'; " +
        "img-src 'self'; " +
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
  
  // Rate limiting middleware with endpoint-specific limits
  observabilityRateLimit() {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip = this.getClientIP(req);
      
      // Check if IP is blocked
      if (this.store.isBlocked(ip)) {
        this.logSecurityEvent(req, ObservabilitySecurityEventType.RATE_LIMIT_EXCEEDED, 10, {
          reason: 'IP blocked due to previous violations',
          blockedIP: ip
        });
        return res.status(429).json({ 
          error: 'Too many requests - IP temporarily blocked',
          retryAfter: '1 hour'
        });
      }
      
      // Different rate limits for different endpoints
      let maxRequests = 100;
      let windowMinutes = 15;
      
      if (req.path.includes('/metrics')) {
        maxRequests = 200; // Prometheus scraping needs higher limits
        windowMinutes = 5;
      } else if (req.path.includes('/billing')) {
        maxRequests = 30; // Billing operations should be limited
        windowMinutes = 15;
      } else if (req.path.includes('/usage/event')) {
        // Use special handling for event ingestion
        const eventCheck = this.store.trackEventIngestion(ip);
        if (!eventCheck.allowed) {
          this.logSecurityEvent(req, ObservabilitySecurityEventType.EXCESSIVE_EVENTS, 8, {
            eventCount: eventCheck.count,
            limit: 100,
            window: '1 minute'
          });
          
          return res.status(429).json({ 
            error: 'Event ingestion rate limit exceeded',
            limit: 100,
            window: '1 minute'
          });
        }
        return next(); // Skip regular rate limiting for event ingestion
      }
      
      const key = `rate_limit:${ip}:${req.path}`;
      const windowMs = windowMinutes * 60 * 1000;
      const result = this.store.trackRequest(key, windowMs, maxRequests);
      
      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + windowMs).toISOString());
      
      if (!result.allowed) {
        this.logSecurityEvent(req, ObservabilitySecurityEventType.RATE_LIMIT_EXCEEDED, 6, {
          limit: maxRequests,
          window: windowMinutes,
          endpoint: req.path
        });
        
        return res.status(429).json({ 
          error: 'Rate limit exceeded',
          limit: maxRequests,
          window: `${windowMinutes} minutes`,
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }
      
      next();
    };
  }
  
  // Data validation middleware
  validateObservabilityData() {
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
          
          // Validate observability-specific data
          const validationResult = this.validateObservabilityPayload(req.body, req.path);
          if (!validationResult.valid) {
            this.logSecurityEvent(req, ObservabilitySecurityEventType.DATA_VALIDATION_FAILED, 5, {
              errors: validationResult.errors,
              endpoint: req.path
            });
            
            return res.status(400).json({
              error: 'Data validation failed',
              details: validationResult.errors
            });
          }
        }
        
        next();
      } catch (error) {
        console.error('Observability data validation error:', error);
        this.logSecurityEvent(req, ObservabilitySecurityEventType.DATA_VALIDATION_FAILED, 7, {
          error: error instanceof Error ? error.message : 'Unknown validation error'
        });
        
        res.status(500).json({ error: 'Validation error occurred' });
      }
    };
  }
  
  // Audit logging for observability operations
  auditObservabilityOperations() {
    const self = this;
    return (req: Request, res: Response, next: NextFunction) => {
      const originalSend = res.json;
      
      res.json = function(body: any) {
        // Determine event type based on request
        let eventType = ObservabilitySecurityEventType.METRICS_ACCESS;
        let riskScore = 1;
        
        if (req.path.includes('/metrics')) {
          eventType = ObservabilitySecurityEventType.METRICS_SCRAPING;
          riskScore = 1; // Normal operation
        } else if (req.path.includes('/billing')) {
          eventType = ObservabilitySecurityEventType.BILLING_ACCESS;
          riskScore = 3; // Higher risk due to financial data
          
          // Check for suspicious billing patterns
          if (req.body?.amount && req.body.amount > 10000) {
            eventType = ObservabilitySecurityEventType.BILLING_MANIPULATION_ATTEMPT;
            riskScore = 9;
          }
        } else if (req.path.includes('/usage/event')) {
          eventType = ObservabilitySecurityEventType.USAGE_EVENT_INGESTION;
          riskScore = 2;
        }
        
        // Log the operation
        self.logSecurityEvent(req, eventType, riskScore, {
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
  
  // Metrics endpoint protection
  protectMetricsEndpoint() {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip = this.getClientIP(req);
      
      // Allow Prometheus-like user agents and internal requests
      const userAgent = req.headers['user-agent'] || '';
      const isPrometheus = userAgent.includes('Prometheus') || userAgent.includes('prometheus');
      const isInternal = ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.');
      
      if (!isPrometheus && !isInternal) {
        // Log external metrics access
        this.logSecurityEvent(req, ObservabilitySecurityEventType.METRICS_ACCESS, 4, {
          userAgent,
          ip,
          reason: 'External metrics access'
        });
        
        // Add warning header but allow access
        res.setHeader('X-Metrics-Warning', 'External access to metrics endpoint');
      }
      
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
  
  private detectMaliciousContent(content: string): { detected: boolean; type: ObservabilitySecurityEventType; pattern?: string } {
    const patterns = [
      { pattern: /<script|javascript:|on\w+=/i, type: ObservabilitySecurityEventType.XSS_ATTEMPT },
      { pattern: /(\b(union|select|insert|delete|update|drop|create|alter|exec|execute)\b)|(-{2})|(\|\|)/i, type: ObservabilitySecurityEventType.SQL_INJECTION_ATTEMPT },
      { pattern: /\.\.(\/|\\)/g, type: ObservabilitySecurityEventType.SUSPICIOUS_ACTIVITY }
    ];
    
    for (const { pattern, type } of patterns) {
      if (pattern.test(content)) {
        return { detected: true, type, pattern: pattern.toString() };
      }
    }
    
    return { detected: false, type: ObservabilitySecurityEventType.METRICS_ACCESS };
  }
  
  private validateObservabilityPayload(data: any, endpoint: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (endpoint.includes('/usage/event')) {
      // Validate usage event data
      if (!data.eventType || typeof data.eventType !== 'string') {
        errors.push('eventType is required and must be a string');
      }
      
      if (!data.userId || typeof data.userId !== 'string') {
        errors.push('userId is required and must be a string');
      }
      
      if (data.timestamp && !(data.timestamp instanceof Date) && isNaN(Date.parse(data.timestamp))) {
        errors.push('timestamp must be a valid date');
      }
      
      if (data.metadata && typeof data.metadata !== 'object') {
        errors.push('metadata must be an object');
      }
    }
    
    if (endpoint.includes('/billing')) {
      // Validate billing data
      if (data.amount !== undefined) {
        if (typeof data.amount !== 'number' || data.amount < 0 || data.amount > 100000) {
          errors.push('amount must be a number between 0 and 100000');
        }
      }
      
      if (data.currency && typeof data.currency !== 'string') {
        errors.push('currency must be a string');
      }
      
      if (data.userId && typeof data.userId !== 'string') {
        errors.push('userId must be a string');
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  private logSecurityEvent(
    req: Request, 
    eventType: ObservabilitySecurityEventType, 
    riskScore: number, 
    metadata: Record<string, any> = {}
  ): void {
    const context: ObservabilitySecurityContext = {
      userId: 'system', // Observability service typically doesn't have user context
      action: `${req.method} ${req.path}`,
      ip: this.getClientIP(req),
      userAgent: req.headers['user-agent'] || '',
      timestamp: new Date(),
      riskScore,
      eventType,
      metadata: {
        ...metadata,
        query: req.query,
        headers: {
          'content-type': req.headers['content-type'],
          'authorization': req.headers.authorization ? '[REDACTED]' : undefined
        }
      }
    };
    
    this.store.logSecurityEvent(context);
    
    // Log high-risk events to console
    if (riskScore > 7) {
      console.warn(`High-risk observability security event: ${eventType}`, {
        ip: context.ip,
        riskScore,
        metadata
      });
    }
  }
}

export const observabilitySecurityMiddleware = new ObservabilitySecurityMiddleware();
export { ObservabilitySecurityEventType, ObservabilitySecurityContext };
