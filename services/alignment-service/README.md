# Alignment Service

The Alignment Service is a key component of the YAP pronunciation assessment pipeline. It takes audio and text as input and produces word and phoneme-level alignments that precisely map the timing relationships between spoken words and their textual representation.

## Features

- Word-level alignment: Maps each word to its start and end times in the audio
- Phoneme-level alignment: Maps individual phonemes within words to their start and end times
- Multi-language support: Works with multiple languages for pronunciation assessment
- Caching: Efficient caching for faster responses to repeated requests
- S3 integration: Optional storage of alignment results in S3
- Prometheus metrics: Detailed monitoring and observability

## Technical Details

The service uses WhisperX, which combines OpenAI's Whisper with Wav2Vec2 for precise phoneme-level alignments. It exposes a gRPC API for high-performance integration with other services.

### Requirements

- Python 3.9+
- CUDA-compatible GPU (optional but recommended)
- PyTorch with CUDA support
- WhisperX and other dependencies listed in requirements.txt

## API

### gRPC Endpoints

#### AlignText

Aligns audio with text to produce word and phoneme-level alignments.

**Input:**
- `audio_data`: Raw audio bytes
- `text`: Text to align with the audio
- `language_code`: Language code (e.g., "en", "es")
- `audio_format`: Format of the audio (e.g., "wav", "mp3")
- `alignment_level`: "word" or "phoneme"

**Output:**
- `success`: Whether the alignment was successful
- `message`: Status message
- `word_alignments`: List of word alignments (word, start_time, end_time, confidence)
- `phoneme_alignments`: List of phoneme alignments (phoneme, word, start_time, end_time, confidence)
- `alignment_id`: Unique identifier for this alignment

#### HealthCheck

Checks the health of the service.

**Input:** (empty)

**Output:**
- `status`: True if the service is healthy
- `message`: Description of health status

## Usage

### Running the Service

```bash
python main.py [--port PORT] [--metrics-port METRICS_PORT] [--gpu|--no-gpu] [--s3|--no-s3]
```

### Docker

```bash
docker run -p 50051:50051 -p 8000:8000 --gpus all alignment-service
```

## Integration Testing

A test script is provided to validate the service functionality:

```bash
python app/tests/test_integration.py --audio test_audio.wav --text "Text to align" --language en
```

## Monitoring

Prometheus metrics are available on port 8000 by default. Key metrics include:

- Request processing time
- Request count by language and success/failure
- Model memory usage

## Configuration

Configuration is managed through environment variables and command-line arguments:

- `GRPC_PORT`: Port for the gRPC server (default: 50051)
- `METRICS_PORT`: Port for Prometheus metrics (default: 8000)
- `GPU_ENABLED`: Whether to use GPU if available (default: True)
- `STORAGE_ENABLED`: Whether to use S3 storage (default: False)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`: AWS credentials for S3 storage
- `AWS_REGION`: AWS region for S3 storage (default: us-east-1)
- `S3_BUCKET_NAME`: S3 bucket for storing alignments (default: yap-alignment-results)
- `CACHE_MAX_SIZE`: Maximum cache size (default: 1000)
- `CACHE_TTL_SECONDS`: Cache time-to-live in seconds (default: 3600)
