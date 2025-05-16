"""
Language detection module for TTS service.

This module provides functionality to detect the language of input text
and map it to supported language codes with fallbacks.
"""

import logging
from typing import Optional, Dict, Any
import re

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to import langdetect for language detection
try:
    from langdetect import detect, DetectorFactory
    # Set seed for consistent results
    DetectorFactory.seed = 42
    LANGDETECT_AVAILABLE = True
except ImportError:
    logger.warning("langdetect not available. Install with 'pip install langdetect' for language detection.")
    LANGDETECT_AVAILABLE = False

# Try to import fasttext for more accurate language detection (optional)
try:
    import fasttext
    FASTTEXT_AVAILABLE = True
    # Load the language detection model lazily (on first use)
    _fasttext_model = None
except ImportError:
    logger.info("fasttext not available. Using langdetect as fallback.")
    FASTTEXT_AVAILABLE = False

from app.config import Config

class LanguageDetector:
    """
    Detects language from text and provides fallback mapping.
    """

    def __init__(self):
        """
        Initialize the language detector.
        """
        self.supported_languages = set(Config.SUPPORTED_LANGUAGES.keys())
        self.fallbacks = Config.LANGUAGE_FALLBACKS

    def _load_fasttext_model(self):
        """
        Lazily load the fasttext language detection model.
        """
        global _fasttext_model
        if FASTTEXT_AVAILABLE and _fasttext_model is None:
            try:
                # Try to load the pre-trained model
                model_path = "lid.176.bin"  # Default path, should be downloaded separately
                _fasttext_model = fasttext.load_model(model_path)
                logger.info("Loaded fasttext language detection model")
            except Exception as e:
                logger.error(f"Failed to load fasttext model: {e}")
                logger.info("Falling back to langdetect")

    def detect_language(self, text: str, min_length: int = 5) -> Optional[str]:
        """
        Detect the language of the input text.
        
        Args:
            text: Input text
            min_length: Minimum text length for reliable detection
            
        Returns:
            Optional[str]: Detected language code or None if detection failed
        """
        if not text or len(text.strip()) < min_length:
            logger.warning("Text too short for reliable language detection")
            return None

        detected_lang = None

        # Try fasttext first for more accurate detection
        if FASTTEXT_AVAILABLE:
            try:
                self._load_fasttext_model()
                if _fasttext_model is not None:
                    # Fasttext returns labels in the format '__label__en'
                    predictions = _fasttext_model.predict(text.replace("\n", " "))
                    detected_lang = predictions[0][0].replace("__label__", "")
                    logger.debug(f"Fasttext detected language: {detected_lang}")
            except Exception as e:
                logger.warning(f"Fasttext language detection failed: {e}")

        # Fall back to langdetect if fasttext failed or not available
        if not detected_lang and LANGDETECT_AVAILABLE:
            try:
                detected_lang = detect(text)
                logger.debug(f"Langdetect detected language: {detected_lang}")
            except Exception as e:
                logger.warning(f"Langdetect language detection failed: {e}")

        return detected_lang

    def get_supported_language(self, text: str, default: str = "en") -> str:
        """
        Get a supported language code for the input text, with fallback.
        
        Args:
            text: Input text
            default: Default language if detection fails
            
        Returns:
            str: Supported language code
        """
        detected_lang = self.detect_language(text)
        
        if not detected_lang:
            logger.info(f"Language detection failed, using default: {default}")
            return default
            
        # Check if the detected language is directly supported
        if detected_lang in self.supported_languages:
            logger.info(f"Detected language {detected_lang} is directly supported")
            return detected_lang
            
        # Check for language without region code
        if "-" in detected_lang:
            base_lang = detected_lang.split("-")[0]
            if base_lang in self.supported_languages:
                logger.info(f"Using base language {base_lang} for detected {detected_lang}")
                return base_lang
                
        # Try fallback mapping
        fallback = self.fallbacks.get(detected_lang)
        if fallback:
            logger.info(f"Using fallback language {fallback} for detected {detected_lang}")
            return fallback
            
        # If all else fails, use default
        logger.info(f"No fallback for {detected_lang}, using default: {default}")
        return default

# Singleton instance
_detector = None

def get_language_detector() -> LanguageDetector:
    """
    Get or create the language detector.
    
    Returns:
        LanguageDetector: The language detector singleton
    """
    global _detector
    if _detector is None:
        _detector = LanguageDetector()
    return _detector
