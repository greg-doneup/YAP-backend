import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

// Basic health check
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'profile-service'
  });
});

// Detailed health check with database connectivity
router.get('/detailed', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState;
    const dbStatusMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    // Test database query
    let dbQueryStatus = 'unknown';
    try {
      if (mongoose.connection.db) {
        await mongoose.connection.db.admin().ping();
        dbQueryStatus = 'success';
      } else {
        dbQueryStatus = 'no_db_connection';
      }
    } catch (error) {
      dbQueryStatus = 'failed';
    }

    const healthStatus = {
      status: dbStatus === 1 && dbQueryStatus === 'success' ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'profile-service',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      database: {
        status: dbStatusMap[dbStatus as keyof typeof dbStatusMap],
        connected: dbStatus === 1,
        queryTest: dbQueryStatus
      },
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };

    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthStatus);

  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'profile-service',
      error: 'Health check failed'
    });
  }
});

export { router as healthRoutes };
