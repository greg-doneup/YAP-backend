import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import profileRoutes from './routes/profile';
import { healthRoutes } from './routes/health';

const app = express();
const PORT = process.env.PORT || 8080;

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'https://delta-sandbox-7k3m.goyap.ai',
  'https://app.goyap.ai',
  'https://goyap.ai',
  'http://localhost:8100'
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Internal-Service']
}));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/health', healthRoutes);
app.use('/profile', profileRoutes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'internal_server_error',
    message: 'An internal server error occurred'
  });
});

// Connect to MongoDB and start server
async function startServer() {
  try {
    // MongoDB connection
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/yap-dev';
    const dbName = process.env.MONGO_DB_NAME || 'yap';
    
    console.log('🔄 Connecting to MongoDB...');
    console.log('📍 Database:', dbName);
    
    if (process.env.MONGO_URI) {
      console.log('🌐 Using MongoDB Atlas connection from MONGO_URI environment variable');
      console.log('🔗 URI:', process.env.MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')); // Hide credentials in logs
    } else {
      console.log('⚠️  MONGO_URI not set, falling back to local MongoDB instance');
      console.log('🔗 URI:', mongoUri);
    }
    
    await mongoose.connect(mongoUri, {
      dbName,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      bufferCommands: false
    });
    
    console.log('✅ MongoDB connected successfully');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Profile service running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

startServer();

export default app;
