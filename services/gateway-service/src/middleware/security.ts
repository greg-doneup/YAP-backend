import { Request, Response, NextFunction } from 'express';
import { MongoClient } from 'mongodb';
import * as crypto from 'crypto';

// Security middleware for gateway service
export class GatewaySecurityMiddleware {
  private mongoClient: MongoClient | null = null;
  private requestCounts: Map<string, { count: number; windowStart: Date }> = new Map();
  private failedAttempts: Map<string, { count: number; lastAttempt: Date; blocked: boolean }> = new Map();
  private suspiciousPatterns: Map<string, number> = new Map();

  constructor() {
    this.initializeDatabase();
  }

  private async initializeDatabase() {
    try {
      const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
      this.mongoClient = new MongoClient(mongoUri);
      await this.mongoClient.connect();
      console.log('✅ Gateway security middleware connected to MongoDB');
    } catch (error) {
      console.error('❌ Failed to connect gateway security middleware to MongoDB:', error);
    }
  }

  // Enhanced rate limiting with service-specific limits (simplified for no-auth)
  gatewayRateLimit() {
    return (req: Request, res: Response, next: NextFunction) => {
      const clientIp = this.getClientIp(req);
      const service = this.getServiceFromPath(req.path);
      const now = new Date();
      const windowMinutes = 5;
      const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

      // Simplified service limits for no-auth environment
      const serviceLimits: { [key: string]: number } = {
        'auth': 100,         // Increased for waitlist signups
        'profile': 100,      // Increased since no auth required
        'learning': 200,     // Increased for public access
        'reward': 100,       // Increased for public access
        'api': 100,          // For /api/waitlist endpoints
        'default': 100       // More generous default limit
      };

      const maxRequests = serviceLimits[service] || serviceLimits.default;
      const key = `${clientIp}:${service}`;

      // Clean old entries
      const entriesToDelete: string[] = [];
      for (const [rateLimitKey, data] of this.requestCounts.entries()) {
        if (data.windowStart < windowStart) {
          entriesToDelete.push(rateLimitKey);
        }
      }
      entriesToDelete.forEach(key => this.requestCounts.delete(key));

      // Check current IP for this service
      const current = this.requestCounts.get(key);
      if (!current || current.windowStart < windowStart) {
        this.requestCounts.set(key, { count: 1, windowStart: now });
      } else {
        current.count++;
        if (current.count > maxRequests) {
          this.logSecurityEvent('gateway_rate_limit_exceeded', clientIp, {
            service,
            endpoint: req.path,
            count: current.count,
            limit: maxRequests
          });
          return res.status(429).json({
            error: 'rate_limit_exceeded',
            message: `Too many requests to ${service} service. Please try again later.`,
            retryAfter: windowMinutes * 60,
            service
          });
        }
      }

      next();
    };
  }

  // DDoS protection (simplified for no-auth)
  ddosProtection() {
    return (req: Request, res: Response, next: NextFunction) => {
      const clientIp = this.getClientIp(req);
      const now = new Date();
      
      // Check for rapid fire requests (more than 50 requests in 1 second - more lenient)
      const rapidFireKey = `${clientIp}:rapid`;
      const rapidFireWindow = new Date(now.getTime() - 1000); // 1 second window
      
      const rapidFireCount = this.requestCounts.get(rapidFireKey);
      if (!rapidFireCount || rapidFireCount.windowStart < rapidFireWindow) {
        this.requestCounts.set(rapidFireKey, { count: 1, windowStart: now });
      } else {
        rapidFireCount.count++;
        if (rapidFireCount.count > 50) { // Increased threshold for no-auth
          this.logSecurityEvent('ddos_attempt_detected', clientIp, {
            rapidFireCount: rapidFireCount.count,
            endpoint: req.path,
            userAgent: req.headers['user-agent']
          });
          
          // Block this IP for 10 minutes (shorter than before)
          this.failedAttempts.set(clientIp, {
            count: 999,
            lastAttempt: now,
            blocked: true
          });
          
          return res.status(429).json({
            error: 'too_many_requests',
            message: 'Suspicious activity detected. Access temporarily blocked.',
            retryAfter: 600 // 10 minutes
          });
        }
      }

      next();
    };
  }

  // Request validation (simplified for no-auth)
  validateGatewayRequest() {
    return (req: Request, res: Response, next: NextFunction) => {
      const clientIp = this.getClientIp(req);

      // Check for blocked IPs (reduced block time)
      const failedData = this.failedAttempts.get(clientIp);
      if (failedData?.blocked) {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000); // Reduced to 10 minutes
        if (failedData.lastAttempt > tenMinutesAgo) {
          return res.status(429).json({
            error: 'ip_blocked',
            message: 'IP address temporarily blocked due to suspicious activity'
          });
        } else {
          // Unblock after 10 minutes
          this.failedAttempts.delete(clientIp);
        }
      }

      // Validate request size (increased for no-auth)
      const contentLength = parseInt(req.headers['content-length'] || '0');
      if (contentLength > 5 * 1024 * 1024) { // Increased to 5MB limit
        this.logSecurityEvent('oversized_request', clientIp, {
          contentLength,
          endpoint: req.path
        });
        return res.status(413).json({
          error: 'payload_too_large',
          message: 'Request payload too large'
        });
      }

      // Basic validation only (removed strict user agent checking for public API)
      const queryString = JSON.stringify(req.query);
      const sqlPatterns = [
        /union\s+select/i, /drop\s+table/i, /insert\s+into/i, /delete\s+from/i,
        /exec\s*\(/i, /script\s*:/i, /javascript\s*:/i
      ];

      for (const pattern of sqlPatterns) {
        if (pattern.test(queryString)) {
          this.logSecurityEvent('sql_injection_attempt', clientIp, {
            pattern: pattern.source,
            query: queryString.substring(0, 200),
            endpoint: req.path
          });
          return res.status(400).json({
            error: 'invalid_request',
            message: 'Invalid request parameters'
          });
        }
      }

      next();
    };
  }

  // Enhanced security headers for gateway
  gatewaySecurityHeaders() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'");
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      
      // Remove fingerprinting headers
      res.removeHeader('X-Powered-By');
      res.removeHeader('Server');
      res.removeHeader('Via');
      
      // Add gateway identification
      res.setHeader('X-Gateway-Version', '2.0.0');
      res.setHeader('X-Request-ID', req.headers['x-request-id'] || 'unknown');
      
      next();
    };
  }

  // Request logging and monitoring
  requestMonitoring() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const clientIp = this.getClientIp(req);
      const service = this.getServiceFromPath(req.path);

      // Log request
      console.log(`[GATEWAY] ${req.method} ${req.path} from ${clientIp} -> ${service}`);

      // Monitor response
      const originalSend = res.send;
      res.send = function(data) {
        const duration = Date.now() - startTime;
        
        // Log security-relevant responses
        if (res.statusCode >= 400) {
          req.app.locals.gatewaySecurity?.logSecurityEvent('gateway_error_response', clientIp, {
            statusCode: res.statusCode,
            method: req.method,
            endpoint: req.path,
            service,
            duration,
            userAgent: req.headers['user-agent']
          });
        }

        // Log slow requests (potential DoS)
        if (duration > 5000) {
          req.app.locals.gatewaySecurity?.logSecurityEvent('slow_request_detected', clientIp, {
            duration,
            method: req.method,
            endpoint: req.path,
            service
          });
        }

        return originalSend.call(this, data);
      };

      next();
    };
  }

  // Helper methods
  private getServiceFromPath(path: string): string {
    const segments = path.split('/').filter(Boolean);
    return segments[0] || 'unknown';
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'] as string;
    const realIp = req.headers['x-real-ip'] as string;
    const ip = forwarded ? forwarded.split(',')[0] : realIp || req.connection.remoteAddress;
    return ip || 'unknown';
  }

  private isSuspiciousUserAgent(userAgent: string): boolean {
    const suspiciousPatterns = [
      /bot/i, /crawler/i, /spider/i, /scraper/i,
      /curl/i, /wget/i, /python/i, /java/i,
      /^$/  // Empty user agent
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  // Security event logging
  private async logSecurityEvent(eventType: string, clientIp: string, details: any) {
    const event = {
      timestamp: new Date(),
      eventType,
      clientIp,
      details,
      service: 'gateway-service'
    };

    console.log(`[GATEWAY-SECURITY] ${eventType} from ${clientIp}:`, details);

    if (this.mongoClient) {
      try {
        const db = this.mongoClient.db(process.env.MONGO_DB_NAME || 'yap');
        await db.collection('security_audit').insertOne(event);
      } catch (error) {
        console.error('Failed to log gateway security event:', error);
      }
    }
  }

  // Get gateway security metrics
  async getSecurityMetrics() {
    if (!this.mongoClient) {
      return { error: 'Database not available' };
    }

    try {
      const db = this.mongoClient.db(process.env.MONGO_DB_NAME || 'yap');
      const collection = db.collection('security_audit');
      
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [totalEvents, eventBreakdown, serviceBreakdown] = await Promise.all([
        collection.countDocuments({
          timestamp: { $gte: last24h },
          service: 'gateway-service'
        }),
        collection.aggregate([
          { $match: { timestamp: { $gte: last24h }, service: 'gateway-service' } },
          { $group: { _id: '$eventType', count: { $sum: 1 } } }
        ]).toArray(),
        collection.aggregate([
          { $match: { timestamp: { $gte: last24h }, service: 'gateway-service' } },
          { $group: { _id: '$details.service', count: { $sum: 1 } } }
        ]).toArray()
      ]);

      return {
        totalEvents,
        eventBreakdown: eventBreakdown.reduce((acc: any, item: any) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        serviceBreakdown: serviceBreakdown.reduce((acc: any, item: any) => {
          acc[item._id || 'unknown'] = item.count;
          return acc;
        }, {}),
        activeRateLimits: this.requestCounts.size,
        blockedIPs: Array.from(this.failedAttempts.entries())
          .filter(([, data]) => data.blocked)
          .map(([ip]) => ip),
        timestamp: now.toISOString()
      };
    } catch (error) {
      console.error('Error getting gateway security metrics:', error);
      return { error: 'Failed to get metrics' };
    }
  }
}

export const gatewaySecurityMiddleware = new GatewaySecurityMiddleware();
