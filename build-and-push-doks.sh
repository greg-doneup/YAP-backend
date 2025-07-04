#!/bin/bash
# build-and-push-doks.sh - Build and push all YAP backend services to DigitalOcean Container Registry

set -euo pipefail

# Configuration
REGISTRY="registry.digitalocean.com/yap-cr"
IMAGE_TAG=${1:-latest}

echo "🚀 Building and pushing all YAP backend services to DigitalOcean Container Registry"
echo "📍 Registry: $REGISTRY"
echo "🏷️  Tag: $IMAGE_TAG"
echo ""

# Login to DigitalOcean Container Registry
echo "🔐 Logging into DigitalOcean Container Registry..."
doctl registry login

# Array of services with their directory names and image names
declare -a SERVICES=(
    "auth:auth"
    "profile:profile"
    "offchain-profile:offchain-profile"
    "gateway-service:gateway"
)

# Function to build and push a service
build_and_push_service() {
    local service_dir=$1
    local image_name=$2
    local full_image_name="$REGISTRY/$image_name:$IMAGE_TAG"
    
    echo "🔨 Building $service_dir service..."
    
    if [ ! -d "services/$service_dir" ]; then
        echo "❌ Directory services/$service_dir not found, skipping..."
        return 1
    fi
    
    cd "services/$service_dir"
    
    # Build the Docker image
    echo "🐳 Building Docker image: $full_image_name"
    docker build -t "$full_image_name" .
    
    # Push the image
    echo "📤 Pushing $full_image_name to registry..."
    docker push "$full_image_name"
    
    echo "✅ Successfully built and pushed $image_name"
    echo ""
    
    cd ../../
}

# Build shared libraries first
echo "🔧 Building shared libraries..."
npm run build:shared

# Build and push each service
for service in "${SERVICES[@]}"; do
    IFS=':' read -r service_dir image_name <<< "$service"
    build_and_push_service "$service_dir" "$image_name"
done

echo "🎉 All services have been built and pushed successfully!"
echo ""
echo "To update the Kubernetes deployments, run:"
echo "kubectl rollout restart deployment/auth-service"
echo "kubectl rollout restart deployment/profile-service" 
echo "kubectl rollout restart deployment/offchain-profile"
echo "kubectl rollout restart deployment/gateway-service"
