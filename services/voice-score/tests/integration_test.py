import unittest
import grpc
import time
import os
import wave
import numpy as np
from concurrent import futures
import tempfile
from unittest import mock

# Import protos
from proto import voice_pb2
from proto import voice_pb2_grpc
from proto import alignment_pb2
from proto import alignment_pb2_grpc
from proto import pronunciation_scorer_pb2
from proto import pronunciation_scorer_pb2_grpc
from proto import tts_pb2
from proto import tts_pb2_grpc

# Test class for the Pronunciation Assessment Pipeline
class PronunciationAssessmentIntegrationTest(unittest.TestCase):
    """
    Integration tests for the complete pronunciation assessment pipeline.
    
    This test suite validates the integrated functionality of:
    - TTS Service
    - Voice Score Service
    - Alignment Service
    - Pronunciation Scorer Service
    """
    
    @classmethod
    def setUpClass(cls):
        """Set up test environment once before all tests."""
        # Define service endpoints (can be overridden with environment variables)
        cls.voice_score_endpoint = os.environ.get("VOICE_SCORE_ENDPOINT", "localhost:50054")
        cls.alignment_endpoint = os.environ.get("ALIGNMENT_ENDPOINT", "localhost:50051")
        cls.pronunciation_scorer_endpoint = os.environ.get("PRONUNCIATION_SCORER_ENDPOINT", "localhost:50052")
        cls.tts_endpoint = os.environ.get("TTS_ENDPOINT", "localhost:50053")
        
        # Create gRPC channels
        cls.voice_score_channel = grpc.insecure_channel(cls.voice_score_endpoint)
        cls.alignment_channel = grpc.insecure_channel(cls.alignment_endpoint)
        cls.pronunciation_scorer_channel = grpc.insecure_channel(cls.pronunciation_scorer_endpoint)
        cls.tts_channel = grpc.insecure_channel(cls.tts_endpoint)
        
        # Create stubs
        cls.voice_score_stub = voice_pb2_grpc.VoiceScoreStub(cls.voice_score_channel)
        cls.alignment_stub = alignment_pb2_grpc.AlignmentServiceStub(cls.alignment_channel)
        cls.pronunciation_scorer_stub = pronunciation_scorer_pb2_grpc.PronunciationScorerServiceStub(cls.pronunciation_scorer_channel)
        cls.tts_stub = tts_pb2_grpc.TTSServiceStub(cls.tts_channel)
        
        # Define test phrases
        cls.test_phrases = [
            {"text": "Hello world", "language": "en-US"},
            {"text": "Buenos días", "language": "es-ES"},
            {"text": "Bonjour le monde", "language": "fr-FR"}
        ]
        
        # Generate test audio using TTS service
        cls.test_audio_files = cls._generate_test_audio()
    
    @classmethod
    def _generate_test_audio(cls):
        """Generate test audio files using TTS service."""
        audio_files = []
        
        for phrase in cls.test_phrases:
            try:
                # Call TTS service
                request = tts_pb2.TTSRequest(
                    text=phrase["text"],
                    language_code=phrase["language"],
                    audio_format="wav"
                )
                
                response = cls.tts_stub.GenerateSpeech(request)
                
                if response and response.success and response.audio_data:
                    # Save audio to temporary file
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                        f.write(response.audio_data)
                        audio_files.append({
                            "file_path": f.name,
                            "text": phrase["text"],
                            "language": phrase["language"],
                            "audio_bytes": response.audio_data
                        })
                        print(f"Generated test audio for '{phrase['text']}' at {f.name}")
                else:
                    print(f"Warning: Failed to generate TTS audio for '{phrase['text']}'")
            except Exception as e:
                print(f"Error generating TTS audio for '{phrase['text']}': {e}")
        
        return audio_files
    
    @classmethod
    def tearDownClass(cls):
        """Clean up resources after tests."""
        # Close channels
        cls.voice_score_channel.close()
        cls.alignment_channel.close()
        cls.pronunciation_scorer_channel.close()
        cls.tts_channel.close()
        
        # Delete temporary audio files
        for audio_file in cls.test_audio_files:
            try:
                os.remove(audio_file["file_path"])
            except Exception as e:
                print(f"Error removing temporary file {audio_file['file_path']}: {e}")
    
    def test_health_checks(self):
        """Test health check endpoints for all services."""
        # Voice Score Service
        try:
            response = self.voice_score_stub.HealthCheck(voice_pb2.HealthCheckRequest())
            self.assertTrue(response.status, f"Voice Score service health check failed: {response.message}")
            print(f"Voice Score service status: {response.message}")
        except Exception as e:
            self.fail(f"Voice Score health check failed with exception: {e}")
        
        # Alignment Service
        try:
            response = self.alignment_stub.HealthCheck(alignment_pb2.HealthCheckRequest())
            self.assertTrue(response.status, f"Alignment service health check failed: {response.message}")
            print(f"Alignment service status: {response.message}")
        except Exception as e:
            self.fail(f"Alignment health check failed with exception: {e}")
        
        # Pronunciation Scorer Service
        try:
            response = self.pronunciation_scorer_stub.HealthCheck(pronunciation_scorer_pb2.HealthCheckRequest())
            self.assertTrue(response.status, f"Pronunciation Scorer service health check failed: {response.message}")
            print(f"Pronunciation Scorer service status: {response.message}")
        except Exception as e:
            self.fail(f"Pronunciation Scorer health check failed with exception: {e}")
        
        # TTS Service
        try:
            response = self.tts_stub.HealthCheck(tts_pb2.HealthCheckRequest())
            self.assertTrue(response.status, f"TTS service health check failed: {response.message}")
            print(f"TTS service status: {response.message}")
        except Exception as e:
            self.fail(f"TTS health check failed with exception: {e}")
    
    def test_detailed_evaluation_pipeline(self):
        """Test the entire pronunciation assessment pipeline with detailed evaluation."""
        # Skip if no test audio files
        if not self.test_audio_files:
            self.skipTest("No test audio files available")
        
        for audio_file in self.test_audio_files:
            try:
                # Create detailed evaluation request
                request = voice_pb2.DetailedEvalRequest(
                    audio=audio_file["audio_bytes"],
                    expected_phrase=audio_file["text"],
                    language_code=audio_file["language"],
                    detail_level="phoneme"
                )
                
                # Call voice score service
                print(f"Testing detailed evaluation for '{audio_file['text']}' in {audio_file['language']}")
                response = self.voice_score_stub.EvaluateDetailed(request)
                
                # Validate response
                self.assertIsNotNone(response)
                self.assertGreater(response.overall_score, 0)
                self.assertIsNotNone(response.transcript)
                self.assertTrue(hasattr(response, 'words'))
                self.assertTrue(hasattr(response, 'phonemes'))
                
                # Validate that word details exist if we requested phoneme level
                if request.detail_level == "phoneme" or request.detail_level == "word":
                    self.assertGreater(len(response.words), 0, "Expected word details in response")
                
                # Validate that phoneme details exist if we requested phoneme level
                if request.detail_level == "phoneme":
                    self.assertGreater(len(response.phonemes), 0, "Expected phoneme details in response")
                
                # Validate references to underlying service results
                self.assertTrue(response.alignment_id, "Missing alignment ID")
                self.assertTrue(response.scoring_id, "Missing scoring ID")
                
                print(f"Evaluation result: Score={response.overall_score:.2f}, Pass={response.pass_}")
                print(f"Found {len(response.words)} words and {len(response.phonemes)} phonemes")
                
            except Exception as e:
                self.fail(f"Detailed evaluation failed with exception: {e}")
    
    def test_alignment_service_direct(self):
        """Test the alignment service directly."""
        # Skip if no test audio files
        if not self.test_audio_files:
            self.skipTest("No test audio files available")
        
        for audio_file in self.test_audio_files[:1]:  # Just test first file to save time
            try:
                # Create alignment request
                request = alignment_pb2.AlignmentRequest(
                    audio_data=audio_file["audio_bytes"],
                    text=audio_file["text"],
                    language_code=audio_file["language"],
                    audio_format="wav",
                    alignment_level="phoneme"
                )
                
                # Call alignment service
                print(f"Testing alignment for '{audio_file['text']}' in {audio_file['language']}")
                response = self.alignment_stub.AlignText(request)
                
                # Validate response
                self.assertTrue(response.success)
                self.assertGreater(len(response.word_alignments), 0)
                self.assertGreater(len(response.phoneme_alignments), 0)
                self.assertTrue(response.alignment_id)
                
                print(f"Alignment result: {len(response.word_alignments)} words, {len(response.phoneme_alignments)} phonemes")
                
            except Exception as e:
                self.fail(f"Alignment service test failed with exception: {e}")
    
    def test_pronunciation_scorer_direct(self):
        """Test the pronunciation scorer service directly."""
        # Skip if no test audio files
        if not self.test_audio_files:
            self.skipTest("No test audio files available")
        
        for audio_file in self.test_audio_files[:1]:  # Just test first file to save time
            try:
                # First get alignments
                align_request = alignment_pb2.AlignmentRequest(
                    audio_data=audio_file["audio_bytes"],
                    text=audio_file["text"],
                    language_code=audio_file["language"],
                    audio_format="wav",
                    alignment_level="phoneme"
                )
                
                align_response = self.alignment_stub.AlignText(align_request)
                
                # Create pronunciation scoring request with alignments
                alignment = pronunciation_scorer_pb2.Alignment()
                
                # Add word alignments
                for wa in align_response.word_alignments:
                    word_alignment = alignment.word_alignments.add()
                    word_alignment.word = wa.word
                    word_alignment.start_time = wa.start_time
                    word_alignment.end_time = wa.end_time
                    word_alignment.confidence = wa.confidence
                
                # Add phoneme alignments
                for pa in align_response.phoneme_alignments:
                    phoneme_alignment = alignment.phoneme_alignments.add()
                    phoneme_alignment.phoneme = pa.phoneme
                    phoneme_alignment.start_time = pa.start_time
                    phoneme_alignment.end_time = pa.end_time
                    phoneme_alignment.confidence = pa.confidence
                    phoneme_alignment.word = pa.word
                
                request = pronunciation_scorer_pb2.ScoringRequest(
                    audio_data=audio_file["audio_bytes"],
                    text=audio_file["text"],
                    language_code=audio_file["language"],
                    audio_format="wav",
                    alignments=[alignment],
                    scoring_level="phoneme"
                )
                
                # Call pronunciation scorer service
                print(f"Testing scoring for '{audio_file['text']}' in {audio_file['language']}")
                response = self.pronunciation_scorer_stub.ScorePronunciation(request)
                
                # Validate response
                self.assertTrue(response.success)
                self.assertIsNotNone(response.overall_score)
                self.assertGreater(response.overall_score.score, 0)
                self.assertGreater(len(response.word_scores), 0)
                self.assertGreater(len(response.phoneme_scores), 0)
                self.assertTrue(response.scoring_id)
                
                print(f"Scoring result: {response.overall_score.score:.2f}, {len(response.word_scores)} words, {len(response.phoneme_scores)} phonemes")
                
            except Exception as e:
                self.fail(f"Pronunciation scorer test failed with exception: {e}")
    
    def test_end_to_end_workflow(self):
        """Test the complete end-to-end workflow with all services."""
        for phrase in self.test_phrases[:1]:  # Just test first phrase to save time
            try:
                # Step 1: Generate speech with TTS
                tts_request = tts_pb2.TTSRequest(
                    text=phrase["text"],
                    language_code=phrase["language"],
                    audio_format="wav"
                )
                
                print(f"1. Generating TTS audio for '{phrase['text']}'")
                tts_response = self.tts_stub.GenerateSpeech(tts_request)
                self.assertTrue(tts_response.success)
                self.assertIsNotNone(tts_response.audio_data)
                
                # Step 2: Evaluate pronunciation with detailed feedback
                eval_request = voice_pb2.DetailedEvalRequest(
                    audio=tts_response.audio_data,
                    expected_phrase=phrase["text"],
                    language_code=phrase["language"],
                    detail_level="phoneme"
                )
                
                print(f"2. Evaluating pronunciation")
                eval_response = self.voice_score_stub.EvaluateDetailed(eval_request)
                self.assertIsNotNone(eval_response)
                self.assertGreater(eval_response.overall_score, 0)
                
                # Step 3: Get worst-pronounced phoneme
                worst_phoneme = None
                min_score = 101  # Higher than possible score
                
                for phoneme in eval_response.phonemes:
                    if phoneme.score < min_score:
                        min_score = phoneme.score
                        worst_phoneme = phoneme
                
                if worst_phoneme:
                    # Step 4: Generate example pronunciation for the problematic phoneme
                    phoneme_request = tts_pb2.PhonemeAudioRequest(
                        phoneme=worst_phoneme.phoneme,
                        word=worst_phoneme.word,
                        language_code=phrase["language"],
                        audio_format="wav"
                    )
                    
                    print(f"3. Generating example audio for phoneme '{worst_phoneme.phoneme}' in word '{worst_phoneme.word}'")
                    phoneme_response = self.tts_stub.GeneratePhonemeAudio(phoneme_request)
                    self.assertTrue(phoneme_response.success)
                    self.assertIsNotNone(phoneme_response.audio_data)
                
                print("End-to-end test completed successfully")
                
            except Exception as e:
                self.fail(f"End-to-end test failed with exception: {e}")
    
    def test_mock_environment(self):
        """Test with mocked services for offline testing."""
        # Create test request
        request = voice_pb2.DetailedEvalRequest(
            audio=b'mock_audio_bytes',
            expected_phrase="Hello world",
            language_code="en-US",
            detail_level="phoneme"
        )
        
        # Mock alignment service response
        mock_alignment_response = alignment_pb2.AlignmentResponse(
            success=True,
            message="Alignment completed successfully",
            word_alignments=[
                alignment_pb2.WordAlignment(word="Hello", start_time=0.0, end_time=0.5, confidence=0.95),
                alignment_pb2.WordAlignment(word="world", start_time=0.6, end_time=1.0, confidence=0.97)
            ],
            phoneme_alignments=[
                alignment_pb2.PhonemeAlignment(phoneme="HH", start_time=0.0, end_time=0.1, confidence=0.94, word="Hello"),
                alignment_pb2.PhonemeAlignment(phoneme="EH", start_time=0.1, end_time=0.2, confidence=0.93, word="Hello"),
                alignment_pb2.PhonemeAlignment(phoneme="L", start_time=0.2, end_time=0.3, confidence=0.95, word="Hello"),
                alignment_pb2.PhonemeAlignment(phoneme="OW", start_time=0.3, end_time=0.5, confidence=0.92, word="Hello"),
                alignment_pb2.PhonemeAlignment(phoneme="W", start_time=0.6, end_time=0.7, confidence=0.96, word="world"),
                alignment_pb2.PhonemeAlignment(phoneme="ER", start_time=0.7, end_time=0.9, confidence=0.95, word="world"),
                alignment_pb2.PhonemeAlignment(phoneme="L", start_time=0.9, end_time=1.0, confidence=0.94, word="world"),
                alignment_pb2.PhonemeAlignment(phoneme="D", start_time=1.0, end_time=1.1, confidence=0.93, word="world")
            ],
            alignment_id="mock-alignment-123"
        )
        
        # Mock pronunciation scorer response
        mock_pronunciation_score = pronunciation_scorer_pb2.PronunciationScore(
            score=85.5,
            feedback=["Good pronunciation overall", "Work on the 'r' sound"]
        )
        
        mock_word_scores = [
            pronunciation_scorer_pb2.WordScore(
                word="Hello", score=90.0, issues=["Good"], start_time=0.0, end_time=0.5
            ),
            pronunciation_scorer_pb2.WordScore(
                word="world", score=81.0, issues=["'r' sound needs work"], start_time=0.6, end_time=1.0
            )
        ]
        
        mock_phoneme_scores = [
            pronunciation_scorer_pb2.PhonemeScore(
                phoneme="HH", word="Hello", score=92.0, issue="", start_time=0.0, end_time=0.1
            ),
            pronunciation_scorer_pb2.PhonemeScore(
                phoneme="EH", word="Hello", score=93.0, issue="", start_time=0.1, end_time=0.2
            ),
            pronunciation_scorer_pb2.PhonemeScore(
                phoneme="L", word="Hello", score=91.0, issue="", start_time=0.2, end_time=0.3
            ),
            pronunciation_scorer_pb2.PhonemeScore(
                phoneme="OW", word="Hello", score=89.0, issue="", start_time=0.3, end_time=0.5
            ),
            pronunciation_scorer_pb2.PhonemeScore(
                phoneme="W", word="world", score=88.0, issue="", start_time=0.6, end_time=0.7
            ),
            pronunciation_scorer_pb2.PhonemeScore(
                phoneme="ER", word="world", score=75.0, issue="'r' sound is too weak", start_time=0.7, end_time=0.9
            ),
            pronunciation_scorer_pb2.PhonemeScore(
                phoneme="L", word="world", score=85.0, issue="", start_time=0.9, end_time=1.0
            ),
            pronunciation_scorer_pb2.PhonemeScore(
                phoneme="D", word="world", score=84.0, issue="", start_time=1.0, end_time=1.1
            )
        ]
        
        mock_scoring_response = pronunciation_scorer_pb2.ScoringResponse(
            success=True,
            message="Scoring completed successfully",
            overall_score=mock_pronunciation_score,
            word_scores=mock_word_scores,
            phoneme_scores=mock_phoneme_scores,
            scoring_id="mock-scoring-456"
        )
        
        # Create mock stubs
        with mock.patch.object(
            self.alignment_stub, 'AlignText', return_value=mock_alignment_response
        ), mock.patch.object(
            self.pronunciation_scorer_stub, 'ScorePronunciation', return_value=mock_scoring_response
        ):
            # Test voice score with mocked dependencies
            response = self.voice_score_stub.EvaluateDetailed(request)
            
            # Validate response
            self.assertIsNotNone(response)
            self.assertGreater(response.overall_score, 0)
            self.assertEqual(response.alignment_id, "mock-alignment-123")
            self.assertEqual(response.scoring_id, "mock-scoring-456")
            
            # Validate word details
            self.assertEqual(len(response.words), 2)
            self.assertEqual(response.words[0].word, "Hello")
            self.assertEqual(response.words[1].word, "world")
            
            # Validate phoneme details
            self.assertGreaterEqual(len(response.phonemes), 2)
            
            print("Mock test completed successfully")

if __name__ == '__main__':
    unittest.main()
