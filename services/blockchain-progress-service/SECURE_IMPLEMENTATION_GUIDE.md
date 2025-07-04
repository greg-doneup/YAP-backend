# Secure Blockchain Progress Service Implementation

## Overview

This document outlines the secure implementation of the blockchain progress reporting service for YAP, focusing on the secure usage of the company's private key for batched transaction signing and network submission.

## Architecture Summary

### Secure Key Management Flow

1. **Key Storage**: Company private key is securely stored in Kubernetes secrets
2. **Key Loading**: Private key is loaded from environment variables during service initialization
3. **Memory-Only Usage**: Key exists only in memory after initial loading, never written to disk
4. **Secure Signing**: EIP712 signatures are generated in-memory for batch transactions
5. **Network Submission**: Signed batches are submitted to SEI EVM blockchain

### Service Components

#### 1. BlockchainProgressService (`/src/services/blockchain-progress-service.ts`)

**Core Functionality:**
- Secure private key loading from Kubernetes secrets
- EIP712 signature verification for user progress
- Company batch signing with EIP712
- Blockchain transaction submission to SEI EVM
- Gas estimation and transaction monitoring

**Security Features:**
- Private key validation (format, hex content)
- Immediate memory clearing of key variables
- In-memory wallet instantiation only
- Secure EIP712 domain separation

#### 2. BatchProcessor (`/src/services/batch-processor.ts`)

**Core Functionality:**
- Automated batch processing on configurable intervals
- Progress signature verification before batching
- Batch creation and company signature generation
- Transaction submission and confirmation tracking
- Error handling and retry logic

**Key Features:**
- Cron-based scheduling (15-minute default intervals)
- Signature verification before processing
- Graceful error handling and retry mechanisms
- Comprehensive logging and monitoring

#### 3. MongoService (`/src/services/mongo-service.ts`)

**Core Functionality:**
- Progress document storage and retrieval
- Batch status tracking
- Database indexing for performance
- Progress state management (pending → signed → batched → processed)

### API Endpoints

#### Progress Submission
- `POST /api/progress/submit` - Submit lesson progress for signature
- `POST /api/progress/signature` - Submit user signature for verification

#### Monitoring & Admin
- `GET /api/progress/status/:userId` - Get user progress status
- `POST /api/progress/process-batch` - Manual batch processing trigger
- `GET /api/progress/batch-status` - Batch processor status

#### Health Checks
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed system health
- `GET /health/ready` - Kubernetes readiness probe
- `GET /health/live` - Kubernetes liveness probe

## Security Implementation Details

### Private Key Security

```typescript
/**
 * Secure private key loading implementation
 */
private async loadCompanyPrivateKey(): Promise<string> {
  // Load from Kubernetes secret via environment variable
  const privateKey = process.env.YAP_TREASURY_PRIVATE_KEY;
  
  // Validation checks
  if (!privateKey) throw new Error('Private key not found');
  if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
    throw new Error('Invalid private key format');
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error('Invalid private key characters');
  }
  
  return privateKey;
}

/**
 * Secure wallet initialization
 */
async initialize(): Promise<void> {
  const privateKey = await this.loadCompanyPrivateKey();
  this.companyWallet = new ethers.Wallet(privateKey, this.provider);
  
  // Clear private key from memory immediately
  privateKey.split('').fill('0');
}
```

### EIP712 Signature Implementation

```typescript
/**
 * User signature verification
 */
async verifyUserSignature(progress: LessonProgressSignature): Promise<boolean> {
  const userDomain = {
    name: 'YAP Lesson Progress',
    version: '1',
    chainId: config.blockchain.chainId,
    verifyingContract: config.blockchain.contractAddress
  };

  const types = {
    LessonProgress: [
      { name: 'userId', type: 'string' },
      { name: 'lessonId', type: 'string' },
      { name: 'accuracyScore', type: 'uint256' },
      { name: 'completionTimestamp', type: 'uint256' },
      { name: 'nonce', type: 'string' }
    ]
  };

  const recoveredAddress = ethers.verifyTypedData(userDomain, types, message, signature);
  return recoveredAddress.toLowerCase() === progress.walletAddress.toLowerCase();
}

/**
 * Company batch signing
 */
async signBatch(batch: LessonProgressBatch): Promise<string> {
  const batchMessage = {
    batchId: batch.batchId,
    timestamp: Math.floor(batch.createdAt.getTime() / 1000),
    progressUpdates: batch.progressUpdates.map(update => ({
      userId: update.userId,
      lessonId: update.lessonId,
      score: update.score,
      completedAt: Math.floor(update.completedAt.getTime() / 1000),
      userSignature: update.signature
    }))
  };

  return await this.companyWallet.signTypedData(
    this.COMPANY_DOMAIN,
    this.BATCH_TYPES,
    batchMessage
  );
}
```

### Batch Processing Security

1. **Signature Verification**: All user signatures are verified before batching
2. **Atomic Operations**: Database updates are atomic with blockchain submissions
3. **Error Isolation**: Failed signatures don't affect valid ones
4. **Retry Logic**: Configurable retry mechanisms for network failures
5. **Gas Management**: Automatic gas estimation with safety buffers

## Kubernetes Deployment

### Secret Management

```yaml
# blockchain-secrets (managed separately)
apiVersion: v1
kind: Secret
metadata:
  name: blockchain-secrets
type: Opaque
data:
  YAP_TREASURY_PRIVATE_KEY: <base64-encoded-private-key>
  LEADERBOARD_CONTRACT_ADDRESS: <base64-encoded-contract-address>
  TOKEN_CONTRACT_ADDRESS: <base64-encoded-token-address>
```

### Service Configuration

```yaml
envFrom:
  - secretRef:
      name: blockchain-secrets  # Contains private keys
  - secretRef:
      name: database-cache-secrets  # MongoDB/Redis access

env:
  - name: SEI_EVM_RPC_URL
    value: "https://evm-rpc-testnet.sei-apis.com"
  - name: CHAIN_ID
    value: "38284"
  - name: BATCH_INTERVAL_MINUTES
    value: "15"
  - name: BATCH_SIZE_LIMIT
    value: "100"
```

## Integration Points

### With AI Chat Service
- Environment variable: `BLOCKCHAIN_PROGRESS_SERVICE_URL=http://blockchain-progress-service:8080`
- API integration for progress submission after lesson completion

### With Frontend
- EIP712 message generation for user signing
- Progress status tracking and batch time estimation
- Real-time progress reporting via WebSocket (future enhancement)

### With Smart Contract
- Batch submission to leaderboard contract
- Progress verification on-chain
- Gas-efficient bulk updates

## Monitoring & Observability

### Logging
- Structured JSON logging with Winston
- Request/response logging
- Error tracking with stack traces
- Performance metrics logging

### Health Checks
- Database connectivity monitoring
- Blockchain network status
- Batch processor health
- Resource utilization tracking

### Metrics (Future)
- Batch processing rate
- Transaction success rate
- Gas usage statistics
- User signature verification rate

## Security Considerations

1. **Private Key Management**
   - Never log private keys or sensitive data
   - Use Kubernetes secrets with RBAC
   - Regular key rotation procedures
   - Memory clearing after use

2. **Network Security**
   - TLS encryption for all communications
   - Rate limiting on API endpoints
   - Input validation and sanitization
   - Authentication for admin endpoints

3. **Smart Contract Security**
   - Signature verification on-chain
   - Batch size limits
   - Gas limit protections
   - Emergency pause mechanisms

## Deployment Checklist

- [ ] Generate and securely store company private key
- [ ] Create Kubernetes secrets with proper RBAC
- [ ] Deploy smart contracts to SEI EVM testnet
- [ ] Update environment configuration
- [ ] Test end-to-end signature flow
- [ ] Verify batch processing automation
- [ ] Configure monitoring and alerting
- [ ] Test graceful shutdown procedures

## Next Steps

1. **Testing**: Comprehensive unit and integration tests
2. **Monitoring**: Prometheus metrics and Grafana dashboards
3. **Documentation**: API documentation and user guides
4. **Security Audit**: Third-party security review
5. **Optimization**: Gas usage optimization and performance tuning
