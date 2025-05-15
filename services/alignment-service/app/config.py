"""
Configuration module for alignment service.

This module manages configuration settings from environment variables
and provides default values for development environments.
"""

import os
from typing import Dict, Any

class Config:
    """
    Configuration class for the alignment service.
    """
    
    # Server configuration
    GRPC_PORT = int(os.environ.get('GRPC_PORT', '50051'))
    METRICS_PORT = int(os.environ.get('METRICS_PORT', '8000'))
    
    # AWS configuration
    AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
    S3_BUCKET_NAME = os.environ.get('S3_BUCKET_NAME', 'yap-alignment-results')
    
    # Cache configuration
    CACHE_MAX_SIZE = int(os.environ.get('CACHE_MAX_SIZE', '1000'))
    CACHE_TTL_SECONDS = int(os.environ.get('CACHE_TTL_SECONDS', '3600'))
    
    # Model configuration
    DEFAULT_MODEL = os.environ.get('DEFAULT_MODEL', 'large-v2')
    GPU_ENABLED = os.environ.get('GPU_ENABLED', 'True').lower() in ('true', '1', 't')
    
    # Storage configuration
    STORAGE_ENABLED = os.environ.get('STORAGE_ENABLED', 'False').lower() in ('true', '1', 't')
    
    # Language models
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
