#!/usr/bin/env node

/**
 * YAP Company Wallet Generation Script
 * 
 * This script generates a company wallet using the same cryptographic standards
 * as the YAP user wallet system to ensure consistency across the platform.
 * 
 * Usage:
 *   node generate-company-wallet.js
 * 
 * Output:
 *   - Company mnemonic (12 words) - STORE OFFLINE SECURELY
 *   - SEI wallet address and private key
 *   - EVM wallet address and private key
 *   - Kubernetes secret values
 * 
 * Security:
 *   - Uses BIP39 standard for mnemonic generation
 *   - Derives keys using standard HD wallet paths
 *   - Private keys are only displayed once
 */

const bip39 = require('bip39');
const { ethers } = require('ethers');
const { DirectSecp256k1HdWallet, makeCosmoshubPath } = require('@cosmjs/proto-signing');
const crypto = require('crypto');

// Standard derivation paths
const DERIVATION_PATHS = {
  ethereum: "m/44'/60'/0'/0/0"
};

/**
 * Generate a secure BIP39 mnemonic
 */
function generateSecureMnemonic() {
  console.log('🔐 Generating secure 12-word BIP39 mnemonic...');
  
  // Generate 128 bits of entropy for 12-word mnemonic
  const entropy = crypto.randomBytes(16);
  const mnemonic = bip39.entropyToMnemonic(entropy);
  
  // Validate the generated mnemonic
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Generated mnemonic is invalid');
  }
  
  console.log('✅ Secure mnemonic generated successfully');
  return mnemonic;
}

/**
 * Derive SEI (Cosmos) wallet from mnemonic
 */
async function deriveSeiWallet(mnemonic) {
  console.log('🌌 Deriving SEI wallet...');
  
  try {
    // Create HD wallet from mnemonic using the same approach as auth-utils
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: 'sei',
      hdPaths: [makeCosmoshubPath(0)]  // Use account 0, same as auth-utils
    });
    
    // Get accounts
    const accounts = await wallet.getAccounts();
    const account = accounts[0];
    
    // Note: SEI private key extraction requires additional methods
    // For now, we focus on the EVM private key which is needed for the blockchain service
    console.log('✅ SEI wallet derived successfully');
    
    return {
      address: account.address,
      publicKey: Buffer.from(account.pubkey).toString('hex'),
      privateKey: '(SEI private key extraction requires specialized methods - not needed for EVM transactions)'
    };
  } catch (error) {
    console.error('❌ Error deriving SEI wallet:', error);
    throw error;
  }
}

/**
 * Derive EVM wallet from mnemonic
 */
function deriveEvmWallet(mnemonic) {
  console.log('⚡ Deriving EVM wallet...');
  
  try {
    // Create HD wallet from mnemonic
    const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, '', DERIVATION_PATHS.ethereum);
    
    console.log('✅ EVM wallet derived successfully');
    
    return {
      address: hdNode.address,
      publicKey: hdNode.publicKey,
      privateKey: hdNode.privateKey
    };
  } catch (error) {
    console.error('❌ Error deriving EVM wallet:', error);
    throw error;
  }
}

/**
 * Display wallet information securely
 */
function displayWalletInfo(mnemonic, seiWallet, evmWallet) {
  console.log('\n' + '='.repeat(80));
  console.log('🏢 YAP COMPANY WALLET GENERATED SUCCESSFULLY');
  console.log('='.repeat(80));
  
  // Mnemonic (most important to store offline)
  console.log('\n🔑 COMPANY MNEMONIC (STORE OFFLINE SECURELY):');
  console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log(`│ ${mnemonic.padEnd(75)} │`);
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  console.log('⚠️  CRITICAL: Write this down and store it in a secure, offline location!');
  console.log('⚠️  This mnemonic can recover ALL company wallets if private keys are lost.');
  
  // SEI Wallet
  console.log('\n🌌 SEI WALLET DETAILS:');
  console.log(`   Address:     ${seiWallet.address}`);
  console.log(`   Public Key:  ${seiWallet.publicKey}`);
  console.log(`   Private Key: ${seiWallet.privateKey}`);
  
  // EVM Wallet
  console.log('\n⚡ EVM WALLET DETAILS:');
  console.log(`   Address:     ${evmWallet.address}`);
  console.log(`   Public Key:  ${evmWallet.publicKey}`);
  console.log(`   Private Key: ${evmWallet.privateKey}`);
  
  // Kubernetes Secrets
  console.log('\n🔧 KUBERNETES SECRET VALUES:');
  console.log('─────────────────────────────────────────────────────────────────────────────');
  console.log('Add these to your blockchain-secrets in Kubernetes:');
  console.log('');
  console.log('YAP_TREASURY_PRIVATE_KEY:');
  console.log(`  ${evmWallet.privateKey}`);
  console.log('');
  console.log('LEADERBOARD_CONTRACT_ADDRESS:');
  console.log('  <your-deployed-contract-address>');
  console.log('');
  console.log('TOKEN_CONTRACT_ADDRESS:');
  console.log('  <your-token-contract-address>');
  
  // Base64 encoded values for direct K8s use
  console.log('\n📋 BASE64 ENCODED FOR KUBERNETES YAML:');
  console.log('─────────────────────────────────────────────────────────────────────────────');
  console.log('```yaml');
  console.log('apiVersion: v1');
  console.log('kind: Secret');
  console.log('metadata:');
  console.log('  name: blockchain-secrets');
  console.log('type: Opaque');
  console.log('data:');
  console.log(`  YAP_TREASURY_PRIVATE_KEY: ${Buffer.from(evmWallet.privateKey).toString('base64')}`);
  console.log(`  LEADERBOARD_CONTRACT_ADDRESS: ${Buffer.from('0x...').toString('base64')} # Replace with actual`);
  console.log(`  TOKEN_CONTRACT_ADDRESS: ${Buffer.from('0x...').toString('base64')} # Replace with actual`);
  console.log('```');
  
  // Security reminders
  console.log('\n🛡️  SECURITY CHECKLIST:');
  console.log('─────────────────────────────────────────────────────────────────────────────');
  console.log('□ Mnemonic phrase written down and stored offline');
  console.log('□ Private keys added to Kubernetes secrets');
  console.log('□ This terminal output cleared/secured');
  console.log('□ Script file deleted or secured');
  console.log('□ Test wallet generation with small amounts first');
  console.log('□ Verify addresses match in your blockchain explorer');
  
  console.log('\n' + '='.repeat(80));
}

/**
 * Main execution function
 */
async function generateCompanyWallet() {
  try {
    console.log('🚀 Starting YAP Company Wallet Generation...\n');
    
    // Generate secure mnemonic
    const mnemonic = generateSecureMnemonic();
    
    // Derive wallets
    const seiWallet = await deriveSeiWallet(mnemonic);
    const evmWallet = deriveEvmWallet(mnemonic);
    
    // Display results
    displayWalletInfo(mnemonic, seiWallet, evmWallet);
    
    // Security warning
    console.log('\n⚠️  IMPORTANT: Clear this terminal output after saving the information!');
    console.log('⚠️  Consider running this on an air-gapped machine for maximum security.');
    
  } catch (error) {
    console.error('❌ Company wallet generation failed:', error);
    process.exit(1);
  }
}

// Execute the script
if (require.main === module) {
  generateCompanyWallet();
}

module.exports = {
  generateSecureMnemonic,
  deriveSeiWallet,
  deriveEvmWallet
};
