import { Router } from 'express';

/**
 * Health check routes for the reward-service.
 * Used by Kubernetes probes to confirm service health.
 */
const router = Router();

/**
 * @route   GET /health
 * @desc    Basic health check endpoint
 * @access  Public
 */
router.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'reward-service',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   GET /health/readiness
 * @desc    Readiness probe - checks if the service is ready to accept requests
 * @access  Public
 */
router.get('/readiness', (_req, res) => {
  // Add any additional readiness checks here (e.g., database connectivity)
  res.status(200).json({
    status: 'ready',
    service: 'reward-service',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   GET /health/liveness
 * @desc    Liveness probe - checks if the service is running properly
 * @access  Public
 */
router.get('/liveness', (_req, res) => {
  // Add any additional liveness checks here
  res.status(200).json({
    status: 'alive',
    service: 'reward-service',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

export default router;