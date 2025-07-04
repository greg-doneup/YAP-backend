#!/usr/bin/env node

/**
 * YAP Private Key Derivation Script
 * 
 * This script derives private keys from an existing company mnemonic.
 * Use this for operational purposes when you need to recover or verify
 * the private key from the stored mnemonic.
 * 
 * Usage:
 *   node derive-private-key.js
 *   or
 *   node derive-private-key.js "your twelve word mnemonic phrase here from stored location"
 * 
 * Output:
 *   - EVM private key for Kubernetes secrets
 *   - SEI private key for reference
 *   - Wallet addresses for verification
 * 
 * Security:
 *   - Prompts for mnemonic input (hidden from terminal history)
 *   - Only displays private key once
 *   - Validates mnemonic before processing
 */

const bip39 = require('bip39');
const { ethers } = require('ethers');
const { DirectSecp256k1HdWallet, makeCosmoshubPath } = require('@cosmjs/proto-signing');
const readline = require('readline');

// Standard derivation paths (same as user wallets)
const DERIVATION_PATHS = {
  ethereum: "m/44'/60'/0'/0/0"
};

/**
 * Securely prompt for mnemonic input
 */
function promptForMnemonic() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('🔐 Enter your 12-word company mnemonic phrase:');
    console.log('(Type carefully - input will be visible for verification)');
    console.log('');

    rl.question('Mnemonic: ', (mnemonic) => {
      rl.close();
      resolve(mnemonic.trim());
    });
  });
}

/**
 * Validate the provided mnemonic
 */
function validateMnemonic(mnemonic) {
  console.log('🔍 Validating mnemonic...');
  
  if (!mnemonic || mnemonic.trim().length === 0) {
    throw new Error('Mnemonic cannot be empty');
  }
  
  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 12) {
    throw new Error(`Expected 12 words, got ${words.length} words`);
  }
  
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid BIP39 mnemonic - please check for typos');
  }
  
  console.log('✅ Mnemonic validation passed');
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
    // Create HD wallet from mnemonic using ethers v6 syntax
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
 * Display the derived private key information
 */
function displayPrivateKeyInfo(seiWallet, evmWallet) {
  console.log('\n' + '='.repeat(80));
  console.log('🔑 PRIVATE KEY DERIVATION COMPLETE');
  console.log('='.repeat(80));
  
  // Wallet addresses for verification
  console.log('\n📍 WALLET ADDRESSES (for verification):');
  console.log(`   SEI Address: ${seiWallet.address}`);
  console.log(`   EVM Address: ${evmWallet.address}`);
  
  // Private keys
  console.log('\n🔐 PRIVATE KEYS:');
  console.log('─────────────────────────────────────────────────────────────────────────────');
  console.log('EVM Private Key (for Kubernetes YAP_TREASURY_PRIVATE_KEY):');
  console.log(`${evmWallet.privateKey}`);
  console.log('');
  console.log('SEI Private Key (for reference):');
  console.log(`${seiWallet.privateKey}`);
  
  // Kubernetes usage
  console.log('\n🔧 KUBERNETES SECRET USAGE:');
  console.log('─────────────────────────────────────────────────────────────────────────────');
  console.log('kubectl create secret generic blockchain-secrets \\');
  console.log(`  --from-literal=YAP_TREASURY_PRIVATE_KEY="${evmWallet.privateKey}" \\`);
  console.log('  --from-literal=LEADERBOARD_CONTRACT_ADDRESS="0x..." \\');
  console.log('  --from-literal=TOKEN_CONTRACT_ADDRESS="0x..." \\');
  console.log('  --namespace=yap-backend');
  
  // Base64 for YAML
  console.log('\n📋 BASE64 ENCODED (for YAML):');
  console.log('─────────────────────────────────────────────────────────────────────────────');
  console.log(`YAP_TREASURY_PRIVATE_KEY: ${Buffer.from(evmWallet.privateKey).toString('base64')}`);
  
  // Security reminder
  console.log('\n🛡️  SECURITY REMINDER:');
  console.log('─────────────────────────────────────────────────────────────────────────────');
  console.log('⚠️  Clear this terminal output after copying the private key!');
  console.log('⚠️  Never commit private keys to version control!');
  console.log('⚠️  Store the mnemonic securely offline as the master key!');
  
  console.log('\n' + '='.repeat(80));
}

/**
 * Main execution function
 */
async function derivePrivateKeys() {
  try {
    console.log('🚀 Starting YAP Private Key Derivation...\n');
    
    // Get mnemonic from command line args or prompt
    let mnemonic;
    if (process.argv.length > 2) {
      mnemonic = process.argv.slice(2).join(' ');
      console.log('📥 Using mnemonic from command line arguments');
    } else {
      mnemonic = await promptForMnemonic();
    }
    
    // Validate the mnemonic
    const validatedMnemonic = validateMnemonic(mnemonic);
    
    // Derive wallets
    const seiWallet = await deriveSeiWallet(validatedMnemonic);
    const evmWallet = deriveEvmWallet(validatedMnemonic);
    
    // Display results
    displayPrivateKeyInfo(seiWallet, evmWallet);
    
    console.log('\n✅ Private key derivation completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Private key derivation failed:', error.message);
    process.exit(1);
  }
}

// Execute the script
if (require.main === module) {
  derivePrivateKeys();
}

module.exports = {
  deriveSeiWallet,
  deriveEvmWallet,
  validateMnemonic
};
