/**
 * AI Service Routes
 * 
 * Express routes for AI text chat functionality with token integration:
 * - Text chat endpoints with allowance validation
 * - Unlimited hour pass management
 * - Conversation history and management
 * - Model availability and status endpoints
 */

import { Router } from 'express';
import AIChatController from '../controllers/ai-chat-controller';
import { AITokenMiddleware } from '../middleware/ai-token';

const router = Router();
const chatController = new AIChatController();
const tokenMiddleware = new AITokenMiddleware();

// Chat endpoints
router.post('/chat/message', 
  tokenMiddleware.validateTextChatAllowance,
  tokenMiddleware.processTextChatSpending,
  chatController.sendMessage
);

router.post('/chat/unlimited-hour',
  tokenMiddleware.validateTextChatAllowance,
  tokenMiddleware.processTextChatSpending,
  chatController.purchaseUnlimitedHour
);

router.get('/chat/status',
  chatController.getChatStatus
);

router.get('/chat/history',
  chatController.getConversationHistory
);

router.delete('/chat/conversation/:conversationId',
  chatController.deleteConversation
);

// Model management
router.get('/models',
  chatController.getAvailableModels
);

// Health check
router.get('/health', (req, res) => {
  res.json({
    service: 'AI Service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    features: [
      'Text chat with daily allowances',
      'Unlimited hour passes',
      'Multiple AI models',
      'Conversation management',
      'Token-based pricing'
    ]
  });
});

export default router;
