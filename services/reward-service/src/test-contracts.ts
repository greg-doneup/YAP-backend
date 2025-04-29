const { ethers } = require("ethers");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../.env.development") });

// Check if ABI files exist
const abiPath = path.join(__dirname, "../abi");
if (!fs.existsSync(path.join(abiPath, "YapToken.json")) || 
    !fs.existsSync(path.join(abiPath, "DailyCompletion.json"))) {
  console.error("ABI files not found. Please ensure the ABI files are in the /abi directory");
  process.exit(1);
}

// Import ABIs
const YapTokenAbi = require("../abi/YapToken.json");
const CompletionAbi = require("../abi/DailyCompletion.json");

// Get environment variables
const rpcUrl = process.env.EVM_RPC;
const privateKey = process.env.REWARD_TREASURY_PK;
const tokenAddress = process.env.TOKEN_ADDR;
const completionAddress = process.env.COMPLETION_ADDR;

if (!rpcUrl || !privateKey || !tokenAddress || !completionAddress) {
  console.error("Missing required environment variables. Please check your .env.development file");
  process.exit(1);
}

// Create provider and wallet
const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);

// Create contract instances
const tokenContract = new ethers.Contract(tokenAddress, YapTokenAbi, wallet);
const completionContract = new ethers.Contract(completionAddress, CompletionAbi, wallet);

// Test user address - use your actual wallet address for testing
const testUserAddress = wallet.address; 

async function runTests() {
  console.log("Starting contract interaction tests...");
  console.log("Using contracts:");
  console.log(`- YapToken: ${tokenAddress}`);
  console.log(`- DailyCompletion: ${completionAddress}`);
  console.log(`- Test user: ${testUserAddress}`);
  console.log("-".repeat(50));

  try {
    // Test 1: Check token name and symbol
    console.log("Test 1: Checking token information...");
    const name = await tokenContract.name();
    const symbol = await tokenContract.symbol();
    const decimals = await tokenContract.decimals();
    console.log(`Token name: ${name}`);
    console.log(`Token symbol: ${symbol}`);
    console.log(`Token decimals: ${decimals}`);
    console.log("✅ Successfully retrieved token information");
    console.log("-".repeat(50));

    // Test 2: Check contract owner/minter role
    console.log("Test 2: Checking contract roles...");
    const MINTER_ROLE = await tokenContract.MINTER_ROLE();
    const hasMinterRole = await tokenContract.hasRole(MINTER_ROLE, wallet.address);
    console.log(`Wallet ${wallet.address} has minter role: ${hasMinterRole}`);
    
    if (!hasMinterRole) {
      console.log("❌ Wallet does not have minter role. Attempting to grant...");
      const tx = await tokenContract.grantRole(MINTER_ROLE, wallet.address);
      await tx.wait();
      console.log("Role granted. Transaction hash:", tx.hash);
    } else {
      console.log("✅ Wallet has appropriate permissions");
    }
    console.log("-".repeat(50));

    // Skip minting to test user since we're using the same wallet
    console.log("Test 3: Checking user balance...");
    const balance = await tokenContract.balanceOf(testUserAddress);
    console.log(`User balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`);
    console.log("✅ Successfully retrieved user balance");
    console.log("-".repeat(50));

    // Test 4: Check if user has completed today
    console.log("Test 4: Testing daily completion status...");
    // First check current status
    const hasCompletedToday = await completionContract.hasCompletedToday(testUserAddress);
    console.log(`User has completed today: ${hasCompletedToday}`);
    
    if (!hasCompletedToday) {
      // Test 5: Record a completion
      console.log("Test 5: Recording a daily completion...");
      const completionTx = await completionContract.recordCompletion(testUserAddress);
      await completionTx.wait();
      console.log("✅ Successfully recorded completion");
      console.log("Transaction hash:", completionTx.hash);
      console.log("-".repeat(50));

      // Test 6: Verify completion was recorded
      console.log("Test 6: Verifying completion was recorded...");
      const hasCompletedAfter = await completionContract.hasCompletedToday(testUserAddress);
      console.log(`User has completed today (after recording): ${hasCompletedAfter}`);
      
      if (hasCompletedAfter) {
        console.log("✅ Completion successfully recorded");
      } else {
        console.log("❌ Completion was not recorded correctly");
      }
    } else {
      console.log("User has already completed today, skipping recording step");
    }
    console.log("-".repeat(50));

    // Test 7: Get completion count
    console.log("Test 7: Getting user completion count...");
    const completionCount = await completionContract.getUserCompletionCount(testUserAddress);
    console.log(`User has completed ${completionCount} days`);
    console.log("✅ Successfully retrieved completion count");
    console.log("-".repeat(50));

    console.log("All tests completed successfully! 🎉");

  } catch (error) {
    console.error("Error during testing:", error);
    console.error("Test failed ❌");
  }
}

runTests().catch(console.error);