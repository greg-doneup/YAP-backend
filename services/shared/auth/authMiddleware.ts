import express from 'express';
import jwt from 'jsonwebtoken';

// Define types using the express namespace
type Request = express.Request;
type Response = express.Response;
type NextFunction = express.NextFunction;

// Error types for consistent error handling across services
export enum AuthErrorType {
  MISSING_TOKEN = 'missing_token',
  INVALID_TOKEN = 'invalid_token',
  EXPIRED_TOKEN = 'expired_token',
  INVALID_TOKEN_TYPE = 'invalid_token_type',
  SERVER_ERROR = 'server_error'
}

// Interface for decoded JWT token
export interface DecodedToken {
  sub: string;
  walletAddress?: string;
  ethWalletAddress?: string;
  type?: string;
  iat?: number;
  exp?: number;
}

/**
 * Enhanced middleware to require authentication
 * - Validates the JWT token
 * - Ensures it's an access token (not refresh)
 * - Provides specific error types for client handling
 */
export function requireAuth(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get the authorization header
      const authHeader = req.headers.authorization;
      
      // Check if Authorization header exists
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: AuthErrorType.MISSING_TOKEN,
          message: 'Authentication required'
        });
      }
      
      // Extract token from header
      const token = authHeader.split(' ')[1];
      
      try {
        // Verify token
        const decoded = jwt.verify(token, secret) as DecodedToken;
        
        // Ensure this is an access token, not a refresh token
        if (decoded.type && decoded.type !== 'access') {
          return res.status(401).json({
            error: AuthErrorType.INVALID_TOKEN_TYPE,
            message: 'Invalid token type'
          });
        }
        
        // Attach the decoded user to the request
        (req as any).user = decoded;
        next();
      } catch (err: any) {
        // Handle specific JWT errors
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({
            error: AuthErrorType.EXPIRED_TOKEN,
            message: 'Token has expired'
          });
        }
        
        return res.status(401).json({
          error: AuthErrorType.INVALID_TOKEN,
          message: 'Invalid token'
        });
      }
    } catch (err) {
      console.error('Auth middleware error:', err);
      return res.status(500).json({
        error: AuthErrorType.SERVER_ERROR,
        message: 'Internal server error during authentication'
      });
    }
  };
}

/**
 * Helper to extract user ID from request
 * To be used after the requireAuth middleware
 */
export function getUserIdFromRequest(req: Request): string | null {
  const user = (req as any).user;
  return user ? user.sub : null;
}

/**
 * Helper to extract wallet addresses from request
 * To be used after the requireAuth middleware
 */
export function getWalletAddressesFromRequest(req: Request): { sei?: string, eth?: string } {
  const user = (req as any).user;
  return {
    sei: user?.walletAddress,
    eth: user?.ethWalletAddress
  };
}