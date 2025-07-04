import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// This is a stub implementation of the authentication middleware
// that will be replaced with the real implementation during Docker build

export function requireAuth(jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check for internal service authentication first
    const serviceSecret = req.headers['x-internal-service-secret'] as string;
    const expectedServiceSecret = process.env.INTERNAL_SERVICE_SECRET;
    
    if (serviceSecret && expectedServiceSecret && serviceSecret === expectedServiceSecret) {
      console.log('Internal service authentication successful');
      // Add a mock user object for internal service calls
      (req as any).user = {
        sub: 'internal-service',
        type: 'internal'
      };
      return next();
    }
    
    // Check for regular JWT authentication
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    
    if (!token) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Access token required'
      });
    }
    
    try {
      const decoded = jwt.verify(token, jwtSecret);
      (req as any).user = decoded;
      next();
    } catch (error) {
      console.error('JWT verification failed:', error);
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid or expired token'
      });
    }
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