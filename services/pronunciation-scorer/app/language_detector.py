"""
Language detection module for pronunciation scorer service.

This module provides language detection capabilities for audio inputs
without specified language codes.
"""

import logging
import tempfile
import os
from typing import Optional, Tuple
import whisper

# Configure logging
logger = logging.getLogger(__name__)

class LanguageDetector:
    """
    Detects language from audio using Whisper's language detection.
    """
    
    def __init__(self):
        """
        Initialize language detector.
        """
        logger.info("Initializing LanguageDetector")
        self.detector = None  # Lazy load
    
    def _ensure_model_loaded(self):
        """
        Ensure the whisper model is loaded.
        """
        if self.detector is None:
            logger.info("Loading Whisper model for language detection")
            # Use the tiny model for language detection to save resources
            self.detector = whisper.load_model("tiny")
            logger.info("Whisper model loaded")
    
    def detect_language(self, audio_data: bytes, audio_format: str) -> Tuple[str, float]:
        """
        Detect language from audio data.
        
        Args:
            audio_data: Raw audio bytes
            audio_format: Format of the audio (e.g., "wav", "mp3")
            
        Returns:
            Tuple[str, float]: Language code and confidence
        """
        self._ensure_model_loaded()
        
        # Save to a temporary file
        temp_file_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=f".{audio_format}", delete=False) as temp_file:
                temp_file.write(audio_data)
                temp_file_path = temp_file.name
            
            # Detect language
            logger.info("Detecting language...")
            audio = whisper.load_audio(temp_file_path)
            audio = whisper.pad_or_trim(audio)
            
            # Get the mel spectrogram
            mel = whisper.log_mel_spectrogram(audio).to(self.detector.device)
            
            # Detect language
            _, probs = self.detector.detect_language(mel)
            
            # Get the language code with highest probability
            language_code = max(probs, key=probs.get)
            confidence = probs[language_code]
            
            logger.info(f"Detected language: {language_code} with confidence {confidence:.2f}")
            
            # Clean up
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
            
            return language_code, confidence
            
        except Exception as e:
            logger.error(f"Error detecting language: {str(e)}")
            
            # Clean up if possible
            if temp_file_path and os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
                
            # Default to English
            return "en", 0.0
