import os

class Config:
    """Configuration for the voice-score service."""
    
    # Service settings
    SERVICE_NAME = "voice-score"
    SERVICE_PORT = int(os.environ.get("GRPC_PORT", "50054"))
    HTTP_PORT = int(os.environ.get("HTTP_PORT", "8080"))
    
    # Alignment service connection
    ALIGNMENT_SERVICE_HOST = os.environ.get("ALIGNMENT_SERVICE_HOST", "alignment-service")
    ALIGNMENT_SERVICE_PORT = int(os.environ.get("ALIGNMENT_SERVICE_PORT", "50051"))
    ALIGNMENT_SERVICE_TIMEOUT = int(os.environ.get("ALIGNMENT_SERVICE_TIMEOUT", "30"))  # seconds
    
    # Pronunciation scorer service connection
    PRONUNCIATION_SCORER_HOST = os.environ.get("PRONUNCIATION_SCORER_HOST", "pronunciation-scorer")
    PRONUNCIATION_SCORER_PORT = int(os.environ.get("PRONUNCIATION_SCORER_PORT", "50052"))
    PRONUNCIATION_SCORER_TIMEOUT = int(os.environ.get("PRONUNCIATION_SCORER_TIMEOUT", "30"))  # seconds
    
    # TTS service connection
    TTS_SERVICE_HOST = os.environ.get("TTS_SERVICE_HOST", "tts-service")
    TTS_SERVICE_PORT = int(os.environ.get("TTS_SERVICE_PORT", "50053"))
    TTS_SERVICE_TIMEOUT = int(os.environ.get("TTS_SERVICE_TIMEOUT", "30"))  # seconds
    
    # Caching settings
    CACHE_MAX_SIZE = int(os.environ.get("CACHE_MAX_SIZE", "1000"))
    CACHE_TTL_SECONDS = int(os.environ.get("CACHE_TTL_SECONDS", "3600"))  # 1 hour
    
    # Resource limits
    MAX_WORKERS = int(os.environ.get("MAX_WORKERS", "10"))
    MAX_CONCURRENT_RPCS = int(os.environ.get("MAX_CONCURRENT_RPCS", "100"))
    
    # Metrics settings
    METRICS_PORT = int(os.environ.get("METRICS_PORT", "8001"))
    METRICS_ENABLED = os.environ.get("METRICS_ENABLED", "True").lower() in ('true', '1', 't')
    
    # MongoDB settings
    MONGODB_ENABLED = os.environ.get("MONGODB_ENABLED", "False").lower() in ('true', '1', 't')
    MONGODB_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
    MONGODB_DB_NAME = os.environ.get("MONGO_DB_NAME", "yap")
    
    # Scoring settings
    PASS_THRESHOLD = float(os.environ.get("PASS_THRESHOLD", "0.8"))
    DEFAULT_DETAIL_LEVEL = os.environ.get("DEFAULT_DETAIL_LEVEL", "phoneme")
    
    # Default language settings
    DEFAULT_LANGUAGE_CODE = os.environ.get("DEFAULT_LANGUAGE_CODE", "en-US")
    
    # Fallback settings
    USE_FALLBACK_SCORING = os.environ.get("USE_FALLBACK_SCORING", "True").lower() in ('true', '1', 't')
    
    # Logging settings
    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
