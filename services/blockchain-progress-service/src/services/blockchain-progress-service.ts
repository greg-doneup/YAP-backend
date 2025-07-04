import { ethers } from 'ethers';
import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { LessonProgressBatch, LessonProgressSignature, BlockchainConfig } from '../types';

export class BlockchainProgressService {
  private provider: ethers.JsonRpcProvider;
  private companyWallet: ethers.Wallet | null = null;
  private contract: ethers.Contract | null = null;
  private isInitialized = false;

  // EIP712 domain for company batch signatures
  private readonly COMPANY_DOMAIN = {
    name: 'YAP Leaderboard Batch',
    version: '1',
    chainId: config.blockchain.chainId,
    verifyingContract: config.blockchain.contractAddress
  };

  // EIP712 type for company batch signing
  private readonly BATCH_TYPES = {
    BatchUpdate: [
      { name: 'batchId', type: 'string' },
      { name: 'timestamp', type: 'uint256' },
      { name: 'progressUpdates', type: 'ProgressUpdate[]' }
    ],
    ProgressUpdate: [
      { name: 'userId', type: 'string' },
      { name: 'lessonId', type: 'string' },
      { name: 'score', type: 'uint256' },
      { name: 'completedAt', type: 'uint256' },
      { name: 'userSignature', type: 'bytes' }
    ]
  };

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
  }

  /**
   * Initialize the blockchain service with secure key loading
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Blockchain Progress Service...');

      // Load company private key securely (never written to disk after this point)
      const privateKey = await this.loadCompanyPrivateKey();
      
      // Create wallet instance (key only exists in memory)
      this.companyWallet = new ethers.Wallet(privateKey, this.provider);
      
      // Clear the private key variable immediately
      privateKey.split('').fill('0'); // Overwrite string in memory
      
      // Initialize contract
      await this.initializeContract();
      
      this.isInitialized = true;
      logger.info('Blockchain Progress Service initialized successfully');
      
    } catch (error) {
      logger.error('Failed to initialize blockchain service:', error);
      throw error;
    }
  }

  /**
   * Securely load the company's private key from Kubernetes secret
   */
  private async loadCompanyPrivateKey(): Promise<string> {
    try {
      // Load from environment variable (populated by Kubernetes secret)
      const privateKey = process.env.YAP_TREASURY_PRIVATE_KEY;
      
      if (!privateKey) {
        throw new Error('Company wallet private key not found in environment');
      }

      // Validate key format
      if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
        throw new Error('Invalid private key format');
      }

      // Validate key is valid hex
      if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
        throw new Error('Private key contains invalid characters');
      }

      logger.info('Company private key loaded successfully');
      return privateKey;
      
    } catch (error) {
      logger.error('Failed to load company private key:', error);
      throw error;
    }
  }

  /**
   * Initialize the smart contract instance
   */
  private async initializeContract(): Promise<void> {
    try {
      // Simple ABI for leaderboard batch updates
      const abi = [
        {
          "inputs": [
            {
              "components": [
                { "name": "userId", "type": "string" },
                { "name": "lessonId", "type": "string" },
                { "name": "score", "type": "uint256" },
                { "name": "completedAt", "type": "uint256" },
                { "name": "userSignature", "type": "bytes" }
              ],
              "name": "updates",
              "type": "tuple[]"
            },
            { "name": "batchId", "type": "string" },
            { "name": "companySignature", "type": "bytes" }
          ],
          "name": "submitBatchProgress",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            { "name": "userId", "type": "string" },
            { "name": "lessonId", "type": "string" },
            { "name": "score", "type": "uint256" },
            { "name": "completedAt", "type": "uint256" },
            { "name": "signature", "type": "bytes" }
          ],
          "name": "verifyUserSignature",
          "outputs": [{ "name": "", "type": "bool" }],
          "stateMutability": "view",
          "type": "function"
        }
      ];

      this.contract = new ethers.Contract(
        config.blockchain.contractAddress,
        abi,
        this.companyWallet
      );

      logger.info('Smart contract initialized');
      
    } catch (error) {
      logger.error('Failed to initialize contract:', error);
      throw error;
    }
  }

  /**
   * Verify a user's EIP712 signature for lesson progress
   */
  async verifyUserSignature(progress: LessonProgressSignature): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        throw new Error('Service not initialized');
      }

      // EIP712 domain for user signatures
      const userDomain = {
        name: 'YAP Lesson Progress',
        version: '1',
        chainId: config.blockchain.chainId,
        verifyingContract: config.blockchain.contractAddress
      };

      // EIP712 types for user signatures
      const types = {
        LessonProgress: [
          { name: 'userId', type: 'string' },
          { name: 'lessonId', type: 'string' },
          { name: 'accuracyScore', type: 'uint256' },
          { name: 'completionTimestamp', type: 'uint256' },
          { name: 'nonce', type: 'string' }
        ]
      };

      // Reconstruct the message that was signed
      const message = {
        userId: progress.userId,
        lessonId: progress.lessonId,
        accuracyScore: progress.accuracyScore,
        completionTimestamp: progress.completionTimestamp,
        nonce: progress.nonce
      };

      // Verify the signature
      if (!progress.signature) {
        logger.warn(`No signature provided for user ${progress.userId}, lesson ${progress.lessonId}`);
        return false;
      }

      const recoveredAddress = ethers.verifyTypedData(
        userDomain,
        types,
        message,
        progress.signature
      );

      // Check if recovered address matches the expected user wallet
      const isValid = recoveredAddress.toLowerCase() === progress.walletAddress.toLowerCase();
      
      if (isValid) {
        logger.info(`Valid signature verified for user ${progress.userId}, lesson ${progress.lessonId}`);
      } else {
        logger.warn(`Invalid signature for user ${progress.userId}, lesson ${progress.lessonId}`);
      }

      return isValid;
      
    } catch (error) {
      logger.error('Error verifying user signature:', error);
      return false;
    }
  }

  /**
   * Sign a batch of progress updates with company signature
   */
  async signBatch(batch: LessonProgressBatch): Promise<string> {
    try {
      if (!this.isInitialized || !this.companyWallet) {
        throw new Error('Service not initialized or wallet not available');
      }

      // Prepare batch message for signing
      const batchMessage = {
        batchId: batch.batchId,
        timestamp: Math.floor(batch.createdAt.getTime() / 1000),
        progressUpdates: batch.progressUpdates.map((update: any) => ({
          userId: update.userId,
          lessonId: update.lessonId,
          score: update.score,
          completedAt: Math.floor(update.completedAt.getTime() / 1000),
          userSignature: update.signature
        }))
      };

      // Sign with EIP712
      const signature = await this.companyWallet.signTypedData(
        this.COMPANY_DOMAIN,
        this.BATCH_TYPES,
        batchMessage
      );

      logger.info(`Batch ${batch.batchId} signed successfully`);
      return signature;
      
    } catch (error) {
      logger.error('Error signing batch:', error);
      throw error;
    }
  }

  /**
   * Submit a signed batch to the blockchain
   */
  async submitBatch(batch: LessonProgressBatch, companySignature: string): Promise<string> {
    try {
      if (!this.isInitialized || !this.contract) {
        throw new Error('Service not initialized or contract not available');
      }

      logger.info(`Submitting batch ${batch.batchId} with ${batch.progressUpdates.length} updates to blockchain`);

      // Prepare contract call data
      const updates = batch.progressUpdates.map((update: any) => [
        update.userId,
        update.lessonId,
        update.score,
        Math.floor(update.completedAt.getTime() / 1000),
        update.signature
      ]);

      // Estimate gas
      const gasEstimate = await this.contract.submitBatchProgress.estimateGas(
        updates,
        batch.batchId,
        companySignature
      );

      // Add 20% gas buffer
      const gasLimit = gasEstimate * 120n / 100n;

      // Submit transaction
      const tx = await this.contract.submitBatchProgress(
        updates,
        batch.batchId,
        companySignature,
        { gasLimit }
      );

      logger.info(`Batch ${batch.batchId} submitted. Transaction hash: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        logger.info(`Batch ${batch.batchId} confirmed on blockchain. Block: ${receipt.blockNumber}`);
        return tx.hash;
      } else {
        throw new Error(`Transaction failed. Hash: ${tx.hash}`);
      }
      
    } catch (error) {
      logger.error(`Error submitting batch ${batch.batchId}:`, error);
      throw error;
    }
  }

  /**
   * Get the current gas price for transaction fee estimation
   */
  async getGasPrice(): Promise<bigint> {
    try {
      const feeData = await this.provider.getFeeData();
      return feeData.gasPrice || 0n;
    } catch (error) {
      logger.error('Error getting gas price:', error);
      throw error;
    }
  }

  /**
   * Get the company wallet's current balance
   */
  async getCompanyBalance(): Promise<string> {
    try {
      if (!this.companyWallet) {
        throw new Error('Company wallet not initialized');
      }

      const balance = await this.provider.getBalance(this.companyWallet.address);
      return ethers.formatEther(balance);
      
    } catch (error) {
      logger.error('Error getting company balance:', error);
      throw error;
    }
  }

  /**
   * Get the company wallet address (for monitoring/logging)
   */
  getCompanyAddress(): string {
    if (!this.companyWallet) {
      throw new Error('Company wallet not initialized');
    }
    return this.companyWallet.address;
  }

  /**
   * Health check - verify blockchain connectivity
   */
  async healthCheck(): Promise<{ status: string; blockNumber?: number; balance?: string }> {
    try {
      if (!this.isInitialized) {
        return { status: 'not_initialized' };
      }

      const blockNumber = await this.provider.getBlockNumber();
      const balance = await this.getCompanyBalance();

      return {
        status: 'healthy',
        blockNumber,
        balance
      };
      
    } catch (error) {
      logger.error('Blockchain health check failed:', error);
      return { status: 'unhealthy' };
    }
  }
}
