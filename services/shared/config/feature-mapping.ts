/**
 * Feature Mapping Configuration for YAP Token Cost Matrix
 * 
 * Maps frontend features and API endpoints to token matrix feature IDs
 * and their associated costs. This provides the central mapping between
 * the application features and the token cost matrix.
 */

import { FeatureId } from './yap-token-matrix';

// Frontend route to feature mapping
export const ROUTE_TO_FEATURE_MAP: Record<string, FeatureId> = {
  // Learning features
  '/learning/lesson': 'dailyLessons',
  '/learning/lesson/extra': 'dailyLessons',
  '/learning/story-mode': 'storyMode',
  '/learning/vocabulary': 'vocabularyPractice',
  
  // AI features
  '/ai/chat/text': 'aiTextChat',
  '/ai/chat/voice': 'aiSpeechChat',
  
  // Voice & Pronunciation
  '/voice/pronunciation': 'pronunciationLesson',
  
  // Assessment features
  '/assessment/unit-exam': 'unitExam',
  '/assessment/skip-ahead': 'unitExamSkipAhead',
  '/assessment/adaptive-quiz': 'adaptiveReviewQuiz',
  
  // Social & Competition features
  '/social/leaderboard/weekly': 'weeklyLeaderboard',
  '/social/challenges/community': 'communityChallenge',
  
  // Event features
  '/events/cultural': 'eventPass',
};

// API endpoint to feature mapping
export const API_ENDPOINT_TO_FEATURE_MAP: Record<string, FeatureId> = {
  // Learning API endpoints
  'POST /api/v1/learning/lessons/start': 'dailyLessons',
  'POST /api/v1/learning/lessons/extra': 'dailyLessons',
  'POST /api/v1/learning/story-mode/unlock': 'storyMode',
  'GET /api/v1/learning/story-mode/content': 'storyMode',
  'POST /api/v1/learning/vocabulary/practice': 'vocabularyPractice',
  
  // AI API endpoints
  'POST /api/v1/ai/chat/text/message': 'aiTextChat',
  'POST /api/v1/ai/chat/voice/session': 'aiSpeechChat',
  'POST /api/v1/ai/chat/text/unlimited': 'aiTextChat',
  
  // Voice API endpoints
  'POST /api/v1/voice/pronunciation/analyze': 'pronunciationLesson',
  'POST /api/v1/voice/pronunciation/detailed': 'pronunciationLesson',
  
  // Assessment API endpoints
  'POST /api/v1/assessment/unit-exam/start': 'unitExam',
  'POST /api/v1/assessment/unit-exam/stake': 'unitExam',
  'POST /api/v1/assessment/skip-ahead/exam': 'unitExamSkipAhead',
  'POST /api/v1/assessment/adaptive-quiz/generate': 'adaptiveReviewQuiz',
  
  // Social API endpoints
  'POST /api/v1/social/leaderboard/join': 'weeklyLeaderboard',
  'POST /api/v1/social/challenges/join': 'communityChallenge',
  'POST /api/v1/social/referral/track': 'referral',
  
  // Event API endpoints
  'POST /api/v1/events/join': 'eventPass',
  'POST /api/v1/feedback/survey/submit': 'feedbackSurvey',
  'POST /api/v1/bugs/report': 'bugBounty',
};

// Service name to features mapping (for service-level integration)
export const SERVICE_TO_FEATURES_MAP: Record<string, FeatureId[]> = {
  'learning-service': [
    'dailyLessons',
    'vocabularyPractice',
    'storyMode',
  ],
  'ai-service': [
    'aiTextChat',
    'aiSpeechChat',
  ],
  'voice-service': [
    'pronunciationLesson',
  ],
  'assessment-service': [
    'unitExam',
    'unitExamSkipAhead',
    'adaptiveReviewQuiz',
  ],
  'social-service': [
    'weeklyLeaderboard',
    'communityChallenge',
    'referral',
  ],
  'content-service': [
    'storyMode',
    'eventPass',
  ],
};

// Feature categories for UI grouping
export const FEATURE_CATEGORIES = {
  DAILY_ALLOWANCES: [
    'dailyLessons',
    'aiTextChat',
    'aiSpeechChat',
    'vocabularyPractice',
  ],
  PREMIUM_FEATURES: [
    'pronunciationLesson',
    'unitExamSkipAhead',
    'adaptiveReviewQuiz',
    'storyMode',
    'eventPass',
  ],
  COMPETITION_FEATURES: [
    'weeklyLeaderboard',
    'communityChallenge',
    'unitExam',
  ],
  REWARD_FEATURES: [
    'referral',
    'feedbackSurvey',
    'bugBounty',
    'streakSystem',
  ],
};

// Helper functions for feature mapping
export class FeatureMapper {
  /**
   * Get feature ID from frontend route
   */
  static getFeatureFromRoute(route: string): FeatureId | null {
    return ROUTE_TO_FEATURE_MAP[route] || null;
  }

  /**
   * Get feature ID from API endpoint
   */
  static getFeatureFromEndpoint(method: string, path: string): FeatureId | null {
    const key = `${method.toUpperCase()} ${path}`;
    return API_ENDPOINT_TO_FEATURE_MAP[key] || null;
  }

  /**
   * Get all features for a service
   */
  static getFeaturesForService(serviceName: string): FeatureId[] {
    return SERVICE_TO_FEATURES_MAP[serviceName] || [];
  }

  /**
   * Get feature category
   */
  static getCategoryForFeature(featureId: FeatureId): string | null {
    for (const [category, features] of Object.entries(FEATURE_CATEGORIES)) {
      if (features.includes(featureId as string)) {
        return category;
      }
    }
    return null;
  }

  /**
   * Check if feature has daily allowance
   */
  static hasDailyAllowance(featureId: FeatureId): boolean {
    return FEATURE_CATEGORIES.DAILY_ALLOWANCES.includes(featureId as string);
  }

  /**
   * Check if feature is premium (costs tokens)
   */
  static isPremiumFeature(featureId: FeatureId): boolean {
    return FEATURE_CATEGORIES.PREMIUM_FEATURES.includes(featureId as string) ||
           FEATURE_CATEGORIES.COMPETITION_FEATURES.includes(featureId as string) ||
           FEATURE_CATEGORIES.REWARD_FEATURES.includes(featureId as string);
  }
}

export default {
  ROUTE_TO_FEATURE_MAP,
  API_ENDPOINT_TO_FEATURE_MAP,
  SERVICE_TO_FEATURES_MAP,
  FEATURE_CATEGORIES,
  FeatureMapper,
};
