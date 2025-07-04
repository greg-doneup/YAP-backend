import { v4 as uuidv4 } from 'uuid';
import { 
  ChatSession, 
  ChatMessage, 
  ConversationContext, 
  ChatRequest, 
  ChatResponse,
  VocabularyItem 
} from '../types/chat-session';
import { CEFRChatAdapter } from './cefr-chat-adapter';
import { ContextManager } from './context-manager';
import { yapServiceClient } from './yap-service-client';
import { AudioProcessingService } from './audio-processing.service';
import { ProductionSpeechService } from './production-speech.service';
import { DifficultyAdaptationService, DifficultyMetrics } from './difficulty-adaptation.service';
import { LessonIntegrationService } from './lesson-integration.service';
import { SessionStorageService } from './session-storage.service';
import { logger } from '../utils/logger';

export class ConversationManager {
  private cefrAdapter: CEFRChatAdapter;
  private contextManager: ContextManager;
  private audioProcessingService: AudioProcessingService;
  private productionSpeechService: ProductionSpeechService;
  private difficultyAdaptationService: DifficultyAdaptationService;
  private lessonIntegrationService: LessonIntegrationService;
  private sessionStorage: SessionStorageService;

  constructor(openaiApiKey: string) {
    this.cefrAdapter = new CEFRChatAdapter(openaiApiKey);
    this.contextManager = new ContextManager();
    this.audioProcessingService = new AudioProcessingService();
    this.productionSpeechService = new ProductionSpeechService(openaiApiKey);
    this.difficultyAdaptationService = new DifficultyAdaptationService();
    this.lessonIntegrationService = new LessonIntegrationService();
    this.sessionStorage = new SessionStorageService();
    
    logger.info(`Session storage initialized using: ${this.sessionStorage.getStorageType()}`);
  }

  /**
   * Start a new chat session
   */
  async startChatSession(
    userId: string,
    language: string,
    cefrLevel: string,
    conversationMode: 'guided' | 'free' | 'scenario',
    scenario?: string
  ): Promise<ChatSession> {
    const sessionId = uuidv4();
    const now = new Date();

    const context: ConversationContext = {
      sessionId,
      userId,
      language,
      cefrLevel,
      currentTopic: scenario || 'general',
      messagesExchanged: 0,
      vocabularyIntroduced: [],
      pronunciationIssues: [],
      learningGoals: [],
      conversationFlow: 'intro',
      lastInteraction: now,
      difficulty: this.mapCEFRToDifficulty(cefrLevel)
    };

    const session: ChatSession = {
      sessionId,
      userId,
      language,
      cefrLevel,
      conversationMode,
      startTime: now,
      lastActivity: now,
      messages: [],
      context,
      isActive: true
    };

    this.sessionStorage.setSession(sessionId, session);

    // Generate initial AI greeting
    const initialGreeting = await this.generateInitialGreeting(context);
    const greetingMessage: ChatMessage = {
      messageId: uuidv4(),
      sessionId,
      sender: 'ai',
      content: initialGreeting,
      timestamp: now
    };

    session.messages.push(greetingMessage);
    
    // Update session with greeting message
    await this.sessionStorage.updateSession(sessionId, session);
    
    logger.info(`Started new chat session ${sessionId} for user ${userId} in ${language} (${cefrLevel})`);
    
    return session;
  }

  /**
   * Process a user message and generate AI response
   */
  async processChatMessage(request: ChatRequest): Promise<ChatResponse> {
    const session = await this.sessionStorage.getSession(request.sessionId);
    if (!session) {
      throw new Error(`Session ${request.sessionId} not found`);
    }

    const startTime = Date.now();

    // Get user profile for personalized adaptation
    let userProfile;
    try {
      userProfile = await yapServiceClient.getUserProfile(session.userId);
      if (userProfile) {
        // Update session context with user preferences
        session.context.learningGoals = userProfile.preferences.learningGoals;
      }
    } catch (error) {
      logger.warn(`Failed to get user profile for ${session.userId}:`, error);
    }

    // Add user message to session
    const userMessage: ChatMessage = {
      messageId: uuidv4(),
      sessionId: request.sessionId,
      sender: 'user',
      content: request.userMessage,
      timestamp: new Date(),
      ...(request.audioData && { audioData: request.audioData })
    };

    session.messages.push(userMessage);

    // Handle pronunciation assessment if audio data is provided
    let pronunciationResult;
    if (request.audioData) {
      try {
        const languageCode = session.language === 'spanish' ? 'es-ES' : 'fr-FR';
        pronunciationResult = await yapServiceClient.evaluatePronunciation(
          request.audioData,
          request.userMessage,
          languageCode
        );

        // Update pronunciation issues in context
        if (pronunciationResult.wordDetails) {
          const newIssues = pronunciationResult.wordDetails
            .filter(word => word.score < 70)
            .map(word => ({
              word: word.word,
              issue: word.issues.join(', '),
              timestamp: new Date()
            }));
          
          session.context.pronunciationIssues.push(...newIssues);
        }

        // Add pronunciation metadata to user message
        userMessage.metadata = {
          pronunciationScore: pronunciationResult.overallScore,
          pronunciationFeedback: pronunciationResult.feedback
        };

        logger.info(`Pronunciation assessment for session ${request.sessionId}: ${pronunciationResult.overallScore}%`);
      } catch (error) {
        logger.error(`Pronunciation assessment failed for session ${request.sessionId}:`, error);
      }
    }

    // Handle voice-only conversation if audio data provided
    let isVoiceOnlyConversation = false;
    if (request.audioData) {
      try {
        // Process audio message using production speech service
        const transcriptionResult = await this.productionSpeechService.speechToText(
          request.audioData,
          session.language,
          {
            language: session.language,
            cefrLevel: session.cefrLevel,
            wordTimestamps: true
          }
        );
        
        // Update the request with transcribed text if this is voice-only
        if (!request.userMessage || request.userMessage.trim() === '') {
          request.userMessage = transcriptionResult.text;
          isVoiceOnlyConversation = true;
        }
        
        userMessage.content = request.userMessage;
        userMessage.metadata = {
          ...userMessage.metadata,
          isVoiceOnly: isVoiceOnlyConversation,
          audioTranscription: transcriptionResult.text,
          transcriptionConfidence: transcriptionResult.confidence,
          processingTime: transcriptionResult.processingTime
        };

        logger.info(`Voice-only conversation processed for session ${request.sessionId}`, {
          transcribed: transcriptionResult.text,
          confidence: transcriptionResult.confidence
        });
      } catch (error) {
        logger.error(`Voice-only processing failed for session ${request.sessionId}:`, error);
      }
    }

    // Get lesson context for lesson-aligned chat
    const lessonContext = await this.lessonIntegrationService.getCurrentLessonContext(
      session.userId,
      session.language
    );

    // Analyze lesson alignment if lesson exists
    let conversationAlignment;
    if (lessonContext) {
      conversationAlignment = await this.lessonIntegrationService.analyzeConversationAlignment(
        session.messages.slice(-5), // Last 5 messages for context
        lessonContext,
        session.context
      );
      
      logger.info(`Lesson alignment analyzed for session ${request.sessionId}`, {
        aligned: conversationAlignment.alignedWithLesson,
        objective: conversationAlignment.currentObjective
      });
    }

    // Update context with safe message handling
    session.context = this.contextManager.updateContext(
      session.context,
      request.userMessage || '', // Ensure we always pass a string
      request.audioData ? true : false
    );

    // Get vocabulary recommendations based on user context
    let vocabularyRecommendations: string[] = [];
    try {
      vocabularyRecommendations = await yapServiceClient.getVocabularyRecommendations(
        session.userId,
        session.language,
        session.cefrLevel,
        session.context.currentTopic
      );
    } catch (error) {
      logger.warn(`Failed to get vocabulary recommendations:`, error);
    }

    // Generate AI response with pronunciation context and translation
    const aiResult = await this.cefrAdapter.generateResponse(
      request.userMessage,
      session.context,
      session.messages,
      vocabularyRecommendations,
      pronunciationResult,
      true, // Include translation
      session.userId // Pass userId for translation
    );

    // Create AI message
    const aiMessage: ChatMessage = {
      messageId: uuidv4(),
      sessionId: request.sessionId,
      sender: 'ai',
      content: aiResult.response,
      timestamp: new Date(),
      metadata: {
        vocabularyIntroduced: aiResult.vocabularyIntroduced,
        processingTime: Date.now() - userMessage.timestamp.getTime()
      }
    };

    // Generate speech audio for voice-only conversations or if requested
    let aiAudioResponse;
    if (isVoiceOnlyConversation || request.generateAudio) {
      try {
        const speechResult = await this.productionSpeechService.textToSpeech(
          aiResult.response,
          session.language,
          session.cefrLevel,
          {
            emotion: 'friendly',
            speed: this.getSpeedForCEFRLevel(session.cefrLevel)
          }
        );
        
        aiAudioResponse = speechResult;
        
        // Add audio data to AI message
        aiMessage.audioData = speechResult.audioBuffer;
        aiMessage.metadata = {
          ...aiMessage.metadata,
          speechDuration: speechResult.duration,
          speechRate: speechResult.speechRate
        };

        logger.info(`Generated speech audio for session ${request.sessionId}`, {
          duration: speechResult.duration,
          speechRate: speechResult.speechRate,
          voiceId: speechResult.voiceId
        });
      } catch (error) {
        logger.error(`Failed to generate speech audio for session ${request.sessionId}:`, error);
      }
    }

    session.messages.push(aiMessage);

    // Update session activity
    session.lastActivity = new Date();
    session.context.messagesExchanged += 1;
    session.context.lastInteraction = new Date();

    // Update vocabulary introduced
    session.context.vocabularyIntroduced.push(...aiResult.vocabularyIntroduced);

    // Save updated session to storage
    await this.sessionStorage.updateSession(request.sessionId, session);

    // Log interaction for analytics
    const responseTime = Date.now() - startTime;
    try {
      await yapServiceClient.logChatInteraction(
        session.userId,
        request.sessionId,
        {
          userMessage: request.userMessage,
          aiResponse: aiResult.response,
          responseTime,
          cefrLevel: session.cefrLevel,
          language: session.language,
          ...(pronunciationResult && { pronunciationScore: pronunciationResult.overallScore })
        }
      );
    } catch (error) {
      logger.warn(`Failed to log chat interaction:`, error);
    }

    // Apply difficulty adaptation based on user performance
    try {
      const userMetrics: DifficultyMetrics = {
        comprehensionScore: this.calculateComprehensionAccuracy(session.messages.slice(-10)),
        responseComplexity: Math.min(10, Math.max(1, Math.round(responseTime / 1000))), // 1-10 based on response time
        vocabularyRetention: this.calculateVocabularyRetention(session.context.vocabularyIntroduced),
        pronunciationAccuracy: pronunciationResult?.overallScore || 50,
        conversationFlow: Math.min(10, Math.round(this.assessConversationFlow(session.messages.slice(-5)) / 10)),
        errorRate: Math.max(0, Math.min(1, (100 - (pronunciationResult?.overallScore || 50)) / 100))
      };

      const adaptationDecision = await this.difficultyAdaptationService.makeAdaptationDecision(
        userMetrics,
        session.context
      );

      // Apply adaptation to session context
      if (adaptationDecision.action !== 'maintain') {
        const adaptedContext = await this.difficultyAdaptationService.applyAdaptation(
          session.context,
          adaptationDecision
        );
        
        // Update session with adapted context
        session.context = { ...session.context, ...adaptedContext };
        
        logger.info(`Difficulty adapted for session ${request.sessionId}`, {
          action: adaptationDecision.action,
          newDifficulty: adaptedContext.difficulty,
          reason: adaptationDecision.reasoning
        });
      }
    } catch (error) {
      logger.error('Failed to apply difficulty adaptation:', error);
    }

    // Update lesson progress if lesson context exists
    if (lessonContext && conversationAlignment) {
      try {
        await this.lessonIntegrationService.updateLessonProgress(
          session.userId,
          lessonContext,
          session.messages.slice(-5),
          aiResult.vocabularyIntroduced,
          responseTime / 1000 // Convert to seconds
        );

        logger.info(`Lesson progress updated for session ${request.sessionId}`, {
          lessonId: lessonContext.id,
          alignment: conversationAlignment.alignedWithLesson
        });
      } catch (error) {
        logger.error('Failed to update lesson progress:', error);
      }
    }

    const response: ChatResponse = {
      aiMessage: aiResult.response,
      conversationContext: session.context,
      suggestedResponses: aiResult.suggestedResponses,
      pronunciationFocus: aiResult.pronunciationFocus,
      vocabularyHighlights: aiResult.vocabularyIntroduced,
      ...(aiResult.responseTranslation && { aiMessageTranslation: aiResult.responseTranslation }),
      ...(aiResult.suggestedResponsesTranslations && { suggestedResponsesTranslations: aiResult.suggestedResponsesTranslations }),
      ...(aiResult.pronunciationFocusTranslations && { pronunciationFocusTranslations: aiResult.pronunciationFocusTranslations }),
      ...(pronunciationResult && { pronunciationResult }),
      ...(aiAudioResponse && { 
        audioData: aiAudioResponse.audioBuffer,
        audioMetadata: {
          duration: aiAudioResponse.duration,
          speechRate: aiAudioResponse.speechRate,
          format: 'wav'
        }
      }),
      // Add translation metadata if translations were provided
      ...(aiResult.responseTranslation && {
        translationMetadata: {
          sourceLanguage: session.language,
          targetLanguage: 'english',
          translationProvided: true,
          translationTimestamp: new Date()
        }
      })
    };

    logger.info(`Processed message in session ${request.sessionId}, exchange #${session.context.messagesExchanged}`);

    return response;
  }

  /**
   * Get chat session by ID
   */
  async getChatSession(sessionId: string): Promise<ChatSession | null> {
    return await this.sessionStorage.getSession(sessionId);
  }

  /**
   * End a chat session
   */
  async endChatSession(sessionId: string): Promise<void> {
    const session = await this.sessionStorage.getSession(sessionId);
    if (session) {
      session.isActive = false;
      session.lastActivity = new Date();
      await this.sessionStorage.updateSession(sessionId, session);
      await this.sessionStorage.deleteSession(sessionId);
      logger.info(`Ended chat session ${sessionId}`);
    }
  }

  /**
   * Get active sessions for a user (Note: This method is not efficient with Redis storage)
   */
  async getUserActiveSessions(userId: string): Promise<ChatSession[]> {
    // Note: This method is less efficient with Redis as it requires scanning all sessions
    // In production, you might want to maintain a separate index by userId
    const sessionIds = await this.sessionStorage.getAllSessionIds();
    const activeSessions: ChatSession[] = [];
    
    for (const sessionId of sessionIds) {
      const session = await this.sessionStorage.getSession(sessionId);
      if (session && session.userId === userId && session.isActive) {
        activeSessions.push(session);
      }
    }
    
    return activeSessions;
  }

  /**
   * Generate initial AI greeting based on context
   */
  private async generateInitialGreeting(context: ConversationContext): Promise<string> {
    const language = context.language;
    const level = context.cefrLevel;

    if (language === 'spanish') {
      switch (level) {
        case 'A1':
          return '¡Hola! ¿Cómo te llamas? Me llamo Ana y estoy aquí para practicar español contigo.';
        case 'A2':
          return '¡Hola! ¿Cómo estás hoy? Soy Ana, tu compañera de conversación en español. ¿De dónde eres?';
        case 'B1':
          return '¡Hola! Me alegro de conocerte. Soy Ana y vamos a tener una conversación en español. ¿Qué te gusta hacer en tu tiempo libre?';
        default:
          return '¡Hola! ¿Cómo estás?';
      }
    } else if (language === 'french') {
      switch (level) {
        case 'A1':
          return 'Bonjour! Comment vous appelez-vous? Je m\'appelle Marie et je suis ici pour pratiquer le français avec vous.';
        case 'A2':
          return 'Bonjour! Comment allez-vous aujourd\'hui? Je suis Marie, votre partenaire de conversation en français. D\'où venez-vous?';
        case 'B1':
          return 'Bonjour! Je suis ravie de vous rencontrer. Je suis Marie et nous allons avoir une conversation en français. Qu\'aimez-vous faire pendant votre temps libre?';
        default:
          return 'Bonjour! Comment allez-vous?';
      }
    }

    return 'Hello! How are you today?';
  }

  /**
   * Map CEFR level to difficulty number
   */
  private mapCEFRToDifficulty(cefrLevel: string): number {
    const mapping: { [key: string]: number } = {
      'A1': 2,
      'A2': 3,
      'B1': 5,
      'B2': 7,
      'C1': 8,
      'C2': 10
    };
    return mapping[cefrLevel] || 2;
  }

  /**
   * Get appropriate speech speed for CEFR level
   */
  private getSpeedForCEFRLevel(cefrLevel: string): number {
    const speedMapping: { [key: string]: number } = {
      'A1': 0.75,
      'A2': 0.85,
      'B1': 0.9,
      'B2': 1.0,
      'C1': 1.1,
      'C2': 1.15
    };
    return speedMapping[cefrLevel] || 1.0;
  }

  /**
   * Helper methods for performance analysis
   */
  private calculateComprehensionAccuracy(messages: ChatMessage[]): number {
    // Simple heuristic: longer, coherent responses indicate better comprehension
    const userMessages = messages.filter(m => m.sender === 'user');
    if (userMessages.length === 0) return 50; // Default middle score
    
    const avgLength = userMessages.reduce((sum, msg) => sum + msg.content.length, 0) / userMessages.length;
    const coherenceScore = avgLength > 20 ? 80 : 60; // Simple length-based scoring
    
    return Math.min(100, coherenceScore);
  }

  private calculateVocabularyRetention(vocabulary: VocabularyItem[]): number {
    // Simple heuristic: assume good retention if vocabulary is being used
    return vocabulary.length > 0 ? 75 : 50;
  }

  private assessConversationFlow(messages: ChatMessage[]): number {
    // Simple heuristic: consistent back-and-forth indicates good flow
    if (messages.length < 2) return 70;
    
    let flowScore = 70;
    for (let i = 1; i < messages.length; i++) {
      const currentMessage = messages[i];
      const previousMessage = messages[i-1];
      if (currentMessage && previousMessage && currentMessage.sender !== previousMessage.sender) {
        flowScore += 5; // Good turn-taking
      }
    }
    
    return Math.min(100, flowScore);
  }

  /**
   * Clean up inactive sessions periodically
   */
  /**
   * Cleanup inactive sessions
   */
  async cleanup(): Promise<void> {
    // Use the session storage's cleanup method
    await this.sessionStorage.cleanupExpiredSessions();
    logger.info('Session cleanup completed');
  }

  /**
   * Cleanup and close storage connections
   */
  async dispose(): Promise<void> {
    await this.sessionStorage.cleanup();
    logger.info('ConversationManager disposed');
  }
}
