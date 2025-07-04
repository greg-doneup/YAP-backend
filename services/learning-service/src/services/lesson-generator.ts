import { generateContent } from "../clients/ai-integration";
import { Lesson, VocabItem, SpeakingExercise } from "../types/lesson";

export interface LessonGenerationRequest {
  userId: string;
  language: string;
  cefrLevel: string;
  skillFocus: string;
  duration: number;
  userProgress?: {
    completedLessons: string[];
    completedWords: string[];
    currentLevel: number;
    totalXp: number;
  } | null;
  userPreferences?: {
    interests: string[];
    previousTopics: string[];
  };
  previousAttempt?: any;
  validationFeedback?: string[];
}

export interface GeneratedLessonResponse {
  lesson: Lesson;
  generationMetadata: {
    promptUsed: string;
    aiModel: string;
    generatedAt: string;
    processingTime: number;
  };
}

/**
 * CEFR Level specifications for lesson generation
 */
const CEFR_SPECIFICATIONS = {
  A1: {
    vocabularyCount: { min: 4, max: 6 },
    grammarComplexity: 1,
    sentenceLength: { min: 3, max: 8 },
    concepts: ['present tense', 'basic nouns', 'simple adjectives', 'personal pronouns'],
    skillWeights: { vocabulary: 0.5, grammar: 0.3, speaking: 0.2 }
  },
  A2: {
    vocabularyCount: { min: 5, max: 8 },
    grammarComplexity: 2,
    sentenceLength: { min: 5, max: 12 },
    concepts: ['past tense', 'future tense', 'comparatives', 'modal verbs'],
    skillWeights: { vocabulary: 0.4, grammar: 0.3, speaking: 0.3 }
  },
  B1: {
    vocabularyCount: { min: 6, max: 10 },
    grammarComplexity: 3,
    sentenceLength: { min: 8, max: 15 },
    concepts: ['conditional tense', 'passive voice', 'reported speech', 'complex sentences'],
    skillWeights: { vocabulary: 0.3, grammar: 0.35, speaking: 0.35 }
  },
  B2: {
    vocabularyCount: { min: 8, max: 12 },
    grammarComplexity: 4,
    sentenceLength: { min: 10, max: 20 },
    concepts: ['subjunctive mood', 'advanced tenses', 'idiomatic expressions', 'nuanced meaning'],
    skillWeights: { vocabulary: 0.25, grammar: 0.35, speaking: 0.4 }
  }
};

/**
 * Generate a dynamic CEFR-compliant lesson using AI
 */
export async function generateLesson(request: LessonGenerationRequest): Promise<GeneratedLessonResponse> {
  const startTime = Date.now();
  
  try {
    // Get CEFR specifications for the target level
    const cefrSpec = CEFR_SPECIFICATIONS[request.cefrLevel as keyof typeof CEFR_SPECIFICATIONS];
    if (!cefrSpec) {
      throw new Error(`Unsupported CEFR level: ${request.cefrLevel}`);
    }

    // Build AI prompt for lesson generation
    const prompt = buildLessonGenerationPrompt(request, cefrSpec);
    
    // Generate lesson content using AI
    const aiResponse = await generateContent({
      prompt,
      maxTokens: 2000,
      temperature: 0.7,
      systemPrompt: buildSystemPrompt(request.language, request.cefrLevel)
    });

    // Parse and structure the AI response
    const lesson = await parseAndStructureLesson(aiResponse, request, cefrSpec);
    
    const processingTime = Date.now() - startTime;
    
    return {
      lesson,
      generationMetadata: {
        promptUsed: prompt,
        aiModel: "gpt-4", // or whichever model was used
        generatedAt: new Date().toISOString(),
        processingTime
      }
    };

  } catch (error) {
    console.error("Error in lesson generation:", error);
    throw new Error(`Failed to generate lesson: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Build the AI prompt for lesson generation
 */
function buildLessonGenerationPrompt(request: LessonGenerationRequest, cefrSpec: any): string {
  const { language, cefrLevel, skillFocus, duration, userProgress, userPreferences } = request;
  
  let prompt = `Create a ${cefrLevel} level ${language} language lesson focused on ${skillFocus}.

LESSON REQUIREMENTS:
- Duration: ${duration} minutes
- CEFR Level: ${cefrLevel}
- Target Language: ${language}
- Skill Focus: ${skillFocus}
- Vocabulary Items: ${cefrSpec.vocabularyCount.min}-${cefrSpec.vocabularyCount.max} words/phrases
- Grammar Concepts: ${cefrSpec.concepts.slice(0, 2).join(', ')}

`;

  // Add user context if available
  if (userProgress && userProgress.completedLessons.length > 0) {
    prompt += `USER CONTEXT:
- Completed ${userProgress.completedLessons.length} lessons
- Current Level: ${userProgress.currentLevel}
- Total XP: ${userProgress.totalXp}
- Avoid repeating previously covered topics

`;
  }

  // Add interests if available
  if (userPreferences && userPreferences.interests.length > 0) {
    prompt += `USER INTERESTS: ${userPreferences.interests.join(', ')}
Incorporate these interests naturally into the lesson content.

`;
  }

  // Add validation feedback if this is a regeneration
  if (request.validationFeedback) {
    prompt += `IMPROVEMENT FEEDBACK:
${request.validationFeedback.join('\n')}
Please address these issues in the new lesson.

`;
  }

  prompt += `REQUIRED JSON FORMAT:
{
  "lesson_id": "dynamic-${language}-${cefrLevel.toLowerCase()}-${Date.now()}",
  "title": "Lesson title in English",
  "description": "Brief description of what students will learn",
  "language": "${language}",
  "level": "${cefrLevel}",
  "focus": "${skillFocus}",
  "new_vocabulary": [
    {
      "id": "unique-word-id",
      "term": "word or phrase in ${language}",
      "translation": "English translation",
      "difficulty": 1-3,
      "examples": ["Example sentence 1", "Example sentence 2"],
      "tags": ["relevant", "tags"]
    }
  ],
  "speaking_exercises": [
    {
      "type": "conversation",
      "prompt": "Exercise instruction in English",
      "items": [
        {
          "question": "Question or prompt",
          "example_answer": "Example response using new vocabulary"
        }
      ],
      "leveling_note": "Pronunciation or grammar focus note"
    }
  ],
  "review_points": [
    "Key learning point 1",
    "Key learning point 2"
  ]
}

IMPORTANT GUIDELINES:
1. All vocabulary must be appropriate for ${cefrLevel} level
2. Include practical, everyday phrases students can use immediately
3. Examples should demonstrate proper usage and context
4. Speaking exercises should encourage active use of new vocabulary
5. Ensure cultural appropriateness and modern language usage
6. Make the content engaging and relevant to adult learners`;

  return prompt;
}

/**
 * Build system prompt for the AI
 */
function buildSystemPrompt(language: string, cefrLevel: string): string {
  return `You are an expert language teacher and curriculum designer specializing in ${language}. You create CEFR-compliant language lessons that are engaging, practical, and pedagogically sound.

Your expertise includes:
- CEFR framework and level-appropriate content
- Modern ${language} language usage and cultural context
- Effective vocabulary acquisition techniques
- Communicative language teaching methods
- Adult language learning principles

Generate lessons that are:
- Immediately practical and usable
- Culturally authentic and current
- Appropriately challenging for ${cefrLevel} level
- Focused on real-world communication
- Engaging and motivating for adult learners

Always respond with valid JSON matching the specified format exactly.`;
}

/**
 * Parse and structure the AI response into a proper Lesson object
 */
async function parseAndStructureLesson(
  aiResponse: string, 
  request: LessonGenerationRequest, 
  cefrSpec: any
): Promise<Lesson> {
  try {
    // Extract JSON from AI response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in AI response");
    }

    const lessonData = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!lessonData.lesson_id || !lessonData.title || !lessonData.new_vocabulary) {
      throw new Error("Missing required fields in generated lesson");
    }

    // Ensure vocabulary count is within CEFR specifications
    if (lessonData.new_vocabulary.length < cefrSpec.vocabularyCount.min) {
      throw new Error(`Insufficient vocabulary items: ${lessonData.new_vocabulary.length} < ${cefrSpec.vocabularyCount.min}`);
    }

    // Structure the lesson properly
    const lesson: Lesson = {
      lesson_id: lessonData.lesson_id,
      title: lessonData.title,
      description: lessonData.description || `${request.cefrLevel} level ${request.language} lesson`,
      language: request.language,
      level: request.cefrLevel,
      focus: request.skillFocus,
      new_vocabulary: lessonData.new_vocabulary.map((vocab: any, index: number) => ({
        id: vocab.id || `${lessonData.lesson_id}-word-${index + 1}`,
        term: vocab.term,
        translation: vocab.translation,
        difficulty: vocab.difficulty || 1,
        examples: vocab.examples || [],
        tags: vocab.tags || []
      })),
      speaking_exercises: lessonData.speaking_exercises || [],
      review_points: lessonData.review_points || []
    };

    return lesson;

  } catch (error) {
    console.error("Error parsing AI response:", error);
    throw new Error(`Failed to parse lesson data: ${error instanceof Error ? error.message : 'Invalid format'}`);
  }
}
