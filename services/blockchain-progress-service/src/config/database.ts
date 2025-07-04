import { MongoClient } from 'mongodb';
import { config } from './environment';
import { logger } from '../utils/logger';

let client: MongoClient | null = null;

export async function connectDatabase(): Promise<MongoClient> {
  try {
    if (client) {
      return client;
    }

    // Add connection options with timeouts
    const options = {
      serverSelectionTimeoutMS: 5000, // 5 seconds
      connectTimeoutMS: 10000, // 10 seconds
      socketTimeoutMS: 0, // Disable socket timeout
      maxPoolSize: 10,
      retryWrites: true,
      w: 'majority' as const
    };

    logger.info(`Connecting to MongoDB: ${config.mongoUrl.replace(/\/\/.*@/, '//***@')}`);
    client = new MongoClient(config.mongoUrl, options);
    await client.connect();
    
    logger.info('Connected to MongoDB successfully');
    return client;
    
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    logger.info('Disconnected from MongoDB');
  }
}

export function getDatabase() {
  if (!client) {
    throw new Error('Database not connected');
  }
  return client.db();
}
