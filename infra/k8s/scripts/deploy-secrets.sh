#!/bin/bash

# Deploy all secrets to Kubernetes cluster
# Usage: ./deploy-secrets.sh [environment]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
K8S_DIR="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${1:-development}"

echo "🔐 Deploying secrets to Kubernetes cluster..."
echo "Environment: $ENVIRONMENT"
echo "K8s directory: $K8S_DIR"

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed or not in PATH"
    exit 1
fi

# Check if connected to cluster
if ! kubectl cluster-info &> /dev/null; then
    echo "❌ Not connected to Kubernetes cluster"
    echo "Please ensure kubectl is configured and connected to your EKS cluster"
    exit 1
fi

# Apply secrets in order
echo "📝 Applying AI Services secrets..."
kubectl apply -f "$K8S_DIR/ai-services-secrets.yaml"

echo "📝 Applying Security secrets..."
kubectl apply -f "$K8S_DIR/security-secrets.yaml"

echo "📝 Applying Service Configuration secrets..."
kubectl apply -f "$K8S_DIR/service-config-secrets.yaml"

echo "📝 Applying Database & Cache secrets..."
kubectl apply -f "$K8S_DIR/database-cache-secrets.yaml"

echo "📝 Applying MongoDB secrets..."
kubectl apply -f "$K8S_DIR/mongodb-secrets.yaml"

# Verify secrets were created
echo "🔍 Verifying secrets were created..."
echo "Available secrets:"
kubectl get secrets | grep -E "(ai-services|security|service-config|database-cache|mongodb)"

echo "✅ All secrets deployed successfully!"
echo ""
echo "Next steps:"
echo "1. Update secret values with your actual production credentials"
echo "2. Deploy your application services"
echo "3. Run validation: ./validate-secrets.sh"
