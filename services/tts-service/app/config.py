"""
Configuration module for TTS service.

This module manages configuration settings from environment variables
and provides default values for development environments.
"""

import os
from typing import Dict, Any, List

class Config:
    """
    Configuration class for the TTS service.
    """
    
    # Server configuration
    GRPC_PORT = int(os.environ.get('GRPC_PORT', '50053'))
    METRICS_PORT = int(os.environ.get('METRICS_PORT', '8002'))
    
    # AWS configuration
    AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
    S3_BUCKET_NAME = os.environ.get('S3_BUCKET_NAME', 'yap-tts-audio')
    
    # TTS Provider configuration
    TTS_PROVIDER = os.environ.get('TTS_PROVIDER', 'azure').lower()  # mozilla, aws, azure, google
    USE_FALLBACK_PROVIDER = os.environ.get('USE_FALLBACK_PROVIDER', 'True').lower() in ('true', '1', 't')
    FALLBACK_TTS_PROVIDER = os.environ.get('FALLBACK_TTS_PROVIDER', 'aws').lower()  # aws, azure, google, mozilla
    
    # Alignment service configuration
    ALIGNMENT_SERVICE_HOST = os.environ.get('ALIGNMENT_SERVICE_HOST', 'alignment-service')
    ALIGNMENT_SERVICE_PORT = int(os.environ.get('ALIGNMENT_SERVICE_PORT', '50051'))
    USE_ALIGNMENT_SERVICE = os.environ.get('USE_ALIGNMENT_SERVICE', 'False').lower() in ('true', '1', 't')
    
    # Cache configuration
    CACHE_MAX_SIZE = int(os.environ.get('CACHE_MAX_SIZE', '1000'))
    CACHE_TTL_SECONDS = int(os.environ.get('CACHE_TTL_SECONDS', '86400'))  # 24 hours
    
    # Storage configuration
    STORAGE_ENABLED = os.environ.get('STORAGE_ENABLED', 'True').lower() in ('true', '1', 't')
    DYNAMODB_TABLE = os.environ.get('DYNAMODB_TABLE', 'TTSCache')
    
    # MongoDB configuration
    MONGODB_URI = os.environ.get('MONGO_URI', 'mongodb://localhost:27017')
    MONGODB_DB_NAME = os.environ.get('MONGO_DB_NAME', 'yap')
    MONGODB_ENABLED = os.environ.get('MONGODB_ENABLED', 'False').lower() in ('true', '1', 't')
    
    # Mozilla TTS configuration
    MOZILLA_TTS_MODEL_PATH = os.environ.get('MOZILLA_TTS_MODEL_PATH', '/app/models')
    
    # AWS Polly configuration
    USE_AWS_POLLY = os.environ.get('USE_AWS_POLLY', 'False').lower() in ('true', '1', 't')
    
    # Azure TTS configuration
    AZURE_SPEECH_KEY = os.environ.get('AZURE_SPEECH_KEY', '')
    AZURE_SERVICE_REGION = os.environ.get('AZURE_SERVICE_REGION', 'eastus')
    USE_AZURE_TTS = os.environ.get('USE_AZURE_TTS', 'False').lower() in ('true', '1', 't')
    
    # Google Cloud TTS configuration
    GOOGLE_APPLICATION_CREDENTIALS = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS', '')
    USE_GOOGLE_TTS = os.environ.get('USE_GOOGLE_TTS', 'False').lower() in ('true', '1', 't')
    
    # Voice configuration
    DEFAULT_VOICES_BY_LANGUAGE = {
        # Primary languages
        'en': 'en_US/vctk_low',
        'es': 'es_ES/css10',
        'fr': 'fr_FR/css10',
        'de': 'de_DE/css10',
        'zh': 'zh_CN/huayan',
        'ja': 'ja_JP/kokoro',
        'ko': 'ko_KR/kss',
        'ar': 'ar/tacotron2-DDC',
        'ru': 'ru_RU/css10',
        'pt': 'pt_BR/css10',
        'hi': 'hi_IN/coqui_base',
        
        # Additional languages
        'it': 'it_IT/css10',
        'nl': 'nl_NL/css10',
        'pl': 'pl_PL/mai',
        'tr': 'tr_TR/css10',
        'cs': 'cs_CZ/css10',
        'hu': 'hu_HU/css10',
        'th': 'th_TH/css10',
        'vi': 'vi_VN/css10',
        'el': 'el_GR/css10',
        'sv': 'sv_SE/css10',
        
        # Language variants
        'en-GB': 'en_UK/vctk_low',
        'en-AU': 'en_AU/css10',
        'en-CA': 'en_CA/css10',
        'es-MX': 'es_MX/css10',
        'es-AR': 'es_AR/css10',
        'fr-CA': 'fr_CA/css10',
        'pt-PT': 'pt_PT/css10',
        'zh-TW': 'zh_TW/css10'
    }
    
    # Supported languages with full names
    SUPPORTED_LANGUAGES = {
        # Primary languages
        'en': 'English',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'zh': 'Chinese (Simplified)',
        'ja': 'Japanese',
        'ko': 'Korean',
        'ar': 'Arabic',
        'ru': 'Russian',
        'pt': 'Portuguese (Brazil)',
        'hi': 'Hindi',
        
        # Additional languages
        'it': 'Italian',
        'nl': 'Dutch',
        'pl': 'Polish',
        'tr': 'Turkish',
        'cs': 'Czech',
        'hu': 'Hungarian',
        'th': 'Thai',
        'vi': 'Vietnamese',
        'el': 'Greek',
        'sv': 'Swedish',
        
        # Language variants
        'en-GB': 'English (UK)',
        'en-AU': 'English (Australia)',
        'en-CA': 'English (Canada)',
        'es-MX': 'Spanish (Mexico)',
        'es-AR': 'Spanish (Argentina)',
        'fr-CA': 'French (Canada)',
        'pt-PT': 'Portuguese (Portugal)',
        'zh-TW': 'Chinese (Traditional)'
    }
    
    # Language detection fallback mapping
    # Maps detected language to the closest supported language
    LANGUAGE_FALLBACKS = {
        # Variants to main languages
        'en-US': 'en',
        'en-GB': 'en',
        'en-AU': 'en',
        'en-CA': 'en',
        'en-NZ': 'en',
        'es-ES': 'es',
        'es-MX': 'es',
        'es-AR': 'es',
        'es-CO': 'es',
        'fr-FR': 'fr',
        'fr-CA': 'fr',
        'fr-BE': 'fr',
        'pt-BR': 'pt',
        'pt-PT': 'pt',
        'zh-CN': 'zh',
        'zh-TW': 'zh',
        'zh-HK': 'zh',
        
        # Uncommon languages to most similar supported languages
        'ca': 'es',  # Catalan -> Spanish
        'gl': 'es',  # Galician -> Spanish
        'ro': 'it',  # Romanian -> Italian
        'id': 'ms',  # Indonesian -> Malay
        'uk': 'ru',  # Ukrainian -> Russian
        'be': 'ru',  # Belarusian -> Russian
        'sr': 'ru',  # Serbian -> Russian
        'bg': 'ru',  # Bulgarian -> Russian
        'no': 'sv',  # Norwegian -> Swedish
        'da': 'sv',  # Danish -> Swedish
        'fi': 'sv',  # Finnish -> Swedish
    }
    
    # Audio format configuration
    DEFAULT_AUDIO_FORMAT = os.environ.get('DEFAULT_AUDIO_FORMAT', 'mp3')
    AUDIO_FORMATS = ['mp3', 'wav', 'ogg']
    
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
