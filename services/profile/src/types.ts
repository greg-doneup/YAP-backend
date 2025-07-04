export interface Profile {
    userId: string;           // PK - Auth user ID (64 char hex)
    email: string;            // User's email address
    name: string;             // User's full name
    initial_language_to_learn: string; // Initial language the user wants to learn
    createdAt: string;
    updatedAt: string;
    // Waitlist fields
    isWaitlistUser?: boolean;
    waitlist_signup_at?: string;
    wlw?: boolean;            // wallet_linked_to_wallet
    converted?: boolean;      // waitlist user converted
    // Non-custodial wallet data (user-encrypted)
    passphrase_hash?: string;      // Hash of user's passphrase (for verification)
    encrypted_mnemonic?: string;   // User-encrypted mnemonic phrase
    salt?: string;                 // Salt for encryption
    nonce?: string;                // Nonce for encryption
    sei_wallet?: any;              // SEI wallet data
    eth_wallet?: any;              // ETH wallet data
    seiWalletAddress?: string;     // SEI wallet address
    evmWalletAddress?: string;     // EVM wallet address
    wallet_created_at?: string;    // When wallet was created
    secured_at?: string;           // When wallet was secured
    // Legacy custodial wallet fields (deprecated, for migration only)
    encryptedPrivateKey?: string;  // Legacy encrypted private key
    walletAddress?: string;        // Legacy wallet address
    keyCreatedAt?: string;         // Legacy key creation time
    keyLastAccessed?: string;      // Legacy key access time
}

export interface SecurityContext {
    userId: string;
    clientIp: string;
    userAgent: string;
    requestId?: string;
}
