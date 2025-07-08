import { Router, Request, Response } from 'express';
import { getSpacedRepetitionEngine } from '../services/spaced-repetition';

const router = Router();

// ===================
// DAILY REVIEW ENDPOINTS
// ===================

/**
 * GET /spaced-repetition/daily-queue
 * Get today's review queue for the user
 */
router.get('/daily-queue', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const language = (req.query.language as string) || 'spanish';

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const engine = getSpacedRepetitionEngine();
    const queue = await engine.generateDailyReviewQueue(userId, language);

    res.json({
      queue,
      message: `${queue.totalItems} items ready for review`
    });
  } catch (error) {
    console.error('Error getting daily review queue:', error);
    res.status(500).json({ error: 'Failed to get review queue' });
  }
});

/**
 * GET /spaced-repetition/review-items
 * Get specific items due for review
 */
router.get('/review-items', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const language = (req.query.language as string) || 'spanish';
    const maxItems = parseInt(req.query.maxItems as string) || 20;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const engine = getSpacedRepetitionEngine();
    const items = await engine.getDailyReviewItems(userId, maxItems, language);

    res.json({
      items,
      count: items.length,
      message: `${items.length} items ready for review`
    });
  } catch (error) {
    console.error('Error getting review items:', error);
    res.status(500).json({ error: 'Failed to get review items' });
  }
});

/**
 * POST /spaced-repetition/submit-review
 * Submit a review response and update schedule
 */
router.post('/submit-review', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { itemId, performanceScore, responseTime, contextUsed } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate input
    if (!itemId || typeof performanceScore !== 'number' || performanceScore < 0 || performanceScore > 5) {
      return res.status(400).json({ 
        error: 'Invalid input. performanceScore must be between 0-5' 
      });
    }

    const engine = getSpacedRepetitionEngine();
    await engine.updateScheduleAfterReview(
      userId,
      itemId,
      performanceScore,
      responseTime || 0,
      contextUsed || 'review'
    );

    res.json({
      success: true,
      message: 'Review submitted successfully'
    });
  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// ===================
// VOCABULARY MANAGEMENT
// ===================

/**
 * POST /spaced-repetition/add-vocabulary
 * Add new vocabulary item to spaced repetition system
 */
router.post('/add-vocabulary', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { word, lessonNumber, language = 'spanish' } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!word || !lessonNumber) {
      return res.status(400).json({ 
        error: 'Word and lessonNumber are required' 
      });
    }

    const engine = getSpacedRepetitionEngine();
    await engine.addVocabularyItem(userId, word, lessonNumber, language);

    res.json({
      success: true,
      message: `Added "${word}" to spaced repetition system`
    });
  } catch (error) {
    console.error('Error adding vocabulary:', error);
    res.status(500).json({ error: 'Failed to add vocabulary' });
  }
});

// ===================
// STATISTICS AND PROGRESS
// ===================

/**
 * GET /spaced-repetition/statistics
 * Get user's spaced repetition statistics
 */
router.get('/statistics', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const language = (req.query.language as string) || 'spanish';

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const engine = getSpacedRepetitionEngine();
    const statistics = await engine.getUserStatistics(userId, language);

    res.json({
      statistics,
      language,
      userId
    });
  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

/**
 * POST /spaced-repetition/reset-difficult
 * Reset difficult items for re-learning
 */
router.post('/reset-difficult', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const language = (req.query.language as string) || 'spanish';

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const engine = getSpacedRepetitionEngine();
    const resetCount = await engine.resetDifficultItems(userId, language);

    res.json({
      success: true,
      message: `Reset ${resetCount} difficult items for re-learning`,
      resetCount
    });
  } catch (error) {
    console.error('Error resetting difficult items:', error);
    res.status(500).json({ error: 'Failed to reset difficult items' });
  }
});

// ===================
// LESSON INTEGRATION
// ===================

/**
 * POST /spaced-repetition/process-lesson
 * Process completed lesson and add new vocabulary to spaced repetition
 */
router.post('/process-lesson', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { lessonNumber, vocabularyLearned, language = 'spanish' } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!lessonNumber || !vocabularyLearned || !Array.isArray(vocabularyLearned)) {
      return res.status(400).json({ 
        error: 'lessonNumber and vocabularyLearned array are required' 
      });
    }

    const engine = getSpacedRepetitionEngine();
    
    // Add all vocabulary items to spaced repetition
    const addPromises = vocabularyLearned.map((word: string) => 
      engine.addVocabularyItem(userId, word, lessonNumber, language)
    );
    
    await Promise.all(addPromises);

    res.json({
      success: true,
      message: `Added ${vocabularyLearned.length} vocabulary items to spaced repetition`,
      vocabularyAdded: vocabularyLearned.length
    });
  } catch (error) {
    console.error('Error processing lesson:', error);
    res.status(500).json({ error: 'Failed to process lesson' });
  }
});

export default router;
