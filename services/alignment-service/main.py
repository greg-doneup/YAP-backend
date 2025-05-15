#!/usr/bin/env python
"""
Main entry point for the alignment service.

This script starts the alignment service and handles
command-line arguments.
"""

import os
import sys
import argparse
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def main():
    """
    Main entry point for the alignment service.
    """
    parser = argparse.ArgumentParser(description="Alignment Service for YAP")
    parser.add_argument("--port", type=int, default=50051, help="Port to listen on")
    parser.add_argument("--metrics-port", type=int, default=8000, help="Prometheus metrics port")
    parser.add_argument("--gpu", action="store_true", help="Enable GPU if available")
    parser.add_argument("--no-gpu", dest="gpu", action="store_false", help="Disable GPU")
    parser.add_argument("--s3", action="store_true", help="Enable S3 storage")
    parser.add_argument("--no-s3", dest="s3", action="store_false", help="Disable S3 storage")
    parser.set_defaults(gpu=True, s3=False)

    args = parser.parse_args()

    # Set environment variables for configuration
    os.environ["GRPC_PORT"] = str(args.port)
    os.environ["METRICS_PORT"] = str(args.metrics_port)
    os.environ["GPU_ENABLED"] = str(args.gpu)
    os.environ["STORAGE_ENABLED"] = str(args.s3)

    # Import server and start it
    from app.server import serve
    serve()

if __name__ == "__main__":
    main()
