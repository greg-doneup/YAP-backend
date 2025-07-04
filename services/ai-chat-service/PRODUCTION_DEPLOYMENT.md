# Production Speech Services Deployment Guide

## Overview

This guide covers deploying the YAP AI Chat Service with production-ready speech processing capabilities, including real-time voice conversations, speech-to-text, text-to-speech, and streaming WebSocket connections.

## Architecture Components

### Core Services
- **AI Chat Service**: Main conversation processing with enhanced speech capabilities
- **Real-time Streaming**: WebSocket server for live voice conversations
- **Speech-to-Text**: Multi-provider STT with streaming support
- **Text-to-Speech**: Multi-provider TTS with voice customization
- **Difficulty Adaptation**: Real-time learning difficulty adjustment
- **Lesson Integration**: Structured learning path alignment

### External Dependencies
- **Speech Providers**: Google Cloud, AWS, Azure, or OpenAI
- **Database**: MongoDB for conversation storage
- **Cache**: Redis for session management (optional)
- **Message Queue**: For audio processing jobs (optional)

## Prerequisites

### System Requirements
- **CPU**: Minimum 4 cores, recommended 8+ cores for concurrent voice processing
- **RAM**: Minimum 8GB, recommended 16GB+ for audio processing
- **Storage**: SSD with at least 20GB free space
- **Network**: High-bandwidth connection for real-time audio streaming

### Software Dependencies
- Docker & Docker Compose
- Node.js 18+ (for development)
- FFmpeg (for audio processing)
- SSL certificates (for WebSocket connections)

## Step 1: Choose Speech Provider

### Google Cloud Speech (Recommended)
**Pros**: Best accuracy, extensive language support, streaming capabilities
**Cons**: Requires Google Cloud account

```bash
# Setup Google Cloud
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable APIs
gcloud services enable speech.googleapis.com
gcloud services enable texttospeech.googleapis.com

# Create service account
gcloud iam service-accounts create yap-speech-service
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:yap-speech-service@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/speech.client"

# Download credentials
gcloud iam service-accounts keys create credentials.json \
  --iam-account=yap-speech-service@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### AWS Polly + Transcribe
**Pros**: Good integration with AWS ecosystem
**Cons**: Limited streaming support for transcription

```bash
# Setup AWS CLI
aws configure
aws iam create-user --user-name yap-speech-user
aws iam attach-user-policy --user-name yap-speech-user \
  --policy-arn arn:aws:iam::aws:policy/AmazonPollyFullAccess
aws iam attach-user-policy --user-name yap-speech-user \
  --policy-arn arn:aws:iam::aws:policy/AmazonTranscribeFullAccess
```

### Azure Speech Services
**Pros**: Good neural voices, emotion support
**Cons**: Higher latency for some regions

```bash
# Create Speech resource
az cognitiveservices account create \
  --name YAPSpeechService \
  --resource-group YAPResourceGroup \
  --kind SpeechServices \
  --sku S0 \
  --location eastus
```

### OpenAI Whisper + TTS
**Pros**: High-quality Whisper model, simple setup
**Cons**: No streaming transcription, cost considerations

```bash
# Just need API key from OpenAI platform
export OPENAI_API_KEY=your_openai_api_key
```

## Step 2: Environment Configuration

Create production environment file:

```bash
cp .env.production .env
```

Configure your chosen provider:

```env
# Speech Provider Configuration
SPEECH_PROVIDER=google  # or aws, azure, openai

# Google Cloud (if using)
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_KEY_FILE=/app/credentials/service-account.json

# Production Settings
NODE_ENV=production
ENABLE_STREAMING=true
MAX_CONCURRENT_STREAMS=50
FRONTEND_URL=https://your-app-domain.com
```

## Step 3: Docker Deployment

### Single Container Deployment

```bash
# Build production image
docker build -f Dockerfile.production -t yap-ai-chat:production .

# Run with environment file
docker run -d \
  --name yap-ai-chat \
  --env-file .env.production \
  -p 3003:3003 \
  -v $(pwd)/credentials:/app/credentials:ro \
  yap-ai-chat:production
```

### Docker Compose Deployment

Create `docker-compose.production.yml`:

```yaml
version: '3.8'

services:
  ai-chat:
    build:
      context: .
      dockerfile: Dockerfile.production
    container_name: yap-ai-chat
    restart: unless-stopped
    env_file: .env.production
    ports:
      - "3003:3003"
    volumes:
      - ./credentials:/app/credentials:ro
      - audio_temp:/app/temp/audio
    depends_on:
      - mongodb
      - redis
    networks:
      - yap-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  mongodb:
    image: mongo:6.0
    container_name: yap-mongodb
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
    volumes:
      - mongodb_data:/data/db
    networks:
      - yap-network

  redis:
    image: redis:7-alpine
    container_name: yap-redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - yap-network

  nginx:
    image: nginx:alpine
    container_name: yap-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - ai-chat
    networks:
      - yap-network

volumes:
  mongodb_data:
  redis_data:
  audio_temp:

networks:
  yap-network:
    driver: bridge
```

### Deploy with Docker Compose

```bash
# Start all services
docker-compose -f docker-compose.production.yml up -d

# View logs
docker-compose -f docker-compose.production.yml logs -f ai-chat

# Scale the service
docker-compose -f docker-compose.production.yml up -d --scale ai-chat=3
```

## Step 4: Nginx Configuration

Create `nginx.conf` for load balancing and WebSocket support:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream ai_chat_backend {
        server ai-chat:3003;
        # Add more instances for scaling
        # server ai-chat-2:3003;
        # server ai-chat-3:3003;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=streaming:10m rate=5r/s;

    server {
        listen 80;
        server_name your-domain.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        ssl_certificate /etc/nginx/ssl/certificate.crt;
        ssl_certificate_key /etc/nginx/ssl/private.key;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        # API routes
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://ai_chat_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 60s;
            proxy_send_timeout 60s;
        }

        # WebSocket for real-time streaming
        location /socket.io/ {
            limit_req zone=streaming burst=10 nodelay;
            proxy_pass http://ai_chat_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 300s;
            proxy_send_timeout 300s;
        }

        # Health check
        location /health {
            proxy_pass http://ai_chat_backend;
            access_log off;
        }
    }
}
```

## Step 5: SSL Configuration

### Using Let's Encrypt (Recommended)

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Generate certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### Using Custom Certificate

```bash
# Place your certificates
mkdir ssl
cp your-certificate.crt ssl/certificate.crt
cp your-private-key.key ssl/private.key
chmod 600 ssl/private.key
```

## Step 6: Monitoring and Scaling

### Health Monitoring

```bash
# Basic health check
curl https://your-domain.com/health

# Detailed streaming health
curl https://your-domain.com/api/streaming/health

# WebSocket connection test
wscat -c wss://your-domain.com/socket.io/?EIO=4&transport=websocket
```

### Performance Monitoring

Add to `docker-compose.production.yml`:

```yaml
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
```

### Auto-scaling with Docker Swarm

```bash
# Initialize swarm
docker swarm init

# Create service
docker service create \
  --name yap-ai-chat \
  --replicas 3 \
  --env-file .env.production \
  --publish 3003:3003 \
  yap-ai-chat:production

# Scale service
docker service scale yap-ai-chat=5
```

## Step 7: Production Checklist

### Security
- [ ] SSL/TLS certificates configured
- [ ] API rate limiting enabled
- [ ] Authentication middleware active
- [ ] Service account permissions minimal
- [ ] Sensitive environment variables secured

### Performance
- [ ] Connection pooling configured
- [ ] Audio processing optimized
- [ ] Caching strategy implemented
- [ ] Load balancing setup
- [ ] Resource limits defined

### Monitoring
- [ ] Health checks configured
- [ ] Logging centralized
- [ ] Metrics collection setup
- [ ] Error tracking enabled
- [ ] Alerting configured

### Backup & Recovery
- [ ] Database backups automated
- [ ] Configuration backed up
- [ ] Disaster recovery plan
- [ ] Rollback procedures tested

## Step 8: Testing Production Deployment

### Automated Testing

```bash
# Install test dependencies
npm install --save-dev supertest socket.io-client

# Run integration tests
npm test

# Load testing
npm install -g artillery
artillery quick --count 10 --num 100 https://your-domain.com/api/chat/message
```

### Manual Testing

```bash
# Test speech endpoints
node test-advanced-features.js

# Test WebSocket streaming
node test-streaming.js

# Test different speech providers
SPEECH_PROVIDER=google node test-speech-providers.js
```

## Troubleshooting

### Common Issues

1. **WebSocket Connection Failed**
   - Check firewall settings
   - Verify SSL certificate
   - Test with wscat

2. **Speech Service Errors**
   - Verify API credentials
   - Check service quotas
   - Review audio format compatibility

3. **High Memory Usage**
   - Monitor audio processing jobs
   - Implement audio cleanup
   - Adjust concurrent stream limits

4. **Slow Response Times**
   - Check speech provider latency
   - Optimize audio processing
   - Review database queries

### Logs Analysis

```bash
# View service logs
docker-compose logs -f ai-chat

# Monitor specific errors
docker-compose logs ai-chat | grep ERROR

# Real-time log streaming
docker-compose logs -f --tail=100 ai-chat
```

## Scaling Considerations

### Horizontal Scaling
- Use session affinity for WebSocket connections
- Implement distributed session storage
- Consider message queue for audio processing

### Vertical Scaling
- Monitor CPU/memory usage during peak loads
- Optimize audio processing algorithms
- Cache frequently used TTS outputs

### Cost Optimization
- Monitor speech API usage and costs
- Implement audio caching strategies
- Use spot instances for development/testing

This deployment guide provides a comprehensive foundation for running the YAP AI Chat Service with production-ready speech capabilities in a scalable, secure environment.
