#!/usr/bin/env node

// Test script to debug CosmJS SEI wallet generation
const bip39 = require('bip39');
const { DirectSecp256k1HdWallet, makeCosmoshubPath } = require('@cosmjs/proto-signing');

console.log('🔍 Testing SEI wallet generation...');

async function testSeiWallet() {
  try {
    const mnemonic = bip39.generateMnemonic();
    console.log('✅ BIP39 mnemonic generated:', mnemonic);
    
    // Test SEI wallet generation
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: 'sei',
      hdPaths: [makeCosmoshubPath(0)]
    });
    
    const accounts = await wallet.getAccounts();
    console.log('✅ SEI wallet generated:', accounts[0].address);
    
    console.log('🎉 SEI wallet generation works!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testSeiWallet();
