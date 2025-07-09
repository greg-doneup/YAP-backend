#!/bin/bash

# YAP Domain Migration Deployment Script
# This script helps deploy the new domain configuration

set -e

echo "=== YAP Domain Migration Deployment ==="
echo "This script will deploy the updated ingress configuration"
echo "with the new domain structure:"
echo "  - Production: app.goyap.ai"
echo "  - Testing: delta-sandbox-7k3m.goyap.ai"
echo ""

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "Error: kubectl is not installed or not in PATH"
    exit 1
fi

# Check if we're connected to the cluster
if ! kubectl cluster-info &> /dev/null; then
    echo "Error: Not connected to a Kubernetes cluster"
    exit 1
fi

echo "Current cluster context:"
kubectl config current-context
echo ""

read -p "Are you sure you want to proceed with the deployment? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

echo "Starting deployment..."

# Deploy the main ingress configuration
echo "1. Deploying main ingress configuration..."
kubectl apply -f infra/k8s/yap-ingress.yaml

# Deploy updated service configurations
echo "2. Deploying updated service configurations..."
kubectl apply -f infra/k8s/auth.yaml
kubectl apply -f infra/k8s/learning-service.yaml
kubectl apply -f infra/k8s/profile-config.yaml

# Wait for ingress to be ready
echo "3. Waiting for ingress to be ready..."
kubectl wait --for=condition=ready ingress/yap-services --timeout=300s

# Get the load balancer DNS name
echo "4. Getting load balancer DNS name..."
ALB_DNS=$(kubectl get ingress yap-services -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

if [ -z "$ALB_DNS" ]; then
    echo "Warning: ALB DNS name not yet available. This may take a few minutes."
    echo "You can check the status with:"
    echo "  kubectl get ingress yap-services"
else
    echo "ALB DNS Name: $ALB_DNS"
fi

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Next steps:"
echo "1. Request SSL certificates in AWS ACM for:"
echo "   - app.goyap.ai"
echo "   - delta-sandbox-7k3m.goyap.ai"
echo ""
echo "2. Update certificate ARNs in infra/k8s/yap-ingress.yaml"
echo ""
echo "3. Create DNS CNAME records:"
echo "   - app.goyap.ai -> $ALB_DNS"
echo "   - delta-sandbox-7k3m.goyap.ai -> $ALB_DNS"
echo ""
echo "4. Redeploy ingress with certificate ARNs:"
echo "   kubectl apply -f infra/k8s/yap-ingress.yaml"
echo ""
echo "5. Test the new domains:"
echo "   curl -I https://app.goyap.ai/api/auth/healthz"
echo "   curl -I https://delta-sandbox-7k3m.goyap.ai/api/auth/healthz"
echo ""
echo "For detailed instructions, see: docs/ingress-dns-ssl-setup-guide.md"
