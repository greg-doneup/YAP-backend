import express from "express";
// Temporarily removing cors and morgan imports due to TypeScript errors
// import cors from "cors";
// import morgan from "morgan";
import profileRoutes from "./routes/profile";
import pointsRoutes from "./routes/points";
import dotenv from "dotenv";
import health from "./routes/health";
import jwt from "jsonwebtoken";
import { connectToDatabase } from "./mon/mongo";
import { OffchainProfileSecurityMiddleware } from "./middleware/security";

// Implement proper JWT verification middleware instead of the stub
const requireAuth = (secret: string) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'unauthorized', message: 'Missing authorization token' });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, secret) as {
        walletAddress: string;
        ethWalletAddress?: string;
        sub: string;
        type: string;
      };
      
      // Make sure it's an access token, not a refresh token
      if (decoded.type !== 'access') {
        return res.status(401).json({ error: 'unauthorized', message: 'Invalid token type' });
      }
      
      // Add decoded user data to the request object for use in routes
      (req as any).user = decoded;
      next();
    } catch (error) {
      console.error('Token verification failed:', error);
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token' });
    }
  };
};

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectToDatabase()
  .then(() => console.log('MongoDB connection initialized'))
  .catch(err => console.error('MongoDB connection failed:', err));

const app = express();
const PORT = process.env.PORT || 8080;
const SECRET = process.env.APP_JWT_SECRET!;

// Initialize security middleware
const securityMiddleware = new OffchainProfileSecurityMiddleware();

// Temporarily commenting out CORS and Morgan middleware
// app.use(cors());
// app.use(morgan('dev'));

// Enhanced CORS configuration with allowlist
const allowedOrigins = [
  'http://localhost:4200',
  'http://localhost:3000',
  'https://yap-frontend.vercel.app',
  'https://yap.co'
];

app.use((req, res, next) => {
  const origin = req.headers.origin as string;
  
  if (!origin || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Apply security headers
app.use(securityMiddleware.offchainSecurityHeaders());

// Basic middleware
app.use(express.json({ limit: '1mb' })); // Limit request size

// Apply security to profile routes
app.use("/profile", 
  securityMiddleware.offchainRateLimit(40, 5), // 40 requests per 5 minutes
  requireAuth(SECRET),
  securityMiddleware.enforceOffchainOwnership(),
  securityMiddleware.validateOffchainData(),
  securityMiddleware.auditOffchainChanges(),
  profileRoutes
);

// Apply security to points routes
app.use("/points",  
  securityMiddleware.offchainRateLimit(20, 5), // 20 requests per 5 minutes for points
  requireAuth(SECRET),
  securityMiddleware.validateOffchainData(),
  securityMiddleware.auditOffchainChanges(),
  pointsRoutes
);

app.use("/healthz", health);

// Security monitoring endpoint
app.get('/offchain/security/metrics', requireAuth(SECRET), async (req, res) => {
  try {
    // Only allow admin access to security metrics
    const user = (req as any).user;
    if (!user?.roles?.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const metrics = await securityMiddleware.getSecurityMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get security metrics' });
  }
});

// Enhanced health check endpoint
app.get('/healthz', (_, res) => {
  res.json({ 
    status: 'ok', 
    service: 'offchain-profile',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    security_features: [
      'rate_limiting',
      'data_validation',
      'ownership_enforcement',
      'audit_logging',
      'xss_protection',
      'enhanced_cors'
    ]
  });
});

// Global error handler to provide consistent error responses
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Basic logging without morgan
  console.error(`${new Date().toISOString()} - Error:`, err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Internal Server Error'
  });
});

app.listen(PORT, () => console.log("offchain-profile on :" + PORT));
