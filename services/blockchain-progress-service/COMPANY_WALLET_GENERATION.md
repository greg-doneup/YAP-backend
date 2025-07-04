# YAP Company Wallet Generation Guide

## Overview

This script generates a secure company wallet for YAP Tech Inc using the same cryptographic standards as the YAP user wallet system, ensuring consistency across the platform.

## Security Features

- ✅ **BIP39 Standard**: Uses industry-standard 12-word mnemonic generation
- ✅ **HD Wallet Derivation**: Standard derivation paths for SEI and EVM wallets
- ✅ **Crypto-secure Random**: Uses Node.js crypto module for secure entropy
- ✅ **Consistent with YAP**: Same generation method as user wallets
- ✅ **Multi-blockchain**: Derives keys for both SEI and EVM networks

## Prerequisites

1. **Secure Environment**: Run this on a secure, preferably air-gapped machine
2. **Node.js**: Version 18+ installed
3. **Dependencies**: Install required packages

## Installation

```bash
# Navigate to the blockchain-progress-service directory
cd /path/to/YAP/YAP-backend/services/blockchain-progress-service

# Install dependencies
npm install

# Verify dependencies are installed
npm list bip39 ethers @cosmjs/proto-signing
```

## Available Scripts

This directory contains two main scripts for company wallet management:

### 1. `generate-company-wallet.js`
- **Purpose**: Generate a new company wallet from scratch
- **Use case**: Initial setup or wallet replacement
- **Output**: Complete wallet information including mnemonic, addresses, and private keys
- **Security**: Creates new entropy for maximum security

### 2. `derive-private-key.js` 
- **Purpose**: Derive private keys from an existing mnemonic
- **Use case**: Operational recovery, verification, or Kubernetes secret rotation
- **Output**: Private keys and addresses derived from stored mnemonic
- **Security**: Uses existing mnemonic as source of truth

## Usage

### Step 1: Generate Company Wallet

```bash
# Run the wallet generation script
node generate-company-wallet.js
```

### Step 2: Derive Private Key from Existing Mnemonic

For operational purposes when you need to recover or verify the private key:

```bash
# Interactive mode (recommended)
node derive-private-key.js

# Command line mode
node derive-private-key.js "your twelve word mnemonic phrase here"
```

### Step 3: Secure the Output

The wallet generation script will output:

1. **🔑 Company Mnemonic**: 12-word recovery phrase
   - **CRITICAL**: Write this down and store offline securely
   - This can recover all company wallets if private keys are lost

2. **🌌 SEI Wallet Details**: Address and public key for SEI network
3. **⚡ EVM Wallet Details**: Address, public key, and private key for EVM transactions
4. **🔧 Kubernetes Secret Values**: Ready-to-use configuration
5. **📋 Base64 Encoded Values**: For direct YAML integration

The private key derivation script will output:

1. **📍 Wallet Addresses**: For verification against stored addresses
2. **🔐 Private Keys**: EVM private key for Kubernetes secrets  
3. **🔧 kubectl Commands**: Ready-to-run secret creation commands
4. **📋 Base64 Values**: For YAML configuration

2. **🌌 SEI Wallet**: Address, public key, and private key for SEI network

3. **⚡ EVM Wallet**: Address, public key, and private key for Ethereum-compatible networks

4. **🔧 Kubernetes Secret Values**: Ready-to-use values for deployment

5. **📋 Base64 Encoded YAML**: Complete Kubernetes secret configuration

### Step 3: Store Information Securely

#### Offline Storage (Physical)
```
Company Mnemonic: [12 words]
- Store in bank safety deposit box
- Store in fireproof safe
- Create multiple copies in separate secure locations
```

#### Kubernetes Secrets (Digital)
```bash
# Create the blockchain secrets in your Kubernetes cluster
kubectl create secret generic blockchain-secrets \
  --from-literal=YAP_TREASURY_PRIVATE_KEY="0x..." \
  --from-literal=LEADERBOARD_CONTRACT_ADDRESS="0x..." \
  --from-literal=TOKEN_CONTRACT_ADDRESS="0x..."
```

### Step 4: Verify Generation

```bash
# Verify the generated addresses on blockchain explorers
# SEI Testnet: https://seitrace.com
# EVM Compatible: https://etherscan.io (for mainnet) or appropriate testnet explorer

# Check that addresses are valid and accessible
```

## Security Checklist

### Before Running
- [ ] Ensure you're on a secure, isolated machine
- [ ] Verify Node.js and dependencies are legitimate
- [ ] Clear terminal history before starting
- [ ] Disable network connections (air-gap) if possible

### After Running
- [ ] ✅ Mnemonic phrase written down and stored offline
- [ ] ✅ Private keys added to Kubernetes secrets
- [ ] ✅ Terminal output cleared/secured
- [ ] ✅ Script file deleted or moved to secure location
- [ ] ✅ Test wallet functionality with small amounts first
- [ ] ✅ Verify addresses match in blockchain explorers
- [ ] ✅ Backup mnemonic in multiple secure locations

### Operational Security
- [ ] ✅ Limit access to company wallet mnemonic
- [ ] ✅ Use hardware security modules (HSM) if available
- [ ] ✅ Implement key rotation procedures
- [ ] ✅ Set up monitoring for wallet activity
- [ ] ✅ Document wallet recovery procedures

## Sample Output

```
================================================================================
🏢 YAP COMPANY WALLET GENERATED SUCCESSFULLY
================================================================================

🔑 COMPANY MNEMONIC (STORE OFFLINE SECURELY):
┌─────────────────────────────────────────────────────────────────────────────┐
│ abandon ability able about above absent absorb abstract absurd abuse access │
└─────────────────────────────────────────────────────────────────────────────┘
⚠️  CRITICAL: Write this down and store it in a secure, offline location!

🌌 SEI WALLET DETAILS:
   Address:     sei1abcd1234...
   Public Key:  02abcd1234...
   Private Key: 0xabcd1234...

⚡ EVM WALLET DETAILS:
   Address:     0xabcd1234...
   Public Key:  0x04abcd1234...
   Private Key: 0xabcd1234...

🔧 KUBERNETES SECRET VALUES:
YAP_TREASURY_PRIVATE_KEY: 0xabcd1234...
```

## Troubleshooting

### Common Issues

1. **Missing Dependencies**
   ```bash
   npm install bip39 ethers @cosmjs/proto-signing
   ```

2. **Permission Errors**
   ```bash
   chmod +x generate-company-wallet.js
   ```

3. **Invalid Mnemonic Generated**
   - Re-run the script
   - Check entropy source
   - Verify BIP39 library integrity

### Validation

```javascript
// Validate generated mnemonic
const bip39 = require('bip39');
const mnemonic = "your generated mnemonic";
console.log('Valid:', bip39.validateMnemonic(mnemonic));
```

## Integration with Blockchain Service

The generated private key will be used in your blockchain service:

```typescript
// In blockchain-progress-service
const privateKey = process.env.YAP_TREASURY_PRIVATE_KEY; // From K8s secret
this.companyWallet = new ethers.Wallet(privateKey, this.provider);
```

## Recovery Procedure

If private keys are ever compromised:

1. **Access Company Mnemonic**: Retrieve from secure offline storage
2. **Re-run Generation Script**: Use the existing mnemonic
3. **Update Kubernetes Secrets**: Replace compromised private keys
4. **Transfer Funds**: Move assets to new wallet if necessary
5. **Update Documentation**: Record incident and resolution

## Best Practices

1. **Multi-Signature**: Consider implementing multi-sig for high-value operations
2. **Cold Storage**: Keep majority of funds in cold storage
3. **Regular Audits**: Periodically verify wallet security
4. **Access Logging**: Monitor all wallet operations
5. **Backup Testing**: Regularly test mnemonic recovery procedures

## Support

For issues with wallet generation:
1. Check this documentation
2. Verify all dependencies are correctly installed
3. Ensure you're running in a secure environment
4. Contact the development team for assistance

---

**⚠️ WARNING: The mnemonic phrase and private keys generated by this script control real cryptocurrency assets. Treat them with the same security as you would treat physical cash or bank account information.**
