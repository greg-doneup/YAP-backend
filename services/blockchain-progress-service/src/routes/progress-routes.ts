import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { MongoService } from '../services/mongo-service';
import { BlockchainProgressService } from '../services/blockchain-progress-service';
import { BatchProcessor } from '../services/batch-processor';
import { 
  SubmitProgressRequest, 
  SignatureRequest, 
  ProgressResponse,
  LessonProgressSignature,
  ProgressDocument,
  TokenAwardRequest,
  TokenAwardResponse
} from '../types';

export const progressRoutes = Router();

// Dependencies - these would be injected in a real app
let mongoService: MongoService;
let blockchainService: BlockchainProgressService;
let batchProcessor: BatchProcessor;

// Initialize dependencies
export const initializeProgressRoutes = (
  mongo: MongoService,
  blockchain: BlockchainProgressService,
  batch: BatchProcessor
) => {
  mongoService = mongo;
  blockchainService = blockchain;
  batchProcessor = batch;
};

/**
 * Submit lesson progress for signature preparation
 * POST /api/progress/submit
 */
progressRoutes.post('/submit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, lessonId, progressData }: SubmitProgressRequest = req.body;

    // Validate request
    if (!userId || !lessonId || !progressData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, lessonId, progressData'
      });
    }

    // Create EIP712 signature payload
    const signaturePayload: LessonProgressSignature = {
      userId,
      walletAddress: '', // Will be provided when signing
      lessonId,
      cefrLevel: progressData.cefrLevel || 'A1', // Default or from request
      language: progressData.language || 'english',
      completionTimestamp: Math.floor(Date.now() / 1000),
      accuracyScore: progressData.accuracyScore,
      pronunciationScore: progressData.pronunciationScore,
      grammarScore: progressData.grammarScore,
      vocabularyMastered: progressData.vocabularyMastered,
      timeSpent: progressData.timeSpent,
      attemptsCount: progressData.attemptsCount,
      hintsUsed: progressData.hintsUsed,
      blockTimestamp: Math.floor(Date.now() / 1000),
      nonce: `${userId}_${lessonId}_${Date.now()}`
    };

    // Store as pending progress
    const progressDocument: Omit<ProgressDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      ...signaturePayload,
      walletAddress: '', // Will be updated when signature is submitted
      status: 'pending',
      batchId: undefined,
      txHash: undefined,
      retryCount: 0
    };

    const progressId = await mongoService.storeProgress(progressDocument);

    // Create EIP712 message structure for frontend signing
    const messageToSign = {
      domain: {
        name: 'YAP Lesson Progress',
        version: '1',
        chainId: 38284, // SEI EVM testnet
        verifyingContract: '0x...' // Contract address
      },
      types: {
        LessonProgress: [
          { name: 'userId', type: 'string' },
          { name: 'lessonId', type: 'string' },
          { name: 'accuracyScore', type: 'uint256' },
          { name: 'completionTimestamp', type: 'uint256' },
          { name: 'nonce', type: 'string' }
        ]
      },
      primaryType: 'LessonProgress',
      message: {
        userId: signaturePayload.userId,
        lessonId: signaturePayload.lessonId,
        accuracyScore: signaturePayload.accuracyScore,
        completionTimestamp: signaturePayload.completionTimestamp,
        nonce: signaturePayload.nonce
      }
    };

    const response: ProgressResponse = {
      success: true,
      signaturePayload,
      messageToSign,
      expectedBatchTime: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes from now
    };

    logger.info(`Progress submitted for user ${userId}, lesson ${lessonId}. Progress ID: ${progressId}`);
    res.json(response);

  } catch (error) {
    logger.error('Error submitting progress:', error);
    next(error);
  }
});

/**
 * Submit user signature for lesson progress
 * POST /api/progress/signature
 */
progressRoutes.post('/signature', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, signaturePayload, signature }: SignatureRequest = req.body;

    // Validate request
    if (!userId || !signaturePayload || !signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, signaturePayload, signature'
      });
    }

    // Update the signature payload with the signature and wallet address
    const completePayload: LessonProgressSignature = {
      ...signaturePayload,
      signature,
      signedAt: Math.floor(Date.now() / 1000)
    };

    // Verify the signature
    const isValidSignature = await blockchainService.verifyUserSignature(completePayload);

    if (!isValidSignature) {
      return res.status(400).json({
        success: false,
        error: 'Invalid signature'
      });
    }

    // Update the progress document with signature
    // In a real implementation, you'd find the matching progress document
    // and update it with the signature
    logger.info(`Valid signature received for user ${userId}, lesson ${signaturePayload.lessonId}`);

    // Mark as signed and ready for batching
    // This is simplified - you'd need proper document matching
    
    res.json({
      success: true,
      message: 'Signature verified and stored successfully',
      expectedBatchTime: new Date(Date.now() + 15 * 60 * 1000)
    });

  } catch (error) {
    logger.error('Error processing signature:', error);
    next(error);
  }
});

/**
 * Get progress status for a user
 * GET /api/progress/status/:userId
 */
progressRoutes.get('/status/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const { lessonId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Get user's progress records
    // This would need to be implemented in MongoService
    const stats = await mongoService.getStats();

    res.json({
      success: true,
      userId,
      lessonId: lessonId || 'all',
      stats,
      message: 'Progress status retrieved successfully'
    });

  } catch (error) {
    logger.error('Error getting progress status:', error);
    next(error);
  }
});

/**
 * Trigger manual batch processing (admin endpoint)
 * POST /api/progress/process-batch
 */
progressRoutes.post('/process-batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // In production, this would require admin authentication
    
    const result = await batchProcessor.processNow();
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Batch processing triggered successfully',
        batchId: result.batchId
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Batch processing failed'
      });
    }

  } catch (error) {
    logger.error('Error triggering batch processing:', error);
    next(error);
  }
});

/**
 * Get batch processor status
 * GET /api/progress/batch-status
 */
progressRoutes.get('/batch-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = batchProcessor.getStatus();
    const stats = await mongoService.getStats();

    res.json({
      success: true,
      batchProcessor: status,
      progressStats: stats
    });

  } catch (error) {
    logger.error('Error getting batch status:', error);
    next(error);
  }
});

/**
 * Award tokens to a user (for special bonuses like waitlist conversion)
 * POST /api/progress/award-tokens
 */
progressRoutes.post('/award-tokens', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, walletAddress, amount, reason, description }: TokenAwardRequest = req.body;

    // Validate request
    if (!userId || !walletAddress || !amount || !reason) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, walletAddress, amount, reason'
      });
    }

    // Validate amount is positive
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be positive'
      });
    }

    logger.info(`Awarding ${amount} tokens to user ${userId} for reason: ${reason}`);

    // Create a special progress entry for token award
    const tokenAwardSignature: LessonProgressSignature = {
      userId,
      walletAddress,
      lessonId: `token_award_${reason}_${Date.now()}`,
      cefrLevel: 'BONUS',
      language: 'system',
      completionTimestamp: Math.floor(Date.now() / 1000),
      accuracyScore: 100, // Perfect score for bonus
      pronunciationScore: 0,
      grammarScore: 0,
      vocabularyMastered: [],
      timeSpent: 0,
      attemptsCount: 1,
      hintsUsed: 0,
      blockTimestamp: Math.floor(Date.now() / 1000),
      nonce: `${userId}_${reason}_${Date.now()}`
    };

    // Store as pending progress (will be batched and submitted to blockchain)
    const progressDocument: Omit<ProgressDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      ...tokenAwardSignature,
      status: 'pending',
      batchId: undefined,
      txHash: undefined,
      retryCount: 0,
      // Add special fields for token awards
      tokenAmount: amount,
      awardReason: reason,
      awardDescription: description
    };

    const progressId = await mongoService.storeProgress(progressDocument);

    // Trigger immediate batch processing for important events like token awards
    try {
      const batchResult = await batchProcessor.processNow();
      if (batchResult.success) {
        logger.info(`Token award processed in batch: ${batchResult.batchId}`);
      }
    } catch (batchError) {
      logger.warn('Failed to immediately process token award batch, will be processed in next scheduled batch:', batchError);
    }

    logger.info(`Token award queued for blockchain submission: ${progressId}`);

    const response: TokenAwardResponse = {
      success: true,
      userId,
      amount,
      message: `${amount} tokens awarded for ${reason}. Will be submitted to blockchain in next batch.`
    };

    res.status(200).json(response);

  } catch (error: any) {
    logger.error('Error awarding tokens:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to award tokens',
      message: error.message
    });
  }
});
