#!/bin/bash
# build-and-push-frontend.sh - Build and push YAP frontend to ECR

set -euo pipefail

# Configuration
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO=yap-frontend
IMAGE_TAG=${1:-latest}
FRONTEND_DIR="/Users/gregbrown/github/YAP/YAP-frontend"

echo "🚀 Building and pushing YAP frontend to ECR"
echo "📍 AWS Account: $AWS_ACCOUNT_ID"
echo "🌍 Region: $AWS_REGION"
echo "📦 Repository: $ECR_REPO"
echo "🏷️  Tag: $IMAGE_TAG"
echo "📁 Frontend Dir: $FRONTEND_DIR"
echo ""

# Login to ECR
echo "🔐 Logging into ECR..."
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

# Create ECR repository if it doesn't exist
echo "📦 Ensuring ECR repository exists..."
aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$AWS_REGION" 2>/dev/null || \
  aws ecr create-repository --repository-name "$ECR_REPO" --region "$AWS_REGION"

# Change to frontend directory
cd "$FRONTEND_DIR"

# Copy additional files needed for Docker build
echo "📋 Preparing build context..."
cp package.json ./
cp package-lock.json ./
if [ -f ".npmrc" ]; then
  cp .npmrc ./
else
  echo "⚠️  No .npmrc found, creating default"
  echo "registry=https://registry.npmjs.org/" > .npmrc
fi

# Build the Docker image
echo "🏗️  Building Docker image..."
docker build -t "$ECR_REPO:$IMAGE_TAG" .

# Tag the image for ECR
echo "🏷️  Tagging image for ECR..."
docker tag "$ECR_REPO:$IMAGE_TAG" "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG"

# Push the image to ECR
echo "⬆️  Pushing image to ECR..."
docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG"

echo ""
echo "✅ Successfully pushed YAP frontend to ECR!"
echo "🖼️  Image: $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG"
echo ""
echo "📝 Next steps:"
echo "1. Update the deployment: kubectl set image deployment/yap-frontend yap-frontend=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG"
echo "2. Or restart the deployment: kubectl rollout restart deployment/yap-frontend"
echo ""
