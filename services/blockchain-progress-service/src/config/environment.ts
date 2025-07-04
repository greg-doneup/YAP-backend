import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server config
  port: parseInt(process.env.PORT || '8080'),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database config
  mongoUrl: process.env.MONGO_URI || process.env.MONGODB_URL || 'mongodb://localhost:27017/yap-blockchain-progress',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // Blockchain config
  blockchain: {
    rpcUrl: process.env.SEI_EVM_RPC_URL || 'https://evm-rpc-testnet.sei-apis.com',
    chainId: parseInt(process.env.CHAIN_ID || '38284'),
    contractAddress: process.env.LEADERBOARD_CONTRACT_ADDRESS || '',
    tokenContractAddress: process.env.TOKEN_CONTRACT_ADDRESS || '',
    gasLimit: process.env.GAS_LIMIT || '500000',
    gasPrice: process.env.GAS_PRICE || '0.1', // in gwei
  },
  
  // Batch processing config
  batchIntervalMinutes: parseInt(process.env.BATCH_INTERVAL_MINUTES || '15'),
  batchSizeLimit: parseInt(process.env.BATCH_SIZE_LIMIT || '100'),
  batchRetryAttempts: parseInt(process.env.BATCH_RETRY_ATTEMPTS || '3'),
  batchRetryDelayMs: parseInt(process.env.BATCH_RETRY_DELAY_MS || '5000'),
  
  // External services
  learningServiceUrl: process.env.LEARNING_SERVICE_URL || 'http://learning-service:8080',
  profileServiceUrl: process.env.PROFILE_SERVICE_URL || 'http://offchain-profile:8080',
  
  // Security
  batchSigningKey: process.env.BATCH_SIGNING_KEY || 'dev-signing-key-change-in-production',
  
  // EIP712 Domain
  eip712Domain: {
    name: 'YAP Learning Progress',
    version: '1',
    chainId: parseInt(process.env.CHAIN_ID || '38284'),
    verifyingContract: process.env.LEADERBOARD_CONTRACT_ADDRESS || ''
  },
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // Rate limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
};

// Validation
export function validateConfig(): void {
  const required = [
    'treasuryPrivateKey',
    'leaderboardContractAddress',
    'mongoUrl'
  ];
  
  const missing = required.filter(key => !config[key as keyof typeof config]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
  
  if (config.nodeEnv === 'production' && config.batchSigningKey === 'dev-signing-key-change-in-production') {
    throw new Error('BATCH_SIGNING_KEY must be set in production');
  }
}
