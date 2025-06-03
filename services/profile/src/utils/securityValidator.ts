import crypto from 'crypto';
const validator = require('validator');
const { JSDOM } = require('jsdom');

// Create DOMPurify instance for server-side use
const window = new JSDOM('').window;
const DOMPurify = require('dompurify')(window);

/**
 * Security validation utilities for Profile Service
 * Provides input sanitization, validation, and security checks
 */
export class SecurityValidator {
  private static readonly MAX_INPUT_LENGTH = 1000;
  private static readonly SQL_INJECTION_PATTERNS = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|OR|AND)\b)/gi,
    /(--|#|\*|\/\*|\*\/)/g,
    /'|\"|;|\||&/g
  ];
  
  /**
   * Sanitize and validate user input
   */
  static sanitizeInput(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }
    
    // Limit input length to prevent DoS
    if (input.length > this.MAX_INPUT_LENGTH) {
      throw new Error('Input too long');
    }
    
    // Remove any HTML/script tags
    const sanitized = DOMPurify.sanitize(input, { 
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: []
    });
    
    // Check for SQL injection patterns
    for (const pattern of this.SQL_INJECTION_PATTERNS) {
      if (pattern.test(sanitized)) {
        throw new Error('Invalid characters detected');
      }
    }
    
    return sanitized.trim();
  }
  
  /**
   * Validate email format with enhanced security
   */
  static validateEmail(email: string): boolean {
    if (!email || typeof email !== 'string') {
      return false;
    }
    
    const sanitizedEmail = this.sanitizeInput(email);
    return validator.isEmail(sanitizedEmail) && sanitizedEmail.length <= 255;
  }
  
  /**
   * Validate profile data for creation/update
   */
  static validateProfileData(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (data.email && !this.validateEmail(data.email)) {
      errors.push('Invalid email format');
    }
    
    if (data.name) {
      try {
        const sanitizedName = this.sanitizeInput(data.name);
        if (sanitizedName.length < 1 || sanitizedName.length > 100) {
          errors.push('Name must be between 1 and 100 characters');
        }
      } catch (err) {
        errors.push('Invalid name format');
      }
    }
    
    if (data.initial_language_to_learn) {
      try {
        const sanitizedLang = this.sanitizeInput(data.initial_language_to_learn);
        if (sanitizedLang.length < 2 || sanitizedLang.length > 50) {
          errors.push('Language must be between 2 and 50 characters');
        }
      } catch (err) {
        errors.push('Invalid language format');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Validate Ethereum private key format
   */
  static validatePrivateKey(privateKey: string): boolean {
    if (!privateKey || typeof privateKey !== 'string') {
      return false;
    }
    
    // Check if it's a valid hex string of correct length (64 chars for 32 bytes)
    const hexRegex = /^[0-9a-fA-F]{64}$/;
    return hexRegex.test(privateKey.replace('0x', ''));
  }
  
  /**
   * Validate Ethereum address format
   */
  static validateEthereumAddress(address: string): boolean {
    if (!address || typeof address !== 'string') {
      return false;
    }
    
    // Check if it's a valid Ethereum address format
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    return ethAddressRegex.test(address);
  }
  
  /**
   * Generate secure random token
   */
  static generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
  
  /**
   * Hash sensitive data for audit logs
   */
  static hashSensitiveData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  
  /**
   * Validate request origin and headers for security
   */
  static validateRequestSecurity(req: any): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check content type for POST/PATCH requests
    if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
      const contentType = req.headers['content-type'];
      if (!contentType || !contentType.includes('application/json')) {
        issues.push('Invalid content type');
      }
    }
    
    // Check for suspicious user agents
    const userAgent = req.headers['user-agent'];
    if (!userAgent || userAgent.length < 5) {
      issues.push('Suspicious user agent');
    }
    
    // Check request size
    const contentLength = req.headers['content-length'];
    if (contentLength && parseInt(contentLength) > 1048576) { // 1MB limit
      issues.push('Request too large');
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }
}
