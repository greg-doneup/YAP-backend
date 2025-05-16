// Client for the TTS Service
import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import * as path from "path";

// Define types for TTS service responses
export interface TTSResponse {
  success: boolean;
  message: string;
  audio_data: Buffer;
  audio_format: string;
  duration: number;
  cache_key: string;
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

export interface VoicesResponse {
  success: boolean;
  message: string;
  voices: Voice[];
}

// Load the proto file
const PROTO_PATH = path.resolve(__dirname, "../../proto/tts.proto");
const pkgDef = loadSync(PROTO_PATH);
const proto = loadPackageDefinition(pkgDef) as any;

// Get host and port from environment variables with defaults
const TTS_SERVICE_HOST = process.env.TTS_SERVICE_HOST || "tts-service";
const TTS_SERVICE_PORT = process.env.TTS_SERVICE_PORT || "50053";

// Create the client
const client = new proto.tts.TTSService(
  `${TTS_SERVICE_HOST}:${TTS_SERVICE_PORT}`,
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
 * Generates speech from text
 * @param text Text to synthesize
 * @param language_code Language code (e.g., "en-US", "es-ES")
 * @param voice_id Optional specific voice to use
 * @param audio_format Format of the output audio (e.g., "wav", "mp3")
 * @param speaking_rate Optional speaking rate (0.5 to 2.0, default 1.0)
 * @param pitch Optional voice pitch (-10.0 to 10.0, default 0.0)
 * @param ssml Optional SSML markup for more control over synthesis
 * @param use_neural_voice Whether to prefer a neural voice if available
 * @param region_variant Optional regional variant (e.g., "es-ES", "es-MX")
 */
export function generateSpeech(
  text: string,
  language_code: string = "en-US",
  voice_id?: string,
  audio_format: string = "mp3",
  speaking_rate?: number,
  pitch?: number,
  ssml?: string,
  use_neural_voice?: boolean,
  region_variant?: string
): Promise<TTSResponse> {
  return retryRpcCall(() => new Promise((resolve, reject) => {
    client.GenerateSpeech(
      {
        text,
        language_code,
        voice_id,
        audio_format,
        speaking_rate,
        pitch,
        ssml,
        use_neural_voice,
        region_variant
      },
      (error: any, response: any) => {
        if (error) {
          console.error("Error from TTS service:", error);
          reject(error);
        } else {
          resolve({
            success: response.success,
            message: response.message,
            audio_data: response.audio_data,
            audio_format: response.audio_format,
            duration: response.duration,
            cache_key: response.cache_key
          });
        }
      }
    );
  }));
}

/**
 * Generates sample pronunciation for a phoneme or word
 * @param phoneme Phoneme to synthesize (e.g., "AE", "TH")
 * @param word Optional word containing the phoneme for context
 * @param language_code Language code (e.g., "en-US", "es-ES")
 * @param voice_id Optional specific voice to use
 * @param audio_format Format of the output audio (e.g., "wav", "mp3")
 */
export function generatePhonemeAudio(
  phoneme: string,
  word?: string,
  language_code: string = "en-US",
  voice_id?: string,
  audio_format: string = "mp3"
): Promise<TTSResponse> {
  return retryRpcCall(() => new Promise((resolve, reject) => {
    client.GeneratePhonemeAudio(
      {
        phoneme,
        word,
        language_code,
        voice_id,
        audio_format
      },
      (error: any, response: any) => {
        if (error) {
          console.error("Error from TTS service:", error);
          reject(error);
        } else {
          resolve({
            success: response.success,
            message: response.message,
            audio_data: response.audio_data,
            audio_format: response.audio_format,
            duration: response.duration,
            cache_key: response.cache_key
          });
        }
      }
    );
  }));
}

/**
 * Lists available voices for a language
 * @param language_code Optional filter by language code
 * @param gender Optional filter by gender ("MALE", "FEMALE")
 * @param neural_only Optional filter for neural voices only
 */
export function listVoices(
  language_code?: string,
  gender?: string,
  neural_only?: boolean
): Promise<VoicesResponse> {
  return retryRpcCall(() => new Promise((resolve, reject) => {
    client.ListVoices(
      {
        language_code,
        gender,
        neural_only
      },
      (error: any, response: any) => {
        if (error) {
          console.error("Error listing voices:", error);
          reject(error);
        } else {
          resolve({
            success: response.success,
            message: response.message,
            voices: response.voices || []
          });
        }
      }
    );
  }));
}

/**
 * Check health of the TTS service
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
  generateSpeech,
  generatePhonemeAudio,
  listVoices,
  checkHealth
};
