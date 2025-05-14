import { Router } from "express";
import { 
  getLessonById, 
  getLessonsByLanguageAndLevel 
} from "../clients/db";

const router = Router();

/**
 * GET /lessons/:lessonId
 * Get lesson details by ID
 */
router.get("/:lessonId", async (req, res) => {
  try {
    const { lessonId } = req.params;
    
    if (!lessonId) {
      return res.status(400).json({ error: "Lesson ID is required" });
    }
    
    const lesson = await getLessonById(lessonId);
    
    if (!lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }
    
    res.json(lesson);
  } catch (error) {
    console.error("Error fetching lesson:", error);
    res.status(500).json({ error: "Failed to fetch lesson" });
  }
});

/**
 * GET /lessons
 * Get lessons by language and level
 */
router.get("/", async (req, res) => {
  try {
    const { language, level } = req.query;
    
    if (!language || typeof language !== "string") {
      return res.status(400).json({ error: "Language is required" });
    }
    
    if (!level || typeof level !== "string") {
      return res.status(400).json({ error: "Level is required" });
    }
    
    const lessons = await getLessonsByLanguageAndLevel(language, level);
    
    res.json({ lessons });
  } catch (error) {
    console.error("Error fetching lessons:", error);
    res.status(500).json({ error: "Failed to fetch lessons" });
  }
});

/**
 * GET /lessons/next/:lessonId
 * Get the next lesson after the specified lesson
 */
router.get("/next/:lessonId", async (req, res) => {
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
    res.json(nextLesson);
  } catch (error) {
    console.error("Error fetching next lesson:", error);
    res.status(500).json({ error: "Failed to fetch next lesson" });
  }
});

export default router;
