import grpc
import logging
import time
from typing import Dict, Any, Optional, Tuple

# Import generated proto classes
from proto import alignment_pb2
from proto import alignment_pb2_grpc
from proto import pronunciation_scorer_pb2
from proto import pronunciation_scorer_pb2_grpc

# Import config
from app.config import Config

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AlignmentClient:
    """Client for the Alignment Service."""
    
    def __init__(self):
        self.channel = None
        self.stub = None
        self.connect()
    
    def connect(self):
        """Establish gRPC connection to alignment service."""
        try:
            self.channel = grpc.insecure_channel(f"{Config.ALIGNMENT_SERVICE_HOST}:{Config.ALIGNMENT_SERVICE_PORT}")
            self.stub = alignment_pb2_grpc.AlignmentServiceStub(self.channel)
            logger.info(f"Connected to alignment service at {Config.ALIGNMENT_SERVICE_HOST}:{Config.ALIGNMENT_SERVICE_PORT}")
        except Exception as e:
            logger.error(f"Failed to connect to alignment service: {e}")
            raise
    
    def align_text(self, audio_data: bytes, text: str, language_code: str = "en-US", 
                   audio_format: str = "wav", alignment_level: str = "phoneme") -> Dict[str, Any]:
        """
        Align audio with text to get word and phoneme-level timing information.
        
        Args:
            audio_data: Raw audio bytes
            text: Text to align with the audio
            language_code: Language code (e.g., "en-US", "es-ES")
            audio_format: Format of the audio (e.g., "wav", "mp3")
            alignment_level: "word" or "phoneme"
            
        Returns:
            Dictionary with alignment results
        """
        max_retries = 3
        retry_count = 0
        backoff_time = 1
        
        while retry_count < max_retries:
            try:
                request = alignment_pb2.AlignmentRequest(
                    audio_data=audio_data,
                    text=text,
                    language_code=language_code,
                    audio_format=audio_format,
                    alignment_level=alignment_level
                )
                
                # Call alignment service
                start_time = time.time()
                response = self.stub.AlignText(request, timeout=Config.ALIGNMENT_SERVICE_TIMEOUT)
                elapsed_time = time.time() - start_time
                
                logger.info(f"Alignment completed in {elapsed_time:.2f}s")
                
                if not response.success:
                    logger.error(f"Alignment failed: {response.message}")
                    return {"success": False, "message": response.message}
                
                # Convert to dictionary format
                result = {
                    "success": response.success,
                    "message": response.message,
                    "word_alignments": [
                        {
                            "word": wa.word,
                            "start_time": wa.start_time,
                            "end_time": wa.end_time,
                            "confidence": wa.confidence
                        } for wa in response.word_alignments
                    ],
                    "phoneme_alignments": [
                        {
                            "phoneme": pa.phoneme,
                            "start_time": pa.start_time,
                            "end_time": pa.end_time,
                            "confidence": pa.confidence,
                            "word": pa.word
                        } for pa in response.phoneme_alignments
                    ],
                    "alignment_id": response.alignment_id
                }
                
                return result
                
            except grpc.RpcError as e:
                retry_count += 1
                logger.warning(f"gRPC error in alignment service (attempt {retry_count}/{max_retries}): {e}")
                
                if retry_count >= max_retries:
                    logger.error(f"Failed to communicate with alignment service after {max_retries} attempts")
                    return {"success": False, "message": f"Service communication error: {e}"}
                
                time.sleep(backoff_time)
                backoff_time *= 2  # Exponential backoff
                
                # Try to reconnect
                self.connect()
                
            except Exception as e:
                logger.error(f"Unexpected error in alignment: {e}")
                return {"success": False, "message": f"Unexpected error: {e}"}
    
    def check_health(self) -> Tuple[bool, str]:
        """Check health of the alignment service."""
        try:
            response = self.stub.HealthCheck(alignment_pb2.HealthCheckRequest())
            return response.status, response.message
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False, f"Health check failed: {e}"

class PronunciationScorerClient:
    """Client for the Pronunciation Scorer Service."""
    
    def __init__(self):
        self.channel = None
        self.stub = None
        self.connect()
    
    def connect(self):
        """Establish gRPC connection to pronunciation scorer service."""
        try:
            self.channel = grpc.insecure_channel(f"{Config.PRONUNCIATION_SCORER_HOST}:{Config.PRONUNCIATION_SCORER_PORT}")
            self.stub = pronunciation_scorer_pb2_grpc.PronunciationScorerServiceStub(self.channel)
            logger.info(f"Connected to pronunciation scorer service at {Config.PRONUNCIATION_SCORER_HOST}:{Config.PRONUNCIATION_SCORER_PORT}")
        except Exception as e:
            logger.error(f"Failed to connect to pronunciation scorer service: {e}")
            raise
    
    def score_pronunciation(self, audio_data: bytes, text: str, language_code: str = "en-US",
                           audio_format: str = "wav", alignments: Optional[Dict[str, Any]] = None,
                           scoring_level: str = "phoneme") -> Dict[str, Any]:
        """
        Score pronunciation based on aligned audio and text.
        
        Args:
            audio_data: Raw audio bytes
            text: Reference text
            language_code: Language code (e.g., "en-US", "es-ES")
            audio_format: Format of the audio (e.g., "wav", "mp3")
            alignments: Word and phoneme alignments from the alignment service
            scoring_level: "word", "phoneme", or "sentence"
            
        Returns:
            Dictionary with scoring results
        """
        max_retries = 3
        retry_count = 0
        backoff_time = 1
        
        while retry_count < max_retries:
            try:
                # Convert alignments to proto format
                proto_alignments = []
                if alignments and alignments.get("success", False):
                    alignment_proto = pronunciation_scorer_pb2.Alignment()
                    
                    # Add word alignments
                    for wa in alignments.get("word_alignments", []):
                        word_alignment = alignment_proto.word_alignments.add()
                        word_alignment.word = wa["word"]
                        word_alignment.start_time = wa["start_time"]
                        word_alignment.end_time = wa["end_time"]
                        word_alignment.confidence = wa["confidence"]
                    
                    # Add phoneme alignments
                    for pa in alignments.get("phoneme_alignments", []):
                        phoneme_alignment = alignment_proto.phoneme_alignments.add()
                        phoneme_alignment.phoneme = pa["phoneme"]
                        phoneme_alignment.start_time = pa["start_time"]
                        phoneme_alignment.end_time = pa["end_time"]
                        phoneme_alignment.confidence = pa["confidence"]
                        phoneme_alignment.word = pa["word"]
                    
                    proto_alignments.append(alignment_proto)
                
                # Create scoring request
                request = pronunciation_scorer_pb2.ScoringRequest(
                    audio_data=audio_data,
                    text=text,
                    language_code=language_code,
                    audio_format=audio_format,
                    alignments=proto_alignments,
                    scoring_level=scoring_level
                )
                
                # Call pronunciation scorer service
                start_time = time.time()
                response = self.stub.ScorePronunciation(request, timeout=Config.PRONUNCIATION_SCORER_TIMEOUT)
                elapsed_time = time.time() - start_time
                
                logger.info(f"Pronunciation scoring completed in {elapsed_time:.2f}s")
                
                if not response.success:
                    logger.error(f"Pronunciation scoring failed: {response.message}")
                    return {"success": False, "message": response.message}
                
                # Convert to dictionary format
                result = {
                    "success": response.success,
                    "message": response.message,
                    "overall_score": {
                        "score": response.overall_score.score,
                        "feedback": list(response.overall_score.feedback)
                    },
                    "word_scores": [
                        {
                            "word": ws.word,
                            "score": ws.score,
                            "issues": list(ws.issues),
                            "start_time": ws.start_time,
                            "end_time": ws.end_time
                        } for ws in response.word_scores
                    ],
                    "phoneme_scores": [
                        {
                            "phoneme": ps.phoneme,
                            "word": ps.word,
                            "score": ps.score,
                            "issue": ps.issue,
                            "start_time": ps.start_time,
                            "end_time": ps.end_time
                        } for ps in response.phoneme_scores
                    ],
                    "scoring_id": response.scoring_id
                }
                
                return result
                
            except grpc.RpcError as e:
                retry_count += 1
                logger.warning(f"gRPC error in pronunciation scorer service (attempt {retry_count}/{max_retries}): {e}")
                
                if retry_count >= max_retries:
                    logger.error(f"Failed to communicate with pronunciation scorer service after {max_retries} attempts")
                    return {"success": False, "message": f"Service communication error: {e}"}
                
                time.sleep(backoff_time)
                backoff_time *= 2  # Exponential backoff
                
                # Try to reconnect
                self.connect()
                
            except Exception as e:
                logger.error(f"Unexpected error in pronunciation scoring: {e}")
                return {"success": False, "message": f"Unexpected error: {e}"}
    
    def check_health(self) -> Tuple[bool, str]:
        """Check health of the pronunciation scorer service."""
        try:
            response = self.stub.HealthCheck(pronunciation_scorer_pb2.HealthCheckRequest())
            return response.status, response.message
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False, f"Health check failed: {e}"
