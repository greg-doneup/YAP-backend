"""
Test suite for TTS Storage module.
"""

import unittest
import os
import tempfile
from unittest.mock import patch, MagicMock

from app.storage import TTSCache, LocalStorage, S3Storage, DynamoDBCache, get_storage, get_cache

class TestTTSCache(unittest.TestCase):
    """
    Test cases for the TTSCache class.
    """
    
    def test_cache_operations(self):
        """
        Test basic cache operations: put, get, and expiration.
        """
        # Create a cache with small TTL for testing
        cache = TTSCache(max_size=5, ttl_seconds=1)
        
        # Test put and get
        cache.put('key1', {'data': 'value1'})
        result = cache.get('key1')
        self.assertEqual(result, {'data': 'value1'})
        
        # Test cache miss
        self.assertIsNone(cache.get('nonexistent_key'))
        
        # Test expiration
        import time
        time.sleep(1.1)  # Sleep longer than the TTL
        self.assertIsNone(cache.get('key1'))
        
        # Test max size
        for i in range(10):  # More than max_size
            cache.put(f'key{i}', {'data': f'value{i}'})
            
        # Ensure cache size is maintained at max_size
        self.assertLessEqual(len(cache.cache), 5)
        
    def test_generate_key(self):
        """
        Test key generation.
        """
        cache = TTSCache()
        
        key1 = cache.generate_key(
            text="Hello world",
            language_code="en-US",
            voice_id="voice1",
            audio_format="mp3",
            speaking_rate=1.0,
            pitch=0.0
        )
        
        key2 = cache.generate_key(
            text="Hello world",
            language_code="en-US",
            voice_id="voice1",
            audio_format="mp3",
            speaking_rate=1.0,
            pitch=0.0
        )
        
        key3 = cache.generate_key(
            text="Hello world",
            language_code="es-ES",  # Changed language
            voice_id="voice1",
            audio_format="mp3",
            speaking_rate=1.0,
            pitch=0.0
        )
        
        # Same parameters should generate same key
        self.assertEqual(key1, key2)
        
        # Different parameters should generate different keys
        self.assertNotEqual(key1, key3)

class TestLocalStorage(unittest.TestCase):
    """
    Test cases for the LocalStorage class.
    """
    
    def test_local_storage(self):
        """
        Test local storage operations.
        """
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = LocalStorage(storage_path=temp_dir)
            
            # Test store
            file_path = storage.store(b'test_audio_data', 'test_key', 'mp3')
            self.assertIsNotNone(file_path)
            
            # Check file exists
            self.assertTrue(os.path.exists(file_path))
            
            # Test retrieve
            data = storage.retrieve('test_key', 'mp3')
            self.assertEqual(data, b'test_audio_data')
            
            # Test retrieve with non-existent key
            self.assertIsNone(storage.retrieve('nonexistent_key', 'mp3'))

class TestS3Storage(unittest.TestCase):
    """
    Test cases for the S3Storage class.
    """
    
    @patch('app.storage.boto3')
    def test_s3_storage(self, mock_boto3):
        """
        Test S3 storage operations with mocked AWS SDK.
        """
        # Mock S3 client
        mock_s3 = MagicMock()
        mock_boto3.client.return_value = mock_s3
        
        # Create storage instance
        storage = S3Storage(bucket_name='test-bucket', region='us-west-2')
        
        # Test store
        mock_s3.put_object.return_value = {'ETag': 'test-etag'}
        url = storage.store(b'test_audio_data', 'test_key', 'mp3')
        
        # Verify URL format
        self.assertEqual(url, 'https://test-bucket.s3.us-west-2.amazonaws.com/tts/test_key.mp3')
        
        # Verify put_object was called with correct parameters
        mock_s3.put_object.assert_called_once_with(
            Body=b'test_audio_data',
            Bucket='test-bucket',
            Key='tts/test_key.mp3',
            ContentType='audio/mpeg'
        )
        
        # Test retrieve
        mock_body = MagicMock()
        mock_body.read.return_value = b'retrieved_audio_data'
        mock_s3.get_object.return_value = {'Body': mock_body}
        
        data = storage.retrieve('test_key', 'mp3')
        self.assertEqual(data, b'retrieved_audio_data')
        
        # Verify get_object was called with correct parameters
        mock_s3.get_object.assert_called_once_with(
            Bucket='test-bucket',
            Key='tts/test_key.mp3'
        )

class TestFactory(unittest.TestCase):
    """
    Test the storage and cache factory functions.
    """
    
    @patch('app.storage.Config')
    def test_get_storage(self, mock_config):
        """
        Test the get_storage factory function.
        """
        # Test with S3 enabled
        mock_config.STORAGE_ENABLED = True
        mock_config.USE_AWS_POLLY = True
        
        storage = get_storage()
        self.assertIsInstance(storage, S3Storage)
        
        # Test with S3 disabled
        mock_config.STORAGE_ENABLED = False
        
        storage = get_storage()
        self.assertIsInstance(storage, LocalStorage)
    
    @patch('app.storage.Config')
    def test_get_cache(self, mock_config):
        """
        Test the get_cache factory function.
        """
        # Test with DynamoDB enabled
        mock_config.STORAGE_ENABLED = True
        mock_config.USE_AWS_POLLY = True
        mock_config.CACHE_MAX_SIZE = 100
        mock_config.CACHE_TTL_SECONDS = 300
        
        cache = get_cache()
        self.assertIsInstance(cache, DynamoDBCache)
        
        # Test with local cache
        mock_config.STORAGE_ENABLED = False
        
        cache = get_cache()
        self.assertIsInstance(cache, TTSCache)
        
        # Verify correct parameters
        self.assertEqual(cache.max_size, 100)
        self.assertEqual(cache.ttl_seconds, 300)

if __name__ == '__main__':
    unittest.main()
