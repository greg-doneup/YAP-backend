import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import { describe, test, beforeAll, afterAll, expect, jest } from '@jest/globals';
import app from '../../src/index';
import { ProfileModel, connectToDatabase } from '../../src/mon/mongo';

// Mock blockchain related functions with normal objects
jest.mock('../../src/blockchain/contract-interaction', () => ({
  verifyStreak: () => Promise.resolve(true),
  getOnChainXP: () => Promise.resolve(100),
  syncOnChainData: () => Promise.resolve({ success: true, xp: 100, streak: 5 }),
}));

// Mock the auth middleware
jest.mock('../../src/shared/auth/authMiddleware', () => ({
  requireAuth: () => (req: any, res: any, next: any) => {
    req.user = {
      sub: 'test-user-123',
      walletAddress: 'sei1test12345wallet67890address',
      ethWalletAddress: '0xb7682afA514F0EDb9B2e9D6aF690ff9E88d8214f',
      type: 'access'
    };
    next();
  },
  getUserIdFromRequest: (req: any) => req.user?.sub || 'test-user-123',
  getWalletAddressesFromRequest: (req: any) => ({
    sei: req.user?.walletAddress || 'sei1test12345wallet67890address',
    eth: req.user?.ethWalletAddress || '0xb7682afA514F0EDb9B2e9D6aF690ff9E88d8214f'
  })
}));

describe('Blockchain Integration API', () => {
  const testSeiWallet = 'sei1test12345wallet67890address';
  const testEthWallet = '0xb7682afA514F0EDb9B2e9D6aF690ff9E88d8214f';
  const testUserId = 'test-user-123';
  let authToken: string;
  let mongoServer: MongoMemoryServer;
  
  // Setup
  beforeAll(async () => {
    // Create in-memory MongoDB server for testing
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    // Override environment variables
    process.env.MONGO_URI = mongoUri;
    process.env.MONGO_DB_NAME = 'yap-test';
    process.env.APP_JWT_SECRET = 'test-secret';
    
    // Connect to test database
    await connectToDatabase();
    
    // Clean test data
    await ProfileModel.deleteMany({});
    
    // Create test profile
    await ProfileModel.create({
      userId: testUserId,
      walletAddress: testSeiWallet,
      ethWalletAddress: testEthWallet,
      xp: 0,
      streak: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    // Generate test JWT token
    authToken = jwt.sign({
      sub: testUserId,
      walletAddress: testSeiWallet,
      ethWalletAddress: testEthWallet,
      type: 'access'
    }, process.env.APP_JWT_SECRET, { expiresIn: '1h' });
  });
  
  // Cleanup
  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });
  
  // Test syncing on-chain data
  test('Sync on-chain data with profile', async () => {
    const response = await request(app)
      .post(`/profile/${testUserId}/sync-blockchain`)
      .set('Authorization', `Bearer ${authToken}`);
      
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    
    // Verify profile was updated with on-chain data
    const updatedProfile = await ProfileModel.findOne({ userId: testUserId });
    expect(updatedProfile).toBeTruthy();
    expect(updatedProfile?.xp).toBe(100); // Value from mock
    expect(updatedProfile?.streak).toBe(5); // Value from mock
  });
  
  // Test verifying streak through blockchain
  test('Verify streak through blockchain', async () => {
    const response = await request(app)
      .get(`/profile/${testUserId}/verify-streak`)
      .set('Authorization', `Bearer ${authToken}`);
      
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('verified', true);
  });
  
  // Test handling blockchain error gracefully
  test('Handle blockchain error gracefully', async () => {
    // For this test, create a new mock that throws an error
    jest.mock('../../src/blockchain/contract-interaction', () => ({
      verifyStreak: () => Promise.resolve(true),
      getOnChainXP: () => Promise.resolve(100),
      syncOnChainData: () => Promise.reject(new Error('Blockchain connection failed'))
    }), { virtual: true });
    
    const response = await request(app)
      .post(`/profile/${testUserId}/sync-blockchain`)
      .set('Authorization', `Bearer ${authToken}`);
      
    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('blockchain');
    
    // Reset the mock for other tests
    jest.mock('../../src/blockchain/contract-interaction', () => ({
      verifyStreak: () => Promise.resolve(true),
      getOnChainXP: () => Promise.resolve(100),
      syncOnChainData: () => Promise.resolve({ success: true, xp: 100, streak: 5 }),
    }));
  });
});