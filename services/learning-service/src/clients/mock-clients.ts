import { GrammarEvalResponse } from "../types/index";

// Mock grammar evaluation
export async function evaluate(text: string, expected?: string): Promise<GrammarEvalResponse> {
  console.log(`Mock grammar evaluation: "${text}" against expected "${expected || 'none'}"`);
  
  // Simple mock that always returns a high score for testing
  return {
    score: 0.95,
    corrected: text,
    errors: []
  };
}

// Mock voice evaluation
export async function evaluateVoice(audio: Buffer, expected: string): Promise<{ score: number }> {
  console.log(`Mock voice evaluation for expected: "${expected}"`);
  
  // Simple mock that always returns a high score for testing
  return {
    score: 0.9
  };
}

// Mock XP addition
export async function addXp(userId: string, amount: number): Promise<void> {
  console.log(`Mock adding ${amount} XP for user ${userId}`);
}

// Mock reward trigger
export async function triggerReward(userId: string): Promise<void> {
  console.log(`Mock triggering reward for user ${userId}`);
}

// Mock custom reward trigger
export async function triggerCustomReward(userId: string, amount: number, reason: string): Promise<void> {
  console.log(`Mock triggering custom reward of ${amount} for user ${userId} (${reason})`);
}
