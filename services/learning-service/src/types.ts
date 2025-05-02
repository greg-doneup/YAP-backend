export interface VocabItem { id: string; term: string; translation: string }
export interface DailyResult {
  wallet: string;
  date: string;          // YYYY-MM-DD
  words: string[];       // ids practiced
  pronunciationScore: number;
  grammarScore: number;
  pass: boolean;
}
export interface DailyCompletion {
  wallet: string;
  date: string;          // YYYY-MM-DD
  words: string[];       // ids practiced
  pronunciationScore: number;
  grammarScore: number;
  pass: boolean;
}
export interface DailyCompletionEvent {
  wallet: string;
  date: string;          // YYYY-MM-DD
  words: string[];       // ids practiced
  pronunciationScore: number;
  grammarScore: number;
  pass: boolean;
  cost: number;          // micro-USD
  ts: string;            // ISO timestamp
}