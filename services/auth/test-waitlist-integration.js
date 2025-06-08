#!/usr/bin/env node

/**
 * Simple test script to verify waitlist conversion functionality
 * This tests the integration against the mock server
 */

const axios = require('axios');
const crypto = require('crypto');

const MOCK_SERVER_URL = process.env.MOCK_SERVER_URL || 'http://localhost:8000';

// Test data
const testEmail = `waitlist-test-${Date.now()}@example.com`;
const WAITLIST_USER = {
  email: testEmail,
  name: 'Waitlist Test User',
  language: 'spanish'
};

const WALLET_DATA = {
  passphrase_hash: crypto.createHash('sha256').update('test-passphrase-123').digest('hex'),
  encrypted_mnemonic: 'encrypted_' + crypto.randomBytes(32).toString('hex'),
  salt: crypto.randomBytes(16).toString('hex'),
  nonce: crypto.randomBytes(12).toString('hex'),
  sei_address: 'sei1test' + crypto.randomBytes(8).toString('hex'),
  sei_public_key: 'sei_pub_' + crypto.randomBytes(16).toString('hex'),
  eth_address: '0x' + crypto.randomBytes(20).toString('hex'),
  eth_public_key: 'eth_pub_' + crypto.randomBytes(16).toString('hex')
};

let testUserId = null;
let accessToken = null;
let refreshToken = null;

function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function logError(message, error) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ❌ ${message}`);
  if (error.response) {
    console.error(`Status: ${error.response.status}`);
    console.error(`Data:`, error.response.data);
  } else {
    console.error(error.message);
  }
}

async function makeRequest(method, url, data = null, headers = {}) {
  const config = {
    method,
    url,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };
  
  if (data) {
    config.data = data;
  }
  
  return await axios(config);
}

async function testServiceHealth() {
  log('🔍 Testing service health...');
  
  try {
    const response = await makeRequest('GET', `${MOCK_SERVER_URL}/health`);
    log('✅ Service health check passed', { status: response.status });
    return true;
  } catch (error) {
    logError('Service health check failed', error);
    return false;
  }
}

async function createWaitlistUser() {
  log('📝 Creating waitlist user...');
  
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
    const response = await makeRequest('POST', `${MOCK_SERVER_URL}/profile`, waitlistData);
    log('✅ Created waitlist user', { 
      userId: testUserId, 
      email: WAITLIST_USER.email,
      status: response.status 
    });
    return true;
  } catch (error) {
    if (error.response?.status === 409) {
      log('ℹ️ Waitlist user already exists - proceeding with test');
      return true;
    }
    logError('Failed to create waitlist user', error);
    return false;
  }
}

async function testWaitlistConversion() {
  log('🔄 Testing waitlist user conversion...');
  
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
    const response = await makeRequest('POST', `${MOCK_SERVER_URL}/auth/wallet/signup`, signupData);
    
    if (response.status === 200 || response.status === 201) {
      accessToken = response.data.token;
      refreshToken = response.data.refreshToken;
      
      log('✅ Waitlist conversion successful', {
        userId: response.data.userId,
        isWaitlistConversion: response.data.isWaitlistConversion,
        starting_points: response.data.starting_points,
        hasTokens: !!(accessToken && refreshToken)
      });
      
      // Verify the response indicates it was a waitlist conversion
      if (response.data.isWaitlistConversion !== true) {
        log('⚠️ Warning: Response did not indicate waitlist conversion');
      }
      
      // Verify bonus points were awarded
      if (response.data.starting_points !== 100) {
        log(`⚠️ Warning: Expected 100 bonus points, got ${response.data.starting_points}`);
      }
      
      return true;
    } else {
      logError('Unexpected response status', { status: response.status, data: response.data });
      return false;
    }
  } catch (error) {
    logError('Waitlist conversion failed', error);
    return false;
  }
}

async function verifyProfileUpdate() {
  log('🔍 Verifying profile was updated with wallet data...');
  
  try {
    // Get the updated profile
    const response = await makeRequest('GET', `${MOCK_SERVER_URL}/profile/${testUserId}`, null, {
      'Authorization': `Bearer ${accessToken}`
    });
    
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
    
    if (allChecksPass) {
      log('✅ All profile verification checks passed');
      return true;
    } else {
      log('❌ Some profile verification checks failed');
      return false;
    }
    
  } catch (error) {
    logError('Profile verification failed', error);
    return false;
  }
}

async function testTokenValidation() {
  log('🔐 Testing token validation...');
  
  try {
    const response = await makeRequest('GET', `${MOCK_SERVER_URL}/auth/validate`, null, {
      'Authorization': `Bearer ${accessToken}`
    });
    
    if (response.status === 200) {
      log('✅ Token validation successful', {
        userId: response.data.userId,
        status: response.status
      });
      return true;
    } else {
      logError('Token validation failed', { status: response.status, data: response.data });
      return false;
    }
  } catch (error) {
    logError('Token validation failed', error);
    return false;
  }
}

async function testNewUserSignup() {
  log('👤 Testing new user signup (non-waitlist)...');
  
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
    const response = await makeRequest('POST', `${MOCK_SERVER_URL}/auth/wallet/signup`, newUserData);
    
    if (response.status === 200 || response.status === 201) {
      log('✅ New user signup successful', {
        userId: response.data.userId,
        email: newUserEmail,
        isWaitlistConversion: response.data.isWaitlistConversion,
        starting_points: response.data.starting_points
      });
      
      // Verify this was NOT a waitlist conversion
      if (response.data.isWaitlistConversion === true) {
        log('❌ Error: New user was incorrectly marked as waitlist conversion');
        return false;
      }
      
      // Verify no bonus points for new users
      if (response.data.starting_points > 0) {
        log(`⚠️ Warning: New user received bonus points (${response.data.starting_points})`);
      }
      
      return true;
    } else {
      logError('New user signup failed', { status: response.status, data: response.data });
      return false;
    }
  } catch (error) {
    logError('New user signup test failed', error);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting YAP Backend Integration Tests - Waitlist Conversion Flow');
  console.log('📍 Using Mock Server at', MOCK_SERVER_URL);
  console.log('=' + '='.repeat(80));
  
  const tests = [
    { name: 'Service Health Check', fn: testServiceHealth },
    { name: 'Create Waitlist User', fn: createWaitlistUser },
    { name: 'Waitlist User Conversion', fn: testWaitlistConversion },
    { name: 'Profile Update Verification', fn: verifyProfileUpdate },
    { name: 'Token Validation', fn: testTokenValidation },
    { name: 'New User Signup', fn: testNewUserSignup }
  ];
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`\n📋 Test ${i + 1}/${tests.length}: ${test.name}`);
    console.log('-'.repeat(50));
    
    try {
      const result = await test.fn();
      if (result) {
        passedTests++;
        log(`✅ PASSED: ${test.name}`);
      } else {
        failedTests++;
        log(`❌ FAILED: ${test.name}`);
      }
    } catch (error) {
      failedTests++;
      logError(`💥 ERROR in ${test.name}`, error);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('=' + '='.repeat(80));
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📊 Total: ${tests.length}`);
  console.log(`🎯 Success Rate: ${Math.round((passedTests / tests.length) * 100)}%`);
  
  if (failedTests === 0) {
    console.log('\n🎉 All tests passed! The waitlist conversion flow is working correctly.');
    process.exit(0);
  } else {
    console.log('\n⚠️ Some tests failed. Please check the logs above for details.');
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('💥 Integration test runner failed:', error);
  process.exit(1);
});
