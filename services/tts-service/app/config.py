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
    
    # Parse ALIGNMENT_SERVICE_PORT - handle both plain port and service URL formats
    alignment_port_env = os.environ.get('ALIGNMENT_SERVICE_PORT', '50051')
    if '://' in alignment_port_env:
        # Extract port from URL like 'tcp://host:port'
        ALIGNMENT_SERVICE_PORT = int(alignment_port_env.split(':')[-1])
    else:
        ALIGNMENT_SERVICE_PORT = int(alignment_port_env)
        
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
    
    # MLflow Model Registry configuration
    MLFLOW_TRACKING_URI = os.environ.get('MLFLOW_TRACKING_URI', '')
    USE_MODEL_REGISTRY = os.environ.get('USE_MODEL_REGISTRY', 'False').lower() in ('true', '1', 't')
    MODEL_NAME = os.environ.get('MODEL_NAME', 'yap-tts-model')
    MODEL_STAGE = os.environ.get('MODEL_STAGE', 'Production')
    
    # Feature store configuration
    REDIS_HOST = os.environ.get('REDIS_HOST', 'localhost')
    REDIS_PORT = int(os.environ.get('REDIS_PORT', '6379'))

    # Model optimization configuration
    USE_MODEL_OPTIMIZATION = os.environ.get('USE_MODEL_OPTIMIZATION', 'False').lower() in ('true', '1', 't')
    OPTIMIZED_MODEL_DIR = os.environ.get('OPTIMIZED_MODEL_DIR', '/app/models/optimized')
    
    # Personalization configuration
    USE_PERSONALIZATION = os.environ.get('USE_PERSONALIZATION', 'False').lower() in ('true', '1', 't')
    PERSONALIZATION_MODEL_PATH = os.environ.get('PERSONALIZATION_MODEL_PATH', '/app/models/personalized')
    
    # Offline edge deployment configuration
    USE_OFFLINE_MODE = os.environ.get('USE_OFFLINE_MODE', 'False').lower() in ('true', '1', 't')
    OFFLINE_MODEL_DIR = os.environ.get('OFFLINE_MODEL_DIR', '/app/models/offline')
    
    # Drift detection settings
    DRIFT_SAMPLING_BUCKET = os.environ.get('DRIFT_SAMPLING_BUCKET', 'yap-drift-samples')
    DRIFT_SAMPLING_PREFIX = os.environ.get('DRIFT_SAMPLING_PREFIX', 'samples')
    DRIFT_SAMPLING_SIZE = int(os.environ.get('DRIFT_SAMPLING_SIZE', '1000'))
    DRIFT_REPORT_PREFIX = os.environ.get('DRIFT_REPORT_PREFIX', 'drift-reports')
    BASELINE_SAMPLE_PATH = os.environ.get('BASELINE_SAMPLE_PATH', 'baseline.csv')
    DRIFT_RAW_LOGS_PREFIX = os.environ.get('DRIFT_RAW_LOGS_PREFIX', 'raw-logs')
    
    # Drift alert settings
    DRIFT_ALERT_THRESHOLD = float(os.environ.get('DRIFT_ALERT_THRESHOLD', '0.3'))  # alert if drift_score exceeds this
    # Slack
    SLACK_WEBHOOK_URL = os.environ.get('SLACK_WEBHOOK_URL', '')
    # Email (SMTP) settings
    EMAIL_SENDER = os.environ.get('EMAIL_SENDER', 'no-reply@yap.ai')
    EMAIL_RECIPIENTS = os.environ.get('EMAIL_RECIPIENTS', 'ml-team@yap.ai').split(',')
    SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.example.com')
    SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
    SMTP_TLS = os.environ.get('SMTP_TLS', 'true').lower() in ('true', '1')
    SMTP_USER = os.environ.get('SMTP_USER', '')
    SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
    
    # Retraining pipeline settings
    TRAINING_DATA_BUCKET = os.environ.get('TRAINING_DATA_BUCKET', DRIFT_SAMPLING_BUCKET)
    TRAINING_DATA_PREFIX = os.environ.get('TRAINING_DATA_PREFIX', 'retraining-data')
    TRAIN_TEST_SPLIT = float(os.environ.get('TRAIN_TEST_SPLIT', '0.2'))
    MLFLOW_EXPERIMENT_NAME = os.environ.get('MLFLOW_EXPERIMENT_NAME', 'tts-retraining')
    
    # Canary deployment thresholds and Prometheus endpoint
    PROMETHEUS_URL = os.environ.get('PROMETHEUS_URL', 'http://prometheus.monitoring.svc.cluster.local:9090')
    CANARY_LATENCY_THRESHOLD = float(os.environ.get('CANARY_LATENCY_THRESHOLD', '0.2'))  # 20% over stable
    CANARY_ERROR_THRESHOLD = float(os.environ.get('CANARY_ERROR_THRESHOLD', '0.1'))    # 10% over stable
    
    # Kafka streaming settings
    KAFKA_BOOTSTRAP_SERVERS = os.environ.get('KAFKA_BOOTSTRAP_SERVERS', 'localhost:9092').split(',')
    KAFKA_TOPIC_FEEDBACK = os.environ.get('KAFKA_TOPIC_FEEDBACK', 'user_feedback')
    KAFKA_TOPIC_QUALITY = os.environ.get('KAFKA_TOPIC_QUALITY', 'audio_quality')
    KAFKA_TOPIC_DEVICE_METADATA = os.environ.get('KAFKA_TOPIC_DEVICE_METADATA', 'device_metadata')
    
    # HTTP Feedback API settings
    USE_HTTP_FEEDBACK_API = os.environ.get('USE_HTTP_FEEDBACK_API', 'false').lower() in ('true', '1', 't')
    FEEDBACK_API_PORT = int(os.environ.get('FEEDBACK_API_PORT', '5001'))
    
    # Audio quality scoring model (optional)
    AUDIO_QUALITY_MODEL_PATH = os.environ.get('AUDIO_QUALITY_MODEL_PATH', '')
    
    # Dynamic routing settings
    USE_DYNAMIC_ROUTING = os.environ.get('USE_DYNAMIC_ROUTING', 'false').lower() in ('true','1')
    HIGH_MOS_THRESHOLD = float(os.environ.get('HIGH_MOS_THRESHOLD', '4.0'))  # on 1-5 scale
    MOBILE_RATE_FACTOR = float(os.environ.get('MOBILE_RATE_FACTOR', '0.9'))  # multiply speaking rate
    
    # User embedding training
    USER_EMBEDDING_PATH = os.environ.get('USER_EMBEDDING_PATH', 'models/user_embeddings.pt')
    EMBEDDING_DIM = int(os.environ.get('EMBEDDING_DIM', '128'))
    TRAINING_EPOCHS = int(os.environ.get('TRAINING_EPOCHS', '10'))
    TRAIN_BATCH_SIZE = int(os.environ.get('TRAIN_BATCH_SIZE', '64'))
    LEARNING_RATE = float(os.environ.get('LEARNING_RATE', '0.001'))
    
    # LORA adapter configuration
    LORA_ADAPTER_DIR = os.environ.get('LORA_ADAPTER_DIR', 'lora_adapters')
    USE_LORA_ADAPTER = os.environ.get('USE_LORA_ADAPTER', 'false').lower() in ('true','1')
    
    # Adapter fine-tuning settings
    FINETUNE_STEPS = int(os.environ.get('FINETUNE_STEPS', '5'))
    
    # Vocoder model and quantization settings
    VOCODER_MODEL_PATH = os.environ.get('VOCODER_MODEL_PATH', '/models/vocoder.pth')
    QUANTIZED_VOCODER_DIR = os.environ.get('QUANTIZED_VOCODER_DIR', 'optimized/vocoder')
    # Default dummy input shape for vocoder: (1, num_mels, mel_length)
    VOCODER_NUM_MELS = int(os.environ.get('VOCODER_NUM_MELS', '80'))
    VOCODER_SAMPLE_LENGTH = int(os.environ.get('VOCODER_SAMPLE_LENGTH', '500'))
    
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
# Updated config
