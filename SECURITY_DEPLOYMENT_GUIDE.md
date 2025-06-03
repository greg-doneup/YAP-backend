# YAP Backend Security Deployment Guide

## 🚀 Quick Deployment Steps

### 1. Install Dependencies

For each Python service:
```bash
cd services/wallet-service && pip install -r requirements.txt
cd services/alignment-service && pip install -r requirements.txt
cd services/pronunciation-scorer && pip install -r requirements.txt
cd services/voice-score && pip install -r requirements.txt
```

For each Node.js service:
```bash
cd services/auth && npm install
cd services/gateway && npm install
cd services/profile && npm install
cd services/learning && npm install
cd services/grammar && npm install
cd services/reward && npm install
cd services/tts-service && npm install
cd services/monitoring && npm install
cd services/analytics && npm install
cd services/notification && npm install
```

### 2. Environment Configuration

Create `.env.development` in each service directory:

```bash
# Common security environment variables
SECURITY_LOG_LEVEL=INFO
RATE_LIMIT_ENABLED=true
AUDIT_LOGGING_ENABLED=true
THREAT_DETECTION_ENABLED=true

# MongoDB configuration
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=yap

# Service-specific security settings
MAX_REQUESTS_PER_MINUTE=60
FAILED_ATTEMPT_THRESHOLD=5
SECURITY_TOKEN_EXPIRY=3600
```

### 3. Start Services with Security

```bash
# Start all services with security enabled
./start-local-dev.sh

# Or start individual services
cd services/wallet-service && python main.py
cd services/auth && npm run dev
cd services/gateway && npm run dev
```

### 4. Verify Security Features

```bash
# Check security status
curl http://localhost:8000/health
curl http://localhost:8001/health

# View security metrics
curl http://localhost:8000/security/metrics
curl http://localhost:8001/wallet/security/metrics

# Test rate limiting
for i in {1..100}; do curl http://localhost:8000/profile/test; done
```

### 5. Monitor Security Events

```bash
# View security logs
tail -f services/*/security_audit.log

# Monitor MongoDB security events
mongosh --eval "db.security_audit.find().sort({timestamp: -1}).limit(10)"
```

## 🔧 Configuration Options

### Rate Limiting Configuration
```javascript
// Customize rate limits per service
const rateLimits = {
  auth: { requests: 10, window: 60 },
  wallet: { requests: 5, window: 300 },
  ai_services: { requests: 30, window: 60 }
};
```

### Security Patterns Configuration
```python
# Customize threat detection patterns
SECURITY_PATTERNS = {
    'malicious_content': [
        r'(?:javascript|vbscript|onload|onerror)',
        r'<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>'
    ],
    'financial_fraud': [
        r'amount.*[0-9]{10,}',  # Suspiciously large amounts
        r'wallet.*0x[0-9a-fA-F]{40}'  # Ethereum addresses
    ]
}
```

## 📊 Security Testing

```bash
# Run security test suite
npm run test:security
python -m pytest tests/security/

# Load testing with security
ab -n 1000 -c 10 http://localhost:8000/profile/test

# Penetration testing
nmap -sS localhost
nikto -h http://localhost:8000
```

## 🛡️ Production Deployment

### Security Hardening
```bash
# Enable production security features
export NODE_ENV=production
export SECURITY_STRICT_MODE=true
export AUDIT_ALL_REQUESTS=true

# Configure SSL/TLS
export SSL_CERT_PATH=/path/to/ssl.crt
export SSL_KEY_PATH=/path/to/ssl.key
```

### Monitoring Setup
```bash
# Setup security monitoring
docker run -d --name security-monitor \
  -v /var/log/yap:/logs \
  security-monitor:latest

# Configure alerts
export SECURITY_ALERT_EMAIL=security@yap.com
export SECURITY_ALERT_WEBHOOK=https://hooks.slack.com/...
```

## 🚨 Incident Response

### Security Breach Detection
```bash
# Check for security breaches
grep "SECURITY_BREACH" services/*/security_audit.log

# Block suspicious IPs
iptables -A INPUT -s SUSPICIOUS_IP -j DROP

# Reset security tokens
redis-cli FLUSHDB
```

### Recovery Procedures
```bash
# Backup security logs
tar -czf security-logs-$(date +%Y%m%d).tar.gz services/*/security_audit.log

# Reset rate limiting
redis-cli DEL rate_limit:*

# Regenerate security keys
openssl rand -hex 32 > .security_key
```

---

**Security Deployment Complete! 🎉**

All YAP backend services now have enterprise-grade security protection with:
- ✅ Comprehensive rate limiting
- ✅ Advanced threat detection  
- ✅ Financial fraud prevention
- ✅ AI/ML manipulation detection
- ✅ Real-time monitoring
- ✅ Audit logging and compliance
