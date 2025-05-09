import { Wallet, TransactionRequest, getBytes, hexlify, keccak256, toUtf8Bytes } from 'ethers';
import crypto from 'crypto';
import { EthKeyManager } from '../utils/eth-key-manager';

/**
 * Service for managing Ethereum wallet operations
 * Handles wallet regeneration, key management, and signing
 */
export class EthWalletService {
  private keyManager: EthKeyManager;
  
  constructor(secretKey: string) {
    this.keyManager = new EthKeyManager(secretKey);
  }
  
  /**
   * Store an encrypted Ethereum private key
   */
  encryptPrivateKey(privateKey: string, userId: string): string {
    return this.keyManager.encrypt(privateKey, userId);
  }
  
  /**
   * Retrieve and decrypt an Ethereum private key
   */
  getPrivateKey(encryptedKey: string, userId: string): string {
    return this.keyManager.decrypt(encryptedKey, userId);
  }
  
  /**
   * Regenerate an Ethereum wallet deterministically from SEI wallet and timestamp
   * Updated to be compatible with ethers.js v6.13.7
   */
  regenerateWallet(seiWalletAddress: string, timestamp: number): { address: string, privateKey: string } {
    // Create a deterministic seed by hashing the SEI address + timestamp
    const seed = crypto.createHash('sha256')
      .update(`${seiWalletAddress}:${timestamp}:YAP_ETH_WALLET_SEED`)
      .digest('hex');
    
    try {
      // In v6, we use direct function imports rather than accessing via ethers.X
      const bytes = getBytes(`0x${seed}`);
      const seedHex = hexlify(bytes);
      
      // Generate a deterministic private key from the seed
      const walletPrivateKey = keccak256(seedHex);
      const wallet = new Wallet(walletPrivateKey);
      
      return {
        address: wallet.address,
        privateKey: wallet.privateKey
      };
    } catch (error) {
      console.error('Error generating wallet:', error);
      
      // Fallback: Use the hash as a private key directly
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
  
  /**
   * Sign an Ethereum transaction or message
   */
  async signTransaction(privateKey: string, transaction: TransactionRequest): Promise<string> {
    const wallet = new Wallet(privateKey);
    return wallet.signTransaction(transaction);
  }
  
  /**
   * Sign a message with the Ethereum wallet
   * In ethers v6, this is an async method
   */
  async signMessage(privateKey: string, message: string): Promise<string> {
    const wallet = new Wallet(privateKey);
    return wallet.signMessage(message);
  }
}