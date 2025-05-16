import grpc
import logging
import time
from concurrent import futures
import uuid
from typing import Dict, Any, List, Optional

# Import generated proto classes
from proto import voice_pb2
from proto import voice_pb2_grpc

# Import service clients
from app.service_clients import AlignmentClient, PronunciationScorerClient

# Import config
from app.config import Config

# Import storage
from app.mongodb_storage import MongoDBCache, MongoDBStorage
from app.storage import get_storage, get_cache

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VoiceScoreServicer(voice_pb2_grpc.VoiceScoreServicer):
    """Implementation of the VoiceScore service."""
    
    def __init__(self):
        self.storage = get_storage()
        self.cache = get_cache()
        
        # Create clients for dependent services
        self.alignment_client = None
        self.pronunciation_scorer_client = None
        
        # Initialize clients lazily
        self._initialize_service_clients()
        
        # Initialize metrics
        self._initialize_metrics()
    
    def _initialize_service_clients(self):
        """Initialize clients for dependent services."""
        try:
            self.alignment_client = AlignmentClient()
            logger.info("Alignment client initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize alignment client: {e}")
            self.alignment_client = None
        
        try:
            self.pronunciation_scorer_client = PronunciationScorerClient()
            logger.info("Pronunciation scorer client initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize pronunciation scorer client: {e}")
            self.pronunciation_scorer_client = None
    
    def _initialize_metrics(self):
        """Initialize Prometheus metrics."""
        # Only import if metrics are enabled
        if Config.METRICS_ENABLED:
            try:
                from prometheus_client import Counter, Histogram, start_http_server
                
                # Start Prometheus HTTP server
                start_http_server(Config.METRICS_PORT)
                
                # Define metrics
                self.request_counter = Counter(
                    'voice_score_requests_total',
                    'Total number of requests received',
                    ['method', 'status']
                )
                self.latency_histogram = Histogram(
                    'voice_score_request_latency_seconds',
                    'Request latency in seconds',
                    ['method']
                )
                
                logger.info(f"Metrics server started on port {Config.METRICS_PORT}")
            except ImportError:
                logger.warning("Prometheus client not installed. Metrics disabled.")
                Config.METRICS_ENABLED = False
            except Exception as e:
                logger.warning(f"Failed to start metrics server: {e}")
                Config.METRICS_ENABLED = False
    
    def _record_metrics(self, method: str, status: str, duration: float):
        """Record metrics for a request."""
        if Config.METRICS_ENABLED:
            try:
                self.request_counter.labels(method=method, status=status).inc()
                self.latency_histogram.labels(method=method).observe(duration)
            except Exception as e:
                logger.warning(f"Failed to record metrics: {e}")
    
    def Evaluate(self, request, context):
        """Legacy evaluation method."""
        start_time = time.time()
        method = "Evaluate"
        
        try:
            # Generate a cache key based on the request
            cache_key = f"eval:{hash(request.audio)}-{hash(request.expected_phrase)}"
            
            # Check cache first
            cached_result = self.cache.get(cache_key)
            if cached_result:
                logger.info("Using cached evaluation result")
                response = voice_pb2.EvalResponse(**cached_result)
                self._record_metrics(method, "success", time.time() - start_time)
                return response
            
            # Implement simple scoring (legacy method)
            # In practice, this would involve your existing evaluation logic
            
            # For now, just return a dummy response
            response = voice_pb2.EvalResponse(
                transcript=request.expected_phrase,
                score=0.85,
                pass_=True
            )
            
            # Cache the result
            self.cache.put(cache_key, {
                "transcript": response.transcript,
                "score": response.score,
                "pass_": response.pass_
            })
            
            self._record_metrics(method, "success", time.time() - start_time)
            return response
            
        except Exception as e:
            logger.error(f"Error in Evaluate: {e}")
            self._record_metrics(method, "error", time.time() - start_time)
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Internal error: {e}")
            return voice_pb2.EvalResponse()
    
    def EvaluateDetailed(self, request, context):
        """Detailed evaluation method using the three-stage pipeline."""
        start_time = time.time()
        method = "EvaluateDetailed"
        
        try:
            # Check if required services are available
            if not self.alignment_client or not self.pronunciation_scorer_client:
                logger.error("Required services are not available")
                self._initialize_service_clients()  # Try to reinitialize
                if not self.alignment_client or not self.pronunciation_scorer_client:
                    self._record_metrics(method, "error", time.time() - start_time)
                    context.set_code(grpc.StatusCode.UNAVAILABLE)
                    context.set_details("Required services are not available")
                    return voice_pb2.DetailedEvalResponse()
            
            # Generate a cache key based on the request
            cache_key = f"detailed_eval:{hash(request.audio)}-{hash(request.expected_phrase)}-{request.language_code}-{request.detail_level}"
            
            # Check cache first
            cached_result = self.cache.get(cache_key)
            if cached_result:
                logger.info("Using cached detailed evaluation result")
                self._record_metrics(method, "success", time.time() - start_time)
                return voice_pb2.DetailedEvalResponse(**cached_result)
            
            # 1. Get alignment from alignment service
            language_code = request.language_code or Config.DEFAULT_LANGUAGE_CODE
            detail_level = request.detail_level or Config.DEFAULT_DETAIL_LEVEL
            
            alignment_result = self.alignment_client.align_text(
                audio_data=request.audio,
                text=request.expected_phrase,
                language_code=language_code,
                audio_format="wav",  # Assuming WAV format for now
                alignment_level=detail_level
            )
            
            if not alignment_result.get("success", False):
                logger.error(f"Alignment failed: {alignment_result.get('message', 'Unknown error')}")
                self._record_metrics(method, "error", time.time() - start_time)
                context.set_code(grpc.StatusCode.INTERNAL)
                context.set_details(f"Alignment failed: {alignment_result.get('message', 'Unknown error')}")
                return voice_pb2.DetailedEvalResponse()
            
            # 2. Get scoring from pronunciation scorer service
            scoring_result = self.pronunciation_scorer_client.score_pronunciation(
                audio_data=request.audio,
                text=request.expected_phrase,
                language_code=language_code,
                audio_format="wav",  # Assuming WAV format for now
                alignments=alignment_result,
                scoring_level=detail_level
            )
            
            if not scoring_result.get("success", False):
                logger.error(f"Scoring failed: {scoring_result.get('message', 'Unknown error')}")
                self._record_metrics(method, "error", time.time() - start_time)
                context.set_code(grpc.StatusCode.INTERNAL)
                context.set_details(f"Scoring failed: {scoring_result.get('message', 'Unknown error')}")
                return voice_pb2.DetailedEvalResponse()
            
            # 3. Create the detailed response
            word_details = []
            for word_score in scoring_result.get("word_scores", []):
                word_detail = voice_pb2.WordDetail(
                    word=word_score["word"],
                    start_time=word_score["start_time"],
                    end_time=word_score["end_time"],
                    score=word_score["score"],
                    issues=word_score.get("issues", [])
                )
                word_details.append(word_detail)
            
            phoneme_details = []
            for phoneme_score in scoring_result.get("phoneme_scores", []):
                phoneme_detail = voice_pb2.PhonemeDetail(
                    phoneme=phoneme_score["phoneme"],
                    word=phoneme_score["word"],
                    start_time=phoneme_score["start_time"],
                    end_time=phoneme_score["end_time"],
                    score=phoneme_score["score"],
                    issue=phoneme_score.get("issue", "")
                )
                phoneme_details.append(phoneme_detail)
            
            # Create unique evaluation ID
            evaluation_id = str(uuid.uuid4())
            
            overall_score = scoring_result.get("overall_score", {}).get("score", 0.0)
            pass_threshold = Config.PASS_THRESHOLD
            
            response = voice_pb2.DetailedEvalResponse(
                transcript=request.expected_phrase,  # Using expected_phrase as transcript
                overall_score=overall_score,
                pass_=overall_score >= pass_threshold,
                words=word_details,
                phonemes=phoneme_details,
                feedback=scoring_result.get("overall_score", {}).get("feedback", []),
                evaluation_id=evaluation_id,
                alignment_id=alignment_result.get("alignment_id", ""),
                scoring_id=scoring_result.get("scoring_id", "")
            )
            
            # Cache the result
            self.cache.put(cache_key, {
                "transcript": response.transcript,
                "overall_score": response.overall_score,
                "pass_": response.pass_,
                "words": [
                    {
                        "word": wd.word,
                        "start_time": wd.start_time,
                        "end_time": wd.end_time,
                        "score": wd.score,
                        "issues": list(wd.issues)
                    } for wd in word_details
                ],
                "phonemes": [
                    {
                        "phoneme": pd.phoneme,
                        "word": pd.word,
                        "start_time": pd.start_time,
                        "end_time": pd.end_time,
                        "score": pd.score,
                        "issue": pd.issue
                    } for pd in phoneme_details
                ],
                "feedback": list(response.feedback),
                "evaluation_id": response.evaluation_id,
                "alignment_id": response.alignment_id,
                "scoring_id": response.scoring_id
            })
            
            self._record_metrics(method, "success", time.time() - start_time)
            return response
            
        except Exception as e:
            logger.error(f"Error in EvaluateDetailed: {e}")
            self._record_metrics(method, "error", time.time() - start_time)
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Internal error: {e}")
            return voice_pb2.DetailedEvalResponse()
    
    def HealthCheck(self, request, context):
        """Health check endpoint."""
        start_time = time.time()
        method = "HealthCheck"
        
        try:
            # Check dependent services
            alignment_status = False
            pronunciation_scorer_status = False
            
            if self.alignment_client:
                alignment_status, alignment_message = self.alignment_client.check_health()
            else:
                alignment_message = "Alignment client not initialized"
            
            if self.pronunciation_scorer_client:
                pronunciation_scorer_status, pronunciation_scorer_message = self.pronunciation_scorer_client.check_health()
            else:
                pronunciation_scorer_message = "Pronunciation scorer client not initialized"
            
            # Overall status is healthy if all dependencies are healthy or if we're falling back to legacy mode
            status = True
            if Config.USE_FALLBACK_SCORING:
                message = f"Healthy (fallback mode available). Alignment: {alignment_status}, Pronunciation scorer: {pronunciation_scorer_status}"
            else:
                status = alignment_status and pronunciation_scorer_status
                message = f"Alignment: {alignment_message}, Pronunciation scorer: {pronunciation_scorer_message}"
            
            self._record_metrics(method, "success", time.time() - start_time)
            return voice_pb2.HealthCheckResponse(
                status=status,
                message=message
            )
            
        except Exception as e:
            logger.error(f"Error in HealthCheck: {e}")
            self._record_metrics(method, "error", time.time() - start_time)
            return voice_pb2.HealthCheckResponse(
                status=False,
                message=f"Error: {e}"
            )

def serve():
    """Start the server."""
    # Configure gRPC server
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=Config.MAX_WORKERS),
        options=[
            ('grpc.max_concurrent_streams', Config.MAX_CONCURRENT_RPCS),
            ('grpc.max_receive_message_length', 10 * 1024 * 1024),  # 10 MB
        ]
    )
    
    # Register servicer
    voice_pb2_grpc.add_VoiceScoreServicer_to_server(VoiceScoreServicer(), server)
    
    # Start server
    server.add_insecure_port(f"[::]:{Config.SERVICE_PORT}")
    server.start()
    
    logger.info(f"Server started on port {Config.SERVICE_PORT}")
    
    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Shutting down server")
        server.stop(0)

if __name__ == "__main__":
    serve()
