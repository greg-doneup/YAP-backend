#!/bin/bash

# Deploy to development environment
# Usage: ./deploy-development.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
ENVIRONMENT="development"

echo "🛠️  Deploying YAP Backend to DEVELOPMENT environment"

# Check prerequisites
echo "🔍 Checking prerequisites..."

if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed"
    exit 1
fi

if ! kubectl cluster-info &> /dev/null; then
    echo "❌ Not connected to Kubernetes cluster"
    exit 1
fi

cluster_name=$(kubectl config current-context)
echo "📍 Current cluster: $cluster_name"

# Deploy secrets
echo "🔐 Deploying development secrets..."
"$SCRIPT_DIR/deploy-secrets.sh" development

# Deploy development services
echo "🚀 Deploying development services..."

# Example development-specific configurations
echo "📝 Setting up development namespace..."
kubectl create namespace development --dry-run=client -o yaml | kubectl apply -f -

# Apply development configurations
# kubectl apply -f "$K8S_DIR/development/" # Uncomment when you have dev-specific configs

echo "📋 Development deployment status:"
kubectl get pods -o wide

echo "✅ Development deployment completed!"
echo ""
echo "🔗 Development commands:"
echo "  kubectl port-forward svc/ai-chat-service 3003:3003"
echo "  kubectl logs -f deployment/ai-chat-service"
