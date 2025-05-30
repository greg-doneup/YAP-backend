#!/bin/bash
# Start the ML monitoring dashboard

echo "Starting TTS ML Monitoring Dashboard..."
streamlit run app/ml_dashboard.py --server.port 8501 --server.address 0.0.0.0
