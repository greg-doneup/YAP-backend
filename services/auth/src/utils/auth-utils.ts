import crypto from 'crypto';
import { DirectSecp256k1HdWallet, makeCosmoshubPath } from '@cosmjs/proto-signing';
import { Wallet, HDNodeWallet } from 'ethers';
import * as bip39 from 'bip39';

/**
 * Simple wallet authentication service
 * Handles wallet creation and address association with users
 */

interface WalletData {
  address: string;
  userId: string;
  mnemonic?: string; // Only stored temporarily for initial setup
  type?: 'SEI' | 'ETH';  // Differentiate between wallet types
}

interface WalletCreationOptions {
  /**
   * Whether to generate a new random mnemonic or derive deterministically from userId.
   * In production, this should be true to ensure wallet uniqueness.
   */
  generateNewMnemonic?: boolean;
  
  /**
   * Network configuration
   * Defaults to SEI testnet
   */
  network?: 'mainnet' | 'testnet';
}

const NETWORK_PREFIXES = {
  mainnet: 'sei',
  testnet: 'sei'
};

// BIP44 path for Ethereum
const ETH_PATH = "m/44'/60'/0'/0/0";

/**
 * Create or retrieve SEI wallet for a user and derive EVM wallet from the same seed
 * @param userId - Unique identifier for the user
 * @param seiWalletAddress - Optional existing SEI wallet address to validate
 * @param ethWalletAddress - Optional existing ETH wallet address to validate
 */
export async function createEmbeddedWallet(
  userId: string,
  seiWalletAddress?: string,
  ethWalletAddress?: string,
  options: WalletCreationOptions = {}
): Promise<{ wallet: WalletData & { type: 'SEI' }, ethWallet: WalletData & { type: 'ETH' } }> {
  console.log(`Creating/retrieving wallets for user: ${userId}`);
  
  const {
    generateNewMnemonic = false,
    network = 'testnet'
  } = options;

  try {
    let mnemonic: string;
    
    if (generateNewMnemonic) {
      // Generate a new random mnemonic for new wallets
      mnemonic = bip39.generateMnemonic(256); // 24 words for extra security
    } else {
      // Create deterministic seed from userId
      const seed = crypto.createHash('sha256')
        .update(`${userId}:YAP_WALLET_SEED_V2`)
        .digest();
        
      // Convert seed to valid BIP39 mnemonic using the first 32 bytes (256 bits)
      mnemonic = bip39.entropyToMnemonic(seed.slice(0, 32));
    }

    // Create SEI wallet from mnemonic
    const seiWallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: NETWORK_PREFIXES[network],
      hdPaths: [makeCosmoshubPath(0)]  // Use account 0
    });
    const [seiAccount] = await seiWallet.getAccounts();
    
    // Create ETH wallet using Wallet.fromPhrase which handles BIP39 mnemonics correctly
    const ethWallet = Wallet.fromPhrase(mnemonic);

    // Validate addresses if provided
    if (seiWalletAddress && seiWalletAddress !== seiAccount.address) {
      throw new Error('Provided SEI address does not match derived wallet');
    }
    if (ethWalletAddress && ethWalletAddress !== ethWallet.address) {
      throw new Error('Provided ETH address does not match derived wallet');
    }

    // Return wallet data without private keys
    return {
      wallet: {
        address: seiAccount.address,
        userId,
        mnemonic, // Only included temporarily for initial setup
        type: 'SEI' as const
      },
      ethWallet: {
        address: ethWallet.address,
        userId,
        mnemonic, // Only included temporarily for initial setup
        type: 'ETH' as const
      }
    };
  } catch (err) {
    console.error('Failed to create/retrieve wallets:', err);
    throw err;
  }
}

/**
 * Function to recreate ETH wallet from SEI wallet address and timestamp
 * This is used to verify transactions in other services
 */
export async function regenerateEthWallet(seiAddress: string, timestamp: number): Promise<HDNodeWallet> {
  // Create deterministic seed from SEI wallet and timestamp
  const seed = crypto.createHash('sha512')  // Use SHA-512 for more entropy
    .update(`${seiAddress}:${timestamp}:YAP_ETH_WALLET_SEED_V2`)
    .digest();
  
  // Convert first 32 bytes of seed to valid BIP39 mnemonic
  const mnemonic = bip39.entropyToMnemonic(seed.slice(0, 32));
  
  // Create Ethereum wallet with proper derivation path
  return Wallet.fromPhrase(mnemonic);
}