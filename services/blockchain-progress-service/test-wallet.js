#!/usr/bin/env node

// Test script to debug wallet generation issues
const bip39 = require('bip39');
const { ethers } = require('ethers');

console.log('🔍 Testing basic wallet generation...');

try {
  // Test BIP39 mnemonic generation
  const mnemonic = bip39.generateMnemonic();
  console.log('✅ BIP39 mnemonic generated:', mnemonic);
  
  // Test EVM wallet generation
  const evmWallet = ethers.HDNodeWallet.fromPhrase(mnemonic);
  console.log('✅ EVM wallet generated:', evmWallet.address);
  
  console.log('🎉 Basic wallet generation works!');
} catch (error) {
  console.error('❌ Error:', error);
}
