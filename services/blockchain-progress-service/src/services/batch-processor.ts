import { logger } from '../utils/logger';
import { config } from '../config/environment';
import { LessonProgressBatch, LessonProgressSignature, ProgressDocument, BatchDocument } from '../types';
import { BlockchainProgressService } from './blockchain-progress-service';
import { MongoService } from './mongo-service';
import cron from 'node-cron';

export class BatchProcessor {
  private blockchainService: BlockchainProgressService;
  private mongoService: MongoService;
  private isProcessing = false;
  private cronJob: cron.ScheduledTask | null = null;

  constructor(blockchainService: BlockchainProgressService) {
    this.blockchainService = blockchainService;
    this.mongoService = new MongoService();
  }

  /**
   * Start the batch processing scheduler
   */
  async start(): Promise<void> {
    try {
      await this.mongoService.connect();
      
      // Schedule batch processing every X minutes
      const cronExpression = `*/${config.batchIntervalMinutes} * * * *`;
      
      this.cronJob = cron.schedule(cronExpression, async () => {
        if (!this.isProcessing) {
          await this.processPendingBatches();
        }
      });

      logger.info(`Batch processor started with ${config.batchIntervalMinutes} minute intervals`);
      
    } catch (error) {
      logger.error('Failed to start batch processor:', error);
      throw error;
    }
  }

  /**
   * Stop the batch processing scheduler
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Batch processor stopped');
    }
  }

  /**
   * Process all pending progress signatures into batches and submit to blockchain
   */
  async processPendingBatches(): Promise<void> {
    if (this.isProcessing) {
      logger.warn('Batch processing already in progress, skipping');
      return;
    }

    this.isProcessing = true;
    logger.info('Starting batch processing cycle');

    try {
      // Get pending progress records
      const pendingProgress = await this.mongoService.getPendingProgress(config.batchSizeLimit);
      
      if (pendingProgress.length === 0) {
        logger.info('No pending progress to process');
        return;
      }

      logger.info(`Processing ${pendingProgress.length} pending progress records`);

      // Verify all signatures before batching
      const validProgress = await this.verifyProgressSignatures(pendingProgress);
      
      if (validProgress.length === 0) {
        logger.warn('No valid signatures found in pending progress');
        return;
      }

      // Create batch
      const batch = await this.createBatch(validProgress);
      
      // Sign the batch with company signature
      const companySignature = await this.blockchainService.signBatch(batch);
      
      // Submit to blockchain
      const txHash = await this.blockchainService.submitBatch(batch, companySignature);
      
      // Update database with successful batch processing
      await this.completeBatch(batch, txHash);
      
      logger.info(`Batch ${batch.batchId} processed successfully. TxHash: ${txHash}`);
      
    } catch (error) {
      logger.error('Error processing batches:', error);
      // Mark failed batches appropriately
      await this.handleBatchError(error);
      
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Verify all progress signatures before batching
   */
  private async verifyProgressSignatures(progressList: ProgressDocument[]): Promise<ProgressDocument[]> {
    const validProgress: ProgressDocument[] = [];
    
    for (const progress of progressList) {
      try {
        // Convert ProgressDocument to LessonProgressSignature for verification
        const signatureData: LessonProgressSignature = {
          userId: progress.userId,
          walletAddress: progress.walletAddress,
          lessonId: progress.lessonId,
          cefrLevel: progress.cefrLevel,
          language: progress.language,
          completionTimestamp: progress.completionTimestamp,
          accuracyScore: progress.accuracyScore,
          pronunciationScore: progress.pronunciationScore,
          grammarScore: progress.grammarScore,
          vocabularyMastered: progress.vocabularyMastered,
          timeSpent: progress.timeSpent,
          attemptsCount: progress.attemptsCount,
          hintsUsed: progress.hintsUsed,
          blockTimestamp: progress.blockTimestamp,
          nonce: progress.nonce,
          signature: progress.signature
        };

        const isValid = await this.blockchainService.verifyUserSignature(signatureData);
        
        if (isValid) {
          validProgress.push(progress);
        } else {
          logger.warn(`Invalid signature for progress ${progress._id}, marking as failed`);
          await this.mongoService.markProgressAsFailed(progress._id!, 'Invalid signature');
        }
        
      } catch (error) {
        logger.error(`Error verifying signature for progress ${progress._id}:`, error);
        await this.mongoService.markProgressAsFailed(progress._id!, 'Signature verification error');
      }
    }

    logger.info(`${validProgress.length}/${progressList.length} signatures verified successfully`);
    return validProgress;
  }

  /**
   * Create a batch from verified progress records
   */
  private async createBatch(progressList: ProgressDocument[]): Promise<LessonProgressBatch> {
    const batchId = this.generateBatchId();
    
    const batch: LessonProgressBatch = {
      batchId,
      status: 'pending',
      progressUpdates: progressList.map(progress => ({
        userId: progress.userId,
        lessonId: progress.lessonId,
        score: progress.accuracyScore, // Using accuracy as primary score
        completedAt: new Date(progress.completionTimestamp * 1000),
        signature: progress.signature!
      })),
      createdAt: new Date()
    };

    // Save batch to database
    await this.mongoService.createBatch(batch);
    
    // Mark progress records as batched
    const progressIds = progressList.map(p => p._id!);
    await this.mongoService.markProgressAsBatched(progressIds, batchId);
    
    logger.info(`Created batch ${batchId} with ${batch.progressUpdates.length} updates`);
    return batch;
  }

  /**
   * Complete batch processing after successful blockchain submission
   */
  private async completeBatch(batch: LessonProgressBatch, txHash: string): Promise<void> {
    try {
      // Update batch status
      await this.mongoService.completeBatch(batch.batchId, txHash);
      
      // Mark all progress records as processed
      const progressIds = batch.progressUpdates.map(update => 
        // We'll need to get the progress IDs from the database
        // This is a simplified approach - in practice, you'd track the mapping
        update.userId + '_' + update.lessonId
      );
      
      await this.mongoService.markProgressAsProcessed(batch.batchId, txHash);
      
      logger.info(`Batch ${batch.batchId} marked as completed with txHash ${txHash}`);
      
    } catch (error) {
      logger.error(`Error completing batch ${batch.batchId}:`, error);
      throw error;
    }
  }

  /**
   * Handle batch processing errors
   */
  private async handleBatchError(error: any): Promise<void> {
    try {
      // This is a simplified error handler
      // In practice, you'd identify specific batches and handle retries
      logger.error('Implementing batch error handling:', error);
      
      // Could implement retry logic here based on error type
      
    } catch (handlerError) {
      logger.error('Error in batch error handler:', handlerError);
    }
  }

  /**
   * Generate a unique batch ID
   */
  private generateBatchId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `batch_${timestamp}_${random}`;
  }

  /**
   * Manual batch processing trigger (for testing/admin purposes)
   */
  async processNow(): Promise<{ success: boolean; batchId?: string; error?: string }> {
    try {
      await this.processPendingBatches();
      return { success: true };
      
    } catch (error) {
      logger.error('Manual batch processing failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get batch processing status
   */
  getStatus(): {
    isProcessing: boolean;
    isScheduled: boolean;
    nextRun?: Date;
  } {
    return {
      isProcessing: this.isProcessing,
      isScheduled: this.cronJob !== null,
      // Note: node-cron doesn't provide easy access to next run time
      // This would need additional logic to calculate
    };
  }
}
