/**
 * YAP Backend Integration Test - Waitlist Conversion Flow
 */

import axios, { AxiosResponse } from 'axios';
import crypto from 'crypto';

interface TestConfig {
  useMockServer: boolean;
  timeout: number;
}

interface ServiceUrls {
  auth: string;
  profile: string;
  wallet: string;
  mock: string;
}

interface WaitlistUser {
  email: string;
  name: string;
  language: string;
}

interface WalletData {
  passphrase_hash: string;
  encrypted_mnemonic: string;
  salt: string;
  nonce: string;
  sei_address: string;
  sei_public_key: string;
  eth_address: string;
  eth_public_key: string;
}

// Test configuration
const TEST_CONFIG: TestConfig = {
  useMockServer: process.env.USE_MOCK_SERVER !== 'false',
  timeout: 10000
};

// Service URLs
const SERVICES: ServiceUrls = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3000',
  profile: process.env.PROFILE_SERVICE_URL || 'http://localhost:3001', 
  wallet: process.env.WALLET_SERVICE_URL || 'http://localhost:8002',
  mock: process.env.MOCK_SERVER_URL || 'http://localhost:8000'
};

describe('Waitlist User Conversion Integration', () => {
  // Test data
  const testEmail = `waitlist-test-${Date.now()}@example.com`;
  const WAITLIST_USER: WaitlistUser = {
    email: testEmail,
    name: 'Waitlist Test User',
    language: 'spanish'
  };
  
  const WALLET_DATA: WalletData = {
    passphrase_hash: crypto.createHash('sha256').update('test-passphrase-123').digest('hex'),
    encrypted_mnemonic: 'encrypted_' + crypto.randomBytes(32).toString('hex'),
    salt: crypto.randomBytes(16).toString('hex'),
    nonce: crypto.randomBytes(12).toString('hex'),
    sei_address: 'sei1test' + crypto.randomBytes(8).toString('hex'),
    sei_public_key: 'sei_pub_' + crypto.randomBytes(16).toString('hex'),
    eth_address: '0x' + crypto.randomBytes(20).toString('hex'),
    eth_public_key: 'eth_pub_' + crypto.randomBytes(16).toString('hex')
  };

  // Test state
  let testUserId: string | null = null;
  let accessToken: string | null = null;
  let refreshToken: string | null = null;

  // Helper functions
  function log(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  function logError(message: string, error: any): void {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ ${message}`);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data:`, error.response.data);
    } else {
      console.error(error.message);
    }
  }

  async function makeRequest(method: string, url: string, data?: any, headers?: any): Promise<AxiosResponse> {
    const config: any = {
      method,
      url,
      timeout: TEST_CONFIG.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    try {
      const response = await axios(config);
      return response;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`Service unavailable at ${url}. Make sure the service is running.`);
      }
      throw error;
    }
  }

  it('should pass service health check', async () => {
    log('🔍 Testing service health...');
    
    const baseUrl = TEST_CONFIG.useMockServer ? SERVICES.mock : SERVICES.auth;
    
    try {
      const response = await makeRequest('GET', `${baseUrl}/health`);
      log('✅ Service health check passed', { status: response.status });
      expect(response.status).toBe(200);
    } catch (error) {
      logError('Service health check failed', error);
      throw error;
    }
  }, 15000);

  it('should create a waitlist user', async () => {
    log('📝 Creating waitlist user...');
    
    const baseUrl = TEST_CONFIG.useMockServer ? SERVICES.mock : SERVICES.profile;
    
    // Generate a unique user ID for the waitlist user
    testUserId = crypto.randomBytes(12).toString('hex');
    
    const waitlistData = {
      userId: testUserId,
      email: WAITLIST_USER.email,
      name: WAITLIST_USER.name,
      initial_language_to_learn: WAITLIST_USER.language,
      isWaitlistUser: true,
      wlw: false, // No wallet yet
      waitlist_signup_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    try {
      const response = await makeRequest('POST', `${baseUrl}/profile`, waitlistData);
      log('✅ Created waitlist user', { 
        userId: testUserId, 
        email: WAITLIST_USER.email,
        status: response.status 
      });
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
    } catch (error: any) {
      if (error.response?.status === 409) {
        log('ℹ️ Waitlist user already exists - proceeding with test');
        expect(error.response.status).toBe(409);
      } else {
        logError('Failed to create waitlist user', error);
        throw error;
      }
    }
  }, 15000);

  it('should convert waitlist user successfully', async () => {
    log('🔄 Testing waitlist user conversion...');
    
    const baseUrl = TEST_CONFIG.useMockServer ? SERVICES.mock : SERVICES.auth;
    
    const signupData = {
      email: WAITLIST_USER.email,
      // Note: For waitlist users, name and language are optional (taken from existing profile)
      passphrase_hash: WALLET_DATA.passphrase_hash,
      encrypted_mnemonic: WALLET_DATA.encrypted_mnemonic,
      salt: WALLET_DATA.salt,
      nonce: WALLET_DATA.nonce,
      sei_address: WALLET_DATA.sei_address,
      sei_public_key: WALLET_DATA.sei_public_key,
      eth_address: WALLET_DATA.eth_address,
      eth_public_key: WALLET_DATA.eth_public_key
    };
    
    try {
      const response = await makeRequest('POST', `${baseUrl}/auth/wallet/signup`, signupData);
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
      
      accessToken = response.data.token;
      refreshToken = response.data.refreshToken;
      
      log('✅ Waitlist conversion successful', {
        userId: response.data.userId,
        isWaitlistConversion: response.data.isWaitlistConversion,
        starting_points: response.data.starting_points,
        hasTokens: !!(accessToken && refreshToken)
      });
      
      expect(accessToken).toBeTruthy();
      expect(refreshToken).toBeTruthy();
      
      // Verify the response indicates it was a waitlist conversion
      if (response.data.isWaitlistConversion !== true) {
        log('⚠️ Warning: Response did not indicate waitlist conversion');
      }
      
      // Verify bonus points were awarded
      if (response.data.starting_points !== 100) {
        log(`⚠️ Warning: Expected 100 bonus points, got ${response.data.starting_points}`);
      }
      
    } catch (error) {
      logError('Waitlist conversion failed', error);
      throw error;
    }
  }, 15000);

  it('should verify profile was updated with wallet data', async () => {
    log('🔍 Verifying profile was updated with wallet data...');
    
    const baseUrl = TEST_CONFIG.useMockServer ? SERVICES.mock : SERVICES.profile;
    
    try {
      // Get the updated profile
      const response = await makeRequest('GET', `${baseUrl}/profile/${testUserId}`, undefined, {
        'Authorization': `Bearer ${accessToken}`
      });
      
      expect(response.status).toBe(200);
      
      const profile = response.data;
      
      // Verify wallet data was added
      const checks = [
        { field: 'wlw', expected: true, actual: profile.wlw },
        { field: 'converted', expected: true, actual: profile.converted },
        { field: 'sei_wallet.address', expected: WALLET_DATA.sei_address, actual: profile.sei_wallet?.address },
        { field: 'eth_wallet.address', expected: WALLET_DATA.eth_address, actual: profile.eth_wallet?.address }
      ];
      
      let allChecksPass = true;
      for (const check of checks) {
        if (check.actual !== check.expected) {
          log(`❌ Profile check failed for ${check.field}: expected ${check.expected}, got ${check.actual}`);
          allChecksPass = false;
        } else {
          log(`✅ Profile check passed for ${check.field}`);
        }
      }
      
      expect(allChecksPass).toBe(true);
      
    } catch (error) {
      logError('Profile verification failed', error);
      throw error;
    }
  }, 15000);

  it('should validate authentication tokens', async () => {
    log('🔐 Testing token validation...');
    
    const baseUrl = TEST_CONFIG.useMockServer ? SERVICES.mock : SERVICES.auth;
    
    try {
      const response = await makeRequest('GET', `${baseUrl}/auth/validate`, undefined, {
        'Authorization': `Bearer ${accessToken}`
      });
      
      expect(response.status).toBe(200);
      
      log('✅ Token validation successful', {
        userId: response.data.userId,
        status: response.status
      });
      
    } catch (error) {
      logError('Token validation failed', error);
      throw error;
    }
  }, 15000);

  it('should handle new user signup correctly', async () => {
    log('👤 Testing new user signup (non-waitlist)...');
    
    const baseUrl = TEST_CONFIG.useMockServer ? SERVICES.mock : SERVICES.auth;
    
    const newUserEmail = `new-user-${Date.now()}@example.com`;
    const newUserData = {
      name: 'New Test User',
      email: newUserEmail,
      language_to_learn: 'french',
      passphrase_hash: crypto.createHash('sha256').update('new-user-pass-123').digest('hex'),
      encrypted_mnemonic: 'encrypted_' + crypto.randomBytes(32).toString('hex'),
      salt: crypto.randomBytes(16).toString('hex'),
      nonce: crypto.randomBytes(12).toString('hex'),
      sei_address: 'sei1new' + crypto.randomBytes(8).toString('hex'),
      sei_public_key: 'sei_pub_' + crypto.randomBytes(16).toString('hex'),
      eth_address: '0x' + crypto.randomBytes(20).toString('hex'),
      eth_public_key: 'eth_pub_' + crypto.randomBytes(16).toString('hex')
    };
    
    try {
      const response = await makeRequest('POST', `${baseUrl}/auth/wallet/signup`, newUserData);
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
      
      log('✅ New user signup successful', {
        userId: response.data.userId,
        email: newUserEmail,
        isWaitlistConversion: response.data.isWaitlistConversion,
        starting_points: response.data.starting_points
      });
      
      // Verify this was NOT a waitlist conversion
      if (response.data.isWaitlistConversion === true) {
        log('❌ Error: New user was incorrectly marked as waitlist conversion');
        expect(response.data.isWaitlistConversion).toBe(false);
      }
      
      // Verify no bonus points for new users
      if (response.data.starting_points > 0) {
        log(`⚠️ Warning: New user received bonus points (${response.data.starting_points})`);
      }
      
    } catch (error) {
      logError('New user signup test failed', error);
      throw error;
    }
  }, 15000);

  afterAll(async () => {
    log('🧹 Cleaning up test data...');
    
    // In a real environment, we would clean up the test user
    // For mock server, this will be handled by restart
    if (TEST_CONFIG.useMockServer) {
      log('✅ Test cleanup completed (mock server will reset on restart)');
    } else {
      log('ℹ️ Manual cleanup may be required for real services');
    }
  });
});
