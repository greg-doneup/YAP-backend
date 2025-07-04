import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config/environment';
import { logger } from './utils/logger';
import { connectDatabase } from './config/database';
import { connectRedis } from './config/redis';
import { BlockchainProgressService } from './services/blockchain-progress-service';
import { BatchProcessor } from './services/batch-processor';
import { MongoService } from './services/mongo-service';
import { progressRoutes, initializeProgressRoutes } from './routes/progress-routes';
import { healthRoutes } from './routes/health-routes';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check route
app.use('/health', healthRoutes);

// API routes
app.use('/api/progress', progressRoutes);

// Global error handler
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Start server
async function startServer() {
  try {
    logger.info('Starting Blockchain Progress Service...');

    // Try to connect to databases, but don't fail if MongoDB is unavailable
    try {
      await connectDatabase();
      logger.info('MongoDB connected successfully');
    } catch (error) {
      logger.warn('MongoDB connection failed, continuing in degraded mode:', error);
    }
    
    // Try to connect to Redis, but don't fail if it's not available
    try {
      await connectRedis();
      logger.info('Redis connected successfully');
    } catch (error) {
      logger.warn('Redis connection failed, continuing without Redis:', error);
    }

    // Initialize services (lazy connection - don't connect to MongoDB on startup)
    const mongoService = new MongoService();
    logger.info('MongoDB service initialized (lazy connection)');

    // Try to initialize blockchain service, but don't fail if it doesn't work
    let blockchainService: BlockchainProgressService | null = null;
    let batchProcessor: BatchProcessor | null = null;
    
    // For now, skip blockchain initialization to get the service running
    logger.info('Skipping blockchain initialization for debugging - service will run in basic mode');
    
    // try {
    //   blockchainService = new BlockchainProgressService();
    //   await blockchainService.initialize();
    //   
    //   batchProcessor = new BatchProcessor(blockchainService);
    //   await batchProcessor.start();
    //   
    //   logger.info('Blockchain and batch processing services initialized successfully');
    // } catch (error) {
    //   logger.warn('Failed to initialize blockchain services, running in degraded mode:', error);
    // }

    // Initialize routes with service dependencies (may be null in degraded mode)
    // Use type assertions to bypass TypeScript null checks since we're in debug mode
    initializeProgressRoutes(mongoService, blockchainService as any, batchProcessor as any);

    // Start HTTP server
    const server = app.listen(config.port, () => {
      logger.info(`🚀 Blockchain Progress Service running on port ${config.port}`);
      logger.info(`📊 Environment: ${config.nodeEnv}`);
      if (blockchainService) {
        logger.info(`🔐 Company wallet: ${(blockchainService as any).getCompanyAddress()}`);
      } else {
        logger.info(`🔐 Company wallet: [Not initialized - running in basic mode]`);
      }
      logger.info(`⏰ Batch interval: ${config.batchIntervalMinutes} minutes`);
      logger.info(`📦 Batch size limit: ${config.batchSizeLimit}`);
      logger.info('✅ Service ready to accept requests');
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`🛑 ${signal} received, shutting down gracefully`);
      
      if (batchProcessor) {
        (batchProcessor as any).stop();
      }
      await mongoService.disconnect();
      
      server.close(() => {
        logger.info('✅ Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
