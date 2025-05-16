# Pronunciation Assessment Pipeline

This document provides instructions for deploying the complete pronunciation assessment pipeline, consisting of multiple microservices that work together to provide detailed pronunciation feedback.

## Architecture

The pronunciation assessment pipeline consists of the following services:

1. **Alignment Service**: Uses WhisperX to align speech with text and extract phoneme timing
2. **Pronunciation Scorer Service**: Scores pronunciation quality at word and phoneme levels
3. **TTS Service**: Generates speech from text and produces phoneme pronunciation examples
4. **Voice Score Service**: Orchestrates the pipeline and provides a unified API

## Prerequisites

- Kubernetes cluster (1.19+)
- kubectl configured to access your cluster
- MongoDB deployment (or MongoDB Atlas account)
- Docker registry access

## Deployment

### 1. Create MongoDB Credentials Secret

```bash
kubectl create secret generic mongodb-secrets \
  --from-literal=MONGO_URI="mongodb+srv://username:password@cluster.mongodb.net/" \
  --from-literal=MONGO_DB_NAME="yap"
```

### 2. Deploy Services with MongoDB Storage

```bash
kubectl apply -f infra/k8s/mongodb-services.yaml
```

This will deploy all services configured to use MongoDB for storage.

### 3. Verify Deployment

```bash
kubectl get pods
```

You should see the following pods running:
- alignment-service-*
- pronunciation-scorer-*
- tts-service-*
- voice-score-*

### 4. Configure Resource Limits

All services have resource limits defined in the Kubernetes manifests. For GPU-enabled services, make sure your cluster has GPU nodes available:

```bash
# Check if GPU nodes are available
kubectl get nodes -L nvidia.com/gpu
```

## Testing the Pipeline

### 1. Port-forward the Voice Score Service

```bash
kubectl port-forward svc/voice-score 50054:50054
```

### 2. Run the Integration Tests

```bash
cd services/voice-score
./run_tests.sh
```

## Monitoring

### 1. Access Prometheus Metrics

Each service exposes metrics on its metrics port (default: 8000-8003). You can access them via port-forward:

```bash
kubectl port-forward svc/alignment-service 8000:8000
kubectl port-forward svc/pronunciation-scorer 8001:8001
kubectl port-forward svc/tts-service 8002:8002
kubectl port-forward svc/voice-score 8003:8003
```

Then access metrics at:
```
http://localhost:8000/metrics
http://localhost:8001/metrics
http://localhost:8002/metrics
http://localhost:8003/metrics
```

### 2. Check Service Logs

```bash
kubectl logs -f deployment/voice-score
kubectl logs -f deployment/alignment-service
kubectl logs -f deployment/pronunciation-scorer
kubectl logs -f deployment/tts-service
```

## Customization

### Environment Variables

Each service can be customized through environment variables in the Kubernetes manifests. Key variables include:

**Voice Score Service**:
- `PASS_THRESHOLD`: Score threshold for passing pronunciation test
- `DEFAULT_DETAIL_LEVEL`: Default detail level (word/phoneme/sentence)
- `USE_FALLBACK_SCORING`: Whether to use fallback scoring when services are unavailable

**Alignment Service**:
- `DEFAULT_MODEL`: Default WhisperX model to use
- `GPU_ENABLED`: Whether to use GPU for alignment

**Pronunciation Scorer Service**:
- `SCORING_MODEL`: Default pronunciation scoring model
- `MIN_CONFIDENCE`: Minimum confidence threshold for scoring

**TTS Service**:
- `TTS_PROVIDER`: TTS provider to use (mozilla/aws/google)
- `DEFAULT_VOICE`: Default voice to use

## Troubleshooting

### Service Dependencies

The services have dependencies on each other:
- Voice Score depends on Alignment and Pronunciation Scorer
- Pronunciation Scorer depends on Alignment results

If a service is failing, check its dependencies first.

### Common Issues

1. **Memory Issues**: The alignment service and pronunciation scorer may require substantial memory. Check resource usage with:
   ```bash
   kubectl top pods
   ```

2. **GPU Issues**: If GPU acceleration is not working, check if the GPU is properly exposed to the container:
   ```bash
   kubectl exec -it <alignment-pod-name> -- nvidia-smi
   ```

3. **MongoDB Connection**: If services can't connect to MongoDB, verify the connection string:
   ```bash
   kubectl describe secret mongodb-secrets
   ```

## Performance Tuning

For high-load environments, consider:

1. **Horizontal Scaling**: Increase replicas for CPU-bound services:
   ```bash
   kubectl scale deployment/voice-score --replicas=3
   kubectl scale deployment/tts-service --replicas=3
   ```

2. **Vertical Scaling**: Increase resources for memory/GPU-bound services:
   - Edit alignment-service.yaml and pronunciation-scorer.yaml
   - Increase CPU/memory limits
   - Apply changes with `kubectl apply -f`

3. **Caching**: All services have built-in caching. Adjust TTL with:
   - `CACHE_TTL_SECONDS` environment variable

## Security

All internal communication uses gRPC on a private network. For external access, use:
- API Gateway with authentication
- Network policies to restrict pod communication
- TLS encryption for external endpoints
