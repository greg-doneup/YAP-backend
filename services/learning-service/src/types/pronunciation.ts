/**
 * Types for the pronunciation assessment pipeline
 */

// Alignment service types
export interface AlignmentWord {
  word: string;
  start_time: number;
  end_time: number;
}

export interface AlignmentPhoneme {
  phoneme: string;
  word: string;
  start_time: number;
  end_time: number;
}

export interface AlignmentData {
  words: AlignmentWord[];
  phonemes: AlignmentPhoneme[];
}

export interface AlignmentResponse {
  transcript: string;
  alignments: AlignmentData;
  alignment_id: string;
  language_code: string;
}

// Pronunciation scorer types
export interface ScoringWord {
  word: string;
  start_time: number;
  end_time: number;
  score: number;
  issues: string[];
}

export interface ScoringPhoneme {
  phoneme: string;
  word: string;
  start_time: number;
  end_time: number;
  score: number;
  issue: string;
}

export interface ScoringResponse {
  overall_score: number;
  fluency_score: number;
  accuracy_score: number;
  words: ScoringWord[];
  phonemes: ScoringPhoneme[];
  scoring_id: string;
}

// TTS service types
export interface TTSResponse {
  audio_data: Buffer;
  audio_format: string;
  duration: number; // in seconds
  success?: boolean;
  message?: string;
  cache_key?: string;
}

export interface Voice {
  voice_id: string;
  name: string;
  language_code: string;
  gender: string;
  neural: boolean;
  provider: string;
  accent: string;
}

export interface TTSVoiceResponse {
  success: boolean;
  message: string;
  voices: Voice[];
}
