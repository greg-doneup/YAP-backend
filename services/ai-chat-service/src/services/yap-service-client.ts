import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

export interface PronunciationResult {
  overallScore: number;
  pass: boolean;
  transcript: string;
  wordDetails: Array<{
    word: string;
    score: number;
    issues: string[];
    startTime: number;
    endTime: number;
  }>;
  phonemeDetails: Array<{
    phoneme: string;
    word: string;
    score: number;
    issue: string;
    startTime: number;
    endTime: number;
  }>;
  feedback: string[];
  alignmentId: string;
}

export interface UserProfile {
  userId: string;
  language: string;
  cefrLevel: string;
  preferences: {
    learningGoals: string[];
    focusAreas: string[];
    difficulty: string;
  };
  progress: {
    lessonsCompleted: number;
    averageScore: number;
    currentStreak: number;
    totalTimeSpent: number;
  };
}

/**
 * HTTP client for communicating with other YAP services
 */
export class YapServiceClient {
  private pronunciationClient: AxiosInstance;
  private learningClient: AxiosInstance;
  private userClient: AxiosInstance;

  constructor() {
    const baseTimeout = 10000; // 10 seconds

    // Initialize service clients based on environment
    const learningServiceUrl = process.env.LEARNING_SERVICE_URL || 'http://learning-service:3001';
    const userServiceUrl = process.env.USER_SERVICE_URL || 'http://user-service:3002';
    
    this.pronunciationClient = axios.create({
      baseURL: learningServiceUrl,
      timeout: baseTimeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.learningClient = axios.create({
      baseURL: learningServiceUrl,
      timeout: baseTimeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.userClient = axios.create({
      baseURL: userServiceUrl,
      timeout: baseTimeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptors for logging
    this.addRequestInterceptors();
  }

  private addRequestInterceptors() {
    const logRequest = (config: any) => {
      logger.info(`Making request to ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
      return config;
    };

    const logError = (error: any) => {
      logger.error(`Service request failed: ${error.message}`);
      return Promise.reject(error);
    };

    this.pronunciationClient.interceptors.request.use(logRequest, logError);
    this.learningClient.interceptors.request.use(logRequest, logError);
    this.userClient.interceptors.request.use(logRequest, logError);
  }

  /**
   * Evaluate pronunciation using the learning service
   */
  async evaluatePronunciation(
    audioBuffer: Buffer,
    expectedText: string,
    languageCode: string
  ): Promise<PronunciationResult> {
    try {
      const formData = new FormData();
      const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
      formData.append('audio', audioBlob);
      formData.append('text', expectedText);
      formData.append('languageCode', languageCode);

      const response = await this.pronunciationClient.post('/api/pronunciation/evaluate', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to evaluate pronunciation:', error);
      throw new Error('Pronunciation evaluation failed');
    }
  }

  /**
   * Get user profile information
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const response = await this.userClient.get(`/api/users/${userId}/profile`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.warn(`User profile not found for userId: ${userId}`);
        return null;
      }
      logger.error('Failed to get user profile:', error);
      throw new Error('Failed to retrieve user profile');
    }
  }

  /**
   * Update user progress based on chat session
   */
  async updateUserProgress(
    userId: string,
    sessionData: {
      language: string;
      cefrLevel: string;
      messagesExchanged: number;
      vocabularyIntroduced: string[];
      timeSpent: number;
      averageResponseQuality: number;
    }
  ): Promise<void> {
    try {
      await this.learningClient.post(`/api/users/${userId}/progress/chat`, sessionData);
      logger.info(`Updated progress for user ${userId}`);
    } catch (error) {
      logger.error('Failed to update user progress:', error);
      // Don't throw - progress update failure shouldn't break chat
    }
  }

  /**
   * Get vocabulary recommendations based on user level and progress
   */
  async getVocabularyRecommendations(
    userId: string,
    language: string,
    cefrLevel: string,
    context: string
  ): Promise<string[]> {
    try {
      const response = await this.learningClient.get(
        `/api/vocabulary/recommendations?userId=${userId}&language=${language}&level=${cefrLevel}&context=${context}`
      );
      return response.data.vocabulary || [];
    } catch (error) {
      logger.error('Failed to get vocabulary recommendations:', error);
      return []; // Return empty array on failure
    }
  }

  /**
   * Log chat interaction for analytics
   */
  async logChatInteraction(
    userId: string,
    sessionId: string,
    interactionData: {
      userMessage: string;
      aiResponse: string;
      responseTime: number;
      cefrLevel: string;
      language: string;
      pronunciationScore?: number;
    }
  ): Promise<void> {
    try {
      await this.learningClient.post('/api/analytics/chat-interaction', {
        userId,
        sessionId,
        ...interactionData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to log chat interaction:', error);
      // Don't throw - analytics failure shouldn't break chat
    }
  }

  /**
   * Get learner's current lesson from learning service
   */
  async getLearnerCurrentLesson(userId: string, language: string): Promise<any | null> {
    try {
      const response = await this.learningClient.get(
        `/api/lessons/current?userId=${userId}&language=${language}`
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.warn(`No current lesson found for user ${userId}`);
        return null;
      }
      logger.error('Failed to get current lesson:', error);
      throw new Error('Failed to retrieve current lesson');
    }
  }

  /**
   * Update lesson progress based on chat interaction
   */
  async updateLessonProgress(progressData: {
    userId: string;
    lessonId: string;
    chatInteraction: boolean;
    vocabularyPracticed: string[];
    grammarPracticed: string[];
    objectivesProgress: Record<string, number>;
    completionPercentage: number;
  }): Promise<void> {
    try {
      await this.learningClient.post(`/api/lessons/${progressData.lessonId}/progress`, progressData);
      logger.info(`Updated lesson progress for user ${progressData.userId}`);
    } catch (error) {
      logger.error('Failed to update lesson progress:', error);
      // Don't throw - progress update failure shouldn't break chat
    }
  }
}

// Singleton instance
export const yapServiceClient = new YapServiceClient();
