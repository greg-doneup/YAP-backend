import crypto from 'crypto';

/**
 * Utility for secure handling of Ethereum private keys
 * Uses symmetric encryption with a server-side secret key
 */
export class EthKeyManager {
  private encryptionKey: Buffer;

  constructor(secretKey: string) {
    // Use a strong server-side secret for encryption
    this.encryptionKey = crypto.createHash('sha256')
      .update(secretKey)
      .digest();
  }

  /**
   * Encrypt an Ethereum private key for storage
   * @param privateKey The Ethereum private key to encrypt
   * @param userId User ID as additional context for encryption
   * @returns Encrypted private key as a base64 string
   */
  encrypt(privateKey: string, userId: string): string {
    // Create a unique IV for each encryption
    const iv = crypto.randomBytes(16);
    
    // Include user ID in encryption context for added security
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const contextBuffer = Buffer.from(userId);
    cipher.setAAD(contextBuffer);
    
    // Encrypt the private key
    const encryptedKey = Buffer.concat([
      cipher.update(privateKey, 'utf8'),
      cipher.final()
    ]);
    
    // Get the authentication tag
    const authTag = cipher.getAuthTag();
    
    // Combine IV, encrypted key, and auth tag for storage
    const result = Buffer.concat([iv, authTag, encryptedKey]);
    return result.toString('base64');
  }

  /**
   * Decrypt a stored Ethereum private key
   * @param encryptedKey The encrypted private key as a base64 string
   * @param userId User ID as additional context for decryption
   * @returns The decrypted Ethereum private key
   */
  decrypt(encryptedKey: string, userId: string): string {
    // Convert from base64
    const encryptedBuffer = Buffer.from(encryptedKey, 'base64');
    
    // Extract IV, auth tag, and encrypted data
    const iv = encryptedBuffer.slice(0, 16);
    const authTag = encryptedBuffer.slice(16, 32);
    const encryptedData = encryptedBuffer.slice(32);
    
    // Create decipher with IV
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    
    // Set auth tag and AAD (user ID) for verification
    decipher.setAuthTag(authTag);
    const contextBuffer = Buffer.from(userId);
    decipher.setAAD(contextBuffer);
    
    // Decrypt and return the private key
    return Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]).toString('utf8');
  }
}