// src/routes/quiz.ts
import { Router } from "express";
import { evaluate as grammarEval } from "../clients/grammar";
import { addXp } from "../clients/profile";
import { triggerCustomReward } from "../clients/reward";
import vocab from "../vocab/day001.json";
import { VocabItem } from "../types";

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

// -- routes -------------------------------------------------

/** GET /quiz
 *  -> { words: [ ...VocabItem ] }
 */
router.get("/", (_req, res) => {
  try {
    const todaysWords = wordsToday();
    const expected = expectedSentence(todaysWords);
    
    res.json({ 
      words: todaysWords,
      expected
    });
  } catch (err) {
    console.error("Error fetching quiz data:", err);
    res.status(500).json({ error: "Failed to load quiz data" });
  }
});

/** POST /quiz/submit
 * Body: { wallet, transcript }
 * -> { score, pass, corrected }
 */
router.post("/submit", async (req, res, next) => {
  try {
    const { wallet, transcript } = req.body;
    
    // Input validation
    if (!wallet || typeof wallet !== 'string') {
      return res.status(400).json({ error: "Valid wallet address required" });
    }
    
    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ error: "Valid transcript required" });
    }

    // Get today's expected sentence for comparison
    const todaysWords = wordsToday();
    const expected = expectedSentence(todaysWords);
    
    // Evaluate the grammar against the expected sentence
    const { score, corrected } = await grammarEval(transcript, expected);

    // Determine if the score is passing (80% or higher)
    const pass = score >= 0.8;
    
    // Award XP if passing
    if (pass) {
      await addXp(wallet, 20);
      
      // Also trigger a small token reward
      await triggerCustomReward(wallet, 1, "Daily quiz completion");
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
