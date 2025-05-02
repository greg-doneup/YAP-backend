export interface VocabItem {
  id?: string;  // Adding id as an optional property
  term: string;
  translation: string;
  audioUrl?: string;
  difficulty?: number;
  examples?: string[];
  tags?: string[];
}

export interface QuizResult {
  score: number;
  pass: boolean;
  corrected: string;
}

export interface GrammarEvalResponse {
  score: number;
  corrected: string;
  errors?: string[];
}