# YAP Text-to-Speech (TTS) Service

The Text-to-Speech (TTS) service for the YAP application provides high-quality speech generation to support pronunciation learning and assessment.

## Features

- Multiple TTS provider support:
  - Mozilla TTS (local)
  - AWS Polly
  - Azure Cognitive Services
  - Google Cloud TTS
- Audio caching to reduce costs and latency
- Language-specific voice selection
- Phoneme-level audio generation for pronunciation examples
- SSML support for enhanced speech control
- Neural voice support for high-quality synthesis

## Architecture

The TTS service is built with a modular architecture:

1. **Provider Module**: Abstract interface with multiple implementations for different TTS providers
2. **Storage Module**: Handles caching and persistence of audio files
3. **Server Module**: gRPC server implementation for client communication
4. **Config Module**: Central configuration management

## API Endpoints

The service exposes the following gRPC endpoints:

- `GenerateSpeech`: Converts text to speech
- `GeneratePhonemeAudio`: Creates audio samples for specific phonemes
- `ListVoices`: Provides available voices for different languages
- `HealthCheck`: Service health monitoring

## Integration

The TTS service integrates with:

1. **Alignment Service**: Provides aligned audio for pronunciation assessment
2. **Pronunciation Scorer Service**: Uses TTS-generated audio for reference pronunciation

## Configuration

Configure the service using environment variables:

- `TTS_PROVIDER`: Select the TTS provider (mozilla, aws, azure, google)
- `GRPC_PORT`: gRPC server port (default: 50053)
- `STORAGE_ENABLED`: Enable persistent storage (default: True)
- `AWS_REGION`: For AWS services
- `AZURE_SPEECH_KEY`: For Azure services
- `GOOGLE_APPLICATION_CREDENTIALS`: For Google Cloud services

## Development

### Requirements

- Python 3.8+
- gRPC tools
- Dependencies listed in requirements.txt

### Local Setup

1. Install dependencies: `pip install -r requirements.txt`
2. Generate gRPC code: `python -m grpc_tools.protoc -I./proto --python_out=. --grpc_python_out=. ./proto/tts.proto`
3. Run the server: `python main.py`

### Testing

Run tests with: `python -m pytest app/tests/`

## Docker

Build the Docker image:
```
docker build -t yap-tts-service .
```

Run the container:
```
docker run -p 50053:50053 -p 8002:8002 yap-tts-service
```
