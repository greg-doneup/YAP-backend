import { CEFRLesson, CEFRLessonCategory } from './cefr-lesson';

/**
 * Spanish A2 Lesson Templates (Lessons 321-640)
 * Building on A1 foundation with more complex structures and topics
 */
export const A2_LESSON_TEMPLATES: Partial<CEFRLesson>[] = [
  // Foundation A2 Level (Lessons 321-400)
  
  // Lessons 321-325: Past Experiences Narration
  {
    lessonNumber: 321,
    level: 'Elementary',
    levelRange: '321-400',
    theme: 'Past Experiences Narration',
    focus: 'Telling stories about yesterday and last week',
    vocabulary: {
      targetWords: ['ayer', 'anoche', 'la semana pasada', 'entonces', 'después', 'luego', 'antes', 'mientras'],
      totalCount: { min: 30, max: 35 },
      highFrequencyWords: ['ayer', 'entonces', 'después']
    },
    grammar: {
      concepts: ['Preterite regular verbs', 'Common irregular preterite'],
      complexity: 'intermediate',
      newConcepts: ['preterite tense', 'time sequence'],
      reviewConcepts: ['present tense', 'basic past']
    },
    speaking: {
      outputLevel: 'sentences',
      expectedDuration: 120, // 2 minutes
      complexity: 'Connected sentences about past events',
      practiceType: 'grammar'
    },
    culturalFocus: false,
    estimatedDuration: 25,
    prerequisites: ['320'] // Last A1 lesson
  },
  
  {
    lessonNumber: 322,
    level: 'Elementary',
    levelRange: '321-400',
    theme: 'Past Experiences Narration',
    focus: 'Sequencing past events',
    vocabulary: {
      targetWords: ['primero', 'segundo', 'tercero', 'finalmente', 'al final', 'por último', 'durante', 'hasta'],
      totalCount: { min: 30, max: 35 },
      highFrequencyWords: ['primero', 'finalmente', 'durante']
    },
    grammar: {
      concepts: ['Sequence markers', 'Past time expressions'],
      complexity: 'intermediate',
      newConcepts: ['ordinal numbers', 'time connectors'],
      reviewConcepts: ['preterite tense']
    },
    speaking: {
      outputLevel: 'sentences',
      expectedDuration: 120,
      complexity: 'Chronological narration',
      practiceType: 'grammar'
    },
    culturalFocus: false,
    estimatedDuration: 25,
    prerequisites: ['321']
  },

  // Lessons 326-330: Childhood & Youth
  {
    lessonNumber: 326,
    level: 'Elementary',
    levelRange: '321-400',
    theme: 'Childhood & Youth',
    focus: 'Describing how things used to be',
    vocabulary: {
      targetWords: ['cuando era niño/a', 'solía', 'siempre', 'nunca', 'a menudo', 'normalmente', 'de vez en cuando'],
      totalCount: { min: 30, max: 35 },
      highFrequencyWords: ['cuando era', 'siempre', 'nunca']
    },
    grammar: {
      concepts: ['Imperfect tense introduction', 'Habitual past actions'],
      complexity: 'intermediate',
      newConcepts: ['imperfect tense', 'habitual actions'],
      reviewConcepts: ['preterite tense']
    },
    speaking: {
      outputLevel: 'sentences',
      expectedDuration: 120,
      complexity: 'Describe childhood routines',
      practiceType: 'grammar'
    },
    culturalFocus: true,
    culturalElements: {
      topics: ['childhood traditions', 'family customs'],
      comparisons: ['childhood in different cultures'],
      regionalFocus: ['Latin American childhood vs Spanish childhood']
    },
    estimatedDuration: 30,
    prerequisites: ['325']
  },

  // Core A2 Level (Lessons 401-480)
  
  // Lessons 401-405: Detailed Descriptions
  {
    lessonNumber: 401,
    level: 'Pre-Intermediate',
    levelRange: '401-480',
    theme: 'Detailed Descriptions',
    focus: 'People, places, and things in detail',
    vocabulary: {
      targetWords: ['bastante', 'muy', 'demasiado', 'suficiente', 'realmente', 'verdaderamente', 'completamente'],
      totalCount: { min: 35, max: 40 },
      highFrequencyWords: ['bastante', 'muy', 'realmente']
    },
    grammar: {
      concepts: ['Advanced adjectives', 'Adjective placement variations'],
      complexity: 'intermediate',
      newConcepts: ['nuanced descriptions', 'adjective intensifiers'],
      reviewConcepts: ['basic adjectives', 'ser vs estar']
    },
    speaking: {
      outputLevel: 'extended',
      expectedDuration: 300, // 5 minutes
      complexity: 'Rich descriptive language',
      practiceType: 'vocabulary'
    },
    culturalFocus: false,
    estimatedDuration: 35,
    prerequisites: ['400']
  },

  // Advanced A2 Level (Lessons 481-560)
  
  // Lessons 481-485: Historical Perspectives
  {
    lessonNumber: 481,
    level: 'Pre-Intermediate',
    levelRange: '481-560',
    theme: 'Historical Perspectives',
    focus: 'Simple historical narratives',
    vocabulary: {
      targetWords: ['historia', 'histórico', 'época', 'siglo', 'año', 'década', 'acontecimiento', 'evento'],
      totalCount: { min: 35, max: 40 },
      highFrequencyWords: ['historia', 'año', 'época']
    },
    grammar: {
      concepts: ['Pluperfect introduction', 'Historical narrative tenses'],
      complexity: 'advanced',
      newConcepts: ['había + participle', 'historical sequence'],
      reviewConcepts: ['preterite', 'imperfect']
    },
    speaking: {
      outputLevel: 'extended',
      expectedDuration: 420, // 7 minutes
      complexity: 'Historical anecdote telling',
      practiceType: 'cultural'
    },
    culturalFocus: true,
    culturalElements: {
      topics: ['Spanish history', 'Latin American history'],
      comparisons: ['historical events across cultures'],
      regionalFocus: ['colonial period', 'independence movements']
    },
    estimatedDuration: 40,
    prerequisites: ['480']
  },

  // A2 Mastery Level (Lessons 561-640)
  
  // Lessons 561-565: Interview Skills
  {
    lessonNumber: 561,
    level: 'Advanced',
    levelRange: '561-640',
    theme: 'Interview Skills',
    focus: 'Job interview preparation',
    vocabulary: {
      targetWords: ['entrevista', 'candidato', 'puesto', 'experiencia', 'habilidades', 'cualificaciones', 'sueldo'],
      totalCount: { min: 40, max: 45 },
      highFrequencyWords: ['entrevista', 'experiencia', 'puesto']
    },
    grammar: {
      concepts: ['Mixed tenses for experience', 'Formal register'],
      complexity: 'advanced',
      newConcepts: ['professional language', 'interview structures'],
      reviewConcepts: ['all past tenses', 'conditional']
    },
    speaking: {
      outputLevel: 'extended',
      expectedDuration: 600, // 10 minutes
      complexity: 'Professional self-presentation',
      practiceType: 'free-response'
    },
    culturalFocus: true,
    culturalElements: {
      topics: ['job culture', 'workplace etiquette'],
      comparisons: ['interview styles across cultures'],
      regionalFocus: ['business culture differences']
    },
    estimatedDuration: 45,
    prerequisites: ['560']
  },

  // Final A2 lesson
  {
    lessonNumber: 640,
    level: 'Advanced',
    levelRange: '561-640',
    theme: 'B1 Readiness & Certification',
    focus: 'Transition to B1',
    vocabulary: {
      targetWords: ['dominar', 'fluido', 'avanzado', 'intermedio', 'certificación', 'examen', 'nivel'],
      totalCount: { min: 40, max: 45 },
      highFrequencyWords: ['nivel', 'avanzado', 'fluido']
    },
    grammar: {
      concepts: ['All A2 structures automatic', 'B1 preparation'],
      complexity: 'advanced',
      newConcepts: ['meta-linguistic awareness'],
      reviewConcepts: ['all A2 grammar']
    },
    speaking: {
      outputLevel: 'extended',
      expectedDuration: 900, // 15 minutes
      complexity: 'Fluent conversations',
      practiceType: 'free-response'
    },
    culturalFocus: false,
    estimatedDuration: 45,
    prerequisites: ['639']
  }
];

/**
 * A2 Lesson Categories
 * Organized by the 16 major themes across 320 lessons (A2 portion: 321-640)
 */
export const A2_LESSON_CATEGORIES: CEFRLessonCategory[] = [
  {
    categoryName: 'Past Experiences Narration',
    lessonRange: { start: 321, end: 325 },
    totalLessons: 5,
    level: 'Elementary',
    theme: 'Past Experiences Narration',
    focus: 'Telling stories about yesterday and last week',
    objectives: {
      vocabulary: {
        targetCount: 40,
        themes: ['time expressions', 'sequence markers', 'past events'],
        highFrequency: ['ayer', 'entonces', 'después', 'primero', 'finalmente']
      },
      grammar: {
        concepts: ['Preterite regular verbs', 'Common irregular preterite', 'Sequence markers'],
        progression: ['simple past → complex past narratives']
      },
      speaking: {
        startLevel: 'Connected sentences',
        endLevel: '2-minute past event narration',
        progression: ['single events → sequenced narratives → detailed stories']
      }
    },
    completion: {
      minimumLessonsRequired: 4,
      masteryCriteria: {
        vocabularyRetention: 0.75,
        grammarAccuracy: 0.70,
        speakingProgression: true
      }
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    categoryName: 'Childhood & Youth',
    lessonRange: { start: 326, end: 330 },
    totalLessons: 5,
    level: 'Elementary',
    theme: 'Childhood & Youth',
    focus: 'Describing how things used to be',
    objectives: {
      vocabulary: {
        targetCount: 40,
        themes: ['childhood activities', 'habitual actions', 'frequency expressions'],
        highFrequency: ['cuando era', 'siempre', 'nunca', 'solía', 'normalmente']
      },
      grammar: {
        concepts: ['Imperfect tense', 'Habitual past actions', 'Time expressions'],
        progression: ['simple habits → complex childhood descriptions']
      },
      speaking: {
        startLevel: 'Simple past habits',
        endLevel: 'Childhood routine descriptions',
        progression: ['habits → routines → complete childhood narratives']
      },
      cultural: {
        topics: ['childhood traditions', 'family customs', 'educational systems'],
        activities: ['cultural comparisons', 'tradition explanations']
      }
    },
    completion: {
      minimumLessonsRequired: 4,
      masteryCriteria: {
        vocabularyRetention: 0.75,
        grammarAccuracy: 0.70,
        speakingProgression: true
      }
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  // ... more categories would be added here
];

/**
 * A2 Spaced Repetition Vocabulary Schedule
 * Words that should be reviewed at specific intervals
 */
export interface A2SpacedRepetitionItem {
  word: string;
  translation: string;
  lessonIntroduced: number;
  difficultyLevel: 'easy' | 'medium' | 'hard';
  reviewIntervals: number[]; // days: [1, 3, 7, 14, 30]
  contextSentences: string[];
  relatedWords: string[];
}

export const A2_SPACED_REPETITION_VOCABULARY: A2SpacedRepetitionItem[] = [
  {
    word: 'ayer',
    translation: 'yesterday',
    lessonIntroduced: 321,
    difficultyLevel: 'easy',
    reviewIntervals: [1, 3, 7, 14, 30],
    contextSentences: [
      'Ayer fui al cine con mis amigos.',
      'No estudié ayer por la tarde.',
      'Ayer fue un día muy especial.'
    ],
    relatedWords: ['anoche', 'la semana pasada', 'entonces']
  },
  {
    word: 'entonces',
    translation: 'then',
    lessonIntroduced: 321,
    difficultyLevel: 'medium',
    reviewIntervals: [1, 3, 7, 14, 30],
    contextSentences: [
      'Primero desayuné, entonces fui al trabajo.',
      'Estaba lloviendo, entonces no salí.',
      'Terminé la tarea, entonces pude descansar.'
    ],
    relatedWords: ['después', 'luego', 'primero']
  },
  // ... more vocabulary items
];

/**
 * A2 Grammar Progression Map
 * Shows which grammar concepts build on each other
 */
export const A2_GRAMMAR_PROGRESSION = {
  'preterite-regular': {
    prerequisite: ['present-tense', 'basic-past'],
    enablesAccess: ['preterite-irregular', 'past-narration'],
    masteryThreshold: 0.75
  },
  'imperfect-tense': {
    prerequisite: ['preterite-regular'],
    enablesAccess: ['preterite-vs-imperfect', 'habitual-past'],
    masteryThreshold: 0.70
  },
  'conditional-advice': {
    prerequisite: ['imperfect-tense', 'opinion-expressions'],
    enablesAccess: ['hypothetical-situations', 'polite-requests'],
    masteryThreshold: 0.65
  }
  // ... more grammar progression
};
