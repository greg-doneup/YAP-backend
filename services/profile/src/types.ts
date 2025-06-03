export interface Profile {
    userId: string;           // PK - Auth user ID (64 char hex)
    email: string;            // User's email address
    name: string;             // User's full name
    initial_language_to_learn: string; // Initial language the user wants to learn
    createdAt: string;
    updatedAt: string;
    // Optional encrypted wallet data
    encryptedPrivateKey?: string;  // Encrypted Ethereum private key
    walletAddress?: string;        // Ethereum wallet address
    keyCreatedAt?: string;         // When the key was stored
    keyLastAccessed?: string;      // When the key was last accessed
  }

export interface WalletData {
    privateKey: string;       // Raw private key (never stored)
    address: string;          // Ethereum address
    encryptedKey: string;     // Encrypted private key for storage
}

export interface SecurityContext {
    userId: string;
    clientIp: string;
    userAgent: string;
    requestId?: string;
}
