/**
 * Database utilities for the auth service
 * This file now serves as a facade that delegates to the MongoDB implementation
 */

import {
  saveRefreshToken as mongoSaveRefreshToken,
  validateRefreshToken as mongoValidateRefreshToken,
  deleteRefreshToken as mongoDeleteRefreshToken,
  deleteSpecificRefreshToken as mongoDeleteSpecificRefreshToken
} from './mongodb';

/**
 * Save a refresh token for a user
 * @param userId The user ID
 * @param refreshToken The refresh token to save
 */
export async function saveRefreshToken(userId: string, refreshToken: string): Promise<void> {
  return mongoSaveRefreshToken(userId, refreshToken);
}

/**
 * Validate if a refresh token exists for a user
 * @param userId The user ID
 * @param refreshToken The refresh token to validate
 * @returns True if the token is valid, false otherwise
 */
export async function validateRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
  return mongoValidateRefreshToken(userId, refreshToken);
}

/**
 * Delete all refresh tokens for a user (logout)
 * @param userId The user ID
 */
export async function deleteRefreshToken(userId: string): Promise<void> {
  return mongoDeleteRefreshToken(userId);
}

/**
 * Delete a specific refresh token for a user
 * @param userId The user ID
 * @param refreshToken The specific refresh token to delete
 * @returns True if token was found and deleted, false otherwise
 */
export async function deleteSpecificRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
  return mongoDeleteSpecificRefreshToken(userId, refreshToken);
}