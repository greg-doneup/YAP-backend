import { Router } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { saveRefreshToken, validateRefreshToken, deleteRefreshToken, deleteSpecificRefreshToken } from "../utils/database";
import { requireAuth } from "../middleware/requireAuth";
import axios from "axios";
import { SecurityValidator } from "../utils/securityValidator";
import { auditLogger, SecurityEventType } from "../utils/auditLogger";

const APP_JWT_SECRET = process.env.APP_JWT_SECRET!;
const APP_REFRESH_SECRET = process.env.APP_REFRESH_SECRET || APP_JWT_SECRET + '_refresh';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '30d';

const GATEWAY_SERVICE_URL = process.env.GATEWAY_SERVICE_URL || 'http://gateway-service';
const PROFILE_SERVICE_URL = process.env.PROFILE_SERVICE_URL || 'http://profile-service';
const OFFCHAIN_PROFILE_SERVICE_URL = process.env.OFFCHAIN_PROFILE_SERVICE_URL || 'http://offchain-profile-service';
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

// Enhanced profile creation function that includes wallet data
const createUserProfileWithWallet = async (
  userId: string, 
  email: string, 
  languageToLearn: string, 
  name: string,
  walletData: {
    passphrase_hash: string;
    encrypted_mnemonic: string;
    salt: string;
    nonce: string;
    sei_address: string;
    sei_public_key?: string;
    eth_address: string;
    eth_public_key?: string;
  }
) => {
  try {
    if (SKIP_PROFILE_CREATION) {
      console.log('Skipping profile creation as SKIP_PROFILE_CREATION is set to true');
      return true;
    }

    console.log(`Creating profile with wallet data for user ${userId}`);
    
    const profileData = {
      userId,
      email,
      name,
      initial_language_to_learn: languageToLearn,
      wlw: true, // Has wallet
      passphrase_hash: walletData.passphrase_hash,
      encrypted_wallet_data: {
        encrypted_mnemonic: walletData.encrypted_mnemonic,
        salt: walletData.salt,
        nonce: walletData.nonce,
        sei_address: walletData.sei_address,
        eth_address: walletData.eth_address
      },
      sei_wallet: {
        address: walletData.sei_address,
        public_key: walletData.sei_public_key || 'sei_pub_' + crypto.randomBytes(16).toString('hex')
      },
      eth_wallet: {
        address: walletData.eth_address,
        public_key: walletData.eth_public_key || 'eth_pub_' + crypto.randomBytes(16).toString('hex')
      },
      encrypted_mnemonic: walletData.encrypted_mnemonic,
      salt: walletData.salt,
      nonce: walletData.nonce,
      secured_at: new Date().toISOString()
    };
    
    const axiosConfig = {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${generateServiceToken(userId)}`
      }
    };
    
    try {
      console.log(`Creating profile with wallet via ${PROFILE_SERVICE_URL}/profile`);
      const response = await axios.post(`${PROFILE_SERVICE_URL}/profile`, profileData, axiosConfig);
      console.log(`✅ Created profile with wallet: Status ${response.status}`);
      return true;
    } catch (error: any) {
      if (error.response?.status === 409) {
        console.log(`ℹ️ Profile already exists for user ${userId}`);
        return true;
      }
      
      console.error(`❌ Failed to create profile with wallet:`, error.message);
      
      // Fallback to gateway
      try {
        console.log(`Falling back to gateway: ${GATEWAY_SERVICE_URL}/profile`);
        const response = await axios.post(
          `${GATEWAY_SERVICE_URL}/profile`,
          profileData,
          axiosConfig
        );
        console.log(`✅ Created profile with wallet via gateway: Status ${response.status}`);
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
    console.error('Error creating user profile with wallet:', error.message);
    throw error;
  }
};

/* ── POST /auth/wallet/signup (handles standard user signup) ────────
   Body: { name, email, language_to_learn, passphrase_hash?, sei_address?, eth_address? }
   Resp: { token, refreshToken, userId, walletAddress?, ethWalletAddress?, starting_points }
*/
router.post("/wallet/signup", async (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  
  try {
    const { 
      name, 
      email, 
      language_to_learn, 
      passphrase_hash, 
      encrypted_mnemonic,
      salt,
      nonce,
      sei_address, 
      sei_public_key,
      eth_address,
      eth_public_key 
    } = req.body;
    
    // Enhanced validation with security
    const validation = SecurityValidator.validateAuthRequest({ email, passphrase: 'dummy' });
    if (!validation.isValid) {
      auditLogger.logSecurityEvent({
        eventType: SecurityEventType.INVALID_REQUEST,
        email,
        clientIp,
        userAgent,
        success: false,
        details: { errors: validation.errors, endpoint: 'signup' }
      });
      return res.status(400).json({ message: validation.errors.join(', ') });
    }
    
    // Validate required fields
    if (!email) {
      auditLogger.logFailedAttempt(clientIp, email || 'unknown', 'missing_email');
      return res.status(400).json({ message: "email required" });
    }
    if (!passphrase_hash) {
      return res.status(400).json({ message: "passphrase_hash required (frontend should hash the passphrase)" });
    }
    if (!encrypted_mnemonic || !salt || !nonce || !sei_address || !eth_address) {
      return res.status(400).json({ message: "encrypted wallet data required" });
    }

    // Sanitize inputs
    const sanitizedEmail = SecurityValidator.sanitizeInput(email);
    
    // Check if user already exists (waitlist user conversion)
    let existingProfile = null;
    try {
      const profileResponse = await axios.get(`${PROFILE_SERVICE_URL}/profile/email/${encodeURIComponent(sanitizedEmail)}`);
      existingProfile = profileResponse.data;
    } catch (err: any) {
      if (err.response?.status !== 404) {
        console.error('Error checking email uniqueness:', err.message);
        auditLogger.logSecurityEvent({
          eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
          email: sanitizedEmail,
          clientIp,
          userAgent,
          success: false,
          details: { error: 'email_check_failed', message: err.message }
        });
        return res.status(500).json({ message: 'Error validating email uniqueness' });
      }
      // 404 means email not found - this is a new user
    }
    
    // For waitlist conversion, name and language are optional (taken from existing profile)
    // For new registration, name and language are required
    if (!existingProfile || !existingProfile.isWaitlistUser) {
      if (!name) {
        auditLogger.logFailedAttempt(clientIp, sanitizedEmail, 'missing_name');
        return res.status(400).json({ message: "name required" });
      }
      if (!language_to_learn) {
        auditLogger.logFailedAttempt(clientIp, sanitizedEmail, 'missing_language');
        return res.status(400).json({ message: "language_to_learn required" });
      }
    }
    
    if (existingProfile) {
      // Check if this is a waitlist user conversion
      if (existingProfile.wlw === false && existingProfile.isWaitlistUser) {
        console.log('🔄 Converting waitlist user to full account:', sanitizedEmail);
        
        // Update existing profile with wallet data
        try {
          await axios.put(`${PROFILE_SERVICE_URL}/profile/${existingProfile.userId}/wallet`, {
            wlw: true, // Now has wallet
            passphrase_hash: passphrase_hash,
            encrypted_mnemonic: encrypted_mnemonic,
            salt: salt,
            nonce: nonce,
            sei_wallet: {
              address: sei_address,
              public_key: sei_public_key || 'sei_pub_' + crypto.randomBytes(16).toString('hex')
            },
            eth_wallet: {
              address: eth_address,
              public_key: eth_public_key || 'eth_pub_' + crypto.randomBytes(16).toString('hex')
            },
            secured_at: new Date().toISOString(),
            converted: true // Mark as converted
          });
        } catch (error: any) {
          console.error('Failed to update waitlist user profile:', error);
          auditLogger.logSecurityEvent({
            eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
            email: sanitizedEmail,
            clientIp,
            userAgent,
            success: false,
            details: { error: 'waitlist_conversion_failed', message: error.message }
          });
          return res.status(500).json({
            message: "Failed to convert waitlist user",
            details: error.message
          });
        }

        // Generate tokens for converted user
        const { accessToken, refreshToken } = await generateTokens(existingProfile.userId);

        console.log(`✅ Waitlist conversion completed for ${sanitizedEmail}`);
        
        // Log successful conversion
        auditLogger.logSecurityEvent({
          eventType: SecurityEventType.LOGIN_SUCCESS,
          email: sanitizedEmail,
          userId: existingProfile.userId,
          clientIp,
          userAgent,
          success: true,
          details: { 
            action: 'waitlist_conversion', 
            method: 'wallet_signup',
            language: existingProfile.initial_language_to_learn,
            startingPoints: 100
          }
        });

        return res.json({
          token: accessToken,
          refreshToken: refreshToken,
          userId: existingProfile.userId,
          walletAddress: sei_address,
          ethWalletAddress: eth_address,
          name: existingProfile.name,
          language_to_learn: existingProfile.initial_language_to_learn,
          isWaitlistConversion: true,
          starting_points: 100, // Bonus points for waitlist users
          message: 'Waitlist user converted to full account successfully'
        });
        
      } else {
        // Regular user already exists with wallet
        auditLogger.logFailedAttempt(clientIp, sanitizedEmail, 'email_already_exists');
        return res.status(409).json({ message: "Email already registered" });
      }
    }

    // Generate new user ID for standard signup
    const finalUserId = crypto.randomBytes(32).toString('hex');
    const finalName = name;
    const finalLanguage = language_to_learn;

    // Additional validation for new users
    if (!finalName) {
      auditLogger.logFailedAttempt(clientIp, sanitizedEmail, 'missing_final_name');
      return res.status(400).json({ message: "name required" });
    }
    if (!finalLanguage) {
      auditLogger.logFailedAttempt(clientIp, sanitizedEmail, 'missing_final_language');
      return res.status(400).json({ message: "language_to_learn required" });
    }

    // Sanitize final inputs
    const sanitizedName = SecurityValidator.sanitizeInput(finalName);
    const sanitizedLanguage = SecurityValidator.sanitizeInput(finalLanguage);

    // Use finalUserId for new signup
    const userId = finalUserId;

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokens(userId);
    
    // Create user profile for new signup with wallet data
    try {
      await createUserProfileWithWallet(userId, sanitizedEmail, sanitizedLanguage, sanitizedName, {
        passphrase_hash,
        encrypted_mnemonic,
        salt,
        nonce,
        sei_address,
        sei_public_key,
        eth_address,
        eth_public_key
      });
    } catch (error: any) {
      console.error('Failed to create user profile:', error);
      auditLogger.logSecurityEvent({
        eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
        email: sanitizedEmail,
        clientIp,
        userAgent,
        success: false,
        details: { error: 'profile_creation_failed', message: error.message }
      });
      return res.status(500).json({
        message: "Failed to create user profile",
        details: error.message
      });
    }
    
    // Calculate starting points (all new users start with 0)
    const startingPoints = 0;
    
    // Log successful signup
    auditLogger.logSecurityEvent({
      eventType: SecurityEventType.LOGIN_SUCCESS,
      email: sanitizedEmail,
      userId,
      clientIp,
      userAgent,
      success: true,
      details: { 
        action: 'signup', 
        method: 'wallet_signup',
        language: sanitizedLanguage,
        startingPoints
      }
    });
    
    res.json({
      token: accessToken,
      refreshToken,
      userId,
      walletAddress: sei_address,
      ethWalletAddress: eth_address,
      starting_points: startingPoints,
      name: sanitizedName,
      language_to_learn: sanitizedLanguage
    });
  } catch (err: any) {
    console.error("Signup error:", err.message);
    auditLogger.logSecurityEvent({
      eventType: SecurityEventType.LOGIN_FAILURE,
      email: req.body?.email || 'unknown',
      clientIp,
      userAgent,
      success: false,
      details: { action: 'signup', error: 'signup_failed', message: err.message }
    });
    res.status(500).json({
      message: "Signup failed",
      details: err.message
    });
  }
});

/* ── POST /auth/wallet (handles wallet authentication for existing users) ───
   Body: { userId, walletAddress, ethWalletAddress, signupMethod }
   Resp: { token, refreshToken, userId }
*/
router.post("/wallet", async (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  
  try {
    const { userId, walletAddress, ethWalletAddress, signupMethod } = req.body;
    
    // Enhanced validation with security
    const validation = SecurityValidator.validateAuthRequest({ email: userId, passphrase: 'dummy' });
    if (!validation.isValid) {
      auditLogger.logSecurityEvent({
        eventType: SecurityEventType.INVALID_REQUEST,
        email: userId,
        clientIp,
        userAgent,
        success: false,
        details: { errors: validation.errors, endpoint: 'wallet_auth' }
      });
      return res.status(400).json({ message: validation.errors.join(', ') });
    }
    
    // Validate required fields
    if (!userId) {
      auditLogger.logFailedAttempt(clientIp, 'unknown', 'missing_userId');
      return res.status(400).json({ message: "userId required" });
    }

    // For wallet auth, userId is actually the email
    const email = SecurityValidator.sanitizeInput(userId);

    // Check if user exists by email
    let userProfile;
    try {
      const response = await axios.get(`${PROFILE_SERVICE_URL}/profile/email/${encodeURIComponent(email)}`);
      userProfile = response.data;
    } catch (err: any) {
      if (err.response?.status === 404) {
        auditLogger.logFailedAttempt(clientIp, email, 'user_not_found');
        return res.status(404).json({ message: "User not found. Please complete account setup first." });
      }
      console.error('Error fetching user profile:', err.message);
      auditLogger.logSecurityEvent({
        eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
        email,
        clientIp,
        userAgent,
        success: false,
        details: { error: 'profile_fetch_failed', message: err.message }
      });
      return res.status(500).json({ message: 'Error validating user' });
    }

    // Check if user has completed wallet setup
    if (!userProfile.encrypted_mnemonic) {
      auditLogger.logFailedAttempt(clientIp, email, 'wallet_setup_incomplete');
      return res.status(400).json({ message: "Wallet setup not completed. Please complete setup first." });
    }

    // Generate tokens for the existing user
    const { accessToken, refreshToken } = await generateTokens(userProfile.userId);
    
    // Log successful authentication
    auditLogger.logSecurityEvent({
      eventType: SecurityEventType.WALLET_AUTH_SUCCESS,
      email,
      clientIp,
      userAgent,
      success: true,
      details: { 
        method: 'wallet_auth', 
        userId: userProfile.userId,
        walletAddress: SecurityValidator.sanitizeInput(walletAddress || ''),
        ethWalletAddress: SecurityValidator.sanitizeInput(ethWalletAddress || '')
      }
    });
    
    res.json({
      token: accessToken,
      refreshToken,
      userId: userProfile.userId,
      email: userProfile.email,
      walletAddress,
      ethWalletAddress
    });
  } catch (err: any) {
    const errorEmail = req.body?.userId || 'unknown';
    console.error("Wallet authentication error:", err.message);
    auditLogger.logSecurityEvent({
      eventType: SecurityEventType.WALLET_AUTH_FAILURE,
      email: errorEmail,
      clientIp,
      userAgent,
      success: false,
      details: { error: 'wallet_auth_failed', message: err.message }
    });
    res.status(500).json({
      message: "Wallet authentication failed",
      details: err.message
    });
  }
});

/* ── POST /auth/refresh ───────────────────────────────────────────
   Body: { refreshToken }
   Resp: { token, refreshToken }
*/
router.post("/refresh", async (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      auditLogger.logFailedAttempt(clientIp, 'unknown', 'missing_refresh_token');
      return res.status(400).json({ message: "Refresh token required" });
    }
    
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, APP_REFRESH_SECRET) as jwt.JwtPayload;
    } catch (err: any) {
      auditLogger.logSecurityEvent({
        eventType: SecurityEventType.TOKEN_REFRESH,
        clientIp,
        userAgent,
        success: false,
        details: { error: err.name === 'TokenExpiredError' ? 'token_expired' : 'invalid_token' }
      });
      
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: "Refresh token has expired" });
      }
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    
    if (decoded.type !== 'refresh') {
      auditLogger.logSecurityEvent({
        eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
        userId: decoded.sub,
        clientIp,
        userAgent,
        success: false,
        details: { error: 'invalid_token_type', providedType: decoded.type }
      });
      return res.status(401).json({ message: "Invalid token type" });
    }
    
    const userId = decoded.sub as string;
    
    const isValid = await validateRefreshToken(userId, refreshToken);
    if (!isValid) {
      auditLogger.logSecurityEvent({
        eventType: SecurityEventType.TOKEN_REFRESH,
        userId,
        clientIp,
        userAgent,
        success: false,
        details: { error: 'revoked_or_invalid_token' }
      });
      return res.status(401).json({ message: "Invalid or revoked refresh token" });
    }
    
    // Invalidate the used refresh token
    await deleteSpecificRefreshToken(userId, refreshToken);
    
    // Generate new tokens
    const tokens = await generateTokens(userId);
    
    // Log successful token refresh
    auditLogger.logSecurityEvent({
      eventType: SecurityEventType.TOKEN_REFRESH,
      userId,
      clientIp,
      userAgent,
      success: true,
      details: { message: 'token_refreshed_successfully' }
    });
    
    res.json({ 
      token: tokens.accessToken, 
      refreshToken: tokens.refreshToken,
      userId
    });
  } catch (err: any) {
    console.error("Token refresh error:", err);
    auditLogger.logSecurityEvent({
      eventType: SecurityEventType.TOKEN_REFRESH,
      clientIp,
      userAgent,
      success: false,
      details: { error: 'refresh_failed', message: err.message }
    });
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
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  const userId = req.user.sub;
  
  try {
    await deleteRefreshToken(userId);
    
    // Log successful logout
    auditLogger.logSecurityEvent({
      eventType: SecurityEventType.TOKEN_REVOKE,
      userId,
      clientIp,
      userAgent,
      success: true,
      details: { action: 'logout', message: 'all_refresh_tokens_invalidated' }
    });
    
    res.json({ message: "Successfully logged out" });
  } catch (err: any) {
    console.error("Logout error:", err);
    auditLogger.logSecurityEvent({
      eventType: SecurityEventType.TOKEN_REVOKE,
      userId,
      clientIp,
      userAgent,
      success: false,
      details: { action: 'logout', error: 'logout_failed', message: err.message }
    });
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
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  const userId = req.user.sub;
  
  // Log token validation
  auditLogger.logSecurityEvent({
    eventType: SecurityEventType.PROFILE_ACCESS,
    userId,
    clientIp,
    userAgent,
    success: true,
    details: { action: 'token_validation', endpoint: 'validate' }
  });
  
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
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  const userId = req.user.sub;
  
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      auditLogger.logFailedAttempt(clientIp, userId, 'missing_refresh_token_for_revoke');
      return res.status(400).json({ message: "Refresh token required" });
    }
    
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, APP_REFRESH_SECRET) as jwt.JwtPayload;
      if (decoded.sub !== userId) {
        auditLogger.logSecurityEvent({
          eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
          userId,
          clientIp,
          userAgent,
          success: false,
          details: { 
            action: 'token_revoke_attempt', 
            error: 'token_ownership_mismatch',
            attemptedUserId: decoded.sub 
          }
        });
        return res.status(403).json({ message: "Cannot revoke token belonging to another user" });
      }
    } catch (err) {
      // We'll still try to delete it from storage even if verification fails
      auditLogger.logSecurityEvent({
        eventType: SecurityEventType.TOKEN_REVOKE,
        userId,
        clientIp,
        userAgent,
        success: false,
        details: { action: 'token_revoke', error: 'invalid_token_verification' }
      });
    }
    
    const deleted = await deleteSpecificRefreshToken(userId, refreshToken);
    
    if (deleted) {
      auditLogger.logSecurityEvent({
        eventType: SecurityEventType.TOKEN_REVOKE,
        userId,
        clientIp,
        userAgent,
        success: true,
        details: { action: 'specific_token_revoke', message: 'token_revoked_successfully' }
      });
      res.json({ message: "Token revoked" });
    } else {
      auditLogger.logSecurityEvent({
        eventType: SecurityEventType.TOKEN_REVOKE,
        userId,
        clientIp,
        userAgent,
        success: false,
        details: { action: 'specific_token_revoke', error: 'token_not_found' }
      });
      res.status(404).json({ message: "Token not found" });
    }
  } catch (err: any) {
    console.error("Token revocation error:", err);
    auditLogger.logSecurityEvent({
      eventType: SecurityEventType.TOKEN_REVOKE,
      userId,
      clientIp,
      userAgent,
      success: false,
      details: { action: 'token_revoke', error: 'revocation_failed', message: err.message }
    });
    res.status(500).json({ 
      message: "Token revocation failed", 
      details: err.message 
    });
  }
});

/* ── POST /auth/secure-signup - SECURE PASSPHRASE ARCHITECTURE
   Zero server-side passphrase exposure - all crypto done client-side
*/
router.post('/secure-signup', async (req, res, next) => {
  try {
    const startTime = Date.now();
    const clientIp = SecurityValidator.getClientIp(req);
    const userAgent = req.get('User-Agent') || 'unknown';
    
    console.log('🔐 Secure signup request received');
    
    const { 
      email, 
      name, 
      language_to_learn,
      // Encrypted stretched passphrase data (server cannot decrypt)
      encryptedStretchedKey,
      encryptionSalt,
      stretchedKeyNonce,
      // Encrypted mnemonic data (encrypted with stretched key)
      encrypted_mnemonic,
      mnemonic_salt,
      mnemonic_nonce,
      // Public wallet addresses
      sei_address,
      sei_public_key,
      eth_address,
      eth_public_key,
      // Metadata
      isWaitlistConversion,
      signupMethod
    } = req.body;

    // Validate required fields
    if (!email || !name || !language_to_learn) {
      return res.status(400).json({ 
        message: "Email, name, and language_to_learn are required" 
      });
    }

    // Validate secure passphrase data
    if (!encryptedStretchedKey || !encryptionSalt || !stretchedKeyNonce) {
      return res.status(400).json({ 
        message: "Encrypted passphrase data is required" 
      });
    }

    // Validate encrypted mnemonic data
    if (!encrypted_mnemonic || !mnemonic_salt || !mnemonic_nonce) {
      return res.status(400).json({ 
        message: "Encrypted mnemonic data is required" 
      });
    }

    // Validate wallet addresses
    if (!sei_address || !eth_address) {
      return res.status(400).json({ 
        message: "Wallet addresses are required" 
      });
    }

    // Sanitize inputs
    const sanitizedEmail = SecurityValidator.sanitizeInput(email);
    const sanitizedName = SecurityValidator.sanitizeInput(name);
    
    // Check if user already exists (waitlist user conversion)
    let existingProfile = null;
    let userId = null;
    
    try {
      const profileResponse = await axios.get(`${PROFILE_SERVICE_URL}/profile/email/${encodeURIComponent(sanitizedEmail)}`);
      existingProfile = profileResponse.data;
      userId = existingProfile.userId;
      
      console.log('🔄 Converting existing user to secure wallet:', {
        userId,
        isWaitlistUser: existingProfile.isWaitlistUser,
        hasWallet: existingProfile.wlw
      });
      
    } catch (err: any) {
      if (err.response?.status === 404) {
        // New user - generate userId
        userId = crypto.randomBytes(32).toString('hex');
        console.log('🆕 Creating new secure wallet user:', userId);
      } else {
        console.error('Error checking existing profile:', err.message);
        return res.status(500).json({ message: 'Error checking user profile' });
      }
    }

    // Create secure profile data (NO RAW PASSPHRASE STORED!)
    const secureProfileData = {
      userId,
      email: sanitizedEmail,
      name: sanitizedName,
      initial_language_to_learn: language_to_learn,
      wlw: true, // Has wallet
      
      // Encrypted stretched passphrase (server cannot decrypt)
      encryptedStretchedKey,
      encryptionSalt,
      stretchedKeyNonce,
      
      // Encrypted mnemonic (encrypted with stretched key)
      encrypted_mnemonic,
      mnemonic_salt,
      mnemonic_nonce,
      
      // Public wallet addresses
      sei_wallet: {
        address: sei_address,
        public_key: sei_public_key || 'sei_pub_' + crypto.randomBytes(16).toString('hex')
      },
      eth_wallet: {
        address: eth_address,
        public_key: eth_public_key || 'eth_pub_' + crypto.randomBytes(16).toString('hex')
      },
      
      // Enhanced wallet data
      encrypted_wallet_data: {
        encrypted_mnemonic,
        salt: mnemonic_salt,
        nonce: mnemonic_nonce,
        sei_address,
        eth_address
      },
      
      secured_at: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      converted: existingProfile?.isWaitlistUser ? true : undefined
    };

    // Create or update profile
    let profileResult;
    if (existingProfile) {
      // Update existing profile with secure wallet data
      profileResult = await axios.put(
        `${PROFILE_SERVICE_URL}/profile/${userId}/wallet-conversion`,
        secureProfileData
      );
      console.log('✅ Updated existing profile with secure wallet');
    } else {
      // Create new profile - add createdAt for new profiles
      const newProfileData = {
        ...secureProfileData,
        createdAt: new Date().toISOString()
      };
      profileResult = await axios.post(`${PROFILE_SERVICE_URL}/profile`, newProfileData);
      console.log('✅ Created new secure profile');
    }

    // Create JWT token
    const jwtPayload = {
      userId,
      email: sanitizedEmail,
      name: sanitizedName,
      walletAddress: sei_address,
      ethWalletAddress: eth_address
    };

    const token = jwt.sign(jwtPayload, APP_JWT_SECRET, { expiresIn: '24h' });
    const refreshToken = jwt.sign({ userId }, APP_REFRESH_SECRET, { expiresIn: '7d' });

    // Create offchain profile
    try {
      await axios.post(`${OFFCHAIN_PROFILE_SERVICE_URL}/profile`, {
        userId,
        walletAddress: sei_address,
        ethWalletAddress: eth_address,
        xp: isWaitlistConversion ? 1000 : 0, // Bonus XP for waitlist users
        streak: 0
      });
      console.log('✅ Created offchain profile');
    } catch (offchainError: any) {
      console.warn('⚠️ Failed to create offchain profile:', offchainError.message);
      // Continue - this is not critical for signup
    }

    // Log successful secure signup
    await auditLogger.logSecurityEvent({
      eventType: SecurityEventType.AUTHENTICATION_SUCCESS,
      email: sanitizedEmail,
      clientIp,
      userAgent,
      success: true,
      details: `Secure signup completed for ${sanitizedEmail}`,
      metadata: {
        signupMethod: 'secure_passphrase',
        isWaitlistConversion: !!isWaitlistConversion,
        hasEncryptedStretchedKey: !!encryptedStretchedKey,
        responseTime: Date.now() - startTime
      }
    });

    res.status(201).json({
      success: true,
      userId,
      token,
      refreshToken,
      walletAddresses: {
        seiAddress: sei_address,
        evmAddress: eth_address
      },
      starting_points: isWaitlistConversion ? 1000 : 0,
      isWaitlistConversion: !!isWaitlistConversion,
      message: isWaitlistConversion 
        ? 'Waitlist user converted to secure account successfully'
        : 'Secure wallet account created successfully'
    });

  } catch (error: any) {
    console.error('❌ Secure signup failed:', error);
    
    await auditLogger.logSecurityEvent({
      eventType: SecurityEventType.AUTHENTICATION_FAILURE,
      email: req.body.email,
      clientIp: SecurityValidator.getClientIp(req),
      userAgent: req.get('User-Agent') || 'unknown',
      success: false,
      details: `Secure signup failed: ${error.message}`,
      metadata: {
        error: error.message,
        signupMethod: 'secure_passphrase'
      }
    });

    next(error);
  }
});

/* ── POST /auth/secure-wallet-recovery ─────────────────────────────
   Recover wallet using secure passphrase (client-side verification only)
   Body: { email, encryptedStretchedKey }
   Response: { encrypted_mnemonic, mnemonic_salt, mnemonic_nonce, wallet_addresses }
*/
router.post('/secure-wallet-recovery', async (req, res) => {
  try {
    const clientIp = SecurityValidator.getClientIp(req);
    const userAgent = req.get('User-Agent') || 'unknown';
    
    console.log('🔑 Secure wallet recovery request received');
    
    const { email, encryptedStretchedKey } = req.body;
    
    // Validate required fields
    if (!email || !encryptedStretchedKey) {
      return res.status(400).json({ 
        error: 'invalid_request',
        message: 'Email and encrypted stretched key are required' 
      });
    }
    
    // Sanitize email
    const sanitizedEmail = SecurityValidator.sanitizeInput(email);
    
    // Find user profile
    let userProfile;
    try {
      const profileResponse = await axios.get(`${PROFILE_SERVICE_URL}/profile/email/${encodeURIComponent(sanitizedEmail)}`);
      userProfile = profileResponse.data;
    } catch (err: any) {
      if (err.response?.status === 404) {
        await auditLogger.logSecurityEvent({
          eventType: SecurityEventType.AUTHENTICATION_FAILURE,
          email: sanitizedEmail,
          clientIp,
          userAgent,
          success: false,
          details: { action: 'wallet_recovery', error: 'user_not_found' }
        });
        return res.status(404).json({ 
          error: 'user_not_found',
          message: 'No account found with this email' 
        });
      }
      throw err;
    }
    
    // Check if user has secure wallet setup
    if (!userProfile.encryptedStretchedKey || !userProfile.encrypted_mnemonic) {
      return res.status(400).json({ 
        error: 'no_secure_wallet',
        message: 'No secure wallet found for this account' 
      });
    }
    
    // Return encrypted wallet data for client-side decryption
    // Client will verify passphrase by attempting to decrypt
    await auditLogger.logSecurityEvent({
      eventType: SecurityEventType.AUTHENTICATION_SUCCESS,
      email: sanitizedEmail,
      userId: userProfile.userId,
      clientIp,
      userAgent,
      success: true,
      details: { action: 'wallet_recovery_data_provided' }
    });
    
    res.json({
      success: true,
      encrypted_wallet_data: {
        // Encrypted stretched key data (for passphrase verification)
        encryptedStretchedKey: userProfile.encryptedStretchedKey,
        encryptionSalt: userProfile.encryptionSalt,
        stretchedKeyNonce: userProfile.stretchedKeyNonce,
        
        // Encrypted mnemonic data
        encrypted_mnemonic: userProfile.encrypted_mnemonic,
        mnemonic_salt: userProfile.mnemonic_salt,
        mnemonic_nonce: userProfile.mnemonic_nonce,
        
        // Public wallet addresses
        wallet_addresses: {
          sei_address: userProfile.sei_wallet?.address,
          eth_address: userProfile.eth_wallet?.address
        }
      },
      user_id: userProfile.userId
    });
    
  } catch (error: any) {
    console.error('❌ Secure wallet recovery failed:', error);
    
    await auditLogger.logSecurityEvent({
      eventType: SecurityEventType.AUTHENTICATION_FAILURE,
      email: req.body.email,
      clientIp: SecurityValidator.getClientIp(req),
      userAgent: req.get('User-Agent') || 'unknown',
      success: false,
      details: { action: 'wallet_recovery', error: error.message }
    });
    
    res.status(500).json({ 
      error: 'recovery_failed',
      message: 'Wallet recovery failed' 
    });
  }
});

export default router;
