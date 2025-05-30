# ML Monitoring for YAP TTS Service

This documentation describes the ML monitoring capabilities implemented for the YAP TTS service. These capabilities help track the performance of the TTS models and system in production.

## Overview

The ML monitoring system provides:

1. Real-time metrics collection for TTS synthesis requests
2. Cache hit/miss tracking
3. Provider availability monitoring
4. Latency and success rate tracking
5. Integration with MLflow and Evidently AI
6. A visual dashboard for monitoring metrics
7. Background reporting and alerting

## Getting Started

### Running the TTS Service with ML Monitoring

The simplest way to run the service with all monitoring components is to use Docker Compose:

```bash
docker-compose up
```

This will start:
- TTS service on port 50053
- ML Dashboard on port 8501
- Prometheus on port 9090
- Grafana on port 3000

### Running Individual Components

To run just the TTS service:

```bash
python main.py
```

To run the ML monitoring dashboard separately:

```bash
./run_dashboard.sh
```

## Testing the ML Monitoring

A test script is provided to validate the ML monitoring functionality:

```bash
./test_ml_monitoring.py --iterations 20 --concurrency 2
```

This script sends various TTS requests to the service to generate monitoring data and validate that the metrics are being collected correctly.

## Metrics Collected

The following metrics are collected:

### Synthesis Metrics
- **Success Rate**: Percentage of successful synthesis requests
- **Latency**: Time taken to synthesize speech
- **Error Types**: Distribution of error types

### Cache Metrics
- **Hit Rate**: Percentage of cache hits
- **Hit Count**: Number of cache hits
- **Miss Count**: Number of cache misses

### Provider Metrics
- **Availability**: Whether each provider is available
- **Success Rate by Provider**: Success rate broken down by provider

## Dashboard

The ML monitoring dashboard provides visualizations for:

1. Cache performance (hit/miss ratio)
2. Provider status
3. Synthesis performance (success rate, latency)
4. Historical trends

Access the dashboard at: http://localhost:8501

## MLflow Integration

The system integrates with MLflow for experiment tracking. To view the MLflow UI:

1. Set the `MLFLOW_TRACKING_URI` environment variable
2. Run MLflow UI: `mlflow ui`
3. Access at: http://localhost:5000

## Configuration Options

The ML monitoring system can be configured through environment variables:

- `METRICS_ENABLED`: Enable/disable metrics collection (default: true)
- `PROMETHEUS_PORT`: Port for Prometheus metrics (default: 8002)
- `MLFLOW_TRACKING_URI`: URI for MLflow tracking server
- `DASHBOARD_PORT`: Port for the dashboard (default: 8501)

## Alerts and Notifications

The system can detect performance degradation and log warnings when:

- Latency exceeds 1.5x the reference latency
- Success rate drops below 95%
- Provider becomes unavailable

Currently, alerts are logged to the application log. Future enhancements could include integration with notification systems.

## Directory Structure

- `app/ml_monitoring.py`: Core ML monitoring functionality
- `app/ml_dashboard.py`: Dashboard implementation
- `monitoring/`: Configuration files for monitoring tools
- `test_ml_monitoring.py`: Test script for ML monitoring

## Dependencies

The ML monitoring system depends on:

- MLflow
- Evidently AI
- Prometheus client
- Streamlit
- Plotly
- Pandas

These dependencies are listed in `requirements-mlops.txt`.
