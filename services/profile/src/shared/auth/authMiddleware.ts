import { Request, Response, NextFunction } from 'express';

// This is a stub implementation of the authentication middleware
// that will be replaced with the real implementation during Docker build

export function requireAuth(jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // For local development, just pass through
    next();
  };
}

export function getUserIdFromRequest(req: Request): string | undefined {
  // Extract userId from JWT token in the Authorization header
  try {
    const authHeader = req.headers.authorization;
    console.log('Authorization header:', authHeader ? `${authHeader.substring(0, 20)}...` : 'none');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('No valid Authorization header found');
      console.log('Falling back to userId from body:', req.body.userId);
      return req.body.userId || undefined;
    }

    const token = authHeader.split(' ')[1];
    // In production, this would verify and decode the token
    // For now, try to extract the sub claim which contains the userId
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    console.log('Decoded token:', decoded);
    const userId = decoded.sub || req.body.userId;
    console.log('Using userId:', userId);
    return userId;
  } catch (error) {
    console.error('Error extracting userId from token:', error);
    // Fall back to userId in the request body if provided
    console.log('Falling back to userId from body after error:', req.body.userId);
    return req.body.userId;
  }
}

// We've completely removed wallet address functionality from the profile service