import { Router } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { createEmbeddedWallet } from "../utils/auth-utils";
import { saveRefreshToken, validateRefreshToken, deleteRefreshToken, deleteSpecificRefreshToken } from "../utils/database";
import { requireAuth } from "../middleware/requireAuth";
import axios from "axios";

const APP_JWT_SECRET = process.env.APP_JWT_SECRET!;
const APP_REFRESH_SECRET = process.env.APP_REFRESH_SECRET || APP_JWT_SECRET + '_refresh';
const ACCESS_TOKEN_EXPIRY = '15m'; // Short-lived access token (15 minutes)
const REFRESH_TOKEN_EXPIRY = '30d'; // Long-lived refresh token (30 days)

// Use the gateway service for profile creation with correct port (80)
// Gateway exposes port 80 externally but maps to 8080 internally
const GATEWAY_SERVICE_URL = process.env.GATEWAY_SERVICE_URL || 'http://gateway-service';  // Port 80 is default
const SKIP_PROFILE_CREATION = process.env.SKIP_PROFILE_CREATION === 'true';

const router = Router();

// Helper function to generate tokens
const generateTokens = async (userId: string, walletAddress: string, ethWalletAddress: string) => {
  // Get current timestamp for JWT issuance
  const issuedAt = Math.floor(Date.now() / 1000);
  
  // Generate access token
  const accessToken = jwt.sign(
    { 
      walletAddress,
      ethWalletAddress,
      sub: userId,
      iat: issuedAt,
      type: 'access'
    },
    APP_JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
  
  // Generate refresh token with a unique identifier
  const refreshTokenId = crypto.randomBytes(32).toString('hex');
  const refreshToken = jwt.sign(
    {
      sub: userId,
      iat: issuedAt,
      jti: refreshTokenId,
      type: 'refresh'
    },
    APP_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
  
  // Store refresh token in database
  await saveRefreshToken(userId, refreshToken);
  
  return { accessToken, refreshToken };
};

// Create/update user profiles in profile services through gateway
const createUserProfiles = async (userId: string, seiWalletAddress: string, ethWalletAddress: string, signupMethod: string) => {
  try {
    // Skip profile creation if environment variable is set
    if (SKIP_PROFILE_CREATION) {
      console.log('Skipping profile creation as SKIP_PROFILE_CREATION is set to true');
      return true;
    }

    console.log(`Attempting to create profiles through gateway at ${GATEWAY_SERVICE_URL}`);
    
    // Profile creation with timeout and better error handling
    const profileData = {
      userId,
      walletAddress: seiWalletAddress,
      ethWalletAddress,
      signupMethod
    };
    
    const axiosConfig = {
      timeout: 10000 // 10 second timeout
    };
    
    let mainProfileCreated = false;
    let offchainProfileCreated = false;
    
    // Create main profile through gateway
    try {
      console.log(`Creating main profile at ${GATEWAY_SERVICE_URL}/profile/profiles`);
      const profileResponse = await axios.post(`${GATEWAY_SERVICE_URL}/profile/profiles`, profileData, axiosConfig);
      console.log(`✅ Created profile in main profile service: Status ${profileResponse.status}`);
      mainProfileCreated = true;
    } catch (error: any) {
      if (error.response) {
        // The request was made and the server responded with a non-2xx status code
        console.error(`❌ Failed to create main profile - Status: ${error.response.status}`);
        console.error('Error details:', error.response.data);
      } else if (error.request) {
        // The request was made but no response was received
        console.error(`❌ No response from profile service: ${error.message}`);
        console.error(`Request details: ${JSON.stringify(error.request._header || {})}`);
      } else {
        // Something happened in setting up the request
        console.error(`❌ Request setup error: ${error.message}`);
      }
    }
    
    // Create offchain profile directly (offchain-profile doesn't seem to have a gateway endpoint)
    try {
      // Try via gateway first
      console.log(`Creating offchain profile via direct connection`);
      // Use kubectl port-forward if all else fails and the pods can't communicate directly
      const offchainResponse = await axios.post(`http://offchain-profile:8080/profiles`, profileData, axiosConfig);
      console.log(`✅ Created offchain profile: Status ${offchainResponse.status}`);
      offchainProfileCreated = true;
    } catch (error: any) {
      console.error(`❌ Failed to create offchain profile: ${error.message}`);
      // Don't rethrow - we'll continue even if this fails
    }
    
    // Report success as long as one profile was created
    return mainProfileCreated || offchainProfileCreated;
  } catch (error: any) {
    console.error('Error creating user profiles:', error.message);
    // Return true to continue authentication even if profile creation fails
    return true;
  }
};

/* ── 1️⃣  POST /auth/wallet  ────────────────────────────────────────────
   Body: { walletAddress, ethWalletAddress, signupMethod }
   Resp: { token, refreshToken, walletAddress, ethWalletAddress, userId }
   
   Direct wallet authentication 
*/
router.post("/wallet", async (req, res) => {
  try {
    const { walletAddress, ethWalletAddress, signupMethod = "wallet" } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({ message: "walletAddress required" });
    }
    
    // Generate a consistent userId from the wallet address
    const userId = crypto.createHash('sha256')
      .update(walletAddress)
      .digest('hex')
      .substring(0, 24);
    
    // Associate wallets with the user
    const walletResult = await createEmbeddedWallet(
      userId,
      walletAddress,
      ethWalletAddress
    );
    
    const seiWalletAddress = walletResult.wallet.address;
    const userEthWalletAddress = walletResult.ethWallet?.address || '';
    
    // Generate tokens first so authentication succeeds even if profile creation fails
    const { accessToken, refreshToken } = await generateTokens(
      userId, 
      seiWalletAddress,
      userEthWalletAddress
    );
    
    // Now create profiles as a background task (non-blocking)
    // This ensures the auth endpoint responds quickly
    createUserProfiles(
      userId, 
      seiWalletAddress, 
      userEthWalletAddress, 
      signupMethod
    ).catch(error => {
      console.error('Profile creation failed in background:', error);
    });
    
    res.json({
      token: accessToken,
      refreshToken,
      walletAddress: seiWalletAddress,
      ethWalletAddress: userEthWalletAddress,
      userId
    });
  } catch (err: any) {
    console.error("Direct wallet auth error:", err.message);
    res.status(500).json({
      message: "Wallet authentication failed",
      details: err.message
    });
  }
});

/* ── 2️⃣  POST /auth/refresh  ───────────────────────────────────────────
   Body: { refreshToken, walletAddress?, ethWalletAddress? }
   Resp: { token, refreshToken }
*/
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken, walletAddress, ethWalletAddress } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }
    
    // Verify the refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, APP_REFRESH_SECRET) as jwt.JwtPayload;
    } catch (err: any) {
      // Provide more specific error information
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: "Refresh token has expired" });
      }
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    
    // Check token type
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ message: "Invalid token type" });
    }
    
    const userId = decoded.sub as string;
    
    // Validate against stored refresh token
    const isValid = await validateRefreshToken(userId, refreshToken);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid or revoked refresh token" });
    }
    
    // SECURITY: Implement token rotation - invalidate the used refresh token
    await deleteSpecificRefreshToken(userId, refreshToken);
    
    // Get or create the user's wallet with provided addresses if available
    const walletResult = await createEmbeddedWallet(userId, walletAddress, ethWalletAddress);
    
    // Generate new tokens
    const tokens = await generateTokens(
      userId, 
      walletResult.wallet.address,
      walletResult.ethWallet?.address || ''
    );
    
    res.json({ 
      token: tokens.accessToken, 
      refreshToken: tokens.refreshToken,
      walletAddress: walletResult.wallet.address,
      ethWalletAddress: walletResult.ethWallet?.address,
      userId
    });
  } catch (err: any) {
    console.error("Token refresh error:", err);
    res.status(500).json({ 
      message: "Token refresh failed", 
      details: err.message 
    });
  }
});

/* ── 3️⃣ POST /auth/logout ────────────────────────────────────────────
   Header: Authorization: Bearer <token>
   Resp: { message: "Successfully logged out" }
*/
router.post("/logout", requireAuth(APP_JWT_SECRET), async (req: any, res) => {
  try {
    const userId = req.user.sub;
    
    // Delete the refresh token from storage
    await deleteRefreshToken(userId);
    
    res.json({ message: "Successfully logged out" });
  } catch (err: any) {
    console.error("Logout error:", err);
    res.status(500).json({ 
      message: "Logout failed", 
      details: err.message 
    });
  }
});

/* ── 4️⃣ GET /auth/validate ───────────────────────────────────────────
   Header: Authorization: Bearer <token>
   Resp: { userId, walletAddress, ethWalletAddress }
*/
router.get("/validate", requireAuth(APP_JWT_SECRET), (req: any, res) => {
  // The requireAuth middleware has already verified the token
  res.json({ 
    userId: req.user.sub,
    walletAddress: req.user.walletAddress,
    ethWalletAddress: req.user.ethWalletAddress
  });
});

/* ── 5️⃣ POST /auth/revoke ────────────────────────────────────────────
   Header: Authorization: Bearer <token>
   Body: { refreshToken }
   Resp: { message: "Token revoked" } or error message
*/
router.post("/revoke", requireAuth(APP_JWT_SECRET), async (req: any, res) => {
  try {
    const userId = req.user.sub;
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }
    
    // Verify the refresh token belongs to the current user
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, APP_REFRESH_SECRET) as jwt.JwtPayload;
      if (decoded.sub !== userId) {
        return res.status(403).json({ message: "Cannot revoke token belonging to another user" });
      }
    } catch (err) {
      // We'll still try to delete it from storage even if verification fails
    }
    
    // Attempt to delete the specific refresh token
    const deleted = await deleteSpecificRefreshToken(userId, refreshToken);
    
    if (deleted) {
      res.json({ message: "Token revoked" });
    } else {
      res.status(404).json({ message: "Token not found" });
    }
  } catch (err: any) {
    console.error("Token revocation error:", err);
    res.status(500).json({ 
      message: "Token revocation failed", 
      details: err.message 
    });
  }
});

export default router;
