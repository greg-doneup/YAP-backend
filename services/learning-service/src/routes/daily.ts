import { Router } from "express";
import { evaluate as voiceEvaluate } from "../clients/voiceScore";
import { evaluate as grammarEvaluate } from "../clients/grammar"; 
import { addXp } from "../clients/profile";
import { triggerReward } from "../clients/reward";
import vocab from "../vocab/day001.json";
import { VocabItem } from "../types";
import { 
  getUserProgress, 
  getLessonById, 
  updateUserProgress,
  createLessonCompletion 
} from "../clients/db";
import { LessonCompletion } from "../types/lesson";

const router = Router();

/**
 * GET /daily
 * Returns the vocabulary list for the user's current lesson
 */
router.get("/", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== "string") {
      // If no userId provided, return default vocab items
      const dailyWords = vocab.slice(0, 5);
      return res.json(dailyWords);
    }

    // Get user progress to determine current lesson
    const userProgress = await getUserProgress(userId);
    
    if (!userProgress) {
      // New user or no progress - return default vocabulary
      const dailyWords = vocab.slice(0, 5);
      return res.json(dailyWords);
    }
    
    // Get the current lesson data
    const lesson = await getLessonById(userProgress.currentLessonId);
    
    if (!lesson) {
      // Fallback if lesson not found
      const dailyWords = vocab.slice(0, 5);
      return res.json(dailyWords);
    }
    
    // Return the vocabulary items for this lesson
    res.json(lesson.new_vocabulary);
  } catch (error) {
    console.error("Error fetching daily words:", error);
    res.status(500).json({ error: "Failed to load daily vocabulary" });
  }
});

/**
 * POST /daily/complete
 * Submit a daily lesson completion with audio
 * Body: {userId, lessonId, wordId, audio}
 */
router.post("/complete", async (req, res) => {
  try {
    const { userId, lessonId, wordId, audio, transcript } = req.body;
    
    // Input validation
    if (!userId) return res.status(400).json({ error: "User ID is required" });
    if (!lessonId) return res.status(400).json({ error: "Lesson ID is required" });
    if (!wordId) return res.status(400).json({ error: "Word ID is required" });
    if (!audio && !transcript) return res.status(400).json({ error: "Audio or transcript is required" });
    
    // Get lesson data
    const lesson = await getLessonById(lessonId);
    if (!lesson) {
      return res.status(400).json({ error: "Invalid lesson ID" });
    }
    
    // Find the expected word from the lesson
    const expectedWord = lesson.new_vocabulary.find(word => word.id === wordId);
    if (!expectedWord) {
      return res.status(400).json({ error: "Invalid word ID for this lesson" });
    }
    
    // Expected sentence for the word
    const expected = `I am saying ${expectedWord.term}.`;
    
    // Convert base64 audio back to buffer
    const audioBuffer = audio ? Buffer.from(audio, 'base64') : null;
    
    // Evaluate pronunciation using voice score service (if audio provided)
    const pronunciationResult = audioBuffer ? 
      await voiceEvaluate(audioBuffer, expected) : 
      { score: 0 }; // Default score if no audio
    
    // Use provided transcript or default to expected for grammar evaluation
    const textToEvaluate = transcript || expected;
    
    // Evaluate grammar
    const grammarResult = await grammarEvaluate(textToEvaluate, expected);
    
    // Calculate if the submission passes (both scores >= 0.8 or just grammar if no audio)
    const passingScore = 0.8;
    const pass = audioBuffer ? 
      (pronunciationResult.score >= passingScore && grammarResult.score >= passingScore) : 
      (grammarResult.score >= passingScore);
    
    // Get current date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    
    // Create completion record
    const completion: LessonCompletion = {
      userId,
      lessonId,
      wordId,
      date: today,
      pronunciationScore: pronunciationResult.score || 0,
      grammarScore: grammarResult.score,
      pass,
      transcript: textToEvaluate,
      expected,
      corrected: grammarResult.corrected,
      timestamp: new Date().toISOString()
    };
    
    // Save completion record
    await createLessonCompletion(completion);
    
    // Update user progress if passed
    if (pass) {
      // Get current user progress
      const userProgress = await getUserProgress(userId);
      
      if (userProgress) {
        // Add word to completed words if not already there
        const completedWords = new Set(userProgress.completedWords);
        completedWords.add(wordId);
        
        // Award XP
        const xpGained = 10;
        const totalXp = userProgress.totalXp + xpGained;
        
        // Find the next word in the lesson
        const currentWordIndex = lesson.new_vocabulary.findIndex(w => w.id === wordId);
        const nextWordIndex = currentWordIndex + 1;
        
        const updates: any = {
          completedWords: Array.from(completedWords),
          totalXp,
          lastActivity: new Date().toISOString()
        };
        
        // If there's a next word in this lesson
        if (nextWordIndex < lesson.new_vocabulary.length) {
          const nextWord = lesson.new_vocabulary[nextWordIndex];
          updates.currentWordId = nextWord.id;
          
          // Set next word to be available in 6 hours
          const nextWordTime = new Date();
          nextWordTime.setHours(nextWordTime.getHours() + 6);
          updates.nextWordAvailableAt = nextWordTime.toISOString();
        } else {
          // Completed all words in this lesson
          const completedLessons = new Set(userProgress.completedLessons);
          completedLessons.add(lessonId);
          updates.completedLessons = Array.from(completedLessons);
          
          // More advanced logic would set the next lesson here
          // For now, just mark the current lesson as complete
        }
        
        // Update user progress
        await updateUserProgress(userId, updates);
        
        // Award XP through the profile service
        if (userId === userId.toLowerCase() && userId.startsWith('0x')) {  // if wallet address
          await addXp(userId, xpGained);
          await triggerReward(userId);
        }
      }
    }
    
    // Return results
    res.json({
      pass,
      pronunciationScore: pronunciationResult.score || 0,
      grammarScore: grammarResult.score,
      expected,
      corrected: grammarResult.corrected
    });
    
  } catch (error) {
    console.error("Error processing completion:", error);
    res.status(500).json({ error: "Failed to process completion" });
  }
});

export default router;
