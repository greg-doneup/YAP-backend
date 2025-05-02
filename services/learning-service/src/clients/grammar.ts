import axios from "axios";
import { GrammarEvalResponse } from "../types/index";

const GRAMMAR_SERVICE_URL = "http://grammar-service";

/**
 * Evaluates a transcript for grammar correctness
 * 
 * @param transcript - The text to evaluate
 * @param expected - Optional expected text for comparison
 * @returns Promise with score and corrected text
 */
export async function evaluate(transcript: string, expected?: string): Promise<GrammarEvalResponse> {
  try {
    const response = await axios.post<GrammarEvalResponse>(`${GRAMMAR_SERVICE_URL}/evaluate`, {
      text: transcript,
      expected
    });
    
    return response.data;
  } catch (error) {
    console.error("Grammar evaluation failed:", error);
    // Return a default response on error
    return {
      score: 0,
      corrected: transcript,
      errors: ["Service unavailable"]
    };
  }
}

/**
 * Gets available vocabulary items
 */
export async function getVocab() {
  try {
    const { data } = await axios.get(`${GRAMMAR_SERVICE_URL}/grammar/vocab`);
    return { vocab: data.vocab };
  } catch (error) {
    console.error("Failed to fetch vocabulary:", error);
    return { vocab: [] };
  }
}

/**
 * Gets a specific vocabulary item by ID
 */
export async function getVocabItem(id: string) {
  try {
    const { data } = await axios.get(`${GRAMMAR_SERVICE_URL}/grammar/vocab/${id}`);
    return { item: data };
  } catch (error) {
    console.error(`Failed to fetch vocabulary item ${id}:`, error);
    return { item: null };
  }
}

/**
 * Gets multiple vocabulary items by their IDs
 */
export async function getVocabItems(ids: string[]) {
  try {
    const { data } = await axios.post(`${GRAMMAR_SERVICE_URL}/grammar/vocab`, { ids });
    return { items: data.items };
  } catch (error) {
    console.error("Failed to fetch vocabulary items:", error);
    return { items: [] };
  }
}

/**
 * Gets daily completion results for a user
 * 
 * @param wallet User wallet address
 * @param date Optional date in YYYY-MM-DD format, defaults to today
 * @param params Additional optional parameters
 */
export async function getDailyResults(wallet: string, date?: string, params: Record<string, any> = {}) {
  try {
    const { data } = await axios.get(`${GRAMMAR_SERVICE_URL}/grammar/daily-results`, {
      params: { wallet, date, ...params }
    });
    return { results: data.results };
  } catch (error) {
    console.error("Failed to fetch daily results:", error);
    return { results: [] };
  }
}

/**
 * Gets a completion event by ID with flexible parameters
 */
export async function getDailyCompletionEvent(id: string, params: Record<string, any> = {}) {
  try {
    const { data } = await axios.get(`${GRAMMAR_SERVICE_URL}/grammar/daily-completion-event/${id}`, {
      params
    });
    return { completion: data };
  } catch (error) {
    console.error(`Failed to fetch completion event ${id}:`, error);
    return { completion: null };
  }
}