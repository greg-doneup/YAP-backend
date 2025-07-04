#!/usr/bin/env node

const { ethers } = require('ethers');

// Check if private key corresponds to expected address
const privateKey = "0xabd7a4248b29f64ca8c5ba40d8403da1b747b1a50515af9f9e18166474d07786";
const expectedAddress = "0x449E8eC2AfD0486a56a77C09E2885d52ef0c3F21";

console.log('🔍 Checking private key to address mapping...');
console.log(`Private key: ${privateKey}`);
console.log(`Expected address: ${expectedAddress}`);

try {
  // Create wallet from private key
  const wallet = new ethers.Wallet(privateKey);
  console.log(`Derived address: ${wallet.address}`);
  
  // Check if they match (case-insensitive)
  const matches = wallet.address.toLowerCase() === expectedAddress.toLowerCase();
  console.log(`✅ Match: ${matches ? 'YES' : 'NO'}`);
  
  if (matches) {
    console.log('🎉 Private key corresponds to the expected address!');
  } else {
    console.log('❌ Private key does NOT correspond to the expected address');
  }
  
} catch (error) {
  console.error('❌ Error checking private key:', error.message);
}
