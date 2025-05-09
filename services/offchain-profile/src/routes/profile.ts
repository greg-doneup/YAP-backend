import express from "express";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import { ddb, TABLE, Profile } from "../dal/dynamo";

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
    
    const { Item } = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { walletAddress: requestedWallet }
    }));
    
    if (!Item) return res.status(404).json({
      error: 'not_found',
      message: 'Profile not found'
    });
    
    res.json(Item);
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
    const prof: Profile = {
      walletAddress: userWallet,  // Use authenticated wallet from token
      ethWalletAddress: userEthWallet, // Add Ethereum wallet if available
      userId: userId as string,   // Associate profile with user ID
      xp: 0,
      streak: 0,
      createdAt: now,
      updatedAt: now
    };
    
    try {
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: prof,
        ConditionExpression: "attribute_not_exists(walletAddress)"
      }));
      res.status(201).json(prof);
    } catch (err: any) {
      // Check for profile already exists error
      if (err.name === 'ConditionalCheckFailedException') {
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
