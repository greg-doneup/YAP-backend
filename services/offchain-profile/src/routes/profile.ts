import express from "express";
import { mongo, Profile, connectToDatabase } from "../mon/mongo";

// Get user ID from the verified JWT token in the request
const getUserIdFromRequest = (req: express.Request): string | undefined => {
  return (req as any).user?.sub;
};

// Get wallet addresses from the verified JWT token in the request
const getWalletAddressesFromRequest = (req: express.Request) => {
  return { 
    eth: (req as any).user?.ethWalletAddress
  };
};

const router = express.Router();

// Connect to MongoDB when routes are initialized
connectToDatabase().catch(err => {
  console.error('Failed to connect to MongoDB:', err);
});

/* GET /profile/:userId */
router.get("/:userId", async (req, res, next) => {
  try {
    // Verify user ID ownership or admin access
    const userIdFromToken = getUserIdFromRequest(req);
    const requestedUserId = req.params.userId;
    
    // Only allow users to access their own profile unless they have admin role
    const isOwnProfile = userIdFromToken === requestedUserId;
    const isAdmin = (req as any).user?.roles?.includes('admin');
    
    if (!isOwnProfile && !isAdmin) {
      return res.status(403).json({ 
        error: 'forbidden',
        message: 'You can only access your own profile' 
      });
    }
    
    const profile = await mongo.getProfile(requestedUserId);
    
    if (!profile) return res.status(404).json({
      error: 'not_found',
      message: 'Profile not found'
    });
    
    res.json(profile);
  } catch (err) { next(err); }
});

/* POST /profile */
router.post("/", async (req, res, next) => {
  try {
    const { eth: userEthWallet } = getWalletAddressesFromRequest(req);
    const userId = getUserIdFromRequest(req);
    
    if (!userId) {
      return res.status(400).json({ 
        error: 'missing_user_id',
        message: 'No user ID found in the token' 
      });
    }
    
    const now = new Date().toISOString();
    
    try {
      // First check if profile exists
      const existingProfile = await mongo.getProfile(userId);
      
      if (existingProfile) {
        // Update with any offchain-specific attributes if needed
        const updatedProfile = await mongo.updateProfile(userId, {
          updatedAt: now
        });
        
        console.log(`Profile already exists for user ${userId}, updated offchain attributes`);
        return res.status(200).json(updatedProfile);
      }
      
      // If profile doesn't exist (unusual case), create it
      const prof: Profile = {
        userId,
        ethWalletAddress: userEthWallet,
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
          message: 'Profile already exists for this user' 
        });
      }
      throw err;
    }
  } catch (err) { next(err); }
});

/* PATCH /profile/:userId { streak?, xp? } */
router.patch("/:userId", async (req, res, next) => {
  try {
    // Verify user ID ownership or admin access
    const userIdFromToken = getUserIdFromRequest(req);
    const requestedUserId = req.params.userId;
    
    // Only allow users to update their own profile unless they have admin role
    const isOwnProfile = userIdFromToken === requestedUserId;
    const isAdmin = (req as any).user?.roles?.includes('admin');
    
    if (!isOwnProfile && !isAdmin) {
      return res.status(403).json({ 
        error: 'forbidden',
        message: 'You can only update your own profile' 
      });
    }
    
    const now = new Date().toISOString();
    const updates: Record<string, any> = { 
      updatedAt: now,
      ...req.body 
    };

    const updatedProfile = await mongo.updateProfile(requestedUserId, updates);
    
    if (!updatedProfile) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Profile not found'
      });
    }
    
    res.sendStatus(204);
  } catch (err) { next(err); }
});

export default router;
