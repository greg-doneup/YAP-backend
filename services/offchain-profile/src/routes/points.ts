import express from "express";
import { mongo } from "../mon/mongo";

// Get user ID from the verified JWT token in the request
const getUserIdFromRequest = (req: express.Request): string | undefined => {
  return (req as any).user?.sub;
};

const router = express.Router();

/* PATCH /points/add  { userId, amount } */
router.patch("/add", async (req, res, next) => {
  try {
    // Extract information from the authenticated request
    const userIdFromToken = getUserIdFromRequest(req);
    const targetUserId = req.body.userId;
    const amount = req.body.amount;
    
    // Only admins can add points to other users
    const isOwnProfile = userIdFromToken === targetUserId;
    const isAdmin = (req as any).user?.roles?.includes('admin');
    
    if (!isOwnProfile && !isAdmin) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'You can only add points to your own profile'
      });
    }
    
    // Validate the amount
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        error: 'invalid_amount',
        message: 'Amount must be a positive number'
      });
    }
    
    // Use the validated user ID
    const userIdToUpdate = isAdmin ? targetUserId : userIdFromToken;
    
    // Add XP points using MongoDB
    const updatedProfile = await mongo.addXP(userIdToUpdate, Number(amount));
    
    if (!updatedProfile) {
      return res.status(404).json({
        error: 'profile_not_found',
        message: 'Profile not found for the specified user'
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
