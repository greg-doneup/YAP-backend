// Lesson data model matching MongoDB schema
export interface Lesson {
  _id?: string;
  lesson_id: string;
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
  currentLessonId: string;      // Current lesson ID
  currentWordId: string;        // Current word ID within the lesson
  nextWordAvailableAt: string;  // ISO timestamp of when next word is available
  completedLessons: string[];   // Array of completed lesson IDs
  completedWords: string[];     // Array of completed word IDs
  lastActivity: string;         // ISO timestamp of last activity
  streak: number;               // Current daily streak
  level: number;                // User's current level
  totalXp: number;              // Total experience points
}

// Daily completion results
export interface LessonCompletion {
  userId: string;
  lessonId: string;
  wordId: string;
  date: string;               // YYYY-MM-DD
  pronunciationScore: number;
  grammarScore: number;
  pass: boolean;
  audioUrl?: string;         // Reference to recorded audio
  transcript?: string;       // User's transcribed text
  expected: string;          // Expected text
  corrected: string;         // Corrected text
  timestamp: string;         // ISO timestamp
}
