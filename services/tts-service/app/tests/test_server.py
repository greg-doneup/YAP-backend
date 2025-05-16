"""
Test suite for TTS Service gRPC server.
"""

import unittest
import grpc
import time
from unittest.mock import patch, MagicMock
from concurrent import futures

from app.server import TTSService
from proto import tts_pb2, tts_pb2_grpc

class TestTTSService(unittest.TestCase):
    """
    Test cases for the TTS Service gRPC implementation.
    """
    
    def setUp(self):
        """
        Set up the test server and client.
        """
        # Mock provider and cache
        self.mock_provider = MagicMock()
        self.mock_fallback_provider = MagicMock()
        self.mock_cache = MagicMock()
        self.mock_storage = MagicMock()
        
        # Start server
        self.server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
        self.service_instance = TTSService()
        
        # Replace service dependencies with mocks
        self.service_instance.provider = self.mock_provider
        self.service_instance.fallback_provider = self.mock_fallback_provider
        self.service_instance.cache = self.mock_cache
        self.service_instance.storage = self.mock_storage
        
        tts_pb2_grpc.add_TTSServiceServicer_to_server(
            self.service_instance, self.server
        )
        
        # Use a random port
        self.port = self.server.add_insecure_port('[::]:0')
        self.server.start()
        
        # Create a channel
        channel = grpc.insecure_channel(f'localhost:{self.port}')
        self.client = tts_pb2_grpc.TTSServiceStub(channel)
    
    def tearDown(self):
        """
        Clean up after tests.
        """
        self.server.stop(0)
    
    def test_health_check(self):
        """
        Test the health check endpoint.
        """
        response = self.client.HealthCheck(tts_pb2.HealthCheckRequest())
        
        self.assertTrue(response.status)
        self.assertEqual(response.message, "TTS Service is healthy")
    
    def test_generate_speech_cache_hit(self):
        """
        Test speech generation with a cache hit.
        """
        # Set up mock cache to return a hit
        cached_item = {
            'audio_data': b'cached_audio',
            'audio_format': 'mp3',
            'duration': 2.5
        }
        self.mock_cache.generate_key.return_value = 'test_cache_key'
        self.mock_cache.get.return_value = cached_item
        
        # Create request
        request = tts_pb2.TTSRequest(
            text="Hello world",
            language_code="en-US",
            audio_format="mp3",
            speaking_rate=1.0,
            pitch=0.0
        )
        
        # Make request
        response = self.client.GenerateSpeech(request)
        
        # Verify response
        self.assertTrue(response.success)
        self.assertEqual(response.message, "TTS retrieved from cache")
        self.assertEqual(response.audio_data, b'cached_audio')
        self.assertEqual(response.audio_format, 'mp3')
        self.assertEqual(response.duration, 2.5)
        
        # Verify interactions
        self.mock_cache.get.assert_called_once_with('test_cache_key')
        self.mock_provider.synthesize_speech.assert_not_called()
    
    def test_generate_speech_cache_miss(self):
        """
        Test speech generation with a cache miss.
        """
        # Set up mock cache to return a miss
        self.mock_cache.generate_key.return_value = 'test_cache_key'
        self.mock_cache.get.return_value = None
        
        # Set up mock provider
        provider_result = {
            'audio_data': b'new_audio',
            'audio_format': 'mp3',
            'duration': 3.0
        }
        self.mock_provider.synthesize_speech.return_value = provider_result
        
        # Create request
        request = tts_pb2.TTSRequest(
            text="Hello world",
            language_code="en-US",
            audio_format="mp3",
            speaking_rate=1.0,
            pitch=0.0
        )
        
        # Make request
        response = self.client.GenerateSpeech(request)
        
        # Verify response
        self.assertTrue(response.success)
        self.assertEqual(response.message, "TTS generation successful")
        self.assertEqual(response.audio_data, b'new_audio')
        self.assertEqual(response.audio_format, 'mp3')
        self.assertEqual(response.duration, 3.0)
        
        # Verify interactions
        self.mock_cache.get.assert_called_once_with('test_cache_key')
        self.mock_provider.synthesize_speech.assert_called_once()
        self.mock_cache.put.assert_called_once()
        
    def test_generate_speech_fallback_provider(self):
        """
        Test speech generation with primary provider failure and fallback success.
        """
        # Set up mock cache to return a miss
        self.mock_cache.generate_key.return_value = 'test_cache_key'
        self.mock_cache.get.return_value = None
        
        # Set up mock primary provider to fail
        self.mock_provider.synthesize_speech.side_effect = Exception("Primary provider failure")
        
        # Set up mock fallback provider
        fallback_result = {
            'audio_data': b'fallback_audio',
            'audio_format': 'mp3',
            'duration': 2.5
        }
        self.mock_fallback_provider.synthesize_speech.return_value = fallback_result
        
        # Create request
        request = tts_pb2.TTSRequest(
            text="Hello world",
            language_code="en-US",
            audio_format="mp3",
            speaking_rate=1.0,
            pitch=0.0
        )
        
        # Make request
        response = self.client.GenerateSpeech(request)
        
        # Verify response
        self.assertTrue(response.success)
        self.assertEqual(response.message, "TTS generation successful using fallback provider")
        self.assertEqual(response.audio_data, b'fallback_audio')
        self.assertEqual(response.audio_format, 'mp3')
        self.assertEqual(response.duration, 2.5)
        
        # Verify interactions
        self.mock_cache.get.assert_called_once_with('test_cache_key')
        self.mock_provider.synthesize_speech.assert_called_once()
        self.mock_fallback_provider.synthesize_speech.assert_called_once()
        self.mock_cache.put.assert_called_once()
        
    def test_generate_speech_both_providers_fail(self):
        """
        Test speech generation with both primary and fallback providers failing.
        """
        # Set up mock cache to return a miss
        self.mock_cache.generate_key.return_value = 'test_cache_key'
        self.mock_cache.get.return_value = None
        
        # Set up both providers to fail
        self.mock_provider.synthesize_speech.side_effect = Exception("Primary provider failure")
        self.mock_fallback_provider.synthesize_speech.side_effect = Exception("Fallback provider failure")
        
        # Create request
        request = tts_pb2.TTSRequest(
            text="Hello world",
            language_code="en-US",
            audio_format="mp3",
            speaking_rate=1.0,
            pitch=0.0
        )
        
        # Make request
        with self.assertRaises(grpc.RpcError) as context:
            self.client.GenerateSpeech(request)
        
        # Verify error status
        self.assertEqual(context.exception.code(), grpc.StatusCode.INTERNAL)
        self.assertIn("Both primary and fallback TTS providers failed", context.exception.details())
        
        # Verify interactions
        self.mock_cache.get.assert_called_once_with('test_cache_key')
        self.mock_provider.synthesize_speech.assert_called_once()
        self.mock_fallback_provider.synthesize_speech.assert_called_once()
        self.mock_cache.put.assert_not_called()
    
    def test_generate_phoneme_audio(self):
        """
        Test phoneme audio generation.
        """
        # Set up mock cache to return a miss
        self.mock_cache.get.return_value = None
        
        # Set up mock provider
        provider_result = {
            'audio_data': b'phoneme_audio',
            'audio_format': 'mp3',
            'duration': 1.5
        }
        self.mock_provider.synthesize_phoneme.return_value = provider_result
        
        # Create request
        request = tts_pb2.PhonemeAudioRequest(
            phoneme="AE",
            word="apple",
            language_code="en-US",
            audio_format="mp3"
        )
        
        # Make request
        response = self.client.GeneratePhonemeAudio(request)
        
        # Verify response
        self.assertTrue(response.success)
        self.assertEqual(response.message, "Phoneme audio generation successful")
        self.assertEqual(response.audio_data, b'phoneme_audio')
        self.assertEqual(response.audio_format, 'mp3')
        self.assertEqual(response.duration, 1.5)
        
        # Verify interactions
        self.mock_cache.get.assert_called_once()
        self.mock_provider.synthesize_phoneme.assert_called_once_with(
            phoneme="AE",
            word="apple",
            language_code="en-US",
            voice_id=None,
            audio_format="mp3"
        )
        self.mock_cache.put.assert_called_once()
    
    def test_list_voices(self):
        """
        Test listing available voices.
        """
        # Set up mock provider
        mock_voices = [
            {
                'voice_id': 'voice1',
                'name': 'Voice 1',
                'language_code': 'en-US',
                'gender': 'FEMALE',
                'neural': True,
                'provider': 'aws',
                'accent': 'american'
            },
            {
                'voice_id': 'voice2',
                'name': 'Voice 2',
                'language_code': 'es-ES',
                'gender': 'MALE',
                'neural': False,
                'provider': 'google',
                'accent': 'spanish'
            }
        ]
        self.mock_provider.list_voices.return_value = mock_voices
        
        # Create request
        request = tts_pb2.ListVoicesRequest(
            language_code="",
            gender="",
            neural_only=False
        )
        
        # Make request
        response = self.client.ListVoices(request)
        
        # Verify response
        self.assertTrue(response.success)
        self.assertEqual(response.message, "Found 2 voices")
        self.assertEqual(len(response.voices), 2)
        self.assertEqual(response.voices[0].voice_id, 'voice1')
        self.assertEqual(response.voices[1].voice_id, 'voice2')
        
        # Verify interactions
        self.mock_provider.list_voices.assert_called_once_with(
            language_code=None,
            gender=None,
            neural_only=False
        )

if __name__ == '__main__':
    unittest.main()
