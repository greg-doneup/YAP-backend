// Security Event Types
export enum SecurityEventType {
  // Authentication events
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  WALLET_AUTH_SUCCESS = 'wallet_auth_success',
  WALLET_AUTH_FAILURE = 'wallet_auth_failure',
  
  // Token events
  TOKEN_REFRESH = 'token_refresh',
  TOKEN_REVOKE = 'token_revoke',
  
  // Request validation
  INVALID_REQUEST = 'invalid_request',
  
  // Security events
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  
  // Profile access
  PROFILE_ACCESS = 'profile_access'
}

// Security Event Interface
export interface SecurityEvent {
  eventType: SecurityEventType | string;
  email?: string;
  userId?: string;
  clientIp: string;
  userAgent?: string;
  success: boolean;
  details: any;
  [key: string]: any; // Allow additional properties for flexibility
}

// Audit Event Interface (for backward compatibility)
export interface AuditEvent {
  eventType: string;
  clientIp: string;
  details: any;
  timestamp?: Date;
}

/**
 * Comprehensive audit logging class for the auth service
 * Provides security event logging with MongoDB integration and console fallback
 */
export class AuditLogger {
  
  /**
   * Log a security event - supports both new format (SecurityEvent object) and old format (individual parameters)
   * @param eventOrType - SecurityEvent object or event type string
   * @param clientIp - Client IP address (when using old format)
   * @param details - Event details (when using old format)
   */
  async logSecurityEvent(eventOrType: SecurityEvent | string, clientIp?: string, details?: any): Promise<void> {
    let event: SecurityEvent;
    
    // Handle both new format (SecurityEvent object) and old format (individual parameters)
    if (typeof eventOrType === 'object' && eventOrType.eventType) {
      event = eventOrType;
    } else {
      // Convert old format to SecurityEvent
      event = {
        eventType: eventOrType as string,
        clientIp: clientIp || 'unknown',
        userAgent: 'unknown',
        success: true,
        details: details || {}
      };
    }
    
    // Create standardized log entry
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'auth-service',
      eventType: event.eventType,
      userId: event.userId,
      email: event.email ? this.hashSensitiveData(event.email) : undefined,
      clientIp: event.clientIp,
      userAgent: event.userAgent,
      success: event.success,
      details: event.details
    };
    
    // Log to console for immediate visibility
    const logLevel = event.success ? 'info' : 'warn';
    console[logLevel](`[SECURITY AUDIT] ${event.eventType}:`, JSON.stringify(logEntry, null, 2));
    
    // Log to MongoDB (with error handling)
    try {
      await this.logToMongoDB(logEntry);
    } catch (error) {
      console.error('Failed to log security event to MongoDB:', error);
      // Continue execution - logging failures shouldn't break the auth flow
    }
  }
  
  /**
   * Log failed authentication attempts
   * @param clientIp - Client IP address
   * @param email - User email (will be hashed for privacy)
   * @param reason - Failure reason
   */
  async logFailedAttempt(clientIp: string, email: string, reason: string): Promise<void> {
    await this.logSecurityEvent({
      eventType: SecurityEventType.LOGIN_FAILURE,
      email,
      clientIp,
      userAgent: 'unknown',
      success: false,
      details: { 
        reason,
        action: 'authentication_attempt',
        timestamp: new Date().toISOString()
      }
    });
  }
  
  /**
   * Log authentication events (success/failure)
   * @param clientIp - Client IP address
   * @param details - Authentication details including email, success status, endpoint
   */
  async logAuth(clientIp: string, details: { email?: string; success: boolean; endpoint: string; [key: string]: any }): Promise<void> {
    const eventType = details.success ? SecurityEventType.LOGIN_SUCCESS : SecurityEventType.LOGIN_FAILURE;
    
    await this.logSecurityEvent({
      eventType,
      email: details.email,
      clientIp,
      userAgent: 'unknown',
      success: details.success,
      details: {
        timestamp: new Date().toISOString(),
        ...details
      }
    });
  }
  
  /**
   * Log rate limiting events
   * @param clientIp - Client IP address
   * @param details - Rate limit details
   */
  async logRateLimit(clientIp: string, details: { endpoint: string; count: number; limit: number; [key: string]: any }): Promise<void> {
    await this.logSecurityEvent({
      eventType: 'rate_limit_exceeded',
      clientIp,
      userAgent: 'unknown',
      success: false,
      details: {
        ...details,
        timestamp: new Date().toISOString()
      }
    });
  }
  
  /**
   * Log input validation failures
   * @param clientIp - Client IP address
   * @param details - Validation failure details
   */
  async logValidationFailure(clientIp: string, details: { endpoint: string; error: string; input?: string; [key: string]: any }): Promise<void> {
    await this.logSecurityEvent({
      eventType: SecurityEventType.INVALID_REQUEST,
      clientIp,
      userAgent: 'unknown',
      success: false,
      details: {
        ...details,
        timestamp: new Date().toISOString(),
        // Hash sensitive input data
        input: details.input ? this.hashSensitiveData(details.input) : undefined
      }
    });
  }
  
  /**
   * Log suspicious activities
   * @param clientIp - Client IP address
   * @param details - Suspicious activity details
   */
  async logSuspiciousActivity(clientIp: string, details: { type: string; description: string; data?: any; [key: string]: any }): Promise<void> {
    await this.logSecurityEvent({
      eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
      clientIp,
      userAgent: 'unknown',
      success: false,
      details: {
        ...details,
        timestamp: new Date().toISOString(),
        severity: 'high'
      }
    });
  }
  
  /**
   * Log IP blocking events
   * @param clientIp - Client IP address
   * @param details - IP blocking details
   */
  async logIpBlock(clientIp: string, details: { reason: string; attempts: number; [key: string]: any }): Promise<void> {
    await this.logSecurityEvent({
      eventType: 'ip_blocked',
      clientIp,
      userAgent: 'unknown',
      success: false,
      details: {
        ...details,
        timestamp: new Date().toISOString(),
        action: 'ip_block'
      }
    });
  }
  
  /**
   * Log token-related events (refresh, revoke, etc.)
   * @param eventType - Type of token event
   * @param userId - User ID
   * @param clientIp - Client IP address
   * @param details - Additional details
   */
  async logTokenEvent(eventType: SecurityEventType, userId: string, clientIp: string, details: any = {}): Promise<void> {
    await this.logSecurityEvent({
      eventType,
      userId,
      clientIp,
      userAgent: 'unknown',
      success: details.success !== false, // Default to true unless explicitly false
      details: {
        ...details,
        timestamp: new Date().toISOString()
      }
    });
  }
  
  /**
   * Log profile access events
   * @param clientIp - Client IP address
   * @param userId - User ID accessing profile
   * @param success - Whether access was successful
   * @param details - Additional details
   */
  async logProfileAccess(clientIp: string, userId: string, success: boolean = true, details: any = {}): Promise<void> {
    await this.logSecurityEvent({
      eventType: SecurityEventType.PROFILE_ACCESS,
      userId,
      clientIp,
      userAgent: 'unknown',
      success,
      details: {
        action: 'profile_access',
        ...details,
        timestamp: new Date().toISOString()
      }
    });
  }
  
  /**
   * Private method to log to MongoDB using dynamic import to avoid circular dependencies
   * @param logEntry - The log entry to store
   */
  private async logToMongoDB(logEntry: any): Promise<void> {
    try {
      // Dynamic import to avoid circular dependencies with mongodb.ts
      const { logSecurityEvent } = await import('./mongodb');
      await logSecurityEvent(logEntry.eventType, logEntry.clientIp, logEntry);
    } catch (error) {
      console.error('MongoDB logging error:', error);
      // Don't rethrow - logging failures shouldn't break authentication
    }
  }
  
  /**
   * Hash sensitive data for privacy-preserving logging
   * @param data - Sensitive data to hash
   * @returns Hashed data
   */
  private hashSensitiveData(data: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 8) + '...';
  }
  
  /**
   * Generate a unique request ID for correlation
   * @returns Unique request ID
   */
  private generateRequestId(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(8).toString('hex');
  }
  
  /**
   * Validate and sanitize log data to prevent injection attacks
   * @param data - Data to sanitize
   * @returns Sanitized data
   */
  private sanitizeLogData(data: any): any {
    if (typeof data === 'string') {
      // Remove potential script tags and other dangerous content
      return data.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[SCRIPT_REMOVED]')
                .replace(/javascript:/gi, '[JAVASCRIPT_REMOVED]')
                .substring(0, 1000); // Limit string length
    }
    
    if (typeof data === 'object' && data !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          sanitized[key] = this.sanitizeLogData(value);
        } else if (typeof value === 'object') {
          sanitized[key] = this.sanitizeLogData(value);
        }
      }
      return sanitized;
    }
    
    return data;
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();

// Default export for compatibility
export default auditLogger;