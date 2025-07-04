import { Router } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import axios from "axios";

const APP_JWT_SECRET = process.env.APP_JWT_SECRET!;
const APP_REFRESH_SECRET = process.env.APP_REFRESH_SECRET || APP_JWT_SECRET + '_refresh';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '30d';

const PROFILE_SERVICE_URL = process.env.PROFILE_SERVICE_URL || 'http://profile-service';
const SKIP_PROFILE_CREATION = process.env.SKIP_PROFILE_CREATION === 'true';

const router = Router();

// Helper function to create headers for internal service calls
const createInternalServiceHeaders = () => {
  return {
    'Content-Type': 'application/json'
  };
};

// Basic input sanitization
const sanitizeInput = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  return input.trim().substring(0, 1000); // Limit length and trim
};

// Basic email validation
const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Generate tokens
const generateTokens = async (userId: string) => {
  const accessToken = jwt.sign(
    { sub: userId, type: 'access' },
    APP_JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
  
  const refreshToken = jwt.sign(
    { sub: userId, type: 'refresh' },
    APP_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
  
  return { accessToken, refreshToken };
};

/* ── POST /auth/waitlist/simple (handles simple waitlist signup) ────────
   Body: { name, email, language_to_learn, acceptTerms }
   Resp: { success: true, message: "...", data: { userId, ... } }
*/
router.post("/waitlist/simple", async (req, res) => {
  try {
    const { name, email, language_to_learn, acceptTerms } = req.body;
    
    // Validate required fields
    if (!name || !email || !language_to_learn || !acceptTerms) {
      return res.status(400).json({ 
        success: false,
        error: 'missing_fields',
        message: "Name, email, language preference, and terms acceptance are required" 
      });
    }

    // Basic validation
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_email',
        message: 'Please provide a valid email address'
      });
    }

    // Sanitize inputs
    const sanitizedEmail = sanitizeInput(email);
    const sanitizedName = sanitizeInput(name);
    const sanitizedLanguage = sanitizeInput(language_to_learn);
    
    // Check if user already exists
    try {
      const profileResponse = await axios.get(`${PROFILE_SERVICE_URL}/profile/email/${encodeURIComponent(sanitizedEmail)}`, {
        headers: createInternalServiceHeaders()
      });
      
      // User already exists
      return res.status(409).json({
        success: false,
        error: 'email_exists',
        message: 'Email already registered'
      });
      
    } catch (err: any) {
      if (err.response?.status !== 404) {
        console.error('Error checking email uniqueness for waitlist:', err.message);
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
      return res.status(500).json({
        success: false,
        message: "Failed to join waitlist",
        details: error.message
      });
    }
    
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
    res.status(500).json({
      success: false,
      message: "Waitlist signup failed",
      details: err.message
    });
  }
});

/* ── POST /auth/wallet/signup (handles standard user signup) ────────
   Body: { name, email, language_to_learn, passphrase_hash?, sei_address?, eth_address? }
   Resp: { token, refreshToken, userId, walletAddress?, ethWalletAddress?, starting_points }
*/
router.post("/wallet/signup", async (req, res) => {
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
    
    // Validate required fields
    if (!email) {
      return res.status(400).json({ message: "email required" });
    }
    
    // Basic validation
    if (!validateEmail(email)) {
      return res.status(400).json({ message: "Please provide a valid email address" });
    }

    // Sanitize inputs
    const sanitizedEmail = sanitizeInput(email);
    
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
        return res.status(500).json({ message: 'Error validating email uniqueness' });
      }
      // 404 means email not found - this is a new user
    }
    
    // All wallet signups require name and language_to_learn  
    if (!name) {
      return res.status(400).json({ message: "name required" });
    }
    if (!language_to_learn) {
      return res.status(400).json({ message: "language_to_learn required" });
    }
    
    // Check if user already has a wallet (regardless of how they signed up originally)
    if (existingProfile && (existingProfile.wlw === true || existingProfile.encrypted_mnemonic)) {
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
    const sanitizedName = sanitizeInput(name);
    const sanitizedLanguage = sanitizeInput(language_to_learn);

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokens(userId);
    
    // Create profile data
    const profileData = {
      userId,
      email: sanitizedEmail,
      name: sanitizedName,
      initial_language_to_learn: sanitizedLanguage,
      isWaitlistUser: wasWaitlistUser,
      wlw: !!passphrase_hash, // Has wallet if passphrase_hash provided
      converted: wasWaitlistUser, // Mark as converted if was waitlist user
      ...(passphrase_hash && { passphrase_hash }),
      ...(encrypted_mnemonic && { encrypted_mnemonic }),
      ...(salt && { salt }),
      ...(nonce && { nonce }),
      ...(sei_address && { seiWalletAddress: sei_address }),
      ...(eth_address && { evmWalletAddress: eth_address }),
      ...(sei_public_key && { sei_public_key }),
      ...(eth_public_key && { eth_public_key }),
      wallet_created_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      const method = isExistingUser ? 'PUT' : 'POST';
      const url = isExistingUser 
        ? `${PROFILE_SERVICE_URL}/profile/${userId}` 
        : `${PROFILE_SERVICE_URL}/profile`;
        
      console.log(`${isExistingUser ? 'Updating' : 'Creating'} profile via ${url}`);
      const response = await axios[method.toLowerCase() as 'put' | 'post'](url, profileData, {
        timeout: 5000,
        headers: createInternalServiceHeaders()
      });
      console.log(`✅ ${isExistingUser ? 'Updated' : 'Created'} profile: Status ${response.status}`);
    } catch (error: any) {
      console.error(`Failed to ${isExistingUser ? 'update' : 'create'} user profile:`, error);
      return res.status(500).json({
        message: `Failed to ${isExistingUser ? 'update' : 'create'} user profile`,
        details: error.message
      });
    }
    
    // Calculate starting points
    const startingPoints = wasWaitlistUser ? 100 : 0;

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
  try {
    const { userId, walletAddress, ethWalletAddress, signupMethod } = req.body;
    
    // Validate required fields
    if (!userId) {
      return res.status(400).json({ message: "userId required" });
    }

    // For wallet auth, userId is actually the email
    const email = sanitizeInput(userId);

    // Check if user exists by email
    let userProfile;
    try {
      const response = await axios.get(`${PROFILE_SERVICE_URL}/profile/email/${encodeURIComponent(email)}`, {
        headers: createInternalServiceHeaders()
      });
      userProfile = response.data;
    } catch (err: any) {
      if (err.response?.status === 404) {
        return res.status(404).json({ message: "User not found. Please complete account setup first." });
      }
      console.error('Error fetching user profile:', err.message);
      return res.status(500).json({ message: 'Error validating user' });
    }

    // Check if user has completed wallet setup
    if (!userProfile.encrypted_mnemonic) {
      return res.status(400).json({ message: "Wallet setup not completed. Please complete setup first." });
    }

    // Generate tokens for the existing user
    const { accessToken, refreshToken } = await generateTokens(userProfile.userId);
    
    res.json({
      token: accessToken,
      refreshToken,
      userId: userProfile.userId,
      email: userProfile.email,
      walletAddress: sanitizeInput(walletAddress || ''),
      ethWalletAddress: sanitizeInput(ethWalletAddress || '')
    });
  } catch (err: any) {
    console.error("Wallet authentication error:", err.message);
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
    
    const userId = decoded.sub;
    if (!userId) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    
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

/* ── GET /auth/validate ───────────────────────────────────────────
   Body: { userId }
   Resp: { userId }
*/
router.get("/validate", (req: any, res) => {
  const userId = req.body.userId || req.query.userId;
  
  if (!userId) {
    return res.status(400).json({ message: "userId required" });
  }
  
  res.json({ 
    userId: userId
  });
});

export default router;
