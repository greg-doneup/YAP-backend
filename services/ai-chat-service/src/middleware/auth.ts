import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  user?: {
    userId: string;
    walletAddress?: string;
    email?: string;
    cefrLevel?: string;
    preferredLanguage?: string;
  };
}

/**
 * Simple authentication middleware for direct service-to-service communication
 * In AWS EKS, authentication will be handled at the service mesh level
 */
export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  // For direct service-to-service communication, extract userId from headers
  const userId = req.headers['x-user-id'] as string;
  
  if (!userId) {
    logger.warn('No user ID provided for chat request', { path: req.path });
    res.status(401).json({ 
      error: 'User ID required',
      message: 'x-user-id header must be provided for service-to-service calls' 
    });
    return;
  }

  // Set user info for backward compatibility
  req.userId = userId;
  req.user = {
    userId: userId
  };

  logger.debug('Authenticated service-to-service request', { userId, path: req.path });
  next();
};

/**
 * Optional middleware that extracts user context but doesn't require authentication
 * Useful for endpoints that work with or without authentication
 */
export const optionalAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const userId = req.headers['x-user-id'] as string;
  
  if (userId) {
    req.userId = userId;
    req.user = {
      userId: userId
    };
    logger.debug('Optional auth: User context extracted', { userId });
  }
  
  next();
};
