import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { ConversationManager } from './services/conversation-manager';
import { ProductionSpeechService } from './services/production-speech.service';
import { RealTimeVoiceChatService } from './services/real-time-voice-chat.service';
import { RealTimeStreamingService } from './services/real-time-streaming.service';
import { WebSocketServerService } from './services/websocket-server.service';
import { chatRoutes } from './routes/chat-routes';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3003;

// Create HTTP server for WebSocket support
const httpServer = createServer(app);

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' })); // Increased limit for audio data

// Initialize conversation manager
const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  logger.error('OPENAI_API_KEY is required');
  process.exit(1);
}

const conversationManager = new ConversationManager(openaiApiKey);

// Initialize production speech service
const productionSpeechService = new ProductionSpeechService(openaiApiKey);
logger.info('ProductionSpeechService initialized successfully');

// Initialize real-time voice chat service
const voiceChatService = new RealTimeVoiceChatService(
  productionSpeechService,
  conversationManager
);

// Initialize WebSocket streaming service
const streamingService = new RealTimeStreamingService(app, conversationManager);

// Initialize standard WebSocket server for /ai-chat endpoint
const webSocketServer = new WebSocketServerService(httpServer, conversationManager);

// Make services available to routes
app.locals.conversationManager = conversationManager;
app.locals.productionSpeechService = productionSpeechService;
app.locals.voiceChatService = voiceChatService;
app.locals.streamingService = streamingService;
app.locals.webSocketServer = webSocketServer;

logger.info('All services attached to app.locals', {
  hasConversationManager: !!app.locals.conversationManager,
  hasProductionSpeechService: !!app.locals.productionSpeechService,
  hasVoiceChatService: !!app.locals.voiceChatService,
  hasStreamingService: !!app.locals.streamingService,
  hasWebSocketServer: !!app.locals.webSocketServer
});

// Routes
app.use('/api/chat', chatRoutes);

// Health check
app.get('/health', (req: any, res: any) => {
  res.json({
    status: 'healthy',
    service: 'ai-chat-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    features: {
      speechToText: true,
      textToSpeech: true,
      realTimeVoiceChat: true,
      voiceChatSessions: voiceChatService.getActiveSessionsCount(),
      webSocketSessions: webSocketServer.getActiveSessionsCount()
    }
  });
});

// Error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req: any, res: any) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`
  });
});

// Cleanup inactive sessions every 30 minutes
setInterval(() => {
  conversationManager.cleanup();
  voiceChatService.cleanupInactiveSessions();
}, 30 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

httpServer.listen(PORT, () => {
  logger.info(`🚀 AI Chat Service with Voice Features running on port ${PORT}`);
  logger.info('Features enabled:', {
    speechToText: true,
    textToSpeech: true,
    realTimeVoiceChat: true,
    webSockets: true
  });
});
