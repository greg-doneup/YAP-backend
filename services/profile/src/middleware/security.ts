import { Request, Response, NextFunction } from 'express';
import { MongoClient } from 'mongodb';
import crypto from 'crypto';

// Security middleware for profile service
export class ProfileSecurityMiddleware {
  private mongoClient: MongoClient | null = null;
  private requestCounts: Map<string, { count: number; windowStart: Date }> = new Map();

  constructor() {
    this.initializeDatabase();
  }

  private async initializeDatabase() {
    try {
      const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
      this.mongoClient = new MongoClient(mongoUri);
      await this.mongoClient.connect();
      console.log('✅ Profile security middleware connected to MongoDB');
    } catch (error) {
      console.error('❌ Failed to connect profile security middleware to MongoDB:', error);
    }
  }

  // Rate limiting for profile operations
  profileRateLimit(maxRequests: number = 30, windowMinutes: number = 5) {
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
          this.logSecurityEvent('profile_rate_limit_exceeded', clientIp, {
            endpoint: req.path,
            userId: (req as any).user?.sub,
            count: current.count
          });
          return res.status(429).json({
            error: 'rate_limit_exceeded',
            message: 'Too many profile requests. Please try again later.',
            retryAfter: windowMinutes * 60
          });
        }
      }

      next();
    };
  }

  // Data validation and sanitization
  validateProfileData() {
    return (req: Request, res: Response, next: NextFunction) => {
      const { body } = req;

      // Validate email format if present
      if (body.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(body.email)) {
          this.logSecurityEvent('invalid_email_in_profile', this.getClientIp(req), {
            userId: (req as any).user?.sub,
            email: body.email
          });
          return res.status(400).json({
            error: 'invalid_email',
            message: 'Invalid email format'
          });
        }
      }

      // Validate name field (prevent XSS)
      if (body.name) {
        const sanitizedName = this.sanitizeString(body.name);
        if (sanitizedName !== body.name) {
          this.logSecurityEvent('xss_attempt_in_name', this.getClientIp(req), {
            userId: (req as any).user?.sub,
            originalName: body.name.substring(0, 50)
          });
          return res.status(400).json({
            error: 'invalid_name',
            message: 'Name contains invalid characters'
          });
        }
      }

      // Validate numeric fields
      if (body.xp !== undefined) {
        if (!Number.isInteger(body.xp) || body.xp < 0 || body.xp > 1000000) {
          this.logSecurityEvent('invalid_xp_value', this.getClientIp(req), {
            userId: (req as any).user?.sub,
            xp: body.xp
          });
          return res.status(400).json({
            error: 'invalid_xp',
            message: 'XP must be a valid non-negative integer'
          });
        }
      }

      if (body.streak !== undefined) {
        if (!Number.isInteger(body.streak) || body.streak < 0 || body.streak > 10000) {
          this.logSecurityEvent('invalid_streak_value', this.getClientIp(req), {
            userId: (req as any).user?.sub,
            streak: body.streak
          });
          return res.status(400).json({
            error: 'invalid_streak',
            message: 'Streak must be a valid non-negative integer'
          });
        }
      }

      next();
    };
  }

  // Prevent unauthorized profile access
  enforceProfileOwnership() {
    return (req: Request, res: Response, next: NextFunction) => {
      const requestedUserId = req.params.userId;
      const authenticatedUserId = (req as any).user?.sub;
      const isAdmin = (req as any).user?.roles?.includes('admin');

      if (!authenticatedUserId) {
        this.logSecurityEvent('missing_user_id', this.getClientIp(req), {
          requestedUserId,
          endpoint: req.path
        });
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Missing user authentication'
        });
      }

      if (requestedUserId !== authenticatedUserId && !isAdmin) {
        this.logSecurityEvent('unauthorized_profile_access', this.getClientIp(req), {
          authenticatedUserId,
          requestedUserId,
          endpoint: req.path
        });
        return res.status(403).json({
          error: 'forbidden',
          message: 'You can only access your own profile'
        });
      }

      next();
    };
  }

  // Audit profile changes
  auditProfileChanges() {
    return (req: Request, res: Response, next: NextFunction) => {
      const originalSend = res.send;
      const userId = (req as any).user?.sub;
      const changes = { ...req.body };

      res.send = function(data) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          req.app.locals.profileSecurity.logSecurityEvent('profile_updated', 
            req.app.locals.profileSecurity.getClientIp(req), {
            userId,
            changes: Object.keys(changes),
            endpoint: req.path,
            method: req.method
          });
        }
        return originalSend.call(this, data);
      };

      next();
    };
  }

  // Enhanced security headers for profile service
  profileSecurityHeaders() {
    return (req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.removeHeader('X-Powered-By');
      
      next();
    };
  }

  private sanitizeString(str: string): string {
    return str.replace(/<script[^>]*>.*?<\/script>/gi, '')
              .replace(/<[^>]*>/g, '')
              .replace(/javascript:/gi, '')
              .replace(/on\w+=/gi, '')
              .trim();
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'] as string;
    const ip = forwarded ? forwarded.split(',')[0] : req.connection.remoteAddress;
    return ip || 'unknown';
  }

  private async logSecurityEvent(eventType: string, clientIp: string, details: any) {
    const event = {
      timestamp: new Date(),
      eventType,
      clientIp,
      details,
      service: 'profile-service'
    };

    console.log(`[PROFILE-SECURITY] ${eventType} from ${clientIp}:`, details);

    if (this.mongoClient) {
      try {
        const db = this.mongoClient.db(process.env.MONGO_DB_NAME || 'yap');
        await db.collection('security_audit').insertOne(event);
      } catch (error) {
        console.error('Failed to log profile security event:', error);
      }
    }
  }

  // Get profile security metrics
  async getSecurityMetrics() {
    if (!this.mongoClient) {
      return { error: 'Database not available' };
    }

    try {
      const db = this.mongoClient.db(process.env.MONGO_DB_NAME || 'yap');
      const collection = db.collection('security_audit');
      
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [totalEvents, eventBreakdown] = await Promise.all([
        collection.countDocuments({
          timestamp: { $gte: last24h },
          service: 'profile-service'
        }),
        collection.aggregate([
          { $match: { timestamp: { $gte: last24h }, service: 'profile-service' } },
          { $group: { _id: '$eventType', count: { $sum: 1 } } }
        ]).toArray()
      ]);

      return {
        totalEvents,
        eventBreakdown: eventBreakdown.reduce((acc: any, item: any) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        activeRateLimits: this.requestCounts.size,
        timestamp: now.toISOString()
      };
    } catch (error) {
      console.error('Error getting profile security metrics:', error);
      return { error: 'Failed to get metrics' };
    }
  }
}

export const profileSecurityMiddleware = new ProfileSecurityMiddleware();
