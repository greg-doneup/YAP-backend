/**
 * Example Integration: Auth Service with Token Middleware
 * 
 * This demonstrates how to integrate the token middleware into the Auth Service routes
 * to provide token-aware authentication and user management.
 */

import express from 'express';
import { 
  tokenAuthMiddleware,
  loadUserTokenData,
  initializeNewUserTokens,
  validateTokenSpending,
  processTokenSpending
} from './middleware/token-auth';

const router = express.Router();

// ========================================
// ENHANCED AUTH ROUTES WITH TOKEN INTEGRATION
// ========================================

/**
 * POST /auth/login - Login with token data loading
 */
router.post('/login', async (req, res, next) => {
  try {
    // ... existing login logic ...
    
    // After successful authentication, load token data
    await loadUserTokenData()(req, res, next);
    
    res.json({
      message: 'Login successful',
      user: req.user,
      tokenData: req.user?.tokenData // Include token data in response
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/register - Registration with token initialization
 */
router.post('/register', async (req, res, next) => {
  try {
    // ... existing registration logic ...
    
    // After successful registration, initialize token system
    await initializeNewUserTokens()(req, res, next);
    
    res.json({
      message: 'Registration successful',
      user: req.user,
      tokenData: req.user?.tokenData,
      welcomeBonus: {
        amount: 100,
        message: 'Welcome! You\'ve received 100 YAP tokens to get started.'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /auth/profile - Get user profile with token status
 */
router.get('/profile', 
  loadUserTokenData(), 
  async (req, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const tokenStatus = await tokenAuthMiddleware.getUserTokenStatus(req.user.id);
      
      res.json({
        user: req.user,
        tokenStatus,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user profile' });
    }
  }
);

/**
 * POST /auth/reset-password - Password reset with token validation
 * Example of a protected action that costs tokens
 */
router.post('/reset-password',
  validateTokenSpending('exam_attempt', 1), // Example: password reset costs 5 tokens
  async (req, res, next) => {
    try {
      // ... existing password reset logic ...
      
      // After successful reset, process token spending
      await processTokenSpending()(req, res, next);
      
      res.json({
        message: 'Password reset successful',
        tokenCost: (req as any).tokenSpending?.cost || 0
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /auth/token-status - Get detailed token status
 */
router.get('/token-status', async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const tokenStatus = await tokenAuthMiddleware.getUserTokenStatus(req.user.id);
    
    if (!tokenStatus) {
      return res.status(404).json({ error: 'Token data not found' });
    }

    res.json({
      tokenBalance: tokenStatus.tokenBalance,
      dailyAllowances: tokenStatus.dailyAllowances,
      stakingPools: tokenStatus.stakingPools,
      totalEarned: tokenStatus.totalEarned,
      totalSpent: tokenStatus.totalSpent,
      walletAddress: tokenStatus.walletAddress,
      lastChecked: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get token status' });
  }
});

/**
 * POST /auth/sync-wallet - Sync wallet balance with on-chain data
 */
router.post('/sync-wallet', async (req, res) => {
  try {
    if (!req.user?.id || !req.user?.walletAddress) {
      return res.status(401).json({ error: 'Authentication and wallet required' });
    }

    // TODO: Implement wallet sync logic
    // await tokenAuthMiddleware.syncWalletBalance(req.user.id, req.user.walletAddress);
    
    res.json({
      message: 'Wallet sync initiated',
      walletAddress: req.user.walletAddress,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to sync wallet' });
  }
});

export default router;

// ========================================
// MIDDLEWARE SETUP EXAMPLES
// ========================================

/**
 * Example: How to apply token middleware globally to the Auth Service
 */
export const setupTokenMiddleware = (app: express.Application) => {
  // Apply token data loading to all authenticated routes
  app.use('/auth', loadUserTokenData());
  
  // Daily reset check (could be run as a cron job instead)
  app.use('/auth', async (req, res, next) => {
    if (req.user?.id) {
      await tokenAuthMiddleware.checkDailyReset(req.user.id);
    }
    next();
  });
};

/**
 * Example: Token-protected route factory
 */
export const createTokenProtectedRoute = (
  featureId: string,
  quantity: number = 1,
  handler: express.RequestHandler
) => {
  return [
    validateTokenSpending(featureId as any, quantity),
    handler,
    processTokenSpending()
  ];
};
