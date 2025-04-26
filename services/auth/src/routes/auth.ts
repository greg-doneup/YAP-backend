import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { initEmail, verifyEmail, createEmbeddedWallet } from '../utils/dynamic';

const APP_JWT_SECRET = process.env.APP_JWT_SECRET!;
const router = Router();

/**
 * POST /auth/login   { email }
 * Returns { challengeId }
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'email required' });

    const { challengeId } = await initEmail(email);
    res.json({ challengeId });
  } catch (err) { next(err); }
});

/**
 * POST /auth/verify  { challengeId, otp }
 * Returns { token, walletAddress }
 */
router.post('/verify', async (req, res, next) => {
  try {
    const { challengeId, otp } = req.body;
    if (!challengeId || !otp)
      return res.status(400).json({ message: 'challengeId and otp required' });

    // 1. Verify OTP with Dynamic
    const { user } = await verifyEmail(challengeId, otp);

    // 2. Create or fetch wallet
    const { wallet } = await createEmbeddedWallet(user.id);

    // 3. Issue app-specific JWT
    const token = jwt.sign({ walletAddress: wallet.address, userId: user.id },
                           APP_JWT_SECRET,
                           { expiresIn: '7d' });

    res.json({ token, walletAddress: wallet.address });
  } catch (err) { next(err); }
});

export default router;
