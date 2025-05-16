# Pronunciation Assessment API Documentation

This document describes the pronunciation assessment endpoints available in the Learning Service API.

## Overview

The pronunciation assessment pipeline involves a three-stage process:
1. **Alignment**: Aligning the user's speech with the expected text
2. **Pronunciation Scoring**: Evaluating the quality of pronunciation at phoneme and word levels
3. **Feedback Generation**: Providing detailed feedback based on pronunciation issues

## Endpoints

### Daily Completion with Pronunciation Assessment

**Endpoint**: `POST /daily/complete`

**Description**: Submit a daily lesson completion with audio for pronunciation assessment

**Request Body**:
```json
{
  "userId": "string",
  "lessonId": "string",
  "wordId": "string",
  "audio": "base64-encoded-audio",
  "transcript": "string (optional)",
  "detailLevel": "summary|detailed",
  "languageCode": "en-US"
}
```

**Response**:
```json
{
  "pass": true|false,
  "pronunciationScore": 0.95,
  "grammarScore": 0.9,
  "expected": "I am saying hello.",
  "corrected": "I am saying hello.",
  "wordDetails": [
    {
      "word": "hello",
      "start_time": 1.2,
      "end_time": 1.7,
      "score": 0.9,
      "issues": ["intonation"]
    }
  ],
  "phonemeDetails": [
    {
      "phoneme": "h",
      "word": "hello",
      "start_time": 1.2,
      "end_time": 1.3,
      "score": 0.95,
      "issue": ""
    }
  ],
  "feedback": [
    "Good job! Your pronunciation is clear and accurate."
  ],
  "transcript": "I am saying hello."
}
```

### Get TTS Audio for Vocabulary Item

**Endpoint**: `GET /daily/tts/:wordId`

**Description**: Retrieve TTS audio for a vocabulary word

**Query Parameters**:
- `languageCode`: ISO language code (e.g., "en-US", "es-ES")

**Response**: Audio file (MP3)

### Generate TTS for Custom Sentence

**Endpoint**: `POST /daily/tts/sentence`

**Description**: Generate TTS audio for a custom sentence

**Request Body**:
```json
{
  "text": "This is a sample sentence.",
  "languageCode": "en-US"
}
```

**Response**: Audio file (MP3)

### Get Pronunciation History

**Endpoint**: `GET /daily/pronunciation/history/:wordId`

**Description**: Get pronunciation history for a specific word

**Query Parameters**:
- `userId`: User ID
- `view`: "summary" or "detailed" (defaults to "summary")

**Response** (Summary view):
```json
{
  "wordId": "word123",
  "userId": "user456",
  "attempts": [
    {
      "date": "2025-05-15",
      "timestamp": "2025-05-15T14:30:00Z",
      "pronunciationScore": 0.87,
      "pass": true,
      "feedback": ["Your pronunciation is improving."]
    }
  ],
  "count": 1
}
```

## Authentication

All endpoints require authentication. Include an authorization header with a valid JWT token:

```
Authorization: Bearer your-jwt-token
```

## Error Responses

- **400 Bad Request**: Missing required parameters
- **401 Unauthorized**: Invalid or missing authentication token
- **404 Not Found**: Requested resource not found
- **500 Internal Server Error**: Server encountered an error processing the request

## Pronunciation Score Thresholds

- Overall passing score threshold: 0.8 (80%)
- Word-level acceptable threshold: 0.7 (70%)
- Phoneme-level acceptable threshold: 0.6 (60%)
