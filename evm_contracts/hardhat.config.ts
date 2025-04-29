import { HardhatUserConfig } from "hardhat/types";
import "@nomicfoundation/hardhat-verify";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-ignition";
import "@nomicfoundation/hardhat-ignition-ethers";
import "hardhat-gas-reporter";
import "solidity-coverage";
import * as dotenv from "dotenv";
dotenv.config();

// For debugging
console.log("Loading hardhat config");
console.log("RPC URL:", process.env.EVM_RPC);
console.log("Chain ID:", process.env.CHAIN_ID);
console.log("Private key available:", !!process.env.REWARD_TREASURY_PK);

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  defaultNetwork: "testnet",
  networks: {
    testnet: {
      url: process.env.EVM_RPC!,
      accounts: [process.env.REWARD_TREASURY_PK!],
      chainId: Number(process.env.CHAIN_ID),
      timeout: 100000, // 100 seconds for high latency
      gasPrice: 20000000000 // 20 Gwei
    }
  },
  // More detailed logging
  mocha: {
    timeout: 100000
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test"
  },
  etherscan: { 
    apiKey: process.env.ETHERSCAN_KEY || ""
  }
};
export default config;
