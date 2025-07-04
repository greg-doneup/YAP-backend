/**
 * AI Chat Controller
 * 
 * Handles AI text chat endpoints with token integration:
 * - Text message processing with daily allowance tracking
 * - Unlimited hour pass purchase and management
 * - Conversation management and history
 * - Token-based model access
 */

import { Request, Response } from 'express';
import { AITokenMiddleware } from '../middleware/ai-token';
import { TextChatHandler } from '../services/text-chat-handler';
import { GPTIntegration } from '../services/gpt-integration';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    address?: string;
  };
  tokenValidation?: {
    canProcess: boolean;
    requiresTokens: boolean;
    tokenCost: number;
    allowanceRemaining: number;
    reason: string;
    unlimitedUntil?: Date;
  };
}

interface ChatMessageRequest {
  message: string;
  conversationId?: string;
  modelType?: 'gpt-3.5' | 'gpt-4' | 'claude' | 'basic';
  language?: string;
  context?: string;
  requestUnlimitedHour?: boolean;
}

export class AIChatController {
  private tokenMiddleware: AITokenMiddleware;
  private textChatHandler: TextChatHandler;
  private gptIntegration: GPTIntegration;

  constructor() {
    this.tokenMiddleware = new AITokenMiddleware();
    this.textChatHandler = new TextChatHandler();
    this.gptIntegration = new GPTIntegration();
  }

  /**
   * Send text message to AI with token validation
   */
  public sendMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const validation = req.tokenValidation;
      const { 
        message, 
        conversationId, 
        modelType = 'gpt-3.5', 
        language = 'en',
        context 
      } = req.body as ChatMessageRequest;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!validation?.canProcess) {
        res.status(402).json({ 
          error: 'Payment required',
          reason: validation?.reason || 'Token validation failed',
          tokenCost: validation?.tokenCost || 0
        });
        return;
      }

      console.log(`[AI-CHAT] Processing message for user ${userId}, model: ${modelType}`);

      // Process the message through the AI service
      const chatResponse = await this.textChatHandler.processMessage({
        userId,
        message,
        conversationId,
        modelType,
        language,
        context,
        tokenCost: validation.tokenCost,
        unlimitedActive: !!validation.unlimitedUntil
      });

      // Record transaction if tokens were spent
      if (validation.requiresTokens && validation.tokenCost > 0) {
        await this.recordChatTransaction(userId, {
          tokenCost: validation.tokenCost,
          messageLength: message.length,
          modelType,
          conversationId: chatResponse.conversationId,
          messageId: chatResponse.messageId
        });
      }

      res.json({
        success: true,
        response: chatResponse.aiResponse,
        conversationId: chatResponse.conversationId,
        messageId: chatResponse.messageId,
        tokensSpent: validation.tokenCost,
        allowanceRemaining: validation.allowanceRemaining,
        unlimitedUntil: validation.unlimitedUntil,
        metadata: {
          modelUsed: chatResponse.modelUsed,
          processingTime: chatResponse.processingTime,
          wordCount: chatResponse.wordCount
        }
      });

    } catch (error) {
      console.error('[AI-CHAT] Error processing message:', error);
      res.status(500).json({ 
        error: 'Failed to process message',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Purchase unlimited hour pass
   */
  public purchaseUnlimitedHour = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const validation = req.tokenValidation;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!validation?.canProcess) {
        res.status(402).json({ 
          error: 'Insufficient tokens',
          reason: validation?.reason || 'Token validation failed',
          tokenCost: validation?.tokenCost || 2,
          required: 2
        });
        return;
      }

      console.log(`[AI-CHAT] Processing unlimited hour purchase for user ${userId}`);

      // The token spending is handled by the middleware
      // Here we just confirm the purchase and return the status
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      res.json({
        success: true,
        unlimitedActive: true,
        expiresAt: expiresAt.toISOString(),
        tokensSpent: validation.tokenCost,
        message: 'Unlimited hour pass activated'
      });

    } catch (error) {
      console.error('[AI-CHAT] Error purchasing unlimited hour:', error);
      res.status(500).json({ 
        error: 'Failed to purchase unlimited hour',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Get conversation history
   */
  public getConversationHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { conversationId, limit = 50, offset = 0 } = req.query;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const history = await this.textChatHandler.getConversationHistory({
        userId,
        conversationId: conversationId as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      });

      res.json({
        success: true,
        conversations: history.conversations,
        totalMessages: history.totalMessages,
        hasMore: history.hasMore
      });

    } catch (error) {
      console.error('[AI-CHAT] Error getting conversation history:', error);
      res.status(500).json({ 
        error: 'Failed to get conversation history',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Get user's text chat status and allowances
   */
  public getChatStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await this.tokenMiddleware.getTextChatStatus(req, res);
    } catch (error) {
      console.error('[AI-CHAT] Error getting chat status:', error);
      res.status(500).json({ 
        error: 'Failed to get chat status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Get available AI models and their costs
   */
  public getAvailableModels = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const models = await this.gptIntegration.getAvailableModels();

      res.json({
        success: true,
        models: models.map(model => ({
          id: model.id,
          name: model.name,
          description: model.description,
          tokenCostMultiplier: model.tokenCostMultiplier,
          available: model.available,
          features: model.features
        }))
      });

    } catch (error) {
      console.error('[AI-CHAT] Error getting available models:', error);
      res.status(500).json({ 
        error: 'Failed to get available models',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Delete conversation
   */
  public deleteConversation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { conversationId } = req.params;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!conversationId) {
        res.status(400).json({ error: 'Conversation ID required' });
        return;
      }

      const success = await this.textChatHandler.deleteConversation(userId, conversationId);

      if (success) {
        res.json({ success: true, message: 'Conversation deleted' });
      } else {
        res.status(404).json({ error: 'Conversation not found' });
      }

    } catch (error) {
      console.error('[AI-CHAT] Error deleting conversation:', error);
      res.status(500).json({ 
        error: 'Failed to delete conversation',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Record chat transaction for analytics
   */
  private async recordChatTransaction(userId: string, data: {
    tokenCost: number;
    messageLength: number;
    modelType: string;
    conversationId?: string;
    messageId?: string;
  }): Promise<void> {
    try {
      // This would typically call the shared transaction service
      console.log(`[AI-CHAT] Recording transaction for user ${userId}:`, {
        feature: 'AI text chat',
        tokensSpent: data.tokenCost,
        messageLength: data.messageLength,
        modelType: data.modelType,
        conversationId: data.conversationId,
        messageId: data.messageId,
        timestamp: new Date().toISOString()
      });

      // In a real implementation, this would make an API call to the shared service
      // await axios.post(`${sharedServiceUrl}/transactions/record`, transactionData);

    } catch (error) {
      console.error('[AI-CHAT] Error recording transaction:', error);
      // Don't throw here - transaction recording failure shouldn't fail the chat
    }
  }
}

export default AIChatController;
