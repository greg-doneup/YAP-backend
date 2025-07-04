/**
 * Real-time Voice Chat Service
 * Handles live voice conversations using HTTP streaming and OpenAI
 * Production-ready without external WebSocket dependencies
 */

import { ProductionSpeechService } from './production-speech.service';
import { ConversationManager } from './conversation-manager';
import { logger } from '../utils/logger';
import { Request, Response } from 'express';

export interface VoiceChatSession {
  sessionId: string;
  userId: string;
  language: string;
  cefrLevel: string;
  conversationMode: string;
  isActive: boolean;
  startTime: Date;
  lastActivity: Date;
}

export interface StreamingResponse {
  type: 'transcription' | 'response' | 'audio' | 'error' | 'status';
  data: any;
  timestamp: Date;
}

/**
 * Real-time voice chat service using HTTP streaming
 */
export class RealTimeVoiceChatService {
  private activeSessions: Map<string, VoiceChatSession> = new Map();
  private speechService: ProductionSpeechService;
  private conversationManager: ConversationManager;

  constructor(speechService: ProductionSpeechService, conversationManager: ConversationManager) {
    this.speechService = speechService;
    this.conversationManager = conversationManager;
  }

  /**
   * Get the number of active sessions
   */
  getActiveSessionsCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Clean up inactive sessions
   */
  cleanupInactiveSessions(): void {
    const now = new Date();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [sessionId, session] of this.activeSessions.entries()) {
      const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();
      if (timeSinceLastActivity > inactiveThreshold) {
        this.activeSessions.delete(sessionId);
        logger.info('Cleaned up inactive voice session', { sessionId });
      }
    }
  }

  /**
   * Initialize a voice chat session
   */
  async initializeVoiceSession(
    userId: string,
    language: string,
    cefrLevel: string,
    conversationMode: 'guided' | 'free' | 'scenario'
  ): Promise<VoiceChatSession> {
    const sessionId = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const session: VoiceChatSession = {
      sessionId,
      userId,
      language,
      cefrLevel,
      conversationMode,
      isActive: true,
      startTime: new Date(),
      lastActivity: new Date()
    };

    this.activeSessions.set(sessionId, session);

    // Create corresponding conversation session
    await this.conversationManager.startChatSession(
      userId,
      language,
      cefrLevel,
      conversationMode
    );

    logger.info('Voice chat session initialized', { sessionId, userId, language });
    return session;
  }

  /**
   * Process audio chunk and stream response
   */
  async processAudioChunk(
    sessionId: string,
    audioChunk: Buffer,
    res: Response
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Voice session ${sessionId} not found`);
    }

    try {
      // Stream status update
      res.write(`data: ${JSON.stringify({
        type: 'status',
        data: { status: 'processing', message: 'Processing audio...' },
        timestamp: new Date()
      })}\n\n`);

      // Process the voice turn with the production speech service
      const result = await this.speechService.processVoiceTurn(
        audioChunk,
        session.language,
        session.cefrLevel,
        async (transcribedText: string) => {
          // Generate AI response through conversation manager
          const chatResponse = await this.conversationManager.processChatMessage({
            userId: session.userId,
            userMessage: transcribedText,
            sessionId: sessionId,
            language: session.language,
            cefrLevel: session.cefrLevel,
            conversationMode: session.conversationMode as any,
            audioData: audioChunk
          });
          return chatResponse.aiMessage;
        }
      );

      // Stream transcription
      res.write(`data: ${JSON.stringify({
        type: 'transcription',
        data: {
          text: result.transcription.text,
          confidence: result.transcription.confidence
        },
        timestamp: new Date()
      })}\n\n`);

      // Stream AI response text
      res.write(`data: ${JSON.stringify({
        type: 'response',
        data: { text: result.responseText },
        timestamp: new Date()
      })}\n\n`);

      // Stream audio response
      res.write(`data: ${JSON.stringify({
        type: 'audio',
        data: {
          audioData: result.responseAudio.audioBuffer.toString('base64'),
          duration: result.responseAudio.duration,
          format: result.responseAudio.format
        },
        timestamp: new Date()
      })}\n\n`);

      // Send completion
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        data: { processingTime: result.totalProcessingTime },
        timestamp: new Date()
      })}\n\n`);

      session.lastActivity = new Date();

    } catch (error) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        data: {
          message: error instanceof Error ? error.message : 'Processing failed'
        },
        timestamp: new Date()
      })}\n\n`);
    }
  }

  /**
   * Get voice session status
   */
  getSessionStatus(sessionId: string): VoiceChatSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * End voice session
   */
  async endVoiceSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.isActive = false;
      this.activeSessions.delete(sessionId);
      logger.info('Voice session ended', { sessionId });
    }
  }
}
