"""
Integration tests for the pronunciation scorer service.
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import unittest
import grpc
from unittest.mock import patch, MagicMock
import tempfile
import wave
import numpy as np

from app.gop_scorer import GOPScorer
from app.azure_scorer import AzureScorer
from app.scoring_provider import ScoringProvider
from app.config import Config


class TestPronunciationScorer(unittest.TestCase):
    """Test cases for the pronunciation scorer modules"""

    def setUp(self):
        """Set up test fixtures"""
        # Create a small test audio file
        self.audio_file = self._create_test_audio()
        
        # Sample text
        self.test_text = "hello world"
        
        # Sample alignments
        self.test_alignments = {
            'word_alignments': [
                {
                    'word': 'hello',
                    'start_time': 0.0,
                    'end_time': 0.5,
                    'confidence': 0.9
                },
                {
                    'word': 'world',
                    'start_time': 0.6,
                    'end_time': 1.0,
                    'confidence': 0.95
                }
            ],
            'phoneme_alignments': [
                {
                    'phoneme': 'HH',
                    'start_time': 0.0,
                    'end_time': 0.1,
                    'confidence': 0.85,
                    'word': 'hello'
                },
                {
                    'phoneme': 'AH',
                    'start_time': 0.1,
                    'end_time': 0.2,
                    'confidence': 0.9,
                    'word': 'hello'
                },
                {
                    'phoneme': 'L',
                    'start_time': 0.2,
                    'end_time': 0.3,
                    'confidence': 0.95,
                    'word': 'hello'
                },
                {
                    'phoneme': 'OW',
                    'start_time': 0.3,
                    'end_time': 0.5,
                    'confidence': 0.92,
                    'word': 'hello'
                },
                {
                    'phoneme': 'W',
                    'start_time': 0.6,
                    'end_time': 0.7,
                    'confidence': 0.88,
                    'word': 'world'
                },
                {
                    'phoneme': 'ER',
                    'start_time': 0.7,
                    'end_time': 0.8,
                    'confidence': 0.9,
                    'word': 'world'
                },
                {
                    'phoneme': 'L',
                    'start_time': 0.8,
                    'end_time': 0.9,
                    'confidence': 0.92,
                    'word': 'world'
                },
                {
                    'phoneme': 'D',
                    'start_time': 0.9,
                    'end_time': 1.0,
                    'confidence': 0.85,
                    'word': 'world'
                }
            ]
        }

    def _create_test_audio(self):
        """Create a test audio file with dummy data"""
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            # Create a simple sine wave
            sample_rate = 16000
            duration = 1.0  # 1 second
            t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
            audio_data = (np.sin(2 * np.pi * 440 * t) * 32767).astype(np.int16)
            
            # Write to WAV file
            with wave.open(f.name, 'wb') as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)  # 2 bytes for int16
                wav_file.setframerate(sample_rate)
                wav_file.writeframes(audio_data.tobytes())
            
            return f.name

    def tearDown(self):
        """Clean up test fixtures"""
        if hasattr(self, 'audio_file') and os.path.exists(self.audio_file):
            os.unlink(self.audio_file)

    @patch('app.gop_scorer.GOPScorer._compute_gop_score')
    def test_gop_scorer(self, mock_compute_gop):
        """Test the GOP scorer"""
        # Mock the GOP score computation
        mock_compute_gop.return_value = 85.0
        
        # Create GOP scorer
        scorer = GOPScorer(language_code='en', lexicon_dir='lexicons')
        
        # Read test audio
        with open(self.audio_file, 'rb') as f:
            audio_data = f.read()
        
        # Score pronunciation
        result = scorer.score_pronunciation(
            audio_data=audio_data,
            alignments=self.test_alignments,
            scoring_level='phoneme'
        )
        
        # Check overall score exists
        self.assertIn('overall_score', result)
        self.assertIn('score', result['overall_score'])
        self.assertIn('feedback', result['overall_score'])
        
        # Check word scores
        self.assertIn('word_scores', result)
        self.assertEqual(len(result['word_scores']), 2)  # hello, world
        
        # Check phoneme scores
        self.assertIn('phoneme_scores', result)
        self.assertEqual(len(result['phoneme_scores']), 8)  # 4 for hello, 4 for world
        
        # Check scoring ID
        self.assertIn('scoring_id', result)
        
        # Check that mock was called for each phoneme
        self.assertEqual(mock_compute_gop.call_count, 8)

    def test_scoring_provider(self):
        """Test the scoring provider adapter"""
        # Create a scoring provider
        provider = ScoringProvider.get_provider('en')
        
        # Verify that at least one of GOP or Azure is initialized
        self.assertTrue(provider.gop_scorer is not None or provider.azure_scorer is not None)
        
        # Mock the score_pronunciation methods
        if provider.gop_scorer:
            provider.gop_scorer.score_pronunciation = MagicMock(return_value={
                'overall_score': {'score': 85.0, 'feedback': ['Good pronunciation']},
                'word_scores': [],
                'phoneme_scores': [],
                'scoring_id': '12345'
            })
        
        if provider.azure_scorer:
            provider.azure_scorer.score_pronunciation = MagicMock(return_value={
                'overall_score': {'score': 80.0, 'feedback': ['Good pronunciation (Azure)']},
                'word_scores': [],
                'phoneme_scores': [],
                'scoring_id': '67890'
            })
        
        # Read test audio
        with open(self.audio_file, 'rb') as f:
            audio_data = f.read()
        
        # Score pronunciation
        result = provider.score_pronunciation(
            audio_data=audio_data,
            text=self.test_text,
            alignments=self.test_alignments,
            scoring_level='phoneme'
        )
        
        # Check that a result was returned
        self.assertIsNotNone(result)
        self.assertIn('overall_score', result)
        self.assertIn('scoring_id', result)
        
        # Verify that one of the mocks was called
        if provider.gop_scorer:
            provider.gop_scorer.score_pronunciation.assert_called_once()
        elif provider.azure_scorer:
            provider.azure_scorer.score_pronunciation.assert_called_once()


if __name__ == '__main__':
    unittest.main()
