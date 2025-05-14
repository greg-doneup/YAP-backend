#!/bin/bash
# Test script for user lesson progress system
echo "Testing user lesson progress system..."

# Set API base URL
API_URL="http://localhost:8080"
USER_ID="test-user-123"

# Use MongoDB Atlas connection from environment variables
# These should be loaded from the k8s secrets in a real deployment
export MONGO_URI="mongodb+srv://yap-backend:sipwid-cemnYj-doqto2@cy0.uvp0w.mongodb.net/?retryWrites=true&w=majority&appName=CY0"
export MONGO_DB_NAME="yap_test"  # Use a test database to avoid affecting production data

echo "1. Creating initial user progress..."
curl -X POST "${API_URL}/progress" \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"${USER_ID}\", \"currentLessonId\": \"lesson-1\", \"currentWordId\": \"word-1\"}" \
  | jq .

echo -e "\n2. Fetching user progress..."
curl -X GET "${API_URL}/progress?userId=${USER_ID}" | jq .

echo -e "\n3. Completing a lesson word..."
curl -X POST "${API_URL}/daily/complete" \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"${USER_ID}\", \"lessonId\": \"lesson-1\", \"wordId\": \"word-1\", \"transcript\": \"I am saying hello.\"}" \
  | jq .

echo -e "\n4. Fetching updated user progress..."
curl -X GET "${API_URL}/progress?userId=${USER_ID}" | jq .

echo -e "\n5. Submitting a quiz..."
curl -X POST "${API_URL}/quiz/submit" \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"${USER_ID}\", \"transcript\": \"I am practicing hello, goodbye, please, thank you, sorry.\"}" \
  | jq .

echo -e "\n6. Fetching lesson history..."
curl -X GET "${API_URL}/progress/history?userId=${USER_ID}" | jq .

echo -e "\nTests completed."
