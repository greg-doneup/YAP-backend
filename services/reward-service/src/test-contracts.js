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

// Test user address - use your wallet address for testing
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

    // Test 2: Check contract owner
    console.log("Test 2: Checking contract permissions...");
    console.log("-- YapToken Contract --");
    
    const MINTER_ROLE = await tokenContract.MINTER_ROLE();
    console.log(`MINTER_ROLE hash: ${MINTER_ROLE}`);
    
    // Check if wallet has minter role
    const hasMinterRole = await tokenContract.hasRole(MINTER_ROLE, wallet.address);
    console.log(`Wallet ${wallet.address} has minter role: ${hasMinterRole}`);
    
    // Check if DailyCompletion contract has minter role
    const completionHasMinterRole = await tokenContract.hasRole(MINTER_ROLE, completionAddress);
    console.log(`DailyCompletion contract ${completionAddress} has minter role: ${completionHasMinterRole}`);
    
    // Check the DEFAULT_ADMIN_ROLE holder
    const DEFAULT_ADMIN_ROLE = await tokenContract.DEFAULT_ADMIN_ROLE();
    const adminRole = await tokenContract.hasRole(DEFAULT_ADMIN_ROLE, wallet.address);
    console.log(`Wallet ${wallet.address} has admin role: ${adminRole}`);
    
    console.log("-- DailyCompletion Contract --");
    
    // Check DailyCompletion owner
    try {
      const completionOwner = await completionContract.owner();
      console.log(`DailyCompletion owner: ${completionOwner}`);
      console.log(`Wallet is owner: ${completionOwner.toLowerCase() === wallet.address.toLowerCase()}`);
    } catch (error) {
      console.log("Failed to get owner, might be using a different method:", error.message);
    }
    
    // Try to get what token address the DailyCompletion contract is using
    try {
      const configuredTokenAddress = await completionContract.token();
      console.log(`Token address configured in DailyCompletion: ${configuredTokenAddress}`);
      console.log(`Matches expected token address: ${configuredTokenAddress.toLowerCase() === tokenAddress.toLowerCase()}`);
    } catch (error) {
      console.log("Failed to get token address from completion contract:", error.message);
    }
    
    // Grant minter role to completion contract if needed
    if (!completionHasMinterRole && adminRole) {
      console.log("⚠️ DailyCompletion contract doesn't have minter role. Granting...");
      try {
        const tx = await tokenContract.grantRole(MINTER_ROLE, completionAddress);
        await tx.wait();
        console.log("✅ Minter role granted to DailyCompletion contract");
        
        // Verify it worked
        const newCompletionHasMinterRole = await tokenContract.hasRole(MINTER_ROLE, completionAddress);
        console.log(`DailyCompletion contract now has minter role: ${newCompletionHasMinterRole}`);
      } catch (error) {
        console.error("Failed to grant minter role:", error.message);
      }
    }
    
    console.log("-".repeat(50));

    // Test 3: Checking user balance
    console.log("Test 3: Checking user balance...");
    const balance = await tokenContract.balanceOf(testUserAddress);
    console.log(`User balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`);
    console.log("✅ Successfully retrieved user balance");
    console.log("-".repeat(50));

    // Test 4: Check daily reward amount
    console.log("Test 4: Checking daily reward amount...");
    const dailyReward = await completionContract.dailyReward();
    console.log(`Daily reward amount: ${ethers.formatUnits(dailyReward, decimals)} ${symbol}`);
    console.log("✅ Successfully retrieved daily reward amount");
    console.log("-".repeat(50));

    // Test 5: Direct token minting (as a test)
    console.log("Test 5: Testing direct token minting...");
    if (hasMinterRole) {
      try {
        const mintAmount = ethers.parseUnits("1", decimals);
        const mintTx = await tokenContract.mint(testUserAddress, mintAmount);
        await mintTx.wait();
        console.log(`✅ Successfully minted ${ethers.formatUnits(mintAmount, decimals)} ${symbol} directly`);
        
        const newBalance = await tokenContract.balanceOf(testUserAddress);
        console.log(`New user balance: ${ethers.formatUnits(newBalance, decimals)} ${symbol}`);
      } catch (error) {
        console.error("❌ Direct minting failed:", error.message);
      }
    } else {
      console.log("Skipping direct mint test (wallet doesn't have minter role)");
    }
    console.log("-".repeat(50));

    // Test 6: Check if user has completed today
    console.log("Test 6: Checking completion status...");
    const today = Math.floor(Date.now() / 1000 / 86400); // Current UTC day
    const lastDay = await completionContract.lastDay(testUserAddress);
    const hasCompletedToday = (lastDay.toString() === today.toString());
    console.log(`Current UTC day: ${today}`);
    console.log(`User's last completion day: ${lastDay}`);
    console.log(`User has completed today: ${hasCompletedToday}`);
    console.log("-".repeat(50));
    
    if (!hasCompletedToday) {
      // Test 7: Record a completion with extra debugging
      console.log("Test 7: Recording a daily completion...");
      
      // Get balance before completion
      const balanceBefore = await tokenContract.balanceOf(testUserAddress);
      console.log(`Balance before completion: ${ethers.formatUnits(balanceBefore, decimals)} ${symbol}`);
      
      try {
        // Try with higher gas limit
        console.log("Attempting completion with higher gas limit...");
        const completionTx = await completionContract.complete({
          gasLimit: 300000
        });
        
        console.log("Transaction submitted, waiting for confirmation...");
        await completionTx.wait();
        console.log("✅ Successfully recorded completion");
        console.log("Transaction hash:", completionTx.hash);
        
        // Check new balance
        const balanceAfter = await tokenContract.balanceOf(testUserAddress);
        console.log(`Balance after completion: ${ethers.formatUnits(balanceAfter, decimals)} ${symbol}`);
        console.log(`Tokens earned: ${ethers.formatUnits(balanceAfter - balanceBefore, decimals)} ${symbol}`);
        
        // Verify lastDay was updated
        const newLastDay = await completionContract.lastDay(testUserAddress);
        console.log(`Updated last completion day: ${newLastDay}`);
        console.log(`Verification: last day matches current day: ${newLastDay.toString() === today.toString()}`);
      } catch (error) {
        console.error("Error during completion:", error.message);
        
        // Additional error analysis
        if (error.message.includes("already claimed")) {
          console.log("⚠️ User has already claimed today's reward (according to contract)");
        } else if (error.message.includes("execution reverted")) {
          console.log("⚠️ Contract execution reverted - this could be due to:");
          console.log("  - DailyCompletion contract doesn't have permission to mint tokens");
          console.log("  - Token contract address is incorrect in DailyCompletion");
          console.log("  - Gas limit too low");
          
          // Try a workaround - mint directly and update lastDay
          if (hasMinterRole) {
            console.log("\nTrying workaround: mint tokens directly and update lastDay...");
            try {
              const mintAmount = ethers.parseUnits("1", decimals);
              const mintTx = await tokenContract.mint(testUserAddress, mintAmount);
              await mintTx.wait();
              console.log(`✅ Successfully minted ${ethers.formatUnits(mintAmount, decimals)} ${symbol} directly`);
              
              // Check if we can update lastDay directly
              try {
                // We can't update lastDay directly as it's not exposed, but we can note we did this manually
                console.log("Note: Tokens minted manually but lastDay not updated.");
                console.log("You would need to add a function to set lastDay or redeploy the contracts with correct permissions.");
              } catch (error) {
                console.log("Could not update lastDay:", error.message);
              }
            } catch (error) {
              console.error("Manual minting failed:", error.message);
            }
          }
        } else {
          throw error;
        }
      }
    } else {
      console.log("User has already completed today, skipping completion step");
    }
    console.log("-".repeat(50));

    console.log("Tests completed! 🎉");

  } catch (error) {
    console.error("Error during testing:", error);
    console.error("Test failed ❌");
  }
}

runTests().catch(console.error);