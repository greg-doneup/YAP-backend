#!/bin/bash
# Start all components for TTS service with MLOps monitoring

# Create required directories if they don't exist
mkdir -p data logs

# Run with MLOps monitoring enabled
echo "Starting TTS Service with MLOps monitoring..."

if [ "$1" == "--docker" ]; then
    echo "Starting services using Docker Compose..."
    docker-compose up
else
    # Start the main TTS service
    echo "Starting TTS service..."
    export METRICS_ENABLED=true
    export PROMETHEUS_PORT=8002
    python main.py &
    TTS_PID=$!
    
    # Give the service time to start
    sleep 3
    
    # Start the dashboard
    echo "Starting ML monitoring dashboard..."
    streamlit run app/ml_dashboard.py --server.port 8501 --server.address 0.0.0.0 &
    DASHBOARD_PID=$!
    
    # Wait for user to press Ctrl+C
    echo "All services started. Press Ctrl+C to stop."
    trap "kill $TTS_PID $DASHBOARD_PID; exit" INT TERM
    wait
fi
