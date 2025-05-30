"""
MongoDB storage module for TTS service.

This module provides MongoDB-based storage mechanisms for audio data 
and caching functionality for the TTS service.
"""

import os
import time
import hashlib
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
import pymongo

from app.config import Config

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MongoDBClient:
    """
    Shared MongoDB client to reuse connections.
    """
    
    _instance = None
    client = None
    db = None
    
    @classmethod
    def get_instance(cls):
        """Get or create the MongoDB client instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def __init__(self):
        """Initialize MongoDB connection."""
        if MongoDBClient.client is not None:
            return
        
        uri = os.environ.get('MONGO_URI', 'mongodb://localhost:27017')
        db_name = os.environ.get('MONGO_DB_NAME', 'yap')
        
        # Log the connection details (with sensitive info masked)
        masked_uri = uri.replace("//(.*):(.*)@", "//***:***@")
        logger.info(f"MongoDB connecting to: {masked_uri}")
        logger.info(f"MongoDB database: {db_name}")
        
        try:
            # Connect with connection pooling
            MongoDBClient.client = pymongo.MongoClient(
                uri,
                retryWrites=True,
                w="majority"
            )
            
            # Get database
            MongoDBClient.db = MongoDBClient.client[db_name]
            
            # Verify connection
            MongoDBClient.client.admin.command('ping')
            logger.info("MongoDB connection successful")
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {str(e)}")
            MongoDBClient.client = None
            MongoDBClient.db = None
    
    def get_db(self):
        """Get the database instance."""
        return MongoDBClient.db


class MongoDBCache:
    """
    Cache implementation using MongoDB.
    """
    
    def __init__(self, collection_name: str = None):
        """
        Initialize the MongoDB cache.
        
        Args:
            collection_name: MongoDB collection name for caching
        """
        self.collection_name = collection_name or "tts_cache"
        mongo_client = MongoDBClient.get_instance()
        self.db = mongo_client.get_db()
        
        if self.db is not None:
            self.collection = self.db[self.collection_name]
            
            # Create TTL index for cache expiration if it doesn't exist
            existing_indexes = self.collection.index_information()
            if 'expiry_time_ttl' not in existing_indexes:
                self.collection.create_index(
                    [("expiry_time", pymongo.ASCENDING)],
                    expireAfterSeconds=0,
                    name="expiry_time_ttl"
                )
            logger.info(f"Initialized MongoDB cache with collection: {self.collection_name}")
        else:
            self.collection = None
            logger.error("Failed to initialize MongoDB cache: no database connection")
    
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
        Get an item from the MongoDB cache if it exists and is not expired.
        
        Args:
            key: Cache key
            
        Returns:
            Optional[Dict[str, Any]]: Cached item or None if not found or expired
        """
        if not self.collection:
            logger.error("MongoDB collection not available")
            return None
        
        try:
            # Query for item
            item = self.collection.find_one({"cache_key": key})
            
            if not item:
                logger.debug(f"Cache miss for key: {key}")
                return None
            
            # Remove MongoDB _id field
            if '_id' in item:
                del item['_id']
                
            # Remove expiry_time field as it's only for MongoDB TTL
            if 'expiry_time' in item:
                del item['expiry_time']
                
            logger.debug(f"Cache hit for key: {key}")
            return item
        except Exception as e:
            logger.error(f"Error getting item from MongoDB cache: {str(e)}")
            return None
    
    def put(self, key: str, data: Dict[str, Any], ttl_seconds: int = None) -> bool:
        """
        Put an item in the MongoDB cache with TTL.
        
        Args:
            key: Cache key
            data: Data to cache
            ttl_seconds: Time-to-live for the item in seconds
            
        Returns:
            bool: True if successful, False otherwise
        """
        if not self.collection:
            logger.error("MongoDB collection not available")
            return False
        
        try:
            ttl = ttl_seconds or Config.CACHE_TTL_SECONDS
            expiry_time = datetime.utcnow().replace(microsecond=0)  # MongoDB TTL precision is in seconds
            
            # Prepare document
            document = {
                "cache_key": key,
                "expiry_time": expiry_time,
            }
            document.update(data)
            
            # Upsert document (update if exists, insert if not)
            self.collection.update_one(
                {"cache_key": key},
                {"$set": document},
                upsert=True
            )
            
            logger.debug(f"Added/updated item in MongoDB cache with key: {key}")
            return True
        except Exception as e:
            logger.error(f"Error putting item in MongoDB cache: {str(e)}")
            return False
    
    def delete(self, key: str) -> bool:
        """
        Delete an item from the MongoDB cache.
        
        Args:
            key: Cache key
            
        Returns:
            bool: True if successful, False otherwise
        """
        if not self.collection:
            logger.error("MongoDB collection not available")
            return False
        
        try:
            result = self.collection.delete_one({"cache_key": key})
            if result.deleted_count > 0:
                logger.debug(f"Deleted item from MongoDB cache with key: {key}")
                return True
            else:
                logger.debug(f"Item not found in MongoDB cache with key: {key}")
                return False
        except Exception as e:
            logger.error(f"Error deleting item from MongoDB cache: {str(e)}")
            return False
    
    def clear(self) -> bool:
        """
        Clear all items from the MongoDB cache.
        
        Returns:
            bool: True if successful, False otherwise
        """
        if not self.collection:
            logger.error("MongoDB collection not available")
            return False
        
        try:
            self.collection.delete_many({})
            logger.info(f"Cleared all items from MongoDB cache: {self.collection_name}")
            return True
        except Exception as e:
            logger.error(f"Error clearing MongoDB cache: {str(e)}")
            return False


class MongoDBStorage:
    """
    Storage implementation using MongoDB GridFS for audio data.
    """
    
    def __init__(self, collection_prefix: str = None):
        """
        Initialize the MongoDB GridFS storage.
        
        Args:
            collection_prefix: Prefix for GridFS collections
        """
        import gridfs
        
        self.collection_prefix = collection_prefix or "tts_audio"
        mongo_client = MongoDBClient.get_instance()
        self.db = mongo_client.get_db()
        
        if self.db is not None:
            # Initialize GridFS
            self.fs = gridfs.GridFS(self.db, collection=self.collection_prefix)
            logger.info(f"Initialized MongoDB GridFS storage with collection prefix: {self.collection_prefix}")
        else:
            self.fs = None
            logger.error("Failed to initialize MongoDB GridFS storage: no database connection")
    
    def store(self, audio_data: bytes, key: str, audio_format: str) -> str:
        """
        Store audio data in MongoDB GridFS.
        
        Args:
            audio_data: Audio data bytes
            key: Storage key
            audio_format: Audio format
            
        Returns:
            str: Storage URL for the stored audio
        """
        if not self.fs:
            logger.error("MongoDB GridFS not available")
            return None
        
        try:
            # Map audio format to content type
            content_type_map = {
                'mp3': 'audio/mpeg',
                'wav': 'audio/wav',
                'ogg': 'audio/ogg',
                'webm': 'audio/webm'
            }
            content_type = content_type_map.get(audio_format, 'application/octet-stream')
            
            # Create filename with format
            filename = f"{key}.{audio_format}"
            
            # Check if file already exists and delete if it does
            existing = self.fs.find_one({"filename": filename})
            if existing:
                self.fs.delete(existing._id)
                
            # Store the audio data
            file_id = self.fs.put(
                audio_data,
                filename=filename,
                content_type=content_type,
                metadata={
                    "key": key,
                    "format": audio_format,
                    "timestamp": datetime.utcnow()
                }
            )
            
            # Generate URL (using MongoDB ID as reference)
            storage_url = f"mongodb://{self.collection_prefix}/{file_id}"
            logger.info(f"Stored audio in MongoDB GridFS: {filename}")
            
            return storage_url
        except Exception as e:
            logger.error(f"Error storing audio in MongoDB GridFS: {str(e)}")
            return None
    
    def retrieve(self, key: str, audio_format: str) -> Optional[bytes]:
        """
        Retrieve audio data from MongoDB GridFS.
        
        Args:
            key: Storage key
            audio_format: Audio format
            
        Returns:
            Optional[bytes]: Audio data or None if not found
        """
        if not self.fs:
            logger.error("MongoDB GridFS not available")
            return None
        
        try:
            filename = f"{key}.{audio_format}"
            grid_file = self.fs.find_one({"filename": filename})
            
            if not grid_file:
                logger.warning(f"Audio not found in MongoDB GridFS: {filename}")
                return None
                
            audio_data = grid_file.read()
            logger.info(f"Retrieved audio from MongoDB GridFS: {filename}")
            
            return audio_data
        except Exception as e:
            logger.error(f"Error retrieving audio from MongoDB GridFS: {str(e)}")
            return None
