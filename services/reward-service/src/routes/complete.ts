import { Router } from "express";
import { completionContract } from "../ethers";

const router = Router();
router.post("/", async (req, res, next) => {
  try {
    const tx = await completionContract().complete({ gasLimit: 120000 });
    const receipt = await tx.wait();
    res.json({ txHash: receipt.hash });
  } catch (err) { next(err); }
});
export default router;
