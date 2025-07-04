import express from 'express';
require('dotenv').config();
import authRoutes from './routes/auth-working';

// Ensure required environment variables exist
if (!process.env.APP_JWT_SECRET) {
  console.error('APP_JWT_SECRET environment variable is required');
  process.exit(1);
}

// Create Express app
const app = express();
export { app }; // Export for testing
const PORT = parseInt(process.env.PORT || '8080');

// Basic middleware
app.use(express.json({ limit: '10mb' })); // Limit request size for security

// Enhanced CORS with security considerations
app.use((req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
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

// Apply routes with basic middleware
app.use('/auth', authRoutes);

// Simple health check endpoint
app.get('/healthz', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'auth-service',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    features: [
      'simplified_waitlist_signup',
      'simplified_wallet_signup',
      'no_authentication_required_for_signups'
    ]
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
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
