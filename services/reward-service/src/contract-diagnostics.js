const { ethers } = require("ethers");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../.env.development") });

// Get environment variables
const rpcUrl = process.env.EVM_RPC;
const tokenAddress = process.env.TOKEN_ADDR;
const completionAddress = process.env.COMPLETION_ADDR;
const chainId = Number(process.env.CHAIN_ID);

if (!rpcUrl || !tokenAddress || !completionAddress) {
  console.error("Missing required environment variables. Please check your .env.development file");
  process.exit(1);
}

// Create provider without wallet for read-only operations
console.log(`Connecting to Sei Testnet at ${rpcUrl} (Chain ID: ${chainId})`);
const provider = new ethers.JsonRpcProvider(rpcUrl);
console.log(`Running in read-only mode (no wallet connected)`);

// Check if the contracts exist by getting their code
async function checkContract(address, name) {
  console.log(`\nChecking contract: ${name} at ${address}`);
  try {
    const code = await provider.getCode(address);
    if (code === "0x") {
      console.error(`❌ No contract found at address: ${address}`);
      return false;
    } else {
      console.log(`✅ Contract code exists at ${address} (${code.slice(0, 20)}...)`);
      return true;
    }
  } catch (error) {
    console.error(`❌ Error checking contract ${name}:`, error.message);
    return false;
  }
}

// Try to load ABIs
function loadAbi(contractName) {
  console.log(`\nLoading ABI for ${contractName}`);
  const abiPath = path.join(__dirname, `../abi/${contractName}.json`);
  try {
    if (fs.existsSync(abiPath)) {
      const abi = require(abiPath);
      console.log(`✅ ABI loaded successfully with ${abi.length} entries`);
      return abi;
    } else {
      console.error(`❌ ABI file not found at ${abiPath}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Error loading ABI for ${contractName}:`, error.message);
    return null;
  }
}

// Low-level contract call using ABI function signature
async function callContractMethod(address, methodSignature, methodName, args = []) {
  console.log(`\nTrying low-level call to ${methodName}`);
  try {
    // Create method signature
    const functionHash = ethers.keccak256(ethers.toUtf8Bytes(methodSignature)).slice(0, 10);
    console.log(`Function selector: ${functionHash}`);
    
    // Encode arguments if any
    let callData = functionHash;
    if (args.length > 0) {
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const encodedArgs = abiCoder.encode(
        methodSignature.slice(methodSignature.indexOf('(') + 1, methodSignature.indexOf(')')).split(','), 
        args
      );
      callData = functionHash + encodedArgs.slice(2); // remove 0x prefix
    }
    
    // Make call
    console.log(`Call data: ${callData}`);
    const result = await provider.call({
      to: address,
      data: callData
    });
    
    console.log(`✅ Call result: ${result}`);
    console.log(`Result length: ${result.length} bytes`);
    
    if (result === '0x') {
      console.log('Result is empty - this may indicate the method doesn\'t exist or returned nothing');
    } else {
      try {
        // Try to decode the result based on return type
        // For strings, bytes, etc.
        if (methodSignature.includes('string')) {
          const abiCoder = ethers.AbiCoder.defaultAbiCoder();
          const decoded = abiCoder.decode(['string'], result);
          console.log(`Decoded result as string: ${decoded[0]}`);
        } 
        // For uint
        else if (methodSignature.includes('uint')) {
          const abiCoder = ethers.AbiCoder.defaultAbiCoder();
          const decoded = abiCoder.decode(['uint256'], result);
          console.log(`Decoded result as uint: ${decoded[0]}`);
        }
        // For bool
        else if (methodSignature.includes('bool')) {
          const abiCoder = ethers.AbiCoder.defaultAbiCoder();
          const decoded = abiCoder.decode(['bool'], result);
          console.log(`Decoded result as bool: ${decoded[0]}`);
        }
        // For address
        else if (methodSignature.includes('address')) {
          const abiCoder = ethers.AbiCoder.defaultAbiCoder();
          const decoded = abiCoder.decode(['address'], result);
          console.log(`Decoded result as address: ${decoded[0]}`);
        }
      } catch (error) {
        console.log(`Could not decode result: ${error.message}`);
      }
    }
    return result;
  } catch (error) {
    console.error(`❌ Error calling ${methodName}:`, error.message);
    return null;
  }
}

// Try connecting using the ABI
async function tryContractWithAbi(address, contractName, abi) {
  console.log(`\nTrying to connect to ${contractName} with ABI`);
  try {
    const contract = new ethers.Contract(address, abi, provider);
    
    // Try a few common methods 
    if (contractName === 'YAPToken') {
      console.log("Attempting to call common ERC20 methods:");
      
      try {
        const name = await contract.name();
        console.log(`✅ name(): ${name}`);
      } catch (error) {
        console.error(`❌ name() failed:`, error.message);
      }
      
      try {
        const symbol = await contract.symbol();
        console.log(`✅ symbol(): ${symbol}`);
      } catch (error) {
        console.error(`❌ symbol() failed:`, error.message);
      }
      
      try {
        const decimals = await contract.decimals();
        console.log(`✅ decimals(): ${decimals}`);
      } catch (error) {
        console.error(`❌ decimals() failed:`, error.message);
      }
      
      try {
        const totalSupply = await contract.totalSupply();
        console.log(`✅ totalSupply(): ${ethers.formatUnits(totalSupply, 18)}`);
      } catch (error) {
        console.error(`❌ totalSupply() failed:`, error.message);
      }
    } 
    else if (contractName === 'DailyCompletion') {
      console.log("Attempting to call DailyCompletion methods:");
      
      try {
        const tokenAddr = await contract.token();
        console.log(`✅ token(): ${tokenAddr}`);
        console.log(`  Expected: ${tokenAddress}`);
        console.log(`  Matches: ${tokenAddr.toLowerCase() === tokenAddress.toLowerCase()}`);
      } catch (error) {
        console.error(`❌ token() failed:`, error.message);
      }
      
      try {
        const dailyReward = await contract.dailyReward();
        console.log(`✅ dailyReward(): ${ethers.formatUnits(dailyReward, 18)}`);
      } catch (error) {
        console.error(`❌ dailyReward() failed:`, error.message);
      }
    }
    
  } catch (error) {
    console.error(`❌ Error connecting to ${contractName} with ABI:`, error.message);
  }
}

async function main() {
  console.log("Starting advanced contract diagnostics...");
  console.log("-".repeat(70));

  // Check contracts exist
  const tokenExists = await checkContract(tokenAddress, "YAPToken");
  const completionExists = await checkContract(completionAddress, "DailyCompletion");

  // Load ABIs
  const tokenAbi = loadAbi("YAPToken");
  const completionAbi = loadAbi("DailyCompletion");

  // Try connecting with ABIs
  if (tokenExists && tokenAbi) {
    await tryContractWithAbi(tokenAddress, "YAPToken", tokenAbi);
  }
  
  if (completionExists && completionAbi) {
    await tryContractWithAbi(completionAddress, "DailyCompletion", completionAbi);
  }

  // Try direct method calls without ABI
  console.log("\n" + "-".repeat(20) + " Low-level Contract Calls " + "-".repeat(20));
  
  if (tokenExists) {
    await callContractMethod(tokenAddress, "name()", "name");
    await callContractMethod(tokenAddress, "symbol()", "symbol");
    await callContractMethod(tokenAddress, "decimals()", "decimals");
    await callContractMethod(tokenAddress, "totalSupply()", "totalSupply");
  }
  
  if (completionExists) {
    await callContractMethod(completionAddress, "token()", "token");
    await callContractMethod(completionAddress, "dailyReward()", "dailyReward");
  }

  console.log("\n" + "-".repeat(70));
  console.log("Diagnostics complete!");
}

main().catch(console.error);