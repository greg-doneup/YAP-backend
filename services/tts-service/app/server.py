import os
import grpc
from concurrent import futures
import logging
import time
from typing import Dict, Any, Optional

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
from app.storage import get_cache, get_storage
from app.language_detection import get_language_detector
from app.alignment_client import AlignmentServiceClient
from app.benchmarking import get_benchmarker

class TTSService(tts_pb2_grpc.TTSServiceServicer):
    """
    Service for generating speech from text (Text-to-Speech) in multiple languages.
    """
    
    def __init__(self):
        logger.info("Initializing TTSService")
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
        # Start service-level benchmark
        self.benchmarker.start_benchmark(
            provider="service", 
            operation="GenerateSpeech", 
            language=request.language_code,
            voice_id=request.voice_id if request.voice_id else "default"
        )
        
        try:
            logger.info(f"Received TTS request for language: {request.language_code}")
            
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
            
            # Check cache first
            cached_item = self.cache.get(cache_key)
            if cached_item:
                logger.info(f"Cache hit for key: {cache_key}")
                
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
            
            # Check if SSML is provided
            ssml = request.ssml if hasattr(request, 'ssml') and request.ssml else None
            
            # Call the primary provider to generate speech
            try:
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
        return tts_pb2.HealthCheckResponse(
            status=True,
            message="TTS Service is healthy"
        )

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
