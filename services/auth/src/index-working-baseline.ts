import express from 'express';
require('dotenv').config();
import authRoutes from './routes/auth';
import { securityMiddleware } from './middleware/security';

// Ensure required environment variables exist
if (!process.env.APP_JWT_SECRET) {
  console.error('APP_JWT_SECRET environment variable is required');
  process.exit(1);
}

// Create Express app
const app = express();
export { app }; // Export for testing
const PORT = process.env.PORT || 8080;

// Add security middleware instance to app locals for access in routes
app.locals.securityMiddleware = securityMiddleware;

// Security middleware (should be applied first)
app.use(securityMiddleware.securityHeaders());

// Basic middleware
app.use(express.json({ limit: '10mb' })); // Limit request size for security

// Enhanced CORS with security considerations
app.use((req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:8100', 
    'http://localhost:3000', 
    'http://localhost:4200'
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

// Apply security middleware to routes - EXCEPT for waitlist endpoints
app.use('/auth', (req, res, next) => {
  console.log(`Auth request: ${req.method} ${req.path}`);
  
  // Skip security middleware for waitlist endpoints
  if (req.path === '/simple' || req.path.startsWith('/waitlist/')) {
    console.log('Skipping authentication for waitlist endpoint');
    return next();
  }
  
  // Apply security middleware for all other auth endpoints
  securityMiddleware.rateLimit(50, 15)(req, res, () => {
    securityMiddleware.trackFailedAuth()(req, res, () => {
      securityMiddleware.validateInput()(req, res, next);
    });
  });
}, authRoutes);

// Security monitoring endpoint
app.get('/auth/security/metrics', async (req, res) => {
  try {
    const metrics = await securityMiddleware.getSecurityMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get security metrics' });
  }
});

// Enhanced health check endpoint
app.get('/healthz', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'auth-service',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    security_features: [
      'rate_limiting',
      'failed_auth_tracking',
      'input_validation',
      'security_headers',
      'audit_logging'
    ]
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err);
  res.status(err.statusCode || 500).json({ message: err.message || 'Internal Server Error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`);
});
