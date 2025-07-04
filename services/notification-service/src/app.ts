import { NotificationService } from './services/notification-service';
import { NotificationTokenMiddleware } from './middleware/notification-token';
import { NotificationController } from './controllers/notification-controller';
import { NotificationRoutes } from './routes/notification-routes';

// Simplified mock Redis client
class MockRedisClient {
  private data: Map<string, any> = new Map();
  private hashData: Map<string, Map<string, string>> = new Map();
  private setData: Map<string, Set<string>> = new Map();

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
    return 1; // Simplified
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return []; // Simplified
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
const notificationService = new NotificationService(redisClient);
const tokenMiddleware = new NotificationTokenMiddleware(redisClient);
const notificationController = new NotificationController(notificationService, tokenMiddleware);
const notificationRoutes = new NotificationRoutes(notificationController, tokenMiddleware);

// Initialize test data
async function initializeTestData() {
  const userId = 'test-user-123';
  await redisClient.set(`user:${userId}:tokens`, '1000');
  
  // Set default notification preferences
  await redisClient.hset(`user:${userId}:notification_preferences`, 'in_app_enabled', 'true');
  await redisClient.hset(`user:${userId}:notification_preferences`, 'push_enabled', 'false');
  await redisClient.hset(`user:${userId}:notification_preferences`, 'email_enabled', 'false');
  
  console.log('Test data initialized for Notification Service');
}

// Test the service
async function testNotificationService() {
  console.log('🔔 Notification Service Test Suite\n');
  
  await initializeTestData();
  
  // Test 1: Send Basic Notification (Free)
  console.log('📱 Test 1: Send Basic In-App Notification');
  let response = new MockResponse();
  await notificationRoutes.handleRequest({
    method: 'POST',
    url: '/notifications/send',
    body: {
      title: 'Welcome!',
      message: 'Welcome to YAP language learning!',
      type: 'welcome',
      channel: 'in_app',
      priority: 'normal'
    },
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  // Test 2: Send Premium Push Notification
  console.log('\n📲 Test 2: Send Premium Push Notification');
  response = new MockResponse();
  await notificationRoutes.handleRequest({
    method: 'POST',
    url: '/notifications/send',
    body: {
      title: 'Lesson Reminder',
      message: 'Time for your daily lesson!',
      type: 'reminder',
      channel: 'push_notification',
      priority: 'high',
      notificationType: 'push_notification',
      features: ['rich_content', 'action_buttons']
    },
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  // Test 3: Create Custom Campaign
  console.log('\n📧 Test 3: Create Custom Email Campaign');
  response = new MockResponse();
  await notificationRoutes.handleRequest({
    method: 'POST',
    url: '/notifications/campaigns',
    body: {
      name: 'Weekly Progress Report',
      campaignType: 'targeted',
      targetCount: 500,
      channels: ['email', 'push_notification'],
      scheduledAt: new Date(Date.now() + 86400000).toISOString()
    },
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  // Test 4: Get Notification Analytics
  console.log('\n📊 Test 4: Get Notification Analytics');
  response = new MockResponse();
  await notificationRoutes.handleRequest({
    method: 'GET',
    url: '/notifications/analytics',
    body: {
      analyticsType: 'detailed_analytics',
      dataRange: 'month'
    },
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  // Test 5: Get User Notifications
  console.log('\n📋 Test 5: Get User Notifications');
  response = new MockResponse();
  await notificationRoutes.handleRequest({
    method: 'GET',
    url: '/notifications',
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  // Test 6: Update Preferences
  console.log('\n⚙️ Test 6: Update Notification Preferences');
  response = new MockResponse();
  await notificationRoutes.handleRequest({
    method: 'PUT',
    url: '/notifications/preferences',
    body: {
      push_enabled: true,
      email_enabled: true,
      frequency: 'low',
      quiet_hours: {
        enabled: true,
        start: '22:00',
        end: '08:00'
      }
    },
    user: { id: 'test-user-123', tokens: 1000 }
  }, response);
  
  // Test 7: Health Check
  console.log('\n💚 Test 7: Health Check');
  response = new MockResponse();
  await notificationRoutes.handleRequest({
    method: 'GET',
    url: '/health'
  }, response);
  
  console.log('\n📋 Available Routes:');
  const routes = notificationRoutes.getAvailableRoutes();
  console.table(routes);
}

// Main application class
export class NotificationServiceApp {
  private routes: NotificationRoutes;
  
  constructor() {
    this.routes = notificationRoutes;
  }
  
  async handleRequest(req: any, res: any): Promise<void> {
    return this.routes.handleRequest(req, res);
  }
  
  getRoutes() {
    return this.routes.getAvailableRoutes();
  }
  
  async start(port: number = 3006): Promise<void> {
    console.log(`🔔 Notification Service started on port ${port}`);
    console.log('Features: Push Notifications, Email Campaigns, In-App Alerts, Analytics');
    
    await testNotificationService();
  }
}

// Export for use in other modules
export { NotificationService, NotificationTokenMiddleware, NotificationController, NotificationRoutes };

// Run if this file is executed directly
if (require.main === module) {
  const app = new NotificationServiceApp();
  app.start().catch(console.error);
}
