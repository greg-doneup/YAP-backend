"""
Main entry point for the TTS service.
"""

import logging
import asyncio
from concurrent import futures
import grpc
import os
from prometheus_client import start_http_server

# Configure logging
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import application modules
from app.server import TTSService
from app.config import Config
from proto import tts_pb2_grpc

def main():
    """
    Main function to start the TTS service.
    """
    try:
        # Start metrics server for Prometheus if enabled
        metrics_port = Config.METRICS_PORT
        metrics_enabled = os.environ.get("METRICS_ENABLED", "true").lower() in ["true", "1", "yes"]
        
        if metrics_enabled:
            logger.info(f"Starting metrics server on port {metrics_port}")
            start_http_server(metrics_port)
        else:
            logger.info("Metrics collection is disabled")
        
        # Start gRPC server
        grpc_port = Config.GRPC_PORT
        server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
        tts_pb2_grpc.add_TTSServiceServicer_to_server(
            TTSService(), server
        )
        
        server_address = f"[::]:{grpc_port}"
        server.add_insecure_port(server_address)
        server.start()
        
        logger.info(f"TTS service started successfully on port {grpc_port}")
        logger.info(f"Using TTS provider: {Config.TTS_PROVIDER}")
        
        # Keep the server running
        try:
            server.wait_for_termination()
        except KeyboardInterrupt:
            logger.info("Server stopping due to keyboard interrupt...")
            server.stop(0)
    
    except Exception as e:
        logger.error(f"Error starting TTS service: {str(e)}")
        raise

if __name__ == "__main__":
    main()
