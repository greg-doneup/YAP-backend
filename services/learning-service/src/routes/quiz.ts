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

// Enhanced quiz interfaces
interface QuizQuestion {
  id: string;
  type: 'text' | 'pronunciation' | 'multiple_choice' | 'translation';
  cefrLevel: string;
  language: string;
  question: string;
  targetWord: string;
  context?: string;
  options?: string[];
  audioUrl?: string;
  difficulty: number;
  source: 'lesson' | 'chat' | 'vocabulary';
  correctAnswer: string;
  metadata?: {
    grammarFocus?: string;
    wordType?: string;
    frequencyScore?: number;
  };
}

interface QuizSubmission {
  questionId: string;
  userAnswer?: string;
  audioData?: Buffer;
  questionType: string;
  cefrLevel: string;
  userId: string;
}

interface QuizResult {
  questionId: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  pointsEarned: number;
  feedback: string;
  pronunciationScore?: number;
  audioUrl?: string;
  detailedFeedback?: {
    grammarNotes?: string;
    pronunciationTips?: string;
    vocabularyContext?: string;
    cefrLevelAppropriate?: boolean;
  };
}

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

/**
 * Calculate points based on question difficulty and CEFR level
 */
function calculatePoints(isCorrect: boolean, difficulty: number, cefrLevel: string): number {
  if (!isCorrect) return 0;
  
  const basePoints = 10;
  const difficultyMultiplier = difficulty * 2;
  
  // CEFR level multiplier
  const cefrMultipliers: { [key: string]: number } = {
    'A1': 1.0,
    'A2': 1.2,
    'B1': 1.5,
    'B2': 1.8,
    'C1': 2.2,
    'C2': 2.5
  };
  
  const cefrMultiplier = cefrMultipliers[cefrLevel] || 1.0;
  
  return Math.round(basePoints * difficultyMultiplier * cefrMultiplier);
}

/**
 * Generate detailed feedback based on answer quality and CEFR level
 */
function generateDetailedFeedback(
  userAnswer: string, 
  correctAnswer: string, 
  isCorrect: boolean, 
  cefrLevel: string,
  questionType: string
): string {
  const cefrFeedbacks: { [key: string]: { correct: string[], incorrect: string[] } } = {
    'A1': {
      correct: [
        "Excellent! You're mastering basic vocabulary.",
        "Great job! This word is now part of your vocabulary.",
        "Perfect! Keep practicing these fundamental words."
      ],
      incorrect: [
        "Don't worry! This is a common mistake at A1 level. Try focusing on the basic form of the word.",
        "Keep practicing! Remember that A1 words are the building blocks of the language.",
        "Good attempt! Try breaking down the word into smaller parts to remember it better."
      ]
    },
    'A2': {
      correct: [
        "Wonderful! You're building a solid vocabulary foundation.",
        "Excellent work! You're connecting words to real-life situations well.",
        "Great! Your understanding of everyday vocabulary is improving."
      ],
      incorrect: [
        "Close! At A2 level, focus on how words relate to daily activities and situations.",
        "Good try! Remember to think about the context in which this word is commonly used.",
        "Keep going! Practice using this word in simple sentences about daily life."
      ]
    },
    'B1': {
      correct: [
        "Excellent! You're demonstrating good intermediate-level vocabulary knowledge.",
        "Great work! Your ability to handle more complex vocabulary is showing.",
        "Perfect! You're successfully managing intermediate-level language challenges."
      ],
      incorrect: [
        "Good effort! At B1 level, try to think about the different meanings this word can have.",
        "Close! Consider the grammatical context and how this word changes in different situations.",
        "Keep practicing! B1 vocabulary often involves understanding subtle differences in meaning."
      ]
    }
  };
  
  const levelFeedback = cefrFeedbacks[cefrLevel] || cefrFeedbacks['A1'];
  const feedbackArray = isCorrect ? levelFeedback.correct : levelFeedback.incorrect;
  const baseFeedback = feedbackArray[Math.floor(Math.random() * feedbackArray.length)];
  
  if (!isCorrect && questionType === 'pronunciation') {
    return `${baseFeedback} For pronunciation, try to listen to the word again and focus on each sound. The correct pronunciation is: "${correctAnswer}".`;
  }
  
  return baseFeedback;
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

// ===================== ENHANCED CEFR-BASED QUIZ ROUTES =====================

/** POST /quiz/generate-cefr-quiz
 * Generate CEFR-based quiz questions with optional chat word integration
 * Body: { cefrLevel, includeRecentChatWords, questionCount, focusAreas?, excludeWords?, userId }
 * -> { questions: QuizQuestion[] }
 */
router.post("/generate-cefr-quiz", async (req, res) => {
  try {
    const { 
      cefrLevel, 
      includeRecentChatWords = false, 
      questionCount = 5, 
      focusAreas = ['vocabulary', 'pronunciation'], 
      excludeWords = [],
      userId 
    } = req.body;

    // Input validation
    if (!cefrLevel || !userId) {
      return res.status(400).json({ error: "cefrLevel and userId are required" });
    }

    // Check daily quiz limit
    const today = new Date().toISOString().split('T')[0];
    const dailyStatus = await getDailyQuizStatus(userId, today);
    
    if (dailyStatus.remainingQuizzes <= 0) {
      return res.status(429).json({ 
        error: "Daily quiz limit reached",
        dailyStatus
      });
    }

    // Get user's current lesson and progress
    const userProgress = await getUserProgress(userId);
    let vocabularySource: VocabItem[] = [];
    let chatWords: string[] = [];

    if (userProgress && userProgress.currentLessonId) {
      const lesson = await getLessonById(userProgress.currentLessonId);
      if (lesson) {
        vocabularySource = lesson.new_vocabulary;
      }
    }

    // Get recent chat words if requested
    if (includeRecentChatWords) {
      chatWords = await getRecentChatWords(userId, cefrLevel, 10);
    }

    // Generate questions based on CEFR level and available vocabulary
    const questions = await generateCefrQuizQuestions({
      cefrLevel,
      vocabularySource,
      chatWords,
      questionCount,
      focusAreas,
      excludeWords,
      language: 'spanish' // Default for now, could be parameterized
    });

    res.json({ questions });
  } catch (error) {
    console.error("Error generating CEFR quiz:", error);
    res.status(500).json({ error: "Failed to generate quiz questions" });
  }
});

/** POST /quiz/submit-answer
 * Submit answer to a quiz question with enhanced feedback
 * Body: FormData with questionId, questionType, cefrLevel, userId, userAnswer?, audioData?
 * -> QuizResult
 */
router.post("/submit-answer", async (req: any, res) => {
  try {
    const { questionId, questionType, cefrLevel, userId, userAnswer } = req.body;
    const audioData = req.files?.audioData;

    // Input validation
    if (!questionId || !questionType || !cefrLevel || !userId) {
      return res.status(400).json({ 
        error: "questionId, questionType, cefrLevel, and userId are required" 
      });
    }

    // Get the question details (would need to implement question storage)
    const question = await getQuizQuestionById(questionId);
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    let result: QuizResult;

    if (questionType === 'pronunciation' && audioData) {
      // Handle pronunciation assessment
      result = await processPronunciationAnswer({
        questionId,
        audioData: audioData.data,
        targetWord: question.targetWord,
        cefrLevel,
        userId
      });
    } else if (userAnswer) {
      // Handle text-based answers
      result = await processTextAnswer({
        questionId,
        userAnswer,
        correctAnswer: question.correctAnswer,
        questionType,
        cefrLevel,
        userId
      });
    } else {
      return res.status(400).json({ error: "Either userAnswer or audioData is required" });
    }

    // Record the attempt for tracking
    await recordQuizAttempt(userId, {
      questionId,
      userAnswer: result.userAnswer,
      isCorrect: result.isCorrect,
      pointsEarned: result.pointsEarned,
      timestamp: new Date()
    });

    res.json(result);
  } catch (error) {
    console.error("Error submitting answer:", error);
    res.status(500).json({ error: "Failed to process answer" });
  }
});

/** POST /quiz/complete
 * Complete quiz session and calculate final rewards
 * Body: { attempts, totalScore, cefrLevel, userId }
 * -> { tokensEarned, totalPoints, accuracy, cefrLevelFeedback, wordsToReview, nextQuizAvailable }
 */
router.post("/complete", async (req, res) => {
  try {
    const { attempts, totalScore, cefrLevel, userId } = req.body;

    if (!attempts || !userId) {
      return res.status(400).json({ error: "attempts and userId are required" });
    }

    // Calculate accuracy
    const correctAnswers = attempts.filter((attempt: any) => attempt.isCorrect).length;
    const accuracy = attempts.length > 0 ? (correctAnswers / attempts.length) * 100 : 0;

    // Calculate token rewards based on performance and CEFR level
    const baseTokens = 5;
    const accuracyBonus = Math.floor(accuracy / 20); // 1 token per 20% accuracy
    const cefrMultiplier = getCefrTokenMultiplier(cefrLevel);
    const tokensEarned = Math.floor((baseTokens + accuracyBonus) * cefrMultiplier);

    // Update user progress
    const userProgress = await getUserProgress(userId);
    if (userProgress) {
      const xpGained = totalScore * 2; // 2 XP per point
      await updateUserProgress(userId, {
        totalXp: userProgress.totalXp + xpGained,
        lastActivity: new Date().toISOString(),
        streak: isStreakDay(userProgress.lastActivity) ? 
                userProgress.streak + 1 : 
                userProgress.streak
      });

      // Award tokens through wallet system if available
      const wallet = (userProgress as any).walletAddress;
      if (wallet && wallet.startsWith('0x')) {
        await addXp(wallet, xpGained);
        await triggerCustomReward(wallet, tokensEarned, "Quiz completion reward");
      }
    }

    // Update daily quiz status
    const today = new Date().toISOString().split('T')[0];
    await updateDailyQuizStatus(userId, today, {
      quizzesCompleted: 1,
      tokensEarned,
      pointsEarned: totalScore
    });

    // Generate CEFR-appropriate feedback
    const cefrLevelFeedback = generateCefrCompletionFeedback(accuracy, cefrLevel, attempts.length);

    // Identify words that need review (incorrect answers)
    const wordsToReview = attempts
      .filter((attempt: any) => !attempt.isCorrect)
      .map((attempt: any) => attempt.correctAnswer);

    // Calculate next quiz availability (if daily limit reached)
    const updatedDailyStatus = await getDailyQuizStatus(userId, today);
    const nextQuizAvailable = updatedDailyStatus.remainingQuizzes > 0 
      ? new Date() 
      : new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow

    res.json({
      tokensEarned,
      totalPoints: totalScore,
      accuracy: Math.round(accuracy),
      cefrLevelFeedback,
      wordsToReview,
      nextQuizAvailable
    });
  } catch (error) {
    console.error("Error completing quiz:", error);
    res.status(500).json({ error: "Failed to complete quiz" });
  }
});

/** GET /quiz/daily-status
 * Get user's daily quiz status
 * Query: { userId }
 * -> DailyQuizStatus
 */
router.get("/daily-status", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: "Valid userId required" });
    }

    const today = new Date().toISOString().split('T')[0];
    const dailyStatus = await getDailyQuizStatus(userId, today);

    res.json(dailyStatus);
  } catch (error) {
    console.error("Error getting daily quiz status:", error);
    res.status(500).json({ error: "Failed to get daily quiz status" });
  }
});

/** GET /quiz/recent-chat-words
 * Get words from recent chat sessions for quiz generation
 * Query: { userId, cefrLevel, limit }
 * -> { words: string[] }
 */
router.get("/recent-chat-words", async (req, res) => {
  try {
    const { userId, cefrLevel, limit = '20' } = req.query;

    if (!userId || !cefrLevel || typeof userId !== 'string' || typeof cefrLevel !== 'string') {
      return res.status(400).json({ error: "userId and cefrLevel are required" });
    }

    const words = await getRecentChatWords(userId, cefrLevel, parseInt(limit as string));
    res.json({ words });
  } catch (error) {
    console.error("Error getting recent chat words:", error);
    res.status(500).json({ error: "Failed to get recent chat words" });
  }
});

// ===================== HELPER FUNCTIONS =====================

/**
 * Get token multiplier based on CEFR level
 */
function getCefrTokenMultiplier(cefrLevel: string): number {
  const multipliers: { [key: string]: number } = {
    'A1': 1.0,
    'A2': 1.1,
    'B1': 1.2,
    'B2': 1.3,
    'C1': 1.4,
    'C2': 1.5
  };
  return multipliers[cefrLevel] || 1.0;
}

/**
 * Generate CEFR-appropriate completion feedback
 */
function generateCefrCompletionFeedback(accuracy: number, cefrLevel: string, questionCount: number): string {
  if (accuracy >= 80) {
    return `Excellent work! You've mastered ${Math.round(accuracy)}% of ${cefrLevel} level content. You're ready for more challenging material.`;
  } else if (accuracy >= 60) {
    return `Good progress! You got ${Math.round(accuracy)}% correct at ${cefrLevel} level. Keep practicing to strengthen your understanding.`;
  } else {
    return `Keep learning! ${Math.round(accuracy)}% correct shows you're building your ${cefrLevel} foundation. Review the missed words and try again tomorrow.`;
  }
}

/**
 * Process text-based answer
 */
async function processTextAnswer(params: {
  questionId: string;
  userAnswer: string;
  correctAnswer: string;
  questionType: string;
  cefrLevel: string;
  userId: string;
}): Promise<QuizResult> {
  const { questionId, userAnswer, correctAnswer, questionType, cefrLevel } = params;
  
  // Simple text comparison (could be enhanced with fuzzy matching)
  const isCorrect = userAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();
  
  // Use grammar evaluation for more complex questions
  let score = isCorrect ? 1.0 : 0.0;
  let corrected = userAnswer;
  
  if (questionType === 'translation' || questionType === 'text') {
    try {
      const grammarResult = await grammarEval(userAnswer, correctAnswer);
      score = grammarResult.score;
      corrected = grammarResult.corrected || userAnswer;
    } catch (error) {
      console.error("Grammar evaluation failed:", error);
    }
  }
  
  const finalIsCorrect = score >= 0.8;
  const points = calculatePoints(finalIsCorrect, 3, cefrLevel);
  const feedback = generateDetailedFeedback(userAnswer, correctAnswer, finalIsCorrect, cefrLevel, questionType);
  
  return {
    questionId,
    userAnswer: corrected,
    correctAnswer,
    isCorrect: finalIsCorrect,
    pointsEarned: points,
    feedback,
    detailedFeedback: {
      grammarNotes: finalIsCorrect ? undefined : `Try: "${correctAnswer}"`,
      cefrLevelAppropriate: true
    }
  };
}

/**
 * Process pronunciation answer (placeholder - would integrate with pronunciation service)
 */
async function processPronunciationAnswer(params: {
  questionId: string;
  audioData: Buffer;
  targetWord: string;
  cefrLevel: string;
  userId: string;
}): Promise<QuizResult> {
  const { questionId, targetWord, cefrLevel } = params;
  
  // Placeholder pronunciation assessment
  // In real implementation, this would call the pronunciation-scorer service
  const pronunciationScore = 0.75 + Math.random() * 0.25; // Mock score 75-100%
  const isCorrect = pronunciationScore >= 0.7;
  const points = calculatePoints(isCorrect, 4, cefrLevel); // Higher difficulty for pronunciation
  
  const feedback = isCorrect 
    ? `Great pronunciation! Your score: ${Math.round(pronunciationScore * 100)}%`
    : `Keep practicing! Your score: ${Math.round(pronunciationScore * 100)}%. Focus on the sounds in "${targetWord}".`;
  
  return {
    questionId,
    userAnswer: `[Audio recording for "${targetWord}"]`,
    correctAnswer: targetWord,
    isCorrect,
    pointsEarned: points,
    feedback,
    pronunciationScore: Math.round(pronunciationScore * 100),
    detailedFeedback: {
      pronunciationTips: isCorrect ? undefined : `Try breaking "${targetWord}" into syllables and practice each sound.`,
      cefrLevelAppropriate: true
    }
  };
}

// ===================== PLACEHOLDER FUNCTIONS (to be implemented) =====================

/**
 * Generate CEFR-appropriate quiz questions
 */
async function generateCefrQuizQuestions(params: {
  cefrLevel: string;
  vocabularySource: VocabItem[];
  chatWords: string[];
  questionCount: number;
  focusAreas: string[];
  excludeWords: string[];
  language: string;
}): Promise<QuizQuestion[]> {
  const { cefrLevel, vocabularySource, chatWords, questionCount, focusAreas } = params;
  
  // For now, create mock questions based on available vocabulary
  const questions: QuizQuestion[] = [];
  const availableWords = [...vocabularySource.slice(0, questionCount)];
  
  // Add some chat words if available
  if (chatWords.length > 0) {
    const chatWordObjects = chatWords.slice(0, Math.floor(questionCount / 2)).map((word, index) => ({
      id: `chat-${index}`,
      term: word,
      translation: `Translation for ${word}`
    }));
    availableWords.splice(0, chatWordObjects.length, ...chatWordObjects);
  }
  
  for (let i = 0; i < Math.min(questionCount, availableWords.length); i++) {
    const word = availableWords[i];
    const questionTypes = focusAreas.includes('pronunciation') 
      ? ['text', 'pronunciation', 'multiple_choice'] 
      : ['text', 'multiple_choice'];
    
    const questionType = questionTypes[Math.floor(Math.random() * questionTypes.length)] as QuizQuestion['type'];
    
    questions.push({
      id: `q-${Date.now()}-${i}`,
      type: questionType,
      cefrLevel,
      language: 'spanish',
      question: questionType === 'pronunciation' 
        ? `How do you pronounce this word?`
        : `What does "${word.term}" mean?`,
      targetWord: word.term,
      context: `Practice word: ${word.term}`,
      correctAnswer: questionType === 'pronunciation' ? word.term : word.translation,
      options: questionType === 'multiple_choice' ? [
        word.translation,
        'Incorrect option 1',
        'Incorrect option 2',
        'Incorrect option 3'
      ].sort(() => Math.random() - 0.5) : undefined,
      difficulty: getDifficultyForCefr(cefrLevel),
      source: chatWords.includes(word.term) ? 'chat' : 'lesson',
      metadata: {
        wordType: 'noun', // Could be enhanced
        frequencyScore: Math.random() * 100
      }
    });
  }
  
  return questions;
}

/**
 * Get difficulty level for CEFR level
 */
function getDifficultyForCefr(cefrLevel: string): number {
  const difficulties: { [key: string]: number } = {
    'A1': 1,
    'A2': 2,
    'B1': 3,
    'B2': 4,
    'C1': 5,
    'C2': 5
  };
  return difficulties[cefrLevel] || 3;
}

/**
 * Placeholder functions that would need to be implemented in the db client
 */
async function getDailyQuizStatus(userId: string, date: string) {
  // Mock implementation - would query database
  return {
    date,
    quizzesCompleted: 0,
    maxDailyQuizzes: 4,
    remainingQuizzes: 4,
    tokensEarnedToday: 0,
    pointsEarnedToday: 0,
    canTakeQuiz: true,
    nextResetTime: new Date(Date.now() + 24 * 60 * 60 * 1000)
  };
}

async function updateDailyQuizStatus(userId: string, date: string, update: any) {
  // Mock implementation
  console.log(`Updating daily quiz status for ${userId} on ${date}:`, update);
}

async function recordQuizAttempt(userId: string, attempt: any) {
  // Mock implementation
  console.log(`Recording quiz attempt for ${userId}:`, attempt);
}

async function getRecentChatWords(userId: string, cefrLevel: string, limit: number): Promise<string[]> {
  // Mock implementation - would query chat history
  return ['casa', 'perro', 'agua', 'comida', 'amigo'].slice(0, limit);
}

async function getQuizQuestionById(questionId: string): Promise<QuizQuestion | null> {
  // Mock implementation - would query stored questions
  return null;
}

export default router;