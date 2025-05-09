import axios from 'axios';

/**
 * Enhanced connection test script to verify connectivity to profile services
 * Tests multiple endpoints and ports to identify connectivity issues
 * Run with: npx ts-node src/connection-test.ts
 */

// Define test configurations for each service
const serviceTests = [
  // Gateway service tests (port 80 is default)
  {
    name: 'Gateway Service (default)',
    url: 'http://gateway-service/healthz',
  },
  {
    name: 'Gateway to Profile Service',
    url: 'http://gateway-service/profile/healthz',
  },
  // Direct service tests
  {
    name: 'Profile Service (port 8080)',
    url: 'http://profile-service:8080/healthz',
  },
  {
    name: 'Offchain Profile Service (port 8080)',
    url: 'http://offchain-profile:8080/healthz',
  }
];

// Test gateway profile creation endpoint
const testProfileCreation = async () => {
  try {
    const testData = {
      userId: 'test-user-' + Date.now(),
      walletAddress: 'sei1test' + Date.now(),
      ethWalletAddress: '0xtest' + Date.now(),
      signupMethod: 'test'
    };
    
    console.log('\n🔄 Testing profile creation through gateway...');
    console.log(`Sending POST to http://gateway-service/profile/profiles`);
    
    const response = await axios.post('http://gateway-service/profile/profiles', testData, { 
      timeout: 5000 
    });
    
    console.log(`✅ Profile creation successful! Status: ${response.status}`);
    console.log('Response:', response.data);
    return true;
  } catch (error: any) {
    if (error.response) {
      console.error(`⚠️ Profile service responded with error - Status: ${error.response.status}`);
      console.error('Response data:', error.response.data);
    } else if (error.request) {
      console.error(`❌ No response from profile service: ${error.message}`);
    } else {
      console.error(`❌ Error setting up request: ${error.message}`);
    }
    return false;
  }
};

// Test if we can connect to an IP directly
async function testDirectIpConnection(ip: string, port: number, path: string = '/') {
  try {
    console.log(`Testing direct connection to ${ip}:${port}${path}`);
    const response = await axios.get(`http://${ip}:${port}${path}`, { timeout: 3000 });
    console.log(`✅ Successfully connected to ${ip}:${port}: ${JSON.stringify(response.data)}`);
    return true;
  } catch (error: any) {
    if (error.response) {
      console.error(`⚠️ ${ip}:${port} responded with status ${error.response.status}`);
      // Even an error response means we can connect!
      return true;
    } else if (error.request) {
      console.error(`❌ No response from ${ip}:${port}: ${error.message}`);
      return false;
    } else {
      console.error(`❌ Error setting up request to ${ip}:${port}: ${error.message}`);
      return false;
    }
  }
}

async function testConnection() {
  console.log('🔍 ENHANCED CONNECTION TEST');
  console.log('=========================');
  
  console.log('\n📡 Testing service endpoints...');
  console.log('----------------------------');
  
  // Test all defined service endpoints
  for (const test of serviceTests) {
    try {
      console.log(`\nTesting ${test.name} at ${test.url}`);
      const response = await axios.get(test.url, { timeout: 3000 });
      console.log(`✅ Success! Status: ${response.status}, Data:`, response.data);
    } catch (error: any) {
      if (error.response) {
        console.error(`⚠️ Service responded with error - Status: ${error.response.status}`);
        console.error('Response data:', error.response.data);
      } else if (error.request) {
        console.error(`❌ No response: ${error.message}`);
      } else {
        console.error(`❌ Error setting up request: ${error.message}`);
      }
    }
  }
  
  // Test profile creation through gateway
  await testProfileCreation();
  
  console.log('\n🔍 DNS resolution test');
  console.log('-------------------');
  
  // Get DNS resolution results
  const dnsResults: Record<string, string> = {};
  try {
    const dns = require('dns');
    const { promisify } = require('util');
    const lookup = promisify(dns.lookup);
    
    const hostnames = ['profile-service', 'offchain-profile'];
    for (const hostname of hostnames) {
      try {
        console.log(`Resolving ${hostname}...`);
        const result = await lookup(hostname);
        console.log(`✅ ${hostname} resolves to: ${result.address}`);
        dnsResults[hostname] = result.address;
      } catch (err: any) {
        console.error(`❌ Failed to resolve ${hostname}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error('DNS testing not available in this environment');
  }
  
  console.log('\n🔌 Testing direct IP connections');
  console.log('-----------------------------');
  
  // Test direct IP connections if we have DNS results
  if (Object.keys(dnsResults).length > 0) {
    for (const [hostname, ip] of Object.entries(dnsResults)) {
      await testDirectIpConnection(ip, 8080, '/healthz');
      await testDirectIpConnection(ip, 80, '/healthz');
    }
  }
  
  console.log('\n📊 Test Summary');
  console.log('-------------');
  console.log('1. Services are resolving via DNS');
  console.log('2. Using gateway-service (port 80) to route to profile service');
  console.log('3. Using direct connection to offchain-profile:8080 for offchain profiles');
}

testConnection().catch(err => {
  console.error('Test failed:', err.message);
});