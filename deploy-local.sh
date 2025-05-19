#!/bin/bash
# deploy-local.sh - A more resilient way to deploy YAP backend services locally

# Display commands as they're executed
set -x

# Define colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting deployment of YAP backend services...${NC}"

# Set environment variables for deployment
export SKAFFOLD_CACHE_ARTIFACTS=false
export SKAFFOLD_MEMORY_OPTIMIZED=true

# Deploy profile-service and auth-service first
echo -e "${GREEN}Deploying core services (auth and profile)...${NC}"
skaffold run --profile local --kube-context yap \
  --module auth-service,profile-service \
  --cache-artifacts=false \
  --memory-optimized || { 
    echo -e "${RED}Failed to deploy core services.${NC}"
    exit 1
  }

# Deploy CPU-intensive services separately 
echo -e "${GREEN}Deploying voice processing services...${NC}"
skaffold run --profile local --kube-context yap \
  --module voice-score \
  --cache-artifacts=false \
  --memory-optimized || {
    echo -e "${RED}Warning: Failed to deploy voice-score. Continuing with other services.${NC}"
  }

# Deploy TTS service with updated configuration
echo -e "${GREEN}Deploying TTS service...${NC}"
skaffold run --profile local --kube-context yap \
  --module tts-service \
  --cache-artifacts=false \
  --memory-optimized || {
    echo -e "${RED}Warning: Failed to deploy TTS service. Continuing with other services.${NC}"
  }

# Deploy remaining services
echo -e "${GREEN}Deploying remaining services...${NC}"
skaffold run --profile local --kube-context yap \
  --module grammar-service,reward-service,observability-service,learning-service,gateway-service,alignment-service,pronunciation-scorer,offchain-profile \
  --cache-artifacts=false \
  --memory-optimized || {
    echo -e "${RED}Warning: Some services failed to deploy.${NC}"
  }

echo -e "${GREEN}Deployment completed. Check service status to verify all services are running.${NC}"
