import express from 'express';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';

// Load environment variables
dotenv.config();

// Ensure required environment variables exist
if (!process.env.APP_JWT_SECRET) {
  console.error('APP_JWT_SECRET environment variable is required');
  process.exit(1);
}

// Create Express app
const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Routes
app.use('/auth', authRoutes);

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service' });
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
