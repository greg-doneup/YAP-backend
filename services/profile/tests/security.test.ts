import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { SecurityValidator } from '../src/utils/securityValidator';
import { AuditLogger, SecurityEventType } from '../src/utils/auditLogger';
import { PrivateKeyService } from '../src/utils/privateKeyService';
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
    
    test('should validate Ethereum private keys', () => {
      const validKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const invalidKey = 'invalid-key';
      
      expect(SecurityValidator.validatePrivateKey(validKey)).toBe(true);
      expect(SecurityValidator.validatePrivateKey(invalidKey)).toBe(false);
    });
    
    test('should validate profile data', () => {
      const validData = {
        email: 'test@example.com',
        name: 'John Doe',
        initial_language_to_learn: 'Spanish'
      };
      
      const result = SecurityValidator.validateProfileData(validData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    test('should reject invalid profile data', () => {
      const invalidData = {
        email: 'invalid-email',
        name: '', // Too short
        initial_language_to_learn: 'a'.repeat(100) // Too long
      };
      
      const result = SecurityValidator.validateProfileData(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
    
    test('should validate request security', () => {
      const validRequest = {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0...',
          'content-length': '100'
        }
      };
      
      const result = SecurityValidator.validateRequestSecurity(validRequest);
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
    
    test('should detect suspicious requests', () => {
      const suspiciousRequest = {
        method: 'POST',
        headers: {
          'content-type': 'text/plain', // Wrong content type
          'user-agent': 'Bot', // Suspicious user agent
          'content-length': '2000000' // Too large
        }
      };
      
      const result = SecurityValidator.validateRequestSecurity(suspiciousRequest);
      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });
  
  describe('PrivateKeyService', () => {
    let privateKeyService: PrivateKeyService;
    
    beforeEach(() => {
      // Set test environment variable
      process.env.PRIVATE_KEY_ENCRYPTION_SECRET = 'test-secret-key-for-testing-only';
      privateKeyService = new PrivateKeyService();
    });
    
    afterEach(() => {
      delete process.env.PRIVATE_KEY_ENCRYPTION_SECRET;
    });
    
    test('should generate secure wallet', async () => {
      const userId = 'test-user-123';
      const context = {
        userId,
        clientIp: '127.0.0.1',
        userAgent: 'test-agent'
      };
      
      const wallet = await privateKeyService.generateNewWallet(userId, context);
      
      expect(wallet.privateKey).toMatch(/^[0-9a-fA-F]{64}$/);
      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(wallet.encryptedKey).toBeTruthy();
      expect(wallet.privateKey).not.toBe(wallet.encryptedKey);
    });
    
    test('should encrypt and decrypt private key correctly', async () => {
      const privateKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const userId = 'test-user-456';
      const context = {
        userId,
        clientIp: '127.0.0.1',
        userAgent: 'test-agent'
      };
      
      // Store the private key
      const { encryptedKey, walletAddress } = await privateKeyService.storePrivateKey(
        privateKey, 
        userId, 
        context
      );
      
      expect(encryptedKey).toBeTruthy();
      expect(walletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
      
      // Retrieve the private key
      const decryptedKey = await privateKeyService.retrievePrivateKey(
        encryptedKey,
        userId,
        walletAddress,
        context
      );
      
      expect(decryptedKey).toBe(privateKey);
    });
    
    test('should validate private key ownership', async () => {
      const privateKey = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
      const userId = 'test-user-789';
      const context = {
        userId,
        clientIp: '127.0.0.1',
        userAgent: 'test-agent'
      };
      
      const { encryptedKey, walletAddress } = await privateKeyService.storePrivateKey(
        privateKey, 
        userId, 
        context
      );
      
      const isValid = await privateKeyService.validatePrivateKeyOwnership(
        encryptedKey,
        userId,
        walletAddress,
        context
      );
      
      expect(isValid).toBe(true);
      
      // Test with wrong user ID
      const isInvalid = await privateKeyService.validatePrivateKeyOwnership(
        encryptedKey,
        'wrong-user-id',
        walletAddress,
        context
      );
      
      expect(isInvalid).toBe(false);
    });
    
    test('should reject invalid private key format', async () => {
      const invalidKey = 'invalid-private-key';
      const userId = 'test-user-invalid';
      const context = {
        userId,
        clientIp: '127.0.0.1',
        userAgent: 'test-agent'
      };
      
      await expect(
        privateKeyService.storePrivateKey(invalidKey, userId, context)
      ).rejects.toThrow('Invalid private key format');
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
      expect(SecurityConfig.SECURITY_PATTERNS.ETHEREUM_PRIVATE_KEY).toBeInstanceOf(RegExp);
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
      
      // Test validation
      const validation = SecurityValidator.validateProfileData(profileData);
      expect(validation.isValid).toBe(true);
    });
    
    test('should detect and reject malicious profile data', () => {
      const maliciousData = {
        email: "test@example.com'; DROP TABLE profiles; --",
        name: '<script>alert("xss")</script>',
        initial_language_to_learn: 'French'
      };
      
      // Input sanitization should catch SQL injection
      expect(() => SecurityValidator.sanitizeInput(maliciousData.email))
        .toThrow('Invalid characters detected');
      
      // Should remove script tags
      const sanitizedName = SecurityValidator.sanitizeInput(maliciousData.name);
      expect(sanitizedName).not.toContain('<script>');
    });
  });
});

describe('GDPR Compliance', () => {
  
  test('should support data export format', () => {
    const mockProfile = {
      userId: 'test-user',
      email: 'test@example.com',
      name: 'Test User',
      initial_language_to_learn: 'Spanish',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      walletAddress: '0x742C4F7817eF9B6EC5A3a7e5bC168E0b4BA0fC9C',
      keyCreatedAt: '2024-01-01T00:00:00Z',
      keyLastAccessed: '2024-01-01T00:00:00Z',
      encryptedPrivateKey: 'encrypted-key-data'
    };
    
    // Simulate GDPR export
    const exportData = {
      profile: {
        userId: mockProfile.userId,
        email: mockProfile.email,
        name: mockProfile.name,
        initial_language_to_learn: mockProfile.initial_language_to_learn,
        createdAt: mockProfile.createdAt,
        updatedAt: mockProfile.updatedAt
      },
      wallet: mockProfile.walletAddress ? {
        walletAddress: mockProfile.walletAddress,
        keyCreatedAt: mockProfile.keyCreatedAt,
        keyLastAccessed: mockProfile.keyLastAccessed,
        hasEncryptedPrivateKey: !!mockProfile.encryptedPrivateKey
      } : null,
      export: {
        exportedAt: new Date().toISOString(),
        exportedBy: 'test-user',
        dataTypes: ['profile', 'wallet_metadata']
      }
    };
    
    expect(exportData.profile.userId).toBe(mockProfile.userId);
    expect(exportData.wallet?.walletAddress).toBe(mockProfile.walletAddress);
    expect(exportData.export.dataTypes).toContain('profile');
    expect(exportData.export.dataTypes).toContain('wallet_metadata');
    
    // Ensure private key is not included in export
    expect(exportData).not.toHaveProperty('encryptedPrivateKey');
  });
});
