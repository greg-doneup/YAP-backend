import request from 'supertest';
import jwt from 'jsonwebtoken';
import express from 'express';
import authRouter from '../../src/routes/auth';

// Test JWT secret
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

describe('Wallet Authentication Flow', () => {
  let app: express.Application;
  
  beforeEach(() => {
    app = createApp();
  });

  describe('POST /auth/login', () => {
    it('should initiate login process and return challengeId', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'user@example.com' })
        .expect(200);
      
      expect(res.body).toHaveProperty('challengeId');
      expect(typeof res.body.challengeId).toBe('string');
      expect(res.body.challengeId.length).toBeGreaterThan(0);
    });

    it('should return 400 error if email is missing', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({})
        .expect(400);
      
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toBe('email required');
    });
  });

  describe('POST /auth/verify', () => {
    it('should verify OTP, create wallet, and return JWT with wallet address', async () => {
      const challengeId = 'test-challenge-456';
      const otp = '123456';
      const customWalletAddress = 'sei1a2b3c4d5e6f7g8h9i0j';
      const customEthWalletAddress = '0xabcde12345';
      
      const res = await request(app)
        .post('/auth/verify')
        .send({ 
          challengeId, 
          otp,
          walletAddress: customWalletAddress,
          ethWalletAddress: customEthWalletAddress
        })
        .expect(200);
      
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('walletAddress');
      expect(res.body).toHaveProperty('ethWalletAddress');
      expect(res.body.walletAddress).toBe(customWalletAddress);
      expect(res.body.ethWalletAddress).toBe(customEthWalletAddress);
      
      // Verify the JWT contains the correct payload
      const decodedToken: any = jwt.verify(res.body.token, JWT_SECRET);
      expect(decodedToken).toHaveProperty('walletAddress');
      expect(decodedToken).toHaveProperty('ethWalletAddress');
      expect(decodedToken).toHaveProperty('sub');
      expect(decodedToken).toHaveProperty('type');
      expect(decodedToken.type).toBe('access');
      expect(decodedToken.walletAddress).toBe(customWalletAddress);
      expect(decodedToken.ethWalletAddress).toBe(customEthWalletAddress);
    });

    it('should generate wallet addresses if none are provided', async () => {
      const challengeId = 'test-challenge-456';
      const otp = '123456';
      
      const res = await request(app)
        .post('/auth/verify')
        .send({ challengeId, otp })
        .expect(200);
      
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('walletAddress');
      expect(res.body).toHaveProperty('ethWalletAddress');
      expect(res.body.walletAddress.startsWith('sei1')).toBe(true);
      expect(res.body.ethWalletAddress.startsWith('0x')).toBe(true);
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
  });

  describe('POST /auth/wallet', () => {
    it('should authenticate directly with wallet address', async () => {
      const walletAddress = 'sei1directwallet123';
      const ethWalletAddress = '0xdirectethwallet456';
      
      const res = await request(app)
        .post('/auth/wallet')
        .send({ 
          walletAddress, 
          ethWalletAddress 
        })
        .expect(200);
      
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('walletAddress');
      expect(res.body).toHaveProperty('ethWalletAddress');
      expect(res.body.walletAddress).toBe(walletAddress);
      expect(res.body.ethWalletAddress).toBe(ethWalletAddress);
      
      // Verify the JWT contains the correct payload
      const decodedToken: any = jwt.verify(res.body.token, JWT_SECRET);
      expect(decodedToken.walletAddress).toBe(walletAddress);
      expect(decodedToken.ethWalletAddress).toBe(ethWalletAddress);
      expect(decodedToken.type).toBe('access');
    });
    
    it('should return 400 error if wallet address is missing', async () => {
      const res = await request(app)
        .post('/auth/wallet')
        .send({ ethWalletAddress: '0xonlyethwallet' })
        .expect(400);
      
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toBe('walletAddress required');
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh tokens using a valid refresh token', async () => {
      // First create an initial token
      const walletAddress = 'sei1refresh123';
      const ethWalletAddress = '0xrefresh456';
      
      const initialRes = await request(app)
        .post('/auth/wallet')
        .send({ walletAddress, ethWalletAddress })
        .expect(200);
      
      const refreshToken = initialRes.body.refreshToken;
      
      // Now use the refresh token to get a new access token
      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);
      
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('walletAddress');
      expect(res.body).toHaveProperty('ethWalletAddress');
      
      // Verify it's a new token
      expect(res.body.token).not.toBe(initialRes.body.token);
      expect(res.body.refreshToken).not.toBe(initialRes.body.refreshToken);
      
      // But contains the same wallet information
      expect(res.body.walletAddress).toBe(walletAddress);
      expect(res.body.ethWalletAddress).toBe(ethWalletAddress);
    });
    
    it('should allow providing updated wallet addresses during refresh', async () => {
      // First create an initial token
      const initialWalletAddress = 'sei1initial123';
      
      const initialRes = await request(app)
        .post('/auth/wallet')
        .send({ walletAddress: initialWalletAddress })
        .expect(200);
      
      const refreshToken = initialRes.body.refreshToken;
      const updatedWalletAddress = 'sei1updated123';
      const updatedEthWalletAddress = '0xupdated456';
      
      // Now use the refresh token to get a new access token with updated wallet addresses
      const res = await request(app)
        .post('/auth/refresh')
        .send({ 
          refreshToken, 
          walletAddress: updatedWalletAddress, 
          ethWalletAddress: updatedEthWalletAddress 
        })
        .expect(200);
      
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('walletAddress');
      expect(res.body).toHaveProperty('ethWalletAddress');
      
      // Verify it has the updated wallet information
      expect(res.body.walletAddress).toBe(updatedWalletAddress);
      expect(res.body.ethWalletAddress).toBe(updatedEthWalletAddress);
      
      // Verify token contains updated wallet info
      const decodedToken: any = jwt.verify(res.body.token, JWT_SECRET);
      expect(decodedToken.walletAddress).toBe(updatedWalletAddress);
      expect(decodedToken.ethWalletAddress).toBe(updatedEthWalletAddress);
    });
    
    it('should return 400 error if refresh token is missing', async () => {
      const res = await request(app)
        .post('/auth/refresh')
        .send({})
        .expect(400);
      
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toBe('Refresh token required');
    });
  });

  describe('Complete Authentication Flow', () => {
    it('should successfully complete the full login & wallet creation flow', async () => {
      const email = 'new-user@example.com';
      const customWalletAddress = 'sei1newwalletaddress';
      const customEthAddress = '0xnewethaddress';
      
      // Step 1: Initiate login
      const loginRes = await request(app)
        .post('/auth/login')
        .send({ email })
        .expect(200);
      
      const challengeId = loginRes.body.challengeId;
      expect(challengeId).toBeDefined();
      
      // Step 2: Verify OTP and create wallet
      const verifyRes = await request(app)
        .post('/auth/verify')
        .send({ 
          challengeId, 
          otp: '123456',
          walletAddress: customWalletAddress,
          ethWalletAddress: customEthAddress
        })
        .expect(200);
      
      expect(verifyRes.body).toHaveProperty('token');
      expect(verifyRes.body).toHaveProperty('walletAddress');
      expect(verifyRes.body).toHaveProperty('ethWalletAddress');
      expect(verifyRes.body.walletAddress).toBe(customWalletAddress);
      expect(verifyRes.body.ethWalletAddress).toBe(customEthAddress);
      
      const token = verifyRes.body.token;
      const decoded: any = jwt.verify(token, JWT_SECRET);
      expect(decoded.walletAddress).toBe(customWalletAddress);
      expect(decoded.ethWalletAddress).toBe(customEthAddress);
      expect(decoded.type).toBe('access');
      
      // Step 3: Validate the token
      const validateRes = await request(app)
        .get('/auth/validate')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      expect(validateRes.body).toHaveProperty('userId');
      expect(validateRes.body).toHaveProperty('walletAddress');
      expect(validateRes.body).toHaveProperty('ethWalletAddress');
      expect(validateRes.body.walletAddress).toBe(customWalletAddress);
      expect(validateRes.body.ethWalletAddress).toBe(customEthAddress);
      expect(validateRes.body.userId).toBe(decoded.sub);
    });
    
    it('should successfully authenticate directly with a wallet', async () => {
      const walletAddress = 'sei1directflow123';
      const ethWalletAddress = '0xdirectflow456';
      
      // Direct wallet authentication
      const authRes = await request(app)
        .post('/auth/wallet')
        .send({ walletAddress, ethWalletAddress })
        .expect(200);
      
      expect(authRes.body).toHaveProperty('token');
      expect(authRes.body).toHaveProperty('refreshToken');
      expect(authRes.body.walletAddress).toBe(walletAddress);
      expect(authRes.body.ethWalletAddress).toBe(ethWalletAddress);
      
      const token = authRes.body.token;
      
      // Validate the token
      const validateRes = await request(app)
        .get('/auth/validate')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      expect(validateRes.body).toHaveProperty('userId');
      expect(validateRes.body).toHaveProperty('walletAddress');
      expect(validateRes.body.walletAddress).toBe(walletAddress);
      
      // Logout
      const logoutRes = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      expect(logoutRes.body).toHaveProperty('message');
      expect(logoutRes.body.message).toBe('Successfully logged out');
    });
  });
});