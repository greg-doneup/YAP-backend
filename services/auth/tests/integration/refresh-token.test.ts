import request from 'supertest';
import nock from 'nock';
import jwt from 'jsonwebtoken';
import express from 'express';
import authRouter from '../../src/routes/auth';
import { deleteSpecificRefreshToken, validateRefreshToken } from '../../src/utils/database';

// Mock jwt module
jest.mock('jsonwebtoken');
// Mock database functions
jest.mock('../../src/utils/database');

// Mock base URL for Dynamic API
const DYNAMIC_BASE = process.env.DYNAMIC_BASE || 'https://api.test-dynamic.xyz/api/v0';
const DYNAMIC_ENV_ID = process.env.DYNAMIC_ENV_ID || 'test-env-id';
const JWT_SECRET = process.env.APP_JWT_SECRET || 'test-jwt-secret';
const REFRESH_SECRET = process.env.APP_REFRESH_SECRET || JWT_SECRET + '_refresh';

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

describe('Refresh Token Flow', () => {
  let app: express.Application;
  
  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
    
    // Default JWT verify implementation
    (jwt.verify as jest.Mock).mockImplementation((token, secret) => {
      if (token === 'valid-refresh-token') {
        return {
          sub: 'test-user-123',
          type: 'refresh',
          jti: 'unique-token-id'
        };
      } else if (token === 'valid-access-token') {
        return {
          sub: 'test-user-123',
          walletAddress: 'sei1a2b3c4d5e6f7g8h9i0j',
          ethWalletAddress: '0x1234567890abcdef',
          type: 'access'
        };
      } else if (token === 'expired-token') {
        const err: any = new Error('jwt expired');
        err.name = 'TokenExpiredError';
        throw err;
      } else {
        throw new Error('Invalid token');
      }
    });
    
    // Default JWT sign implementation
    (jwt.sign as jest.Mock).mockImplementation((payload, secret, options) => {
      if (payload.type === 'access') {
        return 'new-access-token';
      } else {
        return 'new-refresh-token';
      }
    });
    
    // Default database mock implementations
    (validateRefreshToken as jest.Mock).mockResolvedValue(true);
    (deleteSpecificRefreshToken as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('POST /auth/refresh', () => {
    it('should issue new tokens when given a valid refresh token', async () => {
      // Mock wallet creation response
      nock(`${DYNAMIC_BASE}/sdk/${DYNAMIC_ENV_ID}`)
        .post(/\/users\/.*\/embeddedWallets/)
        .reply(200, {
          wallet: { address: 'sei1refreshed7wallet8address9' }
        });
      
      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' })
        .expect(200);
      
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('walletAddress');
      expect(res.body).toHaveProperty('ethWalletAddress');
      
      // Verify token rotation - the old token should be invalidated
      expect(deleteSpecificRefreshToken).toHaveBeenCalledWith('test-user-123', 'valid-refresh-token');
    });

    it('should return 400 if refresh token is missing', async () => {
      const res = await request(app)
        .post('/auth/refresh')
        .send({})
        .expect(400);
      
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toBe('Refresh token required');
    });

    it('should return 401 if refresh token is expired', async () => {
      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'expired-token' })
        .expect(401);
      
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toBe('Refresh token has expired');
    });

    it('should return 401 if refresh token is invalid', async () => {
      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);
      
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toBe('Invalid refresh token');
    });

    it('should return 401 if refresh token was revoked', async () => {
      // Mock validateRefreshToken to return false (token not found/revoked)
      (validateRefreshToken as jest.Mock).mockResolvedValue(false);
      
      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' })
        .expect(401);
      
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toBe('Invalid or revoked refresh token');
    });
  });

  describe('POST /auth/revoke', () => {
    it('should revoke a specific refresh token', async () => {
      const res = await request(app)
        .post('/auth/revoke')
        .set('Authorization', 'Bearer valid-access-token')
        .send({ refreshToken: 'valid-refresh-token' })
        .expect(200);
      
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toBe('Token revoked');
      expect(deleteSpecificRefreshToken).toHaveBeenCalledWith('test-user-123', 'valid-refresh-token');
    });

    it('should return 400 if refresh token is missing', async () => {
      const res = await request(app)
        .post('/auth/revoke')
        .set('Authorization', 'Bearer valid-access-token')
        .send({})
        .expect(400);
      
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toBe('Refresh token required');
    });

    it('should return 401 if access token is missing', async () => {
      const res = await request(app)
        .post('/auth/revoke')
        .send({ refreshToken: 'valid-refresh-token' })
        .expect(401);
    });

    it('should return 404 if refresh token is not found', async () => {
      // Mock deleteSpecificRefreshToken to return false (token not found)
      (deleteSpecificRefreshToken as jest.Mock).mockResolvedValue(false);
      
      const res = await request(app)
        .post('/auth/revoke')
        .set('Authorization', 'Bearer valid-access-token')
        .send({ refreshToken: 'valid-refresh-token' })
        .expect(404);
      
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toBe('Token not found');
    });
  });
});