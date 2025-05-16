"""
Storage module for TTS service.

This module provides storage mechanisms for audio files and caching functionality
to improve performance and reduce duplicate synthesis operations.
"""

import os
import time
import hashlib
import logging
from typing import Dict, Any, Optional, BinaryIO, List, Tuple
import tempfile
import boto3
from botocore.exceptions import ClientError

from app.config import Config

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TTSCache:
    """
    Cache for TTS audio to avoid regenerating the same content.
    """
    
    def __init__(self, max_size: int = 1000, ttl_seconds: int = 86400):
        """
        Initialize the TTS cache.
        
        Args:
            max_size: Maximum number of items in the cache
            ttl_seconds: Time-to-live for cache items in seconds
        """
        self.cache = {}  # Dictionary to hold cached audio data
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        logger.info(f"Initialized TTS cache with max_size={max_size}, ttl_seconds={ttl_seconds}")
        
    def generate_key(self, text: str, language_code: str, voice_id: str, 
                    audio_format: str, speaking_rate: float, pitch: float) -> str:
        """
        Generate a unique key for the cache based on the request parameters.
        
        Args:
            text: Text to synthesize
            language_code: Language code
            voice_id: Voice ID
            audio_format: Audio format
            speaking_rate: Speaking rate
            pitch: Voice pitch
            
        Returns:
            str: Unique cache key
        """
        # Create a string representation of all parameters
        key_string = f"{text}|{language_code}|{voice_id}|{audio_format}|{speaking_rate}|{pitch}"
        
        # Create a hash of the string for a shorter key
        hash_key = hashlib.md5(key_string.encode('utf-8')).hexdigest()
        
        return hash_key
    
    def get(self, key: str) -> Optional[Dict[str, Any]]:
        """
        Get an item from the cache if it exists and is not expired.
        
        Args:
            key: Cache key
            
        Returns:
            Optional[Dict[str, Any]]: Cached item or None if not found or expired
        """
        if key not in self.cache:
            logger.debug(f"Cache miss for key: {key}")
            return None
        
        cached_item = self.cache[key]
        
        # Check if the item has expired
        if time.time() - cached_item['timestamp'] > self.ttl_seconds:
            logger.debug(f"Cache item expired for key: {key}")
            del self.cache[key]
            return None
        
        logger.debug(f"Cache hit for key: {key}")
        return cached_item['data']
    
    def put(self, key: str, data: Dict[str, Any]) -> None:
        """
        Put an item in the cache.
        
        Args:
            key: Cache key
            data: Data to cache
        """
        # If cache is full, remove oldest item
        if len(self.cache) >= self.max_size:
            oldest_key = min(self.cache.keys(), key=lambda k: self.cache[k]['timestamp'])
            del self.cache[oldest_key]
            logger.debug(f"Cache full, removed oldest item with key: {oldest_key}")
        
        # Add new item to cache
        self.cache[key] = {
            'data': data,
            'timestamp': time.time()
        }
        logger.debug(f"Added item to cache with key: {key}")
    
    def clear(self) -> None:
        """
        Clear the cache.
        """
        self.cache = {}
        logger.info("Cache cleared")


class S3Storage:
    """
    Storage implementation using AWS S3.
    """
    
    def __init__(self, bucket_name: str = None, region: str = None):
        """
        Initialize the S3 storage.
        
        Args:
            bucket_name: S3 bucket name
            region: AWS region
        """
        self.bucket_name = bucket_name or Config.S3_BUCKET_NAME
        self.region = region or Config.AWS_REGION
        
        try:
            self.s3_client = boto3.client('s3', region_name=self.region)
            logger.info(f"Initialized S3 storage with bucket: {self.bucket_name}")
        except Exception as e:
            logger.error(f"Error initializing S3 client: {str(e)}")
            self.s3_client = None
    
    def store(self, audio_data: bytes, key: str, audio_format: str) -> str:
        """
        Store audio data in S3.
        
        Args:
            audio_data: Audio data bytes
            key: Storage key
            audio_format: Audio format
            
        Returns:
            str: S3 URL for the stored audio
        """
        if self.s3_client is None:
            logger.error("S3 client not initialized")
            return None
        
        try:
            # Add audio format as extension to the key
            s3_key = f"tts/{key}.{audio_format}"
            
            # Set appropriate content type
            content_type_map = {
                'mp3': 'audio/mpeg',
                'wav': 'audio/wav',
                'ogg': 'audio/ogg'
            }
            content_type = content_type_map.get(audio_format, 'application/octet-stream')
            
            # Upload to S3
            self.s3_client.put_object(
                Body=audio_data,
                Bucket=self.bucket_name,
                Key=s3_key,
                ContentType=content_type
            )
            
            # Generate the URL
            url = f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{s3_key}"
            logger.info(f"Stored audio in S3: {url}")
            
            return url
        except Exception as e:
            logger.error(f"Error storing audio in S3: {str(e)}")
            return None
    
    def retrieve(self, key: str, audio_format: str) -> Optional[bytes]:
        """
        Retrieve audio data from S3.
        
        Args:
            key: Storage key
            audio_format: Audio format
            
        Returns:
            Optional[bytes]: Audio data or None if not found
        """
        if self.s3_client is None:
            logger.error("S3 client not initialized")
            return None
        
        try:
            s3_key = f"tts/{key}.{audio_format}"
            
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            
            audio_data = response['Body'].read()
            logger.info(f"Retrieved audio from S3: {s3_key}")
            
            return audio_data
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                logger.warning(f"Audio not found in S3: {s3_key}")
            else:
                logger.error(f"Error retrieving audio from S3: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"Error retrieving audio from S3: {str(e)}")
            return None


class LocalStorage:
    """
    Storage implementation using local filesystem.
    """
    
    def __init__(self, storage_path: str = None):
        """
        Initialize the local storage.
        
        Args:
            storage_path: Path to store audio files
        """
        self.storage_path = storage_path or os.path.join(tempfile.gettempdir(), "yap_tts_cache")
        
        # Create directory if it doesn't exist
        if not os.path.exists(self.storage_path):
            os.makedirs(self.storage_path)
            
        logger.info(f"Initialized local storage at: {self.storage_path}")
    
    def store(self, audio_data: bytes, key: str, audio_format: str) -> str:
        """
        Store audio data in local filesystem.
        
        Args:
            audio_data: Audio data bytes
            key: Storage key
            audio_format: Audio format
            
        Returns:
            str: File path for the stored audio
        """
        try:
            file_path = os.path.join(self.storage_path, f"{key}.{audio_format}")
            
            with open(file_path, "wb") as f:
                f.write(audio_data)
                
            logger.info(f"Stored audio locally: {file_path}")
            return file_path
        except Exception as e:
            logger.error(f"Error storing audio locally: {str(e)}")
            return None
    
    def retrieve(self, key: str, audio_format: str) -> Optional[bytes]:
        """
        Retrieve audio data from local filesystem.
        
        Args:
            key: Storage key
            audio_format: Audio format
            
        Returns:
            Optional[bytes]: Audio data or None if not found
        """
        try:
            file_path = os.path.join(self.storage_path, f"{key}.{audio_format}")
            
            if not os.path.exists(file_path):
                logger.warning(f"Audio not found locally: {file_path}")
                return None
                
            with open(file_path, "rb") as f:
                audio_data = f.read()
                
            logger.info(f"Retrieved audio locally: {file_path}")
            return audio_data
        except Exception as e:
            logger.error(f"Error retrieving audio locally: {str(e)}")
            return None


class DynamoDBCache:
    """
    Cache implementation using AWS DynamoDB.
    """
    
    def __init__(self, table_name: str = None, region: str = None):
        """
        Initialize the DynamoDB cache.
        
        Args:
            table_name: DynamoDB table name
            region: AWS region
        """
        self.table_name = table_name or Config.DYNAMODB_TABLE
        self.region = region or Config.AWS_REGION
        
        try:
            self.dynamodb = boto3.resource('dynamodb', region_name=self.region)
            self.table = self.dynamodb.Table(self.table_name)
            logger.info(f"Initialized DynamoDB cache with table: {self.table_name}")
        except Exception as e:
            logger.error(f"Error initializing DynamoDB: {str(e)}")
            self.dynamodb = None
            self.table = None
    
    def get(self, key: str) -> Optional[Dict[str, Any]]:
        """
        Get an item from DynamoDB.
        
        Args:
            key: Cache key
            
        Returns:
            Optional[Dict[str, Any]]: Cached metadata or None if not found
        """
        if self.table is None:
            logger.error("DynamoDB table not initialized")
            return None
        
        try:
            response = self.table.get_item(Key={'cache_key': key})
            
            if 'Item' not in response:
                logger.debug(f"DynamoDB cache miss for key: {key}")
                return None
                
            item = response['Item']
            
            # Check if the item has expired
            if 'expiry_time' in item and int(item['expiry_time']) < int(time.time()):
                logger.debug(f"DynamoDB cache item expired for key: {key}")
                return None
                
            logger.debug(f"DynamoDB cache hit for key: {key}")
            return item
        except Exception as e:
            logger.error(f"Error getting item from DynamoDB: {str(e)}")
            return None
    
    def put(self, key: str, metadata: Dict[str, Any], ttl_seconds: int = None) -> bool:
        """
        Put an item in DynamoDB.
        
        Args:
            key: Cache key
            metadata: Metadata to cache
            ttl_seconds: Time-to-live for the item in seconds
            
        Returns:
            bool: True if successful, False otherwise
        """
        if self.table is None:
            logger.error("DynamoDB table not initialized")
            return False
        
        try:
            ttl = ttl_seconds or Config.CACHE_TTL_SECONDS
            expiry_time = int(time.time()) + ttl
            
            item = {
                'cache_key': key,
                'expiry_time': expiry_time
            }
            item.update(metadata)
            
            self.table.put_item(Item=item)
            logger.debug(f"Added item to DynamoDB with key: {key}")
            return True
        except Exception as e:
            logger.error(f"Error putting item in DynamoDB: {str(e)}")
            return False


# Import MongoDB implementations if needed, but keep imports inside functions
# to avoid circular imports and provide lazy loading
def _get_mongodb_cache():
    """
    Get MongoDB cache implementation.
    
    Returns:
        MongoDBCache: MongoDB cache implementation
    """
    from app.mongodb_storage import MongoDBCache
    return MongoDBCache()

def _get_mongodb_storage():
    """
    Get MongoDB storage implementation.
    
    Returns:
        MongoDBStorage: MongoDB storage implementation
    """
    from app.mongodb_storage import MongoDBStorage
    return MongoDBStorage()

# Factory function to get the appropriate storage implementation
def get_storage():
    """
    Get the appropriate storage implementation based on configuration.
    
    Returns:
        Union[S3Storage, LocalStorage, MongoDBStorage]: Storage implementation
    """
    if Config.MONGODB_ENABLED:
        return _get_mongodb_storage()
    elif Config.STORAGE_ENABLED and Config.USE_AWS_POLLY:
        return S3Storage()
    else:
        return LocalStorage()

# Factory function to get the appropriate cache implementation
def get_cache():
    """
    Get the appropriate cache implementation based on configuration.
    
    Returns:
        Union[TTSCache, DynamoDBCache, MongoDBCache]: Cache implementation
    """
    if Config.MONGODB_ENABLED:
        return _get_mongodb_cache()
    elif Config.STORAGE_ENABLED and Config.USE_AWS_POLLY:
        return DynamoDBCache()
    else:
        return TTSCache(max_size=Config.CACHE_MAX_SIZE, ttl_seconds=Config.CACHE_TTL_SECONDS)
