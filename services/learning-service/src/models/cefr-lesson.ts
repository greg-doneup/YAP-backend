import { ObjectId } from 'mongodb';

/**
 * CEFR Lesson Template Interface
 * Represents the structured lesson format for the Spanish A1-A2 curriculum (640 lessons)
 */
export interface CEFRLesson {
  _id?: ObjectId;
  id: string;
  lessonNumber: number; // 1-640
  level: 'Foundation' | 'Elementary' | 'Pre-Intermediate' | 'Advanced';
  levelRange: string; // "1-80", "81-160", "161-240", "241-320", "321-400", etc.
  theme: string; // "First Contact", "Personal Identity", etc.
  focus: string; // "Greetings, name, basic courtesy"
  
  vocabulary: {
    targetWords: string[]; // 25-30 words for early lessons
    totalCount: { min: number; max: number };
    highFrequencyWords: string[]; // Priority words for mastery
  };
  
  grammar: {
    concepts: string[]; // "Subject pronouns", "basic ser conjugation"
    complexity: 'basic' | 'intermediate' | 'advanced';
    newConcepts: string[]; // New grammar introduced in this lesson
    reviewConcepts: string[]; // Grammar being reinforced
  };
  
  speaking: {
    outputLevel: 'words' | 'phrases' | 'sentences' | 'extended';
    expectedDuration: number; // Target speaking time in seconds
    complexity: string; // "1-2 word responses", "simple sentences"
    practiceType: 'vocabulary' | 'grammar' | 'cultural' | 'free-response';
  };
  
  culturalFocus: boolean;
  culturalElements?: {
    topics: string[]; // Cultural topics covered
    comparisons: string[]; // Cultural comparison activities
    regionalFocus?: string[]; // Specific regions highlighted
  };
  
  estimatedDuration: number; // 15-45 minutes
  prerequisites: string[]; // Previous lesson IDs required
  
  // Lesson structure
  sections: Array<{
    type: 'vocabulary' | 'grammar' | 'speaking' | 'cultural' | 'review';
    title: string;
    content: string;
    estimatedTime: number; // minutes
    required: boolean;
  }>;
  
  // Assessment criteria
  assessment: {
    vocabularyMastery: number; // Required percentage (0.7 = 70%)
    grammarAccuracy: number; // Required accuracy
    speakingScore: number; // Required speaking score
    culturalEngagement?: boolean; // Required for cultural lessons
  };
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  version: number; // For lesson template versioning
}

/**
 * CEFR Lesson Category Interface
 * Groups lessons by theme matching the Spanish A1 curriculum structure
 */
export interface CEFRLessonCategory {
  _id?: ObjectId;
  categoryName: string; // "First Contact", "Family Basics", etc.
  lessonRange: { start: number; end: number }; // {start: 1, end: 5}
  totalLessons: number; // 5 lessons in this category
  level: 'Foundation' | 'Elementary' | 'Pre-Intermediate' | 'Advanced';
  
  theme: string;
  focus: string;
  
  // Learning objectives for the entire category
  objectives: {
    vocabulary: {
      targetCount: number;
      themes: string[];
      highFrequency: string[];
    };
    grammar: {
      concepts: string[];
      progression: string[];
    };
    speaking: {
      startLevel: string;
      endLevel: string;
      progression: string[];
    };
    cultural?: {
      topics: string[];
      activities: string[];
    };
  };
  
  // Category completion requirements
  completion: {
    minimumLessonsRequired: number; // Can skip some lessons in a category
    masteryCriteria: {
      vocabularyRetention: number; // 0.8 = 80%
      grammarAccuracy: number;
      speakingProgression: boolean;
    };
  };
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User CEFR Progress Interface
 * Tracks user progress through the CEFR lesson structure
 */
export interface UserCEFRProgress {
  _id?: ObjectId;
  userId: string;
  language: string; // "spanish" for now, expandable later
  
  // Overall progress
  currentLesson: number; // 1-640
  lessonsCompleted: number[];
  lessonsUnlocked: number[]; // Lessons available for study
  
  // Level progress
  currentLevel: 'Foundation' | 'Elementary' | 'Pre-Intermediate' | 'Advanced';
  levelsCompleted: string[];
  levelProgress: {
    [level: string]: {
      lessonsCompleted: number;
      totalLessons: number;
      completionPercentage: number;
      averageScore: number;
    };
  };
  
  // Category progress
  categoryProgress: {
    [categoryName: string]: {
      started: boolean;
      completed: boolean;
      lessonsCompleted: number[];
      averageScore: number;
      timeSpent: number; // minutes
      lastAccessed: Date;
    };
  };
  
  // Skill progression
  skillLevels: {
    vocabulary: {
      wordsLearned: number;
      wordsReviewed: number;
      wordsMastered: number;
      averageRetention: number;
    };
    grammar: {
      conceptsLearned: string[];
      conceptsMastered: string[];
      averageAccuracy: number;
    };
    speaking: {
      currentLevel: 'words' | 'phrases' | 'sentences' | 'extended';
      assessmentHistory: Array<{
        lessonNumber: number;
        score: number;
        level: string;
        date: Date;
      }>;
      averageScore: number;
    };
    cultural: {
      topicsExplored: string[];
      comparisonsCompleted: number;
      reflectionsSubmitted: number;
    };
  };
  
  // Time tracking
  timeSpent: {
    total: number; // minutes
    byLevel: { [level: string]: number };
    byCategory: { [category: string]: number };
    lastSession: Date;
    averageSessionLength: number;
  };
  
  // Preferences and personalization
  preferences: {
    dailyGoal: number; // lessons per day
    preferredSessionLength: number; // minutes
    culturalInterests: string[];
    skipAheadTokensUsed: number;
  };
  
  createdAt: Date;
  updatedAt: Date;
  lastAccessed: Date;
}

/**
 * CEFR Lesson Template Data
 * Pre-populated lesson templates matching the Spanish A1 curriculum
 */
export const A1_LESSON_TEMPLATES: Partial<CEFRLesson>[] = [
  // Foundation Level (Lessons 1-80)
  
  // Lessons 1-5: First Contact
  {
    lessonNumber: 1,
    level: 'Foundation',
    levelRange: '1-80',
    theme: 'First Contact',
    focus: 'Greetings, name, basic courtesy',
    vocabulary: {
      targetWords: ['hola', 'adiós', 'por favor', 'gracias', 'me llamo'],
      totalCount: { min: 25, max: 30 },
      highFrequencyWords: ['hola', 'adiós', 'gracias']
    },
    grammar: {
      concepts: ['Subject pronouns', 'basic ser conjugation'],
      complexity: 'basic',
      newConcepts: ['yo', 'tú', 'él/ella'],
      reviewConcepts: []
    },
    speaking: {
      outputLevel: 'words',
      expectedDuration: 30,
      complexity: '1-2 word responses, memorized phrases',
      practiceType: 'vocabulary'
    },
    culturalFocus: false,
    estimatedDuration: 20,
    prerequisites: []
  },
  {
    lessonNumber: 2,
    level: 'Foundation',
    levelRange: '1-80',
    theme: 'First Contact',
    focus: 'Polite expressions and basic interaction',
    vocabulary: {
      targetWords: ['buenos días', 'buenas tardes', 'buenas noches', 'de nada', 'perdón'],
      totalCount: { min: 25, max: 30 },
      highFrequencyWords: ['buenos días', 'de nada']
    },
    grammar: {
      concepts: ['Formal vs informal greetings'],
      complexity: 'basic',
      newConcepts: ['tú vs usted'],
      reviewConcepts: ['Subject pronouns']
    },
    speaking: {
      outputLevel: 'phrases',
      expectedDuration: 45,
      complexity: 'Simple memorized phrases',
      practiceType: 'vocabulary'
    },
    culturalFocus: true,
    culturalElements: {
      topics: ['Greeting customs in Spanish-speaking countries'],
      comparisons: ['Formal vs informal culture'],
      regionalFocus: ['Spain', 'Mexico']
    },
    estimatedDuration: 25,
    prerequisites: ['1']
  },
  
  // Lessons 6-10: Personal Identity
  {
    lessonNumber: 6,
    level: 'Foundation',
    levelRange: '1-80',
    theme: 'Personal Identity',
    focus: 'Nationality, origin, basic descriptions',
    vocabulary: {
      targetWords: ['soy', 'de', 'España', 'México', 'Estados Unidos', 'nacionalidad'],
      totalCount: { min: 30, max: 35 },
      highFrequencyWords: ['soy', 'de']
    },
    grammar: {
      concepts: ['Ser for origin/identity', 'gender agreement basics'],
      complexity: 'basic',
      newConcepts: ['ser conjugation', 'countries and nationalities'],
      reviewConcepts: ['Subject pronouns']
    },
    speaking: {
      outputLevel: 'sentences',
      expectedDuration: 60,
      complexity: 'Simple sentences about self',
      practiceType: 'grammar'
    },
    culturalFocus: false,
    estimatedDuration: 30,
    prerequisites: ['1', '2', '3', '4', '5']
  },
  
  // Continue with more lessons...
  // This is a sample - the full implementation would include all 640 lessons
];

/**
 * CEFR Lesson Categories Data
 * Categories matching the Spanish A1 curriculum structure
 */
export const A1_LESSON_CATEGORIES: Partial<CEFRLessonCategory>[] = [
  {
    categoryName: 'First Contact',
    lessonRange: { start: 1, end: 5 },
    totalLessons: 5,
    level: 'Foundation',
    theme: 'Absolute basics of Spanish interaction',
    focus: 'Greetings, name, basic courtesy',
    objectives: {
      vocabulary: {
        targetCount: 30,
        themes: ['greetings', 'courtesy', 'basic interaction'],
        highFrequency: ['hola', 'adiós', 'gracias', 'por favor']
      },
      grammar: {
        concepts: ['Subject pronouns', 'basic ser conjugation'],
        progression: ['Recognition', 'Basic usage', 'Simple sentences']
      },
      speaking: {
        startLevel: 'words',
        endLevel: 'phrases',
        progression: ['Single words', 'Memorized phrases', 'Simple responses']
      },
      cultural: {
        topics: ['Greeting customs', 'Politeness levels'],
        activities: ['Cultural comparison', 'Regional variations']
      }
    },
    completion: {
      minimumLessonsRequired: 4,
      masteryCriteria: {
        vocabularyRetention: 0.8,
        grammarAccuracy: 0.7,
        speakingProgression: true
      }
    }
  },
  {
    categoryName: 'Personal Identity',
    lessonRange: { start: 6, end: 10 },
    totalLessons: 5,
    level: 'Foundation',
    theme: 'Talking about yourself',
    focus: 'Nationality, origin, basic descriptions',
    objectives: {
      vocabulary: {
        targetCount: 35,
        themes: ['countries', 'nationalities', 'basic adjectives'],
        highFrequency: ['soy', 'de', 'español', 'americana']
      },
      grammar: {
        concepts: ['Ser for origin/identity', 'gender agreement basics'],
        progression: ['Country names', 'Nationality adjectives', 'Identity statements']
      },
      speaking: {
        startLevel: 'phrases',
        endLevel: 'sentences',
        progression: ['Name and origin', 'Nationality', 'Simple self-description']
      }
    },
    completion: {
      minimumLessonsRequired: 4,
      masteryCriteria: {
        vocabularyRetention: 0.8,
        grammarAccuracy: 0.75,
        speakingProgression: true
      }
    }
  }
  // Continue with all categories...
];
