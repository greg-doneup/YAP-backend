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
  createLessonCompletion,
  getDetailedPronunciationByWord,
  getTTSAudio
} from "../clients/mongodb";
import { LessonCompletion } from "../types/lesson";
import { generateSpeech } from "../clients/tts";
import { generateVocabAudio, generatePronunciationExample } from "../helpers/ttsHelper";

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
    const lesson = userProgress.currentLessonId ? await getLessonById(userProgress.currentLessonId) : null;
    
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
 * Body: {userId, lessonId, wordId, audio, detailLevel, languageCode}
 */
router.post("/complete", async (req, res) => {
  try {
    const { 
      userId, 
      lessonId, 
      wordId, 
      audio, 
      transcript, 
      detailLevel = 'phoneme',
      languageCode = 'en-US'
    } = req.body;
    
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
    
    // Get current date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    
    // Use provided transcript or default to expected for grammar evaluation
    const textToEvaluate = transcript || expected;
    
    // Initialize the completion record
    let completion: LessonCompletion = {
      userId,
      lessonId,
      wordId,
      date: today,
      pronunciationScore: 0,
      grammarScore: 0,
      pass: false,
      transcript: textToEvaluate,
      expected,
      corrected: '',
      timestamp: new Date().toISOString()
    };
    
    // Import helpers
    const { evaluatePronunciation, isPronunciationAcceptable } = require('../helpers/pronunciationHelper');
    const { generateVocabAudio } = require('../helpers/ttsHelper');
    
    // Evaluate grammar first
    const grammarResult = await grammarEvaluate(textToEvaluate, expected);
    completion.grammarScore = grammarResult.score;
    completion.corrected = grammarResult.corrected;
    
    // If audio is provided, evaluate pronunciation using the three-stage pipeline
    let pronunciationResults: any = { overallScore: 0, pass: false };
    if (audioBuffer) {
      try {
        // Use the pronunciation helper for detailed evaluation
        pronunciationResults = await evaluatePronunciation(
          audioBuffer,
          expected,
          languageCode
        );
        
        // Update completion with detailed pronunciation results
        completion.pronunciationScore = pronunciationResults.overallScore;
        completion.wordDetails = pronunciationResults.wordDetails;
        completion.phonemeDetails = pronunciationResults.phonemeDetails;
        completion.pronunciationFeedback = pronunciationResults.feedback;
        completion.alignmentId = pronunciationResults.alignmentId;
        completion.scoringId = pronunciationResults.scoringId;
        completion.evaluationId = pronunciationResults.evaluationId;
        
        // Generate TTS audio for comparison (in background, don't await)
        generateVocabAudio(expectedWord, languageCode)
          .then((audioId: string) => {
            // Update the completion record with TTS audio reference
            // This is done asynchronously to not block the response
            completion.ttsCachedAudio = audioId;
            // We don't await this update since it's not critical for the response
            createLessonCompletion(completion);
          })
          .catch((err: Error) => console.error('Error generating TTS audio:', err));
          
      } catch (error) {
        console.error('Error in pronunciation evaluation:', error);
        // If detailed evaluation fails, fall back to simple evaluation
        const simpleResult = await voiceEvaluate(audioBuffer, expected);
        completion.pronunciationScore = simpleResult.score;
        pronunciationResults.overallScore = simpleResult.score;
        pronunciationResults.pass = simpleResult.score >= 0.8;
      }
    }
    
    // Calculate if the submission passes
    const passingScore = 0.8;
    const passGrammar = grammarResult.score >= passingScore;
    const passPronunciation = audioBuffer ? 
      pronunciationResults.pass : 
      true; // If no audio, pronunciation check is bypassed
      
    const pass = passGrammar && passPronunciation;
    completion.pass = pass;
    
    // Save completion record (if not already saved by the TTS async call)
    if (!completion.ttsCachedAudio) {
      await createLessonCompletion(completion);
    }
    
    // Update user progress if passed
    if (pass) {
      // Get current user progress
      const userProgress = await getUserProgress(userId);
      
      if (userProgress) {
        // Add word to completed words if not already there
        const completedWords = new Set(userProgress.completedWords);
        completedWords.add(wordId);
        
        // Award XP - bonus for good pronunciation
        let xpGained = 10; // Base XP
        if (audioBuffer && pronunciationResults.overallScore > 0.9) {
          xpGained += 5; // Bonus for excellent pronunciation
        }
        
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
    
    // Prepare response based on detail level
    let responseData: any = {
      pass,
      pronunciationScore: completion.pronunciationScore,
      grammarScore: completion.grammarScore,
      expected,
      corrected: completion.corrected
    };
    
    // Add detailed results if requested
    if (detailLevel === 'detailed' && audioBuffer) {
      responseData = {
        ...responseData,
        wordDetails: completion.wordDetails,
        phonemeDetails: completion.phonemeDetails,
        feedback: completion.pronunciationFeedback,
        transcript: completion.transcript
      };
    }
    
    res.json(responseData);
    
  } catch (error) {
    console.error("Error processing completion:", error);
    res.status(500).json({ error: "Failed to process completion" });
  }
});

/**
 * GET /daily/tts/:wordId
 * Get TTS audio for a vocabulary word
 */
router.get("/tts/:wordId", async (req, res) => {
  try {
    const { wordId } = req.params;
    const { languageCode = 'en-US' } = req.query;
    
    if (!wordId) {
      return res.status(400).json({ error: "Word ID is required" });
    }
    
    // Try to get cached TTS audio first
    const cachedAudio = await getTTSAudio(wordId, languageCode as string);
    
    if (cachedAudio) {
      // Set appropriate headers for audio content
      res.set('Content-Type', 'audio/mp3');
      res.set('Content-Disposition', `attachment; filename="word_${wordId}.mp3"`);
      return res.send(cachedAudio);
    }
    
    // If no cached audio, find the word and generate it
    // We need to find the lesson containing this word
    const lessons = await fetchAllLessons(); // This function would need to be implemented
    let vocabItem: VocabItem | undefined;
    
    // Find the vocab item across all lessons
    for (const lesson of lessons) {
      const foundItem = lesson.new_vocabulary.find((word: VocabItem) => word.id === wordId);
      if (foundItem) {
        vocabItem = foundItem;
        break;
      }
    }
    
    if (!vocabItem) {
      return res.status(404).json({ error: "Word not found" });
    }
    
    // Generate new TTS audio
    const audioId = await generateVocabAudio(vocabItem, languageCode as string);
    
    // Now get the generated audio
    const generatedAudio = await getTTSAudio(wordId, languageCode as string);
    
    if (!generatedAudio) {
      return res.status(500).json({ error: "Failed to generate TTS audio" });
    }
    
    // Set appropriate headers for audio content
    res.set('Content-Type', 'audio/mp3');
    res.set('Content-Disposition', `attachment; filename="word_${wordId}.mp3"`);
    return res.send(generatedAudio);
    
  } catch (error) {
    console.error("Error generating TTS audio:", error);
    res.status(500).json({ error: "Failed to generate TTS audio" });
  }
});

/**
 * GET /daily/pronunciation/history/:wordId
 * Get pronunciation history for a specific word
 */
router.get("/pronunciation/history/:wordId", async (req, res) => {
  try {
    const { wordId } = req.params;
    const { userId } = req.query;
    
    if (!wordId) {
      return res.status(400).json({ error: "Word ID is required" });
    }
    
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "User ID is required" });
    }
    
    // Get detailed pronunciation history for this word
    const pronunciationHistory = await getDetailedPronunciationByWord(userId, wordId);
    
    // Return summary data unless detailed view is requested
    const { view = 'summary' } = req.query;
    
    if (view === 'summary') {
      // Return simplified data
      const summaryData = pronunciationHistory.map(item => ({
        date: item.date,
        timestamp: item.timestamp,
        pronunciationScore: item.pronunciationScore,
        pass: item.pass,
        feedback: item.pronunciationFeedback?.slice(0, 1) || []
      }));
      
      return res.json({
        wordId,
        userId,
        attempts: summaryData,
        count: pronunciationHistory.length
      });
    }
    
    // Return full detailed data
    return res.json({
      wordId,
      userId,
      attempts: pronunciationHistory,
      count: pronunciationHistory.length
    });
    
  } catch (error) {
    console.error("Error retrieving pronunciation history:", error);
    res.status(500).json({ error: "Failed to retrieve pronunciation history" });
  }
});

/**
 * POST /daily/tts/sentence
 * Generate TTS for a custom sentence
 */
router.post("/tts/sentence", async (req, res) => {
  try {
    const { text, languageCode = 'en-US' } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }
    
    // Generate pronunciation example
    const audio = await generatePronunciationExample(text, languageCode);
    
    // Set appropriate headers for audio content
    res.set('Content-Type', 'audio/mp3');
    res.set('Content-Disposition', 'attachment; filename="pronunciation_example.mp3"');
    return res.send(audio);
    
  } catch (error) {
    console.error("Error generating TTS for sentence:", error);
    res.status(500).json({ error: "Failed to generate TTS" });
  }
});

// Helper function to fetch all lessons (would need to be implemented)
async function fetchAllLessons() {
  const db = await require('../clients/mongodb').connect();
  return db.collection("lessons").find({}).toArray();
}

export default router;
