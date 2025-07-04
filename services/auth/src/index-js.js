const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const PORT = parseInt(process.env.PORT || '8080');

// Environment variables
const APP_JWT_SECRET = process.env.APP_JWT_SECRET || 'fallback-secret';
const APP_REFRESH_SECRET = process.env.APP_REFRESH_SECRET || APP_JWT_SECRET + '_refresh';
const PROFILE_SERVICE_URL = process.env.PROFILE_SERVICE_URL || 'http://profile-service';

// Basic middleware
app.use(express.json({ limit: '10mb' }));

// CORS
app.use((req, res, next) => {
  const allowedOrigins = [
    'http://localhost:8100', 
    'http://localhost:3000', 
    'http://localhost:4200',
    'https://goyap.ai'
  ];
  
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Helper functions
const sanitizeInput = (input) => {
  if (!input || typeof input !== 'string') return '';
  return input.trim().substring(0, 1000);
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const generateTokens = async (userId) => {
  const accessToken = jwt.sign(
    { sub: userId, type: 'access' },
    APP_JWT_SECRET,
    { expiresIn: '15m' }
  );
  
  const refreshToken = jwt.sign(
    { sub: userId, type: 'refresh' },
    APP_REFRESH_SECRET,
    { expiresIn: '30d' }
  );
  
  return { accessToken, refreshToken };
};

// POST /auth/waitlist/simple
app.post("/auth/waitlist/simple", async (req, res) => {
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
        headers: { 'Content-Type': 'application/json' }
      });
      
      // User already exists
      return res.status(409).json({
        success: false,
        error: 'email_exists',
        message: 'Email already registered'
      });
      
    } catch (err) {
      if (err.response && err.response.status !== 404) {
        console.error('Error checking email uniqueness for waitlist:', err.message);
        return res.status(500).json({ 
          success: false,
          message: 'Error validating email uniqueness'
        });
      }
    }

    // Generate user ID
    const userId = crypto.randomBytes(32).toString('hex');
    
    // Create waitlist profile
    const profileData = {
      userId,
      email: sanitizedEmail,
      name: sanitizedName,
      initial_language_to_learn: sanitizedLanguage,
      isWaitlistUser: true,
      wlw: false,
      converted: false,
      waitlist_signup_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      const response = await axios.post(`${PROFILE_SERVICE_URL}/profile`, profileData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      });
      console.log(`✅ Created waitlist profile: Status ${response.status}`);
    } catch (error) {
      console.error('Failed to create waitlist profile:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Error creating waitlist profile'
      });
    }

    // Generate tokens for waitlist user
    const { accessToken, refreshToken } = await generateTokens(userId);

    return res.status(201).json({
      success: true,
      message: "Successfully added to waitlist",
      data: {
        userId,
        email: sanitizedEmail,
        name: sanitizedName,
        language_to_learn: sanitizedLanguage,
        isWaitlistUser: true,
        token: accessToken,
        refreshToken
      }
    });

  } catch (error) {
    console.error('Waitlist signup error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// POST /auth/wallet/signup
app.post("/auth/wallet/signup", async (req, res) => {
  try {
    const { 
      email, 
      name, 
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
    if (!email || !name || !language_to_learn) {
      return res.status(400).json({ message: "Email, name, and language preference are required" });
    }
    
    if (!passphrase_hash) {
      return res.status(400).json({ message: "passphrase_hash required" });
    }
    
    if (!encrypted_mnemonic || !salt || !nonce || !sei_address || !eth_address) {
      return res.status(400).json({ message: "encrypted wallet data required" });
    }

    // Sanitize inputs
    const sanitizedEmail = sanitizeInput(email);
    const sanitizedName = sanitizeInput(name);
    const sanitizedLanguage = sanitizeInput(language_to_learn);
    
    // Check if user already exists (waitlist user conversion)
    let existingProfile = null;
    let isWaitlistConversion = false;
    
    try {
      const profileResponse = await axios.get(`${PROFILE_SERVICE_URL}/profile/email/${encodeURIComponent(sanitizedEmail)}`, {
        headers: { 'Content-Type': 'application/json' }
      });
      existingProfile = profileResponse.data;
      
      if (existingProfile.wlw) {
        return res.status(409).json({ message: "Email already has wallet setup" });
      }
      
      if (existingProfile.isWaitlistUser) {
        isWaitlistConversion = true;
      }
      
    } catch (err) {
      if (err.response && err.response.status !== 404) {
        console.error('Error checking email uniqueness:', err.message);
        return res.status(500).json({ message: 'Error validating email uniqueness' });
      }
    }

    // Generate user ID
    const userId = existingProfile ? existingProfile.userId : crypto.randomBytes(32).toString('hex');
    
    // Create/update profile with wallet data
    const profileData = {
      userId,
      email: sanitizedEmail,
      name: sanitizedName,
      initial_language_to_learn: sanitizedLanguage,
      isWaitlistUser: isWaitlistConversion,
      wlw: true,
      converted: isWaitlistConversion,
      passphrase_hash,
      sei_wallet: {
        address: sei_address,
        public_key: sei_public_key || 'sei_pub_' + crypto.randomBytes(16).toString('hex')
      },
      eth_wallet: {
        address: eth_address,
        public_key: eth_public_key || 'eth_pub_' + crypto.randomBytes(16).toString('hex')
      },
      encrypted_mnemonic,
      salt,
      nonce,
      secured_at: new Date().toISOString(),
      createdAt: existingProfile ? existingProfile.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    try {
      if (existingProfile) {
        // Update existing profile
        const response = await axios.put(`${PROFILE_SERVICE_URL}/profile/${userId}`, profileData, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000
        });
        console.log(`✅ Updated profile with wallet: Status ${response.status}`);
      } else {
        // Create new profile
        const response = await axios.post(`${PROFILE_SERVICE_URL}/profile`, profileData, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000
        });
        console.log(`✅ Created profile with wallet: Status ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to create/update profile with wallet:', error.message);
      return res.status(500).json({ message: 'Error setting up wallet profile' });
    }

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokens(userId);

    return res.status(201).json({
      success: true,
      message: isWaitlistConversion ? "Waitlist user converted successfully" : "Account created successfully",
      data: {
        userId,
        email: sanitizedEmail,
        name: sanitizedName,
        language_to_learn: sanitizedLanguage,
        walletAddress: sei_address,
        ethWalletAddress: eth_address,
        isWaitlistConversion,
        token: accessToken,
        refreshToken
      }
    });

  } catch (error) {
    console.error('Wallet signup error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /auth/wallet (wallet authentication)
app.post("/auth/wallet", async (req, res) => {
  try {
    const { userId, walletAddress, ethWalletAddress } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: "userId required" });
    }

    // For wallet auth, userId is actually the email
    const email = sanitizeInput(userId);

    // Check if user exists by email
    let userProfile;
    try {
      const response = await axios.get(`${PROFILE_SERVICE_URL}/profile/email/${encodeURIComponent(email)}`, {
        headers: { 'Content-Type': 'application/json' }
      });
      userProfile = response.data;
    } catch (err) {
      if (err.response && err.response.status === 404) {
        return res.status(404).json({ message: "User not found. Please complete account setup first." });
      }
      console.error('Error fetching user profile:', err.message);
      return res.status(500).json({ message: 'Error validating user' });
    }

    // Check if user has completed wallet setup
    if (!userProfile.wlw || !userProfile.sei_wallet || !userProfile.eth_wallet) {
      return res.status(400).json({ 
        message: "Wallet setup not completed. Please complete wallet setup first."
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokens(userProfile.userId);

    return res.status(200).json({
      success: true,
      token: accessToken,
      refreshToken,
      userId: userProfile.userId,
      email: userProfile.email,
      name: userProfile.name,
      walletAddress: userProfile.sei_wallet.address,
      ethWalletAddress: userProfile.eth_wallet.address,
      language_to_learn: userProfile.initial_language_to_learn
    });

  } catch (error) {
    console.error('Wallet auth error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /auth/refresh
app.post("/auth/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, APP_REFRESH_SECRET);
    const userId = decoded.sub;

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = await generateTokens(userId);

    return res.status(200).json({
      token: accessToken,
      refreshToken: newRefreshToken,
      userId
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
});

// GET /auth/validate
app.get("/auth/validate", (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing authorization token' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, APP_JWT_SECRET);
    return res.status(200).json({
      userId: decoded.sub,
      type: decoded.type
    });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
});

// POST /auth/logout
app.post("/auth/logout", (req, res) => {
  // In a stateless JWT system, logout is handled client-side
  res.json({ message: "Successfully logged out" });
});

// Health check
app.get('/healthz', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'auth-service-js',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    features: [
      'waitlist_signup',
      'wallet_signup', 
      'wallet_auth',
      'token_refresh',
      'token_validation'
    ]
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Auth service error:', err);
  res.status(err.statusCode || 500).json({ message: err.message || 'Internal Server Error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Auth service running on port ${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET /healthz');
  console.log('  POST /auth/waitlist/simple');
  console.log('  POST /auth/wallet/signup');
  console.log('  POST /auth/wallet');
  console.log('  POST /auth/refresh');
  console.log('  POST /auth/logout');
  console.log('  GET /auth/validate');
});
