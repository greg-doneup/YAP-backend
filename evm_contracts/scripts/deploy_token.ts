import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import axios from "axios";
dotenv.config();

// Custom function to get nonce since eth_getTransactionCount is not supported
async function getNonceForAddress(rpcUrl: string, address: string): Promise<number> {
  try {
    console.log(`Attempting to get nonce for address ${address} from ${rpcUrl}`);
    // Try Sei-specific endpoint if available
    const response = await axios.post(rpcUrl, {
      jsonrpc: "2.0",
      method: "eth_getTransactionCount",
      params: [address, "latest"], // Use "latest" instead of "pending"
      id: 1
    });
    
    console.log("RPC response:", JSON.stringify(response.data, null, 2));
    
    if (response.data && response.data.result) {
      return parseInt(response.data.result, 16);
    }
    
    // If we got here but didn't get a result, return a default nonce
    console.log("No nonce result found in RPC response, using default value 0");
    return 0;
  } catch (error) {
    console.log("Error getting nonce:", error);
    console.log("Unable to get nonce from RPC, using default value 0");
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
      // Multiple by 1.5 to ensure it's enough
      return gasPrice * 2n;
    }
  } catch (error) {
    console.log("Error getting gas price:", error);
  }
  
  // If we can't get the gas price, use a high default value
  // 20 Gwei (20 * 10^9)
  const defaultGasPrice = 20000000000n;
  console.log(`Using default gas price: ${defaultGasPrice} wei`);
  return defaultGasPrice;
}

async function main() {
  try {
    // Load environment variables
    const rpcUrl = process.env.EVM_RPC;
    const privateKey = process.env.REWARD_TREASURY_PK;
    const chainId = Number(process.env.CHAIN_ID);

    console.log("Environment variables:");
    console.log(`RPC URL: ${rpcUrl}`);
    console.log(`Chain ID: ${chainId}`);
    console.log(`Private key available: ${privateKey ? 'Yes' : 'No'}`);

    if (!rpcUrl || !privateKey) {
      throw new Error("Missing required environment variables (EVM_RPC or REWARD_TREASURY_PK)");
    }

    // Create custom provider with minimal requirements
    console.log("Creating JsonRpcProvider...");
    const provider = new ethers.JsonRpcProvider(rpcUrl, {
      chainId,
      name: "sei-testnet",
      ensAddress: undefined
    });
    
    // Test provider connection
    console.log("Testing provider connection...");
    try {
      const blockNumber = await provider.getBlockNumber();
      console.log(`Connected to blockchain. Current block number: ${blockNumber}`);
    } catch (error) {
      console.log("Failed to get block number:", error);
      console.log("Continuing anyway as the RPC might not support this method...");
    }
    
    // Create wallet from private key
    console.log("Creating wallet...");
    const wallet = new ethers.Wallet(privateKey);
    console.log(`Wallet address: ${wallet.address}`);
    const connectedWallet = wallet.connect(provider);
    
    console.log("Deploying contracts with the account:", wallet.address);

    // Load the contract artifact
    console.log("Loading contract artifact...");
    const artifactPath = path.join(__dirname, "../artifacts/contracts/YapToken.sol/YapToken.json");
    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Artifact not found at ${artifactPath}. Make sure you've compiled the contracts.`);
    }
    
    const artifactRaw = fs.readFileSync(artifactPath, "utf8");
    const artifact = JSON.parse(artifactRaw);
    console.log("Contract artifact loaded successfully");

    // Create contract factory
    console.log("Creating contract factory...");
    const factory = new ethers.ContractFactory(
      artifact.abi,
      artifact.bytecode,
      connectedWallet
    );
    
    console.log("Getting nonce for deployment...");
    const nonce = await getNonceForAddress(rpcUrl, wallet.address);
    console.log(`Using nonce: ${nonce}`);
    
    // Get appropriate gas price from network or use default
    const gasPrice = await getGasPrice(rpcUrl);
    console.log(`Using gas price: ${gasPrice} wei (${Number(gasPrice) / 1e9} Gwei)`);
    
    console.log("Preparing deployment transaction...");
    // Deploy with explicit transaction parameters to avoid RPC calls
    const deploymentTx = await factory.getDeployTransaction();
    console.log("Deployment transaction data prepared");
    
    const tx = {
      ...deploymentTx,
      nonce,
      gasLimit: 5000000n,  // Increased gas limit
      gasPrice: gasPrice,  // Explicit gas price
      type: 0,            // Legacy transaction type
      chainId
    };
    
    console.log("Transaction parameters:", JSON.stringify({
      nonce: tx.nonce,
      gasLimit: tx.gasLimit?.toString(),
      gasPrice: tx.gasPrice?.toString(),
      type: tx.type,
      chainId: tx.chainId,
      data: tx.data ? `${tx.data.toString().substring(0, 66)}...` : null
    }, null, 2));
    
    console.log("Signing transaction...");
    const signedTx = await wallet.signTransaction(tx);
    console.log("Transaction signed successfully");
    
    console.log("Broadcasting transaction...");
    const txResponse = await provider.broadcastTransaction(signedTx);
    
    console.log("Transaction hash:", txResponse.hash);
    console.log("Waiting for transaction confirmation...");
    
    const receipt = await txResponse.wait();
    console.log("Transaction confirmed!");
    console.log("Receipt:", JSON.stringify(receipt, null, 2));
    
    if (!receipt || !receipt.contractAddress) {
      throw new Error("Deployment failed - no contract address in receipt");
    }
    
    const tokenAddress = receipt.contractAddress;
    console.log("YapToken deployed to:", tokenAddress);
    
    // Create deployments directory if it doesn't exist
    const deploymentsDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    // Save the deployment address
    const deploymentInfo = {
      chainId,
      tokenAddress,
      txHash: txResponse.hash,
      deploymentTime: new Date().toISOString()
    };
    
    fs.writeFileSync(
      path.join(__dirname, "../deployments/token.json"),
      JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log("Deployment info saved to deployments/token.json");
    
  } catch (error) {
    console.error("Deployment failed with error:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
      console.error("Stack trace:", error.stack);
    }
    process.exit(1);
  }
}

console.log("Starting deployment script...");
main()
  .then(() => {
    console.log("Deployment completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
