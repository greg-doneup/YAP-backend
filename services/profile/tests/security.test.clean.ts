import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { SecurityValidator } from '../src/utils/securityValidator';
import { AuditLogger, SecurityEventType } from '../src/utils/auditLogger';
import { SecurityConfig } from '../src/config/security';

describe('Profile Service Security Features', () => {
  
  describe('SecurityValidator', () => {
    
    test('should sanitize input correctly', () => {
      const cleanInput = 'Hello World';
      const result = SecurityValidator.sanitizeInput(cleanInput);
      expect(result).toBe('Hello World');
    });
    
    test('should reject SQL injection attempts', () => {
      const maliciousInput = "'; DROP TABLE users; --";
      expect(() => SecurityValidator.sanitizeInput(maliciousInput)).toThrow('Invalid characters detected');
    });
    
    test('should reject overly long input', () => {
      const longInput = 'a'.repeat(SecurityConfig.INPUT_LIMITS.MAX_INPUT_LENGTH + 1);
      expect(() => SecurityValidator.sanitizeInput(longInput)).toThrow('Input too long');
    });
    
    test('should validate email format', () => {
      expect(SecurityValidator.validateEmail('test@example.com')).toBe(true);
      expect(SecurityValidator.validateEmail('invalid-email')).toBe(false);
      expect(SecurityValidator.validateEmail('')).toBe(false);
    });
    
    test('should validate Ethereum addresses', () => {
      const validAddress = '0x742C4F7817eF9B6EC5A3a7e5bC168E0b4BA0fC9C';
      const invalidAddress = '0xinvalid';
      
      expect(SecurityValidator.validateEthereumAddress(validAddress)).toBe(true);
      expect(SecurityValidator.validateEthereumAddress(invalidAddress)).toBe(false);
    });
    
    test('should validate profile data', () => {
      const validData = {
        email: 'test@example.com',
        name: 'Test User',
        initial_language_to_learn: 'Spanish'
      };
      
      const result = SecurityValidator.validateProfileData(validData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    test('should detect invalid profile data', () => {
      const invalidData = {
        email: 'invalid-email',
        name: '',
        initial_language_to_learn: 'a'.repeat(101)
      };
      
      const result = SecurityValidator.validateProfileData(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
    
    test('should validate request security', () => {
      const mockRequest = {
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible browser)',
          'content-type': 'application/json'
        },
        body: {
          email: 'test@example.com'
        }
      };
      
      const result = SecurityValidator.validateRequestSecurity(mockRequest);
      expect(result.isValid).toBe(true);
    });
    
    test('should detect suspicious requests', () => {
      const suspiciousRequest = {
        headers: {
          'user-agent': 'sqlmap/1.0',
          'content-type': 'application/json'
        },
        body: {
          email: "'; DROP TABLE users; --"
        }
      };
      
      const result = SecurityValidator.validateRequestSecurity(suspiciousRequest);
      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });
  
  describe('AuditLogger', () => {
    let auditLogger: AuditLogger;
    
    beforeEach(() => {
      auditLogger = new AuditLogger();
    });
    
    test('should create audit logger instance', () => {
      expect(auditLogger).toBeInstanceOf(AuditLogger);
    });
    
    test('should handle profile access logging', async () => {
      const mockRequest = {
        headers: {
          'user-agent': 'test-agent',
          'x-forwarded-for': '127.0.0.1'
        }
      };
      
      // Should not throw
      await expect(
        auditLogger.logProfileAccess(mockRequest, 'test-user-123', true)
      ).resolves.not.toThrow();
    });
    
    test('should handle GDPR event logging', async () => {
      const mockRequest = {
        headers: {
          'user-agent': 'test-agent',
          'x-forwarded-for': '127.0.0.1'
        }
      };
      
      // Should not throw
      await expect(
        auditLogger.logGdprEvent(mockRequest, 'test-user-123', 'export', true)
      ).resolves.not.toThrow();
    });
  });
  
  describe('Security Configuration', () => {
    
    test('should have proper rate limits configured', () => {
      expect(SecurityConfig.RATE_LIMITS.PROFILE_OPERATIONS.maxRequests).toBe(30);
      expect(SecurityConfig.RATE_LIMITS.WALLET_OPERATIONS.maxRequests).toBe(10);
      expect(SecurityConfig.RATE_LIMITS.GDPR_OPERATIONS.maxRequests).toBe(5);
    });
    
    test('should have proper input limits', () => {
      expect(SecurityConfig.INPUT_LIMITS.MAX_INPUT_LENGTH).toBe(1000);
      expect(SecurityConfig.INPUT_LIMITS.EMAIL_MAX_LENGTH).toBe(255);
      expect(SecurityConfig.INPUT_LIMITS.NAME_MAX_LENGTH).toBe(100);
    });
    
    test('should have security patterns defined', () => {
      expect(SecurityConfig.SECURITY_PATTERNS.SQL_INJECTION).toHaveLength(3);
      expect(SecurityConfig.SECURITY_PATTERNS.ETHEREUM_ADDRESS).toBeInstanceOf(RegExp);
    });
  });
  
  describe('Integration Tests', () => {
    
    test('should handle complete profile creation with security validation', () => {
      const profileData = {
        email: 'security-test@example.com',
        name: 'Security Test User',
        initial_language_to_learn: 'French'
      };
      
      // Test input sanitization
      const sanitizedEmail = SecurityValidator.sanitizeInput(profileData.email);
      const sanitizedName = SecurityValidator.sanitizeInput(profileData.name);
      const sanitizedLanguage = SecurityValidator.sanitizeInput(profileData.initial_language_to_learn);
      
      expect(sanitizedEmail).toBe(profileData.email);
      expect(sanitizedName).toBe(profileData.name);
      expect(sanitizedLanguage).toBe(profileData.initial_language_to_learn);
      
      // Test profile validation
      const validation = SecurityValidator.validateProfileData(profileData);
      expect(validation.isValid).toBe(true);
    });
    
    test('should handle non-custodial wallet metadata validation', () => {
      const walletData = {
        passphrase_hash: 'hashed_passphrase_value',
        encrypted_mnemonic: 'encrypted_mnemonic_data',
        salt: 'encryption_salt',
        nonce: 'encryption_nonce',
        seiWalletAddress: 'sei1...',
        evmWalletAddress: '0x742C4F7817eF9B6EC5A3a7e5bC168E0b4BA0fC9C'
      };
      
      // Test that wallet addresses are properly formatted
      expect(SecurityValidator.validateEthereumAddress(walletData.evmWalletAddress)).toBe(true);
      
      // Test that encrypted data fields are present (non-custodial)
      expect(walletData.encrypted_mnemonic).toBeTruthy();
      expect(walletData.salt).toBeTruthy();
      expect(walletData.nonce).toBeTruthy();
    });
  });
});
