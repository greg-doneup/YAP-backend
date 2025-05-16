"""
Test suite for TTS Provider module.
"""

import unittest
import os
from unittest.mock import patch, MagicMock
from app.tts_provider import (
    TTSProvider, MozillaTTSProvider, AWSPollyProvider, 
    AzureTTSProvider, GoogleTTSProvider, TTSProviderFactory
)

class TestTTSProvider(unittest.TestCase):
    """
    Test cases for TTS Provider base class and implementations.
    """
    
    def test_provider_factory(self):
        """
        Test that the TTSProviderFactory returns the correct provider.
        """
        with patch('app.tts_provider.Config') as mock_config:
            # Test Mozilla TTS provider
            mock_config.TTS_PROVIDER = "mozilla"
            provider = TTSProviderFactory.get_provider()
            self.assertIsInstance(provider, MozillaTTSProvider)
            
            # Test AWS Polly provider
            mock_config.TTS_PROVIDER = "aws"
            mock_config.USE_AWS_POLLY = True
            provider = TTSProviderFactory.get_provider()
            self.assertIsInstance(provider, AWSPollyProvider)
            
            # Test Azure TTS provider
            mock_config.TTS_PROVIDER = "azure"
            mock_config.USE_AZURE_TTS = True
            provider = TTSProviderFactory.get_provider()
            self.assertIsInstance(provider, AzureTTSProvider)
            
            # Test Google TTS provider
            mock_config.TTS_PROVIDER = "google"
            mock_config.USE_GOOGLE_TTS = True
            provider = TTSProviderFactory.get_provider()
            self.assertIsInstance(provider, GoogleTTSProvider)
            
            # Test default to Mozilla TTS
            mock_config.TTS_PROVIDER = "unknown"
            provider = TTSProviderFactory.get_provider()
            self.assertIsInstance(provider, MozillaTTSProvider)
    
    def test_fallback_provider_factory(self):
        """
        Test that the TTSProviderFactory returns the correct fallback provider.
        """
        with patch('app.tts_provider.Config') as mock_config:
            # Test AWS Polly as fallback
            mock_config.USE_FALLBACK_PROVIDER = True
            mock_config.FALLBACK_TTS_PROVIDER = "aws"
            mock_config.USE_AWS_POLLY = True
            provider = TTSProviderFactory.get_provider(fallback=True)
            self.assertIsInstance(provider, AWSPollyProvider)
            
            # Test Azure as fallback
            mock_config.USE_FALLBACK_PROVIDER = True
            mock_config.FALLBACK_TTS_PROVIDER = "azure"
            mock_config.USE_AZURE_TTS = True
            provider = TTSProviderFactory.get_provider(fallback=True)
            self.assertIsInstance(provider, AzureTTSProvider)
            
            # Test fallback disabled
            mock_config.USE_FALLBACK_PROVIDER = False
            mock_config.FALLBACK_TTS_PROVIDER = "aws"
            mock_config.USE_AWS_POLLY = True
            mock_config.TTS_PROVIDER = "azure"
            mock_config.USE_AZURE_TTS = True
            provider = TTSProviderFactory.get_provider(fallback=True)
            self.assertIsInstance(provider, AzureTTSProvider)
    
    def test_normalize_language_code(self):
        """
        Test language code normalization.
        """
        provider = MozillaTTSProvider()
        
        # Test normalization of language codes
        self.assertEqual(provider._normalize_language_code("en-US"), "en")
        self.assertEqual(provider._normalize_language_code("es-ES"), "es")
        self.assertEqual(provider._normalize_language_code("fr"), "fr")

class TestMozillaTTSProvider(unittest.TestCase):
    """
    Test cases for Mozilla TTS provider.
    """
    
    @patch('app.tts_provider.Synthesizer')
    def test_synthesis(self, mock_synthesizer):
        """
        Test speech synthesis with Mozilla TTS.
        """
        # Mock the TTS model
        mock_instance = MagicMock()
        mock_instance.tts.return_value = [0.1, 0.2, 0.3]  # Dummy audio data
        mock_synthesizer.return_value = mock_instance
        
        # Create provider instance
        provider = MozillaTTSProvider()
        
        # Mock out the _load_model to avoid actual model loading
        provider._load_model = MagicMock()
        
        # Test synthesize_speech method
        with patch('app.tts_provider.soundfile') as mock_sf, \
             patch('app.tts_provider.AudioSegment') as mock_audio, \
             patch('app.tts_provider.io') as mock_io, \
             patch('app.tts_provider.tempfile.NamedTemporaryFile') as mock_temp:
            
            # Configure mocks
            mock_audio_obj = MagicMock()
            mock_audio.from_file.return_value = mock_audio_obj
            mock_audio_obj._spawn.return_value = mock_audio_obj
            mock_audio_obj.__len__.return_value = 3000  # 3 seconds
            
            mock_output = MagicMock()
            mock_io.BytesIO.return_value = mock_output
            mock_output.getvalue.return_value = b"audio_data"
            
            mock_temp_file = MagicMock()
            mock_temp.return_value.__enter__.return_value = mock_temp_file
            mock_temp_file.name = "temp_file.wav"
            
            # Call the method
            result = provider.synthesize_speech(
                text="Hello world",
                language_code="en-US",
                audio_format="mp3"
            )
            
            # Assert expected results
            self.assertEqual(result["audio_data"], b"audio_data")
            self.assertEqual(result["audio_format"], "mp3")
            self.assertEqual(result["duration"], 3.0)
            self.assertIn("cache_key", result)
            
            # Verify method calls
            provider._load_model.assert_called_once_with("en-US")
            mock_instance.tts.assert_called_once_with("Hello world")
            mock_sf.write.assert_called_once()
            mock_audio.from_file.assert_called_once()
            mock_audio_obj.export.assert_called_once()

class TestAWSPollyProvider(unittest.TestCase):
    """
    Test cases for AWS Polly provider.
    """
    
    @patch('app.tts_provider.boto3')
    def test_synthesis(self, mock_boto3):
        """
        Test speech synthesis with AWS Polly.
        """
        # Mock the AWS client
        mock_polly = MagicMock()
        mock_boto3.client.return_value = mock_polly
        
        # Mock response
        mock_audio_stream = MagicMock()
        mock_audio_stream.read.return_value = b"aws_audio_data"
        
        mock_response = {
            'AudioStream': mock_audio_stream,
            'ContentType': 'audio/mpeg'
        }
        mock_polly.synthesize_speech.return_value = mock_response
        
        # Create provider
        provider = AWSPollyProvider()
        
        # Test method
        result = provider.synthesize_speech(
            text="Hello world",
            language_code="en-US",
            audio_format="mp3"
        )
        
        # Assert expected results
        self.assertEqual(result["audio_data"], b"aws_audio_data")
        self.assertEqual(result["audio_format"], "mp3")
        self.assertGreater(result["duration"], 0)
        self.assertIn("cache_key", result)
        
        # Verify method calls
        mock_boto3.client.assert_called_once_with('polly', region_name='us-east-1')
        mock_polly.synthesize_speech.assert_called_once()

if __name__ == '__main__':
    unittest.main()
