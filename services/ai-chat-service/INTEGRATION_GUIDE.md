# AI Chat Service - Direct Service Integration

## Architecture Update: From JWT/Gateway to Direct Service Communication

This AI chat service has been updated to work with the new YAP architecture that eliminates the need for JWT authentication and Gateway services in favor of direct service-to-service communication within the AWS EKS cluster.

## Key Changes

### 🚫 Removed Dependencies
- **JWT Authentication**: No longer requires JWT tokens and `jsonwebtoken` dependency
- **Gateway Service**: Direct communication eliminates need for API Gateway routing
- **HTTP Header-based Auth**: Uses `x-user-id` header for service identification

### ✅ New Features
- **Direct Service Integration**: Uses `YapServiceClient` for direct HTTP calls to other services
- **Pronunciation Assessment**: Real-time integration with pronunciation evaluation pipeline
- **User Profile Sync**: Automatic user profile retrieval for personalized chat adaptation
- **Progress Tracking**: Automatic logging of chat interactions for analytics
- **Vocabulary Recommendations**: Dynamic vocabulary suggestions based on user progress

### 🔧 Service Endpoints Integration

#### Pronunciation Assessment Service
```typescript
// Evaluates user audio input for pronunciation accuracy
await yapServiceClient.evaluatePronunciation(
  audioBuffer,
  expectedText,
  languageCode
);
```

#### User Profile Service
```typescript
// Retrieves user preferences and learning history
await yapServiceClient.getUserProfile(userId);
```

#### Learning Analytics Service
```typescript
// Logs chat interactions for progress tracking
await yapServiceClient.logChatInteraction(userId, sessionId, interactionData);
```

#### Vocabulary Service
```typescript
// Gets personalized vocabulary recommendations
await yapServiceClient.getVocabularyRecommendations(
  userId, language, cefrLevel, context
);
```

## Service Configuration

### Environment Variables
```bash
# Service Discovery URLs (defaults to EKS service DNS)
LEARNING_SERVICE_URL=http://learning-service:3001
USER_SERVICE_URL=http://user-service:3002

# OpenAI Configuration
OPENAI_API_KEY=your-openai-key

# Database (MongoDB)
MONGODB_URI=mongodb://mongo:27017/ai-chat
```

### Service-to-Service Authentication
```bash
# Headers required for service calls
x-user-id: user-identifier-from-calling-service
```

## Integration Flow

1. **Frontend → AI Chat Service**: User sends chat message with audio
2. **AI Chat Service → Pronunciation Service**: Audio evaluation
3. **AI Chat Service → User Profile Service**: Get user preferences
4. **AI Chat Service → Vocabulary Service**: Get recommendations
5. **AI Chat Service → OpenAI**: Generate contextual response
6. **AI Chat Service → Analytics Service**: Log interaction
7. **AI Chat Service → Frontend**: Return AI response + pronunciation feedback

## Testing Integration

Run the integration test to verify service-to-service communication:

```bash
./test-integration.sh
```

## Deployment in EKS

### Service Discovery
Services communicate using Kubernetes DNS:
- `learning-service:3001`
- `user-service:3002`
- `ai-chat-service:3003`

### Security
- **Network Policies**: Kubernetes network policies control inter-service communication
- **Service Mesh**: Can be integrated with Istio/Linkerd for advanced routing and security
- **Header Validation**: Each service validates the `x-user-id` header

## Migration Notes

### For Other Services Calling AI Chat:
Instead of:
```bash
curl -H "Authorization: Bearer jwt-token" /api/chat/message
```

Use:
```bash
curl -H "x-user-id: user-123" /api/chat/message
```

### Error Handling
The service gracefully handles integration failures:
- Pronunciation assessment failures don't block chat
- User profile fetch failures use default settings
- Analytics logging failures are logged but don't interrupt conversation

## Benefits

1. **Simplified Architecture**: No JWT management or Gateway complexity
2. **Improved Performance**: Direct service calls reduce latency
3. **Better Integration**: Real-time pronunciation and progress tracking
4. **EKS Native**: Designed for Kubernetes service mesh patterns
5. **Fault Tolerant**: Graceful degradation when dependent services are unavailable

## Next Steps

- [ ] Frontend integration for real-time chat with pronunciation feedback
- [ ] Audio message support for voice-only conversations
- [ ] Advanced difficulty adaptation based on user performance
- [ ] Integration with lesson planning service for structured learning paths
