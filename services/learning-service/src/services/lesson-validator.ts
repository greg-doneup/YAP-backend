import { Lesson } from "../types/lesson";

export interface ValidationResult {
  isValid: boolean;
  qualityScore: number;
  feedback: string[];
  cefrCompliant: boolean;
  detailedScores: {
    vocabularyLevel: number;
    grammarComplexity: number;
    contentCoherence: number;
    exerciseQuality: number;
  };
}

/**
 * CEFR level specifications for validation
 */
const CEFR_VALIDATION_CRITERIA = {
  A1: {
    maxVocabularyDifficulty: 1.5,
    minVocabularyCount: 4,
    maxVocabularyCount: 6,
    maxSentenceLength: 8,
    requiredTags: ['greeting', 'basic', 'common'],
    minExercises: 1
  },
  A2: {
    maxVocabularyDifficulty: 2.0,
    minVocabularyCount: 5,
    maxVocabularyCount: 8,
    maxSentenceLength: 12,
    requiredTags: ['conversation', 'practical'],
    minExercises: 1
  },
  B1: {
    maxVocabularyDifficulty: 2.5,
    minVocabularyCount: 6,
    maxVocabularyCount: 10,
    maxSentenceLength: 15,
    requiredTags: ['discussion', 'opinion'],
    minExercises: 2
  },
  B2: {
    maxVocabularyDifficulty: 3.0,
    minVocabularyCount: 8,
    maxVocabularyCount: 12,
    maxSentenceLength: 20,
    requiredTags: ['analysis', 'complex'],
    minExercises: 2
  }
};

/**
 * Validate lesson quality and CEFR compliance
 */
export async function validateLessonQuality(lesson: Lesson, targetLevel: string): Promise<ValidationResult> {
  try {
    const criteria = CEFR_VALIDATION_CRITERIA[targetLevel as keyof typeof CEFR_VALIDATION_CRITERIA];
    if (!criteria) {
      throw new Error(`Unsupported CEFR level for validation: ${targetLevel}`);
    }

    const validationScores = {
      vocabularyLevel: await validateVocabularyLevel(lesson, criteria),
      grammarComplexity: await validateGrammarComplexity(lesson, criteria),
      contentCoherence: await validateContentCoherence(lesson),
      exerciseQuality: await validateExerciseQuality(lesson, criteria)
    };

    const overallScore = Object.values(validationScores).reduce((sum, score) => sum + score, 0) / 4;
    const isValid = overallScore >= 0.8 && validationScores.vocabularyLevel >= 0.7;

    const feedback = generateValidationFeedback(lesson, validationScores, criteria);

    return {
      isValid,
      qualityScore: overallScore,
      feedback,
      cefrCompliant: validationScores.vocabularyLevel >= 0.8 && validationScores.grammarComplexity >= 0.7,
      detailedScores: validationScores
    };

  } catch (error) {
    console.error("Error validating lesson quality:", error);
    return {
      isValid: false,
      qualityScore: 0,
      feedback: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      cefrCompliant: false,
      detailedScores: {
        vocabularyLevel: 0,
        grammarComplexity: 0,
        contentCoherence: 0,
        exerciseQuality: 0
      }
    };
  }
}

/**
 * Validate vocabulary level appropriateness
 */
async function validateVocabularyLevel(lesson: Lesson, criteria: any): Promise<number> {
  const vocab = lesson.new_vocabulary;
  
  // Check vocabulary count
  if (vocab.length < criteria.minVocabularyCount || vocab.length > criteria.maxVocabularyCount) {
    return 0.3;
  }

  // Check average difficulty
  const avgDifficulty = vocab.reduce((sum, word) => sum + word.difficulty, 0) / vocab.length;
  if (avgDifficulty > criteria.maxVocabularyDifficulty) {
    return 0.4;
  }

  // Check for required vocabulary types
  const allTags = vocab.flatMap(word => word.tags || []);
  const hasRequiredTags = criteria.requiredTags.some((tag: string) => 
    allTags.some(vocabTag => vocabTag.toLowerCase().includes(tag.toLowerCase()))
  );

  if (!hasRequiredTags) {
    return 0.6;
  }

  // Check example quality
  const hasGoodExamples = vocab.every(word => 
    word.examples && word.examples.length >= 1 && 
    word.examples.every(example => example.length > 5)
  );

  if (!hasGoodExamples) {
    return 0.7;
  }

  return 0.95; // High score for well-structured vocabulary
}

/**
 * Validate grammar complexity appropriateness
 */
async function validateGrammarComplexity(lesson: Lesson, criteria: any): Promise<number> {
  const examples = lesson.new_vocabulary.flatMap(word => word.examples || []);
  
  if (examples.length === 0) {
    return 0.2;
  }

  // Check sentence length compliance
  const avgSentenceLength = examples.reduce((sum, example) => {
    return sum + example.split(' ').length;
  }, 0) / examples.length;

  if (avgSentenceLength > criteria.maxSentenceLength) {
    return 0.5;
  }

  // Check for grammatical variety
  const hasVariety = examples.some(example => example.includes('?')) && 
                    examples.some(example => example.includes('.'));

  if (!hasVariety) {
    return 0.7;
  }

  return 0.9;
}

/**
 * Validate content coherence and structure
 */
async function validateContentCoherence(lesson: Lesson): Promise<number> {
  let score = 0;

  // Check if lesson has a clear focus
  if (lesson.focus && lesson.focus.length > 0) {
    score += 0.3;
  }

  // Check if vocabulary relates to the focus
  const focusKeywords = lesson.focus?.toLowerCase().split(/[\s_]+/) || [];
  const vocabTags = lesson.new_vocabulary.flatMap(word => word.tags || []);
  const focusAlignment = focusKeywords.some(keyword => 
    vocabTags.some(tag => tag.toLowerCase().includes(keyword))
  );

  if (focusAlignment) {
    score += 0.3;
  }

  // Check if exercises relate to vocabulary
  const exerciseContent = lesson.speaking_exercises?.map(ex => ex.prompt + ' ' + ex.items?.map(item => item.question).join(' ')).join(' ') || '';
  const vocabTerms = lesson.new_vocabulary.map(word => word.term);
  const exerciseVocabAlignment = vocabTerms.some(term => 
    exerciseContent.toLowerCase().includes(term.toLowerCase()) ||
    exerciseContent.includes('vocabulary') || 
    exerciseContent.includes('words')
  );

  if (exerciseVocabAlignment) {
    score += 0.4;
  }

  return Math.min(score, 1.0);
}

/**
 * Validate exercise quality and appropriateness
 */
async function validateExerciseQuality(lesson: Lesson, criteria: any): Promise<number> {
  const exercises = lesson.speaking_exercises || [];
  
  if (exercises.length < criteria.minExercises) {
    return 0.3;
  }

  let score = 0.5; // Base score for having exercises

  // Check exercise structure
  const wellStructured = exercises.every(exercise => 
    exercise.prompt && exercise.prompt.length > 10 &&
    exercise.items && exercise.items.length > 0 &&
    exercise.items.every(item => item.question && item.example_answer)
  );

  if (wellStructured) {
    score += 0.3;
  }

  // Check for interactive elements
  const isInteractive = exercises.some(exercise => 
    exercise.prompt.toLowerCase().includes('practice') ||
    exercise.prompt.toLowerCase().includes('conversation') ||
    exercise.items?.some(item => item.question.includes('?'))
  );

  if (isInteractive) {
    score += 0.2;
  }

  return Math.min(score, 1.0);
}

/**
 * Generate detailed validation feedback
 */
function generateValidationFeedback(lesson: Lesson, scores: any, criteria: any): string[] {
  const feedback: string[] = [];

  if (scores.vocabularyLevel < 0.8) {
    if (lesson.new_vocabulary.length < criteria.minVocabularyCount) {
      feedback.push(`Add more vocabulary items (minimum ${criteria.minVocabularyCount})`);
    }
    if (lesson.new_vocabulary.length > criteria.maxVocabularyCount) {
      feedback.push(`Reduce vocabulary items (maximum ${criteria.maxVocabularyCount})`);
    }
    
    const avgDifficulty = lesson.new_vocabulary.reduce((sum, word) => sum + word.difficulty, 0) / lesson.new_vocabulary.length;
    if (avgDifficulty > criteria.maxVocabularyDifficulty) {
      feedback.push(`Reduce vocabulary difficulty (current average: ${avgDifficulty.toFixed(1)}, max: ${criteria.maxVocabularyDifficulty})`);
    }
  }

  if (scores.grammarComplexity < 0.8) {
    feedback.push("Simplify sentence structure in examples");
    feedback.push("Ensure sentences are appropriate for the CEFR level");
  }

  if (scores.contentCoherence < 0.8) {
    feedback.push("Improve alignment between vocabulary and lesson focus");
    feedback.push("Ensure exercises relate directly to the new vocabulary");
  }

  if (scores.exerciseQuality < 0.8) {
    feedback.push("Add more interactive speaking exercises");
    feedback.push("Ensure all exercises have clear instructions and example answers");
  }

  if (feedback.length === 0) {
    feedback.push("Lesson meets quality standards");
  }

  return feedback;
}
