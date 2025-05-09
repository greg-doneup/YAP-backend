import express from 'express';
import profileRoutes from '../routes/profile';

// Simple controller that forwards requests to the profile routes
const router = express.Router();
router.use('/', profileRoutes);

export const profileController = router;