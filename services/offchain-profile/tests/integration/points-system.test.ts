import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';
// Instead of trying to import the app directly, create a test server
import express from 'express';
import profileRoutes from '../../src/routes/profile';
import pointsRoutes from '../../src/routes/points';
import { ProfileModel, connectToDatabase } from '../../src/mon/mongo';

// Create a test Express app for testing
const createTestApp = () => {
  const app = express();
  const SECRET = 'test-secret';
  
  // Simple test auth middleware that adds user object to request
  const testAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (req as any).user = {
      walletAddress: 'sei1test12345wallet67890address',
      sub: 'test-user-123',
      type: 'access'
    };
    next();
  };
  
  app.use(express.json());
  app.use('/profile', testAuth, profileRoutes);
  app.use('/points', testAuth, pointsRoutes);
  
  return app;
};

// Create our test app
const app = createTestApp();

describe('Points System API', () => {
  const testWallet = 'sei1test12345wallet67890address';
  const testUserId = 'test-user-123';
  let authToken: string;
  let mongoServer: MongoMemoryServer;
  
  // Setup - create test user profile and auth token
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
      walletAddress: testWallet,
      email: 'test@example.com',
      xp: 100,
      streak: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    // Generate test JWT token
    authToken = jwt.sign({
      sub: testUserId,
      walletAddress: testWallet,
      type: 'access'
    }, process.env.APP_JWT_SECRET, { expiresIn: '1h' });
  });
  
  // Cleanup
  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });
  
  // Test adding points to own profile
  test('Add XP points to own profile', async () => {
    const pointsToAdd = 50;
    
    const response = await request(app)
      .patch('/points/add')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        walletAddress: testWallet,
        amount: pointsToAdd
      });
      
    expect(response.status).toBe(204);
    
    // Verify points were added
    const updatedProfile = await ProfileModel.findOne({ walletAddress: testWallet });
    expect(updatedProfile).toBeTruthy();
    expect(updatedProfile?.xp).toBe(150); // 100 initial + 50 added
  });
  
  // Test retrieving leaderboard
  test('Get XP leaderboard', async () => {
    // Add another profile with higher XP
    await ProfileModel.create({
      userId: 'leaderboard-user',
      walletAddress: 'sei1leaderboard1234wallet',
      email: 'leader@example.com',
      xp: 500,
      streak: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    const response = await request(app)
      .get('/points/leaderboard?limit=10')
      .set('Authorization', `Bearer ${authToken}`);
      
    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(Array);
    expect(response.body.length).toBeGreaterThanOrEqual(2);
    expect(response.body[0].xp).toBeGreaterThanOrEqual(response.body[1].xp);
    expect(response.body[0].walletAddress).toBe('sei1leaderboard1234wallet');
  });
  
  // Test updating streak
  test('Update user streak', async () => {
    const newStreak = 3;
    
    const response = await request(app)
      .patch(`/profile/${testWallet}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        streak: newStreak
      });
      
    expect(response.status).toBe(204);
    
    // Verify streak was updated
    const updatedProfile = await ProfileModel.findOne({ walletAddress: testWallet });
    expect(updatedProfile).toBeTruthy();
    expect(updatedProfile?.streak).toBe(newStreak);
  });
});