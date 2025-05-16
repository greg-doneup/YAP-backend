# YAP Text-to-Speech (TTS) Service

The Text-to-Speech (TTS) service for the YAP application provides high-quality speech generation to support pronunciation learning and assessment.

## Features

- Multiple TTS provider support:
  - Azure Cognitive Services (primary)
  - AWS Polly (fallback)
  - Google Cloud TTS
  - Mozilla TTS (local)
- Automatic provider failover (Primary → Fallback)
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
5. **Fallback System**: Automatic failover to secondary provider when primary fails

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

### Provider Configuration
- `TTS_PROVIDER`: Select the primary TTS provider (mozilla, aws, azure, google)
- `USE_AZURE_TTS`: Enable Azure TTS provider (default: False)
- `AZURE_SPEECH_KEY`: Azure Cognitive Services API key
- `AZURE_SERVICE_REGION`: Azure service region (default: eastus)

### Fallback Provider Configuration
- `USE_FALLBACK_PROVIDER`: Enable fallback provider support (default: True)
- `FALLBACK_TTS_PROVIDER`: The fallback provider to use (aws, azure, google, mozilla)
- `USE_AWS_POLLY`: Enable AWS Polly provider (default: False)
- `AWS_REGION`: AWS region for Polly API (default: us-east-1)

### General Service Configuration
- `GRPC_PORT`: gRPC server port (default: 50053)
- `STORAGE_ENABLED`: Enable persistent storage (default: True)

## Fallback Mechanism

The TTS service implements a robust fallback mechanism that automatically switches to a secondary provider when the primary one fails:

1. When a TTS request is received, the primary provider (Azure) is tried first
2. If the primary provider fails, the system automatically attempts the request with the fallback provider (AWS Polly)
3. If both providers fail, an error is returned to the client
4. Successful responses from either provider are cached to improve performance and reliability

This architecture ensures:
- High availability (service continues even when one provider has issues)
- Resilience against provider-specific outages
- Cost optimization (AWS Polly as fallback tends to be less expensive than always using Azure)

## Provider Setup

### Azure Cognitive Services Setup (Primary Provider)

1. Create an Azure Cognitive Services account in the [Azure Portal](https://portal.azure.com/)
2. Create a Speech service resource
3. Copy the API key and region
4. Set the following environment variables:
   ```
   TTS_PROVIDER=azure
   USE_AZURE_TTS=true
   AZURE_SPEECH_KEY=your_speech_key
   AZURE_SERVICE_REGION=your_service_region
   ```

### AWS Polly Setup (Fallback Provider)

1. Create an AWS account if you don't already have one
2. Create an IAM user with Polly access permissions
3. Generate an access key and secret key for the user
4. Set the following environment variables:
   ```
   USE_FALLBACK_PROVIDER=true
   FALLBACK_TTS_PROVIDER=aws
   USE_AWS_POLLY=true
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key
   ```
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
