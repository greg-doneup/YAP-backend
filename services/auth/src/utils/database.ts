/**
 * Simple in-memory storage for refresh tokens
 * In a production environment, this would be replaced with a proper database
 */

// In-memory storage for refresh tokens
// Format: { userId: Set<refreshToken> }
const refreshTokenStore: Record<string, Set<string>> = {};

/**
 * Save a refresh token for a user
 * @param userId The user ID
 * @param refreshToken The refresh token to save
 */
export async function saveRefreshToken(userId: string, refreshToken: string): Promise<void> {
  if (!refreshTokenStore[userId]) {
    refreshTokenStore[userId] = new Set();
  }
  refreshTokenStore[userId].add(refreshToken);
}

/**
 * Validate if a refresh token exists for a user
 * @param userId The user ID
 * @param refreshToken The refresh token to validate
 * @returns True if the token is valid, false otherwise
 */
export async function validateRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
  if (!refreshTokenStore[userId]) {
    return false;
  }
  return refreshTokenStore[userId].has(refreshToken);
}

/**
 * Delete all refresh tokens for a user (logout)
 * @param userId The user ID
 */
export async function deleteRefreshToken(userId: string): Promise<void> {
  delete refreshTokenStore[userId];
}

/**
 * Delete a specific refresh token for a user
 * @param userId The user ID
 * @param refreshToken The specific refresh token to delete
 * @returns True if token was found and deleted, false otherwise
 */
export async function deleteSpecificRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
  if (!refreshTokenStore[userId]) {
    return false;
  }
  
  const result = refreshTokenStore[userId].delete(refreshToken);
  
  // Clean up empty sets
  if (refreshTokenStore[userId].size === 0) {
    delete refreshTokenStore[userId];
  }
  
  return result;
}