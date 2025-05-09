import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Middleware to require authentication via JWT
 * @param secret The JWT secret to verify the token with
 */
export const requireAuth = (secret: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'unauthorized', 
        message: 'Missing authorization token' 
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, secret) as {
        walletAddress: string;
        ethWalletAddress?: string;
        sub: string;
        type: string;
      };
      
      // Validate token type - only access tokens are valid for API requests
      if (decoded.type !== 'access') {
        return res.status(401).json({ 
          error: 'unauthorized', 
          message: 'Invalid token type' 
        });
      }
      
      // Add the decoded user info to the request object for route handlers
      (req as any).user = decoded;
      
      next();
    } catch (error: any) {
      console.error('Token verification error:', error.message);
      
      // Provide more specific error message for token expiration
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          error: 'unauthorized', 
          message: 'Token has expired' 
        });
      }
      
      return res.status(401).json({ 
        error: 'unauthorized', 
        message: 'Invalid token' 
      });
    }
  };
};
