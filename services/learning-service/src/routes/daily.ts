import { Router } from "express";
import { evaluate as voiceEvaluate } from "../clients/voiceScore";
import { evaluate as grammarEvaluate } from "../clients/grammar"; 
import { addXp } from "../clients/profile";
import { triggerReward } from "../clients/reward";
import vocab from "../vocab/day001.json";
import { VocabItem } from "../types";

const router = Router();

/**
 * GET /daily
 * Returns the daily vocabulary list for the current day
 */
router.get("/", (req, res) => {
  try {
    // In a real app, would filter based on user progress and day
    // For now, just return the first 5 items
    const dailyWords = vocab.slice(0, 5);
    res.json(dailyWords);
  } catch (error) {
    console.error("Error fetching daily words:", error);
    res.status(500).json({ error: "Failed to load daily vocabulary" });
  }
});

/**
 * POST /daily/complete
 * Submit a daily lesson completion with audio
 * Body: {wallet, expectedId, audio}
 */
router.post("/complete", async (req, res) => {
  try {
    const { wallet, expectedId, audio } = req.body;
    
    // Input validation
    if (!wallet) return res.status(400).json({ error: "Wallet address is required" });
    if (!expectedId) return res.status(400).json({ error: "Expected word ID is required" });
    if (!audio) return res.status(400).json({ error: "Audio is required" });
    
    // Find the expected word
    const expectedWord = vocab.find(word => word.id === expectedId);
    if (!expectedWord) {
      return res.status(400).json({ error: "Invalid word ID" });
    }
    
    // Expected sentence for the word
    const expected = `I am saying ${expectedWord.term}.`;
    
    // Convert base64 audio back to buffer
    const audioBuffer = Buffer.from(audio, 'base64');
    
    // Evaluate pronunciation using voice score service
    const pronunciationResult = await voiceEvaluate(audioBuffer, expected);
    
    // Evaluate grammar (in a real app, this would use actual transcribed text)
    const grammarResult = await grammarEvaluate(expected, expected);
    
    // Calculate if the submission passes (both scores >= 0.8)
    const pass = pronunciationResult.score >= 0.8 && grammarResult.score >= 0.8;
    
    // Award XP and tokens if passing
    if (pass) {
      await addXp(wallet, 10);
      await triggerReward(wallet);
    }
    
    // Return results
    res.json({
      pass,
      pronunciationScore: pronunciationResult.score,
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
