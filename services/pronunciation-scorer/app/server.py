import os
import grpc
import time
import uuid
import json
from concurrent import futures
import logging
from prometheus_client import start_http_server, Summary, Counter, Gauge

# Configure logging
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import generated gRPC modules
from proto import pronunciation_scorer_pb2, pronunciation_scorer_pb2_grpc

# Import application modules
from app.config import Config
from app.scoring_provider import ScoringProvider
from app.cache import ScoringCache
from app.storage import ScoringStorage
from app.language_detector import LanguageDetector

# Import MongoDB storage if enabled
if Config.MONGODB_ENABLED:
    from app.mongodb_storage import MongoDBScoringStorage, MongoDBScoringCache

# Set up metrics
REQUEST_TIME = Summary('pronunciation_scoring_seconds', 'Time spent processing scoring requests')
REQUEST_COUNT = Counter('pronunciation_scoring_total', 'Total number of scoring requests', ['language', 'success'])
PROVIDER_USAGE = Counter('pronunciation_scorer_provider_usage', 'Provider usage count', ['provider'])
MODEL_MEMORY_USAGE = Gauge('pronunciation_scorer_memory_mb', 'Memory usage of scoring models in MB')

class PronunciationScorerService(pronunciation_scorer_pb2_grpc.PronunciationScorerServiceServicer):
    """
    Service for scoring pronunciation based on audio-text alignment.
    Uses Goodness of Pronunciation (GOP) algorithm with Azure fallback.
    """
    
    def __init__(self):
        logger.info("Initializing PronunciationScorerService")
        
        # Initialize storage and cache based on configuration
        self.storage = None
        
        # Use MongoDB if enabled
        if Config.MONGODB_ENABLED:
            logger.info("Initializing MongoDB storage and cache")
            self.storage = MongoDBScoringStorage()
            self.cache = MongoDBScoringCache()
        else:
            # Initialize in-memory cache
            self.cache = ScoringCache()
            
            # Initialize AWS storage if enabled
            if Config.STORAGE_ENABLED:
                logger.info("Initializing AWS storage")
                self.storage = ScoringStorage()
        
        # Initialize language detector
        self.language_detector = LanguageDetector()
        
        # Maintain provider instances for different languages
        self.scoring_providers = {}
        
        # Track model memory usage
        MODEL_MEMORY_USAGE.set(0)  # Initial value
    
    def _get_scoring_provider(self, language_code):
        """
        Get or create a scoring provider for the specified language.
        
        Args:
            language_code: Language code
            
        Returns:
            ScoringProvider: A scoring provider instance
        """
        if language_code not in self.scoring_providers:
            logger.info(f"Creating new scoring provider for language: {language_code}")
            self.scoring_providers[language_code] = ScoringProvider.get_provider(language_code)
            
            # Update estimated memory usage metrics
            # Rough estimate: each model takes ~500MB
            MODEL_MEMORY_USAGE.set(len(self.scoring_providers) * 500)
        
        return self.scoring_providers[language_code]
    
    def _convert_alignments(self, proto_alignments):
        """
        Convert protobuf alignments to dictionary format.
        
        Args:
            proto_alignments: Protobuf alignment objects
            
        Returns:
            dict: Alignments as dictionaries
        """
        alignments = {
            'word_alignments': [],
            'phoneme_alignments': []
        }
        
        for alignment in proto_alignments:
            # Word alignments
            for word_align in alignment.word_alignments:
                alignments['word_alignments'].append({
                    'word': word_align.word,
                    'start_time': word_align.start_time,
                    'end_time': word_align.end_time,
                    'confidence': word_align.confidence
                })
            
            # Phoneme alignments
            for phoneme_align in alignment.phoneme_alignments:
                alignments['phoneme_alignments'].append({
                    'phoneme': phoneme_align.phoneme,
                    'start_time': phoneme_align.start_time,
                    'end_time': phoneme_align.end_time,
                    'confidence': phoneme_align.confidence,
                    'word': phoneme_align.word
                })
        
        return alignments
    
    def _convert_to_proto_response(self, result, success=True, error_message=None):
        """
        Convert scoring result to protobuf response.
        
        Args:
            result: Scoring result dictionary
            success: Whether the scoring was successful
            error_message: Error message if any
            
        Returns:
            ScoringResponse: Protobuf response
        """
        response = pronunciation_scorer_pb2.ScoringResponse(
            success=success,
            message="Scoring successful" if success else error_message,
            scoring_id=result.get('scoring_id', str(uuid.uuid4()))
        )
        
        # Overall score
        if 'overall_score' in result:
            overall_score = pronunciation_scorer_pb2.PronunciationScore(
                score=result['overall_score'].get('score', 0.0),
                feedback=result['overall_score'].get('feedback', [])
            )
            response.overall_score.CopyFrom(overall_score)
        
        # Word scores
        for word_score in result.get('word_scores', []):
            proto_word_score = pronunciation_scorer_pb2.WordScore(
                word=word_score.get('word', ''),
                score=word_score.get('score', 0.0),
                issues=word_score.get('issues', []),
                start_time=word_score.get('start_time', 0.0),
                end_time=word_score.get('end_time', 0.0)
            )
            response.word_scores.append(proto_word_score)
        
        # Phoneme scores
        for phoneme_score in result.get('phoneme_scores', []):
            proto_phoneme_score = pronunciation_scorer_pb2.PhonemeScore(
                phoneme=phoneme_score.get('phoneme', ''),
                word=phoneme_score.get('word', ''),
                score=phoneme_score.get('score', 0.0),
                issue=phoneme_score.get('issue', ''),
                start_time=phoneme_score.get('start_time', 0.0),
                end_time=phoneme_score.get('end_time', 0.0)
            )
            response.phoneme_scores.append(proto_phoneme_score)
        
        return response
        
    @REQUEST_TIME.time()
    def ScorePronunciation(self, request, context):
        """
        Scores pronunciation based on aligned audio and text.
        """
        start_time = time.time()
        language_code = request.language_code
        
        try:
            # If no language code is provided, detect it
            if not language_code:
                detected_lang, confidence = self.language_detector.detect_language(
                    request.audio_data, 
                    request.audio_format
                )
                language_code = detected_lang
                logger.info(f"Detected language: {language_code} with confidence {confidence:.2f}")
            
            # Normalize language code (strip region if present)
            if '-' in language_code:
                base_lang = language_code.split('-')[0]
            else:
                base_lang = language_code
                
            logger.info(f"Processing scoring request for language: {language_code} (base: {base_lang})")
            
            # Try to get from cache first
            alignments = self._convert_alignments(request.alignments)
            cached_result = self.cache.get(
                request.audio_data, 
                request.text, 
                base_lang,
                alignments
            )
            
            if cached_result:
                logger.info("Found result in cache")
                REQUEST_COUNT.labels(language=base_lang, success="true").inc()
                return self._convert_to_proto_response(cached_result)
            
            # Get the appropriate scoring provider
            provider = self._get_scoring_provider(base_lang)
            
            # Score the pronunciation
            result = provider.score_pronunciation(
                audio_data=request.audio_data,
                text=request.text,
                alignments=alignments,
                scoring_level=request.scoring_level
            )
            
            # Add to cache
            self.cache.put(
                request.audio_data, 
                request.text, 
                base_lang,
                alignments,
                result
            )
            
            # Store result if storage is enabled and audio has a minimum length
            if self.storage and len(request.audio_data) > 1000:  # Ignore very short audio
                wallet_address = context.invocation_metadata().get('wallet_address', 'unknown')
                if wallet_address:
                    self.storage.store_result(
                        result['scoring_id'],
                        wallet_address,
                        base_lang,
                        result
                    )
            
            # Update metrics
            REQUEST_COUNT.labels(language=base_lang, success="true").inc()
            PROVIDER_USAGE.labels(provider="gop" if Config.USE_GOP else "azure").inc()
            
            # Log processing time
            elapsed = time.time() - start_time
            logger.info(f"Processed scoring request in {elapsed:.2f} seconds")
            
            return self._convert_to_proto_response(result)
            
        except Exception as e:
            logger.error(f"Error in ScorePronunciation: {str(e)}")
            REQUEST_COUNT.labels(language=language_code or "unknown", success="false").inc()
            
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Internal error: {str(e)}")
            return pronunciation_scorer_pb2.ScoringResponse(
                success=False,
                message=f"Error: {str(e)}"
            )
    
    def HealthCheck(self, request, context):
        """
        Health check endpoint
        """
        return pronunciation_scorer_pb2.HealthCheckResponse(
            status=True,
            message="Service is healthy"
        )

def serve():
    """
    Start the gRPC server
    """
    # Start Prometheus metrics server
    metrics_port = Config.METRICS_PORT
    start_http_server(metrics_port)
    logger.info(f"Metrics server started on port {metrics_port}")
    
    # Start gRPC server
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    pronunciation_scorer_pb2_grpc.add_PronunciationScorerServiceServicer_to_server(
        PronunciationScorerService(), server
    )
    
    server_address = f"[::]:{Config.GRPC_PORT}"
    server.add_insecure_port(server_address)
    server.start()
    logger.info(f"Pronunciation scorer service listening on {server_address}")
    
    # Keep the server running
    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        logger.error("Server stopping due to keyboard interrupt")
        server.stop(0)
    except Exception as e:
        logger.error(f"Server stopping due to error: {str(e)}")
        server.stop(0)


if __name__ == "__main__":
    serve()
