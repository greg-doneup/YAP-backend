/**
 * Security configuration for Profile Service
 * Centralizes all security-related settings and constants
 */

export const SecurityConfig = {
  // Rate limiting configuration
  RATE_LIMITS: {
    PROFILE_OPERATIONS: {
      maxRequests: 30,
      windowMinutes: 5
    },
    WALLET_OPERATIONS: {
      maxRequests: 10,
      windowMinutes: 15
    },
    GDPR_OPERATIONS: {
      maxRequests: 5,
      windowMinutes: 60
    }
  },

  // Input validation limits
  INPUT_LIMITS: {
    MAX_INPUT_LENGTH: 1000,
    EMAIL_MAX_LENGTH: 255,
    NAME_MAX_LENGTH: 100,
    LANGUAGE_MAX_LENGTH: 50,
    REQUEST_SIZE_LIMIT: 1048576 // 1MB
  },

  // Security patterns for validation
  SECURITY_PATTERNS: {
    SQL_INJECTION: [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|OR|AND)\b)/gi,
      /(--|#|\*|\/\*|\*\/)/g,
      /'|\"|;|\||&/g
    ],
    ETHEREUM_ADDRESS: /^0x[a-fA-F0-9]{40}$/,
    ETHEREUM_PRIVATE_KEY: /^[0-9a-fA-F]{64}$/
  },

  // Audit log retention
  AUDIT_CONFIG: {
    RETENTION_DAYS: 90,
    HIGH_RISK_RETENTION_DAYS: 365,
    BATCH_SIZE: 100
  },

  // Risk level thresholds
  RISK_THRESHOLDS: {
    FAILED_ATTEMPTS_HIGH: 5,
    FAILED_ATTEMPTS_CRITICAL: 10,
    SUSPICIOUS_IP_THRESHOLD: 3
  },

  // Security headers
  SECURITY_HEADERS: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
  },

  // Encryption settings
  ENCRYPTION: {
    ALGORITHM: 'aes-256-gcm',
    IV_LENGTH: 16,
    AUTH_TAG_LENGTH: 16,
    KEY_DERIVATION_ITERATIONS: 100000
  },

  // Monitoring and alerting
  MONITORING: {
    METRICS_INTERVAL_MINUTES: 5,
    ALERT_THRESHOLDS: {
      ERROR_RATE_PERCENT: 5,
      RESPONSE_TIME_MS: 1000,
      FAILED_AUTH_RATE: 10
    }
  }
};

/**
 * Security event severity levels
 */
export enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Security validation rules
 */
export const SecurityRules = {
  /**
   * Validate if an operation requires elevated security
   */
  requiresElevatedSecurity: (operation: string): boolean => {
    const elevatedOperations = [
      'private_key_access',
      'private_key_store',
      'gdpr_delete',
      'admin_access'
    ];
    return elevatedOperations.includes(operation);
  },

  /**
   * Get rate limit for specific operation type
   */
  getRateLimit: (operationType: string) => {
    switch (operationType) {
      case 'wallet':
        return SecurityConfig.RATE_LIMITS.WALLET_OPERATIONS;
      case 'gdpr':
        return SecurityConfig.RATE_LIMITS.GDPR_OPERATIONS;
      default:
        return SecurityConfig.RATE_LIMITS.PROFILE_OPERATIONS;
    }
  },

  /**
   * Calculate risk score for an operation
   */
  calculateRiskScore: (context: {
    operationType: string;
    success: boolean;
    failedAttempts?: number;
    isElevated?: boolean;
  }): number => {
    let score = 0;
    
    // Base score for operation type
    if (context.operationType.includes('private_key')) score += 50;
    else if (context.operationType.includes('gdpr')) score += 30;
    else if (context.operationType.includes('admin')) score += 40;
    else score += 10;
    
    // Penalty for failures
    if (!context.success) score += 20;
    
    // Penalty for repeated failures
    if (context.failedAttempts && context.failedAttempts > 1) {
      score += context.failedAttempts * 10;
    }
    
    // Penalty for elevated operations
    if (context.isElevated) score += 15;
    
    return Math.min(score, 100); // Cap at 100
  }
};

/**
 * Security middleware configuration
 */
export const MiddlewareConfig = {
  // CORS settings
  CORS: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:8100',
      'http://localhost:3000',
      'http://localhost:4200'
    ],
    credentials: true,
    optionsSuccessStatus: 200
  },

  // Request validation
  REQUEST_VALIDATION: {
    maxRequestSize: SecurityConfig.INPUT_LIMITS.REQUEST_SIZE_LIMIT,
    validateContentType: true,
    validateUserAgent: true,
    requireSecureHeaders: true
  }
};
