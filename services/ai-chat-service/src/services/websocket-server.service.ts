import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { logger } from '../utils/logger';
import { ConversationManager } from './conversation-manager';

export interface WebSocketSession {
  userId?: string;
  sessionId?: string;
  language?: string;
  cefrLevel?: string;
  conversationMode?: 'guided' | 'free' | 'scenario';
  isActive: boolean;
  lastActivity: Date;
}

export class WebSocketServerService {
  private wss: WebSocket.Server;
  private sessions: Map<WebSocket, WebSocketSession> = new Map();
  private conversationManager: ConversationManager;

  constructor(server: any, conversationManager: ConversationManager) {
    this.conversationManager = conversationManager;
    
    // Create WebSocket server that handles upgrade requests for /ai-chat path
    this.wss = new WebSocket.Server({
      server,
      path: '/ai-chat',
      verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage }) => {
        // Basic verification - you can add more security checks here
        return true;
      }
    });

    this.setupConnectionHandlers();
    this.startCleanupInterval();
    
    logger.info('WebSocket server initialized for /ai-chat path');
  }

  private setupConnectionHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      logger.info(`WebSocket client connected from ${req.socket.remoteAddress}`);
      
      // Initialize session
      const session: WebSocketSession = {
        isActive: true,
        lastActivity: new Date()
      };
      this.sessions.set(ws, session);

      // Send welcome message
      this.sendMessage(ws, {
        type: 'connection',
        data: { status: 'connected', message: 'Welcome to YAP AI Chat' },
        timestamp: Date.now()
      });

      // Handle incoming messages
      ws.on('message', async (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleMessage(ws, message);
          
          // Update activity
          const session = this.sessions.get(ws);
          if (session) {
            session.lastActivity = new Date();
          }
        } catch (error) {
          logger.error('Error handling WebSocket message:', error);
          this.sendMessage(ws, {
            type: 'error',
            data: { message: 'Invalid message format' },
            timestamp: Date.now()
          });
        }
      });

      // Handle connection close
      ws.on('close', (code: number, reason: Buffer) => {
        logger.info(`WebSocket client disconnected: ${code} - ${reason.toString()}`);
        this.cleanupSession(ws);
      });

      // Handle errors
      ws.on('error', (error: Error) => {
        logger.error('WebSocket error:', error);
        this.cleanupSession(ws);
      });
    });
  }

  private async handleMessage(ws: WebSocket, message: any): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session) return;

    switch (message.type) {
      case 'start_session':
        await this.handleStartSession(ws, message.data);
        break;
      
      case 'send_message':
        await this.handleSendMessage(ws, message.data);
        break;
      
      case 'end_session':
        await this.handleEndSession(ws);
        break;
      
      default:
        this.sendMessage(ws, {
          type: 'error',
          data: { message: `Unknown message type: ${message.type}` },
          timestamp: Date.now()
        });
    }
  }

  private async handleStartSession(ws: WebSocket, data: any): Promise<void> {
    try {
      const { userId, language, cefrLevel, conversationMode, scenario } = data;
      
      // Start chat session with conversation manager
      const chatSession = await this.conversationManager.startChatSession(
        userId,
        language || 'en',
        cefrLevel || 'B1',
        conversationMode || 'free',
        scenario
      );

      // Update session
      const session = this.sessions.get(ws);
      if (session) {
        session.userId = userId;
        session.sessionId = chatSession.sessionId;
        session.language = language;
        session.cefrLevel = cefrLevel;
        session.conversationMode = conversationMode;
      }

      this.sendMessage(ws, {
        type: 'session_started',
        data: {
          sessionId: chatSession.sessionId,
          context: chatSession.context
        },
        timestamp: Date.now()
      });

      logger.info(`AI chat session started for user ${userId}`);
    } catch (error) {
      logger.error('Error starting AI chat session:', error);
      this.sendMessage(ws, {
        type: 'error',
        data: { message: 'Failed to start session' },
        timestamp: Date.now()
      });
    }
  }

  private async handleSendMessage(ws: WebSocket, data: any): Promise<void> {
    try {
      const session = this.sessions.get(ws);
      if (!session?.sessionId) {
        this.sendMessage(ws, {
          type: 'error',
          data: { message: 'No active session' },
          timestamp: Date.now()
        });
        return;
      }

      const { message, messageType } = data;
      
      // Send message to AI using the correct ChatRequest structure
      const response = await this.conversationManager.processChatMessage({
        userId: session.userId || 'anonymous',
        userMessage: message,
        sessionId: session.sessionId,
        language: session.language || 'en',
        cefrLevel: session.cefrLevel || 'B1',
        conversationMode: session.conversationMode || 'free',
        generateAudio: false
      });

      // Send AI response back
      this.sendMessage(ws, {
        type: 'ai_response',
        data: {
          message: response.aiMessage,
          context: response.conversationContext,
          suggestedResponses: response.suggestedResponses,
          vocabularyHighlights: response.vocabularyHighlights,
          pronunciationFocus: response.pronunciationFocus
        },
        timestamp: Date.now()
      });

      logger.info(`AI chat message processed for session ${session.sessionId}`);
    } catch (error) {
      logger.error('Error processing AI chat message:', error);
      this.sendMessage(ws, {
        type: 'error',
        data: { message: 'Failed to process message' },
        timestamp: Date.now()
      });
    }
  }

  private async handleEndSession(ws: WebSocket): Promise<void> {
    const session = this.sessions.get(ws);
    if (session?.sessionId) {
      try {
        await this.conversationManager.endChatSession(session.sessionId);
        logger.info(`AI chat session ended: ${session.sessionId}`);
      } catch (error) {
        logger.error('Error ending AI chat session:', error);
      }
    }
    this.cleanupSession(ws);
  }

  private sendMessage(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private cleanupSession(ws: WebSocket): void {
    const session = this.sessions.get(ws);
    if (session) {
      session.isActive = false;
      this.sessions.delete(ws);
    }
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = new Date();
      const timeout = 30 * 60 * 1000; // 30 minutes

      this.sessions.forEach((session, ws) => {
        if (now.getTime() - session.lastActivity.getTime() > timeout) {
          logger.info('Cleaning up inactive WebSocket session');
          ws.close(1000, 'Session timeout');
          this.cleanupSession(ws);
        }
      });
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  public getActiveSessionsCount(): number {
    return this.sessions.size;
  }
}
