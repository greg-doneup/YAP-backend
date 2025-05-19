"""
TTS provider adapter module.

This module provides adapters for different TTS providers,
allowing for easy switching between Mozilla TTS, AWS Polly, Azure, and Google Cloud.
"""

import os
import logging
import tempfile
import uuid
import time
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, BinaryIO, List

from app.config import Config
from app.benchmarking import get_benchmarker
from app.alignment_client import AlignmentServiceClient
from app.language_detection import get_language_detector

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TTSProvider(ABC):
    """
    Abstract base class for TTS providers.
    """
    
    def __init__(self):
        """
        Initialize common resources for all TTS providers.
        """
        self.benchmarker = get_benchmarker()
        self.alignment_client = None
        self.language_detector = get_language_detector()
        
        # Initialize alignment client if enabled
        if Config.USE_ALIGNMENT_SERVICE:
            self.alignment_client = AlignmentServiceClient()
    
    @abstractmethod
    def synthesize_speech(self, 
                         text: str, 
                         language_code: str, 
                         voice_id: Optional[str] = None,
                         audio_format: str = "mp3",
                         speaking_rate: float = 1.0,
                         pitch: float = 0.0,
                         ssml: Optional[str] = None) -> Dict[str, Any]:
        """
        Synthesize speech from text.
        
        Args:
            text: Text to synthesize
            language_code: Language code (e.g., "en-US")
            voice_id: Optional voice ID
            audio_format: Output audio format
            speaking_rate: Speaking rate (0.5 to 2.0, default 1.0)
            pitch: Voice pitch (-10.0 to 10.0, default 0.0)
            ssml: Optional SSML markup
            
        Returns:
            Dict[str, Any]: Dictionary containing audio data and metadata
        """
        pass
    
    @abstractmethod
    def synthesize_phoneme(self,
                          phoneme: str,
                          word: str,
                          language_code: str,
                          voice_id: Optional[str] = None,
                          audio_format: str = "mp3") -> Dict[str, Any]:
        """
        Synthesize a specific phoneme.
        
        Args:
            phoneme: Phoneme to synthesize
            word: Word context for the phoneme
            language_code: Language code
            voice_id: Optional voice ID
            audio_format: Output audio format
            
        Returns:
            Dict[str, Any]: Dictionary containing audio data and metadata
        """
        pass
    
    @abstractmethod
    def list_voices(self, 
                   language_code: Optional[str] = None,
                   gender: Optional[str] = None,
                   neural_only: bool = False) -> List[Dict[str, Any]]:
        """
        List available voices.
        
        Args:
            language_code: Optional filter by language code
            gender: Optional filter by gender ("MALE" or "FEMALE")
            neural_only: Whether to return only neural voices
            
        Returns:
            List[Dict[str, Any]]: List of available voices
        """
        pass
    
    def _normalize_language_code(self, language_code: str) -> str:
        """
        Normalize language code to provider-specific format.
        
        Args:
            language_code: Source language code
            
        Returns:
            str: Normalized language code
        """
        # Split language and region code if present
        if '-' in language_code:
            lang_code = language_code.split('-')[0]
        else:
            lang_code = language_code
            
        return lang_code.lower()
    
    def detect_and_normalize_language(self, text: str, requested_language: Optional[str] = None) -> str:
        """
        Detect language if not specified or confirm provided language is supported.
        
        Args:
            text: Text to analyze
            requested_language: Optional language code requested by the user
            
        Returns:
            str: Supported language code to use
        """
        # If language is specified, use it or find a fallback
        if requested_language:
            # Check if the requested language is directly supported
            if requested_language in Config.SUPPORTED_LANGUAGES:
                return requested_language
                
            # Try fallback mapping
            if requested_language in Config.LANGUAGE_FALLBACKS:
                fallback = Config.LANGUAGE_FALLBACKS[requested_language]
                logger.info(f"Using fallback language {fallback} for requested {requested_language}")
                return fallback
                
            # If base language code is supported, use it
            if "-" in requested_language:
                base_lang = requested_language.split("-")[0]
                if base_lang in Config.SUPPORTED_LANGUAGES:
                    logger.info(f"Using base language {base_lang} for requested {requested_language}")
                    return base_lang
                    
            logger.warning(f"Requested language {requested_language} not supported, detecting language from text")
        
        # Detect language from text
        return self.language_detector.get_supported_language(text)
    
    def get_alignment_data(self, text: str, language_code: str) -> Optional[Dict[str, Any]]:
        """
        Get alignment data for text if alignment service is enabled.
        
        Args:
            text: Text to align
            language_code: Language code
            
        Returns:
            Optional[Dict[str, Any]]: Alignment data or None if unavailable
        """
        if not self.alignment_client or not Config.USE_ALIGNMENT_SERVICE:
            return None
            
        try:
            return self.alignment_client.align_text(text, language_code)
        except Exception as e:
            logger.warning(f"Failed to get alignment data: {str(e)}")
            return None
            
    def get_phoneme_alignment(self, phoneme: str, word: str, language_code: str) -> Optional[Dict[str, Any]]:
        """
        Get alignment for a specific phoneme in a word.
        
        Args:
            phoneme: Phoneme to align
            word: Word containing the phoneme
            language_code: Language code
            
        Returns:
            Optional[Dict[str, Any]]: Phoneme alignment data or None if unavailable
        """
        if not self.alignment_client or not Config.USE_ALIGNMENT_SERVICE:
            return None
            
        try:
            return self.alignment_client.align_phoneme_in_word(phoneme, word, language_code)
        except Exception as e:
            logger.warning(f"Failed to get phoneme alignment: {str(e)}")
            return None

class MozillaTTSProvider(TTSProvider):
    """
    TTS provider implementation using Mozilla TTS.
    """
    
    def __init__(self):
        """
        Initialize Mozilla TTS provider.
        """
        super().__init__()
        logger.info("Initializing Mozilla TTS provider")
        
        # Will be loaded on-demand to save memory
        self.tts_model = None
        self.model_loaded = False
        self.current_model_lang = None
        
    def _load_model(self, language_code: str):
        """
        Load the TTS model for the specified language.
        
        Args:
            language_code: Language code
        """
        if self.model_loaded and self.current_model_lang == language_code:
            # Model for this language already loaded
            return
        
        try:
            # Lazy import to avoid loading TTS dependencies until needed
            # Use Coqui TTS instead of mozilla-tts
            try:
                from TTS.utils.synthesizer import Synthesizer
            except ImportError:
                # Fall back to newer Coqui TTS API if available
                from TTS.api import TTS

            # Normalize language code
            lang_code = self._normalize_language_code(language_code)
            
            # Get the model path for this language
            model_path = os.path.join(
                Config.MOZILLA_TTS_MODEL_PATH, 
                Config.DEFAULT_VOICES_BY_LANGUAGE.get(lang_code, 'en')
            )
            
            logger.info(f"Loading Coqui TTS model from {model_path}")
            
            # Try to initialize the synthesizer with Coqui TTS
            try:
                # First try with newer Coqui TTS API
                if 'TTS' in locals():
                    self.tts_model = TTS(model_name="tts_models/en/ljspeech/tacotron2-DDC")
                else:
                    # Fall back to older API
                    self.tts_model = Synthesizer(
                        tts_checkpoint=f"{model_path}/model.pth",
                        tts_config_path=f"{model_path}/config.json",
                        vocoder_checkpoint=f"{model_path}/vocoder_model.pth",
                        vocoder_config=f"{model_path}/vocoder_config.json"
                    )
            except Exception as e:
                logger.warning(f"Could not initialize local TTS model: {str(e)}")
                logger.warning("Will use pretrained model from Coqui TTS")
                from TTS.api import TTS
                self.tts_model = TTS(model_name="tts_models/en/ljspeech/tacotron2-DDC")
            
            self.model_loaded = True
            self.current_model_lang = lang_code
            logger.info(f"TTS model for {lang_code} loaded successfully")
            
        except Exception as e:
            logger.error(f"Error loading TTS model: {str(e)}")
            self.model_loaded = False
            self.current_model_lang = None
            raise
    
    def synthesize_speech(self, 
                         text: str, 
                         language_code: str, 
                         voice_id: Optional[str] = None,
                         audio_format: str = "mp3",
                         speaking_rate: float = 1.0,
                         pitch: float = 0.0,
                         ssml: Optional[str] = None) -> Dict[str, Any]:
        """
        Synthesize speech using Mozilla TTS.
        
        Args:
            text: Text to synthesize
            language_code: Language code
            voice_id: Optional voice ID
            audio_format: Output audio format
            speaking_rate: Speaking rate (mostly ignored for Mozilla TTS)
            pitch: Voice pitch (mostly ignored for Mozilla TTS)
            ssml: Optional SSML markup (stripped for Mozilla TTS)
            
        Returns:
            Dict[str, Any]: Dictionary containing audio data and metadata
        """
        # Start benchmarking
        self.benchmarker.start_benchmark(
            provider="mozilla", 
            operation="synthesize_speech", 
            language=language_code,
            voice_id=voice_id
        )
        
        try:
            # Apply language detection and fallback if necessary
            language_code = self.detect_and_normalize_language(text, language_code)
            
            # If SSML is provided, extract plain text
            if ssml:
                from lxml import etree
                root = etree.fromstring(ssml)
                text = etree.tostring(root, encoding='unicode', method='text').strip()
            
            # Get alignment data if available
            alignment_data = None
            if Config.USE_ALIGNMENT_SERVICE and self.alignment_client:
                alignment_data = self.get_alignment_data(text, language_code)
            
            # Load the model if needed
            self._load_model(language_code)
            
            # Generate the audio
            wav = self.tts_model.tts(text)
            
            # Convert to the requested format
            import io
            import soundfile as sf
            from pydub import AudioSegment
            
            # Save the audio to a temporary file
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_wav:
                sf.write(temp_wav.name, wav, 22050)
                
                # Convert to the requested format
                audio = AudioSegment.from_file(temp_wav.name, format="wav")
                
                # Adjust speed if needed
                if speaking_rate != 1.0:
                    audio = audio._spawn(audio.raw_data, overrides={
                        "frame_rate": int(audio.frame_rate * speaking_rate)
                    })
                
                # Export to the requested format
                output_file = io.BytesIO()
                audio.export(output_file, format=audio_format)
                audio_data = output_file.getvalue()
                
                # Clean up the temporary file
                os.remove(temp_wav.name)
            
            # Calculate duration in seconds
            duration = len(audio) / 1000.0
            
            result = {
                "audio_data": audio_data,
                "audio_format": audio_format,
                "duration": duration,
                "cache_key": str(uuid.uuid4())
            }
            
            # Add alignment data if available
            if alignment_data:
                result["alignment_data"] = alignment_data
                
            # End benchmarking
            self.benchmarker.end_benchmark(
                success=True, 
                audio_duration=duration,
                audio_size_bytes=len(audio_data)
            )
            
            return result
            
        except Exception as e:
            # End benchmarking with failure
            self.benchmarker.end_benchmark(success=False)
            logger.error(f"Error synthesizing speech with Mozilla TTS: {str(e)}")
            raise
    
    def synthesize_phoneme(self,
                          phoneme: str,
                          word: str,
                          language_code: str,
                          voice_id: Optional[str] = None,
                          audio_format: str = "mp3") -> Dict[str, Any]:
        """
        Synthesize a specific phoneme.
        
        For Mozilla TTS, we use SSML-like formatting to emphasize the phoneme.
        
        Args:
            phoneme: Phoneme to synthesize
            word: Word context for the phoneme
            language_code: Language code
            voice_id: Optional voice ID
            audio_format: Output audio format
            
        Returns:
            Dict[str, Any]: Dictionary containing audio data and metadata
        """
        # Start benchmarking
        self.benchmarker.start_benchmark(
            provider="mozilla", 
            operation="synthesize_phoneme", 
            language=language_code,
            voice_id=voice_id
        )
        
        try:
            # Apply language detection and fallback if necessary
            language_code = self.detect_and_normalize_language(word, language_code)
            
            # Get phoneme alignment if available
            alignment_data = None
            if Config.USE_ALIGNMENT_SERVICE and self.alignment_client:
                alignment_data = self.get_phoneme_alignment(phoneme, word, language_code)
            
            # For Mozilla TTS, we'll just synthesize the word and emphasize it
            # This is not ideal, but Mozilla TTS doesn't have direct phoneme synthesis
            
            # Prepare text with more context if we have alignment data
            if alignment_data and 'phoneme_position' in alignment_data:
                # Use the alignment data to create more targeted prompts
                text = f"The sound [{phoneme}] appears in the word '{word}'."
            else:
                # Fallback to simple prompt
                text = f"The sound is in the word: {word}."
            
            result = self.synthesize_speech(
                text=text,
                language_code=language_code,
                voice_id=voice_id,
                audio_format=audio_format,
                speaking_rate=0.8  # Slower to emphasize the pronunciation
            )
            
            # Add phoneme-specific information
            result["phoneme"] = phoneme
            result["word"] = word
            
            # Add alignment data if available
            if alignment_data:
                result["phoneme_alignment"] = alignment_data
                
            # End benchmarking is handled by synthesize_speech
            
            return result
            
        except Exception as e:
            # End benchmarking with failure
            self.benchmarker.end_benchmark(success=False)
            logger.error(f"Error synthesizing phoneme with Mozilla TTS: {str(e)}")
            raise
    
    def list_voices(self, 
                   language_code: Optional[str] = None,
                   gender: Optional[str] = None,
                   neural_only: bool = False) -> List[Dict[str, Any]]:
        """
        List available voices for Mozilla TTS.
        
        Args:
            language_code: Optional filter by language code
            gender: Optional filter by gender (ignored for Mozilla TTS)
            neural_only: Whether to return only neural voices (all Mozilla voices are neural)
            
        Returns:
            List[Dict[str, Any]]: List of available voices
        """
        # The voices for Mozilla TTS are based on the available models
        voices = []
        
        # Define a basic set of voices based on the configuration
        for lang_code, model_path in Config.DEFAULT_VOICES_BY_LANGUAGE.items():
            # Skip if filtering by language code and doesn't match
            if language_code and self._normalize_language_code(language_code) != lang_code:
                continue
                
            # Extract the model name from the path
            model_name = model_path.split('/')[-1]
            
            # Add gender information (this is approximate for Mozilla TTS)
            # In a real implementation, this would be based on the model metadata
            voice_gender = "FEMALE" if "female" in model_path.lower() else "MALE"
            
            # Skip if filtering by gender and doesn't match
            if gender and voice_gender != gender:
                continue
                
            voices.append({
                "voice_id": f"mozilla_{lang_code}_{model_name}",
                "name": f"{Config.SUPPORTED_LANGUAGES.get(lang_code, lang_code)} ({model_name})",
                "language_code": lang_code,
                "gender": voice_gender,
                "neural": True,
                "provider": "mozilla",
                "accent": "neutral"  # Default accent
            })
        
        return voices


class AWSPollyProvider(TTSProvider):
    """
    TTS provider implementation using AWS Polly.
    """
    
    def __init__(self):
        """
        Initialize AWS Polly provider.
        """
        logger.info("Initializing AWS Polly provider")
        self.polly_client = None
        
    def _get_client(self):
        """
        Get or create an AWS Polly client.
        
        Returns:
            boto3.client: AWS Polly client
        """
        if self.polly_client is None:
            import boto3
            self.polly_client = boto3.client('polly', region_name=Config.AWS_REGION)
        return self.polly_client
    
    def _get_engine_for_voice(self, voice_id: Optional[str], neural_preferred: bool = True) -> str:
        """
        Get the appropriate engine for the voice.
        
        Args:
            voice_id: The voice ID
            neural_preferred: Whether to prefer neural voices
            
        Returns:
            str: "neural", "standard", or "long-form"
        """
        if neural_preferred:
            return "neural"
        else:
            return "standard"
    
    def synthesize_speech(self, 
                         text: str, 
                         language_code: str, 
                         voice_id: Optional[str] = None,
                         audio_format: str = "mp3",
                         speaking_rate: float = 1.0,
                         pitch: float = 0.0,
                         ssml: Optional[str] = None) -> Dict[str, Any]:
        """
        Synthesize speech using AWS Polly.
        
        Args:
            text: Text to synthesize
            language_code: Language code
            voice_id: Optional voice ID
            audio_format: Output audio format
            speaking_rate: Speaking rate (0.5 to 2.0, default 1.0)
            pitch: Voice pitch (-10.0 to 10.0, default 0.0)
            ssml: Optional SSML markup
            
        Returns:
            Dict[str, Any]: Dictionary containing audio data and metadata
        """
        try:
            client = self._get_client()
            
            # Normalize language code
            language = self._normalize_language_code(language_code)
            
            # Determine voice_id if not provided
            if not voice_id:
                # Map language code to default AWS voice
                language_to_voice = {
                    'en': 'Joanna',
                    'es': 'Lupe',
                    'fr': 'Lea',
                    'de': 'Marlene',
                    'zh': 'Zhiyu',
                    'ja': 'Takumi',
                    'ko': 'Seoyeon',
                    'ar': 'Zeina',
                    'ru': 'Tatyana',
                    'pt': 'Camila',
                    'hi': 'Aditi'
                }
                voice_id = language_to_voice.get(language, 'Joanna')
            
            # Map audio format to AWS format
            format_mapping = {
                'mp3': 'mp3',
                'wav': 'pcm',
                'ogg': 'ogg_vorbis'
            }
            aws_format = format_mapping.get(audio_format.lower(), 'mp3')
            
            # Determine if using SSML
            text_type = 'ssml' if ssml else 'text'
            text_content = ssml if ssml else text
            
            # If using plain text and we want rate or pitch adjustments,
            # convert to SSML to apply these modifications
            if text_type == 'text' and (speaking_rate != 1.0 or pitch != 0.0):
                text_type = 'ssml'
                prosody_attrs = []
                
                if speaking_rate != 1.0:
                    prosody_attrs.append(f'rate="{int(speaking_rate * 100)}%"')
                    
                if pitch != 0.0:
                    # Convert pitch from -10..10 scale to x-low, low, medium, high, x-high
                    if pitch <= -5:
                        prosody_attrs.append('pitch="x-low"')
                    elif pitch <= -2:
                        prosody_attrs.append('pitch="low"')
                    elif pitch <= 2:
                        prosody_attrs.append('pitch="medium"')
                    elif pitch <= 5:
                        prosody_attrs.append('pitch="high"')
                    else:
                        prosody_attrs.append('pitch="x-high"')
                
                prosody_tag = f"<prosody {' '.join(prosody_attrs)}>"
                text_content = f"<speak>{prosody_tag}{text}</prosody></speak>"
            
            # Determine engine type
            engine = self._get_engine_for_voice(voice_id, neural_preferred=True)
            
            # Make the API call
            response = client.synthesize_speech(
                Engine=engine,
                LanguageCode=language_code,
                OutputFormat=aws_format,
                Text=text_content,
                TextType=text_type,
                VoiceId=voice_id
            )
            
            # Get the audio data
            audio_stream = response['AudioStream']
            audio_data = audio_stream.read()
            
            # Get the metadata
            content_type = response['ContentType']
            
            # Calculate approximate duration (this is a rough estimate)
            # A more accurate method would be to parse the audio file
            # For now, we estimate based on character count and speaking rate
            estimated_words = len(text.split())
            estimated_duration = (estimated_words / 3) / speaking_rate  # Assume 3 words per second
            
            return {
                "audio_data": audio_data,
                "audio_format": audio_format,
                "duration": estimated_duration,
                "cache_key": str(uuid.uuid4())
            }
            
        except Exception as e:
            logger.error(f"Error synthesizing speech with AWS Polly: {str(e)}")
            raise
    
    def synthesize_phoneme(self,
                          phoneme: str,
                          word: str,
                          language_code: str,
                          voice_id: Optional[str] = None,
                          audio_format: str = "mp3") -> Dict[str, Any]:
        """
        Synthesize a specific phoneme using AWS Polly.
        
        Uses SSML phoneme tag for precise phonetic control.
        
        Args:
            phoneme: Phoneme to synthesize
            word: Word context for the phoneme
            language_code: Language code
            voice_id: Optional voice ID
            audio_format: Output audio format
            
        Returns:
            Dict[str, Any]: Dictionary containing audio data and metadata
        """
        # Create SSML with phoneme tag
        ssml = f'<speak>The phoneme <phoneme alphabet="ipa" ph="{phoneme}"></phoneme> as in the word "{word}"</speak>'
        
        return self.synthesize_speech(
            text="",  # Ignored when SSML is provided
            language_code=language_code,
            voice_id=voice_id,
            audio_format=audio_format,
            speaking_rate=0.8,  # Slower to emphasize pronunciation
            ssml=ssml
        )
    
    def list_voices(self, 
                   language_code: Optional[str] = None,
                   gender: Optional[str] = None,
                   neural_only: bool = False) -> List[Dict[str, Any]]:
        """
        List available voices for AWS Polly.
        
        Args:
            language_code: Optional filter by language code
            gender: Optional filter by gender
            neural_only: Whether to return only neural voices
            
        Returns:
            List[Dict[str, Any]]: List of available voices
        """
        try:
            client = self._get_client()
            response = client.describe_voices()
            voices = []
            
            for voice in response['Voices']:
                # Check if it's a neural voice
                supports_neural = 'neural' in voice.get('SupportedEngines', [])
                
                # Skip if neural only and not a neural voice
                if neural_only and not supports_neural:
                    continue
                    
                # Filter by language code if provided
                if language_code and voice['LanguageCode'] != language_code:
                    # Check if the base language code matches
                    base_lang = language_code.split('-')[0]
                    if not voice['LanguageCode'].startswith(f"{base_lang}-"):
                        continue
                
                # Filter by gender if provided
                if gender and voice['Gender'] != gender:
                    continue
                
                voices.append({
                    "voice_id": voice['Id'],
                    "name": voice['Name'],
                    "language_code": voice['LanguageCode'],
                    "gender": voice['Gender'].upper(),
                    "neural": supports_neural,
                    "provider": "aws",
                    "accent": voice.get('LanguageName', '').split()[0].lower()
                })
            
            return voices
            
        except Exception as e:
            logger.error(f"Error listing AWS Polly voices: {str(e)}")
            return []


class AzureTTSProvider(TTSProvider):
    """
    TTS provider implementation using Azure Cognitive Services.
    """
    
    def __init__(self):
        """
        Initialize Azure TTS provider.
        """
        logger.info("Initializing Azure TTS provider")
        self.speech_config = None
        
    def _get_speech_config(self):
        """
        Get or create an Azure Speech config.
        
        Returns:
            speechsdk.SpeechConfig: Azure Speech config
        """
        if self.speech_config is None:
            try:
                import azure.cognitiveservices.speech as speechsdk
                self.speech_config = speechsdk.SpeechConfig(
                    subscription=Config.AZURE_SPEECH_KEY, 
                    region=Config.AZURE_SERVICE_REGION
                )
            except ImportError:
                logger.error("Azure Speech SDK not available")
                raise RuntimeError("Azure Speech SDK not available")
                
        return self.speech_config
    
    def _get_voice_for_language(self, language_code: str, gender: str = "Female") -> str:
        """
        Get the appropriate voice for the language.
        
        Args:
            language_code: Language code
            gender: Voice gender preference
            
        Returns:
            str: Azure voice name
        """
        # Map language code to default Azure voice
        # Format: "language-REGION-Name"
        language_to_voice = {
            'en': f"en-US-{gender}Neural",
            'es': f"es-ES-{gender}Neural",
            'fr': f"fr-FR-{gender}Neural",
            'de': f"de-DE-{gender}Neural",
            'zh': f"zh-CN-{gender}Neural",
            'ja': f"ja-JP-{gender}Neural",
            'ko': f"ko-KR-{gender}Neural",
            'ar': f"ar-SA-{gender}Neural",
            'ru': f"ru-RU-{gender}Neural",
            'pt': f"pt-BR-{gender}Neural",
            'hi': f"hi-IN-{gender}Neural"
        }
        
        base_lang = self._normalize_language_code(language_code)
        return language_to_voice.get(base_lang, f"en-US-{gender}Neural")
    
    def synthesize_speech(self, 
                         text: str, 
                         language_code: str, 
                         voice_id: Optional[str] = None,
                         audio_format: str = "mp3",
                         speaking_rate: float = 1.0,
                         pitch: float = 0.0,
                         ssml: Optional[str] = None) -> Dict[str, Any]:
        """
        Synthesize speech using Azure TTS.
        
        Args:
            text: Text to synthesize
            language_code: Language code
            voice_id: Optional voice ID
            audio_format: Output audio format
            speaking_rate: Speaking rate (0.5 to 2.0, default 1.0)
            pitch: Voice pitch (-10.0 to 10.0, default 0.0)
            ssml: Optional SSML markup
            
        Returns:
            Dict[str, Any]: Dictionary containing audio data and metadata
        """
        try:
            import azure.cognitiveservices.speech as speechsdk
            
            # Get the speech config
            speech_config = self._get_speech_config()
            
            # Determine voice if not provided
            if not voice_id:
                voice_id = self._get_voice_for_language(language_code)
            
            # Set the voice
            speech_config.speech_synthesis_voice_name = voice_id
            
            # Map audio format to Azure format
            format_mapping = {
                'mp3': speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3,
                'wav': speechsdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm,
                'ogg': speechsdk.SpeechSynthesisOutputFormat.Ogg16Khz16BitMonoOpus
            }
            azure_format = format_mapping.get(
                audio_format.lower(), 
                speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
            )
            speech_config.set_speech_synthesis_output_format(azure_format)
            
            # Create a synthesizer
            synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config)
            
            # Prepare the input (either text or SSML)
            if ssml:
                result = synthesizer.speak_ssml_async(ssml).get()
            else:
                # If no SSML but we have rate or pitch adjustments, create SSML
                if speaking_rate != 1.0 or pitch != 0.0:
                    # Create SSML with prosody elements
                    rate_value = f"{int(speaking_rate * 100)}%"
                    pitch_value = f"{int(pitch * 10)}st"  # Convert to semitones
                    
                    ssml = (
                        f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{language_code}">'
                        f'<voice name="{voice_id}">'
                        f'<prosody rate="{rate_value}" pitch="{pitch_value}">{text}</prosody>'
                        f'</voice></speak>'
                    )
                    result = synthesizer.speak_ssml_async(ssml).get()
                else:
                    result = synthesizer.speak_text_async(text).get()
            
            # Check the result
            if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
                # Get the audio data
                audio_data = result.audio_data
                
                # Calculate the duration if available
                duration = result.audio_duration.total_seconds() if hasattr(result, 'audio_duration') else 0
                
                return {
                    "audio_data": audio_data,
                    "audio_format": audio_format,
                    "duration": duration,
                    "cache_key": str(uuid.uuid4())
                }
            else:
                error_details = result.cancellation_details.error_details if hasattr(result, 'cancellation_details') else "Unknown error"
                logger.error(f"Azure TTS synthesis failed: {error_details}")
                raise RuntimeError(f"Azure TTS synthesis failed: {error_details}")
                
        except Exception as e:
            logger.error(f"Error synthesizing speech with Azure TTS: {str(e)}")
            raise
    
    def synthesize_phoneme(self,
                          phoneme: str,
                          word: str,
                          language_code: str,
                          voice_id: Optional[str] = None,
                          audio_format: str = "mp3") -> Dict[str, Any]:
        """
        Synthesize a specific phoneme using Azure TTS.
        
        Uses SSML phoneme tag for precise phonetic control.
        
        Args:
            phoneme: Phoneme to synthesize
            word: Word context for the phoneme
            language_code: Language code
            voice_id: Optional voice ID
            audio_format: Output audio format
            
        Returns:
            Dict[str, Any]: Dictionary containing audio data and metadata
        """
        # Determine voice if not provided
        if not voice_id:
            voice_id = self._get_voice_for_language(language_code)
            
        # Create SSML with phoneme tag
        ssml = (
            f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{language_code}">'
            f'<voice name="{voice_id}">'
            f'The phoneme <phoneme alphabet="ipa" ph="{phoneme}"></phoneme> as in the word "{word}"'
            f'</voice></speak>'
        )
        
        return self.synthesize_speech(
            text="",  # Ignored when SSML is provided
            language_code=language_code,
            voice_id=voice_id,
            audio_format=audio_format,
            speaking_rate=0.8,  # Slower to emphasize pronunciation
            ssml=ssml
        )
    
    def list_voices(self, 
                   language_code: Optional[str] = None,
                   gender: Optional[str] = None,
                   neural_only: bool = False) -> List[Dict[str, Any]]:
        """
        List available voices for Azure TTS.
        
        Args:
            language_code: Optional filter by language code
            gender: Optional filter by gender
            neural_only: Whether to return only neural voices
            
        Returns:
            List[Dict[str, Any]]: List of available voices
        """
        try:
            import azure.cognitiveservices.speech as speechsdk
            
            # Get the speech config
            speech_config = self._get_speech_config()
            
            # Create a speech synthesizer
            synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config)
            
            # Get voice list
            result = synthesizer.get_voices_async().get()
            voices = []
            
            if result.reason == speechsdk.ResultReason.VoicesListRetrieved:
                voice_list = result.voices
                
                for voice in voice_list:
                    # Skip if neural only and not a neural voice
                    if neural_only and "Neural" not in voice.short_name:
                        continue
                    
                    # Filter by language code if provided
                    if language_code:
                        # Check if the base language code matches
                        base_lang = language_code.split('-')[0]
                        if not voice.locale.startswith(f"{base_lang}-"):
                            continue
                    
                    # Filter by gender if provided
                    voice_gender = "FEMALE" if "Female" in voice.short_name else "MALE"
                    if gender and voice_gender != gender:
                        continue
                    
                    voices.append({
                        "voice_id": voice.short_name,
                        "name": voice.display_name,
                        "language_code": voice.locale,
                        "gender": voice_gender,
                        "neural": "Neural" in voice.short_name,
                        "provider": "azure",
                        "accent": voice.locale.split('-')[1].lower()
                    })
                    
                return voices
            else:
                logger.error("Failed to retrieve voice list from Azure")
                return []
                
        except Exception as e:
            logger.error(f"Error listing Azure TTS voices: {str(e)}")
            return []


class GoogleTTSProvider(TTSProvider):
    """
    TTS provider implementation using Google Cloud Text-to-Speech.
    """
    
    def __init__(self):
        """
        Initialize Google TTS provider.
        """
        logger.info("Initializing Google TTS provider")
        self.client = None
        
    def _get_client(self):
        """
        Get or create a Google TTS client.
        
        Returns:
            texttospeech.TextToSpeechClient: Google TTS client
        """
        if self.client is None:
            try:
                from google.cloud import texttospeech
                self.client = texttospeech.TextToSpeechClient()
            except ImportError:
                logger.error("Google Cloud Text-to-Speech SDK not available")
                raise RuntimeError("Google Cloud Text-to-Speech SDK not available")
                
        return self.client
    
    def _get_voice_for_language(self, language_code: str, gender: str = "FEMALE") -> str:
        """
        Get the appropriate voice for the language.
        
        Args:
            language_code: Language code
            gender: Voice gender preference (MALE or FEMALE)
            
        Returns:
            str: Google voice name
        """
        from google.cloud import texttospeech
        
        # Normalize the gender enum
        gender_enum = texttospeech.SsmlVoiceGender.FEMALE
        if gender == "MALE":
            gender_enum = texttospeech.SsmlVoiceGender.MALE
        
        try:
            # Get all available voices
            client = self._get_client()
            response = client.list_voices()
            
            # Find a matching voice
            for voice in response.voices:
                if language_code in voice.language_codes:
                    if voice.ssml_gender == gender_enum:
                        return voice.name
            
            # If no match, use the first voice for the language
            for voice in response.voices:
                if language_code in voice.language_codes:
                    return voice.name
                    
            # Fall back to en-US if no match
            return "en-US-Wavenet-F" if gender == "FEMALE" else "en-US-Wavenet-A"
            
        except Exception as e:
            logger.error(f"Error getting voice for language: {str(e)}")
            return "en-US-Wavenet-F" if gender == "FEMALE" else "en-US-Wavenet-A"
    
    def synthesize_speech(self, 
                         text: str, 
                         language_code: str, 
                         voice_id: Optional[str] = None,
                         audio_format: str = "mp3",
                         speaking_rate: float = 1.0,
                         pitch: float = 0.0,
                         ssml: Optional[str] = None) -> Dict[str, Any]:
        """
        Synthesize speech using Google TTS.
        
        Args:
            text: Text to synthesize
            language_code: Language code
            voice_id: Optional voice ID
            audio_format: Output audio format
            speaking_rate: Speaking rate (0.5 to 2.0, default 1.0)
            pitch: Voice pitch (-10.0 to 10.0, default 0.0)
            ssml: Optional SSML markup
            
        Returns:
            Dict[str, Any]: Dictionary containing audio data and metadata
        """
        try:
            from google.cloud import texttospeech
            
            # Get the client
            client = self._get_client()
            
            # Prepare input
            if ssml:
                input_text = texttospeech.SynthesisInput(ssml=ssml)
            else:
                input_text = texttospeech.SynthesisInput(text=text)
            
            # Determine voice if not provided
            if not voice_id:
                gender = "FEMALE"  # Default gender
                voice_id = self._get_voice_for_language(language_code, gender)
            
            # Configure the voice
            voice = texttospeech.VoiceSelectionParams(
                name=voice_id,
                language_code=language_code
            )
            
            # Map audio format to Google format
            format_mapping = {
                'mp3': texttospeech.AudioEncoding.MP3,
                'wav': texttospeech.AudioEncoding.LINEAR16,
                'ogg': texttospeech.AudioEncoding.OGG_OPUS
            }
            google_format = format_mapping.get(
                audio_format.lower(), 
                texttospeech.AudioEncoding.MP3
            )
            
            # Configure audio output
            audio_config = texttospeech.AudioConfig(
                audio_encoding=google_format,
                speaking_rate=speaking_rate,
                pitch=pitch
            )
            
            # Perform text-to-speech request
            response = client.synthesize_speech(
                input=input_text,
                voice=voice,
                audio_config=audio_config
            )
            
            # Get the audio data
            audio_data = response.audio_content
            
            # Calculate approximate duration
            # (Google doesn't provide this directly, so we estimate)
            estimated_words = len(text.split())
            estimated_duration = (estimated_words / 3) / speaking_rate  # Assume 3 words per second
            
            return {
                "audio_data": audio_data,
                "audio_format": audio_format,
                "duration": estimated_duration,
                "cache_key": str(uuid.uuid4())
            }
            
        except Exception as e:
            logger.error(f"Error synthesizing speech with Google TTS: {str(e)}")
            raise
    
    def synthesize_phoneme(self,
                          phoneme: str,
                          word: str,
                          language_code: str,
                          voice_id: Optional[str] = None,
                          audio_format: str = "mp3") -> Dict[str, Any]:
        """
        Synthesize a specific phoneme using Google TTS.
        
        Uses SSML phoneme tag for precise phonetic control.
        
        Args:
            phoneme: Phoneme to synthesize
            word: Word context for the phoneme
            language_code: Language code
            voice_id: Optional voice ID
            audio_format: Output audio format
            
        Returns:
            Dict[str, Any]: Dictionary containing audio data and metadata
        """
        # Create SSML with phoneme tag
        ssml = f'<speak>The phoneme <phoneme alphabet="ipa" ph="{phoneme}"></phoneme> as in the word "{word}"</speak>'
        
        return self.synthesize_speech(
            text="",  # Ignored when SSML is provided
            language_code=language_code,
            voice_id=voice_id,
            audio_format=audio_format,
            speaking_rate=0.8,  # Slower to emphasize pronunciation
            ssml=ssml
        )
    
    def list_voices(self, 
                   language_code: Optional[str] = None,
                   gender: Optional[str] = None,
                   neural_only: bool = False) -> List[Dict[str, Any]]:
        """
        List available voices for Google TTS.
        
        Args:
            language_code: Optional filter by language code
            gender: Optional filter by gender
            neural_only: Whether to return only neural voices
            
        Returns:
            List[Dict[str, Any]]: List of available voices
        """
        try:
            from google.cloud import texttospeech
            
            # Get the client
            client = self._get_client()
            
            # Get all available voices
            response = client.list_voices()
            voices = []
            
            for voice in response.voices:
                # Check if it's a neural voice (Wavenet or Neural)
                is_neural = "Wavenet" in voice.name or "Neural" in voice.name
                
                # Skip if neural only and not a neural voice
                if neural_only and not is_neural:
                    continue
                    
                # Filter by language code if provided
                if language_code:
                    language_matches = False
                    for lang in voice.language_codes:
                        if lang == language_code:
                            language_matches = True
                            break
                        
                        # Check if the base language code matches
                        base_lang = language_code.split('-')[0]
                        if lang.startswith(f"{base_lang}-"):
                            language_matches = True
                            break
                            
                    if not language_matches:
                        continue
                
                # Filter by gender if provided
                google_gender = str(voice.ssml_gender).replace('SsmlVoiceGender.', '')
                if gender and google_gender != gender:
                    continue
                    
                # Get the primary language code
                primary_language = voice.language_codes[0] if voice.language_codes else "en-US"
                
                voices.append({
                    "voice_id": voice.name,
                    "name": voice.name,
                    "language_code": primary_language,
                    "gender": google_gender,
                    "neural": is_neural,
                    "provider": "google",
                    "accent": primary_language.split('-')[1].lower()
                })
                
            return voices
                
        except Exception as e:
            logger.error(f"Error listing Google TTS voices: {str(e)}")
            return []


class TTSProviderFactory:
    """
    Factory for creating TTS providers.
    """
    
    @staticmethod
    def get_provider(fallback: bool = False) -> TTSProvider:
        """
        Get the appropriate TTS provider based on configuration.
        
        Args:
            fallback: Whether to get the fallback provider instead of primary
            
        Returns:
            TTSProvider: A TTS provider instance
        """
        # For fallback, always use AWS Polly if configured
        if fallback and Config.USE_FALLBACK_PROVIDER and Config.FALLBACK_TTS_PROVIDER == "aws" and Config.USE_AWS_POLLY:
            logger.info("Using AWS Polly as fallback TTS provider")
            return AWSPollyProvider()
            
        # Primary provider selection
        provider_type = Config.TTS_PROVIDER.lower()
        
        if provider_type == "aws" and Config.USE_AWS_POLLY:
            return AWSPollyProvider()
        elif provider_type == "azure" and Config.USE_AZURE_TTS:
            return AzureTTSProvider()
        elif provider_type == "google" and Config.USE_GOOGLE_TTS:
            return GoogleTTSProvider()
        elif provider_type == "mozilla":
            # Try to return Mozilla TTS, but don't let it fail the whole build
            try:
                return MozillaTTSProvider()
            except Exception as e:
                logger.error(f"Failed to initialize Mozilla TTS provider: {str(e)}")
                # Fallback to AWS or Azure if Mozilla fails
                if Config.USE_AWS_POLLY:
                    logger.info("Falling back to AWS Polly due to Mozilla TTS failure")
                    return AWSPollyProvider()
                elif Config.USE_AZURE_TTS:
                    logger.info("Falling back to Azure TTS due to Mozilla TTS failure")
                    return AzureTTSProvider()
                elif Config.USE_GOOGLE_TTS:
                    logger.info("Falling back to Google TTS due to Mozilla TTS failure")
                    return GoogleTTSProvider()
        
        # Default to Azure TTS since it's configured as primary
        if Config.USE_AZURE_TTS:
            return AzureTTSProvider()
        elif Config.USE_AWS_POLLY:
            return AWSPollyProvider()
        else:
            # Last resort, try Mozilla but catch any errors
            try:
                return MozillaTTSProvider()
            except Exception as e:
                logger.error(f"Failed to initialize any TTS provider: {str(e)}")
                raise RuntimeError("No TTS provider could be initialized")
