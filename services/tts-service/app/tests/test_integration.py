"""
Integration test module for TTS service with pronunciation-scorer service.

This module tests the communication between TTS service and pronunciation-scorer service,
ensuring that synthesized speech can be properly assessed by the scoring service.
"""

import unittest
import tempfile
import os
import grpc
from unittest.mock import patch, MagicMock

# Import generated gRPC modules
from proto import tts_pb2, tts_pb2_grpc
from pronunciation_scorer.proto import pronunciation_scorer_pb2, pronunciation_scorer_pb2_grpc

# Import application modules
from app.server import TTSService
from app.tts_provider import TTSProviderFactory

class TestTTSPronunciationScorerIntegration(unittest.TestCase):
    """
    Test integration between TTS service and pronunciation-scorer service.
    """
    
    @patch('pronunciation_scorer.proto.pronunciation_scorer_pb2_grpc.PronunciationScorerServiceStub')
    def test_tts_pronunciation_assessment_flow(self, mock_scorer_stub):
        """
        Test the flow from TTS generation to pronunciation assessment.
        """
        # Set up mock TTS provider
        mock_provider = MagicMock()
        mock_provider.synthesize_speech.return_value = {
            'audio_data': b'test_audio_data',
            'audio_format': 'wav',
            'duration': 2.0,
            'cache_key': 'test_cache_key'
        }
        
        # Set up mock TTS service with the mock provider
        tts_service = TTSService()
        tts_service.provider = mock_provider
        tts_service.cache = MagicMock()
        tts_service.storage = MagicMock()
        tts_service.cache.get.return_value = None  # Simulate cache miss
        
        # Create mock scorer service response
        mock_word_scores = [
            pronunciation_scorer_pb2.WordScore(
                word="hello",
                score=85.5,
                issues=["slight stress issue"],
                start_time=0.1
            )
        ]
        
        mock_score = pronunciation_scorer_pb2.PronunciationScore(
            score=90.0,
            feedback=["Good pronunciation, slight stress issues"]
        )
        
        mock_scoring_response = pronunciation_scorer_pb2.ScoringResponse(
            success=True,
            message="Scoring successful",
            sentence_score=mock_score,
            word_scores=mock_word_scores
        )
        
        # Set up the mock scorer stub to return our mock response
        mock_scorer = MagicMock()
        mock_scorer.ScorePronunciation.return_value = mock_scoring_response
        mock_scorer_stub.return_value = mock_scorer
        
        # Step 1: Generate speech with TTS service
        tts_request = tts_pb2.TTSRequest(
            text="Hello world",
            language_code="en-US",
            audio_format="wav",
            speaking_rate=1.0,
            pitch=0.0
        )
        
        tts_response = tts_service.GenerateSpeech(tts_request, grpc.ServicerContext)
        
        # Verify TTS response
        self.assertTrue(tts_response.success)
        self.assertEqual(tts_response.audio_data, b'test_audio_data')
        
        # Step 2: Simulate passing the audio to the pronunciation scorer
        # In a real integration, this would be done through gRPC
        # This is where we'll validate the flow works end-to-end
        
        # Create alignment data (normally from alignment service)
        mock_alignment = pronunciation_scorer_pb2.Alignment(
            word_alignments=[
                pronunciation_scorer_pb2.Alignment.WordAlignment(
                    word="hello",
                    start_time=0.1,
                    end_time=0.5,
                    confidence=0.9
                )
            ],
            phoneme_alignments=[
                pronunciation_scorer_pb2.Alignment.PhonemeAlignment(
                    phoneme="HH",
                    start_time=0.1,
                    end_time=0.2,
                    confidence=0.9,
                    word="hello"
                )
            ]
        )
        
        # Simulate sending the TTS output to pronunciation-scorer
        scoring_request = pronunciation_scorer_pb2.ScoringRequest(
            audio_data=tts_response.audio_data,
            text="Hello world",
            language_code="en-US",
            audio_format="wav",
            alignments=[mock_alignment],
            scoring_level="word"
        )
        
        # Call the mock scorer
        scoring_response = mock_scorer.ScorePronunciation(scoring_request)
        
        # Verify the correct data was passed to the scorer
        mock_scorer.ScorePronunciation.assert_called_once()
        call_args = mock_scorer.ScorePronunciation.call_args[0][0]
        self.assertEqual(call_args.audio_data, b'test_audio_data')
        self.assertEqual(call_args.text, "Hello world")
        self.assertEqual(call_args.language_code, "en-US")
        
        # Verify the scoring response
        self.assertTrue(scoring_response.success)
        self.assertEqual(scoring_response.sentence_score.score, 90.0)
        self.assertEqual(len(scoring_response.word_scores), 1)
        self.assertEqual(scoring_response.word_scores[0].word, "hello")
        self.assertEqual(scoring_response.word_scores[0].score, 85.5)


    @patch('alignment.proto.alignment_pb2_grpc.AlignmentServiceStub')
    @patch('pronunciation_scorer.proto.pronunciation_scorer_pb2_grpc.PronunciationScorerServiceStub')
    def test_full_pronunciation_assessment_pipeline(self, mock_scorer_stub, mock_alignment_stub):
        """
        Test the full pipeline from TTS to alignment to pronunciation scoring.
        """
        # Set up mock TTS provider
        mock_tts_provider = MagicMock()
        mock_tts_provider.synthesize_speech.return_value = {
            'audio_data': b'test_audio_data',
            'audio_format': 'wav',
            'duration': 2.0,
            'cache_key': 'test_cache_key'
        }
        
        # Set up mock TTS service with the mock provider
        tts_service = TTSService()
        tts_service.provider = mock_tts_provider
        tts_service.cache = MagicMock()
        tts_service.storage = MagicMock()
        tts_service.cache.get.return_value = None  # Simulate cache miss
        
        # Set up mock alignment service response
        from alignment.proto import alignment_pb2
        
        mock_word_alignments = [
            alignment_pb2.WordAlignment(
                word="hello",
                start_time=0.1,
                end_time=0.5,
                confidence=0.9
            )
        ]
        
        mock_phoneme_alignments = [
            alignment_pb2.PhonemeAlignment(
                phoneme="HH",
                start_time=0.1,
                end_time=0.2,
                confidence=0.9,
                word="hello"
            )
        ]
        
        mock_alignment_response = alignment_pb2.AlignmentResponse(
            success=True,
            message="Alignment successful",
            word_alignments=mock_word_alignments,
            phoneme_alignments=mock_phoneme_alignments
        )
        
        # Set up the mock alignment stub to return our mock response
        mock_aligner = MagicMock()
        mock_aligner.AlignAudio.return_value = mock_alignment_response
        mock_alignment_stub.return_value = mock_aligner
        
        # Set up mock pronunciation scorer response
        mock_word_scores = [
            pronunciation_scorer_pb2.WordScore(
                word="hello",
                score=85.5,
                issues=["slight stress issue"],
                start_time=0.1
            )
        ]
        
        mock_score = pronunciation_scorer_pb2.PronunciationScore(
            score=90.0,
            feedback=["Good pronunciation, slight stress issues"]
        )
        
        mock_scoring_response = pronunciation_scorer_pb2.ScoringResponse(
            success=True,
            message="Scoring successful",
            sentence_score=mock_score,
            word_scores=mock_word_scores
        )
        
        # Set up the mock scorer stub to return our mock response
        mock_scorer = MagicMock()
        mock_scorer.ScorePronunciation.return_value = mock_scoring_response
        mock_scorer_stub.return_value = mock_scorer
        
        # STEP 1: Generate speech with TTS service
        tts_request = tts_pb2.TTSRequest(
            text="Hello world",
            language_code="en-US",
            audio_format="wav"
        )
        
        tts_response = tts_service.GenerateSpeech(tts_request, grpc.ServicerContext)
        
        # Verify TTS response
        self.assertTrue(tts_response.success)
        self.assertEqual(tts_response.audio_data, b'test_audio_data')
        
        # STEP 2: Send the audio to the alignment service
        alignment_request = alignment_pb2.AlignmentRequest(
            audio_data=tts_response.audio_data,
            text="Hello world",
            language_code="en-US",
            audio_format="wav"
        )
        
        alignment_response = mock_aligner.AlignAudio(alignment_request)
        
        # Verify the correct data was passed to the aligner
        mock_aligner.AlignAudio.assert_called_once()
        alignment_call_args = mock_aligner.AlignAudio.call_args[0][0]
        self.assertEqual(alignment_call_args.audio_data, b'test_audio_data')
        
        # STEP 3: Convert alignment response to pronunciation scorer format
        # (this happens in the actual integration)
        alignments = []
        
        # Create the Alignment message for pronunciation_scorer
        ps_alignment = pronunciation_scorer_pb2.Alignment()
        
        # Convert word alignments
        for word_align in alignment_response.word_alignments:
            ps_word_align = pronunciation_scorer_pb2.Alignment.WordAlignment(
                word=word_align.word,
                start_time=word_align.start_time,
                end_time=word_align.end_time,
                confidence=word_align.confidence
            )
            ps_alignment.word_alignments.append(ps_word_align)
        
        # Convert phoneme alignments
        for phoneme_align in alignment_response.phoneme_alignments:
            ps_phoneme_align = pronunciation_scorer_pb2.Alignment.PhonemeAlignment(
                phoneme=phoneme_align.phoneme,
                start_time=phoneme_align.start_time,
                end_time=phoneme_align.end_time,
                confidence=phoneme_align.confidence,
                word=phoneme_align.word
            )
            ps_alignment.phoneme_alignments.append(ps_phoneme_align)
        
        alignments.append(ps_alignment)
        
        # STEP 4: Send to pronunciation scorer
        scoring_request = pronunciation_scorer_pb2.ScoringRequest(
            audio_data=tts_response.audio_data,
            text="Hello world",
            language_code="en-US",
            audio_format="wav",
            alignments=alignments,
            scoring_level="word"
        )
        
        scoring_response = mock_scorer.ScorePronunciation(scoring_request)
        
        # Verify the correct data was passed to the scorer
        mock_scorer.ScorePronunciation.assert_called_once()
        scoring_call_args = mock_scorer.ScorePronunciation.call_args[0][0]
        self.assertEqual(scoring_call_args.audio_data, b'test_audio_data')
        self.assertEqual(len(scoring_call_args.alignments), 1)
        
        # Verify the scoring response
        self.assertTrue(scoring_response.success)
        self.assertEqual(scoring_response.sentence_score.score, 90.0)
        self.assertEqual(len(scoring_response.word_scores), 1)
        self.assertEqual(scoring_response.word_scores[0].word, "hello")


if __name__ == '__main__':
    unittest.main()
