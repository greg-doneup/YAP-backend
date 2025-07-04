#!/bin/bash

echo "=== COMPARING SERVICES IN /services VS KUBERNETES DEPLOYMENTS ==="
echo ""

# Get list of services (excluding shared and .DS_Store)
SERVICES=($(ls -1 services/ | grep -v ".DS_Store" | grep -v "shared" | sort))

# Get list of kubernetes deployments that correspond to services
K8S_DEPLOYMENTS=()

# Check each service directory for corresponding k8s deployment
echo "Services with Kubernetes deployments:"
for service in "${SERVICES[@]}"; do
    # Check for exact match
    if [[ -f "infra/k8s/${service}.yaml" ]]; then
        echo "✓ $service -> infra/k8s/${service}.yaml"
        K8S_DEPLOYMENTS+=("$service")
    # Check for alternative naming patterns
    elif [[ -f "infra/k8s/${service}-service.yaml" ]]; then
        echo "✓ $service -> infra/k8s/${service}-service.yaml"
        K8S_DEPLOYMENTS+=("$service")
    elif [[ -f "infra/k8s/${service}-deployment.yaml" ]]; then
        echo "✓ $service -> infra/k8s/${service}-deployment.yaml"
        K8S_DEPLOYMENTS+=("$service")
    # Special cases
    elif [[ "$service" == "auth" && -f "infra/k8s/auth.yaml" ]]; then
        echo "✓ $service -> infra/k8s/auth.yaml"
        K8S_DEPLOYMENTS+=("$service")
    elif [[ "$service" == "wallet-service" && -f "infra/k8s/wallet-service-deployment.yaml" ]]; then
        echo "✓ $service -> infra/k8s/wallet-service-deployment.yaml"
        K8S_DEPLOYMENTS+=("$service")
    fi
done

echo ""
echo "Services WITHOUT Kubernetes deployments:"
for service in "${SERVICES[@]}"; do
    found=false
    for deployed in "${K8S_DEPLOYMENTS[@]}"; do
        if [[ "$service" == "$deployed" ]]; then
            found=true
            break
        fi
    done
    if [[ "$found" == false ]]; then
        echo "✗ $service (missing deployment)"
    fi
done

echo ""
echo "=== SUMMARY ==="
echo "Total services: ${#SERVICES[@]}"
echo "Services with deployments: ${#K8S_DEPLOYMENTS[@]}"
echo "Services missing deployments: $((${#SERVICES[@]} - ${#K8S_DEPLOYMENTS[@]}))"
