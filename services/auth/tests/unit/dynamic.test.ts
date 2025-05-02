import nock from 'nock';
import { initEmail, verifyEmail, createEmbeddedWallet } from '../../src/utils/dynamic';

// Mock base URL for Dynamic API
const DYNAMIC_BASE = process.env.DYNAMIC_BASE || 'https://api.test-dynamic.xyz/api/v0';
const DYNAMIC_ENV_ID = process.env.DYNAMIC_ENV_ID || 'test-env-id';

describe('Dynamic Auth Utilities', () => {
  // Reset mocks after each test
  afterEach(() => {
    nock.cleanAll();
  });

  describe('initEmail', () => {
    it('should successfully initiate email authentication flow', async () => {
      // Mock the Dynamic API response
      nock(`${DYNAMIC_BASE}/sdk/${DYNAMIC_ENV_ID}`)
        .post('/users/email/init', { email: 'test@example.com' })
        .reply(200, {
          challengeId: 'test-challenge-123'
        });

      const result = await initEmail('test@example.com');
      
      expect(result).toEqual({ challengeId: 'test-challenge-123' });
    });

    it('should handle API errors during email initiation', async () => {
      // Mock API error response
      nock(`${DYNAMIC_BASE}/sdk/${DYNAMIC_ENV_ID}`)
        .post('/users/email/init')
        .reply(400, { 
          error: 'INVALID_EMAIL',
          message: 'Email format is invalid' 
        });

      await expect(initEmail('invalid-email')).rejects.toThrow();
    });
  });

  describe('verifyEmail', () => {
    it('should successfully verify OTP and return user data', async () => {
      const mockResponse = {
        jwt: 'mock-jwt-token',
        user: { id: 'user-123' }
      };

      nock(`${DYNAMIC_BASE}/sdk/${DYNAMIC_ENV_ID}`)
        .post('/users/email/verify', { 
          challengeId: 'test-challenge-123',
          otp: '123456'
        })
        .reply(200, mockResponse);

      const result = await verifyEmail('test-challenge-123', '123456');
      
      expect(result).toEqual(mockResponse);
    });

    it('should handle invalid OTP errors', async () => {
      nock(`${DYNAMIC_BASE}/sdk/${DYNAMIC_ENV_ID}`)
        .post('/users/email/verify')
        .reply(400, { 
          error: 'INVALID_OTP',
          message: 'The OTP is invalid or expired' 
        });

      await expect(verifyEmail('test-challenge-123', 'invalid')).rejects.toThrow();
    });
  });

  describe('createEmbeddedWallet', () => {
    it('should successfully create a new wallet', async () => {
      const userId = 'new-user-123';
      const mockResponse = {
        wallet: { 
          address: 'sei1q2w3e4r5t6y7u8i9o0p' 
        }
      };

      nock(`${DYNAMIC_BASE}/sdk/${DYNAMIC_ENV_ID}`)
        .post(`/users/${userId}/embeddedWallets`, { chain: 'sei' })
        .reply(200, mockResponse);

      const result = await createEmbeddedWallet(userId);
      
      expect(result).toEqual(mockResponse);
      expect(result.wallet.address).toBe('sei1q2w3e4r5t6y7u8i9o0p');
    });

    it('should fetch existing wallet if user already has one', async () => {
      const userId = 'existing-user-456';
      const mockResponse = {
        wallet: { 
          address: 'sei9o8i7u6y5t4r3e2w1q' 
        }
      };

      nock(`${DYNAMIC_BASE}/sdk/${DYNAMIC_ENV_ID}`)
        .post(`/users/${userId}/embeddedWallets`, { chain: 'sei' })
        .reply(200, mockResponse);

      const result = await createEmbeddedWallet(userId);
      
      expect(result).toEqual(mockResponse);
      expect(result.wallet.address).toBe('sei9o8i7u6y5t4r3e2w1q');
    });

    it('should handle wallet creation errors', async () => {
      const userId = 'error-user-789';
      
      nock(`${DYNAMIC_BASE}/sdk/${DYNAMIC_ENV_ID}`)
        .post(`/users/${userId}/embeddedWallets`)
        .reply(500, { 
          error: 'WALLET_CREATION_FAILED',
          message: 'Failed to create wallet' 
        });

      await expect(createEmbeddedWallet(userId)).rejects.toThrow();
    });
  });
});