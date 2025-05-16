# Voice Score API Documentation

This document outlines the updated Voice Score API that implements the three-stage pronunciation assessment pipeline.

## Overview

The Voice Score service provides pronunciation assessment by orchestrating three services:

1. **Alignment Service**: Aligns audio with text to get word and phoneme-level timing
2. **Pronunciation Scorer Service**: Scores pronunciation quality based on alignments
3. **TTS Service**: Generates text-to-speech audio for examples and feedback

## Service Definition

The Voice Score service implements the following gRPC interface:

```protobuf
service VoiceScore {
  // Legacy evaluation method (simple scoring without details)
  rpc Evaluate (EvalRequest) returns (EvalResponse);
  
  // Detailed evaluation using the three-stage pipeline
  rpc EvaluateDetailed (DetailedEvalRequest) returns (DetailedEvalResponse);
  
  // Health check endpoint
  rpc HealthCheck (HealthCheckRequest) returns (HealthCheckResponse);
}
```

## Detailed Evaluation Process

The `EvaluateDetailed` endpoint performs the following steps:

1. Receives audio and expected text from the client
2. Calls the Alignment Service to get word and phoneme-level timing information
3. Passes the audio, text, and alignments to the Pronunciation Scorer Service
4. Processes the scoring results and returns detailed feedback

## Request and Response Formats

### Detailed Evaluation Request

```protobuf
message DetailedEvalRequest {
  bytes  audio            = 1;   // RAW PCM 16-bit little-endian 16 kHz mono
  string expected_phrase  = 2;   // target text ("hola")
  string language_code    = 3;   // Language code (e.g., "en-US", "es-ES")
  string audio_format     = 4;   // Format of the audio (e.g., "wav", "mp3")
  string detail_level     = 5;   // "word", "phoneme", or "sentence"
}
```

### Detailed Evaluation Response

```protobuf
message DetailedEvalResponse {
  string transcript       = 1;   // STT result
  double overall_score    = 2;   // 0-100 overall pronunciation score
  bool   pass             = 3;   // true when score ≥ threshold
  repeated WordDetail words = 4; // Word-level details
  repeated PhonemeDetail phonemes = 5; // Phoneme-level details
  repeated string feedback = 6;  // General feedback on pronunciation
  string evaluation_id    = 7;   // Unique identifier for this evaluation
  string alignment_id     = 8;   // Reference to alignment service result
  string scoring_id       = 9;   // Reference to scoring service result
}
```

## Word and Phoneme Details

The response includes detailed information about each word and phoneme:

```protobuf
message WordDetail {
  string word             = 1;   // The word
  float  start_time       = 2;   // In seconds
  float  end_time         = 3;   // In seconds
  float  score            = 4;   // 0-100 pronunciation score
  repeated string issues  = 5;   // Description of pronunciation issues
}

message PhonemeDetail {
  string phoneme          = 1;   // The phoneme
  string word             = 2;   // The word this phoneme belongs to
  float  start_time       = 3;   // In seconds
  float  end_time         = 4;   // In seconds
  float  score            = 5;   // 0-100 pronunciation score
  string issue            = 6;   // Description of pronunciation issue
}
```

## Health Check

The health check endpoint reports the status of the service and its dependencies:

```protobuf
message HealthCheckRequest {}

message HealthCheckResponse {
  bool status = 1;              // true if service is healthy
  string message = 2;           // Description of health status
}
```

## Configuration

The service can be configured with the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| GRPC_PORT | gRPC server port | 50054 |
| ALIGNMENT_SERVICE_HOST | Host of the alignment service | alignment-service |
| ALIGNMENT_SERVICE_PORT | Port of the alignment service | 50051 |
| PRONUNCIATION_SCORER_HOST | Host of the pronunciation scorer | pronunciation-scorer |
| PRONUNCIATION_SCORER_PORT | Port of the pronunciation scorer | 50052 |
| TTS_SERVICE_HOST | Host of the TTS service | tts-service |
| TTS_SERVICE_PORT | Port of the TTS service | 50053 |
| MONGODB_ENABLED | Enable MongoDB storage | False |
| MONGO_URI | MongoDB connection URI | mongodb://localhost:27017 |
| MONGO_DB_NAME | MongoDB database name | yap |
| PASS_THRESHOLD | Score threshold for passing | 0.8 |
| DEFAULT_DETAIL_LEVEL | Default detail level | phoneme |
| USE_FALLBACK_SCORING | Use legacy scoring as fallback | True |

## Examples

### Python Client Example

```python
import grpc
import wave
from proto import voice_pb2
from proto import voice_pb2_grpc

def evaluate_pronunciation(audio_file_path, expected_phrase, language_code="en-US"):
    # Read audio file
    with wave.open(audio_file_path, 'rb') as wf:
        audio_data = wf.readframes(wf.getnframes())
    
    # Create gRPC channel
    channel = grpc.insecure_channel('localhost:50054')
    stub = voice_pb2_grpc.VoiceScoreStub(channel)
    
    # Create request
    request = voice_pb2.DetailedEvalRequest(
        audio=audio_data,
        expected_phrase=expected_phrase,
        language_code=language_code,
        detail_level="phoneme"
    )
    
    # Call service
    response = stub.EvaluateDetailed(request)
    
    # Process response
    print(f"Overall score: {response.overall_score}")
    print(f"Pass: {response.pass_}")
    
    # Print word scores
    print("\nWord scores:")
    for word in response.words:
        print(f"  {word.word}: {word.score}")
        if word.issues:
            print(f"    Issues: {', '.join(word.issues)}")
    
    # Print phoneme scores with issues
    print("\nPhoneme issues:")
    for phoneme in response.phonemes:
        if phoneme.issue:
            print(f"  {phoneme.phoneme} in '{phoneme.word}': {phoneme.issue}")
    
    return response

if __name__ == "__main__":
    evaluate_pronunciation("recording.wav", "hello world")
```
