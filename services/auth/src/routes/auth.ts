import { Router } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { saveRefreshToken, validateRefreshToken, deleteRefreshToken, deleteSpecificRefreshToken } from "../utils/database";
import { requireAuth } from "../middleware/requireAuth";
import axios from "axios";

const APP_JWT_SECRET = process.env.APP_JWT_SECRET!;
const APP_REFRESH_SECRET = process.env.APP_REFRESH_SECRET || APP_JWT_SECRET + '_refresh';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '30d';

const GATEWAY_SERVICE_URL = process.env.GATEWAY_SERVICE_URL || 'http://gateway-service';
const PROFILE_SERVICE_URL = process.env.PROFILE_SERVICE_URL || 'http://profile-service';
const SKIP_PROFILE_CREATION = process.env.SKIP_PROFILE_CREATION === 'true';

const router = Router();

// Function to fetch user's lesson progress from the learning service
const getUserLessonProgress = async (userId: string) => {
  try {
    const response = await axios.get(`${GATEWAY_SERVICE_URL}/learning/progress?minimal=true`, {
      params: { userId },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SERVICE_API_TOKEN}`
      }
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        console.log(`No lesson progress found for user ${userId}, using default values`);
        return {
          currentLessonId: 'lesson-1',
          currentWordId: 'word-1',
          nextWordAvailableAt: new Date().toISOString()
        };
      }
      console.error(`Failed to fetch lesson progress for user ${userId}:`, error.response?.data || error.message);
    } else {
      console.error(`Unexpected error while fetching lesson progress for user ${userId}:`, error);
    }
    
    return {
      currentLessonId: 'lesson-1',
      currentWordId: 'word-1',
      nextWordAvailableAt: new Date().toISOString()
    };
  }
};

// Helper function to generate tokens
const generateTokens = async (userId: string) => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const { currentLessonId, currentWordId, nextWordAvailableAt } = await getUserLessonProgress(userId);

  const accessToken = jwt.sign(
    { 
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

  await saveRefreshToken(userId, refreshToken);

  return { accessToken, refreshToken };
};

// Helper function to generate a service token for profile service authentication
const generateServiceToken = (userId: string) => {
  return jwt.sign(
    { 
      sub: userId,
      type: 'access'
    },
    APP_JWT_SECRET,
    { expiresIn: '1m' }
  );
};

// Create user profile in profile service
const createUserProfile = async (userId: string, email: string, languageToLearn: string, name: string) => {
  try {
    if (SKIP_PROFILE_CREATION) {
      console.log('Skipping profile creation as SKIP_PROFILE_CREATION is set to true');
      return true;
    }

    console.log(`Attempting to create profile for user ${userId}`);
    
    const profileData = {
      userId,
      email,
      name,
      initial_language_to_learn: languageToLearn
    };
    
    console.log('Profile data:', JSON.stringify(profileData));
    
    const axiosConfig = {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${generateServiceToken(userId)}`
      }
    };
    
    try {
      console.log(`Creating profile via ${PROFILE_SERVICE_URL}/profile`);
      const response = await axios.post(`${PROFILE_SERVICE_URL}/profile`, profileData, axiosConfig);
      console.log(`✅ Created profile: Status ${response.status}`);
      return true;
    } catch (error: any) {
      if (error.response?.status === 409) {
        console.log(`ℹ️ Profile already exists for user ${userId}`);
        return true;
      }
      
      console.error(`❌ Failed to create profile via direct connection:`, error.message);
      
      // Fallback to gateway
      try {
        console.log(`Falling back to gateway: ${GATEWAY_SERVICE_URL}/profile`);
        const response = await axios.post(
          `${GATEWAY_SERVICE_URL}/profile`,
          profileData,
          axiosConfig
        );
        console.log(`✅ Created profile via gateway: Status ${response.status}`);
        return true;
      } catch (gatewayError: any) {
        if (gatewayError.response?.status === 409) {
          console.log(`ℹ️ Profile already exists via gateway`);
          return true;
        }
        console.error(`❌ Gateway fallback failed:`, gatewayError.message);
        throw gatewayError;
      }
    }
  } catch (error: any) {
    console.error('Error creating user profile:', error.message);
    throw error;
  }
};

/* ── POST /auth/wallet (now handles initial signup) ────────────────────────
   Body: { name, email, language_to_learn }
   Resp: { token, refreshToken, userId }
*/
router.post("/wallet", async (req, res) => {
  try {
    const { name, email, language_to_learn } = req.body;
    
    // Validate required fields
    if (!email) {
      return res.status(400).json({ message: "email required" });
    }
    if (!name) {
      return res.status(400).json({ message: "name required" });
    }
    if (!language_to_learn) {
      return res.status(400).json({ message: "language_to_learn required" });
    }

    // Check email uniqueness
    try {
      // if this call succeeds, email already exists
      await axios.get(`${PROFILE_SERVICE_URL}/profile/email/${encodeURIComponent(email)}`);
      return res.status(409).json({ message: "Email already registered" });
    } catch (err: any) {
      if (err.response?.status !== 404) {
        console.error('Error checking email uniqueness:', err.message);
        return res.status(500).json({ message: 'Error validating email uniqueness' });
      }
      // 404 means email not found, proceed
    }

    // Generate a unique user ID (32 random bytes converted to hex = 64 chars)
    const userId = crypto.randomBytes(32).toString('hex');

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokens(userId);
    
    // Create user profile
    try {
      await createUserProfile(userId, email, language_to_learn, name);
    } catch (error: any) {
      console.error('Failed to create user profile:', error);
      return res.status(500).json({
        message: "Failed to create user profile",
        details: error.message
      });
    }
    
    res.json({
      token: accessToken,
      refreshToken,
      userId
    });
  } catch (err: any) {
    console.error("Signup error:", err.message);
    res.status(500).json({
      message: "Signup failed",
      details: err.message
    });
  }
});

/* ── POST /auth/refresh ───────────────────────────────────────────
   Body: { refreshToken }
   Resp: { token, refreshToken }
*/
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }
    
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, APP_REFRESH_SECRET) as jwt.JwtPayload;
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: "Refresh token has expired" });
      }
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ message: "Invalid token type" });
    }
    
    const userId = decoded.sub as string;
    
    const isValid = await validateRefreshToken(userId, refreshToken);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid or revoked refresh token" });
    }
    
    // Invalidate the used refresh token
    await deleteSpecificRefreshToken(userId, refreshToken);
    
    // Generate new tokens
    const tokens = await generateTokens(userId);
    
    res.json({ 
      token: tokens.accessToken, 
      refreshToken: tokens.refreshToken,
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

/* ── POST /auth/logout ────────────────────────────────────────────
   Header: Authorization: Bearer <token>
   Resp: { message: "Successfully logged out" }
*/
router.post("/logout", requireAuth(APP_JWT_SECRET), async (req: any, res) => {
  try {
    const userId = req.user.sub;
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

/* ── GET /auth/validate ───────────────────────────────────────────
   Header: Authorization: Bearer <token>
   Resp: { userId }
*/
router.get("/validate", requireAuth(APP_JWT_SECRET), (req: any, res) => {
  res.json({ 
    userId: req.user.sub
  });
});

/* ── POST /auth/revoke ────────────────────────────────────────────
   Header: Authorization: Bearer <token>
   Body: { refreshToken }
   Resp: { message: "Token revoked" }
*/
router.post("/revoke", requireAuth(APP_JWT_SECRET), async (req: any, res) => {
  try {
    const userId = req.user.sub;
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }
    
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, APP_REFRESH_SECRET) as jwt.JwtPayload;
      if (decoded.sub !== userId) {
        return res.status(403).json({ message: "Cannot revoke token belonging to another user" });
      }
    } catch (err) {
      // We'll still try to delete it from storage even if verification fails
    }
    
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
