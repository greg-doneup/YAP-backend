import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { logSecurityEvent } from '../utils/mongodb';

// Enhanced security middleware for auth service
export class SecurityMiddleware {
  private failedAttempts: Map<string, { count: number; lastAttempt: Date; blocked: boolean }> = new Map();
  private requestCounts: Map<string, { count: number; windowStart: Date }> = new Map();

  // Rate limiting middleware
  rateLimit(maxRequests: number = 100, windowMinutes: number = 15) {
    return (req: Request, res: Response, next: NextFunction) => {
      const clientIp = this.getClientIp(req);
      const now = new Date();
      const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

      // Clean old entries
      for (const [ip, data] of this.requestCounts.entries()) {
        if (data.windowStart < windowStart) {
          this.requestCounts.delete(ip);
        }
      }

      // Check current IP
      const current = this.requestCounts.get(clientIp);
      if (!current || current.windowStart < windowStart) {
        this.requestCounts.set(clientIp, { count: 1, windowStart: now });
      } else {
        current.count++;
        if (current.count > maxRequests) {
          this.logSecurityEvent('rate_limit_exceeded', clientIp, {
            endpoint: req.path,
            count: current.count,
            limit: maxRequests
          });
          return res.status(429).json({
            error: 'rate_limit_exceeded',
            message: 'Too many requests. Please try again later.',
            retryAfter: windowMinutes * 60
          });
        }
      }

      next();
    };
  }

  // Failed authentication tracking
  trackFailedAuth() {
    return (req: Request, res: Response, next: NextFunction) => {
      const clientIp = this.getClientIp(req);
      const email = req.body.email || req.body.userId;

      // Check if IP is blocked
      const attempts = this.failedAttempts.get(clientIp);
      if (attempts?.blocked && attempts.lastAttempt > new Date(Date.now() - 60 * 60 * 1000)) {
        this.logSecurityEvent('blocked_ip_attempt', clientIp, { email });
        return res.status(429).json({
          error: 'ip_blocked',
          message: 'IP temporarily blocked due to repeated failed attempts',
          retryAfter: 3600
        });
      }

      // Add failed attempt tracking to response
      const originalSend = res.send;
      res.send = function(data) {
        if (res.statusCode === 401 || res.statusCode === 403) {
          // Track failed attempt
          const current = attempts || { count: 0, lastAttempt: new Date(), blocked: false };
          current.count++;
          current.lastAttempt = new Date();
          
          if (current.count >= 5) {
            current.blocked = true;
            req.app.locals.securityMiddleware.logSecurityEvent('ip_blocked', clientIp, { 
              email, 
              attempts: current.count 
            });
          }
          
          req.app.locals.securityMiddleware.failedAttempts.set(clientIp, current);
          req.app.locals.securityMiddleware.logSecurityEvent('failed_auth', clientIp, { 
            email, 
            endpoint: req.path,
            attempts: current.count 
          });
        } else if (res.statusCode >= 200 && res.statusCode < 300) {
          // Reset failed attempts on success
          req.app.locals.securityMiddleware.failedAttempts.delete(clientIp);
        }
        
        return originalSend.call(this, data);
      };

      next();
    };
  }

  // Input validation and sanitization
  validateInput() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Validate email format
      if (req.body.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(req.body.email)) {
          this.logSecurityEvent('invalid_email_format', this.getClientIp(req), { 
            email: req.body.email 
          });
          return res.status(400).json({
            error: 'invalid_email',
            message: 'Invalid email format'
          });
        }
      }

      // Validate passphrase/password strength
      if (req.body.passphrase || req.body.password) {
        const password = req.body.passphrase || req.body.password;
        if (password.length < 8) {
          return res.status(400).json({
            error: 'weak_password',
            message: 'Password must be at least 8 characters long'
          });
        }
        if (password.length > 1000) {
          this.logSecurityEvent('suspiciously_long_password', this.getClientIp(req), { 
            length: password.length 
          });
          return res.status(400).json({
            error: 'invalid_password',
            message: 'Password too long'
          });
        }
      }

      // Check for SQL injection patterns
      const sqlPatterns = [/union\s+select/i, /drop\s+table/i, /insert\s+into/i, /delete\s+from/i];
      const bodyStr = JSON.stringify(req.body);
      for (const pattern of sqlPatterns) {
        if (pattern.test(bodyStr)) {
          this.logSecurityEvent('sql_injection_attempt', this.getClientIp(req), { 
            pattern: pattern.source,
            body: bodyStr.substring(0, 100) // Log first 100 chars only
          });
          return res.status(400).json({
            error: 'invalid_input',
            message: 'Invalid input detected'
          });
        }
      }

      next();
    };
  }

  // Security headers middleware
  securityHeaders() {
    return (req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Content-Security-Policy', "default-src 'self'");
      
      // Remove sensitive headers
      res.removeHeader('X-Powered-By');
      res.removeHeader('Server');
      
      next();
    };
  }

  // Audit logging
  private async logSecurityEvent(eventType: string, clientIp: string, details: any) {
    // Log to console
    console.log(`[SECURITY] ${eventType} from ${clientIp}:`, details);

    // Log to database using shared MongoDB client
    try {
      await logSecurityEvent(eventType, clientIp, details);
    } catch (error) {
      console.error('Failed to log security event to database:', error);
    }
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'] as string;
    const ip = forwarded ? forwarded.split(',')[0] : req.connection.remoteAddress;
    return ip || 'unknown';
  }

  // Get security metrics
  async getSecurityMetrics() {
    try {
      const { getDatabase } = await import('../utils/mongodb');
      const db = await getDatabase();
      const collection = db.collection('security_audit');
      
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const metrics = await collection.aggregate([
        { $match: { timestamp: { $gte: last24h }, service: 'auth-service' } },
        {
          $group: {
            _id: '$eventType',
            count: { $sum: 1 }
          }
        }
      ]).toArray();

      const totalEvents = await collection.countDocuments({
        timestamp: { $gte: last24h },
        service: 'auth-service'
      });

      return {
        totalEvents,
        eventBreakdown: metrics.reduce((acc: any, item: any) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        activeBlocks: this.failedAttempts.size,
        timestamp: now.toISOString()
      };
    } catch (error) {
      console.error('Error getting security metrics:', error);
      return { error: 'Failed to get metrics' };
    }
  }
}

export const securityMiddleware = new SecurityMiddleware();
