// Client for the Alignment Service
import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import * as path from "path";

// Define types for alignment service responses
export interface WordAlignment {
  word: string;
  start_time: number;
  end_time: number;
  confidence: number;
}

export interface PhonemeAlignment {
  phoneme: string;
  start_time: number;
  end_time: number;
  confidence: number;
  word: string;
}

export interface AlignmentResponse {
  success: boolean;
  message: string;
  word_alignments: WordAlignment[];
  phoneme_alignments: PhonemeAlignment[];
  alignment_id: string;
}

// Load the proto file
const PROTO_PATH = path.resolve(__dirname, "../../proto/alignment.proto");
const pkgDef = loadSync(PROTO_PATH);
const proto = loadPackageDefinition(pkgDef) as any;

// Get host and port from environment variables with defaults
const ALIGNMENT_SERVICE_HOST = process.env.ALIGNMENT_SERVICE_HOST || "alignment-service";
const ALIGNMENT_SERVICE_PORT = process.env.ALIGNMENT_SERVICE_PORT || "50051";

// Create the client
const client = new proto.alignment.AlignmentService(
  `${ALIGNMENT_SERVICE_HOST}:${ALIGNMENT_SERVICE_PORT}`,
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
 * Aligns audio with text to get word and phoneme-level timing information
 * @param audio Raw audio bytes
 * @param text Text to align with the audio
 * @param language_code Language code (e.g., "en-US", "es-ES")
 * @param audio_format Format of the audio (e.g., "wav", "mp3")
 * @param alignment_level "word" or "phoneme"
 */
export function alignText(
  audio: Buffer,
  text: string,
  language_code: string = "en-US",
  audio_format: string = "wav",
  alignment_level: string = "phoneme"
): Promise<AlignmentResponse> {
  return retryRpcCall(() => new Promise((resolve, reject) => {
    client.AlignText(
      {
        audio_data: audio,
        text,
        language_code,
        audio_format,
        alignment_level
      },
      (error: any, response: any) => {
        if (error) {
          console.error("Error from alignment service:", error);
          reject(error);
        } else {
          resolve({
            success: response.success,
            message: response.message,
            word_alignments: response.word_alignments || [],
            phoneme_alignments: response.phoneme_alignments || [],
            alignment_id: response.alignment_id
          });
        }
      }
    );
  }));
}

/**
 * Check health of the alignment service
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
  alignText,
  checkHealth
};
