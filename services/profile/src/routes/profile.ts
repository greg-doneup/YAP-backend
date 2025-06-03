import express from 'express';
import { connectToDatabase, getItem, putItem, updateItem } from '../mon/mongo';
import { Profile, SecurityContext } from '../types';
import { getUserIdFromRequest } from '../shared/auth/authMiddleware';
import { ProfileModel } from '../mon/mongo';
import { SecurityValidator } from '../utils/securityValidator';
import { AuditLogger, SecurityEventType } from '../utils/auditLogger';
import { PrivateKeyService } from '../utils/privateKeyService';

const router = express.Router();

// Initialize security services
const auditLogger = new AuditLogger();
const privateKeyService = new PrivateKeyService();

// Initialize MongoDB connection
connectToDatabase().catch(err => {
  console.error('Failed to connect to MongoDB:', err);
});

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

/** GET /profile/:userId */
router.get('/:userId', async (req, res, next) => {
  try {
    // Create security context
    const context = createSecurityContext(req);
    
    // Verify user ID ownership or admin access
    const userIdFromToken = getUserIdFromRequest(req);
    const requestedUserId = req.params.userId;
    
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
    
    const { Item } = await getItem(requestedUserId);
    if (!Item) {
      await auditLogger.logProfileAccess(req, requestedUserId, false);
      return res.status(404).json({
        error: 'not_found',
        message: 'Profile not found'
      });
    }
    
    // Remove sensitive data from response
    const sanitizedProfile = { ...Item };
    if ('encryptedPrivateKey' in sanitizedProfile) {
      delete (sanitizedProfile as any).encryptedPrivateKey;
    }
    
    // Log successful access
    await auditLogger.logProfileAccess(req, requestedUserId, true);
    
    res.json(sanitizedProfile);
  } catch (err) { 
    await auditLogger.logProfileAccess(req, req.params.userId, false);
    next(err); 
  }
});

/** POST /profile */
router.post('/', async (req, res, next) => {
  try {
    console.log('Processing profile creation request:');
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
      sanitizedLanguage = SecurityValidator.sanitizeInput(req.body.language_to_learn);
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
    const profile: Profile = {
      userId,
      email: sanitizedEmail,
      name: sanitizedName,
      initial_language_to_learn: sanitizedLanguage,
      createdAt: now,
      updatedAt: now,
    };
    
    // Try to get the profile first to definitively check if it exists
    const { Item: existingProfile } = await getItem(userId);
    console.log(`Profile existence check for ${userId}:`, !!existingProfile);
    
    if (existingProfile) {
      console.log(`Profile already exists for ${userId}, returning 200 instead of 409`);
      await auditLogger.logProfileCreation(req, userId, true);
      // Return the existing profile with a 200 instead of error 409
      // This helps with retries and edge cases
      return res.status(200).json(existingProfile);
    }
    
    // Create the profile
    try {
      console.log(`Creating new profile for ${userId}`);
      await putItem(profile);
      console.log(`Profile created successfully for ${userId}`);
      
      // Log successful creation
      await auditLogger.logProfileCreation(req, userId, true);
      
      return res.status(201).json(profile);
    } catch (err: any) {
      console.error(`Error creating profile for ${userId}:`, err);
      
      // One more check to see if the profile was actually created despite the error
      const { Item: doubleCheckProfile } = await getItem(userId);
      if (doubleCheckProfile) {
        console.log(`Despite error, profile exists for ${userId}, returning 200`);
        await auditLogger.logProfileCreation(req, userId, true);
        return res.status(200).json(doubleCheckProfile);
      }
      
      // Handle duplicate key error from MongoDB
      if (err.code === 11000) {
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
    console.error('Unhandled error in profile creation:', err);
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
        updates.initial_language_to_learn = SecurityValidator.sanitizeInput(req.body.initial_language_to_learn);
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

    // Format for MongoDB update
    const result = await updateItem({
      Key: { userId: requestedUserId },
      UpdateExpression: `SET ${Object.keys(updates).map((k, i) => `#k${i} = :v${i}`).join(', ')}`,
      ExpressionAttributeNames: Object.keys(updates).reduce((acc, k, i) => ({ ...acc, [`#k${i}`]: k }), {}),
      ExpressionAttributeValues: Object.values(updates).reduce((acc, v, i) => ({ ...acc, [`:v${i}`]: v }), {})
    });
    
    if (!result.Attributes) {
      await auditLogger.logProfileUpdate(req, requestedUserId, updatedFields, false);
      return res.status(404).json({
        error: 'not_found',
        message: 'Profile not found'
      });
    }
    
    // Log successful update
    await auditLogger.logProfileUpdate(req, requestedUserId, updatedFields, true);
    
    res.sendStatus(204);
  } catch (err) { 
    await auditLogger.logProfileUpdate(req, req.params.userId, [], false);
    next(err); 
  }
});

/** GET /profile/email/:email */
router.get('/email/:email', async (req, res, next) => {
  try {
    const email = req.params.email;
    
    // Validate and sanitize email
    if (!SecurityValidator.validateEmail(email)) {
      await auditLogger.logSecurityViolation(req, 'invalid_email_lookup', {
        email: SecurityValidator.hashSensitiveData(email)
      });
      return res.status(400).json({ 
        error: 'invalid_email', 
        message: 'Invalid email format' 
      });
    }
    
    const sanitizedEmail = SecurityValidator.sanitizeInput(email);
    const found = await ProfileModel.findOne({ email: sanitizedEmail }).lean();
    
    if (!found) {
      return res.status(404).json({ error: 'not_found', message: 'Profile not found' });
    }
    
    // Remove sensitive data
    const sanitizedProfile = { ...found };
    if ('encryptedPrivateKey' in sanitizedProfile) {
      delete (sanitizedProfile as any).encryptedPrivateKey;
    }
    
    return res.json(sanitizedProfile);
  } catch (err) {
    next(err);
  }
});

/** POST /profile/:userId/wallet - Store encrypted private key */
router.post('/:userId/wallet', async (req, res, next) => {
  try {
    const context = createSecurityContext(req);
    const userIdFromToken = getUserIdFromRequest(req);
    const requestedUserId = req.params.userId;
    
    // Verify ownership
    if (userIdFromToken !== requestedUserId) {
      await auditLogger.logSecurityViolation(req, 'unauthorized_wallet_storage', {
        requestedUserId,
        actualUserId: userIdFromToken
      });
      return res.status(403).json({ 
        error: 'forbidden',
        message: 'You can only store wallet keys for your own profile' 
      });
    }
    
    const { privateKey } = req.body;
    
    if (!privateKey) {
      await auditLogger.logSecurityViolation(req, 'missing_private_key', {
        userId: userIdFromToken
      });
      return res.status(400).json({
        error: 'missing_private_key',
        message: 'Private key is required'
      });
    }
    
    // Store the encrypted private key
    const { encryptedKey, walletAddress } = await privateKeyService.storePrivateKey(
      privateKey, 
      requestedUserId, 
      context
    );
    
    // Update profile with wallet data
    const now = new Date().toISOString();
    const updates = {
      encryptedPrivateKey: encryptedKey,
      walletAddress,
      keyCreatedAt: now,
      keyLastAccessed: now,
      updatedAt: now
    };
    
    await updateItem({
      Key: { userId: requestedUserId },
      UpdateExpression: 'SET encryptedPrivateKey = :encKey, walletAddress = :addr, keyCreatedAt = :created, keyLastAccessed = :accessed, updatedAt = :updated',
      ExpressionAttributeValues: {
        ':encKey': encryptedKey,
        ':addr': walletAddress,
        ':created': now,
        ':accessed': now,
        ':updated': now
      }
    });
    
    res.status(201).json({
      success: true,
      walletAddress,
      message: 'Wallet stored successfully'
    });
    
  } catch (err) {
    next(err);
  }
});

/** POST /profile/:userId/wallet/generate - Generate and store new wallet */
router.post('/:userId/wallet/generate', async (req, res, next) => {
  try {
    const context = createSecurityContext(req);
    const userIdFromToken = getUserIdFromRequest(req);
    const requestedUserId = req.params.userId;
    
    // Verify ownership
    if (userIdFromToken !== requestedUserId) {
      await auditLogger.logSecurityViolation(req, 'unauthorized_wallet_generation', {
        requestedUserId,
        actualUserId: userIdFromToken
      });
      return res.status(403).json({ 
        error: 'forbidden',
        message: 'You can only generate wallet keys for your own profile' 
      });
    }
    
    // Check if user already has a wallet
    const { Item: existingProfile } = await getItem(requestedUserId);
    if (existingProfile?.encryptedPrivateKey) {
      await auditLogger.logSecurityViolation(req, 'wallet_already_exists', {
        userId: userIdFromToken
      });
      return res.status(409).json({
        error: 'wallet_exists',
        message: 'Wallet already exists for this profile'
      });
    }
    
    // Generate new wallet
    const walletData = await privateKeyService.generateNewWallet(requestedUserId, context);
    
    // Update profile with wallet data
    const now = new Date().toISOString();
    await updateItem({
      Key: { userId: requestedUserId },
      UpdateExpression: 'SET encryptedPrivateKey = :encKey, walletAddress = :addr, keyCreatedAt = :created, keyLastAccessed = :accessed, updatedAt = :updated',
      ExpressionAttributeValues: {
        ':encKey': walletData.encryptedKey,
        ':addr': walletData.address,
        ':created': now,
        ':accessed': now,
        ':updated': now
      }
    });
    
    res.status(201).json({
      success: true,
      walletAddress: walletData.address,
      privateKey: walletData.privateKey, // Only returned once during generation
      message: 'Wallet generated successfully'
    });
    
  } catch (err) {
    next(err);
  }
});

/** GET /profile/:userId/wallet/address - Get wallet address */
router.get('/:userId/wallet/address', async (req, res, next) => {
  try {
    const userIdFromToken = getUserIdFromRequest(req);
    const requestedUserId = req.params.userId;
    
    // Verify ownership or admin access
    const isOwnProfile = userIdFromToken === requestedUserId;
    const isAdmin = (req as any).user?.roles?.includes('admin');
    
    if (!isOwnProfile && !isAdmin) {
      await auditLogger.logSecurityViolation(req, 'unauthorized_wallet_address_access', {
        requestedUserId,
        actualUserId: userIdFromToken
      });
      return res.status(403).json({ 
        error: 'forbidden',
        message: 'You can only access your own wallet address' 
      });
    }
    
    const { Item } = await getItem(requestedUserId);
    if (!Item || !Item.walletAddress) {
      return res.status(404).json({
        error: 'wallet_not_found',
        message: 'No wallet found for this profile'
      });
    }
    
    res.json({
      walletAddress: Item.walletAddress,
      keyCreatedAt: Item.keyCreatedAt
    });
    
  } catch (err) {
    next(err);
  }
});

/** POST /profile/:userId/wallet/decrypt - Decrypt and return private key (high security) */
router.post('/:userId/wallet/decrypt', async (req, res, next) => {
  try {
    const context = createSecurityContext(req);
    const userIdFromToken = getUserIdFromRequest(req);
    const requestedUserId = req.params.userId;
    
    // Verify ownership (admin access not allowed for private key decryption)
    if (userIdFromToken !== requestedUserId) {
      await auditLogger.logSecurityViolation(req, 'unauthorized_private_key_access', {
        requestedUserId,
        actualUserId: userIdFromToken
      });
      return res.status(403).json({ 
        error: 'forbidden',
        message: 'You can only decrypt your own private key' 
      });
    }
    
    const { Item } = await getItem(requestedUserId);
    if (!Item || !Item.encryptedPrivateKey || !Item.walletAddress) {
      return res.status(404).json({
        error: 'wallet_not_found',
        message: 'No encrypted wallet found for this profile'
      });
    }
    
    // Decrypt the private key
    const privateKey = await privateKeyService.retrievePrivateKey(
      Item.encryptedPrivateKey,
      requestedUserId,
      Item.walletAddress,
      context
    );
    
    // Update last accessed timestamp
    const now = new Date().toISOString();
    await updateItem({
      Key: { userId: requestedUserId },
      UpdateExpression: 'SET keyLastAccessed = :accessed, updatedAt = :updated',
      ExpressionAttributeValues: {
        ':accessed': now,
        ':updated': now
      }
    });
    
    res.json({
      privateKey,
      walletAddress: Item.walletAddress,
      keyCreatedAt: Item.keyCreatedAt,
      warning: 'This private key should be handled securely and never logged or stored'
    });
    
  } catch (err) {
    next(err);
  }
});

/** DELETE /profile/:userId/wallet - Delete stored wallet */
router.delete('/:userId/wallet', async (req, res, next) => {
  try {
    const context = createSecurityContext(req);
    const userIdFromToken = getUserIdFromRequest(req);
    const requestedUserId = req.params.userId;
    
    // Verify ownership
    if (userIdFromToken !== requestedUserId) {
      await auditLogger.logSecurityViolation(req, 'unauthorized_wallet_deletion', {
        requestedUserId,
        actualUserId: userIdFromToken
      });
      return res.status(403).json({ 
        error: 'forbidden',
        message: 'You can only delete your own wallet' 
      });
    }
    
    const { Item } = await getItem(requestedUserId);
    if (!Item || !Item.walletAddress) {
      return res.status(404).json({
        error: 'wallet_not_found',
        message: 'No wallet found for this profile'
      });
    }
    
    // Log the deletion
    await privateKeyService.deletePrivateKey(requestedUserId, Item.walletAddress, context);
    
    // Remove wallet data from profile
    await updateItem({
      Key: { userId: requestedUserId },
      UpdateExpression: 'REMOVE encryptedPrivateKey, walletAddress, keyCreatedAt, keyLastAccessed SET updatedAt = :updated',
      ExpressionAttributeValues: {
        ':updated': new Date().toISOString()
      }
    });
    
    res.json({
      success: true,
      message: 'Wallet deleted successfully'
    });
    
  } catch (err) {
    next(err);
  }
});

/** GET /profile/:userId/gdpr/export - Export all user data (GDPR compliance) */
router.get('/:userId/gdpr/export', async (req, res, next) => {
  try {
    const context = createSecurityContext(req);
    const userIdFromToken = getUserIdFromRequest(req);
    const requestedUserId = req.params.userId;
    
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
    
    const { Item } = await getItem(requestedUserId);
    if (!Item) {
      return res.status(404).json({
        error: 'profile_not_found',
        message: 'Profile not found'
      });
    }
    
    // Create comprehensive export (excluding actual private key)
    const exportData = {
      profile: {
        userId: Item.userId,
        email: Item.email,
        name: Item.name,
        initial_language_to_learn: Item.initial_language_to_learn,
        createdAt: Item.createdAt,
        updatedAt: Item.updatedAt
      },
      wallet: Item.walletAddress ? {
        walletAddress: Item.walletAddress,
        keyCreatedAt: Item.keyCreatedAt,
        keyLastAccessed: Item.keyLastAccessed,
        hasEncryptedPrivateKey: !!Item.encryptedPrivateKey
      } : null,
      export: {
        exportedAt: new Date().toISOString(),
        exportedBy: userIdFromToken,
        dataTypes: ['profile', 'wallet_metadata']
      }
    };
    
    // Log GDPR export
    await auditLogger.logGdprEvent(req, requestedUserId, 'export', true);
    
    res.json(exportData);
    
  } catch (err) {
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
    
    const { Item } = await getItem(requestedUserId);
    if (!Item) {
      await auditLogger.logGdprEvent(req, requestedUserId, 'delete', false);
      return res.status(404).json({
        error: 'profile_not_found',
        message: 'Profile not found'
      });
    }
    
    // Log wallet deletion if exists
    if (Item.walletAddress) {
      await privateKeyService.deletePrivateKey(requestedUserId, Item.walletAddress, context);
    }
    
    // Delete the entire profile
    await ProfileModel.deleteOne({ userId: requestedUserId });
    
    // Log GDPR deletion
    await auditLogger.logGdprEvent(req, requestedUserId, 'delete', true);
    
    res.json({
      success: true,
      message: 'All user data deleted successfully',
      deletedAt: new Date().toISOString()
    });
    
  } catch (err) {
    await auditLogger.logGdprEvent(req, req.params.userId, 'delete', false);
    next(err);
  }
});

export default router;
