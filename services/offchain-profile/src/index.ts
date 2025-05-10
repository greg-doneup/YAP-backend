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

// Temporarily commenting out CORS and Morgan middleware
// app.use(cors());
// app.use(morgan('dev'));

// Setting up basic CORS manually to avoid the dependency issue
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use("/profile", requireAuth(SECRET), profileRoutes);
app.use("/points",  requireAuth(SECRET), pointsRoutes);
app.use("/healthz", health);

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
