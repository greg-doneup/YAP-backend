export interface ChatRequest {
  userId: string;
  userMessage: string;
  sessionId: string;
  language: string;        // 'spanish', 'french', etc.
  cefrLevel: string;       // 'A1', 'A2', 'B1', etc.
  conversationMode: 'guided' | 'free' | 'scenario';
  audioData?: Buffer;      // Audio buffer for pronunciation assessment
  generateAudio?: boolean; // Whether to generate speech audio for the response
}

export interface ChatResponse {
  aiMessage: string;
  aiMessageTranslation?: string; // English translation of AI response
  conversationContext: ConversationContext;
  suggestedResponses?: string[];
  suggestedResponsesTranslations?: Array<{ original: string; translation: string }>; // Translations for suggested responses
  pronunciationFocus?: string[];
  pronunciationFocusTranslations?: string[]; // English translations of pronunciation focus items
  vocabularyHighlights?: VocabularyItem[];
  pronunciationResult?: PronunciationResult;
  audioData?: Buffer;      // Generated speech audio for the response
  audioMetadata?: {
    duration: number;
    speechRate: number;
    format: string;
  };
  translationMetadata?: {
    sourceLanguage: string;
    targetLanguage: string;
    translationProvided: boolean;
    translationTimestamp: Date;
  };
}

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

export interface ConversationContext {
  sessionId: string;
  userId: string;
  language: string;
  cefrLevel: string;
  currentTopic: string;
  messagesExchanged: number;
  vocabularyIntroduced: VocabularyItem[];
  pronunciationIssues: PronunciationIssue[];
  learningGoals: string[];
  conversationFlow: 'intro' | 'main' | 'practice' | 'wrap-up';
  lastInteraction: Date;
  difficulty: number; // 1-10 scale
}

export interface PronunciationIssue {
  word: string;
  issue: string;
  timestamp: Date;
}

export interface VocabularyItem {
  word: string;
  meaning: string;
  example: string;
  difficulty: string;
  category: string;
}

export interface PronunciationFeedback {
  overallScore: number;
  wordScores: WordScore[];
  feedback: string[];
  suggestions: string[];
}

export interface WordScore {
  word: string;
  score: number;
  issues: string[];
}

export interface ChatSession {
  sessionId: string;
  userId: string;
  language: string;
  cefrLevel: string;
  conversationMode: 'guided' | 'free' | 'scenario';
  startTime: Date;
  lastActivity: Date;
  messages: ChatMessage[];
  context: ConversationContext;
  isActive: boolean;
}

export interface ChatMessage {
  messageId: string;
  sessionId: string;
  sender: 'user' | 'ai';
  content: string;
  timestamp: Date;
  pronunciationScore?: number;
  audioData?: Buffer;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  processingTime?: number;
  aiModel?: string;
  pronunciationAssessed?: boolean;
  pronunciationScore?: number;
  pronunciationFeedback?: string[];
  vocabularyIntroduced?: VocabularyItem[];
  grammarCorrections?: GrammarCorrection[];
  isVoiceOnly?: boolean;
  audioTranscription?: string;
  transcriptionConfidence?: number;
  speechDuration?: number;
  speechRate?: number;
  prosody?: {
    pitch: string;
    rhythm: string;
    stress: string;
  };
}

export interface GrammarCorrection {
  original: string;
  corrected: string;
  explanation: string;
  rule: string;
}

export interface CEFRPromptConfig {
  level: string;
  vocabulary: string[];
  grammarStructures: string[];
  topics: string[];
  complexity: string;
  instructions: string;
}

export interface ScenarioConfig {
  id: string;
  name: string;
  description: string;
  cefrLevels: string[];
  vocabulary: VocabularyItem[];
  objectives: string[];
  prompts: { [key: string]: string };
}
