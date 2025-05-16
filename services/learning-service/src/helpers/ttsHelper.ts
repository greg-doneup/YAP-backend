import { generateSpeech, listVoices, TTSResponse as ClientTTSResponse, Voice } from '../clients/tts';
import { storeTTSAudio, getTTSAudio } from '../clients/mongodb';
import { VocabItem } from '../types';
import { TTSResponse } from '../types/pronunciation';

// Language-to-voice mapping for optimal quality
const DEFAULT_VOICES: Record<string, string> = {
  'en-US': 'en-US-neural-F',
  'es-ES': 'es-ES-neural-F',
  'fr-FR': 'fr-FR-neural-F',
  'de-DE': 'de-DE-neural-F',
  'it-IT': 'it-IT-neural-F',
  'ja-JP': 'ja-JP-neural-F',
  'zh-CN': 'zh-CN-neural-F',
  'ko-KR': 'ko-KR-neural-F',
  'pt-BR': 'pt-BR-neural-F',
  'ru-RU': 'ru-RU-neural-F',
};

/**
 * Generate and cache TTS audio for a vocabulary item
 * @param vocabItem The vocabulary item to generate audio for
 * @param languageCode ISO language code (e.g., en-US, es-ES)
 * @returns URL or ID for accessing the generated audio
 */
export async function generateVocabAudio(vocabItem: VocabItem, languageCode: string = 'en-US'): Promise<string> {
  try {
    // Check if we already have this in cache
    const cachedAudio = await getTTSAudio(vocabItem.id, languageCode);
    if (cachedAudio) {
      console.log(`Using cached TTS audio for ${vocabItem.term} in ${languageCode}`);
      return vocabItem.id; // Return the ID as a reference
    }
    
    // Get the recommended voice for this language
    const voice = DEFAULT_VOICES[languageCode] || DEFAULT_VOICES['en-US'];
    
    // Generate the speech
    const ttsResponse = await generateSpeech(
      vocabItem.term,
      languageCode,
      voice,
      'mp3',
      1.0, // Normal speaking rate
      0.0  // No pitch adjustment
    );
    
    // Store in cache
    // Convert client response to expected format
    const audioId = await storeTTSAudio(vocabItem.id, languageCode, ttsResponse.audio_data);
    
    return audioId;
  } catch (error) {
    console.error(`Failed to generate TTS for ${vocabItem.term}:`, error);
    throw new Error(`TTS generation failed: ${error}`);
  }
}

/**
 * Generate pronunciation example for a word or phrase
 * @param text Text to pronounce
 * @param languageCode ISO language code
 * @returns Audio buffer of the pronunciation
 */
export async function generatePronunciationExample(
  text: string, 
  languageCode: string = 'en-US'
): Promise<Buffer> {
  try {
    // Get the recommended voice for this language
    const voice = DEFAULT_VOICES[languageCode] || DEFAULT_VOICES['en-US'];
    
    // Generate the speech at a slightly slower rate for clarity
    const ttsResponse = await generateSpeech(
      text,
      languageCode,
      voice,
      'mp3',
      0.85, // Slightly slower for pronunciation clarity
      0.0   // No pitch adjustment
    );
    
    return ttsResponse.audio_data;
  } catch (error) {
    console.error(`Failed to generate pronunciation example for "${text}":`, error);
    throw new Error(`Pronunciation example generation failed: ${error}`);
  }
}

/**
 * Get available voices for a specific language
 * @param languageCode ISO language code
 * @returns Array of Voice objects
 */
export async function getAvailableVoices(languageCode: string = 'en-US'): Promise<Voice[]> {
  try {
    const response = await listVoices(languageCode);
    return response.voices;
  } catch (error) {
    console.error(`Failed to list voices for ${languageCode}:`, error);
    throw new Error(`Voice listing failed: ${error}`);
  }
}
