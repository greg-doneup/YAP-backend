import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import { describe, test, beforeAll, afterAll, expect, jest } from '@jest/globals';
// Import app directly - it is exported as default in index.ts
import app from '../../src/index';
import { ProfileModel, connectToDatabase } from '../../src/mon/mongo';

// Mock the auth middleware to allow testing without real tokens
jest.mock('../../src/shared/auth/authMiddleware', () => ({
  requireAuth: () => (req: any, res: any, next: any) => {
    req.user = {
      sub: 'test-user-123',
      type: 'access'
    };
    next();
  },
  getUserIdFromRequest: (req: any) => req.user?.sub || 'test-user-123'
}));

describe('Wallet Verification API', () => {
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
  
  // Test creating profile with SEI and ETH wallet addresses
  test('Create profile with wallet addresses', async () => {
    const response = await request(app)
      .post('/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        userId: testUserId,
        walletAddress: testSeiWallet,
        ethWalletAddress: testEthWallet,
        email: 'test@example.com'
      });
      
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('walletAddress', testSeiWallet);
    expect(response.body).toHaveProperty('ethWalletAddress', testEthWallet);
    
    // Verify profile was saved in database
    const savedProfile = await ProfileModel.findOne({ userId: testUserId });
    expect(savedProfile).toBeTruthy();
    expect(savedProfile?.walletAddress).toBe(testSeiWallet);
    expect(savedProfile?.ethWalletAddress).toBe(testEthWallet);
  });
  
  // Test ETH wallet address validation
  test('Validate ETH wallet address format', async () => {
    const validResponse = await request(app)
      .post('/profile/validate-wallet')
      .send({
        ethWalletAddress: testEthWallet
      });
      
    expect(validResponse.status).toBe(200);
    expect(validResponse.body).toHaveProperty('valid', true);
    
    const invalidResponse = await request(app)
      .post('/profile/validate-wallet')
      .send({
        ethWalletAddress: '0xinvalid'
      });
      
    expect(invalidResponse.status).toBe(200);
    expect(invalidResponse.body).toHaveProperty('valid', false);
  });
  
  // Test retrieving profile by userId
  test('Get profile by userId', async () => {
    // First create a profile
    await request(app)
      .post('/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        userId: testUserId,
        walletAddress: testSeiWallet,
        ethWalletAddress: testEthWallet
      });
      
    const response = await request(app)
      .get(`/profile/user/${testUserId}`)
      .set('Authorization', `Bearer ${authToken}`);
      
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('walletAddress', testSeiWallet);
    expect(response.body).toHaveProperty('ethWalletAddress', testEthWallet);
  });
  
  // Test linking multiple wallets to one profile
  test('Link multiple wallets to one profile', async () => {
    const additionalEthWallet = '0xAnotherEthWallet123456789012345678901234';
    
    const response = await request(app)
      .patch(`/profile/${testUserId}/link-wallet`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        ethWalletAddress: additionalEthWallet
      });
      
    expect(response.status).toBe(200);
    
    // Verify the wallet was linked
    const updatedProfile = await ProfileModel.findOne({ userId: testUserId });
    expect(updatedProfile).toBeTruthy();
    expect(updatedProfile?.ethWalletAddress).toBe(additionalEthWallet);
  });
});