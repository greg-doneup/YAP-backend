import axios from "axios";

const PROFILE_SERVICE_URL = "http://offchain-profile";

// Define a type for history query parameters to improve maintainability
type XpHistoryParams = {
  walletAddress: string;
  date?: string;
  amount?: number;
  type?: string;
  ts?: string;
  pass?: boolean;
  cost?: number;
  id?: string;
  [key: string]: any; // Allow for any additional parameters
};

/**
 * Add XP to a user's wallet
 */
export async function addXp(wallet: string, amount: number) {
  return axios.patch(`${PROFILE_SERVICE_URL}/points/add`, { walletAddress: wallet, amount });
}

/**
 * Get the current XP for a wallet
 */
export async function getXp(wallet: string) {
  const { data } = await axios.get(`${PROFILE_SERVICE_URL}/points`, { params: { walletAddress: wallet } });
  return { xp: data.xp };
}

/**
 * Get XP history for a wallet with optional filtering parameters
 */
export async function getXpHistory(wallet: string, params: Omit<XpHistoryParams, 'walletAddress'> = {}) {
  const { data } = await axios.get(`${PROFILE_SERVICE_URL}/points/history`, {
    params: { walletAddress: wallet, ...params }
  });
  return { history: data.history };
}

// Export specific convenience methods for common queries
export async function getXpHistoryByDate(wallet: string, date: string) {
  return getXpHistory(wallet, { date });
}

export async function getXpHistoryByDateAndType(wallet: string, date: string, type: string) {
  return getXpHistory(wallet, { date, type });
}