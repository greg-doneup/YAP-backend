import request from 'supertest';
import nock from 'nock';
import jwt from 'jsonwebtoken';
import express from 'express';
import authRouter from '../../src/routes/auth';

// Mock base URL for Dynamic API
const DYNAMIC_BASE = process.env.DYNAMIC_BASE || 'https://api.test-dynamic.xyz/api/v0';
const DYNAMIC_ENV_ID = process.env.DYNAMIC_ENV_ID || 'test-env-id';
const JWT_SECRET = process.env.APP_JWT_SECRET || 'test-jwt-secret';

// Create an Express instance for testing
const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  
  // Add error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ message: 'internal error' });
  });
  
  return app;
};

describe('Wallet Creation Flow', () => {
  let app: express.Application;
  
  beforeEach(() => {
    app = createApp();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('POST /auth/login', () => {
    it('should initiate login process and return challengeId', async () => {
      // Mock Dynamic API response for initiating email login
      nock(`${DYNAMIC_BASE}/sdk/${DYNAMIC_ENV_ID}`)
        .post('/users/email/init', { email: 'user@example.com' })
        .reply(200, {
          challengeId: 'test-challenge-456'
        });

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'user@example.com' })
        .expect(200);
      
      expect(res.body).toHaveProperty('challengeId');
      expect(res.body.challengeId).toBe('test-challenge-456');
    });

    it('should return 400 error if email is missing', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({})
        .expect(400);
      
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toBe('email required');
    });

    it('should handle API errors during login initiation', async () => {
      nock(`${DYNAMIC_BASE}/sdk/${DYNAMIC_ENV_ID}`)
        .post('/users/email/init')
        .replyWithError('Service unavailable');

      await request(app)
        .post('/auth/login')
        .send({ email: 'user@example.com' })
        .expect(500);
    });
  });

  describe('POST /auth/verify', () => {
    it('should verify OTP, create wallet, and return JWT with wallet address', async () => {
      const challengeId = 'test-challenge-456';
      const otp = '123456';
      const userId = 'dynamic-user-123';
      const walletAddress = 'sei1a2b3c4d5e6f7g8h9i0j';
      
      // Mock Dynamic API for OTP verification
      nock(`${DYNAMIC_BASE}/sdk/${DYNAMIC_ENV_ID}`)
        .post('/users/email/verify', { challengeId, otp })
        .reply(200, {
          jwt: 'dynamic-jwt-token',
          user: { id: userId }
        });
      
      // Mock Dynamic API for wallet creation
      nock(`${DYNAMIC_BASE}/sdk/${DYNAMIC_ENV_ID}`)
        .post(`/users/${userId}/embeddedWallets`, { chain: 'sei' })
        .reply(200, {
          wallet: { address: walletAddress }
        });

      const res = await request(app)
        .post('/auth/verify')
        .send({ challengeId, otp })
        .expect(200);
      
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('walletAddress');
      expect(res.body.walletAddress).toBe(walletAddress);
      
      // Verify the JWT contains the correct payload
      const decodedToken: any = jwt.verify(res.body.token, JWT_SECRET);
      expect(decodedToken).toHaveProperty('walletAddress');
      expect(decodedToken).toHaveProperty('userId');
      expect(decodedToken.walletAddress).toBe(walletAddress);
      expect(decodedToken.userId).toBe(userId);
    });

    it('should return 400 error if challengeId or OTP is missing', async () => {
      const res = await request(app)
        .post('/auth/verify')
        .send({ challengeId: 'test-challenge-456' }) // Missing OTP
        .expect(400);
      
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toBe('challengeId and otp required');
      
      const res2 = await request(app)
        .post('/auth/verify')
        .send({ otp: '123456' }) // Missing challengeId
        .expect(400);
      
      expect(res2.body).toHaveProperty('message');
      expect(res2.body.message).toBe('challengeId and otp required');
    });

    it('should handle verification errors', async () => {
      const challengeId = 'invalid-challenge';
      const otp = '123456';
      
      nock(`${DYNAMIC_BASE}/sdk/${DYNAMIC_ENV_ID}`)
        .post('/users/email/verify')
        .reply(400, {
          error: 'INVALID_CHALLENGE',
          message: 'Challenge ID is invalid or expired'
        });

      await request(app)
        .post('/auth/verify')
        .send({ challengeId, otp })
        .expect(500);
    });

    it('should handle wallet creation errors', async () => {
      const challengeId = 'test-challenge-456';
      const otp = '123456';
      const userId = 'dynamic-user-123';
      
      // Mock successful OTP verification
      nock(`${DYNAMIC_BASE}/sdk/${DYNAMIC_ENV_ID}`)
        .post('/users/email/verify')
        .reply(200, {
          jwt: 'dynamic-jwt-token',
          user: { id: userId }
        });
      
      // Mock failed wallet creation
      nock(`${DYNAMIC_BASE}/sdk/${DYNAMIC_ENV_ID}`)
        .post(`/users/${userId}/embeddedWallets`)
        .replyWithError('Wallet creation failed');

      await request(app)
        .post('/auth/verify')
        .send({ challengeId, otp })
        .expect(500);
    });
  });

  describe('Complete Wallet Creation Flow', () => {
    it('should successfully complete the full login & wallet creation flow', async () => {
      const email = 'new-user@example.com';
      const challengeId = 'flow-test-challenge';
      const otp = '654321';
      const userId = 'flow-test-user-id';
      const walletAddress = 'sei1newwalletaddress';
      
      // Mock email login initiation
      nock(`${DYNAMIC_BASE}/sdk/${DYNAMIC_ENV_ID}`)
        .post('/users/email/init', { email })
        .reply(200, {
          challengeId
        });
      
      // Step 1: Initiate login
      const loginRes = await request(app)
        .post('/auth/login')
        .send({ email })
        .expect(200);
      
      expect(loginRes.body.challengeId).toBe(challengeId);
      
      // Mock OTP verification
      nock(`${DYNAMIC_BASE}/sdk/${DYNAMIC_ENV_ID}`)
        .post('/users/email/verify', { challengeId, otp })
        .reply(200, {
          jwt: 'dynamic-flow-jwt',
          user: { id: userId }
        });
      
      // Mock wallet creation
      nock(`${DYNAMIC_BASE}/sdk/${DYNAMIC_ENV_ID}`)
        .post(`/users/${userId}/embeddedWallets`, { chain: 'sei' })
        .reply(200, {
          wallet: { address: walletAddress }
        });
      
      // Step 2: Verify OTP and create wallet
      const verifyRes = await request(app)
        .post('/auth/verify')
        .send({ challengeId, otp })
        .expect(200);
      
      expect(verifyRes.body).toHaveProperty('token');
      expect(verifyRes.body).toHaveProperty('walletAddress');
      expect(verifyRes.body.walletAddress).toBe(walletAddress);
      
      // Verify JWT contains correct data
      const token = verifyRes.body.token;
      const decoded: any = jwt.verify(token, JWT_SECRET);
      expect(decoded.walletAddress).toBe(walletAddress);
      expect(decoded.userId).toBe(userId);
    });
  });
});