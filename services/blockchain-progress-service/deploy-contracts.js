#!/usr/bin/env node

/**
 * YAP Contract Deployment Script
 * 
 * This script deploys all YAP contracts using the company treasury wallet.
 * The same wallet that will be used for blockchain progress reporting.
 * 
 * Usage:
 *   cd YAP-backend/evm_contracts
 *   node ../services/blockchain-progress-service/deploy-contracts.js
 * 
 * Prerequisites:
 *   1. Generate company wallet using generate-company-wallet.js
 *   2. Fund the company wallet with SEI tokens for gas fees
 *   3. Set YAP_TREASURY_PRIVATE_KEY environment variable
 * 
 * Deployed contracts:
 *   - YAPToken (ERC-20 token)
 *   - VestingBucket (vesting logic)
 *   - DailyCompletion (lesson progress/leaderboard)
 *   - Additional ecosystem contracts
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Configuration
const NETWORK_CONFIG = {
  rpcUrl: 'https://evm-rpc-testnet.sei-apis.com',
  chainId: 1328,
  name: 'SEI EVM Testnet'
};

// Contract artifacts paths (relative to evm_contracts directory)
const ARTIFACTS_DIR = './artifacts/contracts';

/**
 * Load contract artifacts
 */
function loadContractArtifact(contractName, fileName = null) {
  const file = fileName || `${contractName}.sol`;
  const artifactPath = path.join(ARTIFACTS_DIR, file, `${contractName}.json`);
  
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Contract artifact not found: ${artifactPath}`);
  }
  
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

/**
 * Deploy a contract
 */
async function deployContract(wallet, contractName, constructorArgs = [], fileName = null) {
  console.log(`\n📋 Deploying ${contractName}...`);
  
  try {
    // Load contract artifact
    const artifact = loadContractArtifact(contractName, fileName);
    
    // Create contract factory
    const contractFactory = new ethers.ContractFactory(
      artifact.abi,
      artifact.bytecode,
      wallet
    );
    
    // Estimate gas
    const deployTx = await contractFactory.getDeployTransaction(...constructorArgs);
    const gasEstimate = await wallet.estimateGas(deployTx);
    console.log(`   Gas estimate: ${gasEstimate.toString()}`);
    
    // Deploy contract
    const contract = await contractFactory.deploy(...constructorArgs);
    console.log(`   Transaction hash: ${contract.deploymentTransaction().hash}`);
    
    // Wait for deployment
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    
    console.log(`✅ ${contractName} deployed at: ${address}`);
    
    return contract;
    
  } catch (error) {
    console.error(`❌ Failed to deploy ${contractName}:`, error);
    throw error;
  }
}

/**
 * Setup contract roles and permissions
 */
async function setupContractRoles(contracts, deployerAddress) {
  console.log('\n🔐 Setting up contract roles and permissions...');
  
  const { yapToken, vestingBucket, dailyCompletion } = contracts;
  
  try {
    // Grant MINTER_ROLE to DailyCompletion contract
    console.log('   Granting MINTER_ROLE to DailyCompletion...');
    const MINTER_ROLE = await yapToken.MINTER_ROLE();
    await yapToken.grantRole(MINTER_ROLE, await dailyCompletion.getAddress());
    console.log('✅ MINTER_ROLE granted to DailyCompletion');
    
    // Grant BACKEND_ROLE to deployer (will be transferred to backend service)
    console.log('   Granting BACKEND_ROLE to deployer...');
    const BACKEND_ROLE = await dailyCompletion.BACKEND_ROLE();
    await dailyCompletion.grantRole(BACKEND_ROLE, deployerAddress);
    console.log('✅ BACKEND_ROLE granted to deployer');
    
    // Connect YAPToken to VestingBucket
    console.log('   Connecting YAPToken to VestingBucket...');
    await yapToken.setVestingBucket(await vestingBucket.getAddress());
    console.log('✅ VestingBucket connected to YAPToken');
    
  } catch (error) {
    console.error('❌ Failed to setup contract roles:', error);
    throw error;
  }
}

/**
 * Generate Kubernetes secret values
 */
function generateKubernetesSecrets(contractAddresses, batchSigningKey) {
  console.log('\n🔧 Kubernetes Secret Configuration:');
  console.log('─────────────────────────────────────────────────────────────────────────────');
  
  // Base64 encode the addresses
  const tokenAddressB64 = Buffer.from(contractAddresses.yapToken).toString('base64');
  const leaderboardAddressB64 = Buffer.from(contractAddresses.dailyCompletion).toString('base64');
  const batchKeyB64 = Buffer.from(batchSigningKey).toString('base64');
  
  console.log('Update blockchain-progress-service.yaml with these values:');
  console.log('');
  console.log('```yaml');
  console.log('data:');
  console.log('  # YAP_TREASURY_PRIVATE_KEY: (already set from wallet generation)');
  console.log(`  TOKEN_CONTRACT_ADDRESS: "${tokenAddressB64}"`);
  console.log(`  LEADERBOARD_CONTRACT_ADDRESS: "${leaderboardAddressB64}"`);
  console.log(`  BATCH_SIGNING_KEY: "${batchKeyB64}"`);
  console.log('```');
  console.log('');
  
  // kubectl command
  console.log('Or use kubectl to update the secret:');
  console.log('');
  console.log('```bash');
  console.log('kubectl patch secret blockchain-secrets \\');
  console.log(`  --patch='{"data":{"TOKEN_CONTRACT_ADDRESS":"${tokenAddressB64}","LEADERBOARD_CONTRACT_ADDRESS":"${leaderboardAddressB64}","BATCH_SIGNING_KEY":"${batchKeyB64}"}}' \\`);
  console.log('  --namespace=yap-backend');
  console.log('```');
}

/**
 * Main deployment function
 */
async function deployYAPContracts() {
  console.log('🚀 Starting YAP Contract Deployment...\n');
  
  try {
    // Load private key
    const privateKey = process.env.YAP_TREASURY_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('YAP_TREASURY_PRIVATE_KEY environment variable not set');
    }
    
    console.log('🔑 Company wallet private key loaded');
    
    // Setup provider and wallet
    const provider = new ethers.JsonRpcProvider(NETWORK_CONFIG.rpcUrl, {
      chainId: NETWORK_CONFIG.chainId,
      name: NETWORK_CONFIG.name
    });
    
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`👛 Company wallet address: ${wallet.address}`);
    
    // Check wallet balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Wallet balance: ${ethers.formatEther(balance)} SEI`);
    
    if (balance === 0n) {
      console.warn('⚠️  WARNING: Wallet has no SEI tokens for gas fees!');
      console.warn('   Fund this address before deploying contracts.');
    }
    
    // Deploy contracts in order
    console.log('\n📦 Deploying contracts...');
    
    // 1. YapToken (note: contract name is YAPToken but file is YapToken.sol)
    const yapToken = await deployContract(wallet, 'YapToken');
    
    // 2. VestingBucket  
    const vestingBucket = await deployContract(
      wallet, 
      'VestingBucket', 
      [await yapToken.getAddress()],
      'vesting/VestingBucket.sol'
    );
    
    // 3. DailyCompletion (leaderboard contract)
    const dailyCompletion = await deployContract(
      wallet,
      'DailyCompletion', 
      [await yapToken.getAddress(), await vestingBucket.getAddress()]
    );
    
    // Setup roles and permissions
    await setupContractRoles({
      yapToken,
      vestingBucket, 
      dailyCompletion
    }, wallet.address);
    
    // Generate batch signing key
    const batchSigningKey = ethers.hexlify(ethers.randomBytes(32));
    console.log(`\n🔐 Generated batch signing key: ${batchSigningKey}`);
    
    // Summary
    const contractAddresses = {
      yapToken: await yapToken.getAddress(),
      vestingBucket: await vestingBucket.getAddress(),
      dailyCompletion: await dailyCompletion.getAddress()
    };
    
    console.log('\n' + '='.repeat(80));
    console.log('🎉 YAP CONTRACT DEPLOYMENT COMPLETE');
    console.log('='.repeat(80));
    console.log('📋 Contract Addresses:');
    console.log(`   YAP Token:        ${contractAddresses.yapToken}`);
    console.log(`   Vesting Bucket:   ${contractAddresses.vestingBucket}`);
    console.log(`   Daily Completion: ${contractAddresses.dailyCompletion}`);
    console.log(`   Deployer:         ${wallet.address}`);
    
    // Generate Kubernetes configuration
    generateKubernetesSecrets(contractAddresses, batchSigningKey);
    
    console.log('\n✅ Deployment completed successfully!');
    console.log('✅ Update your Kubernetes secrets with the values above');
    console.log('✅ Deploy blockchain-progress-service to start processing batches');
    
  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
    process.exit(1);
  }
}

// Execute deployment
if (require.main === module) {
  deployYAPContracts();
}

module.exports = {
  deployYAPContracts,
  deployContract,
  loadContractArtifact
};
