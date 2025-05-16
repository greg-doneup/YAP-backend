#!/bin/bash
# Script to check health of all pronunciation assessment related services

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==============================================${NC}"
echo -e "${BLUE}   Pronunciation Services Health Check       ${NC}"
echo -e "${BLUE}==============================================${NC}"

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  echo -e "${RED}Error: jq is required but not installed. Please install jq first.${NC}"
  exit 1
fi

# Service configurations
LEARNING_SERVICE_URL="${LEARNING_SERVICE_URL:-http://localhost:8080}"
ALIGNMENT_SERVICE_URL="${ALIGNMENT_SERVICE_URL:-http://localhost:50051}"
PRONUNCIATION_SCORER_URL="${PRONUNCIATION_SCORER_URL:-http://localhost:50052}"
TTS_SERVICE_URL="${TTS_SERVICE_URL:-http://localhost:50053}"
VOICE_SCORE_URL="${VOICE_SCORE_URL:-http://localhost:50054}"

# Function to check gRPC service health using grpc_health_probe if available
check_grpc_health() {
  local service_name="$1"
  local service_url="$2"
  
  echo -e "${YELLOW}Checking $service_name health at $service_url...${NC}"
  
  if command -v grpc_health_probe &> /dev/null; then
    if grpc_health_probe -addr="$service_url" -connect-timeout=3s; then
      echo -e "${GREEN}$service_name is healthy!${NC}"
      return 0
    else
      echo -e "${RED}$service_name is not responding or unhealthy!${NC}"
      return 1
    fi
  else
    echo -e "${YELLOW}grpc_health_probe not available, skipping direct gRPC health check for $service_name${NC}"
    echo -e "${YELLOW}You can install grpc_health_probe for better health checks${NC}"
    return 0  # Skip but don't fail
  fi
}

# Function to check HTTP service health
check_http_health() {
  local service_name="$1"
  local health_endpoint="$2"
  
  echo -e "${YELLOW}Checking $service_name health at $health_endpoint...${NC}"
  
  local response
  response=$(curl -s -m 5 "$health_endpoint")
  local exit_code=$?
  
  if [[ $exit_code -ne 0 ]]; then
    echo -e "${RED}$service_name is not responding (curl failed with exit code $exit_code)${NC}"
    return 1
  fi
  
  if [[ "$response" == *"healthy"* || "$response" == *"ok"* || "$response" == *"status"*":"*"ok"* ]]; then
    echo -e "${GREEN}$service_name is healthy!${NC}"
    echo -e "${GREEN}Response: $response${NC}"
    return 0
  else
    echo -e "${RED}$service_name may be unhealthy!${NC}"
    echo -e "${RED}Response: $response${NC}"
    return 1
  fi
}

# Check Learning Service (HTTP)
echo -e "\n${BLUE}Checking Learning Service...${NC}"
check_http_health "Learning Service" "$LEARNING_SERVICE_URL/health"

# If the Learning Service has a deep health check, use it as well
echo -e "\n${BLUE}Checking Learning Service deep health...${NC}"
deep_health_response=$(curl -s -m 5 "$LEARNING_SERVICE_URL/health/deep")
echo "$deep_health_response" | jq '.'

# Check pronunciation pipeline services directly (gRPC)
echo -e "\n${BLUE}Checking individual gRPC services...${NC}"
check_grpc_health "Alignment Service" "$ALIGNMENT_SERVICE_URL"
check_grpc_health "Pronunciation Scorer" "$PRONUNCIATION_SCORER_URL"
check_grpc_health "TTS Service" "$TTS_SERVICE_URL"
check_grpc_health "Voice Score Service" "$VOICE_SCORE_URL"

# Check if MongoDB is reachable through the Learning Service
echo -e "\n${BLUE}Checking MongoDB connection through Learning Service...${NC}"
mongo_health_response=$(curl -s -m 5 "$LEARNING_SERVICE_URL/health/mongo")
echo "$mongo_health_response" 

echo -e "\n${BLUE}==============================================${NC}"
echo -e "${BLUE}   Health Check Complete                      ${NC}"
echo -e "${BLUE}==============================================${NC}"

# Provide next steps
echo -e "\nIf all services are healthy, you can run the pronunciation pipeline test:"
echo -e "${GREEN}./test-pronunciation-pipeline.sh${NC}"
echo -e "Or if you want to test manually, you can use the API directly:"
echo -e "${GREEN}curl -X POST $LEARNING_SERVICE_URL/daily/tts/sentence -H 'Content-Type: application/json' -d '{\"text\":\"hello world\",\"languageCode\":\"en-US\"}'${NC}"
