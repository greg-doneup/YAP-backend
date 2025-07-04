import { Server } from 'socket.io';
import { createServer } from 'http';
import { Express } from 'express';
import multer from 'multer';
import { PassThrough } from 'stream';
import { logger } from '../utils/logger';
import { ProductionSpeechToTextService, TranscriptionResult } from './production-speech-to-text.service';
import { ProductionTextToSpeechService, SynthesisResult } from './production-text-to-speech.service';
import { ConversationManager } from './conversation-manager';
import { ChatRequest } from '../types/chat-session';

export interface StreamingSession {
  userId: string;
  sessionId: string;
  language: string;
  cefrLevel: string;
  conversationMode: 'guided' | 'free' | 'scenario';
  isActive: boolean;
  lastActivity: Date;
  audioStream?: {
    write: (chunk: Buffer) => void;
    end: () => void;
    destroy: () => void;
  };
}

export interface StreamingMessage {
  type: 'audio_chunk' | 'audio_end' | 'text_message' | 'voice_response' | 'partial_transcription' | 'error';
  data?: any;
  timestamp: number;
}

/**
 * Real-time Streaming Speech Service
 * Handles WebSocket connections for real-time voice conversations
 */
export class RealTimeStreamingService {
  private io: Server;
  private sttService: ProductionSpeechToTextService;
  private ttsService: ProductionTextToSpeechService;
  private conversationManager: ConversationManager;
  private activeSessions: Map<string, StreamingSession> = new Map();
  private upload = multer({ storage: multer.memoryStorage() });

  constructor(app: Express, conversationManager: ConversationManager) {
    const server = createServer(app);
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "*",
        methods: ["GET", "POST"]
      },
      maxHttpBufferSize: 10e6, // 10MB for audio chunks
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.sttService = new ProductionSpeechToTextService();
    this.ttsService = new ProductionTextToSpeechService();
    this.conversationManager = conversationManager;

    this.setupSocketHandlers();
    this.setupHTTPRoutes(app);
    
    // Cleanup inactive sessions
    setInterval(() => this.cleanupInactiveSessions(), 60000); // Every minute

    logger.info('Real-time streaming service initialized');
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Start streaming session
      socket.on('start_streaming_session', async (data: {
        userId: string;
        language: string;
        cefrLevel: string;
        conversationMode: 'guided' | 'free' | 'scenario';
        scenario?: string;
      }) => {
        try {
          // Start chat session
          const chatSession = await this.conversationManager.startChatSession(
            data.userId,
            data.language,
            data.cefrLevel,
            data.conversationMode,
            data.scenario
          );

          // Create streaming session
          const streamingSession: StreamingSession = {
            userId: data.userId,
            sessionId: chatSession.sessionId,
            language: data.language,
            cefrLevel: data.cefrLevel,
            conversationMode: data.conversationMode,
            isActive: true,
            lastActivity: new Date()
          };

          this.activeSessions.set(socket.id, streamingSession);

          // Start streaming transcription
          const audioStream = await this.sttService.startStreamingTranscription(
            data.language,
            {
              onPartialResult: (text: string, confidence: number) => {
                socket.emit('partial_transcription', {
                  type: 'partial_transcription',
                  data: { text, confidence },
                  timestamp: Date.now()
                });
              },
              onFinalResult: async (result: TranscriptionResult) => {
                await this.processFinalTranscription(socket.id, result);
              },
              onError: (error: Error) => {
                socket.emit('error', {
                  type: 'error',
                  data: { message: error.message },
                  timestamp: Date.now()
                });
              }
            }
          );

          streamingSession.audioStream = audioStream;

          socket.emit('session_started', {
            type: 'session_started',
            data: {
              sessionId: chatSession.sessionId,
              context: chatSession.context
            },
            timestamp: Date.now()
          });

          logger.info(`Streaming session started for user ${data.userId}`);
        } catch (error) {
          logger.error('Failed to start streaming session:', error);
          socket.emit('error', {
            type: 'error',
            data: { message: 'Failed to start session' },
            timestamp: Date.now()
          });
        }
      });

      // Handle audio chunks
      socket.on('audio_chunk', (audioData: ArrayBuffer) => {
        const session = this.activeSessions.get(socket.id);
        if (!session || !session.audioStream) {
          socket.emit('error', {
            type: 'error',
            data: { message: 'No active session' },
            timestamp: Date.now()
          });
          return;
        }

        try {
          const audioBuffer = Buffer.from(audioData);
          session.audioStream.write(audioBuffer);
          session.lastActivity = new Date();
        } catch (error) {
          logger.error('Error processing audio chunk:', error);
          socket.emit('error', {
            type: 'error',
            data: { message: 'Audio processing error' },
            timestamp: Date.now()
          });
        }
      });

      // Handle audio end
      socket.on('audio_end', () => {
        const session = this.activeSessions.get(socket.id);
        if (session?.audioStream) {
          session.audioStream.end();
        }
      });

      // Handle text messages (fallback)
      socket.on('text_message', async (data: {
        message: string;
        sessionId: string;
      }) => {
        const session = this.activeSessions.get(socket.id);
        if (!session) {
          socket.emit('error', {
            type: 'error',
            data: { message: 'No active session' },
            timestamp: Date.now()
          });
          return;
        }

        try {
          await this.processTextMessage(socket.id, data.message);
        } catch (error) {
          logger.error('Error processing text message:', error);
          socket.emit('error', {
            type: 'error',
            data: { message: 'Message processing error' },
            timestamp: Date.now()
          });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.cleanupSession(socket.id);
        logger.info(`Client disconnected: ${socket.id}`);
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error(`Socket error for ${socket.id}:`, error);
        this.cleanupSession(socket.id);
      });
    });
  }

  private async processFinalTranscription(
    socketId: string,
    transcriptionResult: TranscriptionResult
  ): Promise<void> {
    const session = this.activeSessions.get(socketId);
    if (!session) return;

    try {
      // Send final transcription to client
      this.io.to(socketId).emit('final_transcription', {
        type: 'final_transcription',
        data: transcriptionResult,
        timestamp: Date.now()
      });

      // Process with conversation manager
      const chatRequest: ChatRequest = {
        userId: session.userId,
        sessionId: session.sessionId,
        userMessage: transcriptionResult.text,
        language: session.language,
        cefrLevel: session.cefrLevel,
        conversationMode: session.conversationMode
      };

      const chatResponse = await this.conversationManager.processChatMessage(chatRequest);

      // Generate voice response
      const voiceResponse = await this.ttsService.synthesizeSpeech(
        chatResponse.aiMessage,
        session.language,
        {
          speakingRate: this.getSpeakingRateForLevel(session.cefrLevel),
          useSSML: true,
          emotion: 'neutral'
        }
      );

      // Send complete response to client
      this.io.to(socketId).emit('voice_response', {
        type: 'voice_response',
        data: {
          text: chatResponse.aiMessage,
          audio: voiceResponse.audioBuffer.toString('base64'),
          audioFormat: voiceResponse.audioFormat,
          duration: voiceResponse.duration,
          context: chatResponse.conversationContext,
          suggestedResponses: chatResponse.suggestedResponses,
          vocabularyHighlights: chatResponse.vocabularyHighlights,
          pronunciationResult: chatResponse.pronunciationResult
        },
        timestamp: Date.now()
      });

      session.lastActivity = new Date();
      
      logger.info(`Processed voice conversation turn for session ${session.sessionId}`);
    } catch (error) {
      logger.error('Error processing final transcription:', error);
      this.io.to(socketId).emit('error', {
        type: 'error',
        data: { message: 'Failed to process voice message' },
        timestamp: Date.now()
      });
    }
  }

  private async processTextMessage(
    socketId: string,
    message: string
  ): Promise<void> {
    const session = this.activeSessions.get(socketId);
    if (!session) return;

    try {
      const chatRequest: ChatRequest = {
        userId: session.userId,
        sessionId: session.sessionId,
        userMessage: message,
        language: session.language,
        cefrLevel: session.cefrLevel,
        conversationMode: session.conversationMode
      };

      const chatResponse = await this.conversationManager.processChatMessage(chatRequest);

      this.io.to(socketId).emit('text_response', {
        type: 'text_response',
        data: {
          text: chatResponse.aiMessage,
          context: chatResponse.conversationContext,
          suggestedResponses: chatResponse.suggestedResponses,
          vocabularyHighlights: chatResponse.vocabularyHighlights
        },
        timestamp: Date.now()
      });

      session.lastActivity = new Date();
    } catch (error) {
      logger.error('Error processing text message:', error);
      throw error;
    }
  }

  private setupHTTPRoutes(app: Express): void {
    // Upload audio file for processing
    app.post('/api/streaming/upload-audio', this.upload.single('audio'), async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No audio file provided' });
        }

        const { language, sessionId } = req.body;
        
        const transcriptionResult = await this.sttService.transcribeAudio(
          req.file.buffer,
          language
        );

        return res.json({
          success: true,
          transcription: transcriptionResult
        });
      } catch (error) {
        logger.error('Audio upload processing failed:', error);
        return res.status(500).json({
          error: 'Audio processing failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get available voices
    app.get('/api/streaming/voices/:language', async (req, res) => {
      try {
        const { language } = req.params;
        const voices = await this.ttsService.getAvailableVoices(language);
        res.json({ voices });
      } catch (error) {
        logger.error('Failed to get voices:', error);
        res.status(500).json({ error: 'Failed to get voices' });
      }
    });

    // Health check for streaming service
    app.get('/api/streaming/health', (req, res) => {
      res.json({
        status: 'healthy',
        activeSessions: this.activeSessions.size,
        timestamp: new Date().toISOString()
      });
    });
  }

  private getSpeakingRateForLevel(cefrLevel: string): number {
    const rates = {
      'A1': 0.8,
      'A2': 0.85,
      'B1': 0.9,
      'B2': 1.0,
      'C1': 1.05,
      'C2': 1.1
    };
    return rates[cefrLevel as keyof typeof rates] || 1.0;
  }

  private cleanupSession(socketId: string): void {
    const session = this.activeSessions.get(socketId);
    if (session) {
      if (session.audioStream) {
        session.audioStream.destroy();
      }
      this.activeSessions.delete(socketId);
      logger.info(`Cleaned up session for socket ${socketId}`);
    }
  }

  private cleanupInactiveSessions(): void {
    const now = new Date();
    const inactiveThreshold = 10 * 60 * 1000; // 10 minutes

    for (const [socketId, session] of this.activeSessions.entries()) {
      if (now.getTime() - session.lastActivity.getTime() > inactiveThreshold) {
        logger.info(`Cleaning up inactive session: ${socketId}`);
        this.cleanupSession(socketId);
      }
    }
  }

  /**
   * Get streaming service statistics
   */
  getStats(): {
    activeSessions: number;
    totalConnections: number;
    uptime: number;
  } {
    return {
      activeSessions: this.activeSessions.size,
      totalConnections: this.io.engine.clientsCount,
      uptime: process.uptime()
    };
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(message: StreamingMessage): void {
    this.io.emit('broadcast', message);
  }

  /**
   * Send message to specific user sessions
   */
  sendToUser(userId: string, message: StreamingMessage): void {
    for (const [socketId, session] of this.activeSessions.entries()) {
      if (session.userId === userId) {
        this.io.to(socketId).emit('user_message', message);
      }
    }
  }
}
