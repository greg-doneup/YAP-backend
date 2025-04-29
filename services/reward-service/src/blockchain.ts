import { ethers } from "ethers";
import YapTokenAbi from "../abi/YapToken.json";
import CompletionAbi from "../abi/DailyCompletion.json";

// Simple inline logger implementation
const logger = {
  debug: (message: string, ...args: any[]) => console.debug(`[DEBUG] ${message}`, ...args),
  info: (message: string, ...args: any[]) => console.info(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args)
};

// Helper function to retry operations with exponential backoff
async function withRetry<T>(operation: () => Promise<T>, maxRetries = 3, retryDelay = 1000): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      logger.warn(`Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt - 1);
        logger.info(`Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// Create provider with network configuration
const provider = new ethers.JsonRpcProvider(process.env.EVM_RPC!, {
  chainId: Number(process.env.CHAIN_ID || 38284),
  name: "sei-testnet"
});

// Create wallet only when private key is available
let wallet: ethers.Wallet | undefined;
if (process.env.REWARD_TREASURY_PK) {
  try {
    wallet = new ethers.Wallet(process.env.REWARD_TREASURY_PK, provider);
    logger.info(`Wallet initialized with address: ${wallet.address}`);
  } catch (error: any) {
    logger.error(`Failed to initialize wallet: ${error.message}`);
  }
}

// Load contract addresses from deployments or environment variables
let tokenAddress: string;
let completionAddress: string;

try {
  // Try to load from deployments
  const fs = require('fs');
  const path = require('path');
  const completionDeploymentPath = path.join(__dirname, '../../../evm_contracts/deployments/completion.json');
  
  if (fs.existsSync(completionDeploymentPath)) {
    const deploymentInfo = JSON.parse(fs.readFileSync(completionDeploymentPath, 'utf8'));
    tokenAddress = deploymentInfo.tokenAddress;
    completionAddress = deploymentInfo.completionAddress;
    logger.info(`Loaded contract addresses from deployment file:
      - Token: ${tokenAddress}
      - Completion: ${completionAddress}`);
  } else {
    // Fallback to environment variables
    tokenAddress = process.env.TOKEN_ADDR!;
    completionAddress = process.env.COMPLETION_ADDR!;
    logger.info(`Using contract addresses from environment variables:
      - Token: ${tokenAddress}
      - Completion: ${completionAddress}`);
  }
} catch (err) {
  // Final fallback
  tokenAddress = process.env.TOKEN_ADDR!;
  completionAddress = process.env.COMPLETION_ADDR!;
  logger.warn(`Failed to load from deployment file, using environment variables:
    - Token: ${tokenAddress}
    - Completion: ${completionAddress}`);
}

// Create read-only contract instances for public queries
const readTokenContract = new ethers.Contract(tokenAddress, YapTokenAbi, provider);
const readCompletionContract = new ethers.Contract(completionAddress, CompletionAbi, provider);

// Create contract instances with wallet for transactions (if wallet available)
const tokenContract = wallet 
  ? new ethers.Contract(tokenAddress, YapTokenAbi, wallet) 
  : readTokenContract;

const completionContract = wallet 
  ? new ethers.Contract(completionAddress, CompletionAbi, wallet) 
  : readCompletionContract;

// Cache for completion status to avoid excessive blockchain queries
const completionCache = new Map<string, { lastDay: number, timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache TTL

/**
 * Check if a user has completed their daily task today
 * Uses a local cache to reduce blockchain queries
 */
export async function hasCompletedToday(userAddress: string): Promise<boolean> {
  try {
    // Check cache first
    const now = Date.now();
    const cachedValue = completionCache.get(userAddress);
    const today = Math.floor(now / 1000 / 86400); // Current UTC day
    
    // If we have a recent cache hit, use it
    if (cachedValue && (now - cachedValue.timestamp) < CACHE_TTL) {
      return cachedValue.lastDay === today;
    }
    
    // Cache miss or expired, query the blockchain with retry logic
    const lastDay = await withRetry(async () => {
      return await readCompletionContract.lastDay(userAddress);
    });
    
    // Update cache
    completionCache.set(userAddress, {
      lastDay: Number(lastDay),
      timestamp: now
    });
    
    return Number(lastDay) === today;
  } catch (error: any) {
    logger.error('Error checking completion status:', error);
    throw new Error(`Failed to check completion status: ${error.message}`);
  }
}

/**
 * Record a user's daily completion
 * This updates their point total and mintable YAP amount
 * If minting is enabled, it will also mint YAP tokens
 */
export async function recordCompletion(userAddress: string): Promise<{success: boolean, txHash?: string, error?: string}> {
  if (!wallet) {
    return {
      success: false,
      error: 'Wallet not initialized. Check private key configuration.'
    };
  }

  try {
    // First check if already completed to avoid wasting gas
    const completed = await hasCompletedToday(userAddress);
    if (completed) {
      return { 
        success: false, 
        error: 'User has already completed today' 
      };
    }
    
    // Call the complete function with explicit gas parameters
    const tx = await withRetry(async () => {
      return await completionContract.complete({
        gasLimit: 300000,  // Higher gas limit for safety
      });
    });
    
    logger.info(`Completion transaction submitted: ${tx.hash}`);
    
    // Wait for transaction confirmation
    const receipt = await tx.wait();
    
    // Update completion cache
    if (receipt.status === 1) {
      const today = Math.floor(Date.now() / 1000 / 86400);
      completionCache.set(userAddress, {
        lastDay: today,
        timestamp: Date.now()
      });
    }
    
    logger.info(`Completion transaction confirmed: ${tx.hash}, success: ${receipt.status === 1}`);
    
    return {
      success: receipt.status === 1,
      txHash: tx.hash
    };
  } catch (error: any) {
    logger.error('Error recording completion:', error);
    
    // Handle known error cases
    if (error.message.includes('insufficient funds')) {
      logger.error('Insufficient funds to pay for gas');
      return {
        success: false,
        error: 'Insufficient funds to pay for transaction gas. Please fund the treasury wallet.'
      };
    } else if (error.message.includes('already claimed')) {
      // User has already claimed today according to the smart contract
      const today = Math.floor(Date.now() / 1000 / 86400);
      completionCache.set(userAddress, {
        lastDay: today,
        timestamp: Date.now()
      });
      
      return {
        success: false,
        error: 'User has already claimed today\'s reward'
      };
    }
    
    return {
      success: false,
      error: `Failed to record completion: ${error.message || error}`
    };
  }
}

/**
 * Get user statistics from the DailyCompletion contract
 * Returns point total, mintable YAP, and total YAP minted
 */
export async function getUserStats(userAddress: string): Promise<{
  pointTotal: string,
  mintableYap: string,
  totalYapMinted: string
}> {
  try {
    const stats = await withRetry(async () => {
      return await readCompletionContract.userStats(userAddress);
    });
    
    return {
      pointTotal: stats.pointTotal.toString(),
      mintableYap: ethers.formatUnits(stats.mintableYap, 18),
      totalYapMinted: ethers.formatUnits(stats.totalYapMinted, 18)
    };
  } catch (error: any) {
    logger.error('Error getting user stats:', error);
    throw new Error(`Failed to get user stats: ${error.message}`);
  }
}

/**
 * Mint a user's accumulated YAP tokens
 * Only works if minting is enabled in the contract
 */
export async function mintAccumulatedYap(userAddress: string): Promise<{success: boolean, txHash?: string, error?: string}> {
  if (!wallet) {
    return {
      success: false,
      error: 'Wallet not initialized. Check private key configuration.'
    };
  }

  try {
    // Check if minting is enabled
    const mintingEnabled = await withRetry(async () => {
      return await readCompletionContract.mintingEnabled();
    });
    
    if (!mintingEnabled) {
      return {
        success: false,
        error: 'Minting is not yet enabled by the contract owner'
      };
    }
    
    // Check if there's anything to mint
    const userStats = await getUserStats(userAddress);
    if (parseFloat(userStats.mintableYap) === 0) {
      return {
        success: false,
        error: 'No YAP available to mint'
      };
    }
    
    // Call the mintAccumulatedYap function
    const tx = await withRetry(async () => {
      return await completionContract.mintAccumulatedYap({
        gasLimit: 250000,
      });
    });
    
    logger.info(`Mint accumulated YAP transaction submitted: ${tx.hash}`);
    
    // Wait for transaction confirmation
    const receipt = await tx.wait();
    
    logger.info(`Mint accumulated YAP transaction confirmed: ${tx.hash}, success: ${receipt.status === 1}`);
    
    return {
      success: receipt.status === 1,
      txHash: tx.hash
    };
  } catch (error: any) {
    logger.error('Error minting accumulated YAP:', error);
    
    return {
      success: false,
      error: `Failed to mint accumulated YAP: ${error.message || error}`
    };
  }
}

/**
 * Check if YAP minting is currently enabled
 */
export async function isMintingEnabled(): Promise<boolean> {
  try {
    return await withRetry(async () => {
      return await readCompletionContract.mintingEnabled();
    });
  } catch (error: any) {
    logger.error('Error checking if minting is enabled:', error);
    throw new Error(`Failed to check if minting is enabled: ${error.message}`);
  }
}

/**
 * Admin function to enable or disable YAP minting
 */
export async function setMintingEnabled(enabled: boolean): Promise<{success: boolean, txHash?: string, error?: string}> {
  if (!wallet) {
    return {
      success: false,
      error: 'Wallet not initialized. Check private key configuration.'
    };
  }

  try {
    const tx = await withRetry(async () => {
      return await completionContract.setMintingEnabled(enabled, {
        gasLimit: 100000,
      });
    });
    
    logger.info(`Set minting enabled (${enabled}) transaction submitted: ${tx.hash}`);
    
    // Wait for transaction confirmation
    const receipt = await tx.wait();
    
    logger.info(`Set minting enabled transaction confirmed: ${tx.hash}, success: ${receipt.status === 1}`);
    
    return {
      success: receipt.status === 1,
      txHash: tx.hash
    };
  } catch (error: any) {
    logger.error(`Error setting minting enabled to ${enabled}:`, error);
    
    return {
      success: false,
      error: `Failed to set minting enabled: ${error.message || error}`
    };
  }
}

/**
 * Admin function to mint tokens for a specific user
 */
export async function adminMintFor(userAddress: string): Promise<{success: boolean, txHash?: string, error?: string}> {
  if (!wallet) {
    return {
      success: false,
      error: 'Wallet not initialized. Check private key configuration.'
    };
  }

  try {
    // Check if there's anything to mint
    const userStats = await getUserStats(userAddress);
    if (parseFloat(userStats.mintableYap) === 0) {
      return {
        success: false,
        error: 'No YAP available to mint for this user'
      };
    }
    
    const tx = await withRetry(async () => {
      return await completionContract.adminMintFor(userAddress, {
        gasLimit: 250000,
      });
    });
    
    logger.info(`Admin mint for ${userAddress} transaction submitted: ${tx.hash}`);
    
    // Wait for transaction confirmation
    const receipt = await tx.wait();
    
    logger.info(`Admin mint transaction confirmed: ${tx.hash}, success: ${receipt.status === 1}`);
    
    return {
      success: receipt.status === 1,
      txHash: tx.hash
    };
  } catch (error: any) {
    logger.error(`Error admin minting for ${userAddress}:`, error);
    
    return {
      success: false,
      error: `Failed to admin mint tokens: ${error.message || error}`
    };
  }
}

/**
 * Manually mint tokens to a user (admin function)
 * This uses the direct token mint function, not the completion contract
 */
export async function mintTokens(userAddress: string, amount: string): Promise<{success: boolean, txHash?: string, error?: string}> {
  if (!wallet) {
    return {
      success: false,
      error: 'Wallet not initialized. Check private key configuration.'
    };
  }

  try {
    const amountWei = ethers.parseUnits(amount, 18); // 18 decimals for YAP token
    
    // Direct mint with higher gas limit
    const tx = await withRetry(async () => {
      return await tokenContract.mint(userAddress, amountWei, {
        gasLimit: 200000,
      });
    });
    
    logger.info(`Direct token mint transaction submitted: ${tx.hash}`);
    
    // Wait for transaction confirmation
    const receipt = await tx.wait();
    
    logger.info(`Direct token mint transaction confirmed: ${tx.hash}, success: ${receipt.status === 1}`);
    
    return {
      success: receipt.status === 1,
      txHash: tx.hash
    };
  } catch (error: any) {
    logger.error('Error minting tokens directly:', error);
    
    return {
      success: false,
      error: `Failed to mint tokens: ${error.message || error}`
    };
  }
}

/**
 * Get user token balance (actual minted tokens)
 */
export async function getBalance(userAddress: string): Promise<string> {
  try {
    const balance = await withRetry(async () => {
      return await readTokenContract.balanceOf(userAddress);
    });
    return ethers.formatUnits(balance, 18); // 18 decimals for YAP token
  } catch (error: any) {
    logger.error('Error getting balance:', error);
    throw new Error(`Failed to get balance: ${error.message}`);
  }
}

/**
 * Get token info including name, symbol, decimals
 */
export async function getTokenInfo(): Promise<{name: string, symbol: string, decimals: number}> {
  try {
    const [name, symbol, decimals] = await Promise.all([
      withRetry(() => readTokenContract.name()),
      withRetry(() => readTokenContract.symbol()),
      withRetry(() => readTokenContract.decimals())
    ]);
    
    return { name, symbol, decimals };
  } catch (error: any) {
    logger.error('Error getting token info:', error);
    throw new Error(`Failed to get token info: ${error.message}`);
  }
}

/**
 * Get daily reward amount
 */
export async function getDailyReward(): Promise<string> {
  try {
    const reward = await withRetry(async () => {
      return await readCompletionContract.dailyReward();
    });
    return ethers.formatUnits(reward, 18); // 18 decimals for YAP token
  } catch (error: any) {
    logger.error('Error getting daily reward:', error);
    throw new Error(`Failed to get daily reward: ${error.message}`);
  }
}

/**
 * Set daily reward amount (admin only)
 */
export async function setDailyReward(amount: string): Promise<{success: boolean, txHash?: string, error?: string}> {
  if (!wallet) {
    return {
      success: false,
      error: 'Wallet not initialized. Check private key configuration.'
    };
  }

  try {
    const amountWei = ethers.parseUnits(amount, 18); // 18 decimals for YAP token
    
    const tx = await withRetry(async () => {
      return await completionContract.setReward(amountWei, {
        gasLimit: 100000,
      });
    });
    
    logger.info(`Set reward transaction submitted: ${tx.hash}`);
    
    // Wait for transaction confirmation
    const receipt = await tx.wait();
    
    logger.info(`Set reward transaction confirmed: ${tx.hash}, success: ${receipt.status === 1}`);
    
    return {
      success: receipt.status === 1,
      txHash: tx.hash
    };
  } catch (error: any) {
    logger.error('Error setting daily reward:', error);
    
    return {
      success: false,
      error: `Failed to set daily reward: ${error.message || error}`
    };
  }
}

/**
 * Verify that the contracts are properly connected and functioning
 * Returns diagnostic information
 */
export async function checkContractHealth(): Promise<{
  connected: boolean,
  tokenInfo?: { name: string, symbol: string, decimals: number },
  dailyReward?: string,
  mintingEnabled?: boolean,
  walletAddress?: string,
  error?: string
}> {
  try {
    // Check provider connection
    await withRetry(async () => {
      return await provider.getBlockNumber();
    });
    
    // Check token contract
    const tokenInfo = await getTokenInfo();
    
    // Check completion contract
    const dailyReward = await getDailyReward();
    
    // Check if minting is enabled
    const mintingEnabled = await isMintingEnabled();
    
    return {
      connected: true,
      tokenInfo,
      dailyReward,
      mintingEnabled,
      walletAddress: wallet?.address
    };
  } catch (error: any) {
    logger.error('Contract health check failed:', error);
    return {
      connected: false,
      error: error.message
    };
  }
}