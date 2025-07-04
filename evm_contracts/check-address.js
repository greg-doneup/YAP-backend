const { ethers } = require('ethers');

async function checkBalance() {
  console.log('Checking balance on SEI EVM Testnet...');
  
  const rpcUrl = 'https://evm-rpc-testnet.sei-apis.com';
  const chainId = 1328;
  const targetAddress = '0x449E8eC2AfD0486a56a77C09E2885d52ef0c3F21'; // Correct address to check
  
  console.log(`RPC URL: ${rpcUrl}`);
  console.log(`Chain ID: ${chainId}`);
  console.log(`Target Address: ${targetAddress}`);
  
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl, {
      chainId: chainId,
      name: 'sei-evm-testnet'
    });
    
    // Check connection
    const network = await provider.getNetwork();
    console.log(`Connected to Chain ID: ${network.chainId}`);
    
    // Check balance
    const balance = await provider.getBalance(targetAddress);
    console.log(`Balance (wei): ${balance.toString()}`);
    console.log(`Balance (SEI): ${ethers.formatEther(balance)}`);
    
    if (balance > 0n) {
      console.log('✅ Address has balance!');
    } else {
      console.log('❌ Address has no balance - needs funding');
    }
    
  } catch (error) {
    console.error('❌ Error checking balance:', error.message);
  }
}

checkBalance();
