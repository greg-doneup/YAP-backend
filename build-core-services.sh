#!/bin/bash
# build-core-services.sh - Build and push core YAP backend services to ECR

set -euo pipefail

# Configuration
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
IMAGE_TAG=${1:-latest}

echo "🚀 Building and pushing core YAP backend services to ECR"
echo "📍 AWS Account: $AWS_ACCOUNT_ID"
echo "🌍 Region: $AWS_REGION"
echo "🏷️  Tag: $IMAGE_TAG"
echo ""

# Login to ECR
echo "🔐 Logging into ECR..."
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

# Core services that we know exist and have Dockerfiles
declare -a SERVICES=(
    "auth:yap-auth-service"
    "offchain-profile:yap-offchain-profile"
    "learning-service:yap-learning-service"
    "gateway-service:yap-gateway-service"
    "reward-service:yap-reward-service"
    "observability-service:yap-observability-service"
    "grammar-service:yap-grammar-service"
    "voice-score:yap-voice-score"
    "blockchain-progress-service:yap-blockchain-progress"
)

# Build and push each service
for service_info in "${SERVICES[@]}"; do
    IFS=':' read -r service_dir repo_name <<< "$service_info"
    
    echo ""
    echo "🔨 Building $service_dir -> $repo_name:$IMAGE_TAG"
    
    if [[ -d "./services/$service_dir" ]]; then
        cd "./services/$service_dir"
        
        # Check if Dockerfile exists
        if [[ -f "Dockerfile" ]]; then
            # Build the image
            echo "   📦 Building Docker image..."
            docker build -t "$repo_name:$IMAGE_TAG" .
            
            # Tag for ECR
            echo "   🏷️  Tagging for ECR..."
            docker tag "$repo_name:$IMAGE_TAG" \
                "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$repo_name:$IMAGE_TAG"
            
            # Push to ECR
            echo "   📤 Pushing to ECR..."
            docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$repo_name:$IMAGE_TAG"
            
            echo "   ✅ Successfully pushed $repo_name:$IMAGE_TAG"
        else
            echo "   ⚠️  No Dockerfile found, skipping..."
        fi
        
        cd ../..
    else
        echo "   ⚠️  Directory ./services/$service_dir not found, skipping..."
    fi
done

echo ""
echo "🎉 Core services have been built and pushed to ECR!"
echo ""
echo "📋 Next steps:"
echo "   1. Apply Kubernetes manifests to EKS cluster"
echo "   2. Verify deployments are running"
