import express from 'express';

const router = express.Router();

router.get('/', (_, res) => {
  res.json({ 
    status: 'ok', 
    service: 'offchain-profile',
    timestamp: new Date().toISOString()
  });
});

export default router;
