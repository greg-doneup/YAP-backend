/**
 * Core types for blockchain progress reporting system
 */

export interface LessonProgressSignature {
  // Core Progress Data
  userId: string;
  walletAddress: string;
  lessonId: string;
  cefrLevel: string;
  language: string;
  
  // Progress Metrics
  completionTimestamp: number;
  accuracyScore: number;
  pronunciationScore: number;
  grammarScore: number;
  vocabularyMastered: string[];
  
  // Time & Effort Metrics
  timeSpent: number;
  attemptsCount: number;
  hintsUsed: number;
  
  // Blockchain Verification
  blockTimestamp: number;
  nonce: string;
  
  // Digital Signature Fields (added after signing)
  messageHash?: string;
  signature?: string;
  signedAt?: number;
}

export interface BatchUpdate {
  batchId: string;
  users: string[];
  lessonIds: string[];
  scores: {
    accuracy: number;
    pronunciation: number;
    grammar: number;
    totalXP: number;
  }[];
  timestamps: number[];
  signatures: string[];
}

export interface UserProgress {
  userId: string;
  walletAddress: string;
  totalXP: number;
  lessonsCompleted: number;
  averageAccuracy: number;
  lastUpdate: number;
  currentCEFRLevel: string;
  ranking?: number;
}

export interface BatchProcessingResult {
  batchId: string;
  txHash: string;
  processedCount: number;
  failedCount: number;
  gasUsed: string;
  timestamp: number;
}

export interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

export interface EIP712Message {
  domain: EIP712Domain;
  types: {
    [key: string]: Array<{
      name: string;
      type: string;
    }>;
  };
  primaryType: string;
  message: any;
}

export interface BlockchainConfig {
  rpcUrl: string;
  chainId: number;
  treasuryPrivateKey: string;
  leaderboardContractAddress: string;
  tokenContractAddress: string;
  gasLimit: string;
  gasPrice: string;
}

export interface BatchConfig {
  intervalMinutes: number;
  sizeLimit: number;
  retryAttempts: number;
  retryDelayMs: number;
}

// Database document interfaces
export interface ProgressDocument extends LessonProgressSignature {
  _id?: string;
  status: 'pending' | 'signed' | 'batched' | 'processed' | 'failed';
  batchId?: string;
  txHash?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BatchDocument {
  _id?: string;
  batchId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progressIds: string[];
  txHash?: string;
  gasUsed?: string;
  errorMessage?: string;
  createdAt: Date;
  processedAt?: Date;
}

export interface LessonProgressBatch {
  batchId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progressUpdates: {
    userId: string;
    lessonId: string;
    score: number;
    completedAt: Date;
    signature: string;
  }[];
  createdAt: Date;
  processedAt?: Date;
  txHash?: string;
  gasUsed?: string;
  errorMessage?: string;
}

// API request/response interfaces
export interface SubmitProgressRequest {
  userId: string;
  lessonId: string;
  progressData: {
    cefrLevel?: string;
    language?: string;
    accuracyScore: number;
    pronunciationScore: number;
    grammarScore: number;
    vocabularyMastered: string[];
    timeSpent: number;
    attemptsCount: number;
    hintsUsed: number;
  };
}

export interface SignatureRequest {
  userId: string;
  signaturePayload: LessonProgressSignature;
  signature: string;
}

export interface ProgressResponse {
  success: boolean;
  signaturePayload?: LessonProgressSignature;
  messageToSign?: EIP712Message;
  expectedBatchTime?: Date;
  error?: string;
}

export interface LeaderboardEntry {
  rank: number;
  walletAddress: string;
  userId: string;
  totalXP: number;
  lessonsCompleted: number;
  averageAccuracy: number;
  currentCEFRLevel: string;
}

export interface LeaderboardResponse {
  topUsers: LeaderboardEntry[];
  userRank?: LeaderboardEntry;
  totalUsers: number;
  lastUpdate: Date;
}
