import express from 'express';
import { Request, Response } from 'express';

const router = express.Router();

// Mock data structure for daily allowances
interface DailyAllowance {
  featureName: string;
  dailyLimit: number;
  used: number;
  remaining: number;
  resetTime: Date;
}

// GET /daily-allowances - Get current daily allowances for the user
router.get('/', async (req: Request, res: Response) => {
  try {
    // TODO: Replace with real user ID from authentication middleware
    const userId = req.headers.authorization || 'mock-user-id';
    
    // TODO: Replace with real database queries
    // For now, return mock data that represents a new user
    const defaultAllowances: DailyAllowance[] = [
      {
        featureName: 'Daily Lessons',
        dailyLimit: 5,
        used: 0,
        remaining: 5,
        resetTime: getNextResetTime()
      },
      {
        featureName: 'AI Chat', 
        dailyLimit: 10,
        used: 0,
        remaining: 10,
        resetTime: getNextResetTime()
      }
    ];

    console.log(`📊 [DAILY-ALLOWANCES] Retrieved allowances for user: ${userId}`);
    res.json(defaultAllowances);
    
  } catch (error) {
    console.error('Error fetching daily allowances:', error);
    res.status(500).json({ error: 'Failed to fetch daily allowances' });
  }
});

// GET /daily - Get current daily allowances for the user (alias for frontend compatibility)
router.get('/daily', async (req: Request, res: Response) => {
  try {
    // TODO: Replace with real user ID from authentication middleware
    const userId = req.headers.authorization || 'mock-user-id';
    
    // TODO: Replace with real database queries
    // For now, return mock data that represents a new user
    const defaultAllowances: DailyAllowance[] = [
      {
        featureName: 'Daily Lessons',
        dailyLimit: 5,
        used: 0,
        remaining: 5,
        resetTime: getNextResetTime()
      },
      {
        featureName: 'AI Chat', 
        dailyLimit: 10,
        used: 0,
        remaining: 10,
        resetTime: getNextResetTime()
      }
    ];

    console.log(`📊 [DAILY-ALLOWANCES] Retrieved daily allowances for user: ${userId}`);
    res.json(defaultAllowances);
    
  } catch (error) {
    console.error('Error fetching daily allowances:', error);
    res.status(500).json({ error: 'Failed to fetch daily allowances' });
  }
});

// PUT /daily-allowances/usage - Update usage for a specific allowance type
router.put('/usage', async (req: Request, res: Response) => {
  try {
    const { type, amount } = req.body;
    
    if (!type || typeof amount !== 'number') {
      return res.status(400).json({ error: 'Invalid request body. Expected type and amount.' });
    }

    // TODO: Replace with real user ID from authentication middleware
    const userId = req.headers.authorization || 'mock-user-id';
    
    // TODO: Replace with real database update
    console.log(`📊 [DAILY-ALLOWANCES] Updated ${type} usage by ${amount} for user: ${userId}`);
    
    // Return updated allowance (mock response)
    const updatedAllowance: DailyAllowance = {
      featureName: getFeatureName(type),
      dailyLimit: getDefaultLimit(type),
      used: amount, // In real implementation, this would be current usage
      remaining: Math.max(0, getDefaultLimit(type) - amount),
      resetTime: getNextResetTime()
    };

    res.json(updatedAllowance);
    
  } catch (error) {
    console.error('Error updating daily allowance usage:', error);
    res.status(500).json({ error: 'Failed to update allowance usage' });
  }
});

// GET /unlimited - Get unlimited hour passes for the user
router.get('/unlimited', async (req: Request, res: Response) => {
  try {
    // TODO: Replace with real user ID from authentication middleware
    const userId = req.headers.authorization || 'mock-user-id';
    
    // TODO: Replace with real database queries
    // For now, return mock data that represents no active unlimited passes
    const unlimitedPasses = {
      passes: [
        // Mock structure - no active passes for new users
      ]
    };

    console.log(`🎫 [UNLIMITED-PASSES] Retrieved unlimited passes for user: ${userId}`);
    res.json(unlimitedPasses);
    
  } catch (error) {
    console.error('Error fetching unlimited passes:', error);
    res.status(500).json({ error: 'Failed to fetch unlimited passes' });
  }
});

// GET /daily - Get current daily allowances (alternative endpoint)
router.get('/daily', async (req: Request, res: Response) => {
  try {
    // TODO: Replace with real user ID from authentication middleware
    const userId = req.headers.authorization || 'mock-user-id';
    
    // TODO: Replace with real database queries
    // For now, return same mock data as the main endpoint
    const defaultAllowances: DailyAllowance[] = [
      {
        featureName: 'Daily Lessons',
        dailyLimit: 5,
        used: 0,
        remaining: 5,
        resetTime: getNextResetTime()
      },
      {
        featureName: 'AI Chat', 
        dailyLimit: 10,
        used: 0,
        remaining: 10,
        resetTime: getNextResetTime()
      }
    ];

    console.log(`📊 [DAILY-ALLOWANCES-ALT] Retrieved allowances for user: ${userId}`);
    res.json(defaultAllowances);
    
  } catch (error) {
    console.error('Error fetching daily allowances (alternative endpoint):', error);
    res.status(500).json({ error: 'Failed to fetch daily allowances' });
  }
});

// GET /tokens/balance - Get token balance for the user (for frontend compatibility)
router.get('/tokens/balance', async (req: Request, res: Response) => {
  try {
    // TODO: Replace with real user ID from authentication middleware
    const userId = req.headers.authorization || 'mock-user-id';
    
    // TODO: Replace with real blockchain queries
    // For now, return mock token balance data
    const tokenBalance = {
      balance: 1000,        // Available tokens
      stakedBalance: 500,   // Staked tokens
      totalBalance: 1500,   // Total tokens
      lastUpdated: new Date().toISOString()
    };

    console.log(`💰 [TOKEN-BALANCE] Retrieved token balance for user: ${userId}`);
    res.json(tokenBalance);
    
  } catch (error) {
    console.error('Error fetching token balance:', error);
    res.status(500).json({ error: 'Failed to fetch token balance' });
  }
});

// POST /check - Check if user can use a specific feature (for frontend compatibility)
router.post('/check', async (req: Request, res: Response) => {
  try {
    const { featureId, quantity = 1 } = req.body;
    const userId = req.headers.authorization || 'mock-user-id';
    
    console.log(`🔍 [ALLOWANCES-CHECK] Checking feature ${featureId} for user: ${userId}`);
    
    // Map frontend feature IDs to our internal types
    const featureTypeMap: { [key: string]: string } = {
      'ai-chat': 'aiChat',
      'daily-lessons': 'lessons',
      'speech-minutes': 'speechMinutes'
    };
    
    const featureType = featureTypeMap[featureId] || featureId;
    
    // TODO: Replace with real database queries
    // For now, return mock data that allows usage
    const defaultLimit = getDefaultLimit(featureType);
    const used = 0; // Mock: assume no usage yet
    const remaining = defaultLimit - used;
    
    const canUse = remaining >= quantity;
    const featureName = getFeatureName(featureType);
    
    const response = {
      canUse,
      reason: canUse 
        ? `${remaining} free ${featureName} messages remaining today`
        : `Daily limit of ${defaultLimit} ${featureName} messages reached`,
      allowanceRemaining: remaining,
      featureId,
      quantity,
      dailyLimit: defaultLimit,
      used,
      resetTime: getNextResetTime()
    };
    
    console.log(`✅ [ALLOWANCES-CHECK] Result for ${featureId}:`, { canUse, remaining });
    res.json(response);
    
  } catch (error) {
    console.error('Error checking allowances:', error);
    res.status(500).json({ 
      error: 'Failed to check allowances',
      canUse: false,
      reason: 'Service temporarily unavailable'
    });
  }
});

// Helper function to get the next reset time (midnight UTC)
function getNextResetTime(): Date {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow;
}

// Helper function to get default limits by type
function getDefaultLimit(type: string): number {
  switch (type) {
    case 'lessons':
      return 5;
    case 'aiChat':
      return 10;
    case 'speechMinutes':
      return 15;
    default:
      return 0;
  }
}

// Helper function to get feature name from type
function getFeatureName(type: string): string {
  switch (type) {
    case 'lessons':
      return 'Daily Lessons';
    case 'aiChat':
      return 'AI Chat';
    case 'speechMinutes':
      return 'Speech Minutes';
    default:
      return 'Unknown';
  }
}

export default router;
