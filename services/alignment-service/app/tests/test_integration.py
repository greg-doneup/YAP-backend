#!/usr/bin/env python
"""
Integration test for the alignment service.

This script tests the alignment service by sending a test audio file
and verifying the alignment response.
"""

import os
import sys
import grpc
import argparse
import wave
import numpy as np
from typing import Tuple

# Add project root to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from proto import alignment_pb2, alignment_pb2_grpc

def load_test_audio(audio_file_path: str) -> Tuple[bytes, str]:
    """
    Load a test audio file.
    
    Args:
        audio_file_path: Path to the audio file
        
    Returns:
        Tuple of (audio_bytes, audio_format)
    """
    audio_format = audio_file_path.split(".")[-1].lower()
    with open(audio_file_path, "rb") as f:
        audio_data = f.read()
    
    return audio_data, audio_format

def test_alignment_service(host: str, port: int, audio_file_path: str, 
                           reference_text: str, language_code: str) -> None:
    """
    Test the alignment service.
    
    Args:
        host: Hostname of the alignment service
        port: Port of the alignment service
        audio_file_path: Path to the test audio file
        reference_text: Reference text for alignment
        language_code: Language code of the audio
    """
    # Set up gRPC channel
    channel = grpc.insecure_channel(f"{host}:{port}")
    stub = alignment_pb2_grpc.AlignmentServiceStub(channel)
    
    # Load test audio
    audio_data, audio_format = load_test_audio(audio_file_path)
    
    print(f"Testing alignment with {len(audio_data)} bytes of {audio_format} audio")
    print(f"Reference text: {reference_text}")
    print(f"Language: {language_code}")
    
    # Create request
    request = alignment_pb2.AlignmentRequest(
        audio_data=audio_data,
        text=reference_text,
        language_code=language_code,
        audio_format=audio_format,
        alignment_level="phoneme"
    )
    
    # Send request and get response
    try:
        print("Sending alignment request...")
        response = stub.AlignText(request)
        
        # Print results
        print("\nAlignment Response:")
        print(f"Success: {response.success}")
        print(f"Message: {response.message}")
        print(f"Alignment ID: {response.alignment_id}")
        print(f"Word alignments: {len(response.word_alignments)}")
        print(f"Phoneme alignments: {len(response.phoneme_alignments)}")
        
        if len(response.word_alignments) > 0:
            print("\nFirst 5 word alignments:")
            for i, word in enumerate(response.word_alignments[:5]):
                print(f"  {word.word}: {word.start_time:.2f}s -> {word.end_time:.2f}s (confidence: {word.confidence:.2f})")
        
        if len(response.phoneme_alignments) > 0:
            print("\nFirst 5 phoneme alignments:")
            for i, phoneme in enumerate(response.phoneme_alignments[:5]):
                print(f"  {phoneme.phoneme} ({phoneme.word}): {phoneme.start_time:.3f}s -> {phoneme.end_time:.3f}s (confidence: {phoneme.confidence:.2f})")
        
        return response.success
        
    except grpc.RpcError as e:
        print(f"RPC Error: {e.code()}: {e.details()}")
        return False

def test_health_check(host: str, port: int) -> bool:
    """
    Test the health check endpoint.
    
    Args:
        host: Hostname of the alignment service
        port: Port of the alignment service
        
    Returns:
        bool: True if the health check passes, False otherwise
    """
    # Set up gRPC channel
    channel = grpc.insecure_channel(f"{host}:{port}")
    stub = alignment_pb2_grpc.AlignmentServiceStub(channel)
    
    try:
        print("Testing health check...")
        response = stub.HealthCheck(alignment_pb2.HealthCheckRequest())
        print(f"Health check result: {response.status}")
        print(f"Message: {response.message}")
        return response.status
    except grpc.RpcError as e:
        print(f"Health check failed: {e.code()}: {e.details()}")
        return False

if __name__ == "__main__":
    # Parse arguments
    parser = argparse.ArgumentParser(description="Test the alignment service")
    parser.add_argument("--host", default="localhost", help="Alignment service host")
    parser.add_argument("--port", type=int, default=50051, help="Alignment service port")
    parser.add_argument("--audio", required=True, help="Path to the test audio file")
    parser.add_argument("--text", required=True, help="Reference text for alignment")
    parser.add_argument("--language", default="en", help="Language code of the audio")
    
    args = parser.parse_args()
    
    # First test health check
    if test_health_check(args.host, args.port):
        # Then test alignment
        test_alignment_service(
            args.host, args.port, args.audio, args.text, args.language
        )
