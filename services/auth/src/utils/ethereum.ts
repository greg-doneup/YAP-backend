import { getBytes, hexlify, keccak256, toUtf8Bytes, Wallet } from 'ethers';
import crypto from 'crypto';

/**
 * Generates a deterministic Ethereum wallet based on SEI wallet address and timestamp
 * This ensures the same user always gets the same Ethereum wallet
 * 
 * @param seiWalletAddress The user's SEI wallet address
 * @param timestamp The issued at (iat) timestamp from JWT
 * @returns An Ethereum wallet object with address and private key
 */
export function generateEthWallet(seiWalletAddress: string, timestamp: number): { address: string, privateKey: string } {
  // Create a deterministic seed by hashing the SEI address + timestamp
  const seed = crypto.createHash('sha256')
    .update(`${seiWalletAddress}:${timestamp}:YAP_ETH_WALLET_SEED`)
    .digest('hex');
  
  // Create a wallet from the deterministic seed
  try {
    // For ethers v6, use the directly imported functions
    const bytes = getBytes(`0x${seed}`);
    const seedHex = hexlify(bytes);
    
    // In v6, we need to create a wallet using this privateKey
    const walletPrivateKey = keccak256(seedHex);
    const wallet = new Wallet(walletPrivateKey);
    
    return {
      address: wallet.address,
      privateKey: wallet.privateKey
    };
  } catch (error) {
    console.error('Error generating Ethereum wallet:', error);
    
    // Fallback approach if the above fails
    const fallbackSeedHex = keccak256(
      toUtf8Bytes(`${seiWalletAddress}:${timestamp}:YAP_ETH_WALLET_SEED`)
    );
    const wallet = new Wallet(fallbackSeedHex);
    
    return {
      address: wallet.address,
      privateKey: wallet.privateKey
    };
  }
}