#!/bin/bash

# Update secrets with production values
# Usage: ./update-secrets.sh

set -e

echo "🔧 YAP Backend Secrets Update Utility"
echo "This script helps you update secrets with production values"
echo ""

# Function to encode base64
encode_base64() {
    echo -n "$1" | base64 | tr -d '\n'
}

# Function to update secret
update_secret() {
    local secret_name="$1"
    local key="$2"
    local value="$3"
    
    echo "Updating $secret_name.$key..."
    kubectl patch secret "$secret_name" -p="{\"data\":{\"$key\":\"$(encode_base64 "$value")\"}}"
}

# AI Services Secrets Update
echo "🤖 AI Services Configuration"
echo "Current OpenAI API Key status:"
current_openai=$(kubectl get secret ai-services-secrets -o jsonpath="{.data.OPENAI_API_KEY}" | base64 -d)
if [[ "$current_openai" == *"placeholder"* ]]; then
    echo "❌ OpenAI API Key is still placeholder"
    read -p "Enter your OpenAI API Key (sk-...): " openai_key
    if [[ "$openai_key" =~ ^sk-.+ ]]; then
        update_secret "ai-services-secrets" "OPENAI_API_KEY" "$openai_key"
        echo "✅ OpenAI API Key updated"
    else
        echo "⚠️  Invalid OpenAI API Key format"
    fi
else
    echo "✅ OpenAI API Key is configured"
fi

# MongoDB Configuration
echo ""
echo "🗄️  Database Configuration"
current_mongo=$(kubectl get secret mongodb-secrets -o jsonpath="{.data.MONGO_URI}" | base64 -d 2>/dev/null || echo "not-found")
if [[ "$current_mongo" == *"localhost"* ]] || [[ "$current_mongo" == "not-found" ]]; then
    echo "❌ MongoDB URI needs production configuration"
    read -p "Enter your MongoDB Atlas URI (mongodb+srv://...): " mongo_uri
    if [[ "$mongo_uri" =~ ^mongodb.+ ]]; then
        update_secret "mongodb-secrets" "MONGO_URI" "$mongo_uri"
        echo "✅ MongoDB URI updated"
    else
        echo "⚠️  Invalid MongoDB URI format"
    fi
else
    echo "✅ MongoDB URI is configured"
fi

# Security Secrets
echo ""
echo "🔐 Security Configuration"
current_jwt=$(kubectl get secret security-secrets -o jsonpath="{.data.APP_JWT_SECRET}" | base64 -d)
if [[ "$current_jwt" == *"your-"* ]]; then
    echo "❌ JWT Secret is still placeholder"
    read -p "Enter a strong JWT secret (64+ characters): " jwt_secret
    if [[ ${#jwt_secret} -ge 32 ]]; then
        update_secret "security-secrets" "APP_JWT_SECRET" "$jwt_secret"
        update_secret "security-secrets" "JWT_SECRET" "$jwt_secret"
        echo "✅ JWT Secrets updated"
    else
        echo "⚠️  JWT secret should be at least 32 characters"
    fi
else
    echo "✅ JWT Secret is configured"
fi

# Optional: Azure Speech
echo ""
echo "🗣️  Speech Services (Optional)"
read -p "Do you have Azure Speech Service credentials? (y/n): " has_azure
if [[ "$has_azure" =~ ^[Yy] ]]; then
    read -p "Enter Azure Speech Key: " azure_key
    read -p "Enter Azure Speech Region (e.g., eastus): " azure_region
    update_secret "ai-services-secrets" "AZURE_SPEECH_KEY" "$azure_key"
    update_secret "ai-services-secrets" "AZURE_SPEECH_REGION" "$azure_region"
    echo "✅ Azure Speech configured"
fi

# Optional: AWS
read -p "Do you have AWS credentials for Polly? (y/n): " has_aws
if [[ "$has_aws" =~ ^[Yy] ]]; then
    read -p "Enter AWS Access Key ID: " aws_key
    read -p "Enter AWS Secret Access Key: " aws_secret
    read -p "Enter AWS Region (e.g., us-east-1): " aws_region
    update_secret "ai-services-secrets" "AWS_ACCESS_KEY_ID" "$aws_key"
    update_secret "ai-services-secrets" "AWS_SECRET_ACCESS_KEY" "$aws_secret" 
    update_secret "ai-services-secrets" "AWS_REGION" "$aws_region"
    echo "✅ AWS credentials configured"
fi

echo ""
echo "✅ Secrets update completed!"
echo ""
echo "Next steps:"
echo "1. Restart deployments to pick up new secrets:"
echo "   kubectl rollout restart deployment/ai-chat-service"
echo "2. Validate configuration:"
echo "   ./validate-secrets.sh"
echo "3. Test your services"
