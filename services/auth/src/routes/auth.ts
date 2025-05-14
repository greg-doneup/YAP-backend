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

// Use the gateway service and profile service with correct ports and endpoints
// In Kubernetes, services typically expose port 80 externally (mapped to container port)
const GATEWAY_SERVICE_URL = process.env.GATEWAY_SERVICE_URL || 'http://gateway-service';
const PROFILE_SERVICE_URL = process.env.PROFILE_SERVICE_URL || 'http://profile-service';
const OFFCHAIN_PROFILE_URL = process.env.OFFCHAIN_PROFILE_URL || 'http://offchain-profile';
const SKIP_PROFILE_CREATION = process.env.SKIP_PROFILE_CREATION === 'true';

const router = Router();

// Function to fetch user's lesson progress from the learning service
const getUserLessonProgress = async (userId: string) => {
  try {
    const response = await axios.get(`${GATEWAY_SERVICE_URL}/learning/progress?minimal=true`, {
      params: { userId },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SERVICE_API_TOKEN}` // Use a service token for authentication
      }
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // If 404 error, the user doesn't have progress yet
      if (error.response?.status === 404) {
        console.log(`No lesson progress found for user ${userId}, using default values`);
        // Return default progress values for new users
        return {
          currentLessonId: 'lesson-1', // Default first lesson
          currentWordId: 'word-1',     // Default first word
          nextWordAvailableAt: new Date().toISOString() // Available now
        };
      }
      console.error(`Failed to fetch lesson progress for user ${userId}:`, error.response?.data || error.message);
    } else {
      console.error(`Unexpected error while fetching lesson progress for user ${userId}:`, error);
    }
    
    // Still return default values on error to prevent auth failures
    return {
      currentLessonId: 'lesson-1',
      currentWordId: 'word-1',
      nextWordAvailableAt: new Date().toISOString()
    };
  }
};

// Helper function to generate tokens
const generateTokens = async (userId: string, walletAddress: string, ethWalletAddress: string) => {
  // Get current timestamp for JWT issuance
  const issuedAt = Math.floor(Date.now() / 1000);

  // Fetch user's current lesson progress from the learning service
  const { currentLessonId, currentWordId, nextWordAvailableAt } = await getUserLessonProgress(userId);

  // Generate access token
  const accessToken = jwt.sign(
    { 
      walletAddress,
      ethWalletAddress,
      sub: userId,
      iat: issuedAt,
      type: 'access',
      currentLessonId,
      currentWordId,
      nextWordAvailableAt
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

// Helper function to generate a service token for profile service authentication
const generateServiceToken = async (userId: string, walletAddress: string, ethWalletAddress: string) => {
  // Generate a short-lived token for service-to-service communication
  const token = jwt.sign(
    { 
      walletAddress,
      ethWalletAddress,
      sub: userId,
      type: 'access'
    },
    APP_JWT_SECRET,
    { expiresIn: '1m' } // Very short expiry for service calls
  );
  
  return token;
};

// Create/update user profiles in profile services through gateway
const createUserProfiles = async (userId: string, seiWalletAddress: string, ethWalletAddress: string, signupMethod: string) => {
  try {
    // Skip profile creation if environment variable is set
    if (SKIP_PROFILE_CREATION) {
      console.log('Skipping profile creation as SKIP_PROFILE_CREATION is set to true');
      return true;
    }

    console.log(`Attempting to create profiles`);
    
    // Profile creation with timeout and better error handling
    const profileData = {
      userId,
      walletAddress: seiWalletAddress,
      ethWalletAddress,
      signupMethod
    };
    
    console.log('Profile data:', JSON.stringify(profileData));
    
    const axiosConfig = {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${await generateServiceToken(userId, seiWalletAddress, ethWalletAddress)}`
      }
    };
    
    let mainProfileCreated = false;
    
    // STEP 1: First create the base profile in the main profile service
    try {
      console.log(`Trying direct connection to profile service at ${PROFILE_SERVICE_URL}/profile`);
      const profileResponse = await axios.post(`${PROFILE_SERVICE_URL}/profile`, profileData, axiosConfig);
      console.log(`✅ Created profile in main profile service: Status ${profileResponse.status}`);
      mainProfileCreated = true;
    } catch (error: any) {
      // Check if error is due to profile already existing (409 Conflict)
      if (error.response && error.response.status === 409) {
        console.log(`ℹ️ Profile already exists in main profile service`);
        mainProfileCreated = true;
      } else {
        console.error(`❌ Failed direct connection to profile service:`, error.message);
        
        // Fallback to gateway service if direct connection fails
        try {
          console.log(`Falling back to gateway: ${GATEWAY_SERVICE_URL}/profile`);
          const profileResponse = await axios.post(
            `${GATEWAY_SERVICE_URL}/profile?t=${Date.now()}`, 
            profileData, 
            axiosConfig
          );
          console.log(`✅ Created profile via gateway: Status ${profileResponse.status}`);
          mainProfileCreated = true;
        } catch (gatewayError: any) {
          // Check if gateway error is due to profile already existing
          if (gatewayError.response && gatewayError.response.status === 409) {
            console.log(`ℹ️ Profile already exists via gateway`);
            mainProfileCreated = true;
          } else {
            console.error(`❌ Gateway fallback also failed:`, gatewayError.message);
          }
        }
      }
    }
    
    // Only proceed with offchain profile if main profile was created or already exists
    if (mainProfileCreated) {
      // STEP 2: Now handle the offchain profile, which will update the existing document
      try {
        console.log(`Updating offchain attributes via direct connection to ${OFFCHAIN_PROFILE_URL}/profile`);
        const offchainResponse = await axios.post(`${OFFCHAIN_PROFILE_URL}/profile`, profileData, axiosConfig);
        console.log(`✅ Updated offchain profile: Status ${offchainResponse.status}`);
        return true;
      } catch (error: any) {
        // Even if offchain update fails, we still have the main profile
        if (error.response && error.response.status === 409) {
          console.log(`ℹ️ Offchain profile already exists for user ${userId}`);
          return true;
        } else {
          console.error(`❌ Failed to update offchain profile: ${error.message}`);
          // Return true since the main profile exists
          return true;
        }
      }
    }
    
    return mainProfileCreated;
  } catch (error: any) {
    console.error('Error creating user profiles:', error.message);
    // Return true to continue authentication even if profile creation fails
    return true;
  }
};

/* ── 1️⃣  POST /auth/wallet  ────────────────────────────────────────────
   Body: { userId, walletAddress, ethWalletAddress, signupMethod }
   Resp: { token, refreshToken, walletAddress, ethWalletAddress, userId }
   
   Direct wallet authentication 
*/
router.post("/wallet", async (req, res) => {
  try {
    const { userId, walletAddress, ethWalletAddress, signupMethod = "wallet" } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({ message: "walletAddress required" });
    }
    
    if (!userId) {
      return res.status(400).json({ message: "userId required" });
    }
    
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
