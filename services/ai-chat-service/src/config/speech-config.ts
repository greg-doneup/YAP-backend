/**
 * Production Speech Services Configuration
 * Supports Google Cloud, AWS, Azure, and OpenAI Whisper
 */

export interface SpeechServiceConfig {
  provider: 'google' | 'aws' | 'azure' | 'openai';
  credentials: {
    [key: string]: any;
  };
  languageMapping: {
    [key: string]: string; // Maps our language codes to provider codes
  };
}

export interface SpeechToTextConfig extends SpeechServiceConfig {
  sampleRateHertz: number;
  audioChannelCount: number;
  enableAutomaticPunctuation: boolean;
  enableWordTimeOffsets: boolean;
  enableProfanityFilter: boolean;
  model?: string;
}

export interface TextToSpeechConfig extends SpeechServiceConfig {
  voiceMapping: {
    [key: string]: {
      languageCode: string;
      name: string;
      ssmlGender: 'MALE' | 'FEMALE' | 'NEUTRAL';
    };
  };
  audioEncoding: 'MP3' | 'WAV' | 'OGG_OPUS';
  speakingRate: number;
  pitch: number;
  volumeGainDb: number;
}

export const defaultSpeechConfig: {
  speechToText: SpeechToTextConfig;
  textToSpeech: TextToSpeechConfig;
} = {
  speechToText: {
    provider: 'google', // Can be switched based on environment
    credentials: {},
    languageMapping: {
      'spanish': 'es-ES',
      'french': 'fr-FR',
      'english': 'en-US'
    },
    sampleRateHertz: 16000,
    audioChannelCount: 1,
    enableAutomaticPunctuation: true,
    enableWordTimeOffsets: true,
    enableProfanityFilter: false,
    model: 'latest_long' // Google Cloud model
  },
  textToSpeech: {
    provider: 'google',
    credentials: {},
    languageMapping: {
      'spanish': 'es-ES',
      'french': 'fr-FR', 
      'english': 'en-US'
    },
    voiceMapping: {
      'spanish': {
        languageCode: 'es-ES',
        name: 'es-ES-Neural2-A',
        ssmlGender: 'FEMALE'
      },
      'french': {
        languageCode: 'fr-FR',
        name: 'fr-FR-Neural2-A',
        ssmlGender: 'FEMALE'
      },
      'english': {
        languageCode: 'en-US',
        name: 'en-US-Neural2-F',
        ssmlGender: 'FEMALE'
      }
    },
    audioEncoding: 'MP3',
    speakingRate: 1.0,
    pitch: 0.0,
    volumeGainDb: 0.0
  }
};

/**
 * Environment-based configuration loading
 */
export function loadSpeechConfig(): {
  speechToText: SpeechToTextConfig;
  textToSpeech: TextToSpeechConfig;
} {
  const provider = (process.env.SPEECH_PROVIDER || 'google') as 'google' | 'aws' | 'azure' | 'openai';
  
  const config = {
    speechToText: { ...defaultSpeechConfig.speechToText },
    textToSpeech: { ...defaultSpeechConfig.textToSpeech }
  };

  // Override provider
  config.speechToText.provider = provider;
  config.textToSpeech.provider = provider;

  // Load provider-specific credentials
  switch (provider) {
    case 'google':
      config.speechToText.credentials = {
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
        // Or use service account key JSON
        clientEmail: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
        privateKey: process.env.GOOGLE_CLOUD_PRIVATE_KEY?.replace(/\\n/g, '\n')
      };
      config.textToSpeech.credentials = config.speechToText.credentials;
      break;

    case 'aws':
      config.speechToText.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'us-east-1'
      };
      config.textToSpeech.credentials = config.speechToText.credentials;
      break;

    case 'azure':
      config.speechToText.credentials = {
        subscriptionKey: process.env.AZURE_SPEECH_KEY,
        region: process.env.AZURE_SPEECH_REGION || 'eastus'
      };
      config.textToSpeech.credentials = config.speechToText.credentials;
      break;

    case 'openai':
      config.speechToText.credentials = {
        apiKey: process.env.OPENAI_API_KEY
      };
      config.textToSpeech.credentials = config.speechToText.credentials;
      break;
  }

  return config;
}
