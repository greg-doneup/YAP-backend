import express from 'express';
import mongoose from 'mongoose';
import { Profile as ProfileType, SecurityContext } from '../types';
import { getUserIdFromRequest } from '../shared/auth/authMiddleware';
import { Profile as ProfileModel } from '../models/Profile';
import { SecurityValidator } from '../utils/securityValidator';
import { AuditLogger, SecurityEventType } from '../utils/auditLogger';

const router = express.Router();

// Initialize security services
const auditLogger = new AuditLogger();

// Helper function to create security context
const createSecurityContext = (req: any): SecurityContext => ({
  userId: getUserIdFromRequest(req) || 'unknown',
  clientIp: req.headers['x-forwarded-for']?.split(',')[0] || 
            req.headers['x-real-ip'] || 
            req.connection?.remoteAddress || 
            'unknown',
  userAgent: req.headers['user-agent'] || 'unknown',
  requestId: req.headers['x-request-id']
});

/** GET /profile/email/:email - Check if email exists */
router.get('/email/:email', async (req, res, next) => {
  try {
    const email = req.params.email?.toLowerCase();
    console.log(`🔍 Email lookup request for: ${email}`);
    
    if (!email) {
      return res.status(400).json({
        error: 'missing_email',
        message: 'Email parameter is required'
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'invalid_email',
        message: 'Invalid email format'
      });
    }
    
    try {
      const profile = await ProfileModel.findOne({ email }).exec();
      
      if (profile) {
        console.log(`✅ Email found: ${email} -> userId: ${profile.userId}`);
        return res.json({
          exists: true,
          userId: profile.userId
        });
      } else {
        console.log(`❌ Email not found: ${email}`);
        return res.status(404).json({
          exists: false,
          message: 'Email not found'
        });
      }
    } catch (error: any) {
      console.error(`💥 Database error during email lookup for ${email}:`, error);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to check email existence'
      });
    }
  } catch (err) {
    console.error('💥 Unhandled error in email lookup:', err);
    next(err);
  }
});

/** GET /profile/:userId */
router.get('/:userId', async (req, res, next) => {
  try {
    // Create security context
    const context = createSecurityContext(req);
    
    // Verify user ID ownership or admin access
    const userIdFromToken = getUserIdFromRequest(req);
    const requestedUserId = req.params.userId;
    
    console.log(`🔍 Profile retrieval request: ${requestedUserId} by ${userIdFromToken}`);
    
    // Validate request security
    const securityValidation = SecurityValidator.validateRequestSecurity(req);
    if (!securityValidation.isValid) {
      await auditLogger.logSecurityViolation(req, 'request_security_validation_failed', {
        userId: userIdFromToken,
        issues: securityValidation.issues
      });
      return res.status(400).json({ 
        error: 'security_validation_failed',
        message: 'Request failed security validation'
      });
    }
    
    // Only allow users to access their own profile unless they have admin role
    const isOwnProfile = userIdFromToken === requestedUserId;
    const isAdmin = (req as any).user?.roles?.includes('admin');
    
    if (!isOwnProfile && !isAdmin) {
      await auditLogger.logSecurityViolation(req, 'unauthorized_profile_access', {
        requestedUserId,
        actualUserId: userIdFromToken
      });
      return res.status(403).json({ 
        error: 'forbidden',
        message: 'You can only access your own profile' 
      });
    }
    
    try {
      const profile = await ProfileModel.findOne({ userId: requestedUserId }).exec();
      
      if (!profile) {
        console.log(`❌ Profile not found: ${requestedUserId}`);
        await auditLogger.logProfileAccess(req, requestedUserId, false);
        return res.status(404).json({
          error: 'not_found',
          message: 'Profile not found'
        });
      }
      
      // Convert to plain object and remove sensitive data
      const profileData = profile.toObject();
      
      // Remove sensitive data from response (legacy custodial wallet fields)
      delete profileData.encryptedPrivateKey;
      delete profileData.walletAddress;
      delete profileData.keyCreatedAt;
      delete profileData.keyLastAccessed;
      
      console.log(`✅ Profile retrieved successfully: ${requestedUserId}`);
      
      // Log successful access
      await auditLogger.logProfileAccess(req, requestedUserId, true);
      
      res.json(profileData);
    } catch (error: any) {
      console.error(`💥 Database error retrieving profile ${requestedUserId}:`, error);
      await auditLogger.logProfileAccess(req, requestedUserId, false);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to retrieve profile'
      });
    }
  } catch (err) { 
    console.error('💥 Unhandled error in profile retrieval:', err);
    await auditLogger.logProfileAccess(req, req.params.userId, false);
    next(err); 
  }
});

/** POST /profile */
router.post('/', async (req, res, next) => {
  try {
    console.log('🔄 Processing profile creation request:');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    // Create security context
    const context = createSecurityContext(req);
    
    // Get userId from either token or body
    const userId = getUserIdFromRequest(req);
    console.log('Final userId resolved:', userId);
    
    if (!userId) {
      await auditLogger.logSecurityViolation(req, 'missing_user_id_in_profile_creation', {});
      return res.status(400).json({ 
        error: 'missing_user_id',
        message: 'No user ID found in the token or request body' 
      });
    }
    
    // Validate and sanitize input data
    const validationResult = SecurityValidator.validateProfileData(req.body);
    if (!validationResult.isValid) {
      await auditLogger.logSecurityViolation(req, 'profile_data_validation_failed', {
        userId,
        errors: validationResult.errors
      });
      return res.status(400).json({
        error: 'validation_failed',
        message: 'Profile data validation failed',
        details: validationResult.errors
      });
    }

    // Sanitize inputs
    let sanitizedEmail, sanitizedName, sanitizedLanguage;
    try {
      sanitizedEmail = SecurityValidator.sanitizeInput(req.body.email);
      sanitizedName = SecurityValidator.sanitizeInput(req.body.name);
      sanitizedLanguage = SecurityValidator.sanitizeInput(req.body.initial_language_to_learn);
    } catch (error: any) {
      await auditLogger.logSecurityViolation(req, 'input_sanitization_failed', {
        userId,
        error: error?.message || 'Unknown sanitization error'
      });
      return res.status(400).json({
        error: 'invalid_input',
        message: 'Input contains invalid characters'
      });
    }

    if (!sanitizedEmail) {
      return res.status(400).json({
        error: 'missing_email',
        message: 'Email is required'
      });
    }

    if (!sanitizedName) {
      return res.status(400).json({
        error: 'missing_name',
        message: 'Name is required'
      });
    }

    if (!sanitizedLanguage) {
      return res.status(400).json({
        error: 'missing_language',
        message: 'Initial language to learn is required'
      });
    }
    
    const now = new Date().toISOString();
    const profileData: ProfileType = {
      userId,
      email: sanitizedEmail,
      name: sanitizedName,
      initial_language_to_learn: sanitizedLanguage,
      createdAt: now,
      updatedAt: now,
      // Waitlist fields
      ...(req.body.isWaitlistUser !== undefined && { isWaitlistUser: req.body.isWaitlistUser }),
      ...(req.body.waitlist_signup_at !== undefined && { waitlist_signup_at: req.body.waitlist_signup_at }),
      ...(req.body.wlw !== undefined && { wlw: req.body.wlw }),
      ...(req.body.converted !== undefined && { converted: req.body.converted }),
      // Wallet fields
      ...(req.body.passphrase_hash !== undefined && { passphrase_hash: req.body.passphrase_hash }),
      ...(req.body.encrypted_mnemonic !== undefined && { encrypted_mnemonic: req.body.encrypted_mnemonic }),
      ...(req.body.salt !== undefined && { salt: req.body.salt }),
      ...(req.body.nonce !== undefined && { nonce: req.body.nonce }),
      // Secure stretched key fields (new architecture)
      ...(req.body.encryptedStretchedKey !== undefined && { encryptedStretchedKey: req.body.encryptedStretchedKey }),
      ...(req.body.encryptionSalt !== undefined && { encryptionSalt: req.body.encryptionSalt }),
      ...(req.body.stretchedKeyNonce !== undefined && { stretchedKeyNonce: req.body.stretchedKeyNonce }),
      // Additional wallet fields
      ...(req.body.encrypted_wallet_data !== undefined && { encrypted_wallet_data: req.body.encrypted_wallet_data }),
      ...(req.body.sei_wallet !== undefined && { sei_wallet: req.body.sei_wallet }),
      ...(req.body.eth_wallet !== undefined && { eth_wallet: req.body.eth_wallet }),
      ...(req.body.seiWalletAddress !== undefined && { seiWalletAddress: req.body.seiWalletAddress }),
      ...(req.body.evmWalletAddress !== undefined && { evmWalletAddress: req.body.evmWalletAddress }),
      ...(req.body.wallet_created_at !== undefined && { wallet_created_at: req.body.wallet_created_at }),
      ...(req.body.secured_at !== undefined && { secured_at: req.body.secured_at }),
    };
    
    try {
      // Try to get the profile first to definitively check if it exists
      const existingProfile = await ProfileModel.findOne({ userId }).exec();
      console.log(`Profile existence check for ${userId}:`, !!existingProfile);
      
      if (existingProfile) {
        console.log(`Profile already exists for ${userId}, returning 200 instead of 409`);
        await auditLogger.logProfileCreation(req, userId, true);
        // Return the existing profile with a 200 instead of error 409
        // This helps with retries and edge cases
        return res.status(200).json(existingProfile.toObject());
      }
      
      // Create the profile
      console.log(`Creating new profile for ${userId}`);
      const newProfile = new ProfileModel(profileData);
      const savedProfile = await newProfile.save();
      console.log(`Profile created successfully for ${userId}`);
      
      // Log successful creation
      await auditLogger.logProfileCreation(req, userId, true);
      
      return res.status(201).json(savedProfile.toObject());
    } catch (err: any) {
      console.error(`Error creating profile for ${userId}:`, err);
      
      // Handle duplicate key error from MongoDB
      if (err.code === 11000) {
        console.log(`Duplicate key error for ${userId}, checking if profile exists`);
        
        // Double-check if the profile was actually created despite the error
        const doubleCheckProfile = await ProfileModel.findOne({ userId }).exec();
        if (doubleCheckProfile) {
          console.log(`Despite error, profile exists for ${userId}, returning 200`);
          await auditLogger.logProfileCreation(req, userId, true);
          return res.status(200).json(doubleCheckProfile.toObject());
        }
        
        console.log(`Duplicate key error for ${userId}, returning 409`);
        await auditLogger.logProfileCreation(req, userId, false);
        return res.status(409).json({ 
          error: 'profile_exists',
          message: 'Profile already exists for this user' 
        });
      }
      
      // Log failed creation
      await auditLogger.logProfileCreation(req, userId, false);
      throw err;
    }
  } catch (err) { 
    console.error('💥 Unhandled error in profile creation:', err);
    await auditLogger.logProfileCreation(req, getUserIdFromRequest(req) || 'unknown', false);
    next(err); 
  }
});

/** PATCH /profile/:userId */
router.patch('/:userId', async (req, res, next) => {
  try {
    // Create security context
    const context = createSecurityContext(req);
    
    // Verify ownership or admin access
    const userIdFromToken = getUserIdFromRequest(req);
    const requestedUserId = req.params.userId;
    
    console.log(`🔄 Profile update request: ${requestedUserId} by ${userIdFromToken}`);
    
    // Validate request security
    const securityValidation = SecurityValidator.validateRequestSecurity(req);
    if (!securityValidation.isValid) {
      await auditLogger.logSecurityViolation(req, 'request_security_validation_failed', {
        userId: userIdFromToken,
        issues: securityValidation.issues
      });
      return res.status(400).json({ 
        error: 'security_validation_failed',
        message: 'Request failed security validation'
      });
    }
    
    // Only allow users to update their own profile unless they have admin role
    const isOwnProfile = userIdFromToken === requestedUserId;
    const isAdmin = (req as any).user?.roles?.includes('admin');
    
    if (!isOwnProfile && !isAdmin) {
      await auditLogger.logSecurityViolation(req, 'unauthorized_profile_update', {
        requestedUserId,
        actualUserId: userIdFromToken
      });
      return res.status(403).json({ 
        error: 'forbidden',
        message: 'You can only update your own profile' 
      });
    }
    
    // Validate and sanitize update data
    const validationResult = SecurityValidator.validateProfileData(req.body);
    if (!validationResult.isValid) {
      await auditLogger.logSecurityViolation(req, 'profile_update_validation_failed', {
        userId: userIdFromToken,
        errors: validationResult.errors
      });
      return res.status(400).json({
        error: 'validation_failed',
        message: 'Profile update data validation failed',
        details: validationResult.errors
      });
    }
    
    const now = new Date().toISOString();
    const updates: Record<string, any> = { updatedAt: now };
    const updatedFields: string[] = [];
    
    try {
      // Allow updating email, name, and language preference with sanitization
      if (req.body.email !== undefined) {
        try {
          updates.email = SecurityValidator.sanitizeInput(req.body.email);
          updatedFields.push('email');
        } catch (error: any) {
          await auditLogger.logSecurityViolation(req, 'email_sanitization_failed', {
            userId: userIdFromToken,
            error: error?.message || 'Unknown error'
          });
          return res.status(400).json({
            error: 'invalid_email',
            message: 'Email contains invalid characters'
          });
        }
      }
      
      if (req.body.name !== undefined) {
        try {
          updates.name = SecurityValidator.sanitizeInput(req.body.name);
          updatedFields.push('name');
        } catch (error: any) {
          await auditLogger.logSecurityViolation(req, 'name_sanitization_failed', {
            userId: userIdFromToken,
            error: error?.message || 'Unknown error'
          });
          return res.status(400).json({
            error: 'invalid_name',
            message: 'Name contains invalid characters'
          });
        }
      }
      
      if (req.body.initial_language_to_learn !== undefined) {
        try {
          const newLanguage = SecurityValidator.sanitizeInput(req.body.initial_language_to_learn);
          
          // Check if language is actually changing
          const currentProfile = await ProfileModel.findOne({ userId: requestedUserId }).exec();
          const previousLanguage = currentProfile?.initial_language_to_learn;
          
          if (previousLanguage && previousLanguage !== newLanguage) {
            // Language is changing - notify learning service to reset progress
            console.log(`Language change detected for user ${requestedUserId}: ${previousLanguage} -> ${newLanguage}`);
            
            // Log the language change for audit purposes
            await auditLogger.logProfileUpdate(req, requestedUserId, ['language_change'], true);
          }
          
          updates.initial_language_to_learn = newLanguage;
          updatedFields.push('initial_language_to_learn');
        } catch (error: any) {
          await auditLogger.logSecurityViolation(req, 'language_sanitization_failed', {
            userId: userIdFromToken,
            error: error?.message || 'Unknown error'
          });
          return res.status(400).json({
            error: 'invalid_language',
            message: 'Language contains invalid characters'
          });
        }
      }

      // Update the profile
      const result = await ProfileModel.findOneAndUpdate(
        { userId: requestedUserId },
        { $set: updates },
        { new: true, runValidators: true }
      ).exec();
      
      if (!result) {
        console.log(`❌ Profile not found for update: ${requestedUserId}`);
        await auditLogger.logProfileUpdate(req, requestedUserId, updatedFields, false);
        return res.status(404).json({
          error: 'not_found',
          message: 'Profile not found'
        });
      }
      
      console.log(`✅ Profile updated successfully: ${requestedUserId}, fields: ${updatedFields.join(', ')}`);
      
      // Log successful update
      await auditLogger.logProfileUpdate(req, requestedUserId, updatedFields, true);
      
      res.sendStatus(204);
    } catch (error: any) {
      console.error(`💥 Database error updating profile ${requestedUserId}:`, error);
      await auditLogger.logProfileUpdate(req, requestedUserId, updatedFields, false);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to update profile'
      });
    }
  } catch (err) { 
    console.error('💥 Unhandled error in profile update:', err);
    await auditLogger.logProfileUpdate(req, req.params.userId, [], false);
    next(err); 
  }
});

/** PUT /profile/:userId/wallet - Update profile with wallet data for waitlist conversion */
router.put('/:userId/wallet', async (req, res, next) => {
  try {
    const context = createSecurityContext(req);
    const userIdFromToken = getUserIdFromRequest(req);
    const requestedUserId = req.params.userId;
    
    // For waitlist conversion, we allow this operation even without full auth
    // The auth service handles the security validation
    
    const { 
      wlw, 
      passphrase_hash, 
      encrypted_mnemonic, 
      salt, 
      nonce, 
      sei_wallet, 
      eth_wallet, 
      secured_at, 
      converted 
    } = req.body;
    
    // Validate required fields for wallet conversion
    if (!passphrase_hash || !encrypted_mnemonic || !salt || !nonce) {
      return res.status(400).json({
        error: 'missing_wallet_data',
        message: 'Wallet encryption data is required'
      });
    }
    
    if (!sei_wallet?.address || !eth_wallet?.address) {
      return res.status(400).json({
        error: 'missing_wallet_addresses',
        message: 'Both SEI and ETH wallet addresses are required'
      });
    }
    
    // Update profile with wallet data
    const now = new Date().toISOString();
    const updates = {
      wlw: wlw || true,
      passphrase_hash,
      encrypted_mnemonic,
      salt,
      nonce,
      encrypted_wallet_data: {
        encrypted_mnemonic,
        salt,
        nonce,
        sei_address: sei_wallet.address,
        eth_address: eth_wallet.address
      },
      sei_wallet,
      eth_wallet,
      secured_at: secured_at || now,
      converted: converted || true,
      updatedAt: now
    };
    
    try {
      const result = await ProfileModel.findOneAndUpdate(
        { userId: requestedUserId },
        { $set: updates },
        { new: true, runValidators: true }
      );
      
      if (!result) {
        return res.status(404).json({
          error: 'profile_not_found',
          message: 'Profile not found'
        });
      }
      
      console.log(`✅ Updated profile ${requestedUserId} with wallet data for conversion`);
      
      res.json({
        success: true,
        message: 'Profile updated with wallet data successfully',
        walletAddress: sei_wallet.address,
        ethWalletAddress: eth_wallet.address
      });
      
    } catch (error: any) {
      console.error('Error updating profile with wallet data:', error);
      return res.status(500).json({
        error: 'update_failed',
        message: 'Failed to update profile with wallet data',
        details: error.message
      });
    }
    
  } catch (err) {
    next(err);
  }
});

/** PUT /profile/:userId/wallet-conversion - Update profile with secure wallet data for conversion */
router.put('/:userId/wallet-conversion', async (req, res, next) => {
  try {
    const context = createSecurityContext(req);
    const requestedUserId = req.params.userId;
    
    console.log(`🔄 Processing wallet conversion for user: ${requestedUserId}`);
    
    const { 
      email,
      name,
      initial_language_to_learn,
      isWaitlistUser,
      wlw, 
      passphrase_hash, // CRITICAL: Extract passphrase hash for wallet security
      encryptedStretchedKey,
      encryptionSalt,
      stretchedKeyNonce,
      encrypted_mnemonic, 
      mnemonic_salt, 
      mnemonic_nonce, 
      salt, // Also extract top-level salt for compatibility
      nonce, // Also extract top-level nonce for compatibility
      sei_wallet, 
      eth_wallet,
      encrypted_wallet_data,
      seiWalletAddress, // Top-level wallet addresses for compatibility
      evmWalletAddress,
      secured_at, 
      wallet_created_at, // Wallet creation timestamp
      converted,
      updatedAt
    } = req.body;
    
    // Validate required secure fields
    // Enhanced debugging for stretched key data issue
    console.log('🔍 DEBUG: Wallet conversion received data:', {
      hasEncryptedStretchedKey: !!encryptedStretchedKey,
      encryptedStretchedKeyType: typeof encryptedStretchedKey,
      encryptedStretchedKeyIsArray: Array.isArray(encryptedStretchedKey),
      encryptedStretchedKeyLength: Array.isArray(encryptedStretchedKey) ? encryptedStretchedKey.length : 'not-array',
      encryptedStretchedKeyPreview: Array.isArray(encryptedStretchedKey) ? encryptedStretchedKey.slice(0, 5) : encryptedStretchedKey,
      hasEncryptionSalt: !!encryptionSalt,
      encryptionSaltType: typeof encryptionSalt,
      encryptionSaltLength: Array.isArray(encryptionSalt) ? encryptionSalt.length : 'not-array',
      hasStretchedKeyNonce: !!stretchedKeyNonce,
      stretchedKeyNonceType: typeof stretchedKeyNonce,
      stretchedKeyNonceLength: Array.isArray(stretchedKeyNonce) ? stretchedKeyNonce.length : 'not-array'
    });
    
    // Check if this is old format (empty arrays) or new format
    const isOldFormat = Array.isArray(encryptedStretchedKey) && encryptedStretchedKey.length === 0;
    
    console.log('🔍 DEBUG: Format detection:', {
      isOldFormat,
      willIncludeStretchedKeyData: !isOldFormat
    });
    
    // Validate required secure fields
    // For secure stretched key architecture, passphrase_hash is optional (placeholder)
    // The real security comes from client-side encrypted stretched key data
    if (!isOldFormat) {
      // New secure format validation
      if (!encryptedStretchedKey || !encryptionSalt || !stretchedKeyNonce) {
        return res.status(400).json({
          error: 'missing_encrypted_passphrase_data',
          message: 'Encrypted stretched passphrase data is required'
        });
      }
    }
    
    if (!encrypted_mnemonic || !mnemonic_salt || !mnemonic_nonce) {
      return res.status(400).json({
        error: 'missing_encrypted_mnemonic_data',
        message: 'Encrypted mnemonic data is required'
      });
    }
    
    if (!sei_wallet?.address || !eth_wallet?.address) {
      return res.status(400).json({
        error: 'missing_wallet_addresses',
        message: 'Both SEI and ETH wallet addresses are required'
      });
    }
    
    // Prepare update with secure wallet data
    const now = new Date().toISOString();
    
    const updates = {
      // Basic profile updates
      ...(email && { email }),
      ...(name && { name }),
      ...(initial_language_to_learn && { initial_language_to_learn }),
      
      // Waitlist status (preserve if it's a waitlist user)
      ...(isWaitlistUser !== undefined && { isWaitlistUser }),
      
      // Wallet status
      wlw: wlw !== undefined ? wlw : true,
      
      // Encrypted stretched passphrase (only for new format)
      ...(isOldFormat ? {} : {
        encryptedStretchedKey,
        encryptionSalt,
        stretchedKeyNonce,
      }),
      
      // Encrypted mnemonic (encrypted with stretched key or old format)
      encrypted_mnemonic,
      mnemonic_salt,
      mnemonic_nonce,
      
      // Top-level salt and nonce for compatibility
      salt: salt || mnemonic_salt,
      nonce: nonce || mnemonic_nonce,
      
      // Public wallet addresses
      sei_wallet,
      eth_wallet,
      
      // Top-level wallet addresses for compatibility
      seiWalletAddress: seiWalletAddress || sei_wallet?.address,
      evmWalletAddress: evmWalletAddress || eth_wallet?.address,
      
      // Enhanced wallet data for compatibility
      encrypted_wallet_data: encrypted_wallet_data || {
        encrypted_mnemonic,
        salt: salt || mnemonic_salt,
        nonce: nonce || mnemonic_nonce,
        sei_address: sei_wallet.address,
        eth_address: eth_wallet.address
      },
      
      // Metadata with proper timestamps
      secured_at: secured_at || now,
      wallet_created_at: wallet_created_at || now,
      converted: converted !== undefined ? converted : true,
      updatedAt: updatedAt || now
    };
    
    try {
      const result = await ProfileModel.findOneAndUpdate(
        { userId: requestedUserId },
        { $set: updates },
        { new: true, runValidators: true }
      );
      
      if (!result) {
        return res.status(404).json({
          error: 'profile_not_found',
          message: 'Profile not found for conversion'
        });
      }
      
      console.log(`✅ Successfully converted profile ${requestedUserId} to ${isOldFormat ? 'legacy' : 'secure'} wallet`);
      
      // Log successful wallet conversion
      await auditLogger.logSecurityEvent(
        SecurityEventType.PROFILE_UPDATE,
        'secure_wallet_conversion',
        `profile:${requestedUserId}`,
        req,
        true,
        {
          conversionFormat: isOldFormat ? 'legacy' : 'secure',
          hasEncryptedStretchedKey: !isOldFormat && !!encryptedStretchedKey,
          walletAddresses: {
            sei: sei_wallet.address,
            eth: eth_wallet.address
          }
        }
      );
      
      res.json({
        success: true,
        message: 'Profile converted to secure wallet successfully',
        userId: requestedUserId,
        walletAddresses: {
          seiAddress: sei_wallet.address,
          ethAddress: eth_wallet.address
        },
        converted: true
      });
      
    } catch (error: any) {
      console.error('❌ Error converting profile to secure wallet:', error);
      
      await auditLogger.logSecurityEvent(
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        'secure_wallet_conversion_failed',
        `profile:${requestedUserId}`,
        req,
        false,
        {
          error: error.message
        }
      );
      
      return res.status(500).json({
        error: 'conversion_failed',
        message: 'Failed to convert profile to secure wallet',
        details: error.message
      });
    }
    
  } catch (err) {
    console.error('❌ Unhandled error in wallet conversion:', err);
    next(err);
  }
});

/** GET /profile/:userId/gdpr/export - Export all user data (GDPR compliance) */
router.get('/:userId/gdpr/export', async (req, res, next) => {
  try {
    const context = createSecurityContext(req);
    const userIdFromToken = getUserIdFromRequest(req);
    const requestedUserId = req.params.userId;
    
    console.log(`🔍 GDPR export request: ${requestedUserId} by ${userIdFromToken}`);
    
    // Verify ownership (admin access allowed for GDPR)
    const isOwnProfile = userIdFromToken === requestedUserId;
    const isAdmin = (req as any).user?.roles?.includes('admin');
    
    if (!isOwnProfile && !isAdmin) {
      await auditLogger.logSecurityViolation(req, 'unauthorized_gdpr_export', {
        requestedUserId,
        actualUserId: userIdFromToken
      });
      return res.status(403).json({ 
        error: 'forbidden',
        message: 'You can only export your own data' 
      });
    }
    
    try {
      const profile = await ProfileModel.findOne({ userId: requestedUserId }).exec();
      
      if (!profile) {
        console.log(`❌ Profile not found for GDPR export: ${requestedUserId}`);
        return res.status(404).json({
          error: 'profile_not_found',
          message: 'Profile not found'
        });
      }
      
      const profileData = profile.toObject();
      
      // Create comprehensive export (excluding actual private key)
      const exportData = {
        profile: {
          userId: profileData.userId,
          email: profileData.email,
          name: profileData.name,
          initial_language_to_learn: profileData.initial_language_to_learn,
          createdAt: profileData.createdAt,
          updatedAt: profileData.updatedAt
        },
        wallet: profileData.encrypted_mnemonic ? {
          hasNonCustodialWallet: true,
          walletCreatedAt: profileData.wallet_created_at,
          securedAt: profileData.secured_at,
          seiWalletAddress: profileData.seiWalletAddress,
          evmWalletAddress: profileData.evmWalletAddress
        } : (profileData.walletAddress ? {
          hasLegacyCustodialWallet: true,
          walletAddress: profileData.walletAddress,
          keyCreatedAt: profileData.keyCreatedAt,
          keyLastAccessed: profileData.keyLastAccessed,
          hasEncryptedPrivateKey: !!profileData.encryptedPrivateKey
        } : null),
        export: {
          exportedAt: new Date().toISOString(),
          exportedBy: userIdFromToken,
          dataTypes: ['profile', 'wallet_metadata']
        }
      };
      
      console.log(`✅ GDPR export completed for: ${requestedUserId}`);
      
      // Log GDPR export
      await auditLogger.logGdprEvent(req, requestedUserId, 'export', true);
      
      res.json(exportData);
    } catch (error: any) {
      console.error(`💥 Database error during GDPR export for ${requestedUserId}:`, error);
      await auditLogger.logGdprEvent(req, requestedUserId, 'export', false);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to export user data'
      });
    }
  } catch (err) {
    console.error('💥 Unhandled error in GDPR export:', err);
    await auditLogger.logGdprEvent(req, req.params.userId, 'export', false);
    next(err);
  }
});

/** DELETE /profile/:userId/gdpr - Delete all user data (GDPR compliance) */
router.delete('/:userId/gdpr', async (req, res, next) => {
  try {
    const context = createSecurityContext(req);
    const userIdFromToken = getUserIdFromRequest(req);
    const requestedUserId = req.params.userId;
    
    console.log(`🗑️ GDPR deletion request: ${requestedUserId} by ${userIdFromToken}`);
    
    // Verify ownership (admin access allowed for GDPR)
    const isOwnProfile = userIdFromToken === requestedUserId;
    const isAdmin = (req as any).user?.roles?.includes('admin');
    
    if (!isOwnProfile && !isAdmin) {
      await auditLogger.logSecurityViolation(req, 'unauthorized_gdpr_deletion', {
        requestedUserId,
        actualUserId: userIdFromToken
      });
      return res.status(403).json({ 
        error: 'forbidden',
        message: 'You can only delete your own data' 
      });
    }
    
    try {
      const profile = await ProfileModel.findOne({ userId: requestedUserId }).exec();
      
      if (!profile) {
        console.log(`❌ Profile not found for GDPR deletion: ${requestedUserId}`);
        await auditLogger.logGdprEvent(req, requestedUserId, 'delete', false);
        return res.status(404).json({
          error: 'profile_not_found',
          message: 'Profile not found'
        });
      }
      
      const profileData = profile.toObject();
      
      // Log wallet deletion if exists (legacy custodial wallets no longer supported)
      if (profileData.walletAddress) {
        await auditLogger.logSecurityViolation(req, 'legacy_wallet_data_found', {
          userId: requestedUserId,
          walletAddress: profileData.walletAddress
        });
      }
      
      // Delete the entire profile
      await ProfileModel.deleteOne({ userId: requestedUserId }).exec();
      
      console.log(`✅ GDPR deletion completed for: ${requestedUserId}`);
      
      // Log GDPR deletion
      await auditLogger.logGdprEvent(req, requestedUserId, 'delete', true);
      
      res.json({
        success: true,
        message: 'All user data deleted successfully',
        deletedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error(`💥 Database error during GDPR deletion for ${requestedUserId}:`, error);
      await auditLogger.logGdprEvent(req, requestedUserId, 'delete', false);
      return res.status(500).json({
        error: 'database_error',
        message: 'Failed to delete user data'
      });
    }
  } catch (err) {
    console.error('💥 Unhandled error in GDPR deletion:', err);
    await auditLogger.logGdprEvent(req, req.params.userId, 'delete', false);
    next(err);
  }
});

export default router;
