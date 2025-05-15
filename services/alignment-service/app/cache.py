"""
Cache utility for the alignment service.

This module provides caching functionality to avoid redundant alignment operations.
"""

import time
import logging
from typing import Dict, Any, Optional, Tuple
import hashlib

# Configure logging
logger = logging.getLogger(__name__)

class AlignmentCache:
    """
    In-memory cache for alignment results.
    """
    
    def __init__(self, max_size: int = 1000, ttl: int = 3600):
        """
        Initialize cache.
        
        Args:
            max_size: Maximum number of items to keep in cache
            ttl: Time-to-live in seconds for each cache entry
        """
        self.cache: Dict[str, Tuple[float, Any]] = {}
        self.max_size = max_size
        self.ttl = ttl
    
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
        # Create a hash of the audio data and text
        audio_hash = hashlib.md5(audio_data).hexdigest()
        text_hash = hashlib.md5(text.encode('utf-8')).hexdigest()
        
        # Combine the hashes with the language code
        return f"{audio_hash}_{text_hash}_{language_code}"
    
    def get(self, audio_data: bytes, text: str, language_code: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve an item from the cache.
        
        Args:
            audio_data: Audio bytes
            text: Text to align
            language_code: Language code
            
        Returns:
            Optional[Dict[str, Any]]: Cache entry or None if not found or expired
        """
        key = self._generate_key(audio_data, text, language_code)
        
        if key in self.cache:
            timestamp, data = self.cache[key]
            
            # Check if the item has expired
            if time.time() - timestamp > self.ttl:
                del self.cache[key]
                logger.info(f"Cache entry expired for key {key}")
                return None
            
            logger.info(f"Cache hit for key {key}")
            return data
        
        logger.info(f"Cache miss for key {key}")
        return None
    
    def put(self, audio_data: bytes, text: str, language_code: str, result: Dict[str, Any]) -> None:
        """
        Add an item to the cache.
        
        Args:
            audio_data: Audio bytes
            text: Text to align
            language_code: Language code
            result: Alignment result to cache
        """
        key = self._generate_key(audio_data, text, language_code)
        
        # If the cache is full, remove the oldest item
        if len(self.cache) >= self.max_size:
            oldest_key = min(self.cache.keys(), key=lambda k: self.cache[k][0])
            del self.cache[oldest_key]
            logger.info(f"Cache full, removed oldest entry with key {oldest_key}")
        
        # Add the new item
        self.cache[key] = (time.time(), result)
        logger.info(f"Added entry to cache with key {key}")
    
    def clear(self) -> None:
        """
        Clear the cache.
        """
        self.cache = {}
        logger.info("Cache cleared")
