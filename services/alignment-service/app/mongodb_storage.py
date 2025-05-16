"""
MongoDB storage module for alignment service.

This module provides MongoDB-based storage mechanisms for alignment data.
"""

import json
import logging
import os
from typing import Dict, Any, Optional
from datetime import datetime
import pymongo

# Configure logging
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


class MongoDBStorage:
    """
    MongoDB implementation for alignment storage.
    """
    
    def __init__(self, collection_name: str = None):
        """
        Initialize MongoDB alignment storage.
        
        Args:
            collection_name: MongoDB collection name for alignment storage
        """
        self.collection_name = collection_name or "alignments"
        mongo_client = MongoDBClient.get_instance()
        self.db = mongo_client.get_db()
        
        if self.db:
            self.collection = self.db[self.collection_name]
            
            # Create index on alignment_id for faster lookups
            existing_indexes = self.collection.index_information()
            if 'alignment_id_index' not in existing_indexes:
                self.collection.create_index(
                    [("alignment_id", pymongo.ASCENDING)],
                    unique=True,
                    name="alignment_id_index"
                )
            logger.info(f"Initialized MongoDB storage with collection: {self.collection_name}")
        else:
            self.collection = None
            logger.error("Failed to initialize MongoDB storage: no database connection")
    
    def store_alignment(self, alignment_id: str, alignment_data: Dict[str, Any]) -> bool:
        """
        Store alignment data in MongoDB.
        
        Args:
            alignment_id: Unique identifier for the alignment
            alignment_data: Alignment data to store
            
        Returns:
            bool: True if successful, False otherwise
        """
        if not self.collection:
            logger.error("MongoDB collection not available")
            return False
        
        try:
            # Add timestamp if not present
            if 'timestamp' not in alignment_data:
                alignment_data['timestamp'] = datetime.utcnow()
            
            # Ensure alignment_id is in the data
            alignment_data['alignment_id'] = alignment_id
            
            # Upsert document (update if exists, insert if not)
            self.collection.update_one(
                {"alignment_id": alignment_id},
                {"$set": alignment_data},
                upsert=True
            )
            
            logger.info(f"Stored alignment {alignment_id} in MongoDB")
            return True
        except Exception as e:
            logger.error(f"Error storing alignment in MongoDB: {str(e)}")
            return False
    
    def retrieve_alignment(self, alignment_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve alignment data from MongoDB.
        
        Args:
            alignment_id: Unique identifier for the alignment
            
        Returns:
            Optional[Dict[str, Any]]: Alignment data or None if not found
        """
        if not self.collection:
            logger.error("MongoDB collection not available")
            return None
        
        try:
            # Query for the alignment
            alignment = self.collection.find_one({"alignment_id": alignment_id})
            
            if not alignment:
                logger.warning(f"Alignment {alignment_id} not found in MongoDB")
                return None
            
            # Remove MongoDB _id field
            if '_id' in alignment:
                del alignment['_id']
            
            logger.info(f"Retrieved alignment {alignment_id} from MongoDB")
            return alignment
        except Exception as e:
            logger.error(f"Error retrieving alignment from MongoDB: {str(e)}")
            return None


class MongoDBCache:
    """
    Cache implementation using MongoDB.
    """
    
    def __init__(self, collection_name: str = None, ttl_seconds: int = 3600):
        """
        Initialize the MongoDB cache.
        
        Args:
            collection_name: MongoDB collection name for caching
            ttl_seconds: Time-to-live for cache items in seconds
        """
        self.collection_name = collection_name or "alignment_cache"
        self.ttl_seconds = ttl_seconds
        mongo_client = MongoDBClient.get_instance()
        self.db = mongo_client.get_db()
        
        if self.db:
            self.collection = self.db[self.collection_name]
            
            # Create TTL index for cache expiration if it doesn't exist
            existing_indexes = self.collection.index_information()
            if 'expiry_time_ttl' not in existing_indexes:
                self.collection.create_index(
                    [("expiry_time", pymongo.ASCENDING)],
                    expireAfterSeconds=0,
                    name="expiry_time_ttl"
                )
            
            # Create index on cache_key for faster lookups
            if 'cache_key_index' not in existing_indexes:
                self.collection.create_index(
                    [("cache_key", pymongo.ASCENDING)],
                    unique=True,
                    name="cache_key_index"
                )
            
            logger.info(f"Initialized MongoDB cache with collection: {self.collection_name}")
        else:
            self.collection = None
            logger.error("Failed to initialize MongoDB cache: no database connection")
    
    def _generate_key(self, audio_data: bytes, text: str, language_code: str) -> str:
        """
        Generate a cache key from the input parameters.
        
        Args:
            audio_data: Audio bytes
            text: Text to align
            language_code: Language code
            
        Returns:
            str: Cache key
        """
        import hashlib
        
        # Create a hash of the audio data and text
        audio_hash = hashlib.md5(audio_data).hexdigest()
        text_hash = hashlib.md5(text.encode('utf-8')).hexdigest()
        
        # Combine the hashes with the language code
        return f"{audio_hash}_{text_hash}_{language_code}"
    
    def get(self, audio_data: bytes, text: str, language_code: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve an item from the MongoDB cache.
        
        Args:
            audio_data: Audio bytes
            text: Text to align
            language_code: Language code
            
        Returns:
            Optional[Dict[str, Any]]: Cache entry or None if not found or expired
        """
        if not self.collection:
            logger.error("MongoDB collection not available")
            return None
        
        key = self._generate_key(audio_data, text, language_code)
        
        try:
            # Query for item
            item = self.collection.find_one({"cache_key": key})
            
            if not item:
                logger.debug(f"Cache miss for key: {key}")
                return None
            
            # Return the cached data
            if 'data' in item:
                result = item['data']
                logger.debug(f"Cache hit for key: {key}")
                return result
            
            return None
        except Exception as e:
            logger.error(f"Error getting item from MongoDB cache: {str(e)}")
            return None
    
    def put(self, audio_data: bytes, text: str, language_code: str, result: Dict[str, Any]) -> None:
        """
        Add an item to the MongoDB cache with TTL.
        
        Args:
            audio_data: Audio bytes
            text: Text to align
            language_code: Language code
            result: Alignment result to cache
        """
        if not self.collection:
            logger.error("MongoDB collection not available")
            return
        
        key = self._generate_key(audio_data, text, language_code)
        
        try:
            # Calculate expiry time
            expiry_time = datetime.utcnow()
            
            # Prepare document
            document = {
                "cache_key": key,
                "expiry_time": expiry_time,
                "data": result,
                "text": text,
                "language_code": language_code
            }
            
            # Upsert document (update if exists, insert if not)
            self.collection.update_one(
                {"cache_key": key},
                {"$set": document},
                upsert=True
            )
            
            logger.debug(f"Added/updated item in MongoDB cache with key: {key}")
        except Exception as e:
            logger.error(f"Error putting item in MongoDB cache: {str(e)}")
