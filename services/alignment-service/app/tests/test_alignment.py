"""
Unit tests for the alignment engine.
"""

import unittest
import numpy as np
import tempfile
import os
from unittest.mock import patch, MagicMock
from app.alignment import AlignmentEngine

class TestAlignmentEngine(unittest.TestCase):
    """
    Test cases for the AlignmentEngine class.
    """
    
    def setUp(self):
        """
        Set up test environment.
        """
        # Create a mock AlignmentEngine that doesn't load real models
        self.alignment_engine = AlignmentEngine()
        self.alignment_engine.language_models = {}
        self.alignment_engine.alignment_models = {}
    
    @patch('app.alignment.whisperx.load_model')
    def test_ensure_model_loaded(self, mock_load_model):
        """
        Test the model loading logic.
        """
        # Set up mock
        mock_model = MagicMock()
        mock_load_model.return_value = mock_model
        
        # Test model loading
        self.alignment_engine._ensure_model_loaded("en")
        
        # Verify model was loaded
        mock_load_model.assert_called_once()
        self.assertIn("en", self.alignment_engine.language_models)
    
    def test_normalize_audio(self):
        """
        Test audio normalization functionality.
        """
        # Create a test audio file
        sample_rate = 16000
        duration = 1.0  # seconds
        t = np.linspace(0, duration, int(sample_rate * duration), False)
        audio = np.sin(2 * np.pi * 440 * t)  # 440 Hz sine wave
        
        # Save the audio to a temporary WAV file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
            import soundfile as sf
            sf.write(temp_file.name, audio, sample_rate)
            temp_file_path = temp_file.name
        
        try:
            # Read the audio data
            with open(temp_file_path, "rb") as f:
                audio_data = f.read()
            
            # Test normalization
            audio_array, sample_rate_out = self.alignment_engine._normalize_audio(audio_data, "wav")
            
            # Check the results
            self.assertIsInstance(audio_array, np.ndarray)
            self.assertEqual(sample_rate_out, sample_rate)
            self.assertAlmostEqual(np.max(np.abs(audio_array)), 1.0, places=5)
            
        finally:
            # Clean up
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
    
    @patch('app.alignment.whisperx.load_model')
    @patch('app.alignment.whisperx.load_align_model')
    @patch('app.alignment.whisperx.align')
    def test_align_text_word_level(self, mock_align, mock_load_align_model, mock_load_model):
        """
        Test word-level alignment.
        """
        # Set up mocks
        mock_model = MagicMock()
        mock_model.transcribe.return_value = {
            "segments": [{"text": "Test alignment"}]
        }
        mock_load_model.return_value = mock_model
        
        mock_align_model = MagicMock()
        mock_load_align_model.return_value = mock_align_model
        
        mock_align.return_value = {
            "segments": [
                {
                    "words": [
                        {"word": "Test", "start": 0.0, "end": 0.5, "confidence": 0.95},
                        {"word": "alignment", "start": 0.6, "end": 1.2, "confidence": 0.92}
                    ]
                }
            ]
        }
        
        # Create dummy audio data
        audio_data = b"dummy_audio_data"
        
        # Mock the _normalize_audio method
        self.alignment_engine._normalize_audio = MagicMock(return_value=(np.zeros(1000), 16000))
        
        # Call the align_text method
        result = self.alignment_engine.align_text(
            audio_data=audio_data,
            text="Test alignment",
            language_code="en",
            audio_format="wav",
            alignment_level="word"
        )
        
        # Verify the results
        self.assertIn("word_alignments", result)
        self.assertEqual(len(result["word_alignments"]), 2)
        self.assertEqual(result["word_alignments"][0]["word"], "Test")
        self.assertEqual(result["word_alignments"][1]["word"], "alignment")

if __name__ == "__main__":
    unittest.main()
