#!/bin/bash
# build-learning-service.sh - Build and push learning service to DigitalOcean Container Registry

set -euo pipefail

# Configuration
REGISTRY="registry.digitalocean.com/yap-cr"
SERVICE_NAME="learning-service"
IMAGE_TAG=${1:-latest}

echo "🚀 Building and pushing $SERVICE_NAME to DigitalOcean Container Registry"
echo "📍 Registry: $REGISTRY"
echo "🏷️  Tag: $IMAGE_TAG"
echo ""

# Login to DigitalOcean Container Registry
echo "🔐 Logging into DigitalOcean Container Registry..."
doctl registry login

# Check if service directory exists
if [ ! -d "services/$SERVICE_NAME" ]; then
    echo "❌ Directory services/$SERVICE_NAME not found!"
    exit 1
fi

# Build and push the service
echo "🔨 Building $SERVICE_NAME..."
cd "services/$SERVICE_NAME"

# Full image name
FULL_IMAGE_NAME="$REGISTRY/$SERVICE_NAME:$IMAGE_TAG"

# Build the Docker image
echo "🐳 Building Docker image: $FULL_IMAGE_NAME"
docker build -t "$FULL_IMAGE_NAME" .

# Push the image
echo "📤 Pushing $FULL_IMAGE_NAME to registry..."
docker push "$FULL_IMAGE_NAME"

echo "✅ Successfully built and pushed $SERVICE_NAME"
echo ""
echo "To update the Kubernetes deployment, run:"
echo "kubectl rollout restart deployment/$SERVICE_NAME"
