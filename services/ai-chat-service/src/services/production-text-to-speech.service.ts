import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk';
import OpenAI from 'openai';
import { logger } from '../utils/logger';

export interface SynthesisResult {
  audioBuffer: Buffer;
  audioFormat: string;
  duration: number;
  textLength: number;
  processingTime: number;
  voiceUsed: string;
  ssml?: string;
}

export interface SynthesisOptions {
  speakingRate?: number;
  pitch?: number;
  volume?: number;
  voice?: string;
  useSSML?: boolean;
  emotion?: 'neutral' | 'calm' | 'cheerful' | 'excited';
  audioFormat?: 'mp3' | 'wav' | 'ogg';
}

export interface VoiceInfo {
  name: string;
  languageCode: string;
  ssmlGender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  naturalSampleRateHertz: number;
}

/**
 * Production Text-to-Speech Service
 * Supports multiple TTS providers: Google Cloud, AWS Polly, Azure, OpenAI
 */
export class ProductionTextToSpeechService {
  private googleClient?: TextToSpeechClient;
  private pollyClient?: PollyClient;
  private openaiClient?: OpenAI;
  private config: {
    provider: 'google' | 'aws' | 'azure' | 'openai';
    credentials: any;
    languageMapping: Record<string, string>;
    voiceMapping: Record<string, string>;
  };

  constructor() {
    this.config = {
      provider: (process.env.TTS_PROVIDER as any) || 'openai',
      credentials: {
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
        clientEmail: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
        privateKey: process.env.GOOGLE_CLOUD_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
        awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        awsRegion: process.env.AWS_REGION || 'us-east-1',
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
      },
      voiceMapping: {
        'spanish': 'es-ES-Standard-A',
        'french': 'fr-FR-Standard-A',
        'english': 'en-US-Standard-A',
        'german': 'de-DE-Standard-A',
        'italian': 'it-IT-Standard-A'
      }
    };

    this.initializeClients();
  }

  private initializeClients(): void {
    try {
      // Initialize Google Cloud TTS
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

        this.googleClient = new TextToSpeechClient(clientConfig);
        logger.info('Google Cloud TTS client initialized');
      }

      // Initialize AWS Polly
      if (this.config.provider === 'aws' && this.config.credentials.awsAccessKeyId) {
        this.pollyClient = new PollyClient({
          region: this.config.credentials.awsRegion,
          credentials: {
            accessKeyId: this.config.credentials.awsAccessKeyId,
            secretAccessKey: this.config.credentials.awsSecretAccessKey
          }
        });
        logger.info('AWS Polly client initialized');
      }

      // Initialize OpenAI
      if (this.config.provider === 'openai' && this.config.credentials.openaiApiKey) {
        this.openaiClient = new OpenAI({
          apiKey: this.config.credentials.openaiApiKey
        });
        logger.info('OpenAI TTS client initialized');
      }

    } catch (error) {
      logger.error('Error initializing TTS clients:', error);
    }
  }

  /**
   * Synthesize speech from text
   */
  async synthesizeSpeech(
    text: string,
    language: string,
    options: SynthesisOptions = {}
  ): Promise<SynthesisResult> {
    const startTime = Date.now();

    try {
      switch (this.config.provider) {
        case 'google':
          return await this.synthesizeWithGoogle(text, language, options, startTime);
        case 'aws':
          return await this.synthesizeWithAWS(text, language, options, startTime);
        case 'azure':
          return await this.synthesizeWithAzure(text, language, options, startTime);
        case 'openai':
        default:
          return await this.synthesizeWithOpenAI(text, language, options, startTime);
      }
    } catch (error) {
      logger.error('TTS synthesis failed:', error);
      throw new Error(`Speech synthesis failed: ${error}`);
    }
  }

  private async synthesizeWithOpenAI(
    text: string,
    language: string,
    options: SynthesisOptions,
    startTime: number
  ): Promise<SynthesisResult> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    const voiceMap: Record<string, string> = {
      'spanish': 'nova',
      'french': 'alloy',
      'english': 'alloy',
      'german': 'echo',
      'italian': 'fable'
    };

    const voiceId = options.voice || voiceMap[language] || 'alloy';

    const response = await this.openaiClient.audio.speech.create({
      model: 'tts-1-hd',
      voice: voiceId as any,
      input: text,
      speed: options.speakingRate || 1.0
    });

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const processingTime = Date.now() - startTime;

    return {
      audioBuffer,
      audioFormat: 'mp3',
      duration: this.estimateAudioDuration(text, options.speakingRate || 1.0),
      textLength: text.length,
      processingTime,
      voiceUsed: voiceId
    };
  }

  private async synthesizeWithGoogle(
    text: string,
    language: string,
    options: SynthesisOptions,
    startTime: number
  ): Promise<SynthesisResult> {
    if (!this.googleClient) {
      throw new Error('Google TTS client not initialized');
    }

    const languageCode = this.config.languageMapping[language] || 'en-US';
    const voice = await this.getPreferredVoice(language);

    // Build SSML if requested
    let input: any;
    if (options.useSSML && voice) {
      const ssml = this.buildSSML(text, voice, options);
      input = { ssml };
    } else {
      input = { text };
    }

    const request = {
      input,
      voice: {
        languageCode: voice?.languageCode || languageCode,
        name: options.voice || voice?.name || this.config.voiceMapping[language] || null,
        ssmlGender: voice?.ssmlGender || ('NEUTRAL' as const)
      },
      audioConfig: {
        audioEncoding: 'MP3' as const,
        speakingRate: options.speakingRate || 1.0,
        pitch: options.pitch || 0.0,
        volumeGainDb: options.volume || 0.0
      }
    };

    const response = await this.googleClient.synthesizeSpeech(request);
    const [result] = response;
    const audioBuffer = Buffer.from(result.audioContent as Uint8Array);
    const processingTime = Date.now() - startTime;

    return {
      audioBuffer,
      audioFormat: 'mp3',
      duration: this.estimateAudioDuration(text, options.speakingRate || 1.0),
      textLength: text.length,
      processingTime,
      voiceUsed: options.voice || voice?.name || 'default',
      ssml: options.useSSML ? (input.ssml || undefined) : undefined
    };
  }

  private async synthesizeWithAWS(
    text: string,
    language: string,
    options: SynthesisOptions,
    startTime: number
  ): Promise<SynthesisResult> {
    if (!this.pollyClient) {
      throw new Error('AWS Polly client not initialized');
    }

    const voiceMap: Record<string, string> = {
      'spanish': 'Lucia',
      'french': 'Celine',
      'english': 'Joanna',
      'german': 'Marlene',
      'italian': 'Carla'
    };

    const voiceId = options.voice || voiceMap[language] || 'Joanna';

    const command = new SynthesizeSpeechCommand({
      Text: text,
      OutputFormat: 'mp3',
      VoiceId: voiceId as any,
      SampleRate: '22050',
      Engine: 'neural'
    });

    const response = await this.pollyClient.send(command);
    const audioBuffer = Buffer.from(await response.AudioStream!.transformToByteArray());
    const processingTime = Date.now() - startTime;

    return {
      audioBuffer,
      audioFormat: 'mp3',
      duration: this.estimateAudioDuration(text, options.speakingRate || 1.0),
      textLength: text.length,
      processingTime,
      voiceUsed: voiceId
    };
  }

  private async synthesizeWithAzure(
    text: string,
    language: string,
    options: SynthesisOptions,
    startTime: number
  ): Promise<SynthesisResult> {
    return new Promise((resolve, reject) => {
      const speechConfig = speechsdk.SpeechConfig.fromSubscription(
        this.config.credentials.azureSubscriptionKey,
        this.config.credentials.azureRegion
      );

      speechConfig.speechSynthesisOutputFormat = speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
      
      const voice = this.getAzureVoice(language);
      speechConfig.speechSynthesisVoiceName = options.voice || voice.name;

      const synthesizer = new speechsdk.SpeechSynthesizer(speechConfig);

      synthesizer.speakTextAsync(
        text,
        (result) => {
          const audioBuffer = Buffer.from(result.audioData);
          const processingTime = Date.now() - startTime;

          synthesizer.close();
          resolve({
            audioBuffer,
            audioFormat: 'mp3',
            duration: this.estimateAudioDuration(text, options.speakingRate || 1.0),
            textLength: text.length,
            processingTime,
            voiceUsed: options.voice || voice.name
          });
        },
        (error) => {
          synthesizer.close();
          reject(error);
        }
      );
    });
  }

  /**
   * Get available voices for a language
   */
  async getAvailableVoices(language?: string): Promise<VoiceInfo[]> {
    try {
      if (this.config.provider === 'google' && this.googleClient) {
        const languageCode = language ? this.config.languageMapping[language] : null;
        const request = languageCode ? { languageCode } : {};
        const response = await this.googleClient.listVoices(request);
        const [result] = response;

        return (result.voices || []).map((voice: any) => ({
          name: voice.name || '',
          languageCode: voice.languageCodes?.[0] || '',
          ssmlGender: voice.ssmlGender || 'NEUTRAL',
          naturalSampleRateHertz: voice.naturalSampleRateHertz || 22050
        }));
      }

      // Fallback voice list for other providers
      return this.getDefaultVoices(language);
    } catch (error) {
      logger.error('Error getting available voices:', error);
      return this.getDefaultVoices(language);
    }
  }

  private getDefaultVoices(language?: string): VoiceInfo[] {
    const allVoices = [
      { name: 'en-US-Standard-A', languageCode: 'en-US', ssmlGender: 'FEMALE' as const, naturalSampleRateHertz: 22050 },
      { name: 'es-ES-Standard-A', languageCode: 'es-ES', ssmlGender: 'FEMALE' as const, naturalSampleRateHertz: 22050 },
      { name: 'fr-FR-Standard-A', languageCode: 'fr-FR', ssmlGender: 'FEMALE' as const, naturalSampleRateHertz: 22050 },
      { name: 'de-DE-Standard-A', languageCode: 'de-DE', ssmlGender: 'FEMALE' as const, naturalSampleRateHertz: 22050 },
      { name: 'it-IT-Standard-A', languageCode: 'it-IT', ssmlGender: 'FEMALE' as const, naturalSampleRateHertz: 22050 }
    ];

    if (language) {
      const languageCode = this.config.languageMapping[language];
      return allVoices.filter(voice => voice.languageCode === languageCode);
    }

    return allVoices;
  }

  private async getPreferredVoice(language: string): Promise<VoiceInfo | undefined> {
    const voices = await this.getAvailableVoices(language);
    return voices.find(voice => voice.ssmlGender === 'FEMALE') || voices[0];
  }

  private getAzureVoice(language: string): { name: string } {
    const voiceMap: Record<string, string> = {
      'spanish': 'es-ES-ElviraNeural',
      'french': 'fr-FR-DeniseNeural',
      'english': 'en-US-AriaNeural',
      'german': 'de-DE-KatjaNeural',
      'italian': 'it-IT-ElsaNeural'
    };

    return { name: voiceMap[language] || 'en-US-AriaNeural' };
  }

  private buildSSML(text: string, voice: VoiceInfo, options: SynthesisOptions): string {
    let ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${voice.languageCode}">`;
    
    // Add voice selection
    ssml += `<voice name="${voice.name}">`;
    
    // Add prosody controls
    const prosodyAttrs: string[] = [];
    if (options.speakingRate) prosodyAttrs.push(`rate="${options.speakingRate}"`);
    if (options.pitch) prosodyAttrs.push(`pitch="${options.pitch > 0 ? '+' : ''}${options.pitch}Hz"`);
    if (options.volume) prosodyAttrs.push(`volume="${options.volume > 0 ? '+' : ''}${options.volume}dB"`);
    
    if (prosodyAttrs.length > 0) {
      ssml += `<prosody ${prosodyAttrs.join(' ')}>`;
    }
    
    // Add text content
    ssml += text;
    
    // Close prosody
    if (prosodyAttrs.length > 0) {
      ssml += '</prosody>';
    }
    
    // Close voice
    ssml += '</voice>';
    ssml += '</speak>';
    
    return ssml;
  }

  private estimateAudioDuration(text: string, speakingRate: number): number {
    // Rough estimation: average speaking rate is ~150 words per minute
    const words = text.split(/\s+/).length;
    const baseMinutes = words / 150;
    const adjustedMinutes = baseMinutes / speakingRate;
    return Math.max(0.1, adjustedMinutes * 60); // Return duration in seconds, minimum 0.1s
  }

  /**
   * Check if service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      switch (this.config.provider) {
        case 'google':
          return !!this.googleClient;
        case 'aws':
          return !!this.pollyClient;
        case 'openai':
          return !!this.openaiClient;
        default:
          return false;
      }
    } catch (error) {
      logger.error('TTS availability check failed:', error);
      return false;
    }
  }
}
