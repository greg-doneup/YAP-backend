# Redis Configuration Guide for YAP Backend

## 📋 **Redis Setup Options**

### **Option 1: In-Cluster Redis (Currently Configured)**
**Pros**: Simple, cost-effective, fast internal communication
**Cons**: Single point of failure, manual backup management

**Configuration**: ✅ Already configured in `database-cache-secrets.yaml`
```yaml
REDIS_URL: redis://redis-service:6379
```

**Files**:
- `redis-deployment.yaml` - Redis deployment and service
- `deploy-redis-and-cache.sh` - Automated deployment script

**Deployment**:
```bash
./scripts/deploy-redis-and-cache.sh
```

---

### **Option 2: AWS ElastiCache Redis (Production Recommended)**
**Pros**: Managed service, automatic backups, high availability, scaling
**Cons**: Additional cost, network latency

**Setup Steps**:
1. Create ElastiCache Redis cluster in AWS Console
2. Update `database-cache-secrets.yaml` with ElastiCache endpoint
3. Configure VPC security groups

**Configuration Update**:
```bash
# Get your ElastiCache endpoint from AWS Console
# Format: your-cluster.cache.amazonaws.com:6379

# Encode the URL
echo -n "redis://your-elasticache-endpoint.cache.amazonaws.com:6379" | base64

# Update in database-cache-secrets.yaml:
REDIS_URL: <base64-encoded-elasticache-url>
```

---

### **Option 3: Redis Cloud (External Service)**
**Pros**: Fully managed, global availability, advanced features
**Cons**: Additional cost, external dependency

**Configuration Update**:
```bash
# Get connection details from Redis Cloud dashboard
# Format: redis://username:password@host:port

# Encode the URL with credentials
echo -n "redis://username:password@redis-12345.cloud.redislabs.com:12345" | base64

# Update in database-cache-secrets.yaml:
REDIS_URL: <base64-encoded-redis-cloud-url>
```

---

## 🔧 **Current Configuration Values**

The `database-cache-secrets.yaml` is configured with:

| Setting | Current Value | Description |
|---------|--------------|-------------|
| `REDIS_URL` | `redis://redis-service:6379` | In-cluster Redis service |
| `MONGO_DB_NAME` | `yap` | Main database name |
| `AI_CHAT_DB_NAME` | `yap-ai-chat` | AI chat service database |
| `LEARNING_DB_NAME` | `yap-learning` | Learning service database |
| `PROFILE_DB_NAME` | `yap-profile` | Profile service database |
| `CACHE_TTL` | `3600` | Cache time-to-live (1 hour) |
| `CACHE_MAX_SIZE` | `5000` | Max cache entries |
| `SESSION_TIMEOUT_MS` | `3600000` | Session timeout (1 hour) |
| `MAX_SESSIONS_PER_USER` | `10` | Max concurrent sessions |

---

## 🚀 **Deployment Order**

1. **Deploy Redis** (if using in-cluster):
   ```bash
   ./scripts/deploy-redis-and-cache.sh
   ```

2. **Deploy other secrets**:
   ```bash
   ./scripts/deploy-secrets.sh
   ```

3. **Deploy backend services**:
   ```bash
   ./scripts/deploy-production.sh
   ```

---

## 🔍 **Testing Redis Connection**

```bash
# Test Redis connectivity from within cluster
kubectl run redis-test --image=redis:alpine --rm -it --restart=Never -- redis-cli -h redis-service ping

# Expected output: PONG
```

---

## 📊 **Performance Considerations**

### **In-Cluster Redis**:
- **Memory**: 512MB limit (adjustable in redis-deployment.yaml)
- **CPU**: 500m limit 
- **Storage**: ephemeral (add PVC for persistence)

### **Production Scaling**:
- **ElastiCache**: Start with cache.t3.micro, scale as needed
- **Monitoring**: Set up CloudWatch alarms for memory/CPU
- **Backup**: Configure automatic snapshots

---

## 🛡️ **Security Notes**

- **In-cluster**: No authentication needed (internal network)
- **ElastiCache**: Configure VPC security groups
- **Redis Cloud**: Uses TLS and authentication by default
- **Network**: All Redis traffic stays within VPC/cluster

The current configuration is ready for deployment with in-cluster Redis!
