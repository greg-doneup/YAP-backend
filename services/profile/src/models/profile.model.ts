// Add Ethereum wallet fields to the profile model
export interface Profile {
  id: string;
  walletAddress: string;
  ethWalletAddress?: string;  // Ethereum wallet address
  encryptedEthKey?: string;   // Encrypted private key
}