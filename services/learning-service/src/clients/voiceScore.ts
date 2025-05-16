import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import * as path from "path";

// Define the missing types
interface DailyResult {
  id: string;
  wallet: string;
  date: string;
  score: number;
  pass: boolean;
  type?: string;
}

interface DailyCompletion {
  id: string;
  wallet: string;
  date: string;
  completed: boolean;
  score?: number;
  reward_tx?: string;
}

// Define types for detailed evaluation
export interface WordDetail {
  word: string;
  start_time: number;
  end_time: number;
  score: number;
  issues: string[];
}

export interface PhonemeDetail {
  phoneme: string;
  word: string;
  start_time: number;
  end_time: number;
  score: number;
  issue: string;
}

export interface DetailedEvalResponse {
  transcript: string;
  overall_score: number;
  pass: boolean;
  words: WordDetail[];
  phonemes: PhonemeDetail[];
  feedback: string[];
  evaluation_id: string;
  alignment_id: string;
  scoring_id: string;
}

// Load the proto file
const PROTO_PATH = path.resolve(__dirname, "../../proto/voice.proto");
const pkgDef = loadSync(PROTO_PATH);
const proto = loadPackageDefinition(pkgDef) as any;

// Get host and port from environment variables with defaults
const VOICE_SCORE_HOST = process.env.VOICE_SCORE_HOST || "voice-score";
const VOICE_SCORE_PORT = process.env.VOICE_SCORE_PORT || "50054";

const client = new proto.voicescore.VoiceScore(
  `${VOICE_SCORE_HOST}:${VOICE_SCORE_PORT}`,
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

// Legacy evaluation method
export function evaluate(audio: Buffer, expected: string): Promise<{ score: number }> {
  return retryRpcCall(() => new Promise((resolve, reject) => {
    client.Evaluate({ audio, expected_phrase: expected }, (error: any, response: any) => {
      if (error) {
        console.error("Error from voice score service:", error);
        reject(error);
      } else {
        resolve({ score: response.score });
      }
    });
  }));
}

// New detailed evaluation method
export function evaluateDetailed(
  audio: Buffer,
  expected: string,
  language_code: string = "en-US",
  audio_format: string = "wav",
  detail_level: string = "phoneme"
): Promise<DetailedEvalResponse> {
  return retryRpcCall(() => new Promise((resolve, reject) => {
    client.EvaluateDetailed(
      {
        audio,
        expected_phrase: expected,
        language_code,
        audio_format,
        detail_level
      },
      (error: any, response: any) => {
        if (error) {
          console.error("Error from detailed evaluation:", error);
          reject(error);
        } else {
          resolve({
            transcript: response.transcript,
            overall_score: response.overall_score,
            pass: response.pass_,
            words: response.words || [],
            phonemes: response.phonemes || [],
            feedback: response.feedback || [],
            evaluation_id: response.evaluation_id,
            alignment_id: response.alignment_id,
            scoring_id: response.scoring_id
          });
        }
      }
    );
  }));
}

export function getVocab(): Promise<{ vocab: string[] }> {
  return retryRpcCall(() => new Promise((resolve, reject) => {
    client.GetVocab({}, (error: any, response: any) => {
      if (error) {
        console.error("Error getting vocab:", error);
        reject(error);
      } else {
        resolve({ vocab: response.vocab });
      }
    });
  }));
}
export function getVocabItem(id: string): Promise<{ item: { id: string; term: string; translation: string } }> {
  return new Promise((res, rej) =>
    client.GetVocabItem({ id }, (e: any, r: any) =>
      e ? rej(e) : res({ item: r })
    )
  );
}
export function getVocabItems(ids: string[]): Promise<{ items: { id: string; term: string; translation: string }[] }> {
  return new Promise((res, rej) =>
    client.GetVocabItems({ ids }, (e: any, r: any) =>
      e ? rej(e) : res({ items: r.items })
    )
  );
}
export function getDailyResults(wallet: string, date: string): Promise<{ results: DailyResult[] }> {
  return new Promise((res, rej) =>
    client.GetDailyResults({ wallet, date }, (e: any, r: any) =>
      e ? rej(e) : res({ results: r.results })
    )
  );
}
export function getDailyCompletions(wallet: string, date: string): Promise<{ completions: DailyCompletion[] }> {
  return new Promise((res, rej) =>
    client.GetDailyCompletions({ wallet, date }, (e: any, r: any) =>
      e ? rej(e) : res({ completions: r.completions })
    )
  );
}
export function getDailyCompletion(wallet: string, date: string): Promise<{ completion: DailyCompletion }> {
  return new Promise((res, rej) =>
    client.GetDailyCompletion({ wallet, date }, (e: any, r: any) =>
      e ? rej(e) : res({ completion: r })
    )
  );
}