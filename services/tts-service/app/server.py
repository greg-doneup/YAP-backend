import os
import grpc
from concurrent import futures
import logging
import time
import json
from typing import Dict, Any, Optional
from kafka import KafkaProducer

# Import Prometheus metrics for health check
from app.ml_monitoring import MODEL_CACHE_HITS, MODEL_CACHE_MISSES
from app.feature_store import get_feature_store
from app.personalization import get_personalization_engine

# Configure logging
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import generated gRPC modules
from proto import tts_pb2, tts_pb2_grpc

# Import custom modules
from app.config import Config
from app.tts_provider import TTSProviderFactory
from app.tts_provider import MozillaTTSProvider
from app.storage import get_cache, get_storage
from app.language_detection import get_language_detector
from app.alignment_client import AlignmentServiceClient
from app.benchmarking import get_benchmarker
from app.ml_monitoring import get_ml_monitor
from app.feedback_api import app as feedback_app

class TTSService(tts_pb2_grpc.TTSServiceServicer):
    """
    Service for generating speech from text (Text-to-Speech) in multiple languages.
    """
    
    def __init__(self):
        logger.info("Initializing TTSService")
        # optionally start HTTP feedback API
        if Config.USE_HTTP_FEEDBACK_API:
            from threading import Thread
            port = int(os.environ.get('FEEDBACK_API_PORT', 5001))
            t = Thread(target=lambda: feedback_app.run(host='0.0.0.0', port=port, use_reloader=False))
            t.daemon = True
            t.start()
            logger.info(f"HTTP feedback API running on port {port}")
        # Initialize provider based on offline mode
        if Config.USE_OFFLINE_MODE:
            # Edge offline: use local Mozilla TTS provider only
            self.provider = MozillaTTSProvider()
            logger.info("Offline mode: using local Mozilla TTS provider")
            # No fallback provider in offline mode
            self.fallback_provider = None
        else:
            # Initialize primary provider
            self.provider = TTSProviderFactory.get_provider()
            logger.info(f"Primary TTS provider: {type(self.provider).__name__}")
            
            # Initialize fallback provider if configured
            self.fallback_provider = None
            if Config.USE_FALLBACK_PROVIDER:
                self.fallback_provider = TTSProviderFactory.get_provider(fallback=True)
                if self.fallback_provider:
                    logger.info(f"Fallback TTS provider: {type(self.fallback_provider).__name__}")
        
        self.cache = get_cache()
        self.storage = get_storage()
        self.language_detector = get_language_detector()
        self.benchmarker = get_benchmarker()
        self.ml_monitor = get_ml_monitor()
        # Initialize feature store for request-level features
        self.feature_store = get_feature_store()
        self.personalization = get_personalization_engine()
        # Initialize Kafka producer for streaming events
        try:
            self.producer = KafkaProducer(
                bootstrap_servers=Config.KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v).encode('utf-8')
            )
            logger.info("Kafka producer initialized for feedback events")
        except Exception as e:
            logger.error(f"Failed to initialize Kafka producer: {e}")
         
        # Initialize alignment client if enabled
        self.alignment_client = None
        if Config.USE_ALIGNMENT_SERVICE:
            self.alignment_client = AlignmentServiceClient()
            # Check if alignment service is available
            if self.alignment_client.health_check():
                logger.info("Alignment service is available and healthy")
            else:
                logger.warning("Alignment service is not available or unhealthy")
        
    def GenerateSpeech(self, request, context):
        """
        Generates speech from text in specified language and voice.
        """
        # Dynamic routing: adjust speaking rate for mobile and route high-MOS users to neural model
        if Config.USE_DYNAMIC_ROUTING:
            # Device-aware tuning from user_params
            device_type = request.user_params.get('device_type') if hasattr(request, 'user_params') else None
            if device_type == 'mobile':
                original_rate = request.speaking_rate or 1.0
                request.speaking_rate = original_rate * Config.MOBILE_RATE_FACTOR
                logger.debug(f"Adjusted speaking_rate for mobile device: {request.speaking_rate}")
            # High MOS routing based on recent feedback
            if hasattr(request, 'user_id') and request.user_id:
                fb_key = f"feedback:{request.user_id}"
                fb = self.feature_store.get_features(fb_key)
                if fb and fb.get('feedback_score', 0.0) >= Config.HIGH_MOS_THRESHOLD:
                    # prefer neural voice for high satisfaction
                    request.use_neural_voice = True
                    logger.debug(f"Routing high-MOS user {request.user_id} to neural voice")
        
        # Start service-level benchmark
        self.benchmarker.start_benchmark(
            provider="service",  
            operation="GenerateSpeech", 
            language=request.language_code,
            voice_id=request.voice_id if request.voice_id else "default"
        )
        
        try:
            logger.info(f"Received TTS request for language: {request.language_code}")
            
            # Personalization: adjust text, voice_id, ssml based on user
            if Config.USE_PERSONALIZATION:
                text, voice_id, ssml = self.personalization.apply(
                    text=request.text,
                    language_code=request.language_code,
                    voice_id=request.voice_id,
                    use_neural=request.use_neural_voice,
                    ssml=request.ssml if hasattr(request, 'ssml') else None,
                    user_id=request.user_id if hasattr(request, 'user_id') else None,
                    voice_style=request.voice_style if hasattr(request, 'voice_style') else None,
                    user_params=dict(request.user_params) if hasattr(request, 'user_params') else None
                )
                request.text = text
                request.voice_id = voice_id
                request.ssml = ssml
            # Detect language if not specified or confirm provided language is supported
            original_language = request.language_code
            if not request.language_code or request.language_code == "auto":
                request.language_code = self.language_detector.get_supported_language(request.text)
                logger.info(f"Language detection: detected {request.language_code} for input text")
            
            # Generate cache key from request parameters
            cache_key = self.cache.generate_key(
                text=request.text,
                language_code=request.language_code,
                voice_id=request.voice_id,
                audio_format=request.audio_format,
                speaking_rate=request.speaking_rate,
                pitch=request.pitch
            )
            # Compute and persist request features
            features = {
                "text_length": len(request.text),
                "language_code": request.language_code,
                "voice_id": request.voice_id or "default"
            }
            self.feature_store.put_features(cache_key, features)

            # Check cache first
            cached_item = self.cache.get(cache_key)
            if cached_item:
                logger.info(f"Cache hit for key: {cache_key}")
                # Log cache hit for ML monitoring
                self.ml_monitor.log_cache_event(hit=True, key=cache_key, context="speech")
                
                # If audio data is not in the cache but we have its storage location
                if 's3_url' in cached_item and not cached_item.get('audio_data'):
                    # Retrieve from storage
                    audio_data = self.storage.retrieve(cache_key, cached_item['audio_format'])
                    if audio_data:
                        cached_item['audio_data'] = audio_data
                
                # Create response from cached item
                response = tts_pb2.TTSResponse(
                    success=True,
                    message="TTS retrieved from cache",
                    audio_data=cached_item.get('audio_data', b''),
                    audio_format=cached_item.get('audio_format', request.audio_format),
                    duration=cached_item.get('duration', 0.0),
                    cache_key=cache_key
                )
                
                # End benchmark
                self.benchmarker.end_benchmark(
                    success=True, 
                    audio_duration=cached_item.get('duration', 0.0),
                    audio_size_bytes=len(cached_item.get('audio_data', b''))
                )
                
                return response
            
            # Not in cache, generate speech with the provider
            logger.info(f"Cache miss, generating speech for: {request.text[:30]}...")
            # Log cache miss for ML monitoring
            self.ml_monitor.log_cache_event(hit=False, key=cache_key, context="speech")
            
            # Check if SSML is provided
            ssml = request.ssml if hasattr(request, 'ssml') and request.ssml else None
            
            # Apply LoRA adapter if enabled
            if Config.USE_LORA_ADAPTER and hasattr(request, 'user_id') and request.user_id:
                try:
                    self.provider._load_adapter(request.user_id)
                    self.provider._apply_adapter(request.user_id)
                except Exception as e:
                    logger.warning(f"LoRA adapter load/apply failed for user {request.user_id}: {e}")

            # Call provider for synthesis
            result = self.provider.synthesize_speech(
                text=request.text,
                language_code=request.language_code,
                voice_id=request.voice_id if request.voice_id else None,
                audio_format=request.audio_format,
                speaking_rate=request.speaking_rate,
                pitch=request.pitch,
                ssml=ssml
            )
            
            # Store the audio data
            if Config.STORAGE_ENABLED:
                s3_url = self.storage.store(
                    audio_data=result['audio_data'],
                    key=cache_key,
                    audio_format=result['audio_format']
                )
                if s3_url:
                    result['s3_url'] = s3_url
            
            # Cache the result
            self.cache.put(cache_key, result)
            
            # Create response
            response = tts_pb2.TTSResponse(
                success=True,
                message="TTS generation successful",
                audio_data=result['audio_data'],
                audio_format=result['audio_format'],
                duration=result['duration'],
                cache_key=cache_key
            )
            
            # End benchmark
            self.benchmarker.end_benchmark(
                success=True, 
                audio_duration=result.get('duration', 0.0),
                audio_size_bytes=len(result['audio_data'])
            )
            
            return response
                
        except Exception as primary_error:
            logger.error(f"Primary provider error: {str(primary_error)}")
            
            # Try fallback provider if configured
            if self.fallback_provider and Config.USE_FALLBACK_PROVIDER:
                logger.info(f"Attempting to use fallback provider")
                try:
                    result = self.fallback_provider.synthesize_speech(
                        text=request.text,
                        language_code=request.language_code,
                        voice_id=request.voice_id if request.voice_id else None,
                        audio_format=request.audio_format,
                        speaking_rate=request.speaking_rate,
                        pitch=request.pitch,
                        ssml=ssml
                    )
                    
                    # Store the audio data
                    if Config.STORAGE_ENABLED:
                        s3_url = self.storage.store(
                            audio_data=result['audio_data'],
                            key=cache_key,
                            audio_format=result['audio_format']
                        )
                        if s3_url:
                            result['s3_url'] = s3_url
                    
                    # Cache the result
                    self.cache.put(cache_key, result)
                    
                    # Create response
                    response = tts_pb2.TTSResponse(
                        success=True,
                        message="TTS generation successful using fallback provider",
                        audio_data=result['audio_data'],
                        audio_format=result['audio_format'],
                        duration=result['duration'],
                        cache_key=cache_key
                    )
                    
                    # End benchmark
                    self.benchmarker.end_benchmark(
                        success=True, 
                        audio_duration=result.get('duration', 0.0),
                        audio_size_bytes=len(result['audio_data'])
                    )
                    
                    return response
                
                except Exception as fallback_error:
                    logger.error(f"Fallback provider error: {str(fallback_error)}")
                    # Both providers failed, return failure
                    self.benchmarker.end_benchmark(success=False)
                    context.set_code(grpc.StatusCode.INTERNAL)
                    context.set_details(f"Both primary and fallback TTS providers failed: {str(primary_error)}; {str(fallback_error)}")
                    return tts_pb2.TTSResponse(
                        success=False,
                        message=f"TTS generation failed with both providers: {str(primary_error)}; {str(fallback_error)}"
                    )
            else:
                # No fallback provider available
                self.benchmarker.end_benchmark(success=False)
                context.set_code(grpc.StatusCode.INTERNAL)
                context.set_details(f"TTS provider error: {str(primary_error)}")
                return tts_pb2.TTSResponse(
                    success=False,
                    message=f"TTS provider error: {str(primary_error)}"
                )
        
        except Exception as e:
            logger.error(f"Error in GenerateSpeech: {str(e)}")
            # End benchmark with failure
            self.benchmarker.end_benchmark(success=False)
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Internal error: {str(e)}")
            return tts_pb2.TTSResponse(
                success=False,
                message=f"Error: {str(e)}"
            )
    
    def GeneratePhonemeAudio(self, request, context):
        """
        Generates audio sample for a specific phoneme.
        """
        # Start service-level benchmark
        self.benchmarker.start_benchmark(
            provider="service", 
            operation="GeneratePhonemeAudio", 
            language=request.language_code,
            voice_id=request.voice_id if request.voice_id else "default"
        )
        
        try:
            logger.info(f"Received phoneme audio request for: {request.phoneme}")
            
            # Generate cache key
            cache_key = f"phoneme_{request.phoneme}_{request.word}_{request.language_code}_{request.voice_id}"
            
            # Check cache first
            cached_item = self.cache.get(cache_key)
            if cached_item:
                logger.info(f"Cache hit for phoneme: {request.phoneme}")
                # Log cache hit for ML monitoring
                self.ml_monitor.log_cache_event(hit=True, key=cache_key, context="phoneme")
                
                # If audio data is not in the cache but we have its storage location
                if 's3_url' in cached_item and not cached_item.get('audio_data'):
                    # Retrieve from storage
                    audio_data = self.storage.retrieve(cache_key, cached_item['audio_format'])
                    if audio_data:
                        cached_item['audio_data'] = audio_data
                
                # Create response from cached item
                response = tts_pb2.TTSResponse(
                    success=True,
                    message="Phoneme audio retrieved from cache",
                    audio_data=cached_item.get('audio_data', b''),
                    audio_format=cached_item.get('audio_format', request.audio_format),
                    duration=cached_item.get('duration', 0.0),
                    cache_key=cache_key
                )
                
                # End benchmark
                self.benchmarker.end_benchmark(
                    success=True, 
                    audio_duration=cached_item.get('duration', 0.0),
                    audio_size_bytes=len(cached_item.get('audio_data', b''))
                )
                
                return response
            
            # Not in cache, generate phoneme audio
            # Log cache miss for ML monitoring
            self.ml_monitor.log_cache_event(hit=False, key=cache_key, context="phoneme")
            try:
                result = self.provider.synthesize_phoneme(
                    phoneme=request.phoneme,
                    word=request.word,
                    language_code=request.language_code,
                    voice_id=request.voice_id if request.voice_id else None,
                    audio_format=request.audio_format
                )
                
                # Store the audio data
                if Config.STORAGE_ENABLED:
                    s3_url = self.storage.store(
                        audio_data=result['audio_data'],
                        key=cache_key,
                        audio_format=result['audio_format']
                    )
                    if s3_url:
                        result['s3_url'] = s3_url
            except Exception as primary_error:
                logger.error(f"Primary provider phoneme error: {str(primary_error)}")
                
                # Try fallback provider if configured
                if self.fallback_provider and Config.USE_FALLBACK_PROVIDER:
                    logger.info(f"Attempting to use fallback provider for phoneme")
                    result = self.fallback_provider.synthesize_phoneme(
                        phoneme=request.phoneme,
                        word=request.word,
                        language_code=request.language_code,
                        voice_id=request.voice_id if request.voice_id else None,
                        audio_format=request.audio_format
                    )
                    
                    # Store the audio data
                    if Config.STORAGE_ENABLED:
                        s3_url = self.storage.store(
                            audio_data=result['audio_data'],
                            key=cache_key,
                            audio_format=result['audio_format']
                        )
                        if s3_url:
                            result['s3_url'] = s3_url
                else:
                    # Re-raise the original error if no fallback available
                    raise primary_error
                
                # Cache the result
                self.cache.put(cache_key, result)
                
                # Create response
                response = tts_pb2.TTSResponse(
                    success=True,
                    message="Phoneme audio generation successful",
                    audio_data=result['audio_data'],
                    audio_format=result['audio_format'],
                    duration=result['duration'],
                    cache_key=cache_key
                )
                
                # End benchmark
                self.benchmarker.end_benchmark(
                    success=True, 
                    audio_duration=result.get('duration', 0.0),
                    audio_size_bytes=len(result['audio_data'])
                )
                
                return response
                
            except Exception as e:
                logger.error(f"Provider error: {str(e)}")
                # End benchmark with failure
                self.benchmarker.end_benchmark(success=False)
                context.set_code(grpc.StatusCode.INTERNAL)
                context.set_details(f"Phoneme synthesis error: {str(e)}")
                return tts_pb2.TTSResponse(
                    success=False,
                    message=f"Phoneme synthesis error: {str(e)}"
                )
                
        except Exception as e:
            logger.error(f"Error in GeneratePhonemeAudio: {str(e)}")
            # End benchmark with failure
            self.benchmarker.end_benchmark(success=False)
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Internal error: {str(e)}")
            return tts_pb2.TTSResponse(
                success=False,
                message=f"Error: {str(e)}"
            )
    
    def ListVoices(self, request, context):
        """
        Lists available voices for a language.
        """
        try:
            language_code = request.language_code if request.language_code else None
            gender = request.gender if request.gender else None
            neural_only = request.neural_only if request.neural_only else False
            
            logger.info(f"Received ListVoices request. Language: {language_code}, Gender: {gender}")
            
            # Get voices from provider
            voices = self.provider.list_voices(
                language_code=language_code,
                gender=gender,
                neural_only=neural_only
            )
            
            # Convert to proto messages
            voice_messages = []
            for voice in voices:
                voice_message = tts_pb2.Voice(
                    voice_id=voice['voice_id'],
                    name=voice['name'],
                    language_code=voice['language_code'],
                    gender=voice['gender'],
                    neural=voice['neural'],
                    provider=voice['provider'],
                    accent=voice.get('accent', '')
                )
                voice_messages.append(voice_message)
            
            return tts_pb2.ListVoicesResponse(
                success=True,
                message=f"Found {len(voice_messages)} voices",
                voices=voice_messages
            )
            
        except Exception as e:
            logger.error(f"Error in ListVoices: {str(e)}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Internal error: {str(e)}")
            return tts_pb2.ListVoicesResponse(
                success=False,
                message=f"Error: {str(e)}"
            )
    
    def HealthCheck(self, request, context):
        """
        Health check endpoint
        """
        # Get cache metrics for health check report
        cache_hits = float(MODEL_CACHE_HITS._value.get())
        cache_misses = float(MODEL_CACHE_MISSES._value.get())
        cache_hit_ratio = cache_hits / (cache_hits + cache_misses) if (cache_hits + cache_misses) > 0 else 0
        
        health_details = {
            "cache_hit_ratio": f"{cache_hit_ratio:.2%}",
            "cache_hits": int(cache_hits),
            "cache_misses": int(cache_misses),
            "providers": {}
        }
        
        # Add provider status
        for provider, available in self.ml_monitor.providers_status.items():
            health_details["providers"][provider] = "available" if available else "unavailable"
        
        return tts_pb2.HealthCheckResponse(
            status=True,
            message=f"TTS Service is healthy - Cache hit ratio: {cache_hit_ratio:.2%}",
            details=json.dumps(health_details)
        )

    def SubmitFeedback(self, request, context):
        """Handles user feedback submissions by publishing to Kafka topic"""
        try:
            event = {
                "user_id": request.user_id,
                "request_id": request.request_id,
                "feedback_score": request.feedback_score,
                "comment": request.comment,
                "event_timestamp": request.event_timestamp
            }
            # send to Kafka
            self.producer.send(
                Config.KAFKA_TOPIC_FEEDBACK,
                value=event
            )
            self.producer.flush()
            return tts_pb2.FeedbackResponse(success=True, message="Feedback submitted")
        except Exception as e:
            logger.error(f"Error submitting feedback event: {e}")
            return tts_pb2.FeedbackResponse(success=False, message=str(e))

def serve():
    """
    Start the gRPC server
    """
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    tts_pb2_grpc.add_TTSServiceServicer_to_server(
        TTSService(), server
    )
    
    server_address = "[::]:50053"
    server.add_insecure_port(server_address)
    server.start()
    logger.info(f"TTS service listening on {server_address}")
    
    # Keep the server running
    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Server stopping...")
        server.stop(0)


if __name__ == "__main__":
    serve()
