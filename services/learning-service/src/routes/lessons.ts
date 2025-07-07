import { Router } from "express";
import { 
  getLessonById, 
  getLessonsByLanguageAndLevel 
} from "../clients/db";
import { learningProgressionMiddleware } from "../middleware/progression-middleware";

const router = Router();

/**
 * GET /lessons/:lessonId
 * Get lesson details by ID with progression validation
 */
router.get("/:lessonId", 
  learningProgressionMiddleware.validateLessonAccess(),
  async (req, res) => {
    try {
      const { lessonId } = req.params;
      
      const lesson = await getLessonById(lessonId);
      
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      // Include progression information in response
      res.json({
        ...lesson,
        progressionInfo: {
          accessGranted: true,
          validation: (req as any).progressionValidation
        }
      });
    } catch (error) {
      console.error("Error fetching lesson:", error);
      res.status(500).json({ error: "Failed to fetch lesson" });
    }
  }
);

/**
 * GET /lessons
 * Get lessons by language and level with progression validation
 */
router.get("/", 
  learningProgressionMiddleware.validateLevelAccess(),
  async (req, res) => {
    try {
      const { language, level } = req.query;
      
      if (!language || typeof language !== "string") {
        return res.status(400).json({ error: "Language is required" });
      }
      
      if (!level || typeof level !== "string") {
        return res.status(400).json({ error: "Level is required" });
      }
      
      const lessons = await getLessonsByLanguageAndLevel(language, level);
      const lessonsData = await getLessonsByLanguageAndLevel(language, level);
      
      // Include progression information with lessons
      res.json({ 
        lessons: lessonsData,
        progressionInfo: {
          level,
          accessGranted: true,
          validation: (req as any).progressionValidation
        }
      });
    } catch (error) {
      console.error("Error fetching lessons:", error);
      res.status(500).json({ error: "Failed to fetch lessons" });
    }
  }
);

/**
 * GET /lessons/next/:lessonId
 * Get the next lesson after the specified lesson with progression validation
 */
router.get("/next/:lessonId", 
  learningProgressionMiddleware.validateLessonPrerequisites(),
  async (req, res) => {
    try {
      const { lessonId } = req.params;
      
      if (!lessonId) {
        return res.status(400).json({ error: "Lesson ID is required" });
      }
      
      // Get the current lesson to determine language and level
      const currentLesson = await getLessonById(lessonId);
      
      if (!currentLesson) {
        return res.status(404).json({ error: "Current lesson not found" });
      }
      
      // Get all lessons for this language and level
      const lessons = await getLessonsByLanguageAndLevel(
        currentLesson.language, 
        currentLesson.level
      );
      
      // Find the current lesson's index
      const currentIndex = lessons.findIndex(lesson => lesson.lesson_id === lessonId);
      
      if (currentIndex === -1 || currentIndex === lessons.length - 1) {
        // No next lesson (current is last, or not found)
        return res.status(404).json({ error: "No next lesson available" });
      }
      
      // Return the next lesson
      const nextLesson = lessons[currentIndex + 1];
      
      res.json({
        ...nextLesson,
        progressionInfo: {
          previousLesson: lessonId,
          sequencePosition: currentIndex + 2,
          totalInLevel: lessons.length
        }
      });
    } catch (error) {
      console.error("Error fetching next lesson:", error);
      res.status(500).json({ error: "Failed to fetch next lesson" });
    }
  }
);

/**
 * POST /lessons/:lessonId/unlock
 * Unlock a lesson with tokens (skip-ahead functionality)
 */
router.post("/:lessonId/unlock",
  learningProgressionMiddleware.processSkipAhead(),
  async (req, res) => {
    try {
      const { lessonId } = req.params;
      const userId = (req as any).user?.id;
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const skipAheadResult = (req as any).skipAheadResult;
      
      if (!skipAheadResult?.success) {
        return res.status(402).json({ 
          error: "Skip-ahead failed",
          details: skipAheadResult?.reason || "Unknown error"
        });
      }
      
      // Get the unlocked lesson
      const lesson = await getLessonById(lessonId);
      
      res.json({
        success: true,
        lesson,
        unlockDetails: {
          tokensSpent: skipAheadResult.tokensSpent,
          newLevel: skipAheadResult.newLevel,
          unlockedAt: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error("Error unlocking lesson:", error);
      res.status(500).json({ error: "Failed to unlock lesson" });
    }
  }
);

/**
 * GET /progression/status
 * Get user's progression status
 */
router.get("/progression/status", learningProgressionMiddleware.getProgressionStatus());

export default router;
