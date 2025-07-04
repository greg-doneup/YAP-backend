#!/bin/bash
# build-and-push-learning-ecr.sh - Build and push learning-service to AWS ECR

set -euo pipefail

# Configuration
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
IMAGE_TAG=${1:-latest}
SERVICE_DIR="learning-service"
REPO_NAME="yap-learning-service"

echo "🚀 Building and pushing learning-service to AWS ECR"
echo "📍 AWS Account: $AWS_ACCOUNT_ID"
echo "🌍 Region: $AWS_REGION"
echo "🏷️  Tag: $IMAGE_TAG"
echo ""

# Login to ECR
echo "🔐 Logging into ECR..."
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

echo "🔨 Building $SERVICE_DIR -> $REPO_NAME:$IMAGE_TAG"

if [[ ! -d "services/$SERVICE_DIR" ]]; then
    echo "❌ Directory services/$SERVICE_DIR not found!"
    exit 1
fi

cd "services/$SERVICE_DIR"

if [[ ! -f "Dockerfile" ]]; then
    echo "❌ No Dockerfile found in services/$SERVICE_DIR!"
    exit 1
fi

# Build the image
echo "🐳 Building Docker image..."
docker build -t "$REPO_NAME:$IMAGE_TAG" .

# Tag for ECR
echo "🏷️  Tagging image for ECR..."
docker tag "$REPO_NAME:$IMAGE_TAG" \
    "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG"

# Push to ECR
echo "📤 Pushing $REPO_NAME:$IMAGE_TAG to ECR..."
docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG"

echo ""
echo "✅ Successfully built and pushed learning-service!"
echo "🖼️  Image: $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG"
echo ""
echo "🔄 To update the deployment, run:"
echo "   kubectl rollout restart deployment/learning-service"
