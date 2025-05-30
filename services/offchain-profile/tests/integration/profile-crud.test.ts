import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';
// Instead of trying to import the app directly, create a test server
import express from 'express';
import profileRoutes from '../../src/routes/profile';
import { ProfileModel, connectToDatabase } from '../../src/mon/mongo';

// Create a test Express app for testing
const createTestApp = () => {
  const app = express();
  
  // Simple test auth middleware that adds user object to request
  const testAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (req as any).user = {
      walletAddress: 'sei1test12345wallet67890address',
      ethWalletAddress: '0xb7682afA514F0EDb9B2e9D6aF690ff9E88d8214f',
      sub: 'test-user-123',
      type: 'access'
    };
    next();
  };
  
  app.use(express.json());
  app.use('/profile', testAuth, profileRoutes);
  
  return app;
};

// Create our test app
const app = createTestApp();

describe('Profile CRUD API', () => {
  const testWallet = 'sei1test12345wallet67890address';
  const testEthWallet = '0xb7682afA514F0EDb9B2e9D6aF690ff9E88d8214f';
  const testUserId = 'test-user-123';
  let authToken: string;
  let mongoServer: MongoMemoryServer;
  
  // Setup - create test environment
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
      walletAddress: testWallet,
      ethWalletAddress: testEthWallet,
      type: 'access'
    }, process.env.APP_JWT_SECRET, { expiresIn: '1h' });
  });
  
  // Cleanup
  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });
  
  // Test creating a new profile
  test('Create a new profile', async () => {
    const response = await request(app)
      .post('/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        userId: testUserId,
        walletAddress: testWallet,
        ethWalletAddress: testEthWallet,
        email: 'test@example.com'
      });
      
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('walletAddress', testWallet);
    expect(response.body).toHaveProperty('ethWalletAddress', testEthWallet);
    expect(response.body).toHaveProperty('userId', testUserId);
    expect(response.body).toHaveProperty('xp', 0);
    expect(response.body).toHaveProperty('streak', 0);
    
    // Verify profile was created in database
    const savedProfile = await ProfileModel.findOne({ walletAddress: testWallet });
    expect(savedProfile).toBeTruthy();
    expect(savedProfile?.ethWalletAddress).toBe(testEthWallet);
  });
  
  // Test retrieving an existing profile
  test('Get profile by wallet address', async () => {
    const response = await request(app)
      .get(`/profile/${testWallet}`)
      .set('Authorization', `Bearer ${authToken}`);
      
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('walletAddress', testWallet);
    expect(response.body).toHaveProperty('ethWalletAddress', testEthWallet);
    expect(response.body).toHaveProperty('userId', testUserId);
  });
  
  // Test updating an existing profile
  test('Update profile attributes', async () => {
    const updateData = {
      xp: 200,
      streak: 5
    };
    
    const response = await request(app)
      .patch(`/profile/${testWallet}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData);
      
    expect(response.status).toBe(204);
    
    // Verify profile was updated in database
    const updatedProfile = await ProfileModel.findOne({ walletAddress: testWallet });
    expect(updatedProfile).toBeTruthy();
    expect(updatedProfile?.xp).toBe(200);
    expect(updatedProfile?.streak).toBe(5);
  });
  
  // Test attempting to access another user's profile (should fail)
  test('Cannot access another user profile', async () => {
    // Create another profile
    await ProfileModel.create({
      userId: 'another-user',
      walletAddress: 'sei1another5432wallet',
      ethWalletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      email: 'another@example.com',
      xp: 50,
      streak: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    const response = await request(app)
      .get('/profile/sei1another5432wallet')
      .set('Authorization', `Bearer ${authToken}`);
      
    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('error', 'forbidden');
  });
});