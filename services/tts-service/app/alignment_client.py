"""
Alignment service client for TTS service.

This module provides a client to interact with the alignment service,
allowing the TTS service to get phoneme alignment data for more accurate phoneme synthesis.
"""

import os
import logging
from typing import Dict, Any, Optional, List

import grpc
from google.protobuf.json_format import MessageToDict

# Import configuration
from app.config import Config

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AlignmentServiceClient:
    """
    Client for the alignment service.
    """
    
    def __init__(self, host: str = None, port: int = None):
        """
        Initialize the alignment service client.
        
        Args:
            host: Host address of the alignment service
            port: Port of the alignment service
        """
        self.host = host or Config.ALIGNMENT_SERVICE_HOST
        self.port = port or Config.ALIGNMENT_SERVICE_PORT
        self.channel = None
        self.stub = None
        self.is_connected = False
        
        logger.info(f"Initialized alignment service client pointing to {self.host}:{self.port}")
    
    def _get_stub(self):
        """
        Get or create the service stub.
        
        Returns:
            AlignmentServiceStub: gRPC stub for alignment service
        """
        # Import dynamically to avoid early dependency
        try:
            from alignment.proto import alignment_pb2_grpc
            
            if self.channel is None or self.stub is None:
                # Create a channel and stub
                self.channel = grpc.insecure_channel(f"{self.host}:{self.port}")
                self.stub = alignment_pb2_grpc.AlignmentServiceStub(self.channel)
                self.is_connected = True
                logger.debug("Created alignment service stub")
                
            return self.stub
        except ImportError:
            logger.warning("Could not import alignment_pb2_grpc. Alignment service integration is disabled.")
            self.is_connected = False
            return None
        except Exception as e:
            logger.error(f"Error creating alignment service stub: {e}")
            self.is_connected = False
            return None
    
    def align_text(self, text: str, language_code: str) -> Optional[Dict[str, Any]]:
        """
        Align text to get phoneme and word boundaries.
        This is a simplified version that doesn't require audio data.
        
        Args:
            text: The text to align
            language_code: The language code
            
        Returns:
            Optional[Dict[str, Any]]: Alignment data or None if error
        """
        try:
            stub = self._get_stub()
            if stub is None:
                logger.warning("Alignment service not available, continuing without alignment")
                return None
                
            # Import dynamically to avoid early dependency
            from alignment.proto import alignment_pb2
            
            # Create request
            request = alignment_pb2.TextAlignmentRequest(
                text=text,
                language_code=language_code
            )
            
            # Call the service
            response = stub.AlignText(request, timeout=5.0)  # 5 second timeout
            
            if not response.success:
                logger.warning(f"Alignment service error: {response.message}")
                return None
                
            # Convert protobuf to dict
            result = MessageToDict(
                response,
                preserving_proto_field_name=True,
                including_default_value_fields=True
            )
            
            return result
        except grpc.RpcError as e:
            logger.error(f"RPC error when calling alignment service: {e.details() if hasattr(e, 'details') else str(e)}")
            return None
        except Exception as e:
            logger.error(f"Error when calling alignment service: {str(e)}")
            return None
    
    def align_phoneme_in_word(self, phoneme: str, word: str, language_code: str) -> Optional[Dict[str, Any]]:
        """
        Get alignment information for a specific phoneme in a word.
        
        Args:
            phoneme: The phoneme to align
            word: The word containing the phoneme
            language_code: The language code
            
        Returns:
            Optional[Dict[str, Any]]: Phoneme alignment data or None if error
        """
        try:
            stub = self._get_stub()
            if stub is None:
                logger.warning("Alignment service not available, continuing without alignment")
                return None
                
            # Import dynamically to avoid early dependency
            from alignment.proto import alignment_pb2
            
            # Create request
            request = alignment_pb2.PhonemeAlignmentRequest(
                phoneme=phoneme,
                word=word,
                language_code=language_code
            )
            
            # Call the service
            response = stub.AlignPhoneme(request, timeout=5.0)  # 5 second timeout
            
            if not response.success:
                logger.warning(f"Phoneme alignment service error: {response.message}")
                return None
                
            # Convert protobuf to dict
            result = MessageToDict(
                response,
                preserving_proto_field_name=True,
                including_default_value_fields=True
            )
            
            return result
        except grpc.RpcError as e:
            logger.error(f"RPC error when calling alignment service: {e.details() if hasattr(e, 'details') else str(e)}")
            return None
        except Exception as e:
            logger.error(f"Error when calling alignment service: {str(e)}")
            return None
    
    def get_phonemes_for_language(self, language_code: str) -> Optional[List[str]]:
        """
        Get the list of phonemes for a language.
        
        Args:
            language_code: The language code
            
        Returns:
            Optional[List[str]]: List of phonemes or None if error
        """
        try:
            stub = self._get_stub()
            if stub is None:
                logger.warning("Alignment service not available, continuing without phoneme list")
                return None
                
            # Import dynamically to avoid early dependency
            from alignment.proto import alignment_pb2
            
            # Create request
            request = alignment_pb2.PhonemeListRequest(
                language_code=language_code
            )
            
            # Call the service
            response = stub.GetPhonemes(request, timeout=5.0)  # 5 second timeout
            
            if not response.success:
                logger.warning(f"Phoneme list service error: {response.message}")
                return None
                
            return list(response.phonemes)
        except grpc.RpcError as e:
            logger.error(f"RPC error when calling alignment service: {e.details() if hasattr(e, 'details') else str(e)}")
            return None
        except Exception as e:
            logger.error(f"Error when calling alignment service: {str(e)}")
            return None
    
    def health_check(self) -> bool:
        """
        Check if the alignment service is healthy.
        
        Returns:
            bool: True if service is healthy, False otherwise
        """
        try:
            stub = self._get_stub()
            if stub is None:
                return False
                
            # Import dynamically to avoid early dependency
            from alignment.proto import alignment_pb2
            
            # Create request
            request = alignment_pb2.HealthCheckRequest()
            
            # Call the service
            response = stub.HealthCheck(request, timeout=2.0)  # 2 second timeout
            
            return response.status
        except Exception as e:
            logger.error(f"Error checking alignment service health: {str(e)}")
            return False
    
    def close(self):
        """
        Close the connection to the alignment service.
        """
        if self.channel:
            self.channel.close()
            self.channel = None
            self.stub = None
            self.is_connected = False
            logger.debug("Closed alignment service channel")
