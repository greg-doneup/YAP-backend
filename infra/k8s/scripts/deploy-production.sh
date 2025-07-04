#!/bin/bash

# Deploy to production environment
# Usage: ./deploy-production.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
ENVIRONMENT="production"

echo "🚀 Deploying YAP Backend to PRODUCTION environment"
echo "⚠️  WARNING: This will deploy to production cluster!"
echo ""

# Confirmation prompt
read -p "Are you sure you want to deploy to PRODUCTION? (yes/no): " confirm
if [[ $confirm != "yes" ]]; then
    echo "❌ Deployment cancelled"
    exit 0
fi

# Check prerequisites
echo "🔍 Checking prerequisites..."

# Check kubectl
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed"
    exit 1
fi

# Check cluster connection
if ! kubectl cluster-info &> /dev/null; then
    echo "❌ Not connected to Kubernetes cluster"
    exit 1
fi

# Verify this is production cluster
cluster_name=$(kubectl config current-context)
if [[ "$cluster_name" != *"prod"* ]] && [[ "$cluster_name" != *"production"* ]]; then
    echo "⚠️  Current cluster: $cluster_name"
    read -p "This doesn't look like a production cluster. Continue? (yes/no): " cluster_confirm
    if [[ $cluster_confirm != "yes" ]]; then
        echo "❌ Deployment cancelled"
        exit 0
    fi
fi

# Deploy secrets first
echo "🔐 Deploying secrets..."
"$SCRIPT_DIR/deploy-secrets.sh" production

# Wait for secrets to be available
echo "⏳ Waiting for secrets to be ready..."
sleep 5

# Deploy services (add your service deployments here)
echo "🚀 Deploying services..."

# Example service deployments - uncomment and customize as needed
# kubectl apply -f "$K8S_DIR/ai-chat-service-deployment.yaml"
# kubectl apply -f "$K8S_DIR/voice-score-service-deployment.yaml"
# kubectl apply -f "$K8S_DIR/tts-service-deployment.yaml"
# kubectl apply -f "$K8S_DIR/learning-service-deployment.yaml"

echo "📋 Current deployment status:"
kubectl get pods -o wide

echo "🔍 Validating secrets configuration..."
"$SCRIPT_DIR/validate-secrets.sh"

echo ""
echo "✅ Production deployment completed!"
echo ""
echo "Next steps:"
echo "1. Monitor pod status: kubectl get pods -w"
echo "2. Check logs: kubectl logs -f deployment/<service-name>"
echo "3. Test endpoints: kubectl port-forward svc/<service-name> <local-port>:<service-port>"
echo "4. Set up monitoring and alerting"
echo ""
echo "🔗 Useful commands:"
echo "  kubectl get all                    # View all resources"
echo "  kubectl describe pod <pod-name>    # Debug pod issues"
echo "  kubectl logs <pod-name>           # View application logs"
