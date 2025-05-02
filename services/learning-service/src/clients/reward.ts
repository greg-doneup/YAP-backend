import axios, { AxiosResponse, AxiosError } from "axios";

const REWARD_SERVICE_URL = "http://reward-service";

interface RewardResponse {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

interface RewardRequest {
  walletAddress: string;
  amount?: number;
  reason?: string;
}

/**
 * Triggers a daily completion reward for a user's wallet
 * 
 * @param wallet - The wallet address to receive the reward
 * @returns Promise containing the reward transaction status
 */
export async function triggerReward(wallet: string): Promise<RewardResponse> {
  try {
    const response = await axios.post<RewardResponse>(`${REWARD_SERVICE_URL}/reward/complete`, { 
      walletAddress: wallet 
    });
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error(`Failed to trigger reward for wallet ${wallet}:`, axiosError.message);
    return {
      success: false,
      error: axiosError.message || 'Unknown error occurred when triggering reward'
    };
  }
}

/**
 * Triggers a custom reward for a user's wallet with an optional amount and reason
 * 
 * @param wallet - The wallet address to receive the reward
 * @param amount - Optional token amount to reward (uses default if not specified)
 * @param reason - Optional reason for the reward for auditing/tracking
 * @returns Promise containing the reward transaction status
 */
export async function triggerCustomReward(wallet: string, amount?: number, reason?: string): Promise<RewardResponse> {
  try {
    const response = await axios.post<RewardResponse>(`${REWARD_SERVICE_URL}/reward/custom`, {
      walletAddress: wallet,
      amount,
      reason
    });
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error(`Failed to trigger custom reward for wallet ${wallet}:`, axiosError.message);
    return {
      success: false,
      error: axiosError.message || 'Unknown error occurred when triggering custom reward'
    };
  }
}

/**
 * Checks the balance of a wallet
 * 
 * @param wallet - The wallet address to check
 * @returns Promise containing token balance
 */
export async function getTokenBalance(wallet: string): Promise<number> {
  try {
    const response = await axios.get(`${REWARD_SERVICE_URL}/balance/${wallet}`);
    return response.data.balance;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error(`Failed to fetch token balance for wallet ${wallet}:`, axiosError.message);
    throw new Error(`Failed to fetch token balance: ${axiosError.message}`);
  }
}

/**
 * Check if a wallet has already claimed their daily reward
 * 
 * @param wallet - The wallet address to check
 * @returns Promise containing status of daily completion
 */
export async function checkDailyCompletion(wallet: string): Promise<boolean> {
  try {
    const response = await axios.get(`${REWARD_SERVICE_URL}/reward/status/${wallet}`);
    return response.data.completed;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error(`Failed to check daily completion for wallet ${wallet}:`, axiosError.message);
    throw new Error(`Failed to check daily completion status: ${axiosError.message}`);
  }
}
