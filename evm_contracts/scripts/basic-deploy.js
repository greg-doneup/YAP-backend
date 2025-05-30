// basic-deploy.js - run with node basic-deploy.js
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function main() {
  try {
    // Basic configuration
    const rpcUrl = process.env.EVM_RPC;
    const privateKey = process.env.REWARD_TREASURY_PK;
    
    console.log(`Connecting to ${rpcUrl}...`);
    
    // Create a basic provider
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Create wallet
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`Using wallet: ${wallet.address}`);
    
    // Load compiled contract (adjust path as needed)
    const artifact = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '../artifacts/contracts/YAPToken.sol/YAPToken.json'),
        'utf8'
      )
    );
    
    // Deploy with minimal RPC calls
    console.log('Creating contract factory...');
    const factory = new ethers.ContractFactory(
      artifact.abi,
      artifact.bytecode,
      wallet
    );
    
    console.log('Deploying contract...');
    // Use a simple deployment approach with explicit gas settings
    const contract = await factory.deploy({
      gasLimit: 5000000
    });
    
    console.log(`Transaction hash: ${contract.deploymentTransaction().hash}`);
    console.log('Waiting for confirmation...');
    
    await contract.waitForDeployment();
    
    console.log(`Contract deployed to: ${await contract.getAddress()}`);
  } catch (error) {
    console.error('Deployment failed:', error);
  }
}

main();