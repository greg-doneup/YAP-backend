import { ChatSession } from '../types/chat-session';
import { logger } from '../utils/logger';

// Conditional Redis import to handle cases where redis is not available
let createClient: any;
let RedisClientType: any;

try {
  const redis = require('redis');
  createClient = redis.createClient;
  RedisClientType = redis.RedisClientType;
} catch (error) {
  logger.warn('Redis module not available, using memory storage only');
}

export class SessionStorageService {
  private redisClient: any;
  private isConnected: boolean = false;
  
  // Fallback to in-memory storage if Redis is not available
  private memoryStorage: Map<string, ChatSession> = new Map();
  private useRedis: boolean = false;

  constructor() {
    this.initializeRedis();
  }

  private async initializeRedis() {
    try {
      if (!createClient) {
        logger.warn('Redis not available, using memory storage');
        this.useRedis = false;
        return;
      }

      // Try to connect to Redis with environment variables or defaults
      const redisUrl = process.env.REDIS_URL || 
                      process.env.REDIS_CONNECTION_STRING || 
                      'redis://localhost:6379';
      
      this.redisClient = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 5000,
          lazyConnect: true
        }
      });

      this.redisClient.on('error', (err: Error) => {
        logger.warn('Redis client error:', err);
        this.isConnected = false;
        this.useRedis = false;
      });

      this.redisClient.on('connect', () => {
        logger.info('Connected to Redis for session storage');
        this.isConnected = true;
        this.useRedis = true;
      });

      this.redisClient.on('ready', () => {
        logger.info('Redis client ready');
        this.isConnected = true;
        this.useRedis = true;
      });

      // Try to connect
      await this.redisClient.connect();
      
    } catch (error) {
      logger.warn('Failed to connect to Redis, falling back to in-memory storage:', error);
      this.useRedis = false;
      this.isConnected = false;
    }
  }

  /**
   * Store a session
   */
  async setSession(sessionId: string, session: ChatSession): Promise<void> {
    try {
      if (this.useRedis && this.isConnected) {
        const sessionData = JSON.stringify(session);
        await this.redisClient.setEx(`session:${sessionId}`, 3600, sessionData); // 1 hour TTL
        logger.debug(`Session ${sessionId} stored in Redis`);
      } else {
        // Fallback to memory storage
        this.memoryStorage.set(sessionId, session);
        logger.debug(`Session ${sessionId} stored in memory`);
      }
    } catch (error) {
      logger.error(`Failed to store session ${sessionId}:`, error);
      // Always fallback to memory if Redis fails
      this.memoryStorage.set(sessionId, session);
    }
  }

  /**
   * Get a session
   */
  async getSession(sessionId: string): Promise<ChatSession | null> {
    try {
      if (this.useRedis && this.isConnected) {
        const sessionData = await this.redisClient.get(`session:${sessionId}`);
        if (sessionData) {
          const session = JSON.parse(sessionData) as ChatSession;
          logger.debug(`Session ${sessionId} retrieved from Redis`);
          return session;
        }
      } else {
        // Fallback to memory storage
        const session = this.memoryStorage.get(sessionId);
        if (session) {
          logger.debug(`Session ${sessionId} retrieved from memory`);
          return session;
        }
      }
      
      logger.debug(`Session ${sessionId} not found`);
      return null;
      
    } catch (error) {
      logger.error(`Failed to get session ${sessionId}:`, error);
      
      // Try memory storage as fallback
      const session = this.memoryStorage.get(sessionId);
      if (session) {
        logger.debug(`Session ${sessionId} retrieved from memory fallback`);
        return session;
      }
      
      return null;
    }
  }

  /**
   * Update a session
   */
  async updateSession(sessionId: string, session: ChatSession): Promise<void> {
    await this.setSession(sessionId, session);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      if (this.useRedis && this.isConnected) {
        await this.redisClient.del(`session:${sessionId}`);
        logger.debug(`Session ${sessionId} deleted from Redis`);
      } else {
        // Fallback to memory storage
        this.memoryStorage.delete(sessionId);
        logger.debug(`Session ${sessionId} deleted from memory`);
      }
    } catch (error) {
      logger.error(`Failed to delete session ${sessionId}:`, error);
      // Always try to delete from memory as fallback
      this.memoryStorage.delete(sessionId);
    }
  }

  /**
   * Get all session IDs (mainly for debugging)
   */
  async getAllSessionIds(): Promise<string[]> {
    try {
      if (this.useRedis && this.isConnected) {
        const keys = await this.redisClient.keys('session:*');
        return keys.map((key: string) => key.replace('session:', ''));
      } else {
        // Fallback to memory storage
        return Array.from(this.memoryStorage.keys());
      }
    } catch (error) {
      logger.error('Failed to get all session IDs:', error);
      return Array.from(this.memoryStorage.keys());
    }
  }

  /**
   * Check if session exists
   */
  async hasSession(sessionId: string): Promise<boolean> {
    try {
      if (this.useRedis && this.isConnected) {
        const exists = await this.redisClient.exists(`session:${sessionId}`);
        return exists === 1;
      } else {
        // Fallback to memory storage
        return this.memoryStorage.has(sessionId);
      }
    } catch (error) {
      logger.error(`Failed to check if session ${sessionId} exists:`, error);
      return this.memoryStorage.has(sessionId);
    }
  }

  /**
   * Clean up expired sessions (for memory storage)
   */
  async cleanupExpiredSessions(): Promise<void> {
    if (!this.useRedis) {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      for (const [sessionId, session] of this.memoryStorage.entries()) {
        if (session.lastActivity < oneHourAgo) {
          this.memoryStorage.delete(sessionId);
          logger.debug(`Expired session ${sessionId} removed from memory`);
        }
      }
    }
  }

  /**
   * Get storage type for debugging
   */
  getStorageType(): 'redis' | 'memory' {
    return this.useRedis ? 'redis' : 'memory';
  }

  /**
   * Get connection status
   */
  isRedisConnected(): boolean {
    return this.isConnected && this.useRedis;
  }

  /**
   * Cleanup and close connections
   */
  async cleanup(): Promise<void> {
    try {
      if (this.redisClient && this.isConnected) {
        await this.redisClient.quit();
        logger.info('Redis connection closed');
      }
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
    }
    
    this.memoryStorage.clear();
  }
}
