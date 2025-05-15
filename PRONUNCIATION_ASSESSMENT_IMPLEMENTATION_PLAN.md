# YAP Pronunciation Assessment Implementation Plan

This document outlines the implementation plan for enhancing the YAP backend with a complete pronunciation assessment pipeline and text-to-speech capabilities across multiple languages.

## Overview

The implementation is divided into phases to ensure incremental delivery and validate each component before proceeding. The plan addresses the three-stage pipeline for pronunciation assessment as outlined in the white paper:

1. **Automatic Speech Recognition (ASR)** - Currently implemented with Whisper
2. **Forced Alignment** - To be implemented with WhisperX or similar
3. **Pronunciation Scoring** - To be implemented with GOP or similar

Additionally, we'll implement robust TTS capabilities to support the multiple languages shown in the UI mockups.

## Phase 0: Preparation (1 week)

### Project Setup
- [ ] Create GitHub milestone for pronunciation assessment
- [ ] Set up task tracking for all implementation items
- [ ] Define communication channels and sprint/review cadence
- [ ] Establish testing strategy and performance benchmarks

### Technical Research
- [ ] Evaluate WhisperX vs. Kaldi MFA for alignment service
- [ ] Evaluate Kaldi GOP vs. Azure Pronunciation API for scoring
- [ ] Research TTS options for multi-language support (Mozilla TTS, AWS Polly, Azure TTS)
- [ ] Benchmark performance of selected technologies on sample audio
- [ ] Determine GPU requirements for production deployment

## Phase 1: Infrastructure Setup (2 weeks)

### AWS Infrastructure
- [ ] Create S3 bucket for audio storage with server-side encryption
- [ ] Set up DynamoDB `PronunciationAttempts` table with partition key (wallet+date)
- [ ] Create DynamoDB `TTSCache` table for caching TTS outputs
- [ ] Configure IAM roles and IRSA for service access to S3/DynamoDB
- [ ] Create Terraform configurations for the new infrastructure components

### Alignment Service Setup
- [ ] Create new service directory structure `services/alignment-service`
- [ ] Create initial `Dockerfile` with Python and CUDA dependencies
- [ ] Create proto definition for alignment service API
- [ ] Add alignment-service to skaffold.yaml configuration
- [ ] Create Kubernetes deployment and service manifests in `infra/k8s/alignment-service.yaml`
- [ ] Define GPU resource requirements in the deployment manifest
- [ ] Set up CI/CD pipeline configuration for the new service

### Pronunciation Scorer Service Setup
- [ ] Create new service directory structure `services/pronunciation-scorer`
- [ ] Create initial `Dockerfile` with dependencies
- [ ] Create proto definition for pronunciation scoring API
- [ ] Add pronunciation-scorer to skaffold.yaml configuration
- [ ] Create Kubernetes deployment and service manifests in `infra/k8s/pronunciation-scorer.yaml`
- [ ] Set up CI/CD pipeline configuration for the new service

### TTS Service Setup
- [ ] Create new service directory structure `services/tts-service`
- [ ] Create initial `Dockerfile` with TTS dependencies
- [ ] Create proto definition for TTS service API
- [ ] Add tts-service to skaffold.yaml configuration
- [ ] Create Kubernetes deployment and service manifests in `infra/k8s/tts-service.yaml`
- [ ] Set up CI/CD pipeline configuration for the new service

## Phase 2: Alignment Service Implementation (3 weeks)

### Dependencies Setup
- [ ] Create `requirements.txt` with WhisperX and other dependencies
- [ ] Implement model loading and initialization with GPU/CPU fallback
- [ ] Set up lazy loading of alignment models for memory efficiency

### Core Functionality
- [ ] Implement gRPC service definition
- [ ] Create alignment function using WhisperX
- [ ] Implement phoneme extraction function
- [ ] Add word-level alignment functionality
- [ ] Implement audio format conversion/normalization

### API & Integration
- [ ] Create alignment request/response handlers
- [ ] Implement proper error handling and logging
- [ ] Add health check endpoint
- [ ] Implement metrics for observability (Prometheus)

### Storage Integration
- [ ] Implement S3 integration for storing alignment results
- [ ] Create caching mechanism for frequent alignments
- [ ] Add memory management for large audio files

### Testing & Documentation
- [ ] Create unit tests for alignment functions
- [ ] Create integration tests for gRPC service
- [ ] Create documentation for API usage
- [ ] Create testing script with sample audio files

## Phase 3: Pronunciation Scorer Implementation (4 weeks)

### Dependencies Setup
- [ ] Create `requirements.txt` with Kaldi/pronunciation assessment dependencies
- [ ] Set up phoneme lexicons for target languages
- [ ] Configure dockerfile with necessary Kaldi dependencies

### Core Functionality
- [ ] Implement gRPC service definition
- [ ] Create GOP (Goodness of Pronunciation) calculation function
- [ ] Implement phoneme-level scoring
- [ ] Add pronunciation issue detection logic
- [ ] Implement score aggregation function

### Fallback Implementation
- [ ] Add Azure Pronunciation API integration as fallback
- [ ] Create adapter interface for different scoring backends
- [ ] Implement provider selection strategy
- [ ] Add configuration options for switching between providers

### API & Integration
- [ ] Create scoring request/response handlers
- [ ] Implement proper error handling and logging
- [ ] Add health check endpoint
- [ ] Implement metrics for observability (Prometheus)

### Multi-Language Support
- [ ] Implement language detection from audio
- [ ] Add support for phoneme lexicons in multiple languages
- [ ] Create mapping between language codes and pronunciation models

### Testing & Documentation
- [ ] Create unit tests for scoring functions
- [ ] Create integration tests for gRPC service
- [ ] Create documentation for API usage
- [ ] Create testing script with sample audio files and alignments

## Phase 4: TTS Service Implementation (3 weeks)

### Dependencies Setup
- [ ] Evaluate TTS options (Amazon Polly, Google Cloud TTS, Mozilla TTS, etc.)
- [ ] Create requirements.txt with selected TTS library dependencies
- [ ] Set up voice models for multiple languages

### Core Functionality
- [ ] Implement gRPC service definition for TTS
- [ ] Create TTS generation function with language and regional variant selection
- [ ] Implement voice profile selection logic
- [ ] Add audio format conversion utilities
- [ ] Implement caching mechanism for common phrases

### Multi-Language Support
- [ ] Create voice model registry for all supported languages (from UI mockups)
- [ ] Implement regional accent selection (e.g., different Spanish variants)
- [ ] Create language detection fallback for unknown languages
- [ ] Add SSML support for better pronunciation control
- [ ] Implement phoneme-to-speech mapping for pronunciation examples

### Storage Integration
- [ ] Implement S3 integration for storing generated audio
- [ ] Create DynamoDB integration for caching common phrases
- [ ] Add TTL-based expiration for cached audio

### API & Integration
- [ ] Create TTS request/response handlers
- [ ] Implement proper error handling and logging
- [ ] Add health check endpoint
- [ ] Implement metrics for observability (Prometheus)

### Testing & Documentation
- [ ] Create unit tests for TTS functions
- [ ] Create integration tests for gRPC service
- [ ] Create documentation for API usage
- [ ] Create testing script with sample texts in different languages

## Phase 5: Voice-Score Service Refactoring (2 weeks)

### Proto Definition Updates
- [ ] Update `voice.proto` to include phoneme-level information
- [ ] Add alignment results to response structure
- [ ] Update service interface definitions

### Core Functionality Updates
- [ ] Refactor existing scoring logic to be optional/fallback
- [ ] Implement integration with alignment service
- [ ] Implement integration with pronunciation scorer service
- [ ] Update transcription logic to return more detailed information

### Performance Optimization
- [ ] Implement caching for common words and phrases
- [ ] Optimize model loading and initialization
- [ ] Add resource usage monitoring and throttling

### Testing & Documentation
- [ ] Update existing tests for new functionality
- [ ] Create integration tests with the new services
- [ ] Update API documentation

## Phase 6: Learning Service Integration (3 weeks)

### Client Integration
- [ ] Create client for alignment service in learning-service
- [ ] Create client for pronunciation scorer service
- [ ] Create client for TTS service
- [ ] Update voice-score client for new interface

### Business Logic Updates
- [ ] Refactor daily completion handler to use the three-stage pipeline
- [ ] Implement S3 storage for audio samples
- [ ] Implement DynamoDB storage for pronunciation attempts
- [ ] Update pass/fail threshold logic based on phoneme-level scoring

### TTS Integration
- [ ] Add TTS generation for vocabulary items
- [ ] Create endpoints for TTS audio generation
- [ ] Implement caching strategy for frequently accessed TTS audio
- [ ] Add language-specific voice selection

### API Updates
- [ ] Update learning-service API responses to include detailed pronunciation feedback
- [ ] Add endpoints for historical pronunciation data
- [ ] Implement detail level parameter for results (summary vs detailed)
- [ ] Add endpoints for TTS audio retrieval

### Testing & Documentation
- [ ] Update existing tests for new functionality
- [ ] Create integration tests for the full pipeline
- [ ] Update API documentation

## Phase 7: Frontend Integration (2 weeks)

### Service Updates
- [ ] Update pronunciation service to handle detailed phoneme feedback
- [ ] Create visualization components for pronunciation feedback
- [ ] Implement caching strategy for audio and pronunciation data
- [ ] Add TTS playback functionality

### UI Updates
- [ ] Create new UI components for detailed pronunciation feedback
- [ ] Implement visualization for phoneme-level scores
- [ ] Add playback functionality with highlighted issues
- [ ] Add comparison between user pronunciation and native example

### Language Variant Support
- [ ] Implement UI for selecting language variants (e.g., Spanish from different countries)
- [ ] Add TTS voice selection based on language variants
- [ ] Create feedback specific to different language variants

### Testing
- [ ] Create unit tests for new components
- [ ] Conduct end-to-end testing of the full pronunciation assessment flow
- [ ] Test with multiple languages and regional variants

## Phase 8: Testing & Quality Assurance (2 weeks)

### Integration Testing
- [ ] Test the full pronunciation assessment pipeline end-to-end
- [ ] Verify performance with various audio inputs
- [ ] Test error handling and recovery
- [ ] Verify scoring consistency across different inputs

### Performance Testing
- [ ] Benchmark alignment service performance
- [ ] Benchmark pronunciation scoring performance
- [ ] Benchmark TTS service performance
- [ ] Test system under load with multiple concurrent users
- [ ] Optimize resource utilization and scaling

### Multi-Language Testing
- [ ] Test pronunciation assessment in all supported languages
- [ ] Verify TTS quality for all languages and regional variants
- [ ] Test language switching behavior
- [ ] Validate phoneme detection across different languages

### Documentation & Handoff
- [ ] Create comprehensive documentation for the pronunciation assessment pipeline
- [ ] Document API changes and new endpoints
- [ ] Create operational runbooks for the new services
- [ ] Conduct knowledge transfer sessions for team members

## Phase 9: Deployment & Rollout (2 weeks)

### Staging Deployment
- [ ] Deploy all services to staging environment
- [ ] Conduct final integration tests
- [ ] Verify performance and resource usage
- [ ] Run load tests on the complete system

### Production Preparation
- [ ] Configure auto-scaling for all services
- [ ] Set up monitoring and alerting
- [ ] Create backup and disaster recovery procedures
- [ ] Prepare rollback plans

### Gradual Rollout
- [ ] Roll out to limited set of users (canary deployment)
- [ ] Monitor system performance and user feedback
- [ ] Make necessary adjustments
- [ ] Expand to all users

### Post-Deployment Activities
- [ ] Conduct post-deployment review
- [ ] Gather metrics on system performance
- [ ] Collect user feedback
- [ ] Plan for future improvements

## Technical Details

### New Services to Add to skaffold.yaml

```yaml
# ---------- ALIGNMENT-SERVICE ----------
- image: alignment-service
  context: services/alignment-service
  docker:
    dockerfile: Dockerfile
  sync:
    manual:
      - src: "app/**/*.py"
        dest: .
      - src: "proto/**/*.proto"
        dest: .

# ---------- PRONUNCIATION-SCORER ----------
- image: pronunciation-scorer
  context: services/pronunciation-scorer
  docker:
    dockerfile: Dockerfile
  sync:
    manual:
      - src: "app/**/*.py"
        dest: .
      - src: "proto/**/*.proto"
        dest: .

# ---------- TTS-SERVICE ----------
- image: tts-service
  context: services/tts-service
  docker:
    dockerfile: Dockerfile
  sync:
    manual:
      - src: "app/**/*.py"
        dest: .
      - src: "proto/**/*.proto"
        dest: .
```

### Dependencies & Technology Stack

1. **Alignment Service**:
   - Python 3.9+
   - WhisperX (which uses Wav2Vec2 for alignment)
   - gRPC
   - CUDA libraries (optional but recommended)
   - PyTorch

2. **Pronunciation Scorer**:
   - Python 3.9+
   - Kaldi (for GOP implementation)
   - gRPC
   - Language-specific phoneme lexicons
   - Optional: Azure Cognitive Services SDK

3. **TTS Service**:
   - Python 3.9+
   - Mozilla TTS / AWS Polly / Google Cloud TTS
   - gRPC
   - Language-specific voice models
   - SSML processing libraries

4. **Infrastructure**:
   - AWS S3 for audio storage
   - AWS DynamoDB for pronunciation data and TTS cache
   - Kubernetes for deployment
   - Prometheus for monitoring

### Success Criteria

- Complete three-stage pipeline implementation (ASR → Alignment → Scoring)
- Detailed phoneme-level pronunciation feedback
- High-quality TTS in all languages shown in the UI mockups
- Support for language variants (e.g., regional Spanish accents)
- Storage of pronunciation attempts for historical analysis
- Metrics for pronunciation improvement over time
- Ability to switch between open-source and cloud-based components
- Performance suitable for real-time feedback (<2s response time)

## Timeline Summary

| Phase | Description | Duration |
|-------|-------------|----------|
| 0 | Preparation | 1 week |
| 1 | Infrastructure Setup | 2 weeks |
| 2 | Alignment Service Implementation | 3 weeks |
| 3 | Pronunciation Scorer Implementation | 4 weeks |
| 4 | TTS Service Implementation | 3 weeks |
| 5 | Voice-Score Service Refactoring | 2 weeks |
| 6 | Learning Service Integration | 3 weeks |
| 7 | Frontend Integration | 2 weeks |
| 8 | Testing & Quality Assurance | 2 weeks |
| 9 | Deployment & Rollout | 2 weeks |

**Total duration:** Approximately 24 weeks / 6 months

Note: Phases can overlap where dependencies allow, potentially reducing the total timeline.
