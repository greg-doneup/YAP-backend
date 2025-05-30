const { ethers } = require("ethers");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../.env.development") });

// Get environment variables
const rpcUrl = process.env.EVM_RPC;
const tokenAddress = process.env.TOKEN_ADDR;
const completionAddress = process.env.COMPLETION_ADDR;

console.log("Starting basic contract check...");
console.log(`Using RPC URL: ${rpcUrl}`);
console.log(`YAPToken address: ${tokenAddress}`);
console.log(`DailyCompletion address: ${completionAddress}`);

// Helper function to retry operations with exponential backoff
async function withRetry(operation, maxRetries = 3, retryDelay = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt - 1);
        console.log(`Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

async function main() {
  // Create provider with explicit network configuration
  console.log("Creating provider with explicit network configuration...");
  const provider = new ethers.JsonRpcProvider(rpcUrl, {
    chainId: Number(process.env.CHAIN_ID),
    name: "sei-testnet"
  });
  
  // Test basic connection
  console.log("\nTesting basic connection to RPC...");
  try {
    await withRetry(async () => {
      const blockNum = await provider.getBlockNumber();
      console.log(`✅ Connected to network. Current block: ${blockNum}`);
    });
  } catch (error) {
    console.log(`❌ Failed to connect to network: ${error.message}`);
    console.log("Continuing with contract checks anyway...");
  }
  
  // Check token contract
  console.log("\nChecking YAPToken contract...");
  try {
    await withRetry(async () => {
      const code = await provider.getCode(tokenAddress);
      if (code === "0x") {
        console.log("❌ No contract found at YAPToken address");
      } else {
        console.log("✅ YAPToken contract exists");
        console.log(`Code length: ${(code.length - 2) / 2} bytes`);
      }
    });
  } catch (error) {
    console.log(`❌ Error checking YAPToken: ${error.message}`);
  }
  
  // Check completion contract
  console.log("\nChecking DailyCompletion contract...");
  try {
    await withRetry(async () => {
      const code = await provider.getCode(completionAddress);
      if (code === "0x") {
        console.log("❌ No contract found at DailyCompletion address");
      } else {
        console.log("✅ DailyCompletion contract exists");
        console.log(`Code length: ${(code.length - 2) / 2} bytes`);
      }
    });
  } catch (error) {
    console.log(`❌ Error checking DailyCompletion: ${error.message}`);
  }
  
  console.log("\nDiagnostics complete");
}

main()
  .then(() => console.log("Done!"))
  .catch(error => console.error("Error:", error));