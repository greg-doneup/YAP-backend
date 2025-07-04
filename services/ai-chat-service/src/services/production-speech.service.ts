/**
 * Production Speech Service
 * Handles speech-to-text, text-to-speech, and real-time audio processing
 * Uses OpenAI Whisper and TTS - ready for production deployment
 */

import OpenAI from 'openai';
import { logger } from '../utils/logger';

export interface SpeechToTextResult {
  text: string;
  confidence: number;
  language: string;
  processingTime: number;
  words?: {
    word: string;
    start: number;
    end: number;
    confidence: number;
  }[];
}

export interface TextToSpeechResult {
  audioBuffer: Buffer;
  duration: number;
  format: string;
  speechRate: number;
  voiceId: string;
}

export interface StreamingTranscriptionConfig {
  language: string;
  cefrLevel: string;
  realTimeCallback?: (text: string) => void;
  punctuation?: boolean;
  wordTimestamps?: boolean;
}

export interface VoiceSynthesisOptions {
  voice?: string;
  speed?: number;
  pitch?: number;
  emotion?: 'neutral' | 'friendly' | 'professional';
  ssml?: boolean;
}

/**
 * Production-ready speech service with OpenAI integration
 */
export class ProductionSpeechService {
  private openaiClient: OpenAI;
  private voiceMapping: { [language: string]: string } = {
    'spanish': 'nova',    // Female, clear Spanish
    'french': 'alloy',    // Clear, neutral voice
    'english': 'echo'     // Professional male voice
  };

  constructor(openaiApiKey: string) {
    this.openaiClient = new OpenAI({
      apiKey: openaiApiKey
    });
  }

  /**
   * Convert speech to text using OpenAI Whisper
   */
  async speechToText(
    audioBuffer: Buffer,
    language: string,
    options: Partial<StreamingTranscriptionConfig> = {}
  ): Promise<SpeechToTextResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting speech-to-text processing', {
        audioSize: audioBuffer.length,
        language,
        options
      });

      // Create a File object from the buffer
      const audioFile = new File([audioBuffer], 'audio.wav', { 
        type: 'audio/wav' 
      });

      // Use OpenAI Whisper for transcription
      const response = await this.openaiClient.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: this.mapLanguageCode(language),
        response_format: options.wordTimestamps ? 'verbose_json' : 'json',
        ...(options.wordTimestamps && { timestamp_granularities: ['word'] })
      });

      const processingTime = Date.now() - startTime;

      let result: SpeechToTextResult;

      if (typeof response === 'string') {
        // Simple text response
        result = {
          text: response,
          confidence: 0.95, // Whisper doesn't provide confidence, assume high
          language,
          processingTime
        };
      } else {
        // Verbose JSON response with timestamps
        const verboseResponse = response as any; // OpenAI types don't include verbose_json format
        result = {
          text: verboseResponse.text,
          confidence: 0.95,
          language: verboseResponse.language || language,
          processingTime,
          ...(verboseResponse.words && {
            words: verboseResponse.words.map((word: any) => ({
              word: word.word,
              start: word.start,
              end: word.end,
              confidence: 0.95 // Whisper doesn't provide word-level confidence
            }))
          })
        };
      }

      logger.info('Speech-to-text completed', {
        transcribedText: result.text,
        processingTime: result.processingTime,
        wordCount: result.words?.length || 0
      });

      return result;
    } catch (error) {
      logger.error('Speech-to-text failed', { error, language });
      throw new Error(`Speech transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert text to speech using OpenAI TTS
   */
  async textToSpeech(
    text: string,
    language: string,
    cefrLevel: string,
    options: VoiceSynthesisOptions = {}
  ): Promise<TextToSpeechResult> {
    const startTime = Date.now();

    try {
      logger.info('Starting text-to-speech processing', {
        textLength: text.length,
        language,
        cefrLevel,
        voice: options.voice
      });

      // Select appropriate voice for language and CEFR level
      const voiceId = options.voice || this.selectVoiceForLevel(language, cefrLevel);
      
      // Adjust speech speed based on CEFR level
      const speechSpeed = options.speed || this.calculateSpeechSpeed(cefrLevel);

      // Generate speech using OpenAI TTS
      const response = await this.openaiClient.audio.speech.create({
        model: 'tts-1-hd', // High quality model
        voice: voiceId as any,
        input: text,
        speed: speechSpeed,
        response_format: 'wav'
      });

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      const duration = this.estimateAudioDuration(text, speechSpeed);

      const result: TextToSpeechResult = {
        audioBuffer,
        duration,
        format: 'wav',
        speechRate: speechSpeed,
        voiceId
      };

      logger.info('Text-to-speech completed', {
        audioSize: audioBuffer.length,
        duration: result.duration,
        speechRate: result.speechRate,
        processingTime: Date.now() - startTime
      });

      return result;
    } catch (error) {
      logger.error('Text-to-speech failed', { error, text: text.substring(0, 100) });
      throw new Error(`Speech synthesis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process a complete voice conversation turn
   */
  async processVoiceTurn(
    audioBuffer: Buffer,
    language: string,
    cefrLevel: string,
    generateResponse: (text: string) => Promise<string>
  ): Promise<{
    transcription: SpeechToTextResult;
    responseText: string;
    responseAudio: TextToSpeechResult;
    totalProcessingTime: number;
  }> {
    const startTime = Date.now();

    try {
      // Step 1: Transcribe user audio
      const transcription = await this.speechToText(audioBuffer, language, {
        language,
        cefrLevel,
        wordTimestamps: true
      });

      // Step 2: Generate AI response text
      const responseText = await generateResponse(transcription.text);

      // Step 3: Convert response to speech
      const responseAudio = await this.textToSpeech(responseText, language, cefrLevel, {
        emotion: 'friendly'
      });

      const totalProcessingTime = Date.now() - startTime;

      logger.info('Voice turn processing completed', {
        transcriptionTime: transcription.processingTime,
        totalTime: totalProcessingTime,
        inputLength: transcription.text.length,
        outputLength: responseText.length
      });

      return {
        transcription,
        responseText,
        responseAudio,
        totalProcessingTime
      };
    } catch (error) {
      logger.error('Voice turn processing failed', { error });
      throw error;
    }
  }

  /**
   * Create a streaming transcription session (for real-time)
   */
  async createStreamingSession(
    config: StreamingTranscriptionConfig
  ): Promise<{
    sessionId: string;
    processAudioChunk: (chunk: Buffer) => Promise<void>;
    endSession: () => Promise<SpeechToTextResult>;
  }> {
    const sessionId = `stream_${Date.now()}`;
    const audioChunks: Buffer[] = [];

    logger.info('Created streaming transcription session', { sessionId, config });

    return {
      sessionId,
      processAudioChunk: async (chunk: Buffer) => {
        audioChunks.push(chunk);
        
        // For real streaming, you'd send chunks to a streaming service
        // For now, we accumulate and process at the end
        logger.debug('Received audio chunk', { 
          sessionId, 
          chunkSize: chunk.length,
          totalChunks: audioChunks.length 
        });
      },
      endSession: async () => {
        const fullAudio = Buffer.concat(audioChunks);
        const result = await this.speechToText(fullAudio, config.language, config);
        
        logger.info('Streaming session ended', { sessionId, finalText: result.text });
        return result;
      }
    };
  }

  /**
   * Validate audio quality for processing
   */
  validateAudioQuality(audioBuffer: Buffer): {
    isValid: boolean;
    quality: 'excellent' | 'good' | 'fair' | 'poor';
    issues: string[];
  } {
    const issues: string[] = [];
    let quality: 'excellent' | 'good' | 'fair' | 'poor' = 'excellent';

    // Check file size
    if (audioBuffer.length < 1000) {
      issues.push('Audio too short');
      quality = 'poor';
    } else if (audioBuffer.length > 25 * 1024 * 1024) { // 25MB limit
      issues.push('Audio file too large');
      quality = 'poor';
    }

    // Basic format validation (check for common audio headers)
    const header = audioBuffer.subarray(0, 12);
    const isWav = header.includes(Buffer.from('WAVE'));
    const isMp3 = header.subarray(0, 3).equals(Buffer.from([0xFF, 0xFB, 0x90]));
    
    if (!isWav && !isMp3) {
      issues.push('Unsupported audio format');
      quality = 'poor';
    }

    return {
      isValid: issues.length === 0,
      quality,
      issues
    };
  }

  /**
   * Get available voices for a language
   */
  getAvailableVoices(language: string): string[] {
    const allVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    
    // Return language-appropriate voices
    switch (language) {
      case 'spanish':
        return ['nova', 'alloy', 'echo']; // Female voices work well for Spanish
      case 'french':
        return ['alloy', 'echo', 'shimmer']; // Clear pronunciation voices
      default:
        return allVoices;
    }
  }

  /**
   * Map internal language codes to OpenAI language codes
   */
  private mapLanguageCode(language: string): string {
    const mapping: { [key: string]: string } = {
      'spanish': 'es',
      'french': 'fr',
      'english': 'en'
    };
    return mapping[language] || 'en';
  }

  /**
   * Select appropriate voice based on language and CEFR level
   */
  private selectVoiceForLevel(language: string, cefrLevel: string): string {
    const baseVoice = this.voiceMapping[language] || 'alloy';
    
    // For beginners, use clearer, slower voices
    if (['A1', 'A2'].includes(cefrLevel)) {
      return language === 'spanish' ? 'nova' : 'alloy';
    }
    
    return baseVoice;
  }

  /**
   * Calculate appropriate speech speed for CEFR level
   */
  private calculateSpeechSpeed(cefrLevel: string): number {
    const speedMap: { [key: string]: number } = {
      'A1': 0.75,  // Very slow for beginners
      'A2': 0.85,  // Slow
      'B1': 0.9,   // Slightly slow
      'B2': 1.0,   // Normal speed
      'C1': 1.1,   // Slightly fast
      'C2': 1.15   // Natural speed
    };
    
    return speedMap[cefrLevel] || 1.0;
  }

  /**
   * Estimate audio duration based on text and speech speed
   */
  private estimateAudioDuration(text: string, speechSpeed: number): number {
    // Average speaking rate: ~150 words per minute
    const wordsPerMinute = 150 * speechSpeed;
    const wordCount = text.split(/\s+/).length;
    return (wordCount / wordsPerMinute) * 60; // Return in seconds
  }
}
