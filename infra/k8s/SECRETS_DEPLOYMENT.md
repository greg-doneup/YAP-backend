# YAP Backend Secrets Deployment Guide

This directory contains Kubernetes secrets and deployment scripts for the YAP backend services running on AWS EKS.

## 📁 Directory Structure

```
YAP-backend/infra/k8s/
├── ai-services-secrets.yaml          # AI provider API keys
├── security-secrets.yaml             # JWT and service secrets
├── service-config-secrets.yaml       # Service URLs and configuration
├── database-cache-secrets.yaml       # Redis and database config
├── mongodb-secrets.yaml              # MongoDB connection details
├── scripts/
│   ├── deploy-secrets.sh             # Deploy all secrets
│   ├── validate-secrets.sh           # Validate secret configuration
│   ├── deploy-production.sh          # Production deployment
│   ├── deploy-development.sh         # Development deployment
│   └── update-secrets.sh             # Interactive secret updates
└── templates/
    ├── .env.production.template       # Production environment template
    └── .env.development.template      # Development environment template
```

## 🚀 Quick Start

### 1. Initial Setup

```bash
# Make scripts executable
chmod +x YAP-backend/infra/k8s/scripts/*.sh

# Connect to your EKS cluster
aws eks update-kubeconfig --region us-east-1 --name your-cluster-name
```

### 2. Configure Secrets

```bash
# Interactive secret configuration
./YAP-backend/infra/k8s/scripts/update-secrets.sh
```

### 3. Deploy to Environment

```bash
# For development
./YAP-backend/infra/k8s/scripts/deploy-development.sh

# For production
./YAP-backend/infra/k8s/scripts/deploy-production.sh
```

### 4. Validate Configuration

```bash
# Check all secrets are properly configured
./YAP-backend/infra/k8s/scripts/validate-secrets.sh
```

## 🔐 Secrets Overview

### AI Services Secrets
- **OpenAI API Key**: Primary AI provider for GPT and speech services
- **Azure Speech Key**: Backup speech-to-text and text-to-speech
- **AWS Credentials**: Fallback for AWS Polly TTS
- **Google Cloud**: Additional speech service fallback

### Security Secrets
- **JWT Secrets**: User authentication tokens
- **Internal Service Secret**: Microservice communication  
- **Dynamic API Key**: Blockchain integration

### Database & Cache
- **MongoDB URI**: Primary database connection
- **Redis URL**: Cache and session storage

### Service Configuration
- **Service URLs**: Internal EKS service discovery
- **CORS Origins**: Frontend domain configuration

## 🛠️ Manual Secret Management

### Encoding Values
```bash
# Encode a secret for Kubernetes
echo -n "your-secret-value" | base64
```

### Updating Individual Secrets
```bash
# Update a specific secret
kubectl patch secret ai-services-secrets -p='{"data":{"OPENAI_API_KEY":"'$(echo -n "sk-new-key" | base64)'"}}'

# Restart services to pick up new secrets
kubectl rollout restart deployment/ai-chat-service
```

### Viewing Secret Values
```bash
# View encoded secret
kubectl get secret ai-services-secrets -o yaml

# Decode and view secret value
kubectl get secret ai-services-secrets -o jsonpath="{.data.OPENAI_API_KEY}" | base64 -d
```

## 🔧 Environment-Specific Configuration

### Development Environment
- Uses test/development API keys
- Relaxed rate limiting
- Debug logging enabled
- Local database connections

### Production Environment
- Production API keys required
- Strict security settings
- Info-level logging
- Production database connections

## 🚨 Security Best Practices

1. **Never commit real secrets** to version control
2. **Use different secrets** for each environment
3. **Rotate secrets regularly** - especially JWT secrets
4. **Limit secret access** using Kubernetes RBAC
5. **Monitor secret usage** and access patterns

## 🔍 Troubleshooting

### Common Issues

**Secrets not applying:**
```bash
# Check secret exists
kubectl get secret ai-services-secrets

# Check secret format
kubectl describe secret ai-services-secrets
```

**Services not starting:**
```bash
# Check pod logs
kubectl logs deployment/ai-chat-service

# Check environment variables
kubectl exec deployment/ai-chat-service -- env | grep -i api
```

**Invalid base64 encoding:**
```bash
# Re-encode secret
echo -n "your-value" | base64

# Verify decoding
echo "encoded-value" | base64 -d
```

### Validation Commands

```bash
# Test MongoDB connection
kubectl run mongo-test --image=mongo:6.0 --rm -it --restart=Never -- mongosh "$(kubectl get secret mongodb-secrets -o jsonpath='{.data.MONGO_URI}' | base64 -d)"

# Test Redis connection
kubectl run redis-test --image=redis:alpine --rm -it --restart=Never -- redis-cli -u "$(kubectl get secret database-cache-secrets -o jsonpath='{.data.REDIS_URL}' | base64 -d)" ping
```

## 📞 Support

For issues with secrets configuration:
1. Run the validation script: `./validate-secrets.sh`
2. Check the troubleshooting section above
3. Review Kubernetes events: `kubectl get events --sort-by=.metadata.creationTimestamp`
