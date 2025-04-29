import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import axios from "axios";
dotenv.config();

async function getNonceForAddress(rpcUrl: string, address: string): Promise<number> {
  try {
    console.log(`Attempting to get nonce for address ${address} from ${rpcUrl}`);
    const response = await axios.post(rpcUrl, {
      jsonrpc: "2.0",
      method: "eth_getTransactionCount",
      params: [address, "latest"],
      id: 1
    });
    
    if (response.data && response.data.result) {
      return parseInt(response.data.result, 16);
    }
    
    return 0;
  } catch (error) {
    console.log("Error getting nonce:", error);
    return 0;
  }
}

async function getGasPrice(rpcUrl: string): Promise<bigint> {
  try {
    console.log("Attempting to get gas price from network...");
    const response = await axios.post(rpcUrl, {
      jsonrpc: "2.0",
      method: "eth_gasPrice",
      params: [],
      id: 1
    });
    
    if (response.data && response.data.result) {
      const gasPrice = BigInt(response.data.result);
      console.log(`Network gas price: ${gasPrice} wei`);
      // Double the gas price for better chances of acceptance
      return gasPrice * 3n;
    }
  } catch (error) {
    console.log("Error getting gas price:", error);
  }
  
  // Higher default gas price (50 Gwei)
  const defaultGasPrice = 50000000000n;
  console.log(`Using default gas price: ${defaultGasPrice} wei`);
  return defaultGasPrice;
}

async function main() {
  try {
    // First, check balance
    const rpcUrl = process.env.EVM_RPC;
    const privateKey = process.env.REWARD_TREASURY_PK;
    const chainId = Number(process.env.CHAIN_ID);

    if (!rpcUrl || !privateKey) {
      throw new Error("Missing required environment variables (EVM_RPC or REWARD_TREASURY_PK)");
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl, {
      chainId,
      name: "sei-testnet",
      ensAddress: undefined
    });
    
    const wallet = new ethers.Wallet(privateKey);
    console.log(`Wallet address: ${wallet.address}`);
    
    // Check wallet balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`Wallet balance: ${ethers.formatEther(balance)} SEI`);
    
    if (balance === 0n) {
      throw new Error("Wallet has zero balance. Please fund your wallet before deploying contracts.");
    }
    
    const connectedWallet = wallet.connect(provider);
    
    // Load the contract artifact
    console.log("Compiling SimpleStorage contract...");
    await runInTerminal("npx hardhat compile");
    
    const artifactPath = path.join(__dirname, "../artifacts/contracts/SimpleStorage.sol/SimpleStorage.json");
    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Artifact not found at ${artifactPath}. Make sure you've compiled the contracts.`);
    }
    
    const artifactRaw = fs.readFileSync(artifactPath, "utf8");
    const artifact = JSON.parse(artifactRaw);
    console.log("Contract artifact loaded successfully");

    // Create contract factory
    const factory = new ethers.ContractFactory(
      artifact.abi,
      artifact.bytecode,
      connectedWallet
    );
    
    const nonce = await getNonceForAddress(rpcUrl, wallet.address);
    console.log(`Using nonce: ${nonce}`);
    
    // Use a much lower gas limit for this simple contract
    const gasLimit = 1000000n;
    console.log(`Using gas limit: ${gasLimit}`);
    
    // Get appropriate gas price from network or use default
    const gasPrice = await getGasPrice(rpcUrl);
    console.log(`Using gas price: ${gasPrice} wei (${Number(gasPrice) / 1e9} Gwei)`);
    
    // Deploy with small gas values to test connectivity
    console.log("Deploying SimpleStorage contract...");
    try {
      // Try to deploy using the regular deployment method first
      const contract = await factory.deploy({
        gasLimit,
        gasPrice
      });
      
      console.log("Transaction hash:", contract.deploymentTransaction()?.hash);
      console.log("Waiting for transaction confirmation...");
      
      await contract.waitForDeployment();
      
      const contractAddress = await contract.getAddress();
      console.log("SimpleStorage deployed to:", contractAddress);
      
    } catch (error) {
      console.error("Regular deployment failed:", error);
      console.log("Trying alternative deployment method...");
      
      // Alternative deployment method
      const deploymentTx = await factory.getDeployTransaction();
      const tx = {
        ...deploymentTx,
        nonce,
        gasLimit,
        gasPrice,
        type: 0,
        chainId
      };
      
      const signedTx = await wallet.signTransaction(tx);
      const txResponse = await provider.broadcastTransaction(signedTx);
      
      console.log("Transaction hash:", txResponse.hash);
      console.log("Waiting for transaction confirmation...");
      
      const receipt = await txResponse.wait();
      
      if (!receipt || !receipt.contractAddress) {
        throw new Error("Deployment failed - no contract address in receipt");
      }
      
      console.log("SimpleStorage deployed to:", receipt.contractAddress);
    }
    
  } catch (error) {
    console.error("Deployment failed with error:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
    }
    process.exit(1);
  }
}

// Helper function to run terminal commands
async function runInTerminal(command: string): Promise<void> {
  const { exec } = require("child_process");
  return new Promise((resolve, reject) => {
    exec(command, (error: any, stdout: any, stderr: any) => {
      if (error) {
        console.error(`Error executing command: ${command}`);
        console.error(stderr);
        reject(error);
        return;
      }
      console.log(stdout);
      resolve();
    });
  });
}

console.log("Starting SimpleStorage deployment script...");
main()
  .then(() => {
    console.log("Deployment completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });