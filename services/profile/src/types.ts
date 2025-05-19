export interface Profile {
    walletAddress: string;     // PK
    userId?: string;           // Auth user ID
    ethWalletAddress?: string; // Ethereum wallet address
    language_preferred?: string; // User's preferred language for learning
    streak: number;            // consecutive days
    xp: number;                // off-chain points
    createdAt: string;
    updatedAt: string;
  }
