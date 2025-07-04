const { ethers } = require('ethers');

async function verifyPrivateKey() {
  console.log('Verifying private key from Kubernetes secret...');
  
  // Decode the base64 private key from Kubernetes
  const base64PrivateKey = 'MHhkNWU2YTcwY2U4N2M2OWEwYmY0ZmI0ZTM0MDdmYWNlOWQzMDllYzI3NTJmNDE3ZTY3ODYyN2I0ODljYmViZjdk';
  const privateKey = Buffer.from(base64PrivateKey, 'base64').toString('utf8');
  
  console.log(`Decoded private key: ${privateKey}`);
  
  // Create wallet from private key
  const wallet = new ethers.Wallet(privateKey);
  console.log(`Wallet address from private key: ${wallet.address}`);
  
  const expectedAddress = '0x449E8eC2AfD0486a56a77C09E2885d52ef0c3F21';
  console.log(`Expected address: ${expectedAddress}`);
  
  if (wallet.address.toLowerCase() === expectedAddress.toLowerCase()) {
    console.log('✅ Private key matches the expected address!');
  } else {
    console.log('❌ Private key does NOT match the expected address!');
    console.log('   This means we need the correct private key for the funded address.');
  }
}

verifyPrivateKey();
