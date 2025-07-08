import { Router, Request, Response } from 'express';
import { getCEFRLessonDB } from '../services/cefr-lesson-db';
import { CEFRLesson, UserCEFRProgress } from '../models/cefr-lesson';

const router = Router();

// ===================
// LESSON ENDPOINTS
// ===================

/**
 * GET /cefr/lessons/:lessonNumber
 * Get a specific CEFR lesson by number (1-640)
 */
router.get('/lessons/:lessonNumber', async (req: Request, res: Response) => {
  try {
    const { lessonNumber } = req.params;
    const userId = (req as any).user?.id;

    // Validate lesson number
    const lessonNum = parseInt(lessonNumber);
    if (!lessonNumber || isNaN(lessonNum) || lessonNum < 1 || lessonNum > 640) {
      return res.status(400).json({ 
        error: 'Invalid lesson number. Must be between 1 and 640.' 
      });
    }

    const db = getCEFRLessonDB();
    
    // Get lesson
    const lesson = await db.getCEFRLessonByNumber(lessonNum);
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    // Check user access if user is authenticated
    let accessInfo: { canAccess: boolean; missingPrerequisites: number[]; reason?: string } = { 
      canAccess: true, 
      missingPrerequisites: [], 
      reason: undefined 
    };
    let userProgress: UserCEFRProgress | null = null;
    
    if (userId) {
      accessInfo = await db.validateLessonPrerequisites(userId, lessonNum);
      userProgress = await db.getUserProgress(userId);
      
      // Initialize progress for new users
      if (!userProgress) {
        userProgress = await db.initializeUserProgress(userId);
      }
    }

    res.json({
      lesson,
      accessGranted: accessInfo.canAccess,
      accessInfo,
      userProgress: userProgress ? {
        currentLesson: userProgress.currentLesson,
        lessonsCompleted: userProgress.lessonsCompleted,
        currentLevel: userProgress.currentLevel,
        categoryProgress: userProgress.categoryProgress[lesson.theme] || null
      } : null,
      nextLesson: lessonNum < 640 ? lessonNum + 1 : null,
      previousLesson: lessonNum > 1 ? lessonNum - 1 : null
    });

  } catch (error) {
    console.error('Error fetching CEFR lesson:', error);
    res.status(500).json({ error: 'Failed to fetch lesson' });
  }
});

/**
 * GET /cefr/category/:categoryName
 * Get all lessons in a specific category
 */
router.get('/category/:categoryName', async (req: Request, res: Response) => {
  try {
    const { categoryName } = req.params;
    const userId = (req as any).user?.id;

    const db = getCEFRLessonDB();
    
    // Get category info
    const category = await db.getCategoryByName(categoryName);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Get lessons in category
    const lessons = await db.getLessonsByCategory(categoryName);
    
    // Get user progress if authenticated
    let userProgress: UserCEFRProgress | null = null;
    let categoryProgress = null;
    
    if (userId) {
      userProgress = await db.getUserProgress(userId);
      if (userProgress) {
        categoryProgress = userProgress.categoryProgress[categoryName] || null;
      }
    }

    res.json({
      category,
      lessons,
      lessonCount: lessons.length,
      userProgress: categoryProgress,
      completionStatus: categoryProgress ? {
        started: categoryProgress.started,
        completed: categoryProgress.completed,
        lessonsCompleted: categoryProgress.lessonsCompleted.length,
        totalLessons: lessons.length,
        averageScore: categoryProgress.averageScore
      } : null
    });

  } catch (error) {
    console.error('Error fetching category lessons:', error);
    res.status(500).json({ error: 'Failed to fetch category lessons' });
  }
});

/**
 * GET /cefr/level/:levelName
 * Get all lessons for a specific level (Foundation, Elementary, etc.)
 */
router.get('/level/:levelName', async (req: Request, res: Response) => {
  try {
    const { levelName } = req.params;
    const userId = (req as any).user?.id;

    // Validate level
    const validLevels = ['Foundation', 'Elementary', 'Pre-Intermediate', 'Advanced'];
    if (!validLevels.includes(levelName)) {
      return res.status(400).json({ 
        error: 'Invalid level. Must be one of: Foundation, Elementary, Pre-Intermediate, Advanced' 
      });
    }

    const db = getCEFRLessonDB();
    
    // Get lessons and categories for level
    const lessons = await db.getLessonsByLevel(levelName);
    const categories = await db.getCategoriesByLevel(levelName);
    
    // Get user progress if authenticated
    let userProgress: UserCEFRProgress | null = null;
    let levelProgress = null;
    
    if (userId) {
      userProgress = await db.getUserProgress(userId);
      if (userProgress) {
        levelProgress = userProgress.levelProgress[levelName] || null;
      }
    }

    res.json({
      level: levelName,
      lessons,
      categories,
      lessonCount: lessons.length,
      categoryCount: categories.length,
      levelProgress,
      userAccess: {
        canAccessLevel: userProgress ? userProgress.currentLevel === levelName || userProgress.levelsCompleted.includes(levelName) : levelName === 'Foundation',
        unlockedLessons: userProgress?.lessonsUnlocked || [1]
      }
    });

  } catch (error) {
    console.error('Error fetching level lessons:', error);
    res.status(500).json({ error: 'Failed to fetch level lessons' });
  }
});

/**
 * GET /cefr/user/:userId/next
 * Get the next recommended lesson for a user
 */
router.get('/user/:userId/next', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const authenticatedUserId = (req as any).user?.id;

    // Ensure user can only access their own data (or admin)
    if (userId !== authenticatedUserId && !(req as any).user?.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const db = getCEFRLessonDB();
    
    // Get next lesson
    const nextLesson = await db.getNextLessonForUser(userId);
    const userProgress = await db.getUserProgress(userId);
    
    if (!nextLesson) {
      return res.json({
        nextLesson: null,
        courseCompleted: true,
        userProgress,
        message: 'Congratulations! You have completed all 640 lessons.'
      });
    }

    // Validate access to next lesson
    const accessInfo = await db.validateLessonPrerequisites(userId, nextLesson.lessonNumber);

    res.json({
      nextLesson,
      courseCompleted: false,
      userProgress,
      accessGranted: accessInfo.canAccess,
      accessInfo,
      recommendedAction: accessInfo.canAccess ? 'start_lesson' : 'complete_prerequisites'
    });

  } catch (error) {
    console.error('Error fetching next lesson:', error);
    res.status(500).json({ error: 'Failed to fetch next lesson' });
  }
});

// ===================
// LESSON INTERACTION
// ===================

/**
 * POST /cefr/lessons/:lessonId/start
 * Mark a lesson as started for a user
 */
router.post('/lessons/:lessonId/start', async (req: Request, res: Response) => {
  try {
    const { lessonId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const lessonNumber = parseInt(lessonId);
    if (isNaN(lessonNumber)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }

    const db = getCEFRLessonDB();
    
    // Validate access
    const accessInfo = await db.validateLessonPrerequisites(userId, lessonNumber);
    if (!accessInfo.canAccess) {
      return res.status(403).json({ 
        error: 'Cannot access lesson',
        reason: accessInfo.reason,
        missingPrerequisites: accessInfo.missingPrerequisites
      });
    }

    // Get lesson details
    const lesson = await db.getCEFRLessonByNumber(lessonNumber);
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    // Mark lesson as started (track in session or analytics)
    // For now, just return lesson structure for frontend
    res.json({
      success: true,
      lesson,
      sessionStarted: new Date(),
      estimatedDuration: lesson.estimatedDuration,
      sections: lesson.sections,
      assessmentCriteria: lesson.assessment
    });

  } catch (error) {
    console.error('Error starting lesson:', error);
    res.status(500).json({ error: 'Failed to start lesson' });
  }
});

/**
 * POST /cefr/lessons/:lessonId/complete
 * Complete a lesson and update user progress
 */
router.post('/lessons/:lessonId/complete', async (req: Request, res: Response) => {
  try {
    const { lessonId } = req.params;
    const userId = (req as any).user?.id;
    const { 
      vocabularyScore, 
      grammarScore, 
      speakingScore, 
      timeSpent,
      culturalEngagement,
      sectionScores 
    } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const lessonNumber = parseInt(lessonId);
    if (isNaN(lessonNumber)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }

    // Validate required scores
    if (typeof vocabularyScore !== 'number' || typeof grammarScore !== 'number' || typeof speakingScore !== 'number') {
      return res.status(400).json({ error: 'Missing required scores (vocabularyScore, grammarScore, speakingScore)' });
    }

    if (typeof timeSpent !== 'number' || timeSpent <= 0) {
      return res.status(400).json({ error: 'Invalid timeSpent value' });
    }

    const db = getCEFRLessonDB();
    
    // Get lesson to check requirements
    const lesson = await db.getCEFRLessonByNumber(lessonNumber);
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    // Validate cultural engagement requirement
    if (lesson.culturalFocus && lesson.assessment.culturalEngagement && typeof culturalEngagement !== 'boolean') {
      return res.status(400).json({ error: 'Cultural engagement required for this lesson' });
    }

    // Complete lesson and update progress
    const updatedProgress = await db.completeLessonForUser(
      userId,
      lessonNumber,
      {
        vocabularyScore,
        grammarScore,
        speakingScore,
        timeSpent,
        culturalEngagement
      }
    );

    // Check if lesson was passed
    const passed = vocabularyScore >= (lesson.assessment.vocabularyMastery * 100) &&
                   grammarScore >= (lesson.assessment.grammarAccuracy * 100) &&
                   speakingScore >= lesson.assessment.speakingScore &&
                   (!lesson.assessment.culturalEngagement || culturalEngagement);

    // Get next lesson recommendation
    const nextLesson = await db.getNextLessonForUser(userId);

    res.json({
      success: true,
      passed,
      scores: {
        vocabulary: vocabularyScore,
        grammar: grammarScore,
        speaking: speakingScore,
        overall: (vocabularyScore + grammarScore + speakingScore) / 3
      },
      progress: {
        currentLesson: updatedProgress.currentLesson,
        lessonsCompleted: updatedProgress.lessonsCompleted.length,
        currentLevel: updatedProgress.currentLevel,
        totalLessons: 640
      },
      nextLesson: nextLesson ? {
        lessonNumber: nextLesson.lessonNumber,
        theme: nextLesson.theme,
        focus: nextLesson.focus
      } : null,
      achievements: checkForAchievements(updatedProgress, lesson),
      feedback: generateLessonFeedback(lesson, { vocabularyScore, grammarScore, speakingScore }, passed)
    });

  } catch (error) {
    console.error('Error completing lesson:', error);
    res.status(500).json({ error: 'Failed to complete lesson' });
  }
});

// ===================
// PROGRESS ENDPOINTS
// ===================

/**
 * GET /cefr/progress/:userId
 * Get comprehensive progress overview for a user
 */
router.get('/progress/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const authenticatedUserId = (req as any).user?.id;

    // Ensure user can only access their own data (or admin)
    if (userId !== authenticatedUserId && !(req as any).user?.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const db = getCEFRLessonDB();
    
    const progress = await db.getUserProgress(userId);
    if (!progress) {
      return res.status(404).json({ error: 'User progress not found' });
    }

    // Get additional statistics
    const totalCategories = await db.getAllCategories();
    const completedCategories = Object.values(progress.categoryProgress).filter(cp => cp.completed).length;

    res.json({
      progress,
      statistics: {
        overallCompletion: (progress.lessonsCompleted.length / 640) * 100,
        currentStreak: calculateStreak(progress),
        totalTimeSpent: progress.timeSpent.total,
        averageSessionLength: progress.timeSpent.averageSessionLength,
        levelsCompleted: progress.levelsCompleted.length,
        categoriesCompleted: completedCategories,
        totalCategories: totalCategories.length,
        skillLevels: progress.skillLevels
      },
      recommendations: await generateRecommendations(progress, db)
    });

  } catch (error) {
    console.error('Error fetching user progress:', error);
    res.status(500).json({ error: 'Failed to fetch user progress' });
  }
});

// ===================
// UTILITY FUNCTIONS
// ===================

/**
 * Check for achievements based on progress
 */
function checkForAchievements(progress: UserCEFRProgress, lesson: CEFRLesson): string[] {
  const achievements: string[] = [];

  // Lesson milestones
  if (lesson.lessonNumber === 10) achievements.push('First 10 Lessons Completed');
  if (lesson.lessonNumber === 50) achievements.push('Halfway Through Foundation');
  if (lesson.lessonNumber === 80) achievements.push('Foundation Level Complete');
  if (lesson.lessonNumber === 160) achievements.push('Elementary Level Complete');
  if (lesson.lessonNumber === 240) achievements.push('Pre-Intermediate Level Complete');
  if (lesson.lessonNumber === 320) achievements.push('Spanish A1 Course Complete');
  if (lesson.lessonNumber === 400) achievements.push('A2 Foundation Level Complete');
  if (lesson.lessonNumber === 480) achievements.push('A2 Elementary Level Complete');
  if (lesson.lessonNumber === 560) achievements.push('A2 Pre-Intermediate Level Complete');
  if (lesson.lessonNumber === 640) achievements.push('Spanish A2 Course Complete - Full A1-A2 Mastery!');

  // Category completions
  const categoryProgress = progress.categoryProgress[lesson.theme];
  if (categoryProgress?.completed) {
    achievements.push(`${lesson.theme} Category Mastered`);
  }

  // Skill achievements
  if (progress.skillLevels.vocabulary.wordsMastered >= 100) {
    achievements.push('100 Words Mastered');
  }
  if (progress.skillLevels.vocabulary.wordsMastered >= 500) {
    achievements.push('500 Words Mastered');
  }

  return achievements;
}

/**
 * Generate personalized feedback for lesson completion
 */
function generateLessonFeedback(
  lesson: CEFRLesson, 
  scores: { vocabularyScore: number; grammarScore: number; speakingScore: number }, 
  passed: boolean
): { message: string; areas: string[]; nextSteps: string[] } {
  const feedback = {
    message: '',
    areas: [] as string[],
    nextSteps: [] as string[]
  };

  if (passed) {
    feedback.message = `¡Excelente! You successfully completed ${lesson.theme}. `;
    
    // Identify strong areas
    if (scores.vocabularyScore >= 90) feedback.areas.push('Excellent vocabulary retention');
    if (scores.grammarScore >= 90) feedback.areas.push('Strong grammar understanding');
    if (scores.speakingScore >= 90) feedback.areas.push('Outstanding pronunciation');
    
    feedback.nextSteps.push('Continue to the next lesson');
    feedback.nextSteps.push('Review today\'s vocabulary in spaced repetition');
  } else {
    feedback.message = `Good effort on ${lesson.theme}! Let's identify areas for improvement. `;
    
    // Identify improvement areas
    if (scores.vocabularyScore < lesson.assessment.vocabularyMastery * 100) {
      feedback.areas.push('Vocabulary needs more practice');
      feedback.nextSteps.push('Review vocabulary flashcards');
    }
    if (scores.grammarScore < lesson.assessment.grammarAccuracy * 100) {
      feedback.areas.push('Grammar concepts need reinforcement');
      feedback.nextSteps.push('Practice grammar exercises');
    }
    if (scores.speakingScore < lesson.assessment.speakingScore) {
      feedback.areas.push('Speaking needs more practice');
      feedback.nextSteps.push('Record yourself speaking and compare');
    }
    
    feedback.nextSteps.push('Retry this lesson when ready');
  }

  return feedback;
}

/**
 * Calculate current learning streak
 */
function calculateStreak(progress: UserCEFRProgress): number {
  // Simple implementation - could be enhanced with daily tracking
  const recentLessons = progress.lessonsCompleted.slice(-7); // Last 7 lessons
  return recentLessons.length;
}

/**
 * Generate personalized recommendations
 */
async function generateRecommendations(progress: UserCEFRProgress, db: any): Promise<string[]> {
  const recommendations: string[] = [];

  // Learning pace recommendations
  if (progress.timeSpent.total > 0) {
    const lessonsPerHour = progress.lessonsCompleted.length / (progress.timeSpent.total / 60);
    if (lessonsPerHour < 1) {
      recommendations.push('Consider shorter, more frequent study sessions');
    }
  }

  // Skill-specific recommendations
  if (progress.skillLevels.vocabulary.averageRetention < 0.7) {
    recommendations.push('Focus on vocabulary review using spaced repetition');
  }

  if (progress.skillLevels.speaking.averageScore < 70) {
    recommendations.push('Practice speaking exercises more frequently');
  }

  // Progress recommendations
  if (progress.lessonsCompleted.length < 10) {
    recommendations.push('Complete your first 10 lessons to build momentum');
  } else if (progress.lessonsCompleted.length < 50) {
    recommendations.push('You\'re making great progress! Keep up the daily practice');
  }

  return recommendations;
}

export default router;
