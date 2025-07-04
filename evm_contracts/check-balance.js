const { ethers } = require("ethers");
require('dotenv').config();

async function checkBalance() {
    try {
        console.log("Checking balance on SEI EVM Testnet...");
        console.log("RPC URL:", process.env.EVM_RPC);
        console.log("Chain ID:", process.env.CHAIN_ID);
        
        const provider = new ethers.JsonRpcProvider(process.env.EVM_RPC);
        const wallet = new ethers.Wallet(process.env.REWARD_TREASURY_PK, provider);
        
        console.log("Company Wallet Address:", wallet.address);
        
        // Get balance
        const balance = await provider.getBalance(wallet.address);
        console.log("Balance (wei):", balance.toString());
        console.log("Balance (SEI):", ethers.formatEther(balance));
        
        // Check network
        const network = await provider.getNetwork();
        console.log("Connected to Chain ID:", network.chainId.toString());
        
        if (balance === 0n) {
            console.log("\n🚨 WALLET NEEDS FUNDING!");
            console.log("To fund your wallet on SEI EVM testnet:");
            console.log("1. Visit: https://www.sei.faucet.community/");
            console.log("2. Enter your wallet address:", wallet.address);
            console.log("3. Request SEI testnet tokens");
            console.log("4. Wait for the transaction to complete");
            console.log("5. Re-run this script to verify funding");
        } else {
            console.log("✅ Wallet has sufficient balance for deployment!");
        }
        
    } catch (error) {
        console.error("Error checking balance:", error.message);
        console.error("Full error:", error);
    }
}

checkBalance();
