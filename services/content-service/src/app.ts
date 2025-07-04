import { ContentService } from './services/content-service';
import { ContentTokenMiddleware } from './middleware/content-token';
import { ContentController } from './controllers/content-controller';
import { ContentRoutes } from './routes/content-routes';

// Simplified mock Redis client with all required methods
class MockRedisClient {
  private data: Map<string, any> = new Map();
  private hashData: Map<string, Map<string, string>> = new Map();
  private setData: Map<string, Set<string>> = new Map();
  private sortedSets: Map<string, Array<{ score: number; member: string }>> = new Map();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) || null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.hashData.get(key)?.get(field) || null;
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    if (!this.hashData.has(key)) this.hashData.set(key, new Map());
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

  async sadd(key: string, member: string): Promise<number> {
    if (!this.setData.has(key)) this.setData.set(key, new Set());
    this.setData.get(key)!.add(member);
    return 1;
  }

  async smembers(key: string): Promise<string[]> {
    const set = this.setData.get(key);
    return set ? Array.from(set) : [];
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    if (!this.sortedSets.has(key)) this.sortedSets.set(key, []);
    const set = this.sortedSets.get(key)!;
    const existingIndex = set.findIndex(item => item.member === member);
    if (existingIndex !== -1) set.splice(existingIndex, 1);
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
    return [...set].reverse().slice(start, stop + 1).map(item => item.member);
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

  async lpush(key: string, value: string): Promise<number> {
    if (!this.data.has(key)) this.data.set(key, JSON.stringify([]));
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

// Mock response class
class MockResponse {
  private statusCode: number = 200;
  
  status(code: number) {
    this.statusCode = code;
    return {
      json: (data: any) => {
        console.log(`[${this.statusCode}]`, JSON.stringify(data, null, 2));
      }
    };
  }

  json(data: any) {
    console.log(`[${this.statusCode}]`, JSON.stringify(data, null, 2));
  }
}

// Initialize services
const redisClient = new MockRedisClient();
const contentService = new ContentService(redisClient);
const tokenMiddleware = new ContentTokenMiddleware(redisClient);
const contentController = new ContentController(contentService, tokenMiddleware);
const contentRoutes = new ContentRoutes(contentController, tokenMiddleware);

// Initialize test data
async function initializeTestData() {
  const userId = 'test-user-123';
  await redisClient.set(`user:${userId}:tokens`, '1000');
  
  // Create sample content
  await redisClient.hset('content:premium-lesson-1', 'data', JSON.stringify({
    id: 'premium-lesson-1',
    title: 'Advanced Business English',
    description: 'Comprehensive business English course',
    type: 'premium_lesson',
    creatorId: 'expert-teacher-1',
    visibility: 'premium',
    tokenCost: 50,
    tags: ['business', 'advanced'],
    difficulty: 'advanced',
    language: 'english',
    duration: 120,
    isActive: true,
    views: 0,
    rating: 4.8
  }));
  
  console.log('Test data initialized for Content Service');
}

// Test the service
async function testContentService() {
  console.log('📚 Content Service Test Suite\n');
  
  await initializeTestData();
  
  // Test 1: Create Content
  console.log('📝 Test 1: Create Content');
  let response = new MockResponse();
  await contentRoutes.handleRequest({
    method: 'POST',
    url: '/content',
    body: {
      title: 'My Custom Lesson',
      description: 'A custom lesson I created',
      type: 'lesson',
      visibility: 'public',
      tokenCost: 0,
      tags: ['custom', 'beginner'],
      difficulty: 'beginner',
      language: 'english',
      duration: 60
    },
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  console.log('\n🔓 Test 2: Access Premium Content');
  response = new MockResponse();
  await contentRoutes.handleRequest({
    method: 'POST',
    url: '/content/premium-lesson-1/access',
    params: { contentId: 'premium-lesson-1', contentType: 'premium_lesson' },
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  console.log('\n🛠️ Test 3: Use Creation Tool');
  response = new MockResponse();
  await contentRoutes.handleRequest({
    method: 'POST',
    url: '/tools/video_editor',
    body: {
      toolType: 'video_editor',
      features: ['multi_track', 'effects', 'transitions']
    },
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  console.log('\n🛒 Test 4: Create Marketplace Transaction');
  response = new MockResponse();
  await contentRoutes.handleRequest({
    method: 'POST',
    url: '/marketplace/transaction',
    body: {
      transactionType: 'content_purchase',
      amount: 100,
      sellerId: 'expert-teacher-1',
      contentId: 'premium-lesson-1'
    },
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  console.log('\n📊 Test 5: Get Content Stats');
  response = new MockResponse();
  await contentRoutes.handleRequest({
    method: 'GET',
    url: '/stats',
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  console.log('\n🔍 Test 6: Search Content');
  response = new MockResponse();
  await contentRoutes.handleRequest({
    method: 'GET',
    url: '/content/search?type=lesson&difficulty=beginner',
    query: { type: 'lesson', difficulty: 'beginner' },
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  console.log('\n💚 Test 7: Health Check');
  response = new MockResponse();
  await contentRoutes.handleRequest({
    method: 'GET',
    url: '/health'
  }, response);
  
  console.log('\n📋 Available Routes:');
  const routes = contentRoutes.getAvailableRoutes();
  console.table(routes);
}

// Main application class
export class ContentServiceApp {
  private routes: ContentRoutes;
  
  constructor() {
    this.routes = contentRoutes;
  }
  
  async handleRequest(req: any, res: any): Promise<void> {
    return this.routes.handleRequest(req, res);
  }
  
  getRoutes() {
    return this.routes.getAvailableRoutes();
  }
  
  async start(port: number = 3005): Promise<void> {
    console.log(`📚 Content Service started on port ${port}`);
    console.log('Features: Premium Content, Creation Tools, Marketplace, Publishing');
    
    await testContentService();
  }
}

// Export for use in other modules
export { ContentService, ContentTokenMiddleware, ContentController, ContentRoutes };

// Run if this file is executed directly
if (require.main === module) {
  const app = new ContentServiceApp();
  app.start().catch(console.error);
}
