"""
MongoDB storage module for pronunciation scoring results.

This module provides MongoDB-based storage mechanisms for scoring results.
"""

import json
import logging
import os
from typing import Dict, Any, Optional
from datetime import datetime
import pymongo
import gridfs

from app.config import Config

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


class MongoDBScoringStorage:
    """
    MongoDB implementation for storing pronunciation scoring results.
    """
    
    def __init__(self, collection_name: str = None, metadata_collection: str = None):
        """
        Initialize MongoDB storage for pronunciation scoring.
        
        Args:
            collection_name: MongoDB GridFS collection name for storing full results
            metadata_collection: MongoDB collection name for metadata
        """
        self.collection_name = collection_name or "pronunciation_scores"
        self.metadata_collection = metadata_collection or "pronunciation_attempts"
        
        mongo_client = MongoDBClient.get_instance()
        self.db = mongo_client.get_db()
        
        if self.db:
            # Initialize GridFS for storing detailed results
            self.fs = gridfs.GridFS(self.db, collection=self.collection_name)
            
            # Get metadata collection for quick lookups
            self.attempts_collection = self.db[self.metadata_collection]
            
            # Create indexes for faster lookups
            existing_indexes = self.attempts_collection.index_information()
            
            # Index for scoring_id lookups
            if 'scoring_id_index' not in existing_indexes:
                self.attempts_collection.create_index(
                    [("scoring_id", pymongo.ASCENDING)],
                    unique=True,
                    name="scoring_id_index"
                )
            
            # Index for wallet_address lookups
            if 'wallet_address_index' not in existing_indexes:
                self.attempts_collection.create_index(
                    [("wallet_address", pymongo.ASCENDING), ("timestamp", pymongo.DESCENDING)],
                    name="wallet_address_index"
                )
            
            # Index for timestamp for sorting and pagination
            if 'timestamp_index' not in existing_indexes:
                self.attempts_collection.create_index(
                    [("timestamp", pymongo.DESCENDING)],
                    name="timestamp_index"
                )
            
            logger.info(f"Initialized MongoDB scoring storage with collections: {self.collection_name}, {self.metadata_collection}")
        else:
            self.fs = None
            self.attempts_collection = None
            logger.error("Failed to initialize MongoDB scoring storage: no database connection")
    
    def store_result(self, 
                     scoring_id: str, 
                     wallet_address: str, 
                     language_code: str,
                     result: Dict[str, Any]) -> bool:
        """
        Store scoring result in MongoDB.
        
        Args:
            scoring_id: Unique identifier for the scoring result
            wallet_address: User's wallet address
            language_code: Language code
            result: Scoring result to store
            
        Returns:
            bool: True if successful, False otherwise
        """
        if not self.fs or not self.attempts_collection:
            logger.error("MongoDB not available")
            return False
        
        try:
            # Store the full result in GridFS
            json_data = json.dumps(result)
            
            # Check if this scoring_id already exists in GridFS
            existing = self.fs.find_one({"filename": scoring_id})
            if existing:
                self.fs.delete(existing._id)
            
            # Store the detailed result
            file_id = self.fs.put(
                json_data.encode('utf-8'),
                filename=scoring_id,
                content_type='application/json',
                metadata={
                    "scoring_id": scoring_id,
                    "wallet_address": wallet_address,
                    "language_code": language_code
                }
            )
            
            # Record metadata for quick lookups
            timestamp = datetime.utcnow()
            overall_score = result.get('overall_score', {}).get('score', 0.0)
            
            # Store metadata
            self.attempts_collection.update_one(
                {"scoring_id": scoring_id},
                {
                    "$set": {
                        "scoring_id": scoring_id,
                        "wallet_address": wallet_address,
                        "language_code": language_code,
                        "timestamp": timestamp,
                        "overall_score": overall_score,
                        "file_id": str(file_id)
                    }
                },
                upsert=True
            )
            
            logger.info(f"Stored scoring result {scoring_id} for wallet {wallet_address}")
            return True
        except Exception as e:
            logger.error(f"Error storing scoring result in MongoDB: {str(e)}")
            return False
    
    def retrieve_result(self, scoring_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve scoring result from MongoDB.
        
        Args:
            scoring_id: Unique identifier for the scoring result
            
        Returns:
            Optional[Dict[str, Any]]: Scoring result or None if not found
        """
        if not self.fs or not self.attempts_collection:
            logger.error("MongoDB not available")
            return None
        
        try:
            # First, query metadata collection to find the file_id
            metadata = self.attempts_collection.find_one({"scoring_id": scoring_id})
            
            if not metadata:
                logger.warning(f"Scoring result {scoring_id} metadata not found in MongoDB")
                return None
            
            # Retrieve from GridFS directly using the scoring_id as filename
            grid_file = self.fs.find_one({"filename": scoring_id})
            
            if not grid_file:
                logger.warning(f"Scoring result {scoring_id} not found in GridFS")
                return None
            
            # Read and parse the JSON data
            json_data = grid_file.read().decode('utf-8')
            result = json.loads(json_data)
            
            logger.info(f"Retrieved scoring result {scoring_id}")
            return result
        except Exception as e:
            logger.error(f"Error retrieving scoring result from MongoDB: {str(e)}")
            return None


class MongoDBScoringCache:
    """
    Cache implementation using MongoDB for pronunciation scoring.
    """
    
    def __init__(self, collection_name: str = None):
        """
        Initialize the MongoDB cache.
        
        Args:
            collection_name: MongoDB collection name for caching
        """
        self.collection_name = collection_name or "scoring_cache"
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
            
            logger.info(f"Initialized MongoDB scoring cache with collection: {self.collection_name}")
        else:
            self.collection = None
            logger.error("Failed to initialize MongoDB scoring cache: no database connection")
    
    def _generate_key(self, 
                    audio_data: bytes, 
                    text: str, 
                    language_code: str,
                    alignments: Dict[str, Any]) -> str:
        """
        Generate a cache key from the input parameters.
        
        Args:
            audio_data: Audio bytes
            text: Reference text
            language_code: Language code
            alignments: Alignment data
            
        Returns:
            str: Cache key
        """
        import hashlib
        
        # Create a hash of the key components
        audio_hash = hashlib.md5(audio_data).hexdigest()
        text_hash = hashlib.md5(text.encode('utf-8')).hexdigest()
        
        # Hash alignment data
        alignment_str = str(alignments)
        alignment_hash = hashlib.md5(alignment_str.encode('utf-8')).hexdigest()
        
        # Combine the hashes with the language code
        return f"{audio_hash}_{text_hash}_{language_code}_{alignment_hash}"
    
    def get(self, 
            audio_data: bytes, 
            text: str, 
            language_code: str,
            alignments: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Retrieve an item from the MongoDB cache.
        
        Args:
            audio_data: Audio bytes
            text: Reference text
            language_code: Language code
            alignments: Alignment data
            
        Returns:
            Optional[Dict[str, Any]]: Cache entry or None if not found or expired
        """
        if not self.collection:
            logger.error("MongoDB collection not available")
            return None
        
        key = self._generate_key(audio_data, text, language_code, alignments)
        
        try:
            # Query for item
            item = self.collection.find_one({"cache_key": key})
            
            if not item:
                logger.debug(f"Cache miss for key: {key}")
                return None
            
            # Return the cached result
            if 'result' in item:
                result = item['result']
                logger.debug(f"Cache hit for key: {key}")
                return result
            
            return None
        except Exception as e:
            logger.error(f"Error getting item from MongoDB scoring cache: {str(e)}")
            return None
    
    def put(self, 
            audio_data: bytes, 
            text: str, 
            language_code: str,
            alignments: Dict[str, Any],
            result: Dict[str, Any]) -> None:
        """
        Add an item to the MongoDB cache with TTL.
        
        Args:
            audio_data: Audio bytes
            text: Reference text
            language_code: Language code
            alignments: Alignment data
            result: Scoring result to cache
        """
        if not self.collection:
            logger.error("MongoDB collection not available")
            return
        
        key = self._generate_key(audio_data, text, language_code, alignments)
        
        try:
            # Calculate expiry time based on Config.CACHE_TTL_SECONDS
            ttl_seconds = Config.CACHE_TTL_SECONDS
            expiry_time = datetime.utcnow()
            
            # Prepare document
            document = {
                "cache_key": key,
                "expiry_time": expiry_time,
                "text": text,
                "language_code": language_code,
                "result": result,
                "timestamp": datetime.utcnow()
            }
            
            # Upsert document (update if exists, insert if not)
            self.collection.update_one(
                {"cache_key": key},
                {"$set": document},
                upsert=True
            )
            
            logger.debug(f"Added/updated item in MongoDB scoring cache with key: {key}")
        except Exception as e:
            logger.error(f"Error putting item in MongoDB scoring cache: {str(e)}")
    
    def clear(self) -> None:
        """
        Clear the MongoDB cache.
        """
        if not self.collection:
            logger.error("MongoDB collection not available")
            return
        
        try:
            self.collection.delete_many({})
            logger.info(f"Cleared all items from MongoDB scoring cache: {self.collection_name}")
        except Exception as e:
            logger.error(f"Error clearing MongoDB scoring cache: {str(e)}")
