const http = require('http');
const crypto = require('crypto');

function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runSimpleTest() {
  console.log('🚀 Starting Simple Waitlist Conversion Test');
  
  // 1. Test health check
  console.log('\n1. Testing health check...');
  try {
    const healthRes = await makeRequest({
      hostname: 'localhost',
      port: 8000,
      path: '/health',
      method: 'GET'
    });
    console.log('✅ Health check:', healthRes.status, healthRes.data);
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
    return;
  }
  
  // 2. Create waitlist user
  console.log('\n2. Creating waitlist user...');
  const testEmail = `waitlist-test-${Date.now()}@example.com`;
  const testUserId = crypto.randomBytes(12).toString('hex');
  
  const waitlistData = {
    userId: testUserId,
    email: testEmail,
    name: 'Test Waitlist User',
    initial_language_to_learn: 'spanish',
    isWaitlistUser: true,
    wlw: false,
    waitlist_signup_at: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  try {
    const createRes = await makeRequest({
      hostname: 'localhost',
      port: 8000,
      path: '/profile',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, waitlistData);
    console.log('✅ Created waitlist user:', createRes.status, createRes.data);
  } catch (error) {
    console.log('❌ Create waitlist user failed:', error.message);
    return;
  }
  
  // 3. Test waitlist conversion
  console.log('\n3. Testing waitlist conversion...');
  const walletData = {
    email: testEmail,
    passphrase_hash: crypto.createHash('sha256').update('test-passphrase-123').digest('hex'),
    encrypted_mnemonic: 'encrypted_' + crypto.randomBytes(32).toString('hex'),
    salt: crypto.randomBytes(16).toString('hex'),
    nonce: crypto.randomBytes(12).toString('hex'),
    sei_address: 'sei1test' + crypto.randomBytes(8).toString('hex'),
    sei_public_key: 'sei_pub_' + crypto.randomBytes(16).toString('hex'),
    eth_address: '0x' + crypto.randomBytes(20).toString('hex'),
    eth_public_key: 'eth_pub_' + crypto.randomBytes(16).toString('hex')
  };
  
  try {
    const conversionRes = await makeRequest({
      hostname: 'localhost',
      port: 8000,
      path: '/auth/wallet/signup',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, walletData);
    console.log('✅ Waitlist conversion result:', conversionRes.status);
    console.log('Response data:', conversionRes.data);
    
    if (conversionRes.data && conversionRes.data.isWaitlistConversion) {
      console.log('🎉 SUCCESS: Waitlist conversion detected!');
      console.log('🏆 Bonus points:', conversionRes.data.starting_points);
    } else {
      console.log('⚠️ WARNING: No waitlist conversion flag in response');
    }
    
  } catch (error) {
    console.log('❌ Waitlist conversion failed:', error.message);
    return;
  }
  
  console.log('\n✅ Simple test completed successfully!');
}

runSimpleTest().catch(console.error);
