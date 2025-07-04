import { createClient, RedisClientType } from 'redis';
import { config } from './environment';
import { logger } from '../utils/logger';

let client: RedisClientType | null = null;

export async function connectRedis(): Promise<RedisClientType> {
  try {
    if (client) {
      return client;
    }

    client = createClient({
      url: config.redisUrl,
      socket: {
        connectTimeout: 5000, // 5 second timeout
        reconnectStrategy: () => false // Don't retry connections
      }
    });

    client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
      logger.info('Connected to Redis');
    });

    await client.connect();
    
    logger.info('Redis connection established successfully');
    return client;
    
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
    logger.info('Disconnected from Redis');
  }
}

export function getRedisClient(): RedisClientType {
  if (!client) {
    throw new Error('Redis not connected');
  }
  return client;
}
