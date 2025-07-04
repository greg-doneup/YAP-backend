#!/bin/bash

# Validate that all required secrets are properly configured
# Usage: ./validate-secrets.sh

set -e

echo "🔍 Validating Kubernetes secrets configuration..."

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

# Required secrets
REQUIRED_SECRETS=(
    "ai-services-secrets"
    "security-secrets" 
    "service-config-secrets"
    "database-cache-secrets"
    "mongodb-secrets"
)

# Check each required secret exists
echo "📋 Checking required secrets..."
for secret in "${REQUIRED_SECRETS[@]}"; do
    if kubectl get secret "$secret" &> /dev/null; then
        echo "✅ $secret - exists"
    else
        echo "❌ $secret - missing"
        exit 1
    fi
done

# Check AI Services secrets
echo ""
echo "🤖 Validating AI Services secrets..."
AI_KEYS=(
    "OPENAI_API_KEY"
    "AZURE_SPEECH_KEY" 
    "AWS_ACCESS_KEY_ID"
    "AWS_SECRET_ACCESS_KEY"
)

for key in "${AI_KEYS[@]}"; do
    if kubectl get secret ai-services-secrets -o jsonpath="{.data.$key}" &> /dev/null; then
        value=$(kubectl get secret ai-services-secrets -o jsonpath="{.data.$key}" | base64 -d)
        if [[ "$value" == *"placeholder"* ]]; then
            echo "⚠️  $key - contains placeholder value (needs update)"
        else
            echo "✅ $key - configured"
        fi
    else
        echo "❌ $key - missing"
    fi
done

# Check Security secrets
echo ""
echo "🔐 Validating Security secrets..."
SECURITY_KEYS=(
    "APP_JWT_SECRET"
    "INTERNAL_SERVICE_SECRET"
    "PRIVATE_KEY_ENCRYPTION_SECRET"
)

for key in "${SECURITY_KEYS[@]}"; do
    if kubectl get secret security-secrets -o jsonpath="{.data.$key}" &> /dev/null; then
        value=$(kubectl get secret security-secrets -o jsonpath="{.data.$key}" | base64 -d)
        if [[ "$value" == *"placeholder"* ]] || [[ "$value" == *"your-"* ]]; then
            echo "⚠️  $key - contains placeholder value (needs update)"
        else
            echo "✅ $key - configured"
        fi
    else
        echo "❌ $key - missing"
    fi
done

# Check MongoDB connection
echo ""
echo "🗄️  Validating MongoDB secrets..."
if kubectl get secret mongodb-secrets -o jsonpath="{.data.MONGO_URI}" &> /dev/null; then
    mongo_uri=$(kubectl get secret mongodb-secrets -o jsonpath="{.data.MONGO_URI}" | base64 -d)
    if [[ "$mongo_uri" == *"localhost"* ]]; then
        echo "⚠️  MONGO_URI - using localhost (update for production)"
    else
        echo "✅ MONGO_URI - configured for production"
    fi
else
    echo "❌ MONGO_URI - missing"
fi

# Check Redis connection  
echo ""
echo "📦 Validating Redis configuration..."
if kubectl get secret database-cache-secrets -o jsonpath="{.data.REDIS_URL}" &> /dev/null; then
    redis_url=$(kubectl get secret database-cache-secrets -o jsonpath="{.data.REDIS_URL}" | base64 -d)
    if [[ "$redis_url" == *"localhost"* ]]; then
        echo "⚠️  REDIS_URL - using localhost (update for production)"
    else
        echo "✅ REDIS_URL - configured for production"
    fi
else
    echo "❌ REDIS_URL - missing"
fi

echo ""
echo "🎯 Validation Summary:"
echo "✅ All required secrets exist"
echo "⚠️  Some secrets may contain placeholder values - update with production credentials"
echo ""
echo "To update a secret:"
echo "1. Edit the YAML file with real values"
echo "2. Re-apply: kubectl apply -f <secret-file>.yaml"
echo "3. Restart affected pods: kubectl rollout restart deployment/<service-name>"
