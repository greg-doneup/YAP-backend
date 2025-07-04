#!/bin/bash

# Deploy Redis and Database/Cache secrets for YAP Backend
# Usage: ./deploy-redis-and-cache.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
K8S_DIR="$(dirname "$SCRIPT_DIR")"

echo "🚀 Deploying Redis and Cache configuration..."

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed or not in PATH"
    exit 1
fi

# Check if connected to cluster
if ! kubectl cluster-info &> /dev/null; then
    echo "❌ Not connected to Kubernetes cluster"
    exit 1
fi

echo "📦 Deploying Redis to cluster..."
kubectl apply -f "$K8S_DIR/redis-deployment.yaml"

echo "⏳ Waiting for Redis to be ready..."
kubectl wait --for=condition=ready pod -l app=redis --timeout=300s

echo "🔐 Deploying database and cache secrets..."
kubectl apply -f "$K8S_DIR/database-cache-secrets.yaml"

echo "🔍 Verifying Redis deployment..."
kubectl get pods -l app=redis
kubectl get svc redis-service

echo "✅ Redis and cache configuration deployed successfully!"
echo ""
echo "🔗 Redis connection details:"
echo "  Internal URL: redis://redis-service:6379"
echo "  Service: redis-service.default.svc.cluster.local:6379"
echo ""
echo "💡 To test Redis connection:"
echo "  kubectl run redis-test --image=redis:alpine --rm -it --restart=Never -- redis-cli -h redis-service ping"
