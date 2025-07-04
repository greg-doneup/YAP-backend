#!/usr/bin/env node

// Test script to debug SEI private key extraction
const bip39 = require('bip39');
const { DirectSecp256k1HdWallet, makeCosmoshubPath } = require('@cosmjs/proto-signing');

console.log('🔍 Testing SEI private key extraction...');

async function testSeiPrivateKey() {
  try {
    const mnemonic = 'flash mouse into snack grab horn bike arrest language syrup ski visa';
    console.log('✅ Using test mnemonic');
    
    // Test SEI wallet generation
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: 'sei',
      hdPaths: [makeCosmoshubPath(0)]
    });
    
    const accounts = await wallet.getAccounts();
    console.log('✅ SEI wallet generated:', accounts[0].address);
    
    // Check private key access
    console.log('🔍 Checking wallet properties...');
    console.log('wallet.privkey exists:', !!wallet.privkey);
    console.log('wallet.privkey type:', typeof wallet.privkey);
    
    if (wallet.privkey) {
      const privateKey = Buffer.from(wallet.privkey).toString('hex');
      console.log('✅ Private key extracted:', privateKey);
    } else {
      console.log('❌ No privkey property found');
      console.log('Available properties:', Object.keys(wallet));
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testSeiPrivateKey();
