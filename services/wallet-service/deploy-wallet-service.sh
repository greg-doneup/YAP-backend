#!/bin/bash

# YAP Wallet Service Deployment Script
# Supports local development, testing, and production deployment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
MODE="development"
PORT=8000
HOST="0.0.0.0"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  -m, --mode [development|testing|production]  Deployment mode (default: development)"
    echo "  -p, --port PORT                              Service port (default: 8000)"
    echo "  -h, --host HOST                              Service host (default: 0.0.0.0)"
    echo "  --setup                                      Run setup only"
    echo "  --test                                       Run tests only"
    echo "  --help                                       Show this help"
}

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

setup_service() {
    log "Setting up YAP Wallet Service..."
    
    cd "$SERVICE_DIR"
    
    # Check if virtual environment exists
    if [ ! -d "wallet-venv" ]; then
        log "Creating Python virtual environment..."
        python3 -m venv wallet-venv
    fi
    
    # Activate virtual environment
    source wallet-venv/bin/activate
    
    # Upgrade pip
    log "Upgrading pip..."
    pip install --upgrade pip
    
    # Install dependencies
    log "Installing dependencies..."
    pip install -r requirements.txt
    
    # Install test dependencies
    pip install aiohttp pytest pytest-asyncio
    
    log "Service setup completed successfully!"
}

test_service() {
    log "Testing wallet service..."
    
    cd "$SERVICE_DIR"
    source wallet-venv/bin/activate
    
    # Run the test script
    python test-wallet-service.py
}

start_service() {
    log "Starting YAP Wallet Service in $MODE mode..."
    
    cd "$SERVICE_DIR"
    source wallet-venv/bin/activate
    
    # Set environment variables based on mode
    case $MODE in
        "development")
            export MONGO_URI=${MONGO_URI:-"mongodb://localhost:27017"}
            export MONGO_DB_NAME=${MONGO_DB_NAME:-"yap_dev"}
            ;;
        "testing")
            export MONGO_URI=${MONGO_URI:-"mongodb://localhost:27017"}
            export MONGO_DB_NAME=${MONGO_DB_NAME:-"yap_test"}
            ;;
        "production")
            if [ -z "$MONGO_URI" ]; then
                error "MONGO_URI environment variable is required for production mode"
                exit 1
            fi
            export MONGO_DB_NAME=${MONGO_DB_NAME:-"yap"}
            ;;
    esac
    
    log "Configuration:"
    log "  Mode: $MODE"
    log "  Host: $HOST"
    log "  Port: $PORT"
    log "  MongoDB URI: ${MONGO_URI}"
    log "  MongoDB DB: ${MONGO_DB_NAME}"
    
    # Start the service
    if [ "$MODE" = "development" ]; then
        log "Starting with hot reload for development..."
        uvicorn main:app --host "$HOST" --port "$PORT" --reload
    else
        log "Starting in production mode..."
        uvicorn main:app --host "$HOST" --port "$PORT"
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--mode)
            MODE="$2"
            shift 2
            ;;
        -p|--port)
            PORT="$2"
            shift 2
            ;;
        -h|--host)
            HOST="$2"
            shift 2
            ;;
        --setup)
            setup_service
            exit 0
            ;;
        --test)
            test_service
            exit 0
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate mode
if [[ ! "$MODE" =~ ^(development|testing|production)$ ]]; then
    error "Invalid mode: $MODE. Must be development, testing, or production."
    exit 1
fi

# Main execution
log "YAP Wallet Service Deployment"
log "============================="

# Always run setup first
setup_service

# Start the service
start_service
