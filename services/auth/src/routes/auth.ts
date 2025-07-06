import { Router } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { saveRefreshToken, validateRefreshToken, deleteRefreshToken, deleteSpecificRefreshToken } from "../utils/database";
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
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET;

const router = Router();

// Helper function to create headers for internal service calls
const createInternalServiceHeaders = () => {
  const headers: any = {
    'Content-Type': 'application/json'
  };
  
  if (INTERNAL_SERVICE_SECRET) {
    headers['x-internal-service-secret'] = INTERNAL_SERVICE_SECRET;
  }
  
  return headers;
};

// Function to fetch user's lesson progress from the learning service (direct call)
const getUserLessonProgress = async (userId: string) => {
  try {
    const response = await axios.get(`http://learning-service/learning/progress?minimal=true`, {
      params: { userId },
      headers: createInternalServiceHeaders(),
      timeout: 5000
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
      headers: createInternalServiceHeaders()
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
      
      // Since no authentication is required, we don't need gateway fallback
      console.error(`❌ Profile creation failed for user ${userId}`);
      throw error;
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
      headers: createInternalServiceHeaders()
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
      
      // Since no authentication is required, we don't need gateway fallback  
      console.error(`❌ Profile with wallet creation failed for user ${userId}`);
      throw error;
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
    
    // Enhanced validation with security (email only - no raw passphrase validation)
    const validation = SecurityValidator.validateEmailOnly({ email });
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
      const profileResponse = await axios.get(`${PROFILE_SERVICE_URL}/profile/email/${encodeURIComponent(sanitizedEmail)}`, {
        headers: createInternalServiceHeaders()
      });
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
    
    // All wallet signups require name and language_to_learn  
    if (!name) {
      auditLogger.logFailedAttempt(clientIp, sanitizedEmail, 'missing_name');
      return res.status(400).json({ message: "name required" });
    }
    if (!language_to_learn) {
      auditLogger.logFailedAttempt(clientIp, sanitizedEmail, 'missing_language');
      return res.status(400).json({ message: "language_to_learn required" });
    }
    
    // Check if user already has a wallet (regardless of how they signed up originally)
    if (existingProfile && (existingProfile.wlw === true || existingProfile.encrypted_mnemonic)) {
      auditLogger.logFailedAttempt(clientIp, sanitizedEmail, 'email_already_has_wallet');
      return res.status(409).json({ message: "Email already has a wallet. Use login instead." });
    }

    // Determine userId: if user exists, use existing userId; otherwise generate new one
    let userId;
    let isExistingUser = false;
    let wasWaitlistUser = false;
    
    if (existingProfile) {
      // User exists but doesn't have a wallet - update their profile with wallet data
      userId = existingProfile.userId;
      isExistingUser = true;
      wasWaitlistUser = existingProfile.isWaitlistUser || false;
      console.log(`🔄 Adding wallet to existing user: ${sanitizedEmail} (was waitlist: ${wasWaitlistUser})`);
    } else {
      // New user - generate new ID
      userId = crypto.randomBytes(32).toString('hex');
      console.log(`🆕 Creating new user with wallet: ${sanitizedEmail}`);
    }

    // Sanitize inputs
    const sanitizedName = SecurityValidator.sanitizeInput(name);
    const sanitizedLanguage = SecurityValidator.sanitizeInput(language_to_learn);

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokens(userId);
    
    try {
      if (isExistingUser) {
        // Update existing user profile with wallet data
        const walletUpdateData = {
          email: sanitizedEmail,
          name: sanitizedName, // Use provided name (may be different from stored name)
          initial_language_to_learn: sanitizedLanguage, // Use provided language
          isWaitlistUser: wasWaitlistUser, // Preserve existing status
          wlw: true, // Now has wallet
          converted: wasWaitlistUser ? true : false, // Mark waitlist users as converted
          
          // CRITICAL: Include passphrase hash for wallet security
          passphrase_hash: passphrase_hash,
          
          // Wallet data
          encrypted_mnemonic: encrypted_mnemonic,
          mnemonic_salt: salt,
          mnemonic_nonce: nonce,
          salt: salt,
          nonce: nonce,
          
          // Wallet addresses
          seiWalletAddress: sei_address,
          evmWalletAddress: eth_address,
          
          // Metadata with proper timestamps
          secured_at: new Date().toISOString(),
          wallet_created_at: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        await axios.put(`${PROFILE_SERVICE_URL}/profile/${userId}/wallet-conversion`, 
          walletUpdateData, {
          headers: createInternalServiceHeaders()
        });
      } else {
        // Create new user profile with wallet data
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
      }
    } catch (error: any) {
      console.error(`Failed to ${isExistingUser ? 'update' : 'create'} user profile:`, error);
      auditLogger.logSecurityEvent({
        eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
        email: sanitizedEmail,
        clientIp,
        userAgent,
        success: false,
        details: { error: `profile_${isExistingUser ? 'update' : 'creation'}_failed`, message: error.message }
      });
      return res.status(500).json({
        message: `Failed to ${isExistingUser ? 'update' : 'create'} user profile`,
        details: error.message
      });
    }
    
    // Calculate starting points
    const startingPoints = wasWaitlistUser ? 100 : 0;
    
    // Log successful signup
    auditLogger.logSecurityEvent({
      eventType: SecurityEventType.LOGIN_SUCCESS,
      email: sanitizedEmail,
      userId,
      clientIp,
      userAgent,
      success: true,
      details: { 
        action: isExistingUser ? 'wallet_addition' : 'signup', 
        method: 'wallet_signup',
        language: sanitizedLanguage,
        startingPoints,
        wasWaitlistUser
      }
    });

    console.log(`✅ ${isExistingUser ? 'Wallet added to existing user' : 'New user created with wallet'}: ${sanitizedEmail}`);
    
    res.json({
      token: accessToken,
      refreshToken,
      userId,
      walletAddress: sei_address,
      ethWalletAddress: eth_address,
      starting_points: startingPoints,
      name: sanitizedName,
      language_to_learn: sanitizedLanguage,
      isWaitlistConversion: wasWaitlistUser,
      message: isExistingUser 
        ? (wasWaitlistUser ? 'Waitlist user successfully created wallet' : 'Wallet added to existing account')
        : 'New account created with wallet successfully'
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
    
    // Enhanced validation with security (email only - no raw passphrase validation)
    const validation = SecurityValidator.validateEmailOnly({ email: userId });
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
      const response = await axios.get(`${PROFILE_SERVICE_URL}/profile/email/${encodeURIComponent(email)}`, {
        headers: createInternalServiceHeaders()
      });
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
   Body: { userId }
   Resp: { message: "Successfully logged out" }
*/
router.post("/logout", async (req: any, res) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  const userId = req.body.userId;
  
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
   Body: { userId }
   Resp: { userId }
*/
router.get("/validate", (req: any, res) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  const userId = req.body.userId || req.query.userId;
  
  if (!userId) {
    return res.status(400).json({ message: "userId required" });
  }
  
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
    userId: userId
  });
});

/* ── POST /auth/revoke ────────────────────────────────────────────
   Body: { userId, refreshToken }
   Resp: { message: "Token revoked" }
*/
router.post("/revoke", async (req: any, res) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  const userId = req.body.userId;
  
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
      native_language, // Added native language field
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
    
    // Transform encrypted data from comma-separated strings to arrays (frontend compatibility)
    const transformEncryptedData = (data: any) => {
      if (typeof data === 'string' && data.includes(',')) {
        return data.split(',').map((item: string) => parseInt(item.trim(), 10));
      }
      return Array.isArray(data) ? data : [];
    };

    const processedEncryptedStretchedKey = transformEncryptedData(encryptedStretchedKey);
    const processedEncryptionSalt = transformEncryptedData(encryptionSalt);
    const processedStretchedKeyNonce = transformEncryptedData(stretchedKeyNonce);
    
    console.log('🔄 Processed encrypted data:', {
      originalEncryptedStretchedKey: typeof encryptedStretchedKey,
      processedEncryptedStretchedKey: Array.isArray(processedEncryptedStretchedKey) ? 'array' : typeof processedEncryptedStretchedKey,
      arrayLength: processedEncryptedStretchedKey.length
    });
    
    // Validate that stretched key data is not empty (enhanced security validation)
    if (processedEncryptedStretchedKey.length === 0 || 
        processedEncryptionSalt.length === 0 || 
        processedStretchedKeyNonce.length === 0) {
      console.error('❌ Stretched key validation failed:', {
        encryptedStretchedKeyLength: processedEncryptedStretchedKey.length,
        encryptionSaltLength: processedEncryptionSalt.length,
        stretchedKeyNonceLength: processedStretchedKeyNonce.length
      });
      return res.status(400).json({ 
        message: "Invalid stretched key data - crypto operations may have failed on the client side. Please try again." 
      });
    }
    
    // Check if user already exists (waitlist user conversion)
    let existingProfile = null;
    let userId = null;
    let isWaitlistConversionDetected = false;
    
    try {
      const profileResponse = await axios.get(`${PROFILE_SERVICE_URL}/profile/email/${encodeURIComponent(sanitizedEmail)}`);
      existingProfile = profileResponse.data;
      userId = existingProfile.userId;
      
      // Check if this is a waitlist user who hasn't been converted yet
      isWaitlistConversionDetected = existingProfile.isWaitlistUser === true && existingProfile.wlw === false && existingProfile.converted === false;
      
      console.log('🔄 Converting existing user to secure wallet:', {
        userId,
        isWaitlistUser: existingProfile.isWaitlistUser,
        hasWallet: existingProfile.wlw,
        converted: existingProfile.converted,
        isWaitlistConversion: isWaitlistConversionDetected
      });
      
    } catch (err: any) {
      // Treat ANY error (404, 500, network error, etc.) as "new user"
      // This makes registration more resilient to profile service issues
      console.log('📝 Profile service error (treating as new user):', {
        status: err.response?.status || 'unknown',
        message: err.message || 'unknown error',
        treating_as_new_user: true,
        errorType: err.code || 'unknown'
      });
      
      // Log the error for debugging but don't fail the registration
      if (err.response?.status === 500) {
        console.error('⚠️ Profile service returned 500 error during email lookup:', {
          url: err.config?.url,
          data: err.response?.data,
          message: err.message
        });
      }
      
      // New user - generate userId
      userId = crypto.randomBytes(32).toString('hex');
      console.log('🆕 Creating new secure wallet user:', userId);
    }

    // Create secure profile data (NO RAW PASSPHRASE STORED!)
    const secureProfileData = {
      userId,
      email: sanitizedEmail,
      name: isWaitlistConversionDetected ? existingProfile.name : sanitizedName,
      initial_language_to_learn: isWaitlistConversionDetected ? existingProfile.initial_language_to_learn : language_to_learn,
      native_language: native_language || 'english', // Add native language with default
      isWaitlistUser: true, // ALL users via secure-signup are waitlist users (YAP-landing)
      wlw: true, // Has wallet
      
      // Encrypted stretched passphrase (server cannot decrypt)
      encryptedStretchedKey: processedEncryptedStretchedKey,
      encryptionSalt: processedEncryptionSalt,
      stretchedKeyNonce: processedStretchedKeyNonce,
      
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
      converted: isWaitlistConversionDetected ? true : undefined
    };

    console.log('🚀 DEBUG: Auth service sending to profile service:', {
      encryptedStretchedKeyType: typeof secureProfileData.encryptedStretchedKey,
      encryptedStretchedKeyIsArray: Array.isArray(secureProfileData.encryptedStretchedKey),
      encryptedStretchedKeyLength: Array.isArray(secureProfileData.encryptedStretchedKey) ? secureProfileData.encryptedStretchedKey.length : 'not-array',
      encryptionSaltLength: Array.isArray(secureProfileData.encryptionSalt) ? secureProfileData.encryptionSalt.length : 'not-array',
      stretchedKeyNonceLength: Array.isArray(secureProfileData.stretchedKeyNonce) ? secureProfileData.stretchedKeyNonce.length : 'not-array'
    });

    // Create or update profile
    let profileResult;
    try {
      if (existingProfile) {
        // Update existing profile with secure wallet data
        console.log(`🔄 Updating existing profile for ${isWaitlistConversionDetected ? 'waitlist conversion' : 'existing user'}:`, userId);
        profileResult = await axios.put(
          `${PROFILE_SERVICE_URL}/profile/${userId}/wallet-conversion`,
          secureProfileData,
          { 
            headers: createInternalServiceHeaders(),
            timeout: 10000 // 10 second timeout
          }
        );
        console.log('✅ Updated existing profile with secure wallet');
      } else {
        // Create new profile - add createdAt for new profiles
        const newProfileData = {
          ...secureProfileData,
          createdAt: new Date().toISOString()
        };
        profileResult = await axios.post(`${PROFILE_SERVICE_URL}/profile`, newProfileData, {
          headers: createInternalServiceHeaders(),
          timeout: 10000 // 10 second timeout
        });
        console.log('✅ Created new secure profile');
      }
    } catch (profileError: any) {
      console.error('❌ Profile creation/update failed:', {
        error: profileError.message,
        status: profileError.response?.status,
        data: profileError.response?.data,
        errorCode: profileError.code
      });
      
      // Check if this is a profile service database/connection issue
      if (profileError.response?.status === 500 || profileError.code === 'ECONNREFUSED' || profileError.code === 'ETIMEDOUT') {
        console.error('🚨 Profile service appears to be down or having database issues');
        
        // For now, continue with token generation to avoid blocking user registration
        // The profile will need to be created later via retry mechanism
        console.warn('⚠️ Continuing registration despite profile service issues - user can retry profile creation later');
        
        // Still create tokens so user isn't completely blocked
        profileResult = { data: { success: true, userId } };
      } else {
        return res.status(500).json({
          success: false,
          error: 'profile_creation_failed',
          message: 'Failed to create user profile. Please try again.',
          details: profileError.response?.data || profileError.message
        });
      }
    }

    // Create JWT token
    const jwtPayload = {
      userId,
      email: sanitizedEmail,
      name: isWaitlistConversionDetected ? existingProfile.name : sanitizedName,
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
        xp: isWaitlistConversionDetected ? 1000 : 0, // Bonus XP for waitlist users
        streak: 0
      });
      console.log('✅ Created offchain profile');
    } catch (offchainError: any) {
      console.warn('⚠️ Failed to create offchain profile:', offchainError.message);
      // Continue - this is not critical for signup
    }

    // Award 25 tokens for waitlist users through the blockchain-progress-service
    if (isWaitlistConversionDetected) {
      try {
        const tokenBonusRequest = {
          userId,
          walletAddress: sei_address,
          amount: 25,
          reason: 'waitlist_bonus',
          description: 'Welcome bonus for joining from waitlist'
        };
        
        await axios.post(`${process.env.BLOCKCHAIN_PROGRESS_SERVICE_URL || 'http://blockchain-progress-service'}/api/progress/award-tokens`, tokenBonusRequest, {
          headers: createInternalServiceHeaders(),
          timeout: 10000
        });
        
        console.log('✅ Awarded 25 token waitlist bonus to user:', userId);
      } catch (tokenError: any) {
        console.warn('⚠️ Failed to award waitlist token bonus:', tokenError.message);
        // Continue - this is not critical for signup, tokens can be awarded later
      }
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
        isWaitlistConversion: isWaitlistConversionDetected,
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
      starting_points: isWaitlistConversionDetected ? 1000 : 0,
      token_bonus: isWaitlistConversionDetected ? 25 : 0, // 25 tokens for waitlist users
      isWaitlistConversion: isWaitlistConversionDetected,
      message: isWaitlistConversionDetected 
        ? 'Waitlist user converted to secure account successfully. 25 token bonus awarded!'
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

    // Return proper error response instead of calling next(error)
    res.status(500).json({
      success: false,
      error: 'signup_failed',
      message: 'Account creation failed. Please try again.',
      details: error.message
    });
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
      const profileResponse = await axios.get(`${PROFILE_SERVICE_URL}/profile/email/${encodeURIComponent(sanitizedEmail)}`, {
        headers: createInternalServiceHeaders()
      });
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

/* ── POST /auth/waitlist/simple (handles simple waitlist signup) ────────
   Body: { name, email, language_to_learn, acceptTerms }
   Resp: { success: true, message: "...", data: { userId, ... } }
*/
router.post("/waitlist/simple", async (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  
  try {
    const { name, email, language_to_learn, native_language, acceptTerms } = req.body;
    
    // Validate waitlist request (no passphrase validation needed)
    const validation = SecurityValidator.validateWaitlistRequest({ name, email, language_to_learn });
    if (!validation.isValid) {
      auditLogger.logSecurityEvent({
        eventType: SecurityEventType.INVALID_REQUEST,
        email,
        clientIp,
        userAgent,
        success: false,
        details: { errors: validation.errors, endpoint: 'waitlist_simple' }
      });
      return res.status(400).json({ message: validation.errors.join(', ') });
    }
    
    // Validate required fields
    if (!name || !email || !language_to_learn || !acceptTerms) {
      auditLogger.logFailedAttempt(clientIp, email || 'unknown', 'missing_waitlist_fields');
      return res.status(400).json({ 
        success: false,
        error: 'missing_fields',
        message: "Name, email, language preference, and terms acceptance are required" 
      });
    }

    // Sanitize inputs
    const sanitizedEmail = SecurityValidator.sanitizeInput(email);
    const sanitizedName = SecurityValidator.sanitizeInput(name);
    const sanitizedLanguage = SecurityValidator.sanitizeInput(language_to_learn);
    
    // Check if user already exists
    try {
      const profileResponse = await axios.get(`${PROFILE_SERVICE_URL}/profile/email/${encodeURIComponent(sanitizedEmail)}`, {
        headers: createInternalServiceHeaders()
      });
      
      // User already exists
      auditLogger.logFailedAttempt(clientIp, sanitizedEmail, 'email_already_exists_waitlist');
      return res.status(409).json({
        success: false,
        error: 'email_exists',
        message: 'Email already registered'
      });
    } catch (err: any) {
      if (err.response?.status !== 404) {
        console.error('Error checking email uniqueness for waitlist:', err.message);
        auditLogger.logSecurityEvent({
          eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
          email: sanitizedEmail,
          clientIp,
          userAgent,
          success: false,
          details: { error: 'waitlist_email_check_failed', message: err.message }
        });
        return res.status(500).json({ 
          success: false,
          message: 'Error validating email uniqueness' 
        });
      }
      // 404 means email not found - this is good for new waitlist signup
    }

    // Create waitlist entry directly in Profile Service
    const userId = crypto.randomBytes(32).toString('hex');
    const waitlistEntry = {
      userId,
      email: sanitizedEmail,
      name: sanitizedName,
      initial_language_to_learn: sanitizedLanguage,
      native_language: native_language || 'english', // Add native language with default
      isWaitlistUser: true,
      wlw: false, // No wallet yet
      converted: false,
      waitlist_signup_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      console.log(`Creating waitlist entry via ${PROFILE_SERVICE_URL}/profile`);
      const response = await axios.post(`${PROFILE_SERVICE_URL}/profile`, waitlistEntry, {
        timeout: 5000,
        headers: createInternalServiceHeaders()
      });
      console.log(`✅ Created waitlist entry: Status ${response.status}`);
    } catch (error: any) {
      if (error.response?.status === 409) {
        // Profile already exists
        return res.status(409).json({
          success: false,
          error: 'email_exists',
          message: 'Email already registered'
        });
      }
      
      console.error(`❌ Failed to create waitlist entry:`, error.message);
      auditLogger.logSecurityEvent({
        eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
        email: sanitizedEmail,
        clientIp,
        userAgent,
        success: false,
        details: { error: 'waitlist_creation_failed', message: error.message }
      });
      return res.status(500).json({
        success: false,
        message: "Failed to join waitlist",
        details: error.message
      });
    }
    
    // Log successful waitlist signup
    auditLogger.logSecurityEvent({
      eventType: SecurityEventType.LOGIN_SUCCESS, // Reusing login success for waitlist signup
      email: sanitizedEmail,
      userId,
      clientIp,
      userAgent,
      success: true,
      details: { 
        action: 'waitlist_signup', 
        method: 'simple',
        language: sanitizedLanguage
      }
    });
    
    res.status(201).json({
      success: true,
      message: 'Successfully joined the waitlist!',
      data: {
        userId,
        name: sanitizedName,
        email: sanitizedEmail,
        language_to_learn: sanitizedLanguage,
        joinedAt: waitlistEntry.waitlist_signup_at
      }
    });
  } catch (err: any) {
    console.error("Waitlist signup error:", err.message);
    auditLogger.logSecurityEvent({
      eventType: SecurityEventType.LOGIN_FAILURE,
      email: req.body?.email || 'unknown',
      clientIp,
      userAgent,
      success: false,
      details: { action: 'waitlist_signup', error: 'signup_failed', message: err.message }
    });
    res.status(500).json({
      success: false,
      message: "Waitlist signup failed",
      details: err.message
    });
  }
});

/* ── POST /auth/simple (Waitlist Signup - No Authentication Required) ────
   Body: { name, email, language_to_learn }
   Resp: { message: "Waitlist signup successful", userId }
*/
router.post("/simple", async (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  
  try {
    const { name, email, language_to_learn, native_language } = req.body;
    
    // Basic validation without security middleware
    if (!name || !email || !language_to_learn) {
      return res.status(400).json({ 
        message: "Name, email, and language_to_learn are required" 
      });
    }
    
    // Sanitize inputs
    const sanitizedName = SecurityValidator.sanitizeInput(name);
    const sanitizedEmail = SecurityValidator.sanitizeInput(email);
    const sanitizedLanguage = SecurityValidator.sanitizeInput(language_to_learn);
    
    // Validate email format
    if (!SecurityValidator.validateEmail(sanitizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    
    // Generate user ID for waitlist user
    const userId = crypto.randomBytes(32).toString('hex');
    
    // Create waitlist user profile (no wallet data)
    const profileData = {
      userId,
      email: sanitizedEmail,
      name: sanitizedName,
      initial_language_to_learn: sanitizedLanguage,
      native_language: native_language || 'english', // Add native language with default
      isWaitlistUser: true,
      wlw: false, // No wallet yet
      waitlist_signup_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Create profile directly without authentication
    try {
      const response = await axios.post(`${PROFILE_SERVICE_URL}/profile`, profileData, {
        headers: createInternalServiceHeaders(),
        timeout: 5000
      });
      
      console.log(`✅ Created waitlist profile: Status ${response.status}`);
      
      res.status(201).json({
        message: "Waitlist signup successful",
        userId,
        email: sanitizedEmail,
        name: sanitizedName,
        language_to_learn: sanitizedLanguage
      });
      
    } catch (error: any) {
      if (error.response?.status === 409) {
        // User already exists
        return res.status(409).json({ 
          message: "Email already registered" 
        });
      }
      
      console.error('Failed to create waitlist profile:', error.message);
      res.status(500).json({
        message: "Failed to create waitlist profile",
        details: error.message
      });
    }
    
  } catch (err: any) {
    console.error("Waitlist signup error:", err.message);
    res.status(500).json({
      message: "Waitlist signup failed",
      details: err.message
    });
  }
});

export default router;
