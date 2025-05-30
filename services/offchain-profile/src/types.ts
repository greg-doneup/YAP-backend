export interface Profile {
    userId: string;         // PK - Auth user ID (64 char hex)
    ethWalletAddress?: string; // Ethereum wallet address
    email?: string;         // User's email address
    xp: number;
    streak: number;
    createdAt: string;
    updatedAt: string;
  }
