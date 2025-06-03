import { MongoClient, Db } from 'mongodb';

/**
 * Security event types for audit logging
 */
export enum SecurityEventType {
  PROFILE_ACCESS = 'profile_access',
  PROFILE_CREATE = 'profile_create',
  PROFILE_UPDATE = 'profile_update',
  PROFILE_DELETE = 'profile_delete',
  PRIVATE_KEY_STORE = 'private_key_store',
  PRIVATE_KEY_ACCESS = 'private_key_access',
  PRIVATE_KEY_DELETE = 'private_key_delete',
  SECURITY_VIOLATION = 'security_violation',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  GDPR_EXPORT = 'gdpr_export',
  GDPR_DELETE = 'gdpr_delete',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  VALIDATION_FAILURE = 'validation_failure'
}

/**
 * Audit log entry interface
 */
export interface AuditLogEntry {
  timestamp: Date;
  eventType: SecurityEventType;
  userId?: string;
  clientIp: string;
  userAgent: string;
  action: string;
  resource: string;
  success: boolean;
  details?: Record<string, any>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Audit logger for profile service security events
 */
export class AuditLogger {
  private mongoClient: MongoClient | null = null;
  private db: Db | null = null;
  
  constructor() {
    this.initializeDatabase();
  }
  
  private async initializeDatabase() {
    try {
      const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
      this.mongoClient = new MongoClient(mongoUri);
      await this.mongoClient.connect();
      this.db = this.mongoClient.db('audit_logs');
      
      // Create indexes for efficient querying
      await this.db.collection('profile_security_events').createIndexes([
        { key: { timestamp: -1 } },
        { key: { userId: 1, timestamp: -1 } },
        { key: { eventType: 1, timestamp: -1 } },
        { key: { clientIp: 1, timestamp: -1 } },
        { key: { riskLevel: 1, timestamp: -1 } }
      ]);
      
      console.log('✅ Profile audit logger connected to MongoDB');
    } catch (error) {
      console.error('❌ Failed to connect profile audit logger to MongoDB:', error);
    }
  }
  
  /**
   * Log a security event
   */
  async logSecurityEvent(
    eventType: SecurityEventType,
    action: string,
    resource: string,
    req: any,
    success: boolean,
    details?: Record<string, any>
  ): Promise<void> {
    try {
      if (!this.db) {
        console.error('Audit logger not initialized');
        return;
      }
      
      const clientIp = this.getClientIp(req);
      const userAgent = req.headers['user-agent'] || 'unknown';
      const userId = req.user?.sub || req.user?.userId;
      
      const logEntry: AuditLogEntry = {
        timestamp: new Date(),
        eventType,
        userId,
        clientIp,
        userAgent,
        action,
        resource,
        success,
        details: {
          ...details,
          endpoint: req.path,
          method: req.method,
          requestId: req.headers['x-request-id']
        },
        riskLevel: this.calculateRiskLevel(eventType, success, details)
      };
      
      await this.db.collection('profile_security_events').insertOne(logEntry);
      
      // Log high-risk events to console immediately
      if (logEntry.riskLevel === 'high' || logEntry.riskLevel === 'critical') {
        console.warn(`🚨 High-risk security event: ${eventType} - ${action} by ${userId || 'anonymous'} from ${clientIp}`);
      }
      
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }
  
  /**
   * Log profile access event
   */
  async logProfileAccess(req: any, profileId: string, success: boolean): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.PROFILE_ACCESS,
      'profile_read',
      `profile:${profileId}`,
      req,
      success,
      { profileId }
    );
  }
  
  /**
   * Log profile creation event
   */
  async logProfileCreation(req: any, profileId: string, success: boolean): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.PROFILE_CREATE,
      'profile_create',
      `profile:${profileId}`,
      req,
      success,
      { profileId }
    );
  }
  
  /**
   * Log profile update event
   */
  async logProfileUpdate(req: any, profileId: string, updateFields: string[], success: boolean): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.PROFILE_UPDATE,
      'profile_update',
      `profile:${profileId}`,
      req,
      success,
      { profileId, updatedFields: updateFields }
    );
  }
  
  /**
   * Log private key storage event
   */
  async logPrivateKeyStorage(req: any, userId: string, walletAddress: string, success: boolean): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.PRIVATE_KEY_STORE,
      'private_key_store',
      `wallet:${walletAddress}`,
      req,
      success,
      { 
        userId, 
        walletAddressHash: this.hashSensitiveData(walletAddress)
      }
    );
  }
  
  /**
   * Log private key access event
   */
  async logPrivateKeyAccess(req: any, userId: string, walletAddress: string, success: boolean): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.PRIVATE_KEY_ACCESS,
      'private_key_access',
      `wallet:${walletAddress}`,
      req,
      success,
      { 
        userId, 
        walletAddressHash: this.hashSensitiveData(walletAddress)
      }
    );
  }
  
  /**
   * Log GDPR-related events
   */
  async logGdprEvent(req: any, userId: string, action: 'export' | 'delete', success: boolean): Promise<void> {
    const eventType = action === 'export' ? SecurityEventType.GDPR_EXPORT : SecurityEventType.GDPR_DELETE;
    await this.logSecurityEvent(
      eventType,
      `gdpr_${action}`,
      `user:${userId}`,
      req,
      success,
      { userId, gdprAction: action }
    );
  }
  
  /**
   * Log security violations
   */
  async logSecurityViolation(req: any, violationType: string, details: Record<string, any>): Promise<void> {
    await this.logSecurityEvent(
      SecurityEventType.SECURITY_VIOLATION,
      violationType,
      req.path || 'unknown',
      req,
      false,
      { violationType, ...details }
    );
  }
  
  /**
   * Get security metrics for monitoring
   */
  async getSecurityMetrics(timeRange: number = 24): Promise<Record<string, any>> {
    try {
      if (!this.db) {
        throw new Error('Audit logger not initialized');
      }
      
      const since = new Date(Date.now() - timeRange * 60 * 60 * 1000);
      
      const [
        totalEvents,
        failedEvents,
        riskLevelCounts,
        topEventTypes,
        suspiciousIps
      ] = await Promise.all([
        this.db.collection('profile_security_events').countDocuments({ timestamp: { $gte: since } }),
        this.db.collection('profile_security_events').countDocuments({ timestamp: { $gte: since }, success: false }),
        this.db.collection('profile_security_events').aggregate([
          { $match: { timestamp: { $gte: since } } },
          { $group: { _id: '$riskLevel', count: { $sum: 1 } } }
        ]).toArray(),
        this.db.collection('profile_security_events').aggregate([
          { $match: { timestamp: { $gte: since } } },
          { $group: { _id: '$eventType', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]).toArray(),
        this.db.collection('profile_security_events').aggregate([
          { $match: { timestamp: { $gte: since }, success: false } },
          { $group: { _id: '$clientIp', count: { $sum: 1 } } },
          { $match: { count: { $gte: 5 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]).toArray()
      ]);
      
      return {
        timeRange: `${timeRange} hours`,
        totalEvents,
        failedEvents,
        successRate: totalEvents > 0 ? ((totalEvents - failedEvents) / totalEvents * 100).toFixed(2) + '%' : '100%',
        riskLevelDistribution: riskLevelCounts.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
        topEventTypes,
        suspiciousIps,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get security metrics:', error);
      throw error;
    }
  }
  
  /**
   * Calculate risk level based on event type and context
   */
  private calculateRiskLevel(eventType: SecurityEventType, success: boolean, details?: Record<string, any>): 'low' | 'medium' | 'high' | 'critical' {
    // Failed operations are generally higher risk
    if (!success) {
      switch (eventType) {
        case SecurityEventType.PRIVATE_KEY_ACCESS:
        case SecurityEventType.PRIVATE_KEY_STORE:
          return 'critical';
        case SecurityEventType.SECURITY_VIOLATION:
        case SecurityEventType.UNAUTHORIZED_ACCESS:
          return 'high';
        case SecurityEventType.RATE_LIMIT_EXCEEDED:
        case SecurityEventType.VALIDATION_FAILURE:
          return 'medium';
        default:
          return 'medium';
      }
    }
    
    // Successful operations risk assessment
    switch (eventType) {
      case SecurityEventType.PRIVATE_KEY_ACCESS:
      case SecurityEventType.PRIVATE_KEY_STORE:
      case SecurityEventType.PRIVATE_KEY_DELETE:
        return 'high';
      case SecurityEventType.GDPR_DELETE:
        return 'medium';
      case SecurityEventType.PROFILE_DELETE:
        return 'medium';
      case SecurityEventType.PROFILE_UPDATE:
        return 'low';
      default:
        return 'low';
    }
  }
  
  /**
   * Extract client IP from request
   */
  private getClientIp(req: any): string {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           'unknown';
  }
  
  /**
   * Hash sensitive data for logging
   */
  private hashSensitiveData(data: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}
