#!/bin/bash
# build-and-push-ai-chat.sh - Build and push ai-chat-service to DigitalOcean Container Registry

set -euo pipefail

# Configuration
REGISTRY="registry.digitalocean.com/yap-cr"
IMAGE_TAG=${1:-latest}
SERVICE_DIR="ai-chat-service"
IMAGE_NAME="ai-chat-service"

echo "🚀 Building and pushing ai-chat-service to DigitalOcean Container Registry"
echo "📍 Registry: $REGISTRY"
echo "🏷️  Tag: $IMAGE_TAG"
echo ""

# Login to DigitalOcean Container Registry
echo "🔐 Logging into DigitalOcean Container Registry..."
doctl registry login

# Full image name
FULL_IMAGE_NAME="$REGISTRY/$IMAGE_NAME:$IMAGE_TAG"

echo "🔨 Building $SERVICE_DIR service..."

if [ ! -d "services/$SERVICE_DIR" ]; then
    echo "❌ Directory services/$SERVICE_DIR not found!"
    exit 1
fi

cd "services/$SERVICE_DIR"

# Build the Docker image
echo "🐳 Building Docker image: $FULL_IMAGE_NAME"
docker build -t "$FULL_IMAGE_NAME" .

# Push the image
echo "📤 Pushing $FULL_IMAGE_NAME to registry..."
docker push "$FULL_IMAGE_NAME"

echo "✅ Successfully built and pushed $IMAGE_NAME"
echo ""

cd ../../

echo "🎉 ai-chat-service has been built and pushed successfully!"
echo ""
echo "To update the Kubernetes deployment, run:"
echo "kubectl rollout restart deployment/ai-chat-service"
