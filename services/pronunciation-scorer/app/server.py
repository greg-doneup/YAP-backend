import os
import grpc
from concurrent import futures
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import generated gRPC modules
from proto import pronunciation_scorer_pb2, pronunciation_scorer_pb2_grpc

class PronunciationScorerService(pronunciation_scorer_pb2_grpc.PronunciationScorerServiceServicer):
    """
    Service for scoring pronunciation based on audio-text alignment.
    Uses Goodness of Pronunciation (GOP) algorithm or similar.
    """
    
    def __init__(self):
        logger.info("Initializing PronunciationScorerService")
        # Will load models on-demand to save memory
        self.models = {}
        
    def ScorePronunciation(self, request, context):
        """
        Scores pronunciation based on aligned audio and text.
        """
        try:
            logger.info(f"Received scoring request for language: {request.language_code}")
            
            # Placeholder for actual implementation
            # TODO: Implement pronunciation scoring logic using GOP or similar
            
            # Create a mock response for now
            response = pronunciation_scorer_pb2.ScoringResponse(
                success=True,
                message="Scoring successful (placeholder)"
            )
            
            overall_score = pronunciation_scorer_pb2.PronunciationScore(
                score=80.0,
                feedback=["Good pronunciation overall", "Work on stress patterns"]
            )
            response.overall_score.CopyFrom(overall_score)
            
            return response
            
        except Exception as e:
            logger.error(f"Error in ScorePronunciation: {str(e)}")
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
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    pronunciation_scorer_pb2_grpc.add_PronunciationScorerServiceServicer_to_server(
        PronunciationScorerService(), server
    )
    
    server_address = "[::]:50052"
    server.add_insecure_port(server_address)
    server.start()
    logger.info(f"Pronunciation scorer service listening on {server_address}")
    
    # Keep the server running
    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Server stopping...")
        server.stop(0)


if __name__ == "__main__":
    serve()
