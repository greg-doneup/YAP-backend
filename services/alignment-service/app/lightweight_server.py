"""
Lightweight server implementation for the alignment service.
Uses basic audio processing instead of heavy ML models.
"""

import os
import grpc
import time
import logging
from concurrent import futures
from prometheus_client import start_http_server, Summary, Counter

# Configure logging
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import generated gRPC modules
from proto import alignment_pb2, alignment_pb2_grpc
from app.lightweight_aligner import LightweightAligner

# Set up metrics
REQUEST_TIME = Summary('alignment_request_processing_seconds', 'Time spent processing alignment requests')
REQUEST_COUNT = Counter('alignment_requests_total', 'Total number of alignment requests', ['language', 'success'])

class LightweightAlignmentService(alignment_pb2_grpc.AlignmentServiceServicer):
    """
    Lightweight alignment service using basic audio processing.
    """
    
    def __init__(self):
        logger.info("Initializing LightweightAlignmentService")
        self.aligner = LightweightAligner()
        logger.info("LightweightAlignmentService initialized successfully")
    
    def AlignText(self, request, context):
        """
        Perform audio-text alignment using lightweight methods.
        """
        start_time = time.time()
        
        try:
            logger.info(f"Processing alignment request for language: {request.language_code}")
            
            # Perform alignment
            result = self.aligner.align_audio_text(
                audio_data=request.audio_data,
                text=request.text,
                language_code=request.language_code
            )
            
            # Create response
            response = alignment_pb2.AlignmentResponse()
            response.success = result["success"]
            response.message = result["message"]
            response.alignment_id = result["alignment_id"]
            
            # Add word alignments
            for word_alignment in result["word_alignments"]:
                word_align = response.word_alignments.add()
                word_align.word = word_alignment["word"]
                word_align.start_time = word_alignment["start_time"]
                word_align.end_time = word_alignment["end_time"]
                word_align.confidence = word_alignment["confidence"]
            
            # Add phoneme alignments
            for phoneme_alignment in result["phoneme_alignments"]:
                phoneme_align = response.phoneme_alignments.add()
                phoneme_align.phoneme = phoneme_alignment["phoneme"]
                phoneme_align.word = phoneme_alignment["word"]
                phoneme_align.start_time = phoneme_alignment["start_time"]
                phoneme_align.end_time = phoneme_alignment["end_time"]
                phoneme_align.confidence = phoneme_alignment["confidence"]
            
            # Record metrics
            processing_time = time.time() - start_time
            REQUEST_TIME.observe(processing_time)
            REQUEST_COUNT.labels(language=request.language_code, success='true').inc()
            
            logger.info(f"Alignment completed in {processing_time:.2f}s")
            return response
            
        except Exception as e:
            logger.error(f"Alignment failed: {str(e)}")
            
            # Record failure metrics
            processing_time = time.time() - start_time
            REQUEST_TIME.observe(processing_time)
            REQUEST_COUNT.labels(language=request.language_code, success='false').inc()
            
            # Return error response
            response = alignment_pb2.AlignmentResponse()
            response.success = False
            response.message = f"Alignment failed: {str(e)}"
            response.alignment_id = ""
            
            return response
    
    def HealthCheck(self, request, context):
        """
        Health check endpoint.
        """
        try:
            response = alignment_pb2.HealthCheckResponse()
            response.status = True
            response.message = "Lightweight alignment service is healthy"
            return response
        except Exception as e:
            logger.error(f"Health check failed: {str(e)}")
            response = alignment_pb2.HealthCheckResponse()
            response.status = False
            response.message = f"Health check failed: {str(e)}"
            return response

def serve():
    """
    Start the lightweight alignment service.
    """
    # Get configuration from environment
    grpc_port = int(os.environ.get("GRPC_PORT", "50051"))
    metrics_port = int(os.environ.get("METRICS_PORT", "8000"))
    max_workers = int(os.environ.get("MAX_WORKERS", "10"))
    
    logger.info(f"Starting lightweight alignment service on port {grpc_port}")
    logger.info(f"Starting metrics server on port {metrics_port}")
    
    # Start Prometheus metrics server
    try:
        start_http_server(metrics_port)
        logger.info(f"Metrics server started on port {metrics_port}")
    except Exception as e:
        logger.warning(f"Failed to start metrics server: {e}")
    
    # Create gRPC server
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=max_workers))
    
    # Add service to server
    alignment_pb2_grpc.add_AlignmentServiceServicer_to_server(
        LightweightAlignmentService(), server
    )
    
    # Listen on port
    listen_addr = f"[::]:{grpc_port}"
    server.add_insecure_port(listen_addr)
    
    # Start server
    server.start()
    logger.info(f"Lightweight alignment service started on {listen_addr}")
    
    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Shutting down alignment service...")
        server.stop(0)

if __name__ == "__main__":
    serve()
