"""
Core alignment functionality using WhisperX for forced alignment.

This module handles the phoneme and word-level alignment of audio with text
using the WhisperX library, which combines Whisper with Wav2Vec2 for alignment.
"""

import os
import torch
import numpy as np
import logging
import tempfile
import whisperx
from typing import Dict, List, Tuple, Optional, Any
import uuid

from app.audio_utils import normalize_audio, convert_audio_format
from app.config import Config

# Configure logging
logger = logging.getLogger(__name__)

class AlignmentEngine:
    """
    Main engine for audio-text alignment using WhisperX.
    """
    
    def __init__(self):
        # Set device based on config and availability
        if Config.GPU_ENABLED and torch.cuda.is_available():
            self.device = "cuda"
        else:
            self.device = "cpu"
            
        logger.info(f"Initializing AlignmentEngine on device: {self.device}")
        
        # Log supported languages
        logger.info(f"Supported languages: {Config.SUPPORTED_LANGUAGES}")
        
        # Language code to whisperx model mapping
        self.language_models = {}
        self.alignment_models = {}
    
    def _ensure_model_loaded(self, language_code: str) -> None:
        """
        Ensure the model for the specified language is loaded.
        """
        if language_code not in self.language_models:
            logger.info(f"Loading model for language: {language_code}")
            # Check if the language is supported
            if language_code not in Config.SUPPORTED_LANGUAGES:
                logger.warning(f"Language code {language_code} not in supported languages. Attempting to load anyway.")
                
            # Load WhisperX model - will download if not already present
            self.language_models[language_code] = whisperx.load_model(
                Config.DEFAULT_MODEL, self.device, language=language_code
            )
            
            # Load alignment model and metadata
            logger.info(f"Loading alignment model for language: {language_code}")
            try:
                self.alignment_models[language_code] = whisperx.load_align_model(
                    language_code, self.device
                )
            except Exception as e:
                logger.warning(f"Failed to load alignment model for {language_code}: {str(e)}")
                logger.warning("Falling back to default English alignment model")
                self.alignment_models[language_code] = whisperx.load_align_model(
                    "en", self.device
                )
    
    def _normalize_audio(self, audio_data: bytes, audio_format: str) -> Tuple[np.ndarray, int]:
        """
        Convert audio bytes to the format required by WhisperX.
        
        Args:
            audio_data: Raw audio bytes
            audio_format: Format of the audio (e.g., "wav", "mp3")
            
        Returns:
            Tuple of (audio_array, sample_rate)
        """
        try:
            # Use the audio utilities to normalize the audio
            return normalize_audio(audio_data, audio_format, target_sample_rate=16000)
        except Exception as e:
            logger.error(f"Error normalizing audio: {str(e)}")
            raise
    
    def align_text(self, 
                   audio_data: bytes, 
                   text: str, 
                   language_code: str, 
                   audio_format: str,
                   alignment_level: str = "phoneme") -> Dict[str, Any]:
        """
        Aligns audio with text using WhisperX.
        
        Args:
            audio_data: Raw audio bytes
            text: Text to align with the audio
            language_code: Language code (e.g., "en", "es")
            audio_format: Format of the audio (e.g., "wav", "mp3")
            alignment_level: "word" or "phoneme"
            
        Returns:
            Dictionary containing word and/or phoneme alignments
        """
        logger.info(f"Starting alignment for language: {language_code}, level: {alignment_level}")
        
        try:
            # Ensure the model for this language is loaded
            self._ensure_model_loaded(language_code)
            
            # Normalize audio
            audio_array, sample_rate = self._normalize_audio(audio_data, audio_format)
            
            # Process with WhisperX for transcription
            result = self.language_models[language_code].transcribe(
                audio_array, 
                batch_size=16,
                language=language_code
            )
            
            # Align the audio with the provided text
            if alignment_level == "phoneme" or alignment_level == "word":
                # First get word-level alignments
                word_result = whisperx.align(
                    result["segments"],
                    self.alignment_models[language_code],
                    audio_array,
                    self.device,
                    return_char_alignments=False
                )
                
                # If we only need word-level, return it now
                if alignment_level == "word":
                    word_alignments = []
                    for segment in word_result["segments"]:
                        for word in segment.get("words", []):
                            word_alignments.append({
                                "word": word["word"],
                                "start_time": word["start"],
                                "end_time": word["end"],
                                "confidence": word.get("confidence", 0.0)
                            })
                    
                    return {
                        "word_alignments": word_alignments,
                        "phoneme_alignments": [],
                        "alignment_id": str(uuid.uuid4())
                    }
                
                # If we need phoneme-level, get that too
                if alignment_level == "phoneme":
                    # Now get phoneme-level alignments
                    phoneme_result = whisperx.align(
                        result["segments"],
                        self.alignment_models[language_code],
                        audio_array,
                        self.device,
                        return_char_alignments=True  # We need character alignments for phoneme extraction
                    )
                    
                    # Extract phoneme information
                    word_alignments = []
                    phoneme_alignments = []
                    
                    for segment in phoneme_result["segments"]:
                        for word in segment.get("words", []):
                            word_alignments.append({
                                "word": word["word"],
                                "start_time": word["start"],
                                "end_time": word["end"],
                                "confidence": word.get("confidence", 0.0)
                            })
                            
                            # Process phonemes
                            if "phonemes" in word:
                                for phoneme in word["phonemes"]:
                                    phoneme_alignments.append({
                                        "phoneme": phoneme["phoneme"],
                                        "word": word["word"],
                                        "start_time": phoneme["start"],
                                        "end_time": phoneme["end"],
                                        "confidence": phoneme.get("confidence", 0.0)
                                    })
                    
                    return {
                        "word_alignments": word_alignments,
                        "phoneme_alignments": phoneme_alignments,
                        "alignment_id": str(uuid.uuid4())
                    }
            else:
                raise ValueError(f"Unsupported alignment level: {alignment_level}")
        
        except Exception as e:
            logger.error(f"Error during alignment: {str(e)}")
            raise
    
    def cleanup(self):
        """
        Release resources (GPU memory, etc.)
        """
        # Clear CUDA cache to free up memory
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        
        # Clear loaded models
        self.language_models = {}
        self.alignment_models = {}
