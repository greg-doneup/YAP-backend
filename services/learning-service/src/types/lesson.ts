// Lesson data model matching MongoDB schema
export interface Lesson {
  _id?: string;
  lesson_id: string;
  title?: string;
  description?: string;
  language: string;
  level: string;
  focus: string;
  new_vocabulary: VocabItem[];
  speaking_exercises: SpeakingExercise[];
  review_points: string[];
}

export interface VocabItem {
  id: string;
  term: string;
  translation: string;
  difficulty: number;
  examples: string[];
  audioUrl?: string;
  tags?: string[];
}

export interface SpeakingExercise {
  type: string;
  prompt: string;
  items: ExerciseItem[];
  leveling_note: string;
}

export interface ExerciseItem {
  question: string;
  example_answer: string;
}

// User's progress through lessons
export interface UserProgress {
  userId: string;               // User ID
  currentLessonId?: string;     // Current lesson ID
  currentWordId?: string;       // Current word ID within the lesson
  nextWordAvailableAt: string;  // ISO timestamp of when next word is available
  completedLessons: string[];   // Array of completed lesson IDs
  completedWords: string[];     // Array of completed word IDs
  lastActivity: string;         // ISO timestamp of last activity
  streak: number;               // Current daily streak
  level: number;                // User's current level
  totalXp: number;              // Total experience points
  
  // Dynamic lesson generation fields
  lastGeneratedLesson?: string; // ID of last generated lesson
  lastGeneratedAt?: string;     // ISO timestamp of last generation
  languageChangedAt?: string;   // ISO timestamp of last language change
  previousLanguageBackup?: any; // Backup of progress from previous language
  recentTopics?: string[];      // Recently covered topics for personalization
}

// Word-level pronunciation details
export interface WordPronunciationDetail {
  word: string;
  start_time: number;
  end_time: number;
  score: number;
  issues: string[];
}

// Phoneme-level pronunciation details
export interface PhonemePronunciationDetail {
  phoneme: string;
  word: string;
  start_time: number;
  end_time: number;
  score: number;
  issue: string;
}

// Daily completion results with detailed pronunciation feedback
export interface LessonCompletion {
  userId: string;
  lessonId: string;
  wordId: string;
  date: string;                                // YYYY-MM-DD
  pronunciationScore: number;                  // Overall pronunciation score
  grammarScore: number;                        // Grammar score
  pass: boolean;                               // Whether this attempt passed
  audioUrl?: string;                           // Reference to recorded audio
  transcript?: string;                         // User's transcribed text
  expected: string;                            // Expected text
  corrected: string;                           // Corrected text
  timestamp: string;                           // ISO timestamp
  
  // Detailed pronunciation feedback
  alignmentId?: string;                        // ID of the alignment result
  scoringId?: string;                          // ID of the scoring result
  evaluationId?: string;                       // ID of the complete evaluation
  wordDetails?: WordPronunciationDetail[];     // Word-level pronunciation details
  phonemeDetails?: PhonemePronunciationDetail[]; // Phoneme-level pronunciation details
  pronunciationFeedback?: string[];            // Text feedback on pronunciation
  ttsCachedAudio?: string;                     // Reference to TTS generated audio for comparison
}
