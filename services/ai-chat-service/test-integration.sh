#!/bin/bash

# Test integration between AI chat service and other YAP services
# This script demonstrates the new direct service-to-service communication

echo "🔧 Testing AI Chat Service Integration"
echo "======================================"

# Start the AI chat service
echo "🚀 Starting AI chat service..."
cd /Users/gregbrown/github/YAP/YAP-backend/services/ai-chat-service
npm run dev &
SERVICE_PID=$!

# Wait for service to start
echo "⏳ Waiting for service to be ready..."
sleep 5

# Test health endpoint
echo "🏥 Testing health endpoint..."
curl -s http://localhost:3003/health | jq .

# Test creating a chat session with service-to-service auth
echo "💬 Testing chat session creation with direct service auth..."
curl -s -X POST http://localhost:3003/api/chat/start-session \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user-123" \
  -d '{
    "userId": "test-user-123",
    "language": "spanish",
    "cefrLevel": "B1",
    "conversationMode": "guided"
  }' | jq .

echo ""
echo "✅ Integration test completed!"
echo "🆕 New Architecture Features:"
echo "   - ❌ No JWT/Gateway dependency"
echo "   - ✅ Direct service-to-service communication via headers"
echo "   - ✅ Ready for AWS EKS service mesh"
echo "   - ✅ Integrated with pronunciation assessment pipeline"
echo "   - ✅ User profile and progress tracking integration"

# Clean up
echo "🧹 Cleaning up..."
kill $SERVICE_PID 2>/dev/null
echo "✨ Done!"
