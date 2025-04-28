import { Router } from "express";
import { reward } from "../sei";

const router = Router();
const CONTRACT = process.env.DAILY_CONTRACT!;

router.post("/", async (req, res, next) => {
  try {
    const { walletAddress } = req.body;
    const tx = await reward(walletAddress, CONTRACT);
    res.json({ txHash: tx });
  } catch (err) { next(err); }
});

export default router;
