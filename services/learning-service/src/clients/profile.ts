import axios from "axios";

const PROFILE_SERVICE_URL = process.env.PROFILE_SERVICE_URL || "http://offchain-profile";

// Mock profiles for local development
const mockProfiles: { [userId: string]: Profile } = {};

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

/**
 * Profile data structure
 */
export interface Profile {
  userId: string;
  email: string;
  name: string;
  initial_language_to_learn: string;
  interests?: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Get user profile from profile service
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  try {
    const { data } = await axios.get(`${PROFILE_SERVICE_URL}/profile/${userId}`);
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    
    // Fallback for local development when profile service is not available
    if (axios.isAxiosError(error) && (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED')) {
      console.warn(`Profile service not available, using local fallback for user ${userId}`);
      return mockProfiles[userId] || {
        id: userId,
        email: `user-${userId}@test.com`,
        name: `Test User ${userId}`,
        language_to_learn: 'spanish',
        cefr_level: 'A1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }
    
    console.error("Error fetching user profile:", error);
    throw error;
  }
}

/**
 * Update user profile
 */
export async function updateProfile(userId: string, updates: Partial<Profile>): Promise<void> {
  try {
    await axios.put(`${PROFILE_SERVICE_URL}/profile/${userId}`, updates);
  } catch (error) {
    // Fallback for local development when profile service is not available
    if (axios.isAxiosError(error) && (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED')) {
      console.warn(`Profile service not available, using local fallback for user ${userId}`);
      // Update or create mock profile
      const existingProfile = mockProfiles[userId] || {
        id: userId,
        email: `user-${userId}@test.com`,
        name: `Test User ${userId}`,
        language_to_learn: 'spanish',
        cefr_level: 'A1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      mockProfiles[userId] = {
        ...existingProfile,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      return;
    }
    
    console.error("Error updating user profile:", error);
    throw error;
  }
}