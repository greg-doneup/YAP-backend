"""
Lightweight alignment service implementation using basic audio processing.
This is a simplified version that works without GPU/heavy ML models.
"""

import librosa
import numpy as np
from scipy.signal import find_peaks
import logging
from typing import List, Tuple, Dict, Optional

logger = logging.getLogger(__name__)

class LightweightAligner:
    """Lightweight alignment using basic audio processing techniques."""
    
    def __init__(self):
        """Initialize the lightweight aligner."""
        self.sample_rate = 16000
        self.hop_length = 512
        self.frame_length = 2048
        
    def align_audio_text(
        self, 
        audio_data: bytes, 
        text: str, 
        language_code: str = "en"
    ) -> Dict:
        """
        Perform basic alignment using energy-based segmentation.
        
        Args:
            audio_data: Raw audio bytes
            text: Text to align
            language_code: Language code (currently supports basic processing)
            
        Returns:
            Dict with word_alignments and basic phoneme_alignments
        """
        try:
            # Convert audio bytes to numpy array
            audio_array = self._bytes_to_audio(audio_data)
            
            # Extract basic features
            energy = self._compute_energy(audio_array)
            speech_segments = self._detect_speech_segments(energy)
            
            # Split text into words
            words = text.strip().split()
            
            # Perform basic word-level alignment
            word_alignments = self._align_words_to_segments(words, speech_segments)
            
            # Generate basic phoneme alignments (simplified)
            phoneme_alignments = self._generate_basic_phoneme_alignments(word_alignments)
            
            return {
                "success": True,
                "message": "Lightweight alignment completed",
                "word_alignments": word_alignments,
                "phoneme_alignments": phoneme_alignments,
                "alignment_id": f"lightweight_{hash(text)}_{len(audio_data)}"
            }
            
        except Exception as e:
            logger.error(f"Alignment failed: {str(e)}")
            return {
                "success": False,
                "message": f"Alignment failed: {str(e)}",
                "word_alignments": [],
                "phoneme_alignments": [],
                "alignment_id": ""
            }
    
    def _bytes_to_audio(self, audio_data: bytes) -> np.ndarray:
        """Convert audio bytes to numpy array."""
        # This is a simplified conversion - in production you'd handle different formats
        try:
            # Try to load as WAV data (most common)
            import io
            audio_array, sr = librosa.load(io.BytesIO(audio_data), sr=self.sample_rate)
            return audio_array
        except Exception as e:
            logger.warning(f"Failed to load audio properly, using fallback: {e}")
            # Fallback: treat as raw float32 data
            return np.frombuffer(audio_data, dtype=np.float32)
    
    def _compute_energy(self, audio: np.ndarray) -> np.ndarray:
        """Compute frame-wise energy of the audio signal."""
        # Compute RMS energy
        frame_length = min(self.frame_length, len(audio))
        hop_length = min(self.hop_length, len(audio) // 4)
        
        if len(audio) < frame_length:
            return np.array([np.sqrt(np.mean(audio**2))])
        
        frames = librosa.util.frame(audio, frame_length=frame_length, hop_length=hop_length)
        energy = np.sqrt(np.mean(frames**2, axis=0))
        return energy
    
    def _detect_speech_segments(self, energy: np.ndarray) -> List[Tuple[float, float]]:
        """Detect speech segments based on energy thresholding."""
        if len(energy) == 0:
            return [(0.0, 1.0)]
        
        # Adaptive thresholding
        threshold = np.mean(energy) * 0.3
        
        # Find segments above threshold
        above_threshold = energy > threshold
        
        # Find start and end points
        segments = []
        in_segment = False
        start_idx = 0
        
        for i, is_speech in enumerate(above_threshold):
            if is_speech and not in_segment:
                start_idx = i
                in_segment = True
            elif not is_speech and in_segment:
                end_idx = i
                start_time = start_idx * self.hop_length / self.sample_rate
                end_time = end_idx * self.hop_length / self.sample_rate
                segments.append((start_time, end_time))
                in_segment = False
        
        # Handle case where audio ends while in segment
        if in_segment:
            end_time = len(energy) * self.hop_length / self.sample_rate
            start_time = start_idx * self.hop_length / self.sample_rate
            segments.append((start_time, end_time))
        
        # Ensure we have at least one segment
        if not segments:
            total_duration = len(energy) * self.hop_length / self.sample_rate
            segments = [(0.0, total_duration)]
        
        return segments
    
    def _align_words_to_segments(self, words: List[str], segments: List[Tuple[float, float]]) -> List[Dict]:
        """Align words to detected speech segments."""
        word_alignments = []
        
        if not words or not segments:
            return word_alignments
        
        # Simple strategy: distribute words evenly across segments
        total_duration = segments[-1][1] if segments else 1.0
        
        if len(segments) == 1:
            # Single segment - distribute words evenly
            segment_start, segment_end = segments[0]
            duration_per_word = (segment_end - segment_start) / len(words)
            
            for i, word in enumerate(words):
                start_time = segment_start + i * duration_per_word
                end_time = segment_start + (i + 1) * duration_per_word
                word_alignments.append({
                    "word": word,
                    "start_time": round(start_time, 3),
                    "end_time": round(end_time, 3),
                    "confidence": 0.7  # Moderate confidence for lightweight method
                })
        else:
            # Multiple segments - assign words to segments
            words_per_segment = max(1, len(words) // len(segments))
            word_idx = 0
            
            for segment_start, segment_end in segments:
                segment_words = words[word_idx:word_idx + words_per_segment]
                if not segment_words:
                    break
                
                duration_per_word = (segment_end - segment_start) / len(segment_words)
                
                for i, word in enumerate(segment_words):
                    start_time = segment_start + i * duration_per_word
                    end_time = segment_start + (i + 1) * duration_per_word
                    word_alignments.append({
                        "word": word,
                        "start_time": round(start_time, 3),
                        "end_time": round(end_time, 3),
                        "confidence": 0.7
                    })
                
                word_idx += len(segment_words)
            
            # Handle remaining words
            if word_idx < len(words):
                remaining_words = words[word_idx:]
                if segments:
                    last_segment_end = segments[-1][1]
                    duration_per_word = 0.5  # Assume 0.5s per remaining word
                    
                    for i, word in enumerate(remaining_words):
                        start_time = last_segment_end + i * duration_per_word
                        end_time = last_segment_end + (i + 1) * duration_per_word
                        word_alignments.append({
                            "word": word,
                            "start_time": round(start_time, 3),
                            "end_time": round(end_time, 3),
                            "confidence": 0.5  # Lower confidence for extrapolated words
                        })
        
        return word_alignments
    
    def _generate_basic_phoneme_alignments(self, word_alignments: List[Dict]) -> List[Dict]:
        """Generate basic phoneme alignments based on word alignments."""
        phoneme_alignments = []
        
        # Simple phoneme mapping (very basic)
        basic_phoneme_map = {
            'a': ['ae'], 'e': ['eh'], 'i': ['ih'], 'o': ['ao'], 'u': ['uh'],
            'b': ['b'], 'c': ['k'], 'd': ['d'], 'f': ['f'], 'g': ['g'],
            'h': ['hh'], 'j': ['jh'], 'k': ['k'], 'l': ['l'], 'm': ['m'],
            'n': ['n'], 'p': ['p'], 'q': ['k'], 'r': ['r'], 's': ['s'],
            't': ['t'], 'v': ['v'], 'w': ['w'], 'x': ['k', 's'], 'y': ['y'], 'z': ['z']
        }
        
        for word_alignment in word_alignments:
            word = word_alignment["word"].lower()
            start_time = word_alignment["start_time"]
            end_time = word_alignment["end_time"]
            word_duration = end_time - start_time
            
            # Generate basic phonemes for the word
            phonemes = []
            for char in word:
                if char in basic_phoneme_map:
                    phonemes.extend(basic_phoneme_map[char])
            
            if not phonemes:
                phonemes = ['unk']  # Unknown phoneme
            
            # Distribute phonemes evenly within the word duration
            phoneme_duration = word_duration / len(phonemes)
            
            for i, phoneme in enumerate(phonemes):
                phoneme_start = start_time + i * phoneme_duration
                phoneme_end = start_time + (i + 1) * phoneme_duration
                
                phoneme_alignments.append({
                    "phoneme": phoneme,
                    "word": word_alignment["word"],
                    "start_time": round(phoneme_start, 3),
                    "end_time": round(phoneme_end, 3),
                    "confidence": 0.6  # Lower confidence for generated phonemes
                })
        
        return phoneme_alignments
