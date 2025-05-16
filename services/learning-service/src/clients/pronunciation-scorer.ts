// Client for the Pronunciation Scorer Service
import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import * as path from "path";
import { WordAlignment, PhonemeAlignment } from "./alignment";

// Define types for pronunciation scorer responses
export interface PronunciationScore {
  score: number;
  feedback: string[];
}

export interface WordScore {
  word: string;
  score: number;
  issues: string[];
  start_time: number;
  end_time: number;
}

export interface PhonemeScore {
  phoneme: string;
  word: string;
  score: number;
  issue: string;
  start_time: number;
  end_time: number;
}

export interface ScoringResponse {
  success: boolean;
  message: string;
  overall_score: PronunciationScore;
  word_scores: WordScore[];
  phoneme_scores: PhonemeScore[];
  scoring_id: string;
}

// Interface for alignment data passed from the alignment service
export interface AlignmentData {
  word_alignments: WordAlignment[];
  phoneme_alignments: PhonemeAlignment[];
  alignment_id?: string;
}

// Load the proto file
const PROTO_PATH = path.resolve(__dirname, "../../proto/pronunciation_scorer.proto");
const pkgDef = loadSync(PROTO_PATH);
const proto = loadPackageDefinition(pkgDef) as any;

// Get host and port from environment variables with defaults
const PRONUNCIATION_SCORER_HOST = process.env.PRONUNCIATION_SCORER_HOST || "pronunciation-scorer";
const PRONUNCIATION_SCORER_PORT = process.env.PRONUNCIATION_SCORER_PORT || "50052";

// Create the client
const client = new proto.pronunciation_scorer.PronunciationScorerService(
  `${PRONUNCIATION_SCORER_HOST}:${PRONUNCIATION_SCORER_PORT}`,
  credentials.createInsecure()
);

// Helper function to retry gRPC calls
async function retryRpcCall<T>(fn: () => Promise<T>, retries = 3, delay = 500): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries === 0) {
      throw error;
    }
    console.warn(`RPC call failed, retrying... (${retries} retries left)`, error.message);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryRpcCall(fn, retries - 1, delay * 2);
  }
}

/**
 * Convert alignment data to the format expected by the pronunciation scorer service
 */
function convertAlignmentData(alignmentData: AlignmentData) {
  // Create the expected format for alignments array
  const alignments = [{
    word_alignments: alignmentData.word_alignments,
    phoneme_alignments: alignmentData.phoneme_alignments
  }];
  
  return alignments;
}

/**
 * Score pronunciation based on aligned audio and text
 * @param audio Raw audio bytes
 * @param text Reference text
 * @param language_code Language code (e.g., "en-US", "es-ES")
 * @param audio_format Format of the audio (e.g., "wav", "mp3")
 * @param alignments Alignment data from the alignment service
 * @param scoring_level "word", "phoneme", or "sentence"
 */
export function scorePronunciation(
  audio: Buffer,
  text: string,
  language_code: string = "en-US",
  audio_format: string = "wav",
  alignments?: AlignmentData,
  scoring_level: string = "phoneme"
): Promise<ScoringResponse> {
  return retryRpcCall(() => new Promise((resolve, reject) => {
    const request: any = {
      audio_data: audio,
      text,
      language_code,
      audio_format,
      scoring_level
    };
    
    if (alignments) {
      request.alignments = convertAlignmentData(alignments);
    }
    
    client.ScorePronunciation(
      request,
      (error: any, response: any) => {
        if (error) {
          console.error("Error from pronunciation scorer service:", error);
          reject(error);
        } else {
          resolve({
            success: response.success,
            message: response.message,
            overall_score: {
              score: response.overall_score?.score || 0,
              feedback: response.overall_score?.feedback || []
            },
            word_scores: response.word_scores || [],
            phoneme_scores: response.phoneme_scores || [],
            scoring_id: response.scoring_id
          });
        }
      }
    );
  }));
}

/**
 * Check health of the pronunciation scorer service
 */
export function checkHealth(): Promise<{ status: boolean; message: string }> {
  return retryRpcCall(() => new Promise((resolve, reject) => {
    client.HealthCheck(
      {},
      (error: any, response: any) => {
        if (error) {
          console.error("Health check failed:", error);
          resolve({ status: false, message: `Health check error: ${error.message}` });
        } else {
          resolve({
            status: response.status,
            message: response.message
          });
        }
      }
    );
  }));
}

export default {
  scorePronunciation,
  checkHealth
};
