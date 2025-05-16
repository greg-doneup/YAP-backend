"""
Cache utility for the pronunciation scorer service.

This module provides caching functionality to avoid redundant scoring operations.
"""

import time
import logging
import hashlib
from typing import Dict, Any, Optional, Tuple

from app.config import Config

# Configure logging
logger = logging.getLogger(__name__)

class ScoringCache:
    """
    In-memory cache for pronunciation scoring results.
    """
    
    def __init__(self, max_size: int = None, ttl: int = None):
        """
        Initialize cache.
        
        Args:
            max_size: Maximum number of items to keep in cache
            ttl: Time-to-live in seconds for each cache entry
        """
        self.cache: Dict[str, Tuple[float, Any]] = {}
        self.max_size = max_size or Config.CACHE_MAX_SIZE
        self.ttl = ttl or Config.CACHE_TTL_SECONDS
    
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
        Retrieve an item from the cache.
        
        Args:
            audio_data: Audio bytes
            text: Reference text
            language_code: Language code
            alignments: Alignment data
            
        Returns:
            Optional[Dict[str, Any]]: Cache entry or None if not found or expired
        """
        key = self._generate_key(audio_data, text, language_code, alignments)
        
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
    
    def put(self, 
            audio_data: bytes, 
            text: str, 
            language_code: str,
            alignments: Dict[str, Any],
            result: Dict[str, Any]) -> None:
        """
        Add an item to the cache.
        
        Args:
            audio_data: Audio bytes
            text: Reference text
            language_code: Language code
            alignments: Alignment data
            result: Scoring result to cache
        """
        key = self._generate_key(audio_data, text, language_code, alignments)
        
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
