import { CollaborationService } from './services/collaboration-service';
import { CollaborationTokenMiddleware } from './middleware/collaboration-token';
import { CollaborationController } from './controllers/collaboration-controller';
import { CollaborationRoutes } from './routes/collaboration-routes';

// Simplified mock Redis client
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

  async srem(key: string, member: string): Promise<number> {
    const set = this.setData.get(key);
    if (set && set.has(member)) {
      set.delete(member);
      return 1;
    }
    return 0;
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
const collaborationService = new CollaborationService(redisClient);
const tokenMiddleware = new CollaborationTokenMiddleware(redisClient);
const collaborationController = new CollaborationController(collaborationService, tokenMiddleware);
const collaborationRoutes = new CollaborationRoutes(collaborationController, tokenMiddleware);

// Initialize test data
async function initializeTestData() {
  const userId = 'test-user-123';
  await redisClient.set(`user:${userId}:tokens`, '1000');
  console.log('Test data initialized for Collaboration Service');
}

// Test the service
async function testCollaborationService() {
  console.log('🤝 Collaboration Service Test Suite\n');
  
  await initializeTestData();
  
  // Test 1: Create Study Group
  console.log('📚 Test 1: Create Study Group');
  let response = new MockResponse();
  await collaborationRoutes.handleRequest({
    method: 'POST',
    url: '/groups',
    body: {
      name: 'Advanced English Study Group',
      description: 'Group for advanced English learners',
      type: 'study',
      isPrivate: false,
      maxMembers: 10,
      language: 'english',
      level: 'advanced'
    },
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  console.log('\n🎯 Test 2: Create Study Session');
  response = new MockResponse();
  await collaborationRoutes.handleRequest({
    method: 'POST',
    url: '/sessions',
    body: {
      title: 'Conversation Practice Session',
      description: 'Practice speaking English',
      type: 'conversation_practice',
      maxParticipants: 8,
      startTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      duration: 60,
      features: ['advanced_chat', 'recording']
    },
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  console.log('\n👨‍🏫 Test 3: Request Mentorship');
  response = new MockResponse();
  await collaborationRoutes.handleRequest({
    method: 'POST',
    url: '/mentorship/mentor-123',
    body: {
      type: 'advanced',
      duration: 60,
      scheduledTime: new Date(Date.now() + 172800000).toISOString(), // Day after tomorrow
      subject: 'Business English Conversation'
    },
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  console.log('\n📊 Test 4: Get Collaboration Stats');
  response = new MockResponse();
  await collaborationRoutes.handleRequest({
    method: 'GET',
    url: '/stats',
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  console.log('\n💚 Test 5: Health Check');
  response = new MockResponse();
  await collaborationRoutes.handleRequest({
    method: 'GET',
    url: '/health'
  }, response);
  
  console.log('\n📋 Available Routes:');
  const routes = collaborationRoutes.getAvailableRoutes();
  console.table(routes);
}

// Main application class
export class CollaborationServiceApp {
  private routes: CollaborationRoutes;
  
  constructor() {
    this.routes = collaborationRoutes;
  }
  
  async handleRequest(req: any, res: any): Promise<void> {
    return this.routes.handleRequest(req, res);
  }
  
  getRoutes() {
    return this.routes.getAvailableRoutes();
  }
  
  async start(port: number = 3004): Promise<void> {
    console.log(`🤝 Collaboration Service started on port ${port}`);
    console.log('Features: Study Groups, Study Sessions, Mentorship, Group Discovery');
    
    await testCollaborationService();
  }
}

// Export for use in other modules
export { CollaborationService, CollaborationTokenMiddleware, CollaborationController, CollaborationRoutes };

// Run if this file is executed directly
if (require.main === module) {
  const app = new CollaborationServiceApp();
  app.start().catch(console.error);
}
