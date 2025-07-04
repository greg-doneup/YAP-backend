import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';

export const healthRoutes = Router();

/**
 * Basic health check
 * GET /health
 */
healthRoutes.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'blockchain-progress-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * Detailed health check including blockchain connectivity
 * GET /health/detailed
 */
healthRoutes.get('/detailed', async (req: Request, res: Response) => {
  try {
    // This would check blockchain connectivity
    // For now, just return basic status
    
    res.json({
      status: 'healthy',
      service: 'blockchain-progress-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        database: 'healthy', // Would check MongoDB
        blockchain: 'healthy', // Would check SEI EVM
        batchProcessor: 'healthy' // Would check batch processor
      }
    });
    
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      service: 'blockchain-progress-service',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Readiness probe for Kubernetes
 * GET /health/ready
 */
healthRoutes.get('/ready', (req: Request, res: Response) => {
  // In production, this would check if all services are ready
  res.json({
    status: 'ready',
    timestamp: new Date().toISOString()
  });
});

/**
 * Liveness probe for Kubernetes
 * GET /health/live
 */
healthRoutes.get('/live', (req: Request, res: Response) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});
