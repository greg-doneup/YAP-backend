import express from "express";
import { mongo } from "../mon/mongo";

// Stub for auth middleware until it's properly injected in Docker build
const getUserIdFromRequest = (req: express.Request): string | undefined => {
  return 'test-user-id';
};

const getWalletAddressesFromRequest = (req: express.Request) => {
  return { 
    sei: req.body.walletAddress || req.params.wallet || 'test-wallet',
    eth: req.body.ethWalletAddress 
  };
};

const router = express.Router();

/* PATCH /points/add  { walletAddress, amount } */
router.patch("/add", async (req, res, next) => {
  try {
    // Extract information from the authenticated request
    const { sei: userWallet } = getWalletAddressesFromRequest(req);
    const targetWallet = req.body.walletAddress;
    const amount = req.body.amount;
    
    // Only admins can add points to other wallets
    const isOwnWallet = userWallet === targetWallet;
    const isAdmin = (req as any).user?.roles?.includes('admin');
    
    if (!isOwnWallet && !isAdmin) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'You can only add points to your own wallet'
      });
    }
    
    // Validate the amount
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        error: 'invalid_amount',
        message: 'Amount must be a positive number'
      });
    }
    
    // Use the validated wallet address
    const walletToUpdate = isAdmin ? targetWallet : userWallet;
    
    // Add XP points using MongoDB
    const updatedProfile = await mongo.addXP(walletToUpdate, Number(amount));
    
    if (!updatedProfile) {
      return res.status(404).json({
        error: 'profile_not_found',
        message: 'Profile not found for the specified wallet'
      });
    }
    
    res.sendStatus(204);
  } catch (err) { next(err); }
});

/* GET /points/leaderboard?limit=10 */
router.get("/leaderboard", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const leaderboard = await mongo.getLeaderboard(limit);
    res.json(leaderboard);
  } catch (err) { next(err); }
});

export default router;
