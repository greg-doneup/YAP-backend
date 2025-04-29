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
    const response = await axios.post(rpcUrl, {
      jsonrpc: "2.0",
      method: "eth_getTransactionCount",
      params: [address, "latest"],
      id: 1
    });
    
    console.log("RPC response:", JSON.stringify(response.data, null, 2));
    
    if (response.data && response.data.result) {
      return parseInt(response.data.result, 16);
    }
    
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
      // Multiple by 2 to ensure it's enough
      return gasPrice * 2n;
    }
  } catch (error) {
    console.log("Error getting gas price:", error);
  }
  
  // If we can't get the gas price, use a default value
  const defaultGasPrice = 2200000000n; // 2.2 Gwei, which worked for YapToken
  console.log(`Using default gas price: ${defaultGasPrice} wei`);
  return defaultGasPrice;
}

async function main() {
  try {
    // Load environment variables
    const rpcUrl = process.env.EVM_RPC;
    const privateKey = process.env.REWARD_TREASURY_PK;
    const chainId = Number(process.env.CHAIN_ID);
    
    // Load YapToken contract address from deployments
    const tokenDeploymentPath = path.join(__dirname, "../deployments/token.json");
    if (!fs.existsSync(tokenDeploymentPath)) {
      throw new Error("YapToken deployment info not found. Please deploy YapToken first.");
    }
    
    const tokenDeployment = JSON.parse(fs.readFileSync(tokenDeploymentPath, "utf8"));
    const yapTokenAddress = tokenDeployment.tokenAddress;
    
    console.log("Environment variables:");
    console.log(`RPC URL: ${rpcUrl}`);
    console.log(`Chain ID: ${chainId}`);
    console.log(`Private key available: ${privateKey ? 'Yes' : 'No'}`);
    console.log(`YapToken address: ${yapTokenAddress}`);

    if (!rpcUrl || !privateKey) {
      throw new Error("Missing required environment variables (EVM_RPC or REWARD_TREASURY_PK)");
    }

    // Create custom provider with minimal requirements
    console.log("Creating JsonRpcProvider...");
    const provider = new ethers.JsonRpcProvider(rpcUrl, {
      chainId,
      name: "sei-devnet",
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
    const artifactPath = path.join(__dirname, "../artifacts/contracts/DailyCompletion.sol/DailyCompletion.json");
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
    // Deploy the DailyCompletion contract with the YapToken address as constructor parameter
    const deploymentTx = await factory.getDeployTransaction(yapTokenAddress);
    console.log("Deployment transaction data prepared");
    
    const tx = {
      ...deploymentTx,
      nonce,
      gasLimit: 5000000n,  // Explicit gas limit
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
    
    const completionAddress = receipt.contractAddress;
    console.log("DailyCompletion deployed to:", completionAddress);
    
    // Create deployments directory if it doesn't exist
    const deploymentsDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    // Save the deployment address
    const deploymentInfo = {
      chainId,
      tokenAddress: yapTokenAddress,
      completionAddress,
      txHash: txResponse.hash,
      deploymentTime: new Date().toISOString()
    };
    
    fs.writeFileSync(
      path.join(__dirname, "../deployments/completion.json"),
      JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log("Deployment info saved to deployments/completion.json");
    
    // Save the ABIs to the reward-service
    const abiDir = path.join(__dirname, "../../services/reward-service/abi");
    if (!fs.existsSync(abiDir)) {
      fs.mkdirSync(abiDir, { recursive: true });
    }
    
    // Save YapToken ABI
    const yapTokenArtifactPath = path.join(__dirname, "../artifacts/contracts/YapToken.sol/YapToken.json");
    const yapTokenArtifact = JSON.parse(fs.readFileSync(yapTokenArtifactPath, "utf8"));
    fs.writeFileSync(
      path.join(abiDir, "YapToken.json"),
      JSON.stringify(yapTokenArtifact.abi, null, 2)
    );
    
    // Save DailyCompletion ABI
    fs.writeFileSync(
      path.join(abiDir, "DailyCompletion.json"),
      JSON.stringify(artifact.abi, null, 2)
    );
    
    console.log("Contract ABIs saved to reward-service/abi/ directory");
    
    // **NEW CODE**: Grant the MINTER_ROLE to the DailyCompletion contract
    console.log("Granting MINTER_ROLE to the DailyCompletion contract...");
    
    // Load the YapToken contract
    const yapTokenABI = yapTokenArtifact.abi;
    const yapTokenContract = new ethers.Contract(yapTokenAddress, yapTokenABI, connectedWallet);
    
    // Get the MINTER_ROLE hash
    const MINTER_ROLE = await yapTokenContract.MINTER_ROLE();
    console.log(`MINTER_ROLE hash: ${MINTER_ROLE}`);
    
    // Check if the contract already has the role
    const hasRole = await yapTokenContract.hasRole(MINTER_ROLE, completionAddress);
    
    if (hasRole) {
      console.log("DailyCompletion contract already has the MINTER_ROLE");
    } else {
      console.log("Granting MINTER_ROLE to DailyCompletion contract...");
      
      // Get updated nonce
      const grantNonce = await getNonceForAddress(rpcUrl, wallet.address);
      console.log(`Using nonce for grant role tx: ${grantNonce}`);
      
      // Grant the role
      const grantTx = await yapTokenContract.grantRole(MINTER_ROLE, completionAddress, {
        gasLimit: 200000,
        gasPrice: gasPrice,
        nonce: grantNonce
      });
      
      console.log("Grant role transaction hash:", grantTx.hash);
      const grantReceipt = await grantTx.wait();
      console.log("Grant role transaction confirmed!");
      
      // Verify that the role was granted
      const hasRoleAfter = await yapTokenContract.hasRole(MINTER_ROLE, completionAddress);
      console.log(`DailyCompletion contract has MINTER_ROLE after grant: ${hasRoleAfter}`);
      
      if (!hasRoleAfter) {
        console.warn("WARNING: Failed to grant MINTER_ROLE to the DailyCompletion contract");
      } else {
        console.log("✅ MINTER_ROLE successfully granted to DailyCompletion contract");
      }
    }
    
  } catch (error) {
    console.error("Deployment failed with error:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
      console.error("Stack trace:", error.stack);
    }
    process.exit(1);
  }
}

console.log("Starting DailyCompletion deployment script...");
main()
  .then(() => {
    console.log("Deployment completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
