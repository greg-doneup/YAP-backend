import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
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

// Apply enhanced security to profile routes
app.use('/profile', 
    profileSecurityMiddleware.profileRateLimit(30, 5), // 30 requests per 5 minutes
    requireAuth(APP_JWT_SECRET),
    profileSecurityMiddleware.enforceProfileOwnership(),
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

// Security monitoring endpoint
app.get('/profile/security/metrics', requireAuth(APP_JWT_SECRET), async (req, res) => {
  try {
    // Only allow admin access to security metrics
    const user = (req as any).user;
    if (!user?.roles?.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
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
