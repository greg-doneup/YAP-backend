import { Router, Request, Response, NextFunction } from 'express';
import { Wallet, HDNodeWallet } from 'ethers';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import * as bip39 from 'bip39';

const router = Router();
const JWT_SECRET = process.env.APP_JWT_SECRET!;

// Define interface for the user property extension
interface RequestWithUser extends Request {
  user?: {
    walletAddress: string;
    ethWalletAddress: string;
    sub: string;
    iat: number;
    exp: number;
  };
}

/**
 * Regenerate the Ethereum wallet from SEI wallet and JWT iat
 * Updated to use BIP39 mnemonic standards
 */
function regenerateEthWallet(seiWalletAddress: string, timestamp: number): HDNodeWallet {
  // Create deterministic seed from SEI wallet and timestamp
  const seed = crypto.createHash('sha512')
    .update(`${seiWalletAddress}:${timestamp}:YAP_ETH_WALLET_SEED_V2`)
    .digest();
  
  // Convert first 32 bytes to valid BIP39 mnemonic
  const mnemonic = bip39.entropyToMnemonic(seed.slice(0, 32));

  // Use standard BIP44 derivation path for Ethereum
  return HDNodeWallet.fromPhrase(mnemonic).derivePath("m/44'/60'/0'/0/0");
}

/**
 * Middleware to verify JWT and extract wallet information
 */
function authenticateJWT(req: RequestWithUser, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as RequestWithUser['user'];
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Sign a transaction with the user's Ethereum wallet
 * POST /ethereum/sign-transaction
 */
router.post('/sign-transaction', authenticateJWT, async (req: RequestWithUser, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { walletAddress, iat } = user;
    const { transaction } = req.body;
    
    if (!transaction) {
      return res.status(400).json({ error: 'Transaction data required' });
    }
    
    // Regenerate the user's Ethereum wallet using SEI wallet and JWT iat
    const ethWallet = regenerateEthWallet(walletAddress, iat);
    
    // Verify that the regenerated address matches the one in the JWT
    if (ethWallet.address !== user.ethWalletAddress) {
      return res.status(500).json({ 
        error: 'Wallet address mismatch',
        expected: user.ethWalletAddress,
        regenerated: ethWallet.address
      });
    }
    
    // Sign the transaction
    const signedTx = await ethWallet.signTransaction(transaction);
    
    res.json({ signedTransaction: signedTx });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Transaction signing error:', errorMessage);
    res.status(500).json({ 
      error: 'Failed to sign transaction',
      details: errorMessage
    });
  }
});

/**
 * Sign a message with the user's Ethereum wallet
 * POST /ethereum/sign-message
 */
router.post('/sign-message', authenticateJWT, async (req: RequestWithUser, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { walletAddress, iat } = user;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message required' });
    }
    
    // Regenerate the user's Ethereum wallet using SEI wallet and JWT iat
    const ethWallet = regenerateEthWallet(walletAddress, iat);
    
    // Verify that the regenerated address matches the one in the JWT
    if (ethWallet.address !== user.ethWalletAddress) {
      return res.status(500).json({ 
        error: 'Wallet address mismatch',
        expected: user.ethWalletAddress,
        regenerated: ethWallet.address
      });
    }
    
    // Sign the message
    const signature = await ethWallet.signMessage(message);
    
    res.json({ signature });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Message signing error:', errorMessage);
    res.status(500).json({ 
      error: 'Failed to sign message',
      details: errorMessage
    });
  }
});

export default router;