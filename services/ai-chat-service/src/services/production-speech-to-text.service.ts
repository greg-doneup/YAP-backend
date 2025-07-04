import { SpeechClient, protos } from '@google-cloud/speech';
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk';
import OpenAI from 'openai';
import { PassThrough } from 'stream';
import { logger } from '../utils/logger';

export interface TranscriptionResult {
  text: string;
  confidence: number;
  words?: Array<{
    word: string;
    startTime: number;
    endTime: number;
    confidence: number;
  }>;
  alternatives?: Array<{
    text: string;
    confidence: number;
  }>;
  processingTime: number;
  audioQuality: 'poor' | 'fair' | 'good' | 'excellent';
  detectedLanguage?: string;
}

export interface TranscriptionOptions {
  language?: string;
  cefrLevel?: string;
  enableWordTimestamps?: boolean;
  enableAlternatives?: boolean;
  maxAlternatives?: number;
  model?: string;
}

export interface StreamingCallbacks {
  onPartialResult?: (text: string, confidence: number) => void;
  onFinalResult?: (result: TranscriptionResult) => void;
  onError?: (error: Error) => void;
}

/**
 * Production Speech-to-Text Service
 * Supports multiple STT providers: Google Cloud, Azure, OpenAI Whisper
 */
export class ProductionSpeechToTextService {
  private googleClient?: SpeechClient;
  private openaiClient?: OpenAI;
  private config: {
    provider: 'google' | 'azure' | 'openai';
    credentials: any;
    languageMapping: Record<string, string>;
  };

  constructor() {
    this.config = {
      provider: (process.env.STT_PROVIDER as any) || 'openai',
      credentials: {
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
        clientEmail: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
        privateKey: process.env.GOOGLE_CLOUD_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        azureSubscriptionKey: process.env.AZURE_SPEECH_KEY,
        azureRegion: process.env.AZURE_SPEECH_REGION || 'eastus',
        openaiApiKey: process.env.OPENAI_API_KEY
      },
      languageMapping: {
        'spanish': 'es-ES',
        'french': 'fr-FR',
        'english': 'en-US',
        'german': 'de-DE',
        'italian': 'it-IT'
      }
    };

    this.initializeClients();
  }

  private initializeClients(): void {
    try {
      // Initialize Google Cloud Speech
      if (this.config.provider === 'google' && this.config.credentials.projectId) {
        const clientConfig: any = {
          projectId: this.config.credentials.projectId
        };

        if (this.config.credentials.keyFilename) {
          clientConfig.keyFilename = this.config.credentials.keyFilename;
        } else if (this.config.credentials.clientEmail && this.config.credentials.privateKey) {
          clientConfig.credentials = {
            client_email: this.config.credentials.clientEmail,
            private_key: this.config.credentials.privateKey
          };
        }

        this.googleClient = new SpeechClient(clientConfig);
        logger.info('Google Cloud Speech client initialized');
      }

      // Initialize OpenAI
      if (this.config.provider === 'openai' && this.config.credentials.openaiApiKey) {
        this.openaiClient = new OpenAI({
          apiKey: this.config.credentials.openaiApiKey
        });
        logger.info('OpenAI Speech client initialized');
      }

    } catch (error) {
      logger.error('Error initializing STT clients:', error);
    }
  }

  /**
   * Transcribe audio buffer
   */
  async transcribeAudio(
    audioBuffer: Buffer,
    language: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const startTime = Date.now();

    try {
      switch (this.config.provider) {
        case 'google':
          return await this.transcribeWithGoogle(audioBuffer, language, options, startTime);
        case 'azure':
          return await this.transcribeWithAzure(audioBuffer, language, options, startTime);
        case 'openai':
        default:
          return await this.transcribeWithOpenAI(audioBuffer, language, options, startTime);
      }
    } catch (error) {
      logger.error('STT transcription failed:', error);
      throw new Error(`Speech transcription failed: ${error}`);
    }
  }

  private async transcribeWithGoogle(
    audioBuffer: Buffer,
    language: string,
    options: TranscriptionOptions,
    startTime: number
  ): Promise<TranscriptionResult> {
    if (!this.googleClient) {
      throw new Error('Google Speech client not initialized');
    }

    const languageCode = this.config.languageMapping[language] || 'en-US';

    const request = {
      audio: {
        content: audioBuffer.toString('base64')
      },
      config: {
        encoding: 'WEBM_OPUS' as const,
        sampleRateHertz: 48000,
        languageCode,
        enableAutomaticPunctuation: true,
        enableWordTimeOffsets: options.enableWordTimestamps || false,
        maxAlternatives: options.maxAlternatives || 1,
        model: options.model || null
      }
    };

    const response = await this.googleClient.recognize(request);
    const alternatives = response[0]?.results?.[0]?.alternatives || [];
    const primary = alternatives[0];

    if (!primary?.transcript) {
      throw new Error('No transcription result');
    }

    const processingTime = Date.now() - startTime;

    return {
      text: primary.transcript,
      confidence: primary.confidence || 0,
      words: primary.words?.map((word: any) => ({
        word: word.word || '',
        startTime: parseFloat(word.startTime?.seconds || '0') + (word.startTime?.nanos || 0) / 1e9,
        endTime: parseFloat(word.endTime?.seconds || '0') + (word.endTime?.nanos || 0) / 1e9,
        confidence: word.confidence || 0
      })) || [],
      alternatives: alternatives.slice(1).map((alt: any) => ({
        text: alt.transcript || '',
        confidence: alt.confidence || 0
      })),
      processingTime,
      audioQuality: 'excellent',
      detectedLanguage: languageCode
    };
  }

  private async transcribeWithOpenAI(
    audioBuffer: Buffer,
    language: string,
    options: TranscriptionOptions,
    startTime: number
  ): Promise<TranscriptionResult> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    // Create a File object from buffer
    const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

    const transcriptionParams: any = {
      file,
      model: 'whisper-1',
      response_format: 'verbose_json'
    };

    if (this.config.languageMapping[language]) {
      transcriptionParams.language = this.config.languageMapping[language].split('-')[0];
    }

    if (options.enableWordTimestamps) {
      transcriptionParams.timestamp_granularities = ['word'];
    }

    const transcription = await this.openaiClient.audio.transcriptions.create(transcriptionParams);

    const processingTime = Date.now() - startTime;

    // Handle different response formats
    let result: any;
    if (typeof transcription === 'string') {
      result = { text: transcription };
    } else {
      result = transcription;
    }

    return {
      text: result.text || '',
      confidence: 0.95, // OpenAI doesn't provide confidence scores
      words: result.words?.map((word: any) => ({
        word: word.word || '',
        startTime: word.start || 0,
        endTime: word.end || 0,
        confidence: 0.95
      })) || [],
      alternatives: [],
      processingTime,
      audioQuality: 'excellent',
      detectedLanguage: result.language || language
    };
  }

  private async transcribeWithAzure(
    audioBuffer: Buffer,
    language: string,
    options: TranscriptionOptions,
    startTime: number
  ): Promise<TranscriptionResult> {
    return new Promise((resolve, reject) => {
      const speechConfig = speechsdk.SpeechConfig.fromSubscription(
        this.config.credentials.azureSubscriptionKey,
        this.config.credentials.azureRegion
      );

      const languageCode = this.config.languageMapping[language] || 'en-US';
      speechConfig.speechRecognitionLanguage = languageCode;
      speechConfig.requestWordLevelTimestamps();

      // Create audio config from buffer
      const pushStream = speechsdk.AudioInputStream.createPushStream();
      pushStream.write(audioBuffer);
      pushStream.close();

      const audioConfig = speechsdk.AudioConfig.fromStreamInput(pushStream);
      const recognizer = new speechsdk.SpeechRecognizer(speechConfig, audioConfig);

      recognizer.recognizeOnceAsync(
        (result) => {
          const processingTime = Date.now() - startTime;

          recognizer.close();
          resolve({
            text: result.text || '',
            confidence: result.json ? JSON.parse(result.json).NBest?.[0]?.Confidence || 0 : 0,
            words: [],
            alternatives: [],
            processingTime,
            audioQuality: 'excellent',
            detectedLanguage: languageCode
          });
        },
        (error) => {
          recognizer.close();
          reject(error);
        }
      );
    });
  }

  /**
   * Start streaming transcription
   */
  async startStreamingTranscription(
    language: string,
    callbacks: StreamingCallbacks,
    options: TranscriptionOptions = {}
  ): Promise<{
    write: (chunk: Buffer) => void;
    end: () => void;
    destroy: () => void;
  }> {
    switch (this.config.provider) {
      case 'google':
        return this.startGoogleStreaming(language, callbacks, options);
      case 'azure':
        return this.startAzureStreaming(language, callbacks, options);
      case 'openai':
      default:
        return this.startSimpleStreaming(language, callbacks, options);
    }
  }

  private async startGoogleStreaming(
    language: string,
    callbacks: StreamingCallbacks,
    options: TranscriptionOptions
  ): Promise<{ write: (chunk: Buffer) => void; end: () => void; destroy: () => void }> {
    if (!this.googleClient) {
      throw new Error('Google Speech client not initialized');
    }

    const languageCode = this.config.languageMapping[language] || 'en-US';

    const recognizeStream = this.googleClient
      .streamingRecognize({
        config: {
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 48000,
          languageCode,
          enableAutomaticPunctuation: true
        }
      });

    recognizeStream.on('data', (data: any) => {
      if (data.results?.[0]) {
        const result = data.results[0];
        const alternative = result.alternatives?.[0];

        if (alternative) {
          if (result.isFinal && callbacks.onFinalResult) {
            callbacks.onFinalResult({
              text: alternative.transcript || '',
              confidence: alternative.confidence || 0,
              words: [],
              alternatives: [],
              processingTime: 0,
              audioQuality: 'excellent',
              detectedLanguage: languageCode
            });
          } else if (callbacks.onPartialResult) {
            callbacks.onPartialResult(
              alternative.transcript || '',
              alternative.confidence || 0
            );
          }
        }
      }
    });

    recognizeStream.on('error', (error: Error) => {
      if (callbacks.onError) {
        callbacks.onError(error);
      }
    });

    return {
      write: (chunk: Buffer) => {
        recognizeStream.write(chunk);
      },
      end: () => {
        recognizeStream.end();
      },
      destroy: () => {
        recognizeStream.destroy();
      }
    };
  }

  private async startAzureStreaming(
    language: string,
    callbacks: StreamingCallbacks,
    options: TranscriptionOptions
  ): Promise<{ write: (chunk: Buffer) => void; end: () => void; destroy: () => void }> {
    const speechConfig = speechsdk.SpeechConfig.fromSubscription(
      this.config.credentials.azureSubscriptionKey,
      this.config.credentials.azureRegion
    );

    const languageCode = this.config.languageMapping[language] || 'en-US';
    speechConfig.speechRecognitionLanguage = languageCode;

    const pushStream = speechsdk.AudioInputStream.createPushStream();
    const audioConfig = speechsdk.AudioConfig.fromStreamInput(pushStream);
    const recognizer = new speechsdk.SpeechRecognizer(speechConfig, audioConfig);

    recognizer.recognizing = (s, e) => {
      if (callbacks.onPartialResult && e.result.text) {
        callbacks.onPartialResult(e.result.text, 0.8);
      }
    };

    recognizer.recognized = (s, e) => {
      if (callbacks.onFinalResult && e.result.text) {
        callbacks.onFinalResult({
          text: e.result.text,
          confidence: 0.9,
          words: [],
          alternatives: [],
          processingTime: 0,
          audioQuality: 'excellent',
          detectedLanguage: languageCode
        });
      }
    };

    recognizer.startContinuousRecognitionAsync();

    return {
      write: (chunk: Buffer) => {
        pushStream.write(chunk);
      },
      end: () => {
        pushStream.close();
        recognizer.stopContinuousRecognitionAsync();
      },
      destroy: () => {
        pushStream.close();
        recognizer.close();
      }
    };
  }

  private async startSimpleStreaming(
    language: string,
    callbacks: StreamingCallbacks,
    options: TranscriptionOptions
  ): Promise<{ write: (chunk: Buffer) => void; end: () => void; destroy: () => void }> {
    // Simple buffering approach for providers without streaming support
    let audioBuffer = Buffer.alloc(0);

    return {
      write: (chunk: Buffer) => {
        audioBuffer = Buffer.concat([audioBuffer, chunk]);
        
        // Provide partial feedback
        if (callbacks.onPartialResult) {
          callbacks.onPartialResult('...', 0.5);
        }
      },
      end: async () => {
        try {
          const result = await this.transcribeAudio(audioBuffer, language, options);
          if (callbacks.onFinalResult) {
            callbacks.onFinalResult(result);
          }
        } catch (error) {
          if (callbacks.onError) {
            callbacks.onError(error as Error);
          }
        }
      },
      destroy: () => {
        audioBuffer = Buffer.alloc(0);
      }
    };
  }

  /**
   * Check if service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      switch (this.config.provider) {
        case 'google':
          return !!this.googleClient;
        case 'openai':
          return !!this.openaiClient;
        default:
          return false;
      }
    } catch (error) {
      logger.error('STT availability check failed:', error);
      return false;
    }
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return Object.keys(this.config.languageMapping);
  }
}
