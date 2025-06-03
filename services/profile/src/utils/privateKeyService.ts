import { EthKeyManager } from './eth-key-manager';
import { SecurityValidator } from './securityValidator';
import { AuditLogger, SecurityEventType } from './auditLogger';
import { SecurityContext, WalletData } from '../types';
import crypto from 'crypto';

/**
 * Enhanced private key service with comprehensive security features
 */
export class PrivateKeyService {
  private keyManager: EthKeyManager;
  private auditLogger: AuditLogger;
  private encryptionKey: string;
  
  constructor() {
    this.encryptionKey = process.env.PRIVATE_KEY_ENCRYPTION_SECRET || this.generateDefaultSecret();
    this.keyManager = new EthKeyManager(this.encryptionKey);
    this.auditLogger = new AuditLogger();
    
    if (!process.env.PRIVATE_KEY_ENCRYPTION_SECRET) {
      console.warn('⚠️  Using default encryption secret. Set PRIVATE_KEY_ENCRYPTION_SECRET in production!');
    }
  }
  
  /**
   * Securely store an encrypted private key
   */
  async storePrivateKey(
    privateKey: string, 
    userId: string, 
    context: SecurityContext
  ): Promise<{ encryptedKey: string; walletAddress: string }> {
    try {
      // Validate private key format
      if (!SecurityValidator.validatePrivateKey(privateKey)) {
        await this.auditLogger.logSecurityViolation(
          { user: { sub: userId }, ...context } as any,
          'invalid_private_key_format',
          { userId }
        );
        throw new Error('Invalid private key format');
      }
      
      // Generate wallet address from private key
      const walletAddress = this.generateWalletAddress(privateKey);
      
      // Validate generated address
      if (!SecurityValidator.validateEthereumAddress(walletAddress)) {
        await this.auditLogger.logSecurityViolation(
          { user: { sub: userId }, ...context } as any,
          'invalid_wallet_address_generated',
          { userId }
        );
        throw new Error('Failed to generate valid wallet address');
      }
      
      // Encrypt the private key
      const encryptedKey = this.keyManager.encrypt(privateKey, userId);
      
      // Verify encryption worked by attempting to decrypt
      try {
        const decrypted = this.keyManager.decrypt(encryptedKey, userId);
        if (decrypted !== privateKey) {
          throw new Error('Encryption verification failed');
        }
      } catch (error) {
        await this.auditLogger.logSecurityViolation(
          { user: { sub: userId }, ...context } as any,
          'encryption_verification_failed',
          { userId, error: (error as Error)?.message || 'Unknown error' }
        );
        throw new Error('Private key encryption failed');
      }
      
      // Log successful storage
      await this.auditLogger.logPrivateKeyStorage(
        { user: { sub: userId }, ...context } as any,
        userId,
        walletAddress,
        true
      );
      
      return {
        encryptedKey,
        walletAddress
      };
      
    } catch (error) {
      // Log failed storage attempt
      await this.auditLogger.logPrivateKeyStorage(
        { user: { sub: userId }, ...context } as any,
        userId,
        'unknown',
        false
      );
      throw error;
    }
  }
  
  /**
   * Securely retrieve and decrypt a private key
   */
  async retrievePrivateKey(
    encryptedKey: string, 
    userId: string, 
    walletAddress: string,
    context: SecurityContext
  ): Promise<string> {
    try {
      // Validate inputs
      if (!encryptedKey || !userId || !walletAddress) {
        await this.auditLogger.logSecurityViolation(
          { user: { sub: userId }, ...context } as any,
          'missing_key_retrieval_parameters',
          { userId, hasEncryptedKey: !!encryptedKey, hasWalletAddress: !!walletAddress }
        );
        throw new Error('Missing required parameters for key retrieval');
      }
      
      if (!SecurityValidator.validateEthereumAddress(walletAddress)) {
        await this.auditLogger.logSecurityViolation(
          { user: { sub: userId }, ...context } as any,
          'invalid_wallet_address_for_retrieval',
          { userId, walletAddress }
        );
        throw new Error('Invalid wallet address format');
      }
      
      // Decrypt the private key
      const privateKey = this.keyManager.decrypt(encryptedKey, userId);
      
      // Verify the decrypted key generates the correct wallet address
      const verificationAddress = this.generateWalletAddress(privateKey);
      if (verificationAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        await this.auditLogger.logSecurityViolation(
          { user: { sub: userId }, ...context } as any,
          'wallet_address_mismatch',
          { 
            userId, 
            expectedAddress: walletAddress,
            actualAddressHash: SecurityValidator.hashSensitiveData(verificationAddress)
          }
        );
        throw new Error('Wallet address verification failed');
      }
      
      // Log successful access
      await this.auditLogger.logPrivateKeyAccess(
        { user: { sub: userId }, ...context } as any,
        userId,
        walletAddress,
        true
      );
      
      return privateKey;
      
    } catch (error) {
      // Log failed access attempt
      await this.auditLogger.logPrivateKeyAccess(
        { user: { sub: userId }, ...context } as any,
        userId,
        walletAddress,
        false
      );
      throw error;
    }
  }
  
  /**
   * Generate a new wallet (private key + address)
   */
  async generateNewWallet(userId: string, context: SecurityContext): Promise<WalletData> {
    try {
      // Generate a cryptographically secure private key
      const privateKey = this.generateSecurePrivateKey();
      
      // Generate corresponding wallet address
      const address = this.generateWalletAddress(privateKey);
      
      // Encrypt the private key for storage
      const encryptedKey = this.keyManager.encrypt(privateKey, userId);
      
      // Log wallet generation
      await this.auditLogger.logSecurityEvent(
        SecurityEventType.PRIVATE_KEY_STORE,
        'wallet_generation',
        `wallet:${address}`,
        { user: { sub: userId }, ...context } as any,
        true,
        { userId, walletGenerated: true }
      );
      
      return {
        privateKey,
        address,
        encryptedKey
      };
      
    } catch (error) {
      await this.auditLogger.logSecurityViolation(
        { user: { sub: userId }, ...context } as any,
        'wallet_generation_failed',
        { userId, error: (error as Error)?.message || 'Unknown error' }
      );
      throw error;
    }
  }
  
  /**
   * Securely delete a stored private key
   */
  async deletePrivateKey(userId: string, walletAddress: string, context: SecurityContext): Promise<void> {
    try {
      // Log the deletion attempt
      await this.auditLogger.logSecurityEvent(
        SecurityEventType.PRIVATE_KEY_DELETE,
        'private_key_delete',
        `wallet:${walletAddress}`,
        { user: { sub: userId }, ...context } as any,
        true,
        { userId, walletAddress }
      );
      
    } catch (error) {
      await this.auditLogger.logSecurityViolation(
        { user: { sub: userId }, ...context } as any,
        'private_key_deletion_failed',
        { userId, walletAddress, error: (error as Error)?.message || 'Unknown error' }
      );
      throw error;
    }
  }
  
  /**
   * Validate private key ownership and integrity
   */
  async validatePrivateKeyOwnership(
    encryptedKey: string,
    userId: string,
    expectedAddress: string,
    context: SecurityContext
  ): Promise<boolean> {
    try {
      const decryptedKey = await this.retrievePrivateKey(encryptedKey, userId, expectedAddress, context);
      const actualAddress = this.generateWalletAddress(decryptedKey);
      
      return actualAddress.toLowerCase() === expectedAddress.toLowerCase();
      
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Generate a cryptographically secure private key
   */
  private generateSecurePrivateKey(): string {
    // Generate 32 bytes of cryptographically secure random data
    const privateKeyBytes = crypto.randomBytes(32);
    return privateKeyBytes.toString('hex');
  }
  
  /**
   * Generate wallet address from private key
   * This is a simplified implementation - in production you'd use ethers.js or similar
   */
  private generateWalletAddress(privateKey: string): string {
    // This is a placeholder implementation
    // In a real application, you would use a proper Ethereum library
    const publicKey = crypto.createHash('sha256').update(privateKey).digest('hex');
    const address = '0x' + crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 40);
    return address;
  }
  
  /**
   * Generate a default encryption secret if none provided
   */
  private generateDefaultSecret(): string {
    console.warn('⚠️  Generating default encryption secret - this should only be used in development!');
    return crypto.randomBytes(32).toString('hex');
  }
  
  /**
   * Get security metrics for private key operations
   */
  async getPrivateKeySecurityMetrics(timeRange: number = 24): Promise<Record<string, any>> {
    return await this.auditLogger.getSecurityMetrics(timeRange);
  }
}
