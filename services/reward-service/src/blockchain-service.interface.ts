/**
 * BlockchainService Interface
 * 
 * This interface defines the blockchain operations that will be exposed to other 
 * microservices via REST endpoints or message queue events.
 */
export interface BlockchainService {
  // Token operations
  getTokenBalance(address: string): Promise<string>;
  getTokenAllowance(owner: string, spender: string): Promise<string>;
  
  // Completion recording
  recordDailyCompletion(userId: string, date: Date): Promise<{ txHash: string }>;
  recordQuizCompletion(userId: string, quizId: string, score: number): Promise<{ txHash: string }>;
  
  // Vesting operations
  getVestingSchedule(address: string): Promise<{
    totalAmount: string;
    released: string;
    startTimestamp: number;
    lastAllocation: number;
  }>;
  getReleasableAmount(address: string): Promise<string>;
  getNextRelease(address: string): Promise<{
    timestamp: number;
    amount: string;
  }>;
  
  // Badge operations
  getUserBadges(address: string): Promise<{
    tokenIds: string[];
    badgeTypeIds: string[];
  }>;
  getBadgeTypes(): Promise<{
    id: number;
    name: string;
    description: string;
    burnAmount: string;
    active: boolean;
    maxSupply: string;
    minted: string;
    baseURI: string;
  }[]>;
  
  // Contract addresses
  getContractAddresses(): Promise<{
    yapToken: string;
    dailyCompletion: string;
    vestingBucket: string;
    burnRedeemer: string;
    timelockGovernor?: string;
  }>;
}

/**
 * Events emitted by the blockchain service that other microservices can subscribe to
 */
export enum BlockchainEvents {
  TOKEN_TRANSFER = 'token:transfer',
  TOKEN_APPROVAL = 'token:approval',
  COMPLETION_RECORDED = 'completion:recorded',
  BADGE_REDEEMED = 'badge:redeemed',
  VESTING_UPDATED = 'vesting:updated',
  VESTING_CLAIMED = 'vesting:claimed',
}

/**
 * Event payload types
 */
export interface TokenTransferEvent {
  from: string;
  to: string;
  amount: string;
  timestamp: number;
}

export interface CompletionRecordedEvent {
  userId: string;
  completionType: 'daily' | 'quiz';
  resourceId?: string; // quizId for quiz completions
  timestamp: number;
  rewardAmount: string;
}

export interface BadgeRedeemedEvent {
  userId: string;
  badgeTypeId: number;
  tokenId: string;
  burnAmount: string;
  timestamp: number;
}

export interface VestingUpdatedEvent {
  userId: string;
  totalAmount: string;
  released: string;
  timestamp: number;
}