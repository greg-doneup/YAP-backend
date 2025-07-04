#!/bin/bash
# deploy-all-services.sh - Deploy all YAP backend services to Kubernetes

set -euo pipefail

echo "🚀 Deploying all YAP backend services to Kubernetes"
echo "📅 $(date)"
echo ""

# Directory containing Kubernetes manifests
K8S_DIR="/Users/gregbrown/github/YAP/YAP-backend/infra/k8s"

# Check if kubectl is configured
if ! kubectl cluster-info &> /dev/null; then
    echo "❌ kubectl is not configured or cluster is not accessible"
    exit 1
fi

echo "✅ Connected to cluster: $(kubectl config current-context)"
echo ""

# Apply secrets first (order matters)
echo "🔑 Applying secrets..."
kubectl apply -f "$K8S_DIR/database-cache-secrets.yaml" || true
kubectl apply -f "$K8S_DIR/ai-services-secrets.yaml" || true
kubectl apply -f "$K8S_DIR/auth-secret.yaml" || true
kubectl apply -f "$K8S_DIR/profile-secret.yaml" || true
kubectl apply -f "$K8S_DIR/reward-secrets.yaml" || true
kubectl apply -f "$K8S_DIR/service-config-secrets.yaml" || true
kubectl apply -f "$K8S_DIR/mongodb-secrets.yaml" || true
kubectl apply -f "$K8S_DIR/security-secrets.yaml" || true

# Apply blockchain secrets (already applied but ensure it's there)
kubectl apply -f "$K8S_DIR/blockchain-progress-service.yaml" || true

echo ""
echo "📦 Deploying core services..."

# Core services (these don't depend on others)
CORE_SERVICES=(
    "auth-service.yaml"
    "profile.yaml"
    "offchain-profile.yaml"
    "mongodb-services.yaml"
    "redis-deployment.yaml"
    "observability-service.yaml"
)

for service in "${CORE_SERVICES[@]}"; do
    if [[ -f "$K8S_DIR/$service" ]]; then
        echo "   Deploying $service..."
        kubectl apply -f "$K8S_DIR/$service"
    else
        echo "   ⚠️  $service not found, skipping..."
    fi
done

echo ""
echo "🛠️  Deploying application services..."

# Application services
APP_SERVICES=(
    "learning-service.yaml"
    "gateway-service.yaml"
    "reward-service.yaml"
    "grammar-service.yaml"
    "assessment-service.yaml"
    "collaboration-service.yaml"
    "content-service.yaml"
    "notification-service.yaml"
    "profile-service.yaml"
    "social-service.yaml"
    "tts-service.yaml"
    "alignment-service.yaml"
    "voice-score.yaml"
    "pronunciation-scorer.yaml"
    "ai-chat-service.yaml"
    "wallet-service-deployment.yaml"
    "wallet-service-service.yaml"
)

for service in "${APP_SERVICES[@]}"; do
    if [[ -f "$K8S_DIR/$service" ]]; then
        echo "   Deploying $service..."
        kubectl apply -f "$K8S_DIR/$service"
    else
        echo "   ⚠️  $service not found, skipping..."
    fi
done

echo ""
echo "🔗 Deploying networking..."

# Networking
NETWORK_SERVICES=(
    "yap-alb-ingress.yaml"
    "yap-ingress.yaml"
)

for service in "${NETWORK_SERVICES[@]}"; do
    if [[ -f "$K8S_DIR/$service" ]]; then
        echo "   Deploying $service..."
        kubectl apply -f "$K8S_DIR/$service"
    else
        echo "   ⚠️  $service not found, skipping..."
    fi
done

echo ""
echo "📊 Checking deployment status..."

# Wait a moment for deployments to start
sleep 10

# Check deployment status
echo ""
echo "🔍 Deployment Status:"
kubectl get deployments -o wide

echo ""
echo "🔍 Service Status:"
kubectl get services -o wide

echo ""
echo "🔍 Pod Status:"
kubectl get pods -o wide

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Monitor pod startup: kubectl get pods -w"
echo "   2. Check logs: kubectl logs -f deployment/<service-name>"
echo "   3. Check ingress: kubectl get ingress"
echo "   4. Test endpoints when pods are ready"
