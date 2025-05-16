# Pronunciation Scorer Service

The Pronunciation Scorer Service is a component of the YAP language learning platform that evaluates pronunciation quality based on audio-text alignment data. It helps language learners improve their pronunciation by providing detailed feedback at the sentence, word, and phoneme levels.

## Features

- Pronunciation quality assessment using GOP (Goodness of Pronunciation) algorithm
- Fallback to Azure Cognitive Services for pronunciation assessment
- Supports multiple languages
- Detailed scoring at different levels (sentence, word, phoneme)
- Provides actionable feedback for improvement
- Built-in caching for frequently requested assessments
- Storage of scoring results in S3/DynamoDB
- Automatic language detection for unlabeled audio

## Architecture

The service uses a modular architecture with the following components:

- **gRPC Server**: Handles client requests and responses
- **Scoring Provider**: Abstraction layer that manages different scoring backends
- **GOP Scorer**: Primary scoring implementation using the Goodness of Pronunciation algorithm
- **Azure Scorer**: Fallback scoring using Azure Cognitive Services
- **Storage**: Persistence layer for scoring results
- **Cache**: In-memory caching for performance optimization
- **Language Detector**: Identifies language from audio when not specified

## API

The service exposes a gRPC API defined in `proto/pronunciation_scorer.proto`. The main endpoints are:

- `ScorePronunciation`: Evaluates pronunciation quality based on audio and alignment data
- `HealthCheck`: Service health monitoring endpoint

## Configuration

The service can be configured through environment variables defined in `config.py`:

- `GRPC_PORT`: Port for the gRPC server (default: 50052)
- `METRICS_PORT`: Port for Prometheus metrics (default: 8001)
- `USE_GOP`: Whether to use GOP scoring algorithm (default: True)
- `USE_AZURE_FALLBACK`: Whether to use Azure as fallback (default: False)
- `AZURE_SPEECH_KEY`: Azure Cognitive Services API key
- `AZURE_SERVICE_REGION`: Azure region (default: eastus)
- `S3_BUCKET_NAME`: S3 bucket for storing scoring results
- `STORAGE_ENABLED`: Whether to store scoring results (default: False)
- `CACHE_MAX_SIZE`: Maximum cache size (default: 1000)
- `CACHE_TTL_SECONDS`: Cache entry time-to-live (default: 3600)

## Dependencies

- gRPC and Protocol Buffers
- Kaldi-GOP for pronunciation scoring
- Azure Cognitive Services Speech SDK (optional)
- Prometheus client for metrics
- AWS SDK for storage
- Whisper for language detection

## Getting Started

1. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

2. Run the service:
   ```
   python -m app.main
   ```

3. For development and testing:
   ```
   python -m app.tests.test_integration
   ```

## Performance Considerations

- The service is designed to load models lazily to minimize memory usage
- Caching is implemented for frequently requested pronunciations
- For high-traffic scenarios, consider scaling horizontally
- GPU acceleration is recommended for optimal performance

## Integration

The Pronunciation Scorer Service integrates with:

- **Alignment Service**: Provides the word and phoneme alignments for scoring
- **Voice-Score Service**: Consumes pronunciation scores for user feedback
- **TTS Service**: For providing audio examples of correct pronunciation

## Metrics

The service exposes the following Prometheus metrics:

- `pronunciation_scoring_seconds`: Time spent processing scoring requests
- `pronunciation_scoring_total`: Total number of scoring requests
- `pronunciation_scorer_provider_usage`: Provider usage count
- `pronunciation_scorer_memory_mb`: Memory usage of scoring models
