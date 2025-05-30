#!/usr/bin/env python3
"""
Test script for TTS service ML monitoring.

This script sends various TTS requests to the service to generate monitoring data
and validate the ML monitoring functionality.
"""

import os
import sys
import time
import random
import logging
import argparse
from concurrent.futures import ThreadPoolExecutor
import grpc
import json

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import generated gRPC modules
from proto import tts_pb2, tts_pb2_grpc

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class TTSMonitoringTest:
    """Test client for TTS service with focus on ML monitoring."""
    
    def __init__(self, server_address="localhost:50053"):
        """Initialize the test client."""
        self.server_address = server_address
        self.channel = grpc.insecure_channel(server_address)
        self.stub = tts_pb2_grpc.TTSServiceStub(self.channel)
        logger.info(f"Connected to TTS service at {server_address}")
        
    def health_check(self):
        """Perform a health check of the service."""
        try:
            response = self.stub.HealthCheck(tts_pb2.HealthCheckRequest())
            logger.info(f"Health check: {response.status}, Message: {response.message}")
            if hasattr(response, 'details') and response.details:
                try:
                    details = json.loads(response.details)
                    logger.info(f"Health details: {json.dumps(details, indent=2)}")
                except:
                    logger.info(f"Health details: {response.details}")
            return response.status
        except Exception as e:
            logger.error(f"Health check failed: {str(e)}")
            return False
            
    def generate_speech(self, text, language_code="en-US", voice_id="", audio_format="mp3"):
        """Generate speech from text."""
        try:
            request = tts_pb2.TTSRequest(
                text=text,
                language_code=language_code,
                voice_id=voice_id,
                audio_format=audio_format
            )
            response = self.stub.GenerateSpeech(request)
            status = "Success" if response.success else "Failed"
            logger.info(f"{status}: Generated {len(response.audio_data)} bytes, duration: {response.duration}s")
            return response.success
        except Exception as e:
            logger.error(f"Speech generation failed: {str(e)}")
            return False
    
    def list_voices(self, language_code="", gender=""):
        """List available voices."""
        try:
            request = tts_pb2.ListVoicesRequest(
                language_code=language_code,
                gender=gender
            )
            response = self.stub.ListVoices(request)
            if response.success:
                logger.info(f"Found {len(response.voices)} voices")
                return response.voices
            else:
                logger.error(f"List voices failed: {response.message}")
                return []
        except Exception as e:
            logger.error(f"List voices failed: {str(e)}")
            return []
    
    def run_test_suite(self, iterations=10, concurrency=2):
        """Run a test suite to generate monitoring data."""
        logger.info(f"Running test suite with {iterations} iterations and {concurrency} concurrent requests")
        
        # Check health first
        if not self.health_check():
            logger.error("Service is not healthy, aborting test suite")
            return
        
        # Get available voices
        voices = self.list_voices()
        voice_ids = [v.voice_id for v in voices] if voices else [""]
        
        # Sample texts in different languages
        texts = [
            ("Hello world! This is a test of the TTS service.", "en-US"),
            ("Bonjour le monde! Ceci est un test du service TTS.", "fr-FR"),
            ("Hola mundo! Esta es una prueba del servicio TTS.", "es-ES"),
            ("Hallo Welt! Dies ist ein Test des TTS-Dienstes.", "de-DE"),
            ("Ciao mondo! Questo è un test del servizio TTS.", "it-IT")
        ]
        
        # Run concurrent requests
        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            for i in range(iterations):
                # Mix in some random errors
                if random.random() < 0.2:  # 20% chance of error
                    # Invalid request
                    text, lang = random.choice(texts)
                    executor.submit(self.generate_speech, text, "invalid-lang", random.choice(voice_ids))
                else:
                    # Valid request
                    text, lang = random.choice(texts)
                    voice_id = random.choice(voice_ids) if voice_ids else ""
                    executor.submit(self.generate_speech, text, lang, voice_id)
                
                # Small delay to avoid overwhelming the service
                time.sleep(0.5)
        
        # Final health check to see the metrics
        time.sleep(1)  # Give service time to update metrics
        self.health_check()
        
        logger.info("Test suite completed")

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="TTS ML Monitoring Test")
    parser.add_argument("--host", default="localhost", help="TTS service host")
    parser.add_argument("--port", default=50053, type=int, help="TTS service port")
    parser.add_argument("--iterations", default=20, type=int, help="Number of test iterations")
    parser.add_argument("--concurrency", default=2, type=int, help="Number of concurrent requests")
    args = parser.parse_args()
    
    server_address = f"{args.host}:{args.port}"
    test_client = TTSMonitoringTest(server_address)
    test_client.run_test_suite(iterations=args.iterations, concurrency=args.concurrency)

if __name__ == "__main__":
    main()
