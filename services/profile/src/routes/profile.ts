import express from 'express';
import { connectToDatabase, getItem, putItem, updateItem } from '../mon/mongo';
import { Profile } from '../types';
import { v4 as uuid } from 'uuid';
import { getUserIdFromRequest, getWalletAddressesFromRequest } from '../shared/auth/authMiddleware';

const router = express.Router();

// Initialize MongoDB connection
connectToDatabase().catch(err => {
  console.error('Failed to connect to MongoDB:', err);
});

/** GET /profile/:wallet */
router.get('/:wallet', async (req, res, next) => {
  try {
    // Verify wallet ownership or admin access
    const { sei: userWallet } = getWalletAddressesFromRequest(req);
    const requestedWallet = req.params.wallet;
    
    // Only allow users to access their own profile unless they have admin role
    const isOwnProfile = userWallet === requestedWallet;
    const isAdmin = (req as any).user?.roles?.includes('admin');
    
    if (!isOwnProfile && !isAdmin) {
      return res.status(403).json({ 
        error: 'forbidden',
        message: 'You can only access your own profile' 
      });
    }
    
    const { Item } = await getItem(requestedWallet);
    if (!Item) return res.status(404).json({
      error: 'not_found',
      message: 'Profile not found'
    });
    res.json(Item);
  } catch (err) { next(err); }
});

/** POST /profile  { walletAddress } */
router.post('/', async (req, res, next) => {
  try {
    const { sei: userWallet, eth: userEthWallet } = getWalletAddressesFromRequest(req);
    const userId = getUserIdFromRequest(req);
    
    // Use the authenticated wallet address instead of relying on request body
    if (!userWallet) {
      return res.status(400).json({ 
        error: 'missing_wallet',
        message: 'No wallet address associated with this account' 
      });
    }
    
    const now = new Date().toISOString();
    const profile: Profile = {
      userId: userId as string,   // Associate profile with user ID
      walletAddress: userWallet,  // Use authenticated wallet from token
      ethWalletAddress: userEthWallet,  // Add Ethereum wallet if available
      streak: 0,
      xp: 0,
      createdAt: now,
      updatedAt: now,
    };
    
    try {
      // First check if profile exists
      const { Item: existingProfile } = await getItem(userWallet);
      
      if (existingProfile) {
        return res.status(409).json({ 
          error: 'profile_exists',
          message: 'Profile for this wallet already exists' 
        });
      }
      
      await putItem(profile);
      res.status(201).json(profile);
    } catch (err: any) {
      // Handle duplicate key error from MongoDB (fallback)
      if (err.code === 11000) {
        return res.status(409).json({ 
          error: 'profile_exists',
          message: 'Profile for this wallet already exists' 
        });
      }
      throw err;
    }
  } catch (err) { next(err); }
});

/** PATCH /profile/:wallet { streak?, xp? } */
router.patch('/:wallet', async (req, res, next) => {
  try {
    // Verify wallet ownership or admin access
    const { sei: userWallet } = getWalletAddressesFromRequest(req);
    const requestedWallet = req.params.wallet;
    
    // Only allow users to update their own profile unless they have admin role
    const isOwnProfile = userWallet === requestedWallet;
    const isAdmin = (req as any).user?.roles?.includes('admin');
    
    if (!isOwnProfile && !isAdmin) {
      return res.status(403).json({ 
        error: 'forbidden',
        message: 'You can only update your own profile' 
      });
    }
    
    const now = new Date().toISOString();
    const updates: Record<string, any> = { updatedAt: now };
    if (req.body.streak !== undefined) updates.streak = req.body.streak;
    if (req.body.xp !== undefined) updates.xp = req.body.xp;

    // Format for MongoDB update - equivalent to DynamoDB expression
    const result = await updateItem({
      Key: { userId: requestedWallet },
      UpdateExpression: `SET ${Object.keys(updates).map((k, i) => `#k${i} = :v${i}`).join(', ')}`,
      ExpressionAttributeNames: Object.keys(updates).reduce((acc, k, i) => ({ ...acc, [`#k${i}`]: k }), {}),
      ExpressionAttributeValues: Object.values(updates).reduce((acc, v, i) => ({ ...acc, [`:v${i}`]: v }), {})
    });
    
    if (!result.Attributes) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Profile not found'
      });
    }
    
    res.sendStatus(204);
  } catch (err) { next(err); }
});

export default router;
