// src/routes/quiz.ts
import { Router } from "express";
import { evaluate as grammarEval } from "../clients/grammar";
import { addXp } from "../clients/profile";
import { triggerCustomReward } from "../clients/reward";
import vocab from "../vocab/day001.json";
import { VocabItem } from "../types";
import { 
  getUserProgress, 
  getLessonById, 
  getCompletionsByDate, 
  updateUserProgress 
} from "../clients/db";

const router = Router();

// -- helpers ------------------------------------------------
function wordsToday(): VocabItem[] {
  // Ensure every item has an ID by adding one if missing
  return vocab.slice(0, 5).map((item, index) => ({
    ...item,
    id: item.id || `word-${index + 1}`
  }));
}

function expectedSentence(words: VocabItem[]): string {
  return `I am practicing ${words.map(w => w.term).join(", ")}.`;
}

/**
 * Check if the user's last activity was before today
 * This helps determine if the streak should be incremented
 */
function isStreakDay(lastActivity: string): boolean {
  if (!lastActivity) return true;
  
  const lastDate = new Date(lastActivity);
  const today = new Date();
  
  // Reset hours to compare just the date
  lastDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  
  // Return true if last activity was before today
  return lastDate < today;
}

// -- routes -------------------------------------------------

/** GET /quiz
 *  -> { words: [ ...VocabItem ], expected: string }
 */
router.get("/", async (req, res) => {
  try {
    const { userId } = req.query;
    let quizWords: VocabItem[] = [];
    let expected = '';
    
    if (userId && typeof userId === 'string') {
      // Try to get user-specific quiz based on progress
      const userProgress = await getUserProgress(userId);
      
      if (userProgress && userProgress.currentLessonId) {
        // Get the current lesson
        const lesson = await getLessonById(userProgress.currentLessonId);
        
        if (lesson) {
          // Use the lesson's vocabulary words for the quiz
          quizWords = lesson.new_vocabulary.slice(0, 5);
          
          // If they've completed some words, prioritize those for review
          if (userProgress.completedWords.length > 0) {
            const today = new Date().toISOString().split('T')[0];
            const todaysCompletions = await getCompletionsByDate(userId, today);
            
            // Get words they've completed but not yet quizzed on today
            const completedWordIds = new Set(
              todaysCompletions.map(completion => completion.wordId)
            );
            
            // Filter completed words that haven't been quizzed today
            const reviewWords = userProgress.completedWords
              .filter(id => !completedWordIds.has(id))
              .map(id => lesson.new_vocabulary.find(word => word.id === id))
              .filter(Boolean) as VocabItem[];
            
            // Create a mix of review words and new words
            if (reviewWords.length > 0) {
              const reviewCount = Math.min(3, reviewWords.length);
              quizWords = [
                ...reviewWords.slice(0, reviewCount),
                ...quizWords.slice(0, 5 - reviewCount)
              ];
            }
          }
          
          expected = expectedSentence(quizWords);
        }
      }
    }
    
    // If no user-specific quiz could be created, fall back to default
    if (quizWords.length === 0) {
      quizWords = wordsToday();
      expected = expectedSentence(quizWords);
    }
    
    res.json({ 
      words: quizWords,
      expected
    });
  } catch (err) {
    console.error("Error fetching quiz data:", err);
    res.status(500).json({ error: "Failed to load quiz data" });
  }
});

/** POST /quiz/submit
 * Body: { userId, transcript }
 * -> { score, pass, corrected }
 */
router.post("/submit", async (req, res, next) => {
  try {
    const { userId, transcript } = req.body;
    const wallet = req.body.wallet || userId; // Support both wallet and userId for backward compatibility
    
    // Input validation
    if (!userId && !wallet) {
      return res.status(400).json({ error: "Valid userId or wallet address required" });
    }
    
    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ error: "Valid transcript required" });
    }

    const userIdentifier = userId || wallet;
    let expected = '';
    let todaysWords: VocabItem[] = [];
    
    // Try to get user-specific quiz words from their progress
    if (typeof userIdentifier === 'string') {
      const userProgress = await getUserProgress(userIdentifier);
      
      if (userProgress && userProgress.currentLessonId) {
        // Get the current lesson
        const lesson = await getLessonById(userProgress.currentLessonId);
        
        if (lesson) {
          // Use completed words for the quiz if available
          const completedWords = userProgress.completedWords
            .map(id => lesson.new_vocabulary.find(word => word.id === id))
            .filter(Boolean) as VocabItem[];
            
          // If they have enough completed words, use those
          if (completedWords.length >= 3) {
            todaysWords = completedWords.slice(0, 5);
          } else {
            // Otherwise mix in some new words
            todaysWords = [
              ...completedWords,
              ...lesson.new_vocabulary
                .filter(word => !userProgress.completedWords.includes(word.id))
                .slice(0, 5 - completedWords.length)
            ];
          }
          
          expected = expectedSentence(todaysWords);
        }
      }
    }
    
    // Fall back to default if needed
    if (todaysWords.length === 0) {
      todaysWords = wordsToday();
      expected = expectedSentence(todaysWords);
    }
    
    // Evaluate the grammar against the expected sentence
    const { score, corrected } = await grammarEval(transcript, expected);

    // Determine if the score is passing (80% or higher)
    const pass = score >= 0.8;
    
    // If passing, update user progress
    if (pass && typeof userIdentifier === 'string') {
      // Update user progress with XP gain
      const xpGained = 20;
      const userProgress = await getUserProgress(userIdentifier);
      
      if (userProgress) {
        // Update progress data
        await updateUserProgress(userIdentifier, {
          totalXp: userProgress.totalXp + xpGained,
          lastActivity: new Date().toISOString(),
          // If the streak was last updated before today, increment it
          streak: isStreakDay(userProgress.lastActivity) ? 
                  userProgress.streak + 1 : 
                  userProgress.streak
        });
      }
      
      // If it's a wallet address, award XP and tokens through services
      if (wallet === wallet?.toLowerCase() && wallet?.startsWith('0x')) {
        await addXp(wallet, xpGained);
        await triggerCustomReward(wallet, 1, "Daily quiz completion");
      }
    }

    // Return the results
    res.json({ 
      score, 
      pass, 
      corrected,
      expected
    });
  } catch (err) { 
    console.error("Error processing quiz submission:", err);
    next(err);
  }
});

export default router;
