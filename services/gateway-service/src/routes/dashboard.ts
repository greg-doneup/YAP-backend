import { Router } from "express";
import { internal } from "../clients/internal";

const router = Router();
router.get("/", async (req, res, next) => {
  try {
    // Dashboard endpoint requires no authentication (public demo)
    const demoWallet = "0x0000000000000000000000000000000000000000"; // Demo wallet address
    const [prof, bal] = await Promise.all([
      internal.get(`http://offchain-profile/profile/${demoWallet}`),
      internal.get(`http://reward-service/yap/balance/${demoWallet}`)
    ]);

    res.json({
      wallet: demoWallet,
      xp: prof.data.xp || 0,
      streak: prof.data.streak || 0,
      yapBalance: bal.data.balance || 0,
      note: "Demo dashboard - no authentication required"
    });
  } catch (err) { 
    // Return demo data if services are not available
    res.json({
      wallet: "0x0000000000000000000000000000000000000000",
      xp: 0,
      streak: 0,
      yapBalance: 0,
      note: "Demo dashboard - services offline"
    });
  }
});
export default router;
