import { Router } from "express";
import { 
  getUserProgress, 
  createUserProgress, 
  updateUserProgress,
  getLessonCompletions,
  getLessonById
} from "../clients/db";
import { UserProgress, LessonCompletion } from "../types/lesson";

const router = Router();

/**
 * GET /progress
 * Fetch the current lesson progress for a user
 */
router.get("/", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "Valid userId is required" });
    }

    const progress = await getUserProgress(userId);

    if (!progress) {
      // If no progress found, return 404
      return res.status(404).json({ error: "Progress not found for the user" });
    }

    // Return only the JWT-essential fields if query param minimal=true
    if (req.query.minimal === 'true') {
      const { currentLessonId, currentWordId, nextWordAvailableAt } = progress;
      return res.json({ currentLessonId, currentWordId, nextWordAvailableAt });
    }

    res.json(progress);
  } catch (error) {
    console.error("Error fetching user progress:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /progress
 * Update the user's lesson progress
 */
router.post("/", async (req, res) => {
  try {
    const { userId, currentLessonId, currentWordId, nextWordAvailableAt } = req.body;

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "Valid userId is required" });
    }

    if (!currentLessonId || !currentWordId) {
      return res.status(400).json({ error: "Lesson and word IDs are required" });
    }

    // Check if lesson exists
    const lesson = await getLessonById(currentLessonId);
    if (!lesson) {
      return res.status(400).json({ error: "Invalid lesson ID" });
    }

    // Verify word exists in the lesson
    const wordExists = lesson.new_vocabulary.some(word => word.id === currentWordId);
    if (!wordExists) {
      return res.status(400).json({ error: "Invalid word ID for this lesson" });
    }

    // Get current progress 
    const existingProgress = await getUserProgress(userId);
    
    // Update if exists, create if not
    let result: boolean | string;
    
    if (existingProgress) {
      // For existing progress, update only the specified fields
      const updates: Partial<UserProgress> = {
        currentLessonId,
        currentWordId,
        lastActivity: new Date().toISOString()
      };
      
      // Only set nextWordAvailableAt if provided
      if (nextWordAvailableAt) {
        updates.nextWordAvailableAt = nextWordAvailableAt;
      }
      
      result = await updateUserProgress(userId, updates);
    } else {
      // Create new progress record with defaults
      const now = new Date().toISOString();
      const newProgress: UserProgress = {
        userId,
        currentLessonId,
        currentWordId,
        nextWordAvailableAt: nextWordAvailableAt || now,
        completedLessons: [],
        completedWords: [],
        lastActivity: now,
        streak: 0,
        level: 1,
        totalXp: 0
      };
      
      result = await createUserProgress(newProgress);
    }

    if (result) {
      res.status(200).json({ 
        message: "Progress updated successfully",
        currentLessonId,
        currentWordId,
        nextWordAvailableAt: nextWordAvailableAt || new Date().toISOString()
      });
    } else {
      res.status(500).json({ error: "Failed to update progress" });
    }
  } catch (error) {
    console.error("Error updating user progress:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /progress/history
 * Get user's lesson completion history
 */
router.get("/history", async (req, res) => {
  try {
    const { userId, limit } = req.query;

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "Valid userId is required" });
    }

    // Parse limit or use default
    const limitNum = limit ? parseInt(limit as string) : 10;
    
    const completions = await getLessonCompletions(userId, limitNum);
    
    res.json({ completions });
  } catch (error) {
    console.error("Error fetching completion history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
