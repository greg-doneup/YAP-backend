import express from 'express';
import { ProfileModel } from '../mon/mongo';
import { SecurityValidator } from '../utils/securityValidator';
import { AuditLogger, SecurityEventType } from '../utils/auditLogger';
import crypto from 'crypto';

const router = express.Router();
const auditLogger = new AuditLogger();

/**
 * POST /waitlist/simple
 * Simple waitlist signup without wallet creation
 */
router.post('/simple', async (req, res, next) => {
  try {
    const { name, email, language_to_learn, acceptTerms } = req.body;
    
    // Validation
    if (!name || !email || !language_to_learn || !acceptTerms) {
      return res.status(400).json({
        success: false,
        error: 'missing_fields',
        message: 'Name, email, language preference, and terms acceptance are required'
      });
    }

    // Sanitize inputs
    const sanitizedEmail = SecurityValidator.sanitizeInput(email);
    const sanitizedName = SecurityValidator.sanitizeInput(name);
    const sanitizedLanguage = SecurityValidator.sanitizeInput(language_to_learn);

    // Check if already exists
    const existingProfile = await ProfileModel.findOne({ email: sanitizedEmail });
    if (existingProfile) {
      return res.status(409).json({
        success: false,
        error: 'email_exists',
        message: 'Email already registered'
      });
    }

    // Create waitlist entry
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

    await ProfileModel.create(waitlistEntry);

    // Log successful waitlist signup
    await auditLogger.logSecurityEvent(
      SecurityEventType.PROFILE_CREATE,
      'waitlist_simple_signup',
      `profile:${userId}`,
      req,
      true,
      { email: sanitizedEmail, type: 'simple' }
    );

    res.json({
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

  } catch (err) {
    console.error('Simple waitlist signup error:', err);
    next(err);
  }
});

/**
 * POST /waitlist/secure-wallet
 * Secure wallet creation with waitlist signup
 */
router.post('/secure-wallet', async (req, res, next) => {
  try {
    const { 
      name, 
      email, 
      username,
      language_to_learn, 
      passphrase,
      acceptTerms 
    } = req.body;

    // Validation
    if (!name || !email || !username || !language_to_learn || !passphrase || !acceptTerms) {
      return res.status(400).json({
        success: false,
        error: 'missing_fields',
        message: 'All fields are required for secure wallet creation'
      });
    }

    if (passphrase.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'weak_passphrase',
        message: 'Passphrase must be at least 8 characters long'
      });
    }

    // Sanitize inputs
    const sanitizedEmail = SecurityValidator.sanitizeInput(email);
    const sanitizedName = SecurityValidator.sanitizeInput(name);
    const sanitizedUsername = SecurityValidator.sanitizeInput(username);
    const sanitizedLanguage = SecurityValidator.sanitizeInput(language_to_learn);

    // Check if already exists
    const existingProfile = await ProfileModel.findOne({ email: sanitizedEmail });
    if (existingProfile) {
      return res.status(409).json({
        success: false,
        error: 'email_exists',
        message: 'Email already registered'
      });
    }

    // This endpoint creates a waitlist entry but doesn't actually create wallet
    // The wallet creation happens later via the auth service conversion flow
    const userId = crypto.randomBytes(32).toString('hex');
    const waitlistEntry = {
      userId,
      email: sanitizedEmail,
      name: sanitizedName,
      initial_language_to_learn: sanitizedLanguage,
      isWaitlistUser: true,
      wlw: false, // Will be set to true when wallet is created
      converted: false,
      waitlist_signup_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Store that this user wants secure wallet (for later conversion)
      requestedSecureWallet: true,
      username: sanitizedUsername
    };

    await ProfileModel.create(waitlistEntry);

    // Log successful secure waitlist signup
    await auditLogger.logSecurityEvent(
      SecurityEventType.PROFILE_CREATE,
      'waitlist_secure_signup',
      `profile:${userId}`,
      req,
      true,
      { email: sanitizedEmail, type: 'secure_wallet', username: sanitizedUsername }
    );

    res.json({
      success: true,
      message: 'Successfully joined the secure waitlist! You will be able to create your wallet when access is granted.',
      data: {
        userId,
        name: sanitizedName,
        email: sanitizedEmail,
        username: sanitizedUsername,
        language_to_learn: sanitizedLanguage,
        joinedAt: waitlistEntry.waitlist_signup_at,
        hasWallet: false,
        type: 'secure_wallet'
      }
    });

  } catch (err) {
    console.error('Secure waitlist signup error:', err);
    next(err);
  }
});

export default router;
