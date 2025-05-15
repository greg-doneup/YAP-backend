"""
Audio processing utilities for alignment service.

This module provides functions for audio normalization,
conversion between formats, and other audio processing tasks.
"""

import os
import numpy as np
import tempfile
import soundfile as sf
import logging
from pydub import AudioSegment
from typing import Tuple

# Configure logging
logger = logging.getLogger(__name__)

def normalize_audio(audio_data: bytes, 
                    audio_format: str, 
                    target_sample_rate: int = 16000) -> Tuple[np.ndarray, int]:
    """
    Normalize audio to a consistent format for the alignment model.
    
    Args:
        audio_data: Raw audio bytes
        audio_format: Format of the audio (e.g., "wav", "mp3")
        target_sample_rate: Target sample rate for the audio
        
    Returns:
        Tuple of (audio_array, sample_rate)
    """
    # Save to a temporary file
    temp_file_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=f".{audio_format}", delete=False) as temp_file:
            temp_file.write(audio_data)
            temp_file_path = temp_file.name
        
        # Load and normalize the audio
        try:
            # Try loading with soundfile first
            audio_array, sample_rate = sf.read(temp_file_path)
        except Exception as e:
            logger.warning(f"Failed to load with soundfile: {str(e)}")
            # If that fails, try with pydub
            audio = AudioSegment.from_file(temp_file_path, format=audio_format)
            sample_rate = audio.frame_rate
            
            # Convert to numpy array
            audio_array = np.array(audio.get_array_of_samples(), dtype=np.float32)
            
            # Convert to mono if stereo
            if audio.channels == 2:
                audio_array = audio_array.reshape((-1, 2)).mean(axis=1)
            
            # Normalize to [-1.0, 1.0]
            if audio_array.dtype == np.int16:
                audio_array = audio_array / 32768.0
            elif audio_array.dtype == np.int32:
                audio_array = audio_array / 2147483648.0
            elif audio_array.dtype == np.uint8:
                audio_array = (audio_array.astype(np.float32) - 128) / 128.0
            else:
                # If already float, just ensure max amplitude is 1.0
                if np.max(np.abs(audio_array)) > 0:
                    audio_array = audio_array / np.max(np.abs(audio_array))
        
        # Resample if needed
        if sample_rate != target_sample_rate:
            logger.info(f"Resampling from {sample_rate} to {target_sample_rate}")
            # Import librosa only when needed (it's slow to import)
            import librosa
            audio_array = librosa.resample(audio_array, 
                                          orig_sr=sample_rate, 
                                          target_sr=target_sample_rate)
            sample_rate = target_sample_rate
        
        return audio_array, sample_rate
        
    except Exception as e:
        logger.error(f"Error normalizing audio: {str(e)}")
        raise
    finally:
        # Clean up temporary file
        if temp_file_path and os.path.exists(temp_file_path):
            os.unlink(temp_file_path)

def convert_audio_format(audio_data: bytes, 
                         source_format: str, 
                         target_format: str) -> bytes:
    """
    Convert audio from one format to another.
    
    Args:
        audio_data: Raw audio bytes
        source_format: Source format (e.g., "mp3", "m4a")
        target_format: Target format (e.g., "wav")
        
    Returns:
        bytes: Audio data in the target format
    """
    # Save to a temporary file
    source_temp_file = None
    target_temp_file = None
    
    try:
        # Write source audio to temp file
        with tempfile.NamedTemporaryFile(suffix=f".{source_format}", delete=False) as temp_file:
            temp_file.write(audio_data)
            source_temp_file = temp_file.name
        
        # Create target temp file
        target_temp_file = tempfile.mktemp(suffix=f".{target_format}")
        
        # Convert using pydub
        audio = AudioSegment.from_file(source_temp_file, format=source_format)
        audio.export(target_temp_file, format=target_format)
        
        # Read the converted file
        with open(target_temp_file, "rb") as f:
            return f.read()
    
    except Exception as e:
        logger.error(f"Error converting audio format: {str(e)}")
        raise
    
    finally:
        # Clean up temporary files
        if source_temp_file and os.path.exists(source_temp_file):
            os.unlink(source_temp_file)
        if target_temp_file and os.path.exists(target_temp_file):
            os.unlink(target_temp_file)
