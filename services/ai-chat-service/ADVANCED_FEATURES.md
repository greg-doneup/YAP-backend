# AI Chat Service - Advanced Features

## Overview

The AI Chat Service has been enhanced with advanced features to support voice-only conversations, dynamic difficulty adaptation, and lesson integration. These features provide a more personalized and effective language learning experience.

## New Features

### 1. Audio Message Support (Voice-Only Conversations)

**Description**: Users can now have completely voice-based conversations without typing text messages.

**Components**:
- `AudioProcessingService`: Handles transcription and speech synthesis
- Voice-only route: `POST /api/chat/voice-message`
- Automatic transcription of audio input
- Speech synthesis for AI responses (mocked)

**Usage**:
```javascript
// Send voice-only message
const response = await axios.post('/api/chat/voice-message', {
  userId: 'user123',
  sessionId: 'session456',
  audioData: base64AudioString, // Required for voice-only
  language: 'spanish',
  cefrLevel: 'B1',
  conversationMode: 'guided'
});
```

**Implementation Details**:
- Audio data should be sent as base64-encoded buffer
- Transcription is currently mocked but can be replaced with real speech-to-text services
- Speech synthesis returns mock audio but includes proper metadata
- Voice-only conversations are tracked with `isVoiceOnly` metadata

### 2. Difficulty Adaptation

**Description**: The system automatically adjusts conversation difficulty based on user performance metrics.

**Components**:
- `DifficultyAdaptationService`: Analyzes performance and makes adaptation decisions
- Real-time difficulty adjustment during conversations
- Performance metrics tracking (comprehension, pronunciation, vocabulary retention)

**Adaptation Triggers**:
- Comprehension accuracy (based on response quality)
- Pronunciation scores (from audio assessment)
- Vocabulary retention rates
- Conversation flow analysis
- Response complexity and time

**Adaptation Actions**:
- `increase`: Make conversation more challenging
- `decrease`: Simplify vocabulary and grammar
- `maintain`: Keep current difficulty level
- `review`: Focus on previously introduced concepts

**Implementation**:
```typescript
// Automatic adaptation in conversation flow
const userMetrics: DifficultyMetrics = {
  comprehensionScore: 85,
  responseComplexity: 7,
  vocabularyRetention: 90,
  pronunciationAccuracy: 78,
  conversationFlow: 8,
  errorRate: 0.15
};

const decision = await difficultyAdaptationService.makeAdaptationDecision(
  userMetrics, 
  conversationContext
);
```

### 3. Lesson Integration

**Description**: Chat conversations are aligned with structured learning objectives and lesson plans.

**Components**:
- `LessonIntegrationService`: Manages lesson context and progress tracking
- Conversation alignment analysis
- Lesson-aware prompt generation
- Progress updates to learning service

**Features**:
- Retrieve current lesson context for users
- Analyze how conversations align with lesson objectives
- Generate lesson-specific vocabulary and grammar suggestions
- Update lesson progress based on chat interactions
- Provide structured learning path recommendations

**Lesson Alignment**:
```typescript
// Analyze conversation alignment with lesson
const alignment = await lessonIntegrationService.analyzeConversationAlignment(
  conversationHistory,
  currentLesson,
  conversationContext
);

// Returns:
// - alignedWithLesson: boolean
// - currentObjective: string
// - vocabularyOpportunities: VocabularyItem[]
// - grammarReinforcement: string[]
// - suggestedTransitions: string[]
// - nextMilestone: string
```

## Technical Implementation

### Service Integration

All three advanced features are integrated into the main `ConversationManager`:

1. **Audio Processing**: Automatically detects and processes audio data in chat requests
2. **Difficulty Adaptation**: Analyzes each conversation turn and adapts context
3. **Lesson Integration**: Retrieves lesson context and updates progress

### API Changes

**Enhanced `/api/chat/message` endpoint**:
- Now supports audio data processing
- Includes difficulty adaptation in response
- Returns lesson alignment information

**New `/api/chat/voice-message` endpoint**:
- Dedicated voice-only conversation handling
- Requires audio data, optional text message
- Returns transcribed text along with AI response

### Response Enhancements

Chat responses now include:
```json
{
  "success": true,
  "aiMessage": "AI response text",
  "context": {
    "currentTopic": "daily_routine",
    "messagesExchanged": 5,
    "conversationFlow": "main",
    "difficulty": 75
  },
  "suggestedResponses": ["Response 1", "Response 2"],
  "pronunciationFocus": "pronunciation guidance",
  "vocabularyHighlights": [
    {
      "word": "ejemplo",
      "translation": "example",
      "context": "usage context"
    }
  ],
  "pronunciationResult": {
    "overallScore": 85,
    "feedback": ["Good pronunciation"]
  }
}
```

## Configuration

### Environment Variables

```bash
# Audio Processing
SPEECH_TO_TEXT_API_KEY=your_stt_key
TEXT_TO_SPEECH_API_KEY=your_tts_key

# Learning Service Integration
LEARNING_SERVICE_URL=http://learning-service:3001
USER_SERVICE_URL=http://user-service:3002

# Feature Flags
ENABLE_VOICE_PROCESSING=true
ENABLE_DIFFICULTY_ADAPTATION=true
ENABLE_LESSON_INTEGRATION=true
```

### Service Dependencies

The advanced features require connection to:
- **Learning Service**: For lesson context and progress updates
- **User Service**: For user profiles and preferences
- **Speech Services**: For real audio transcription/synthesis (when implemented)

## Testing

### Run Integration Tests

```bash
# Test all advanced features
node test-advanced-features.js

# Test specific features
npm test -- --grep "audio processing"
npm test -- --grep "difficulty adaptation"
npm test -- --grep "lesson integration"
```

### Manual Testing

1. **Voice-Only Chat**:
   ```bash
   curl -X POST http://localhost:3003/api/chat/voice-message \
     -H "Content-Type: application/json" \
     -H "x-user-id: test-user" \
     -d '{
       "userId": "test-user",
       "sessionId": "session123",
       "audioData": "base64_encoded_audio",
       "language": "spanish",
       "cefrLevel": "B1",
       "conversationMode": "guided"
     }'
   ```

2. **Difficulty Adaptation**: Send multiple messages and observe difficulty changes in responses

3. **Lesson Integration**: Start a session and check for lesson-aligned vocabulary and objectives

## Architecture

```
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│ ConversationManager │───▶│ AudioProcessingService│    │ DifficultyAdaption │
│                     │    │                      │    │ Service            │
│ ┌─────────────────┐ │    │ • transcribeAudio()  │    │                    │
│ │ processChatMsg  │ │    │ • synthesizeSpeech() │    │ • analyzeMetrics() │
│ │                 │ │    │ • processVoiceOnly() │    │ • makeDecision()   │
│ │ 1. Audio proc   │ │    └──────────────────────┘    │ • applyAdaptation()│
│ │ 2. Lesson ctx   │ │                                └─────────────────────┘
│ │ 3. AI response  │ │    ┌──────────────────────┐
│ │ 4. Difficulty   │ │───▶│ LessonIntegration    │
│ │ 5. Progress     │ │    │ Service              │
│ └─────────────────┘ │    │                      │
└─────────────────────┘    │ • getCurrentLesson() │
                           │ • analyzeAlignment() │
                           │ • updateProgress()   │
                           └──────────────────────┘
```

## Future Enhancements

1. **Real Audio Integration**: Replace mock transcription/synthesis with actual services
2. **Advanced Metrics**: More sophisticated performance analysis
3. **Personalized Lessons**: Dynamic lesson generation based on chat performance
4. **Multi-modal Learning**: Combine voice, text, and visual elements
5. **Real-time Feedback**: Live pronunciation coaching during conversations

## Troubleshooting

### Common Issues

1. **Audio Processing Errors**: Check audio data format (should be base64)
2. **Lesson Context Missing**: Verify learning service connectivity
3. **Difficulty Not Adapting**: Check user metrics calculation and thresholds
4. **Service Dependencies**: Ensure all required services are running

### Debug Logging

Enable debug logging for detailed information:
```bash
DEBUG=ai-chat:* npm start
```

This will show detailed logs for:
- Audio processing steps
- Difficulty adaptation decisions
- Lesson integration progress
- Service communication
