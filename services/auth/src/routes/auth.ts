import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { verifyWeb3AuthIdToken } from '../utils/web3auth';

const router = Router();
const APP_JWT_SECRET = process.env.APP_JWT_SECRET as string;

router.post('/callback', async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: 'idToken required' });

    // 1. Validate Web3Auth token
    const { sub: walletAddress } = await verifyWeb3AuthIdToken(idToken);

    // 2. Mint app-side JWT
    const appToken = jwt.sign({ walletAddress }, APP_JWT_SECRET, {
      expiresIn: '7d',
    });

    res.json({ token: appToken, walletAddress });
  } catch (err) {
    next(err);
  }
});

export default router;
