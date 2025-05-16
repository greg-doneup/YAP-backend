"""
Configuration module for pronunciation scorer service.

This module manages configuration settings from environment variables
and provides default values for development environments.
"""

import os
from typing import Dict, Any

class Config:
    """
    Configuration class for the pronunciation scorer service.
    """
    
    # Server configuration
    GRPC_PORT = int(os.environ.get('GRPC_PORT', '50052'))
    METRICS_PORT = int(os.environ.get('METRICS_PORT', '8001'))
    
    # AWS configuration
    AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
    S3_BUCKET_NAME = os.environ.get('S3_BUCKET_NAME', 'yap-pronunciation-scores')
    
    # Scoring configuration
    PRONUNCIATION_THRESHOLD_EXCELLENT = float(os.environ.get('PRONUNCIATION_THRESHOLD_EXCELLENT', '90.0'))
    PRONUNCIATION_THRESHOLD_GOOD = float(os.environ.get('PRONUNCIATION_THRESHOLD_GOOD', '75.0'))
    PRONUNCIATION_THRESHOLD_FAIR = float(os.environ.get('PRONUNCIATION_THRESHOLD_FAIR', '60.0'))
    
    # Provider configuration
    USE_GOP = os.environ.get('USE_GOP', 'True').lower() in ('true', '1', 't')
    USE_AZURE_FALLBACK = os.environ.get('USE_AZURE_FALLBACK', 'False').lower() in ('true', '1', 't')
    
    # Cache configuration
    CACHE_MAX_SIZE = int(os.environ.get('CACHE_MAX_SIZE', '1000'))
    CACHE_TTL_SECONDS = int(os.environ.get('CACHE_TTL_SECONDS', '3600'))
    
    # Storage configuration
    STORAGE_ENABLED = os.environ.get('STORAGE_ENABLED', 'False').lower() in ('true', '1', 't')
    
    # MongoDB configuration
    MONGODB_URI = os.environ.get('MONGO_URI', 'mongodb://localhost:27017')
    MONGODB_DB_NAME = os.environ.get('MONGO_DB_NAME', 'yap')
    MONGODB_ENABLED = os.environ.get('MONGODB_ENABLED', 'False').lower() in ('true', '1', 't')
    
    # Azure configuration (for fallback)
    AZURE_SPEECH_KEY = os.environ.get('AZURE_SPEECH_KEY', '')
    AZURE_SERVICE_REGION = os.environ.get('AZURE_SERVICE_REGION', 'eastus')
    
    # Language configurations
    SUPPORTED_LANGUAGES = {
        'en': 'English',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'zh': 'Chinese',
        'ja': 'Japanese',
        'ko': 'Korean',
        'ar': 'Arabic',
        'ru': 'Russian',
        'pt': 'Portuguese',
        'hi': 'Hindi'
    }
    
    # Phoneme lexicon paths
    PHONEME_LEXICON_DIR = os.environ.get('PHONEME_LEXICON_DIR', '/app/lexicons')
    
    @classmethod
    def as_dict(cls) -> Dict[str, Any]:
        """
        Returns the configuration as a dictionary.
        
        Returns:
            Dict[str, Any]: Configuration dictionary
        """
        return {
            key: value for key, value in cls.__dict__.items()
            if not key.startswith('__') and not callable(value)
        }
