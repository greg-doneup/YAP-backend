import { Router, Request, Response, NextFunction } from "express";
import { 
  getUserProgress, 
  updateUserProgress,
  createUserProgress,
  getLessonsByLanguageAndLevel
} from "../clients/mongodb";
import { UserProgress } from "../types/lesson";
import { generateLesson } from "../services/lesson-generator";
import { validateLessonQuality } from "../services/lesson-validator";
import { cacheGeneratedLesson, getCachedLesson } from "../clients/cache";
import { getProfile, updateProfile } from "../clients/profile";

const router = Router();

// Test middleware to add mock user for local development
const addTestUser = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV !== 'production' && !(req as any).user) {
    (req as any).user = { 
      id: 'test-user-123',
      email: 'test@example.com'
    };
  }
  next();
};

// Apply test user middleware to all routes in development
if (process.env.NODE_ENV !== 'production') {
  router.use(addTestUser);
}

/**
 * POST /lessons/generate
 * Generate a dynamic CEFR-compliant lesson for the user
 */
router.post("/generate", async (req, res) => {
  try {
    const { 
      userId, 
      language, 
      cefrLevel, 
      skillFocus, 
      duration = 15,
      forceRegenerate = false 
    } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    if (!language) {
      return res.status(400).json({ error: "language is required" });
    }

    if (!cefrLevel) {
      return res.status(400).json({ error: "cefrLevel is required (e.g., A1, A2, B1)" });
    }

    // Get user profile to verify language preference (with fallback for local testing)
    let userProfile;
    try {
      userProfile = await getProfile(userId);
    } catch (error) {
      console.log("Profile service not available, using fallback for testing");
      // Create a fallback profile for testing
      userProfile = {
        user_id: userId,
        language_to_learn: language,
        name: "Test User",
        created_at: new Date().toISOString()
      };
    }
    
    if (!userProfile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    // Get user progress to understand their current state
    const userProgress = await getUserProgress(userId);
    
    // Create cache key for lesson request
    const cacheKey = `lesson_${userId}_${language}_${cefrLevel}_${skillFocus || 'general'}_${duration}`;
    
    // Check for cached lesson if not forcing regeneration
    if (!forceRegenerate) {
      const cachedLesson = await getCachedLesson(cacheKey);
      if (cachedLesson) {
        console.log(`Returning cached lesson for user ${userId}`);
        return res.json({
          lesson: cachedLesson.lesson,
          cached: true,
          generatedAt: cachedLesson.generatedAt,
          metadata: cachedLesson.metadata
        });
      }
    }

    // Prepare lesson generation request
    const generationRequest = {
      userId,
      language,
      cefrLevel,
      skillFocus: skillFocus || 'vocabulary',
      duration,
      userProgress: userProgress ? {
        completedLessons: userProgress.completedLessons,
        completedWords: userProgress.completedWords,
        currentLevel: userProgress.level,
        totalXp: userProgress.totalXp
      } : null,
      userPreferences: {
        interests: userProfile.interests || [],
        previousTopics: userProgress?.recentTopics || []
      }
    };

    console.log(`Generating dynamic lesson for user ${userId}: ${language} ${cefrLevel}`);

    // Generate the lesson using AI
    const generatedLesson = await generateLesson(generationRequest);

    // Validate lesson quality and CEFR compliance
    const validationResult = await validateLessonQuality(generatedLesson.lesson, cefrLevel);
    
    if (!validationResult.isValid) {
      console.log(`Lesson validation failed for user ${userId}, regenerating...`);
      
      // Try regenerating with feedback
      const improvedRequest = {
        ...generationRequest,
        previousAttempt: generatedLesson.lesson,
        validationFeedback: validationResult.feedback
      };
      
      const improvedLesson = await generateLesson(improvedRequest);
      const secondValidation = await validateLessonQuality(improvedLesson.lesson, cefrLevel);
      
      if (!secondValidation.isValid) {
        return res.status(500).json({
          error: "Failed to generate valid lesson",
          validationIssues: secondValidation.feedback
        });
      }
      
      // Use the improved lesson
      generatedLesson.lesson = improvedLesson.lesson;
      validationResult.qualityScore = secondValidation.qualityScore;
    }

    // Cache the generated lesson
    const lessonData = {
      lesson: generatedLesson.lesson,
      generatedAt: new Date().toISOString(),
      metadata: {
        userId,
        language,
        cefrLevel,
        skillFocus,
        duration,
        qualityScore: validationResult.qualityScore,
        personalizationFactors: generationRequest.userPreferences
      }
    };

    await cacheGeneratedLesson(cacheKey, lessonData);

    // Update user progress with new lesson availability
    if (userProgress) {
      await updateUserProgress(userId, {
        lastGeneratedLesson: generatedLesson.lesson.lesson_id,
        lastGeneratedAt: new Date().toISOString()
      });
    }

    res.json({
      lesson: generatedLesson.lesson,
      cached: false,
      generatedAt: lessonData.generatedAt,
      metadata: lessonData.metadata,
      qualityScore: validationResult.qualityScore
    });

  } catch (error) {
    console.error("Error generating dynamic lesson:", error);
    res.status(500).json({ 
      error: "Failed to generate lesson",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * PUT /lessons/language
 * Update user's target language and reset progress appropriately
 */
router.put("/language", async (req, res) => {
  try {
    const { userId, newLanguage, targetLevel } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    if (!newLanguage) {
      return res.status(400).json({ error: "newLanguage is required" });
    }

    if (!targetLevel) {
      return res.status(400).json({ error: "targetLevel is required (e.g., A1, A2, B1)" });
    }

    // Validate language is supported
    const supportedLanguages = ['spanish', 'french', 'german', 'italian', 'japanese', 'korean', 'chinese'];
    if (!supportedLanguages.includes(newLanguage.toLowerCase())) {
      return res.status(400).json({ 
        error: "Unsupported language",
        supportedLanguages 
      });
    }

    // Get current user profile and progress
    const userProfile = await getProfile(userId);
    if (!userProfile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    const currentProgress = await getUserProgress(userId);
    const previousLanguage = userProfile.initial_language_to_learn;

    console.log(`User ${userId} changing language from ${previousLanguage} to ${newLanguage}`);

    // Update profile with new language preference
    await updateProfile(userId, {
      initial_language_to_learn: newLanguage,
      updatedAt: new Date().toISOString()
    });

    // Handle progress reset based on language change
    if (currentProgress) {
      // Save backup of previous progress
      const progressBackup = {
        ...currentProgress,
        language: previousLanguage,
        backedUpAt: new Date().toISOString()
      };

      // Reset progress for new language while preserving some achievements
      const resetProgress: Partial<UserProgress> = {
        // Reset language-specific progress
        currentLessonId: undefined,
        currentWordId: undefined,
        completedLessons: [],
        completedWords: [],
        
        // Reset to target level
        level: parseInt(targetLevel.replace(/[^0-9]/g, '')) || 1,
        
        // Preserve some user achievements (but reset XP to level-appropriate amount)
        totalXp: Math.min(currentProgress.totalXp * 0.1, 100), // Keep 10% XP as "transfer credit"
        streak: 0, // Reset streak for new language
        
        // Update activity tracking
        lastActivity: new Date().toISOString(),
        languageChangedAt: new Date().toISOString(),
        previousLanguageBackup: progressBackup
      };

      await updateUserProgress(userId, resetProgress);
    } else {
      // Create new progress for the language
      const newProgress: UserProgress = {
        userId,
        currentLessonId: undefined,
        currentWordId: undefined,
        nextWordAvailableAt: new Date().toISOString(),
        completedLessons: [],
        completedWords: [],
        lastActivity: new Date().toISOString(),
        streak: 0,
        level: parseInt(targetLevel.replace(/[^0-9]/g, '')) || 1,
        totalXp: 0,
        languageChangedAt: new Date().toISOString()
      };

      await createUserProgress(newProgress);
    }

    // Get starter lesson for the new language
    const starterLessons = await getLessonsByLanguageAndLevel(newLanguage, targetLevel);
    
    res.json({
      message: "Language updated successfully",
      newLanguage,
      targetLevel,
      previousLanguage,
      progressReset: !!currentProgress,
      starterLessonsAvailable: starterLessons.length,
      nextSteps: {
        generateFirstLesson: `/lessons/generate`,
        parameters: {
          userId,
          language: newLanguage,
          cefrLevel: targetLevel,
          skillFocus: 'basics'
        }
      }
    });

  } catch (error) {
    console.error("Error updating user language:", error);
    res.status(500).json({ 
      error: "Failed to update language",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * GET /lessons/available-languages
 * Get list of supported languages for dynamic lesson generation
 */
router.get("/available-languages", async (req, res) => {
  try {
    const languages = [
      { code: 'spanish', name: 'Spanish', levels: ['A1', 'A2', 'B1', 'B2'] },
      { code: 'french', name: 'French', levels: ['A1', 'A2', 'B1', 'B2'] },
      { code: 'german', name: 'German', levels: ['A1', 'A2', 'B1', 'B2'] },
      { code: 'italian', name: 'Italian', levels: ['A1', 'A2', 'B1', 'B2'] },
      { code: 'japanese', name: 'Japanese', levels: ['A1', 'A2', 'B1'] },
      { code: 'korean', name: 'Korean', levels: ['A1', 'A2', 'B1'] },
      { code: 'chinese', name: 'Chinese (Mandarin)', levels: ['A1', 'A2', 'B1'] }
    ];

    res.json({
      languages,
      totalLanguages: languages.length,
      features: {
        dynamicGeneration: true,
        cefrCompliant: true,
        personalized: true,
        progressTracking: true
      }
    });
  } catch (error) {
    console.error("Error fetching available languages:", error);
    res.status(500).json({ error: "Failed to fetch available languages" });
  }
});

export default router;
