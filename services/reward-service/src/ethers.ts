import { ethers } from "ethers";
import YAPTokenAbi from "../../abi/YapToken.json";
import CompletionAbi from "../../abi/DailyCompletion.json";
import * as fs from "fs";
import * as path from "path";

const provider = new ethers.JsonRpcProvider(process.env.EVM_RPC!);
const wallet = new ethers.Wallet(process.env.REWARD_TREASURY_PK!, provider);

// Fallback to environment variables if set, otherwise use deployments from files
let tokenAddress: string;
let completionAddress: string;

try {
  // Try to load from deployments
  const completionDeploymentPath = path.join(__dirname, '../../../evm_contracts/deployments/completion.json');
  
  if (fs.existsSync(completionDeploymentPath)) {
    const deploymentInfo = JSON.parse(fs.readFileSync(completionDeploymentPath, 'utf8'));
    tokenAddress = deploymentInfo.tokenAddress;
    completionAddress = deploymentInfo.completionAddress;
    console.log(`Loaded contract addresses from deployment file:
      - Token: ${tokenAddress}
      - Completion: ${completionAddress}`);
  } else {
    // Fallback to environment variables
    tokenAddress = process.env.TOKEN_ADDR!;
    completionAddress = process.env.COMPLETION_ADDR!;
    console.log(`Using contract addresses from environment variables:
      - Token: ${tokenAddress}
      - Completion: ${completionAddress}`);
  }
} catch (err) {
  // Final fallback
  tokenAddress = process.env.TOKEN_ADDR!;
  completionAddress = process.env.COMPLETION_ADDR!;
  console.log(`Failed to load from deployment file, using environment variables:
    - Token: ${tokenAddress}
    - Completion: ${completionAddress}`);
}

export function completionContract() {
  return new ethers.Contract(completionAddress, CompletionAbi, wallet);
}

export function tokenContract() {
  return new ethers.Contract(tokenAddress, YAPTokenAbi, wallet);
}
