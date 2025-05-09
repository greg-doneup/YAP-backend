export interface Profile {
    walletAddress: string;   // PK
    userId?: string;         // Auth user ID
    ethWalletAddress?: string; // Ethereum wallet address
    xp: number;
    streak: number;
    createdAt: string;
    updatedAt: string;
  }
