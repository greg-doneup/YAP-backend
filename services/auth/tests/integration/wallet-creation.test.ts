import { Express } from 'express';
import request from 'supertest';
import nock from 'nock';
import jwt from 'jsonwebtoken';

import { createEmbeddedWallet } from '../../src/utils/auth-utils';
import { app } from '../../src';

describe('Wallet Authentication Flow', () => {
  beforeAll(async () => {
    // Mock gateway service
    nock('http://gateway-service')
      .persist()
      .get('/learning/progress')
      .query(true)
      .reply(200, {
        currentLessonId: 'lesson-1',
        currentWordId: 'word-1',
        nextWordAvailableAt: new Date().toISOString()
      });
    
    nock('http://gateway-service')
      .persist()
      .post('/profile')
      .reply(200, { success: true });
  });
  
  afterAll(() => {
    nock.cleanAll();
  });
  
  beforeEach(() => {
    // Clear any dynamic mocks before each test
    nock.cleanAll();
    
    // Reset basic mocks
    nock('http://gateway-service')
      .persist()
      .get('/learning/progress')
      .query(true)
      .reply(200, {
        currentLessonId: 'lesson-1',
        currentWordId: 'word-1',
        nextWordAvailableAt: new Date().toISOString()
      });
  });

  describe('POST /auth/wallet', () => {
    it('should authenticate directly with wallet address', async () => {
      // Given a valid wallet addresses
      const userId = 'test-user-123';
      const wallet = await createEmbeddedWallet(userId);
      const walletAddress = wallet.wallet.address;
      const ethWalletAddress = wallet.ethWallet!.address;
      
      // Mock profile creation
      nock('http://gateway-service')
        .post('/profile')
        .reply(200, { success: true });
      
      // When we authenticate with the wallet
      const res = await request(app)
        .post('/auth/wallet')
        .send({ 
          userId,
          walletAddress,
          ethWalletAddress,
          signupMethod: 'direct'
        })
        .expect(200);
      
      // Then we should get back tokens and wallet info
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('walletAddress', walletAddress);
      expect(res.body).toHaveProperty('ethWalletAddress', ethWalletAddress);
      
      // And the JWT should contain the wallet addresses
      const decoded = jwt.verify(res.body.token, process.env.APP_JWT_SECRET!) as any;
      expect(decoded.walletAddress).toBe(walletAddress);
      expect(decoded.ethWalletAddress).toBe(ethWalletAddress);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh tokens using a valid refresh token', async () => {
      // Given an authenticated user with wallet
      const userId = 'test-user-456';
      const wallet = await createEmbeddedWallet(userId);
      const walletAddress = wallet.wallet.address;
      const ethWalletAddress = wallet.ethWallet!.address;
      
      // And they have a valid refresh token
      const initialRes = await request(app)
        .post('/auth/wallet')
        .send({ userId, walletAddress, ethWalletAddress })
        .expect(200);
      
      const refreshToken = initialRes.body.refreshToken;
      
      // When they request a token refresh
      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);
      
      // Then they should get new tokens
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.refreshToken).not.toBe(refreshToken); // Token rotation
      
      // And the new access token should contain wallet info
      const decoded = jwt.verify(res.body.token, process.env.APP_JWT_SECRET!) as any;
      expect(decoded.walletAddress).toBe(walletAddress);
      expect(decoded.ethWalletAddress).toBe(ethWalletAddress);
    });
  });
});