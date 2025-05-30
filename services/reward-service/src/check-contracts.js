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

async function main() {
  // Create provider
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  // Check token contract
  console.log("\nChecking YAPToken contract...");
  try {
    const code = await provider.getCode(tokenAddress);
    if (code === "0x") {
      console.log("❌ No contract found at YAPToken address");
    } else {
      console.log("✅ YAPToken contract exists");
      console.log(`Code length: ${(code.length - 2) / 2} bytes`);
    }
  } catch (error) {
    console.log("Error checking YAPToken:", error.message);
  }
  
  // Check completion contract
  console.log("\nChecking DailyCompletion contract...");
  try {
    const code = await provider.getCode(completionAddress);
    if (code === "0x") {
      console.log("❌ No contract found at DailyCompletion address");
    } else {
      console.log("✅ DailyCompletion contract exists");
      console.log(`Code length: ${(code.length - 2) / 2} bytes`);
    }
  } catch (error) {
    console.log("Error checking DailyCompletion:", error.message);
  }
}

main()
  .then(() => console.log("Done!"))
  .catch(error => console.error("Error:", error));