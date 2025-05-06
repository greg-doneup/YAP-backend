import { Router } from "express";
import jwt from "jsonwebtoken";
import { startEmail, verifyEmail, createWallet } from "../utils/dynamic";

const APP_JWT_SECRET = process.env.APP_JWT_SECRET!;
const router = Router();

/* ── 1️⃣  POST /auth/login  ─────────────────────────────────────────────
   Body: { email }
   Resp: { verificationUUID }                     (keep the response small)
*/
router.post("/login", async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "email required" });

    const verificationData = await startEmail(email);
    
    // Maintain the same response structure for the frontend
    res.json({ 
      verificationUUID: verificationData.id || verificationData.verificationUUID 
    });
  } catch (err: any) {
    console.error("Login error:", err.response?.data || err.message);
    res.status(500).json({ 
      message: "Login failed", 
      details: err.response?.data?.error || err.message 
    });
  }
});

/* ── 2️⃣  POST /auth/verify  ────────────────────────────────────────────
   Body: { verificationUUID, code }
   Resp: { token, walletAddress }
*/
router.post("/verify", async (req, res, next) => {
  try {
    const { verificationUUID, code } = req.body;
    if (!verificationUUID || !code)
      return res.status(400).json({ message: "verificationUUID and code required" });

    console.log(`Processing verification: UUID=${verificationUUID}, code=${code}`);
    
    // Verify the email code
    const verificationResult = await verifyEmail(verificationUUID, code);
    
    // Extract the user ID from the verification result
    const userId = verificationResult.userId || 
                   verificationResult.user?.id || 
                   (verificationResult.user && typeof verificationResult.user === 'object' ? 
                    verificationResult.user.id : verificationResult.id);
    
    if (!userId) {
      console.error("Failed to extract user ID from verification result:", verificationResult);
      return res.status(500).json({ 
        message: "Verification failed", 
        details: "Could not determine user ID from verification response" 
      });
    }
    
    console.log(`User verified with ID: ${userId}`);
    
    // Create or fetch the user's embedded wallet
    const walletResult = await createWallet(userId);
    
    // Extract wallet address from the wallet creation result
    // Using the new DynamicWallet interface structure
    const walletAddress = walletResult.wallet.address;
    
    console.log(`Wallet created with address: ${walletAddress}`);

    /* Issue **your own** JWT that the app will use for later calls. */
    const token = jwt.sign(
      { walletAddress, sub: userId },  // put whatever claims you need
      APP_JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, walletAddress });
  } catch (err: any) {
    console.error("Verification error:", err.response?.data || err.message);
    res.status(500).json({ 
      message: "Verification failed", 
      details: err.response?.data?.error || err.message,
      data: err.response?.data || err.message
    });
  }
});

export default router;
