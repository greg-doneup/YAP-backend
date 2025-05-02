import { Router } from "express";
import { internal } from "../clients/internal";
import { ensureJwt } from "../middleware/authProxy";

const router = Router();
router.get("/", ensureJwt, async (req, res, next) => {
  try {
    const wallet = (req as any).user.walletAddress;
    const [prof, bal] = await Promise.all([
      internal.get(`http://offchain-profile/profile/${wallet}`),
      internal.get(`http://reward-service/yap/balance/${wallet}`)
    ]);

    res.json({
      wallet,
      xp: prof.data.xp,
      streak: prof.data.streak,
      yapBalance: bal.data.balance
    });
  } catch (err) { next(err); }
});
export default router;
