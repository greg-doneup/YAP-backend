#!/bin/bash
# This script tests the pronunciation assessment pipeline integration

echo "Testing Pronunciation Assessment Pipeline Integration"
echo "==================================================="

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  echo "Error: jq is required but not installed. Please install jq first."
  exit 1
fi

# Base URL for the learning service
BASE_URL="${LEARNING_SERVICE_URL:-http://localhost:8080}"

# Test data
TEST_USER_ID="test-user-$(date +%s)"
TEST_LESSON_ID="lesson-001"
TEST_WORD_ID="word-001"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to make HTTP requests
make_request() {
  local method="$1"
  local endpoint="$2"
  local data="$3"
  
  if [ -z "$data" ]; then
    curl -s -X "$method" "${BASE_URL}${endpoint}"
  else
    curl -s -X "$method" "${BASE_URL}${endpoint}" \
      -H "Content-Type: application/json" \
      -d "$data"
  fi
}

# Test 1: Health check for all services
echo -e "\n${YELLOW}Testing health check for all services...${NC}"
health_response=$(make_request "GET" "/health/deep")
echo "$health_response" | jq '.'

if echo "$health_response" | jq -e '.status == "ok"' > /dev/null; then
  echo -e "${GREEN}Health check passed.${NC}"
else
  echo -e "${RED}Health check failed or services are degraded.${NC}"
  echo "Check the health response for details."
fi

# Test 2: Get a sample vocabulary list
echo -e "\n${YELLOW}Getting sample vocabulary list...${NC}"
vocab_response=$(make_request "GET" "/daily?userId=${TEST_USER_ID}")
echo "$vocab_response" | jq '.'

# Test 3: Generate TTS for a sentence
echo -e "\n${YELLOW}Testing TTS generation...${NC}"
tts_response=$(make_request "POST" "/daily/tts/sentence" '{"text":"Testing pronunciation assessment pipeline.","languageCode":"en-US"}')
echo "TTS response received with $(echo "$tts_response" | wc -c) bytes"

# Create a temporary file to save the audio
TMP_AUDIO_FILE="/tmp/tts_test_$(date +%s).mp3"
echo "$tts_response" > "$TMP_AUDIO_FILE"
echo "Audio saved to $TMP_AUDIO_FILE"

# Test 4: Test pronunciation assessment with a sample audio file
echo -e "\n${YELLOW}Testing pronunciation assessment with sample audio...${NC}"

# Check if we have a sample audio file
SAMPLE_AUDIO_FILE="${SAMPLE_AUDIO:-/tmp/sample_audio.wav}"
if [ ! -f "$SAMPLE_AUDIO_FILE" ]; then
  echo -e "${RED}No sample audio file found at $SAMPLE_AUDIO_FILE${NC}"
  echo "Please provide a sample audio file path with SAMPLE_AUDIO environment variable"
  echo -e "${YELLOW}Skipping pronunciation assessment test${NC}"
else
  # Convert the audio file to base64
  AUDIO_BASE64=$(base64 -i "$SAMPLE_AUDIO_FILE")
  
  # Create the request payload
  REQUEST_DATA=$(cat <<EOF
{
  "userId": "${TEST_USER_ID}",
  "lessonId": "${TEST_LESSON_ID}",
  "wordId": "${TEST_WORD_ID}",
  "audio": "${AUDIO_BASE64}",
  "detailLevel": "detailed",
  "languageCode": "en-US"
}
EOF
)
  
  # Make the request
  assessment_response=$(make_request "POST" "/daily/complete" "$REQUEST_DATA")
  echo "$assessment_response" | jq '.'
  
  # Check if the response has the expected fields
  if echo "$assessment_response" | jq -e '.pronunciationScore' > /dev/null; then
    echo -e "${GREEN}Pronunciation assessment test passed.${NC}"
    
    # Check if detailed feedback is available
    if echo "$assessment_response" | jq -e '.feedback' > /dev/null; then
      echo -e "${GREEN}Detailed feedback available:${NC}"
      echo "$assessment_response" | jq '.feedback'
    else
      echo -e "${YELLOW}Detailed feedback not available in response.${NC}"
    fi
  else
    echo -e "${RED}Pronunciation assessment test failed.${NC}"
  fi
fi

# Test 5: Test fetching pronunciation history
echo -e "\n${YELLOW}Testing pronunciation history retrieval...${NC}"
history_response=$(make_request "GET" "/daily/pronunciation/history/${TEST_WORD_ID}?userId=${TEST_USER_ID}")
echo "$history_response" | jq '.'

echo -e "\n${GREEN}Testing complete!${NC}"
