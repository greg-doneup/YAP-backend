import unittest
from unittest import mock
import grpc
import wave
import tempfile
import os
import time
from concurrent import futures

# Import proto modules
from proto import voice_pb2
from proto import voice_pb2_grpc

# Import service implementation
from app.server import VoiceScoreServicer
from app.config import Config

class VoiceScoreUnitTest(unittest.TestCase):
    """Unit tests for the voice-score service."""
    
    def setUp(self):
        """Set up test environment before each test."""
        # Create a servicer instance with mock dependencies
        self.servicer = VoiceScoreServicer()
        
        # Create mock clients
        self.mock_alignment_client = mock.MagicMock()
        self.mock_pronunciation_scorer_client = mock.MagicMock()
        
        # Replace real clients with mocks
        self.servicer.alignment_client = self.mock_alignment_client
        self.servicer.pronunciation_scorer_client = self.mock_pronunciation_scorer_client
        
        # Mock context for gRPC
        self.mock_context = mock.MagicMock()
        
    def test_health_check(self):
        """Test the health check endpoint."""
        # Set up mock client health check responses
        self.mock_alignment_client.check_health.return_value = (True, "Alignment service healthy")
        self.mock_pronunciation_scorer_client.check_health.return_value = (True, "Pronunciation scorer service healthy")
        
        # Call health check
        response = self.servicer.HealthCheck(voice_pb2.HealthCheckRequest(), self.mock_context)
        
        # Verify response
        self.assertTrue(response.status)
        self.assertIn("healthy", response.message.lower())
        
        # Verify mock clients were called
        self.mock_alignment_client.check_health.assert_called_once()
        self.mock_pronunciation_scorer_client.check_health.assert_called_once()
    
    def test_health_check_with_failures(self):
        """Test health check when dependencies are failing."""
        # Set up mock client health check responses with failures
        self.mock_alignment_client.check_health.return_value = (False, "Alignment service error")
        self.mock_pronunciation_scorer_client.check_health.return_value = (True, "Pronunciation scorer service healthy")
        
        # Test with fallback enabled
        Config.USE_FALLBACK_SCORING = True
        response = self.servicer.HealthCheck(voice_pb2.HealthCheckRequest(), self.mock_context)
        self.assertTrue(response.status)  # Should still be healthy due to fallback mode
        self.assertIn("fallback", response.message.lower())
        
        # Test with fallback disabled
        Config.USE_FALLBACK_SCORING = False
        response = self.servicer.HealthCheck(voice_pb2.HealthCheckRequest(), self.mock_context)
        self.assertFalse(response.status)  # Should report unhealthy
        self.assertIn("alignment", response.message.lower())
    
    def test_evaluate_detailed(self):
        """Test the detailed evaluation endpoint."""
        # Create test request
        audio_bytes = b'dummy_audio_data'
        request = voice_pb2.DetailedEvalRequest(
            audio=audio_bytes,
            expected_phrase="hello world",
            language_code="en-US",
            detail_level="phoneme"
        )
        
        # Set up mock alignment client response
        self.mock_alignment_client.align_text.return_value = {
            "success": True,
            "message": "Alignment successful",
            "word_alignments": [
                {"word": "hello", "start_time": 0.0, "end_time": 0.5, "confidence": 0.9},
                {"word": "world", "start_time": 0.6, "end_time": 1.0, "confidence": 0.95}
            ],
            "phoneme_alignments": [
                {"phoneme": "HH", "start_time": 0.0, "end_time": 0.1, "confidence": 0.88, "word": "hello"},
                {"phoneme": "AH", "start_time": 0.1, "end_time": 0.2, "confidence": 0.9, "word": "hello"},
                {"phoneme": "L", "start_time": 0.2, "end_time": 0.3, "confidence": 0.92, "word": "hello"},
                {"phoneme": "OW", "start_time": 0.3, "end_time": 0.5, "confidence": 0.91, "word": "hello"},
                {"phoneme": "W", "start_time": 0.6, "end_time": 0.7, "confidence": 0.93, "word": "world"},
                {"phoneme": "ER", "start_time": 0.7, "end_time": 0.8, "confidence": 0.88, "word": "world"},
                {"phoneme": "L", "start_time": 0.8, "end_time": 0.9, "confidence": 0.9, "word": "world"},
                {"phoneme": "D", "start_time": 0.9, "end_time": 1.0, "confidence": 0.89, "word": "world"}
            ],
            "alignment_id": "test-alignment-123"
        }
        
        # Set up mock pronunciation scorer client response
        self.mock_pronunciation_scorer_client.score_pronunciation.return_value = {
            "success": True,
            "message": "Scoring successful",
            "overall_score": {
                "score": 85.0,
                "feedback": ["Good pronunciation overall", "Work on the 'r' sound"]
            },
            "word_scores": [
                {"word": "hello", "score": 90.0, "issues": [], "start_time": 0.0, "end_time": 0.5},
                {"word": "world", "score": 80.0, "issues": ["'r' sound needs improvement"], "start_time": 0.6, "end_time": 1.0}
            ],
            "phoneme_scores": [
                {"phoneme": "HH", "word": "hello", "score": 92.0, "issue": "", "start_time": 0.0, "end_time": 0.1},
                {"phoneme": "AH", "word": "hello", "score": 91.0, "issue": "", "start_time": 0.1, "end_time": 0.2},
                {"phoneme": "L", "word": "hello", "score": 90.0, "issue": "", "start_time": 0.2, "end_time": 0.3},
                {"phoneme": "OW", "word": "hello", "score": 89.0, "issue": "", "start_time": 0.3, "end_time": 0.5},
                {"phoneme": "W", "word": "world", "score": 85.0, "issue": "", "start_time": 0.6, "end_time": 0.7},
                {"phoneme": "ER", "word": "world", "score": 70.0, "issue": "'r' sound is not clear", "start_time": 0.7, "end_time": 0.8},
                {"phoneme": "L", "word": "world", "score": 82.0, "issue": "", "start_time": 0.8, "end_time": 0.9},
                {"phoneme": "D", "word": "world", "score": 83.0, "issue": "", "start_time": 0.9, "end_time": 1.0}
            ],
            "scoring_id": "test-scoring-456"
        }
        
        # Call the evaluate detailed method
        response = self.servicer.EvaluateDetailed(request, self.mock_context)
        
        # Verify alignment client was called with correct parameters
        self.mock_alignment_client.align_text.assert_called_once_with(
            audio_data=audio_bytes,
            text="hello world",
            language_code="en-US",
            audio_format="wav",  # Default assumption
            alignment_level="phoneme"
        )
        
        # Verify pronunciation scorer client was called with correct parameters
        self.mock_pronunciation_scorer_client.score_pronunciation.assert_called_once()
        call_args = self.mock_pronunciation_scorer_client.score_pronunciation.call_args[1]
        self.assertEqual(call_args["audio_data"], audio_bytes)
        self.assertEqual(call_args["text"], "hello world")
        self.assertEqual(call_args["language_code"], "en-US")
        
        # Verify response content
        self.assertEqual(response.transcript, "hello world")
        self.assertEqual(response.overall_score, 85.0)
        self.assertEqual(response.alignment_id, "test-alignment-123")
        self.assertEqual(response.scoring_id, "test-scoring-456")
        self.assertEqual(len(response.words), 2)
        self.assertEqual(len(response.phonemes), 8)
        self.assertGreaterEqual(len(response.feedback), 1)
    
    def test_evaluate_detailed_alignment_failure(self):
        """Test detailed evaluation when alignment fails."""
        # Create test request
        audio_bytes = b'dummy_audio_data'
        request = voice_pb2.DetailedEvalRequest(
            audio=audio_bytes,
            expected_phrase="hello world",
            language_code="en-US",
            detail_level="phoneme"
        )
        
        # Set up mock alignment client to return failure
        self.mock_alignment_client.align_text.return_value = {
            "success": False,
            "message": "Alignment failed: Invalid audio format"
        }
        
        # Call the evaluate detailed method
        response = self.servicer.EvaluateDetailed(request, self.mock_context)
        
        # Verify context was set with error code
        self.mock_context.set_code.assert_called_once_with(grpc.StatusCode.INTERNAL)
        self.assertIn("alignment failed", self.mock_context.set_details.call_args[0][0].lower())
        
        # Verify pronunciation scorer was not called
        self.mock_pronunciation_scorer_client.score_pronunciation.assert_not_called()
    
    def test_evaluate_detailed_scoring_failure(self):
        """Test detailed evaluation when scoring fails."""
        # Create test request
        audio_bytes = b'dummy_audio_data'
        request = voice_pb2.DetailedEvalRequest(
            audio=audio_bytes,
            expected_phrase="hello world",
            language_code="en-US",
            detail_level="phoneme"
        )
        
        # Set up mock alignment client to succeed
        self.mock_alignment_client.align_text.return_value = {
            "success": True,
            "message": "Alignment successful",
            "word_alignments": [
                {"word": "hello", "start_time": 0.0, "end_time": 0.5, "confidence": 0.9},
                {"word": "world", "start_time": 0.6, "end_time": 1.0, "confidence": 0.95}
            ],
            "phoneme_alignments": [
                {"phoneme": "HH", "start_time": 0.0, "end_time": 0.1, "confidence": 0.88, "word": "hello"}
            ],
            "alignment_id": "test-alignment-123"
        }
        
        # Set up mock pronunciation scorer to fail
        self.mock_pronunciation_scorer_client.score_pronunciation.return_value = {
            "success": False,
            "message": "Scoring failed: Model not found for language"
        }
        
        # Call the evaluate detailed method
        response = self.servicer.EvaluateDetailed(request, self.mock_context)
        
        # Verify context was set with error code
        self.mock_context.set_code.assert_called_once_with(grpc.StatusCode.INTERNAL)
        self.assertIn("scoring failed", self.mock_context.set_details.call_args[0][0].lower())

if __name__ == '__main__':
    unittest.main()
