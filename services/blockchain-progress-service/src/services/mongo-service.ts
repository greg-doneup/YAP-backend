import { MongoClient, Db, Collection } from 'mongodb';
import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { ProgressDocument, BatchDocument, LessonProgressBatch } from '../types';

export class MongoService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private progressCollection: Collection<ProgressDocument> | null = null;
  private batchCollection: Collection<BatchDocument> | null = null;

  /**
   * Connect to MongoDB (lazy connection - only connects when needed)
   */
  private async ensureConnection(): Promise<boolean> {
    if (this.client && this.db) {
      return true; // Already connected
    }

    try {
      // Add connection options with timeouts
      const options = {
        serverSelectionTimeoutMS: 5000, // 5 seconds
        connectTimeoutMS: 10000, // 10 seconds
        socketTimeoutMS: 0, // Disable socket timeout
        maxPoolSize: 10,
        retryWrites: true,
        w: 'majority' as const
      };

      this.client = new MongoClient(config.mongoUrl, options);
      await this.client.connect();
      
      this.db = this.client.db();
      this.progressCollection = this.db.collection<ProgressDocument>('progress');
      this.batchCollection = this.db.collection<BatchDocument>('batches');
      
      // Create indexes for better performance
      await this.createIndexes();
      
      logger.info('Connected to MongoDB successfully');
      return true;
      
    } catch (error) {
      logger.warn('Failed to connect to MongoDB, operations will be skipped:', error);
      return false;
    }
  }

  /**
   * Connect to MongoDB (for backward compatibility - now just ensures connection)
   */
  async connect(): Promise<void> {
    await this.ensureConnection();
    // Don't throw errors anymore - just log and continue
  }

  /**
   * Create database indexes
   */
  private async createIndexes(): Promise<void> {
    try {
      if (!this.progressCollection || !this.batchCollection) {
        throw new Error('Collections not initialized');
      }

      // Progress collection indexes
      await this.progressCollection.createIndex({ userId: 1, lessonId: 1 });
      await this.progressCollection.createIndex({ status: 1 });
      await this.progressCollection.createIndex({ createdAt: 1 });
      await this.progressCollection.createIndex({ batchId: 1 });
      
      // Batch collection indexes
      await this.batchCollection.createIndex({ batchId: 1 }, { unique: true });
      await this.batchCollection.createIndex({ status: 1 });
      await this.batchCollection.createIndex({ createdAt: 1 });
      
      logger.info('Database indexes created successfully');
      
    } catch (error) {
      logger.error('Error creating database indexes:', error);
      // Don't throw here - indexes are for performance, not functionality
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.progressCollection = null;
      this.batchCollection = null;
      logger.info('Disconnected from MongoDB');
    }
  }

  /**
   * Store a new progress signature
   */
  async storeProgress(progress: Omit<ProgressDocument, '_id' | 'createdAt' | 'updatedAt'>): Promise<string | null> {
    const connected = await this.ensureConnection();
    if (!connected || !this.progressCollection) {
      logger.warn('MongoDB not available, skipping progress storage');
      return null;
    }

    try {
      const document: ProgressDocument = {
        ...progress,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await this.progressCollection.insertOne(document);
      logger.info(`Stored progress for user ${progress.userId}, lesson ${progress.lessonId}`);
      
      return result.insertedId.toString();
    } catch (error) {
      logger.error('Error storing progress:', error);
      return null;
    }
  }

  /**
   * Get pending progress records for batching
   */
  async getPendingProgress(limit: number = 100): Promise<ProgressDocument[]> {
    const connected = await this.ensureConnection();
    if (!connected || !this.progressCollection) {
      logger.warn('MongoDB not available, returning empty progress list');
      return [];
    }

    try {
      const progress = await this.progressCollection
        .find({ status: 'signed' })
        .sort({ createdAt: 1 })
        .limit(limit)
        .toArray();

      logger.info(`Retrieved ${progress.length} pending progress records`);
      return progress;
    } catch (error) {
      logger.error('Error getting pending progress:', error);
      return [];
    }
  }

  /**
   * Mark progress records as batched
   */
  async markProgressAsBatched(progressIds: string[], batchId: string): Promise<void> {
    const connected = await this.ensureConnection();
    if (!connected || !this.progressCollection) {
      logger.warn('MongoDB not available, skipping batch marking');
      return;
    }

    try {
      const objectIds = progressIds.map(id => id);
      
      await this.progressCollection.updateMany(
        { _id: { $in: objectIds } },
        { 
          $set: { 
            status: 'batched', 
            batchId,
            updatedAt: new Date() 
          } 
        }
      );

      logger.info(`Marked ${progressIds.length} progress records as batched with batch ${batchId}`);
    } catch (error) {
      logger.error('Error marking progress as batched:', error);
    }
  }

  /**
   * Mark progress records as processed
   */
  async markProgressAsProcessed(batchId: string, txHash: string): Promise<void> {
    const connected = await this.ensureConnection();
    if (!connected || !this.progressCollection) {
      logger.warn('MongoDB not available, skipping processed marking');
      return;
    }

    try {
      await this.progressCollection.updateMany(
        { batchId },
        { 
          $set: { 
            status: 'processed', 
            txHash,
            updatedAt: new Date() 
          } 
        }
      );

      logger.info(`Marked progress records in batch ${batchId} as processed with txHash ${txHash}`);
    } catch (error) {
      logger.error('Error marking progress as processed:', error);
    }
  }

  /**
   * Mark a progress record as failed
   */
  async markProgressAsFailed(progressId: string, errorMessage: string): Promise<void> {
    const connected = await this.ensureConnection();
    if (!connected || !this.progressCollection) {
      logger.warn('MongoDB not available, skipping failed marking');
      return;
    }

    try {
      await this.progressCollection.updateOne(
        { _id: progressId },
        { 
          $set: { 
            status: 'failed',
            errorMessage,
            updatedAt: new Date() 
          },
          $inc: { retryCount: 1 }
        }
      );

      logger.warn(`Marked progress ${progressId} as failed: ${errorMessage}`);
    } catch (error) {
      logger.error('Error marking progress as failed:', error);
    }
  }

  /**
   * Create a new batch record
   */
  async createBatch(batch: LessonProgressBatch): Promise<void> {
    const connected = await this.ensureConnection();
    if (!connected || !this.batchCollection) {
      logger.warn('MongoDB not available, skipping batch creation');
      return;
    }

    try {
      const document: BatchDocument = {
        batchId: batch.batchId,
        status: batch.status,
        progressIds: [], // This would need to be populated with actual progress IDs
        createdAt: batch.createdAt
      };

      await this.batchCollection.insertOne(document);
      logger.info(`Created batch record ${batch.batchId}`);
    } catch (error) {
      logger.error('Error creating batch:', error);
    }
  }

  /**
   * Complete a batch after successful blockchain submission
   */
  async completeBatch(batchId: string, txHash: string): Promise<void> {
    const connected = await this.ensureConnection();
    if (!connected || !this.batchCollection) {
      logger.warn('MongoDB not available, skipping batch completion');
      return;
    }

    try {
      await this.batchCollection.updateOne(
        { batchId },
        { 
          $set: { 
            status: 'completed',
            txHash,
            processedAt: new Date()
          } 
        }
      );

      logger.info(`Completed batch ${batchId} with txHash ${txHash}`);
    } catch (error) {
      logger.error('Error completing batch:', error);
    }
  }

  /**
   * Mark a batch as failed
   */
  async failBatch(batchId: string, errorMessage: string): Promise<void> {
    const connected = await this.ensureConnection();
    if (!connected || !this.batchCollection) {
      logger.warn('MongoDB not available, skipping batch failure marking');
      return;
    }

    try {
      await this.batchCollection.updateOne(
        { batchId },
        { 
          $set: { 
            status: 'failed',
            errorMessage,
            processedAt: new Date()
          } 
        }
      );

      logger.error(`Failed batch ${batchId}: ${errorMessage}`);
    } catch (error) {
      logger.error('Error marking batch as failed:', error);
    }
  }

  /**
   * Get batch by ID
   */
  async getBatch(batchId: string): Promise<BatchDocument | null> {
    const connected = await this.ensureConnection();
    if (!connected || !this.batchCollection) {
      logger.warn('MongoDB not available, returning null for batch lookup');
      return null;
    }

    try {
      return await this.batchCollection.findOne({ batchId });
    } catch (error) {
      logger.error('Error getting batch:', error);
      return null;
    }
  }

  /**
   * Get progress records by batch ID
   */
  async getProgressByBatch(batchId: string): Promise<ProgressDocument[]> {
    const connected = await this.ensureConnection();
    if (!connected || !this.progressCollection) {
      logger.warn('MongoDB not available, returning empty progress list for batch');
      return [];
    }

    try {
      return await this.progressCollection.find({ batchId }).toArray();
    } catch (error) {
      logger.error('Error getting progress by batch:', error);
      return [];
    }
  }

  /**
   * Get processing statistics
   */
  async getStats(): Promise<{
    pending: number;
    signed: number;
    batched: number;
    processed: number;
    failed: number;
  }> {
    const connected = await this.ensureConnection();
    if (!connected || !this.progressCollection) {
      logger.warn('MongoDB not available, returning zero stats');
      return { pending: 0, signed: 0, batched: 0, processed: 0, failed: 0 };
    }

    try {
      const [pending, signed, batched, processed, failed] = await Promise.all([
        this.progressCollection.countDocuments({ status: 'pending' }),
        this.progressCollection.countDocuments({ status: 'signed' }),
        this.progressCollection.countDocuments({ status: 'batched' }),
        this.progressCollection.countDocuments({ status: 'processed' }),
        this.progressCollection.countDocuments({ status: 'failed' })
      ]);

      return { pending, signed, batched, processed, failed };
    } catch (error) {
      logger.error('Error getting stats:', error);
      return { pending: 0, signed: 0, batched: 0, processed: 0, failed: 0 };
    }
  }
}
