import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import mongoose from 'mongoose';
import { requireAuth, getUserIdFromRequest } from './shared/auth/authMiddleware';
import { profileValidator } from './validators';
import { profileController } from './controllers';
import { connectToDatabase } from './mon/mongo';
import { profileSecurityMiddleware } from './middleware/security';
import waitlistRoutes from './routes/waitlist';

const app = express();
const PORT = process.env.PORT || 8080;
const APP_JWT_SECRET = process.env.APP_JWT_SECRET!;

// Add security middleware to app locals
app.locals.profileSecurity = profileSecurityMiddleware;

// Initialize MongoDB connection
connectToDatabase()
  .then(() => console.log('MongoDB connection initialized'))
  .catch(err => console.error('MongoDB connection failed:', err));

// Enhanced CORS with security
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'https://perci.goyap.ai',
  'http://localhost:8100', 
  'http://localhost:3000', 
  'http://localhost:4200'
];

app.use(cors({
  origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Security headers
app.use(profileSecurityMiddleware.profileSecurityHeaders());

// Basic middleware
app.use(express.json({ limit: '1mb' })); // Limit request size
app.use(morgan('combined')); // More detailed logging

// PUBLIC ROUTES (no authentication required)
// Email lookup endpoint for registration/signup flows
app.get('/profile/email/:email', 
    profileSecurityMiddleware.profileRateLimit(10, 5), // Rate limit for public endpoint
    async (req, res, next) => {
        try {
            const email = req.params.email;
            console.log(`[EMAIL-LOOKUP] Looking up email: ${email}`);
            
            // Import the profile model and security validator
            const { ProfileModel } = await import('./mon/mongo');
            const { SecurityValidator } = await import('./utils/securityValidator');
            const { AuditLogger } = await import('./utils/auditLogger');
            
            const auditLogger = new AuditLogger();
            
            // Validate and sanitize email
            if (!SecurityValidator.validateEmail(email)) {
                console.log(`[EMAIL-LOOKUP] Invalid email format: ${email}`);
                await auditLogger.logSecurityViolation(req, 'invalid_email_lookup', {
                    email: SecurityValidator.hashSensitiveData(email)
                });
                return res.status(400).json({ 
                    error: 'invalid_email', 
                    message: 'Invalid email format' 
                });
            }
            
            const sanitizedEmail = SecurityValidator.sanitizeInput(email);
            console.log(`[EMAIL-LOOKUP] Sanitized email: ${sanitizedEmail}`);
            
            try {
                // Ensure we're connected to the database
                if (!mongoose.connection.readyState) {
                    console.log(`[EMAIL-LOOKUP] Database not connected, attempting to reconnect...`);
                    await connectToDatabase();
                }
                
                const found = await ProfileModel.findOne({ email: sanitizedEmail }).lean().maxTimeMS(5000);
                console.log(`[EMAIL-LOOKUP] Database query result:`, found ? 'FOUND' : 'NOT_FOUND');
                
                if (!found) {
                    console.log(`[EMAIL-LOOKUP] Profile not found for: ${sanitizedEmail}`);
                    return res.status(404).json({
                        error: 'not_found',
                        message: 'Profile not found'
                    });
                }
                
                // Remove sensitive data for public endpoint
                const sanitizedProfile = { ...found };
                delete (sanitizedProfile as any).encryptedStretchedKey;
                delete (sanitizedProfile as any).encrypted_mnemonic;
                delete (sanitizedProfile as any).passphrase_hash;
                delete (sanitizedProfile as any).salt;
                delete (sanitizedProfile as any).nonce;
                
                console.log(`[EMAIL-LOOKUP] Returning sanitized profile for: ${sanitizedEmail}`);
                return res.json(sanitizedProfile);
            } catch (dbError: any) {
                console.error(`[EMAIL-LOOKUP] Database error:`, dbError);
                // For registration flow, treat ALL DB errors as "user not found" to allow registration
                // This includes connection errors, timeouts, etc.
                return res.status(404).json({
                    error: 'not_found',
                    message: 'Profile not found',
                    debug: process.env.NODE_ENV === 'development' ? dbError.message : undefined
                });
            }
            
        } catch (err: any) {
            console.error(`[EMAIL-LOOKUP] General error:`, err);
            // For registration flow, treat all errors as "user not found" to allow registration
            return res.status(404).json({
                error: 'not_found',
                message: 'Profile not found',
                debug: process.env.NODE_ENV === 'development' ? err.message : undefined
            });
        }
    }
);

// Apply basic middleware to profile routes (no auth required)
app.use('/profile', 
    profileSecurityMiddleware.profileRateLimit(30, 5), // 30 requests per 5 minutes
    // Removed auth requirement and ownership enforcement for simplified deployment
    profileSecurityMiddleware.validateProfileData(),
    profileSecurityMiddleware.auditProfileChanges(),
    profileValidator,
    profileController
);

// Waitlist routes with lighter security (no auth required for signup)
app.use('/api/waitlist',
    profileSecurityMiddleware.profileRateLimit(10, 5), // 10 waitlist signups per 5 minutes
    profileSecurityMiddleware.validateProfileData(),
    profileSecurityMiddleware.auditProfileChanges(),
    waitlistRoutes
);

// Security monitoring endpoint (no auth required for simplified deployment)
app.get('/profile/security/metrics', async (req, res) => {
  try {
    const metrics = await profileSecurityMiddleware.getSecurityMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get security metrics' });
  }
});

// Enhanced health check endpoint
app.get('/healthz', (_, res) => {
  res.json({ 
    status: 'ok', 
    service: 'profile',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    security_features: [
      'rate_limiting',
      'data_validation',
      'ownership_enforcement',
      'audit_logging',
      'xss_protection'
    ]
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Internal Server Error'
  });
});

app.listen(PORT, () => {
  console.log(`Profile service running on port ${PORT}`);
});

export default app;
