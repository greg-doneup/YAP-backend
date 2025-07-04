import { ProfileService } from './services/profile-service';
import { ProfileTokenMiddleware } from './middleware/profile-token';
import { ProfileController } from './controllers/profile-controller';
import { ProfileRoutes } from './routes/profile-routes';

// Mock Redis client for development/testing
class MockRedisClient {
  private data: Map<string, any> = new Map();
  private hashData: Map<string, Map<string, string>> = new Map();
  private sortedSets: Map<string, Array<{ score: number; member: string }>> = new Map();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) || null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    const hash = this.hashData.get(key);
    return hash?.get(field) || null;
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    if (!this.hashData.has(key)) {
      this.hashData.set(key, new Map());
    }
    this.hashData.get(key)!.set(field, value);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const hash = this.hashData.get(key);
    if (!hash) return {};
    
    const result: Record<string, string> = {};
    for (const [field, value] of hash) {
      result[field] = value;
    }
    return result;
  }

  async incr(key: string): Promise<number> {
    const current = parseInt(this.data.get(key) || '0');
    const newValue = current + 1;
    this.data.set(key, newValue.toString());
    return newValue;
  }

  async incrby(key: string, amount: number): Promise<number> {
    const current = parseInt(this.data.get(key) || '0');
    const newValue = current + amount;
    this.data.set(key, newValue.toString());
    return newValue;
  }

  async decrby(key: string, amount: number): Promise<number> {
    const current = parseInt(this.data.get(key) || '0');
    const newValue = current - amount;
    this.data.set(key, newValue.toString());
    return newValue;
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    if (!this.sortedSets.has(key)) {
      this.sortedSets.set(key, []);
    }
    const set = this.sortedSets.get(key)!;
    
    // Remove existing member if it exists
    const existingIndex = set.findIndex(item => item.member === member);
    if (existingIndex !== -1) {
      set.splice(existingIndex, 1);
    }
    
    set.push({ score, member });
    set.sort((a, b) => a.score - b.score);
    return 1;
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const set = this.sortedSets.get(key) || [];
    return set.slice(start, stop + 1).map(item => item.member);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    const set = this.sortedSets.get(key) || [];
    const reversed = [...set].reverse();
    return reversed.slice(start, stop + 1).map(item => item.member);
  }

  async lpush(key: string, value: string): Promise<number> {
    if (!this.data.has(key)) {
      this.data.set(key, JSON.stringify([]));
    }
    const list = JSON.parse(this.data.get(key) || '[]');
    list.unshift(value);
    this.data.set(key, JSON.stringify(list));
    return list.length;
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    if (!this.data.has(key)) return;
    const list = JSON.parse(this.data.get(key) || '[]');
    const trimmed = list.slice(start, stop + 1);
    this.data.set(key, JSON.stringify(trimmed));
  }
}

// Initialize services
const redisClient = new MockRedisClient();
const profileService = new ProfileService(redisClient);
const tokenMiddleware = new ProfileTokenMiddleware(redisClient);
const profileController = new ProfileController(profileService, tokenMiddleware);
const profileRoutes = new ProfileRoutes(profileController, tokenMiddleware);

// Mock response object
class MockResponse {
  private statusCode: number = 200;
  private responseData: any = null;

  status(code: number) {
    this.statusCode = code;
    return {
      json: (data: any) => {
        this.responseData = data;
        console.log(`[${this.statusCode}]`, JSON.stringify(data, null, 2));
      }
    };
  }

  json(data: any) {
    this.responseData = data;
    console.log(`[${this.statusCode}]`, JSON.stringify(data, null, 2));
  }

  getResponse() {
    return { statusCode: this.statusCode, data: this.responseData };
  }
}

// Initialize test data
async function initializeTestData() {
  const userId = 'test-user-123';
  
  // Set up user profile
  await redisClient.hset(`user:${userId}:profile`, 'username', 'testuser');
  await redisClient.hset(`user:${userId}:profile`, 'email', 'test@example.com');
  await redisClient.hset(`user:${userId}:profile`, 'tokens', '1000');
  
  // Set up streak data
  await redisClient.hset(`user:${userId}:streak`, 'current', '5');
  await redisClient.hset(`user:${userId}:streak`, 'longest', '10');
  await redisClient.hset(`user:${userId}:streak`, 'lastActivity', '2024-01-15');
  await redisClient.hset(`user:${userId}:streak`, 'freezeCount', '2');
  
  // Set up customization
  await redisClient.hset(`user:${userId}:customization`, 'avatar', 'default');
  await redisClient.hset(`user:${userId}:customization`, 'badge', 'bronze');
  await redisClient.hset(`user:${userId}:customization`, 'theme', 'dark');
  await redisClient.hset(`user:${userId}:customization`, 'title', 'Beginner');
  
  // Set up stats
  await redisClient.hset(`user:${userId}:stats`, 'totalLessons', '25');
  await redisClient.hset(`user:${userId}:stats`, 'totalTokensEarned', '2000');
  await redisClient.hset(`user:${userId}:stats`, 'totalTokensSpent', '1000');
  await redisClient.hset(`user:${userId}:stats`, 'level', '3');
  await redisClient.hset(`user:${userId}:stats`, 'xp', '2500');
  
  // Set up sample achievement
  await redisClient.hset('achievement:first-lesson', 'name', 'First Steps');
  await redisClient.hset('achievement:first-lesson', 'description', 'Complete your first lesson');
  await redisClient.hset('achievement:first-lesson', 'tokenReward', '50');
  
  // Set up user token balance
  await redisClient.set(`user:${userId}:tokens`, '1000');
  
  console.log('Test data initialized successfully');
}

// Test the service
async function testProfileService() {
  console.log('🚀 Profile Service Test Suite\n');
  
  await initializeTestData();
  
  // Test 1: Get profile
  console.log('📋 Test 1: Get User Profile');
  let response = new MockResponse();
  await profileRoutes.handleRequest({
    method: 'GET',
    url: '/profile',
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  console.log('\n📊 Test 2: Get Token Balance');
  response = new MockResponse();
  await profileRoutes.handleRequest({
    method: 'GET',
    url: '/profile/balance',
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  console.log('\n🔥 Test 3: Continue Streak');
  response = new MockResponse();
  await profileRoutes.handleRequest({
    method: 'POST',
    url: '/profile/streak',
    body: { action: 'continue' },
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  console.log('\n🎨 Test 4: Update Customization');
  response = new MockResponse();
  await profileRoutes.handleRequest({
    method: 'PUT',
    url: '/profile/customization',
    body: { customizationType: 'avatar', value: 'cool-avatar', premium: true },
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  console.log('\n🏆 Test 5: Unlock Achievement');
  response = new MockResponse();
  await profileRoutes.handleRequest({
    method: 'POST',
    url: '/profile/achievements/first-lesson',
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  console.log('\n📈 Test 6: Get Stats');
  response = new MockResponse();
  await profileRoutes.handleRequest({
    method: 'GET',
    url: '/profile/stats',
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  console.log('\n💚 Test 7: Health Check');
  response = new MockResponse();
  await profileRoutes.handleRequest({
    method: 'GET',
    url: '/health'
  }, response);
  
  console.log('\n📋 Available Routes:');
  const routes = profileRoutes.getAvailableRoutes();
  console.table(routes);
}

// Main application class
export class ProfileServiceApp {
  private routes: ProfileRoutes;
  
  constructor() {
    this.routes = profileRoutes;
  }
  
  async handleRequest(req: any, res: any): Promise<void> {
    return this.routes.handleRequest(req, res);
  }
  
  getRoutes() {
    return this.routes.getAvailableRoutes();
  }
  
  async start(port: number = 3003): Promise<void> {
    console.log(`🎯 Profile Service started on port ${port}`);
    console.log('Features: Profile Management, Token Balance, Streak Management, Achievements, Customization');
    
    // In a real app, this would start an Express server
    await testProfileService();
  }
}

// Export for use in other modules
export { ProfileService, ProfileTokenMiddleware, ProfileController, ProfileRoutes };

// Run if this file is executed directly
if (require.main === module) {
  const app = new ProfileServiceApp();
  app.start().catch(console.error);
}
