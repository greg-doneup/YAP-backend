const dotenv = require('dotenv');
const path = require('path');
const { ethers } = require('ethers');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.development') });

// Import our blockchain service
const blockchain = require('./blockchain');

async function runTests() {
  console.log('Starting contract interaction tests...');
  console.log('Using contracts:');
  console.log(`- YapToken: ${process.env.TOKEN_ADDR}`);
  console.log(`- DailyCompletion: ${process.env.COMPLETION_ADDR}`);
  
  // Generate a test user address if not provided
  const testUserAddress = process.env.TEST_USER_ADDRESS || ethers.Wallet.createRandom().address;
  console.log(`- Test user: ${testUserAddress}`);
  console.log('--------------------------------------------------');
  
  try {
    // Test 1: Check contract health
    console.log('\nTest 1: Checking contract health...');
    const health = await blockchain.checkContractHealth();
    if (health.connected) {
      console.log('✅ Connected to blockchain');
      console.log(`✅ Token: ${health.tokenInfo?.name} (${health.tokenInfo?.symbol})`);
      console.log(`✅ Daily reward: ${health.dailyReward} ${health.tokenInfo?.symbol}`);
      if (health.walletAddress) {
        console.log(`✅ Wallet connected: ${health.walletAddress}`);
      } else {
        console.log('⚠️ No wallet connected (read-only mode)');
      }
    } else {
      console.log(`❌ Contract health check failed: ${health.error}`);
      throw new Error('Contract health check failed');
    }
    
    // Test 2: Check if the test user has completed today
    console.log('\nTest 2: Checking if test user has completed today...');
    const completed = await blockchain.hasCompletedToday(testUserAddress);
    console.log(`✅ User has ${completed ? '' : 'not '}completed today`);
    
    // Test 3: Get user balance
    console.log('\nTest 3: Checking token balance...');
    const balance = await blockchain.getBalance(testUserAddress);
    console.log(`✅ User balance: ${balance} ${health.tokenInfo?.symbol}`);
    
    // Test 4: Only run these tests if we have a wallet
    if (health.walletAddress) {
      // Test 4a: Mint tokens (admin function)
      console.log('\nTest 4a: Minting tokens to test user...');
      try {
        const mintResult = await blockchain.mintTokens(testUserAddress, '1.0');
        if (mintResult.success) {
          console.log(`✅ Tokens minted successfully (tx: ${mintResult.txHash})`);
        } else {
          console.log(`❌ Token mint failed: ${mintResult.error}`);
        }
      } catch (error) {
        console.log(`❌ Token mint failed: ${error.message}`);
      }
      
      // Test 4b: Check balance after mint
      console.log('\nTest 4b: Checking token balance after mint...');
      const balanceAfter = await blockchain.getBalance(testUserAddress);
      console.log(`✅ User balance after mint: ${balanceAfter} ${health.tokenInfo?.symbol}`);
      
      // Test 5: Try completing (if not already completed)
      if (!completed) {
        console.log('\nTest 5: Recording completion...');
        try {
          const completeResult = await blockchain.recordCompletion(testUserAddress);
          if (completeResult.success) {
            console.log(`✅ Completion recorded successfully (tx: ${completeResult.txHash})`);
          } else {
            console.log(`❌ Completion failed: ${completeResult.error}`);
          }
        } catch (error) {
          console.log(`❌ Completion failed: ${error.message}`);
        }
      } else {
        console.log('\nTest 5: Skipping completion test as user has already completed today');
      }
      
      // Test 6: Check completion status again
      console.log('\nTest 6: Checking completion status again...');
      const completedAfter = await blockchain.hasCompletedToday(testUserAddress);
      console.log(`✅ User has ${completedAfter ? '' : 'not '}completed today`);
    } else {
      console.log('\nSkipping transaction tests (mint/complete) since no wallet is connected');
    }

    console.log('\n--------------------------------------------------');
    console.log('✅ All available tests completed successfully!');
    
  } catch (error) {
    console.error('\nError during testing:', error);
    console.log('❌ Test failed');
  }
}

runTests().catch(error => {
  console.error('Unhandled error:', error);
});