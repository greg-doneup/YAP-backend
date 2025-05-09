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
  return 'test-user-id';
}

export function getWalletAddressesFromRequest(req: Request) {
  return { 
    sei: req.body.walletAddress || req.params.wallet || 'test-wallet',
    eth: req.body.ethWalletAddress 
  };
}