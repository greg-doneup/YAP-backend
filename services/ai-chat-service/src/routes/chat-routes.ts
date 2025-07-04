import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { ConversationManager } from '../services/conversation-manager';
import { RealTimeVoiceChatService } from '../services/real-time-voice-chat.service';
import { ChatRequest } from '../types/chat-session';
import { logger } from '../utils/logger';

const router = Router();

// Validation schemas
const startSessionSchema = Joi.object({
  userId: Joi.string().required(),
  language: Joi.string().valid('spanish', 'french').required(),
  cefrLevel: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').required(),
  conversationMode: Joi.string().valid('guided', 'free', 'scenario').required(),
  scenario: Joi.string().optional()
});

const chatMessageSchema = Joi.object({
  userId: Joi.string().required(),
  userMessage: Joi.string().required(),
  sessionId: Joi.string().required(),
  language: Joi.string().valid('spanish', 'french').required(),
  cefrLevel: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').required(),
  conversationMode: Joi.string().valid('guided', 'free', 'scenario').required(),
  audioData: Joi.string().optional()
});

const voiceOnlyChatSchema = Joi.object({
  userId: Joi.string().required(),
  sessionId: Joi.string().required(),
  audioData: Joi.string().required(), // Base64 encoded audio
  language: Joi.string().valid('spanish', 'french').required(),
  cefrLevel: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').required(),
  conversationMode: Joi.string().valid('guided', 'free', 'scenario').required(),
  userMessage: Joi.string().optional().allow('') // Optional for voice-only messages
});

const streamingAudioSchema = Joi.object({
  userId: Joi.string().required(),
  sessionId: Joi.string().required(),
  language: Joi.string().valid('spanish', 'french').required(),
  cefrLevel: Joi.string().valid('A1', 'A2', 'B1', 'B2', 'C1', 'C2').required()
});

// POST /api/chat/start-session
router.post('/start-session', async (req: Request, res: Response) => {
  try {
    const { error, value } = startSessionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map((d: any) => d.message)
      });
    }

    const conversationManager: ConversationManager = req.app.locals.conversationManager;
    const session = await conversationManager.startChatSession(
      value.userId,
      value.language,
      value.cefrLevel,
      value.conversationMode,
      value.scenario
    );

    // Get translation for initial message
    let initialMessageTranslation: string | undefined;
    const initialMessage = session.messages[0]?.content || '';
    
    if (initialMessage) {
      try {
        const { TranslationService } = await import('../services/translation.service');
        const translationService = new TranslationService(process.env.OPENAI_API_KEY!);
        const translation = await translationService.translateResponse(
          initialMessage,
          value.language as 'spanish' | 'french',
          value.userId
        );
        initialMessageTranslation = translation.translatedText;
      } catch (error) {
        logger.warn('Failed to translate initial message:', error);
      }
    }

    return res.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        language: session.language,
        cefrLevel: session.cefrLevel,
        conversationMode: session.conversationMode,
        startTime: session.startTime,
        initialMessage,
        initialMessageTranslation
      }
    });

  } catch (error) {
    logger.error('Error starting chat session:', error);
    return res.status(500).json({
      error: 'Failed to start chat session',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/chat/message
router.post('/message', async (req: Request, res: Response) => {
  try {
    const { error, value } = chatMessageSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map((d: any) => d.message)
      });
    }

    const conversationManager: ConversationManager = req.app.locals.conversationManager;
    
    // Convert base64 audioData to Buffer if present
    const chatRequest: ChatRequest = {
      ...value,
      audioData: value.audioData ? Buffer.from(value.audioData, 'base64') : undefined
    };
    
    const response = await conversationManager.processChatMessage(chatRequest);

    return res.json({
      success: true,
      aiMessage: response.aiMessage,
      aiMessageTranslation: response.aiMessageTranslation,
      context: {
        currentTopic: response.conversationContext.currentTopic,
        messagesExchanged: response.conversationContext.messagesExchanged,
        conversationFlow: response.conversationContext.conversationFlow,
        difficulty: response.conversationContext.difficulty
      },
      suggestedResponses: response.suggestedResponses,
      suggestedResponsesTranslations: response.suggestedResponsesTranslations,
      pronunciationFocus: response.pronunciationFocus,
      pronunciationFocusTranslations: response.pronunciationFocusTranslations,
      vocabularyHighlights: response.vocabularyHighlights,
      pronunciationResult: response.pronunciationResult,
      translationMetadata: response.translationMetadata
    });

  } catch (error) {
    logger.error('Error processing chat message:', error);
    return res.status(500).json({
      error: 'Failed to process message',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/chat/voice-message
router.post('/voice-message', async (req: Request, res: Response) => {
  try {
    const { error, value } = voiceOnlyChatSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map((d: any) => d.message)
      });
    }

    const conversationManager: ConversationManager = req.app.locals.conversationManager;

    // Ensure audioData is converted to Buffer for processing
    const chatRequest: ChatRequest = {
      ...value,
      userMessage: value.userMessage || '', // Default to empty string if not provided
      audioData: value.audioData ? Buffer.from(value.audioData, 'base64') : undefined
    };

    // Process voice message
    const response = await conversationManager.processChatMessage(chatRequest);

    return res.json({
      success: true,
      aiMessage: response.aiMessage,
      context: {
        currentTopic: response.conversationContext.currentTopic,
        messagesExchanged: response.conversationContext.messagesExchanged,
        conversationFlow: response.conversationContext.conversationFlow,
        difficulty: response.conversationContext.difficulty
      },
      suggestedResponses: response.suggestedResponses,
      pronunciationFocus: response.pronunciationFocus,
      vocabularyHighlights: response.vocabularyHighlights,
      pronunciationResult: response.pronunciationResult
    });

  } catch (error) {
    logger.error('Error processing voice message:', error);
    return res.status(500).json({
      error: 'Failed to process voice message',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/chat/session/:sessionId
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId;
    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required'
      });
    }

    const conversationManager: ConversationManager = req.app.locals.conversationManager;
    const session = await conversationManager.getChatSession(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    return res.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        userId: session.userId,
        language: session.language,
        cefrLevel: session.cefrLevel,
        conversationMode: session.conversationMode,
        startTime: session.startTime,
        lastActivity: session.lastActivity,
        isActive: session.isActive,
        messagesCount: session.messages.length,
        messages: session.messages.slice(-20), // Return last 20 messages
        context: {
          currentTopic: session.context.currentTopic,
          messagesExchanged: session.context.messagesExchanged,
          conversationFlow: session.context.conversationFlow,
          vocabularyCount: session.context.vocabularyIntroduced.length,
          pronunciationIssues: session.context.pronunciationIssues
        }
      }
    });

  } catch (error) {
    logger.error('Error getting chat session:', error);
    return res.status(500).json({
      error: 'Failed to get session',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/chat/session/:sessionId
router.delete('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId;
    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required'
      });
    }

    const conversationManager: ConversationManager = req.app.locals.conversationManager;
    await conversationManager.endChatSession(sessionId);

    return res.json({
      success: true,
      message: 'Session ended successfully'
    });

  } catch (error) {
    logger.error('Error ending chat session:', error);
    return res.status(500).json({
      error: 'Failed to end session',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/chat/user/:userId/sessions
router.get('/user/:userId/sessions', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({
        error: 'User ID is required'
      });
    }

    const conversationManager: ConversationManager = req.app.locals.conversationManager;
    const sessions = await conversationManager.getUserActiveSessions(userId);

    return res.json({
      success: true,
      sessions: sessions.map(session => ({
        sessionId: session.sessionId,
        language: session.language,
        cefrLevel: session.cefrLevel,
        conversationMode: session.conversationMode,
        startTime: session.startTime,
        lastActivity: session.lastActivity,
        messagesCount: session.messages.length,
        currentTopic: session.context.currentTopic
      }))
    });

  } catch (error) {
    logger.error('Error getting user sessions:', error);
    return res.status(500).json({
      error: 'Failed to get user sessions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/chat/speech-to-text
router.post('/speech-to-text', async (req: Request, res: Response) => {
  try {
    const { audioData, language, cefrLevel } = req.body;

    if (!audioData || !language) {
      return res.status(400).json({
        error: 'Audio data and language are required'
      });
    }

    const conversationManager: ConversationManager = req.app.locals.conversationManager;
    const audioBuffer = Buffer.from(audioData, 'base64');

    // Access the production speech service through the conversation manager
    const productionSpeechService = (conversationManager as any).productionSpeechService;
    
    const result = await productionSpeechService.speechToText(audioBuffer, language, {
      language,
      cefrLevel: cefrLevel || 'B1',
      wordTimestamps: true
    });

    return res.json({
      success: true,
      transcription: result.text,
      confidence: result.confidence,
      processingTime: result.processingTime,
      words: result.words || []
    });

  } catch (error) {
    logger.error('Error in speech-to-text:', error);
    return res.status(500).json({
      error: 'Speech-to-text failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/chat/text-to-speech
router.post('/text-to-speech', async (req: Request, res: Response) => {
  try {
    const { text, language, cefrLevel, voice } = req.body;

    if (!text || !language) {
      return res.status(400).json({
        error: 'Text and language are required'
      });
    }

    const conversationManager: ConversationManager = req.app.locals.conversationManager;
    const productionSpeechService = (conversationManager as any).productionSpeechService;
    
    const result = await productionSpeechService.textToSpeech(text, language, cefrLevel || 'B1', {
      voice,
      emotion: 'friendly'
    });

    // Return audio as base64
    return res.json({
      success: true,
      audioData: result.audioBuffer.toString('base64'),
      duration: result.duration,
      format: result.format,
      speechRate: result.speechRate,
      voiceId: result.voiceId
    });

  } catch (error) {
    logger.error('Error in text-to-speech:', error);
    return res.status(500).json({
      error: 'Text-to-speech failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/chat/voice-turn
router.post('/voice-turn', async (req: Request, res: Response) => {
  try {
    const { audioData, sessionId, language, cefrLevel } = req.body;

    if (!audioData || !sessionId || !language) {
      return res.status(400).json({
        error: 'Audio data, session ID, and language are required'
      });
    }

    const conversationManager: ConversationManager = req.app.locals.conversationManager;
    const session = await conversationManager.getChatSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    const productionSpeechService = (conversationManager as any).productionSpeechService;
    const audioBuffer = Buffer.from(audioData, 'base64');

    // Complete voice turn: transcribe, generate response, synthesize
    const result = await productionSpeechService.processVoiceTurn(
      audioBuffer,
      language,
      cefrLevel || session.cefrLevel,
      async (transcribedText: string) => {
        // Process through the conversation manager
        const chatResponse = await conversationManager.processChatMessage({
          userId: session.userId,
          userMessage: transcribedText,
          sessionId: sessionId,
          language: language,
          cefrLevel: cefrLevel || session.cefrLevel,
          conversationMode: session.conversationMode,
          generateAudio: false // We'll handle audio separately
        });
        return chatResponse.aiMessage;
      }
    );

    return res.json({
      success: true,
      transcription: {
        text: result.transcription.text,
        confidence: result.transcription.confidence,
        processingTime: result.transcription.processingTime
      },
      response: {
        text: result.responseText,
        audioData: result.responseAudio.audioBuffer.toString('base64'),
        duration: result.responseAudio.duration,
        speechRate: result.responseAudio.speechRate
      },
      totalProcessingTime: result.totalProcessingTime
    });

  } catch (error) {
    logger.error('Error in voice turn:', error);
    return res.status(500).json({
      error: 'Voice turn processing failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/chat/tts - Generate high-quality neural TTS
router.post('/tts', async (req: Request, res: Response) => {
  try {
    const { text, language = 'spanish', voice, options } = req.body;
    
    if (!text) {
      return res.status(400).json({
        error: 'Validation error',
        details: ['Text is required']
      });
    }

    // Get the speech service
    const speechService = req.app.locals.productionSpeechService;
    if (!speechService) {
      logger.error('Production speech service not initialized');
      return res.status(500).json({
        error: 'Speech service not available',
        details: 'Service not properly initialized'
      });
    }
    
    // Use high-quality neural voice options
    const synthesisOptions = {
      voice: voice || (language === 'spanish' ? 'nova' : 'alloy'), // OpenAI voice names
      speed: options?.rate || 1.0,
      emotion: options?.emotion || 'neutral'
    };

    // Generate neural TTS using OpenAI's high-quality model
    const result = await speechService.textToSpeech(
      text, 
      language, 
      'B1', // Default CEFR level
      synthesisOptions
    );
    
    // Convert to base64 for frontend consumption
    const base64Audio = result.audioBuffer.toString('base64');
    
    return res.json({
      success: true,
      audioData: base64Audio,
      audioFormat: result.format,
      duration: result.duration,
      voiceUsed: result.voiceId,
      processingTime: Date.now() - Date.now(),
      metadata: {
        textLength: text.length,
        language: language,
        model: 'tts-1-hd',
        speechRate: result.speechRate
      }
    });

  } catch (error) {
    logger.error('Error generating neural TTS:', error);
    return res.status(500).json({
      error: 'Failed to generate speech',
      message: error instanceof Error ? error.message : 'TTS service unavailable'
    });
  }
});

// GET /api/chat/voices - Get available neural voices
router.get('/voices', async (req: Request, res: Response) => {
  try {
    const { language = 'spanish' } = req.query;
    
    // OpenAI TTS voices
    const voices = [
      { name: 'alloy', displayName: 'Alloy', gender: 'neutral', locale: 'en-US', isNeural: true },
      { name: 'echo', displayName: 'Echo', gender: 'male', locale: 'en-US', isNeural: true },
      { name: 'fable', displayName: 'Fable', gender: 'male', locale: 'en-US', isNeural: true },
      { name: 'onyx', displayName: 'Onyx', gender: 'male', locale: 'en-US', isNeural: true },
      { name: 'nova', displayName: 'Nova', gender: 'female', locale: 'es-ES', isNeural: true },
      { name: 'shimmer', displayName: 'Shimmer', gender: 'female', locale: 'en-US', isNeural: true }
    ];
    
    return res.json({
      success: true,
      language: language,
      voices: voices
    });

  } catch (error) {
    logger.error('Error fetching available voices:', error);
    return res.status(500).json({
      error: 'Failed to fetch voices',
      message: error instanceof Error ? error.message : 'Voice service unavailable'
    });
  }
});

export { router as chatRoutes };
