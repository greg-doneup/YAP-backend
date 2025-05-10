import express from "express";
import { mongo, Profile, connectToDatabase } from "../mon/mongo";
import { v4 as uuid } from "uuid";

// Get user ID from the verified JWT token in the request
const getUserIdFromRequest = (req: express.Request): string | undefined => {
  return (req as any).user?.sub;
};

// Get wallet addresses from the verified JWT token in the request
const getWalletAddressesFromRequest = (req: express.Request) => {
  return { 
    sei: (req as any).user?.walletAddress || req.params.wallet,
    eth: (req as any).user?.ethWalletAddress
  };
};

const router = express.Router();

// Connect to MongoDB when routes are initialized
connectToDatabase().catch(err => {
  console.error('Failed to connect to MongoDB:', err);
});

/* GET /profile/:wallet */
router.get("/:wallet", async (req, res, next) => {
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
    
    const profile = await mongo.getProfile(requestedWallet);
    
    if (!profile) return res.status(404).json({
      error: 'not_found',
      message: 'Profile not found'
    });
    
    res.json(profile);
  } catch (err) { next(err); }
});

/* POST /profile { walletAddress } */
router.post("/", async (req, res, next) => {
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
    
    try {
      // First check if profile exists - this is now the expected flow
      const existingProfile = await mongo.getProfile(userWallet);
      
      if (existingProfile) {
        // Update with any offchain-specific attributes if needed
        // For now, we're just ensuring up-to-date timestamps
        const updatedProfile = await mongo.updateProfile(userWallet, {
          updatedAt: now
        });
        
        console.log(`Profile already exists for ${userWallet}, updated offchain attributes`);
        return res.status(200).json(updatedProfile);
      }
      
      // If profile doesn't exist (unusual case), create it as before
      console.log(`Creating new profile for ${userWallet} - this should be rare`);
      const prof: Profile = {
        walletAddress: userWallet,
        ethWalletAddress: userEthWallet,
        userId: userId as string,
        xp: 0,
        streak: 0,
        createdAt: now,
        updatedAt: now
      };
      
      await mongo.putProfile(prof);
      res.status(201).json(prof);
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

export default router;
