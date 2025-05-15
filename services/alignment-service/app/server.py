import os
import grpc
import time
import uuid
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
from proto import alignment_pb2, alignment_pb2_grpc
from app.alignment import AlignmentEngine
from app.cache import AlignmentCache
from app.storage import S3Storage
from app.config import Config

# Set up metrics
REQUEST_TIME = Summary('alignment_request_processing_seconds', 'Time spent processing alignment requests')
REQUEST_COUNT = Counter('alignment_requests_total', 'Total number of alignment requests', ['language', 'success'])
MODEL_MEMORY_USAGE = Gauge('alignment_model_memory_mb', 'Memory usage of alignment models in MB')

class AlignmentService(alignment_pb2_grpc.AlignmentServiceServicer):
    """
    Service for performing audio-text alignment using WhisperX or similar models.
    """
    
    def __init__(self):
        logger.info("Initializing AlignmentService")
        # Initialize the alignment engine
        self.engine = AlignmentEngine()
        
        # Initialize cache with config values
        self.cache = AlignmentCache(
            max_size=Config.CACHE_MAX_SIZE,
            ttl=Config.CACHE_TTL_SECONDS
        )
        
        # Initialize S3 storage if enabled
        self.storage = None
        if Config.STORAGE_ENABLED and os.environ.get('AWS_ACCESS_KEY_ID') and os.environ.get('AWS_SECRET_ACCESS_KEY'):
            logger.info("Initializing S3 storage")
            self.storage = S3Storage()
        
    @REQUEST_TIME.time()
    def AlignText(self, request, context):
        """
        Aligns audio with text using WhisperX and returns timestamp and phoneme information.
        """
        start_time = time.time()
        try:
            logger.info(f"Received alignment request for language: {request.language_code}")
            
            # Check cache first
            cached_result = self.cache.get(
                audio_data=request.audio_data,
                text=request.text, 
                language_code=request.language_code
            )
            
            if cached_result:
                logger.info("Using cached alignment result")
                result = cached_result
            else:
                # Use the alignment engine to align the text
                result = self.engine.align_text(
                    audio_data=request.audio_data,
                    text=request.text,
                    language_code=request.language_code,
                    audio_format=request.audio_format,
                    alignment_level=request.alignment_level
                )
                
                # Cache the result
                self.cache.put(
                    audio_data=request.audio_data,
                    text=request.text,
                    language_code=request.language_code,
                    result=result
                )
                
                # Store in S3 if available
                if self.storage:
                    self.storage.store_alignment(result["alignment_id"], result)
            
            # Create response
            response = alignment_pb2.AlignmentResponse(
                success=True,
                message="Alignment successful",
                alignment_id=result["alignment_id"]
            )
            
            # Add word alignments
            for word_align in result["word_alignments"]:
                word_alignment = alignment_pb2.WordAlignment(
                    word=word_align["word"],
                    start_time=word_align["start_time"],
                    end_time=word_align["end_time"],
                    confidence=word_align["confidence"]
                )
                response.word_alignments.append(word_alignment)
            
            # Add phoneme alignments if available
            for phoneme_align in result["phoneme_alignments"]:
                phoneme_alignment = alignment_pb2.PhonemeAlignment(
                    phoneme=phoneme_align["phoneme"],
                    word=phoneme_align["word"],
                    start_time=phoneme_align["start_time"],
                    end_time=phoneme_align["end_time"],
                    confidence=phoneme_align["confidence"]
                )
                response.phoneme_alignments.append(phoneme_alignment)
            
            # Record metrics
            REQUEST_COUNT.labels(language=request.language_code, success='true').inc()
            
            logger.info(f"Alignment completed in {time.time() - start_time:.2f} seconds")
            return response
            
        except Exception as e:
            logger.error(f"Error in AlignText: {str(e)}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Internal error: {str(e)}")
            REQUEST_COUNT.labels(language=request.language_code, success='false').inc()
            return alignment_pb2.AlignmentResponse(
                success=False,
                message=f"Error: {str(e)}"
            )
    
    def HealthCheck(self, request, context):
        """
        Health check endpoint
        """
        try:
            # Check if we can load a model - indicates system health
            test_model = "en"
            self.engine._ensure_model_loaded(test_model)
            
            return alignment_pb2.HealthCheckResponse(
                status=True,
                message="Service is healthy"
            )
        except Exception as e:
            logger.error(f"Health check failed: {str(e)}")
            return alignment_pb2.HealthCheckResponse(
                status=False,
                message=f"Service unhealthy: {str(e)}"
            )

def serve():
    """
    Start the gRPC server
    """
    # Start Prometheus metrics server
    start_http_server(Config.METRICS_PORT)
    logger.info(f"Prometheus metrics server started on port {Config.METRICS_PORT}")
    
    # Display configuration
    logger.info(f"Starting with configuration: {Config.as_dict()}")
    
    # Create server with appropriate number of workers
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    alignment_pb2_grpc.add_AlignmentServiceServicer_to_server(
        AlignmentService(), server
    )
    
    server_address = f"[::]:{Config.GRPC_PORT}"
    server.add_insecure_port(server_address)
    server.start()
    logger.info(f"Alignment service listening on {server_address}")
    
    # Keep the server running
    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Server stopping...")
        server.stop(0)


if __name__ == "__main__":
    serve()
