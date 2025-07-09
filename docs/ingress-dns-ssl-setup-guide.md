# YAP Ingress DNS and SSL Certificate Setup Guide

## Overview

This guide covers the setup of DNS records and SSL certificates for the YAP application's dual-domain ingress configuration.

## Domain Configuration

The YAP application uses two domains:
- **Production**: `app.goyap.ai`
- **Testing**: `delta-sandbox-7k3m.goyap.ai` (secure, non-guessable)

## DNS Configuration

### Required DNS Records

Add the following CNAME records to your DNS provider (where `goyap.ai` is hosted):

```
app.goyap.ai                   CNAME   k8s-yapmain-yapservi-xxxxxxxxx-xxxxxxxxx.us-east-1.elb.amazonaws.com
delta-sandbox-7k3m.goyap.ai    CNAME   k8s-yapmain-yapservi-xxxxxxxxx-xxxxxxxxx.us-east-1.elb.amazonaws.com
```

> **Note**: The ALB DNS name will be generated after applying the ingress configuration. Check your AWS Load Balancer console for the exact DNS name.

### DNS Setup Steps

1. **Get ALB DNS Name**:
   ```bash
   kubectl get ingress yap-services -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
   ```

2. **Create DNS Records**:
   - Log into your DNS provider (where `goyap.ai` is hosted)
   - Create CNAME records pointing both subdomains to the ALB DNS name
   - TTL: 300 seconds (5 minutes) for testing, 3600 seconds (1 hour) for production

## SSL Certificate Configuration

### AWS Certificate Manager (ACM) Setup

1. **Request Certificates**:
   ```bash
   # Request certificate for production domain
   aws acm request-certificate \
     --domain-name app.goyap.ai \
     --validation-method DNS \
     --region us-east-1

   # Request certificate for testing domain
   aws acm request-certificate \
     --domain-name delta-sandbox-7k3m.goyap.ai \
     --validation-method DNS \
     --region us-east-1
   ```

2. **Validate Certificates**:
   - AWS will provide DNS validation records
   - Add these CNAME records to your DNS provider
   - Wait for validation (usually 5-10 minutes)

3. **Get Certificate ARNs**:
   ```bash
   aws acm list-certificates --region us-east-1
   ```

### Update Ingress Configuration

Update the certificate ARN in `/infra/k8s/yap-ingress.yaml`:

```yaml
alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/PRODUCTION_CERT_ID,arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/TESTING_CERT_ID
```

## CORS Configuration

### Backend Services Update

If your backend services have CORS configurations, ensure they include both domains:

```javascript
// Example Node.js/Express CORS configuration
const allowedOrigins = [
  'https://app.goyap.ai',
  'https://delta-sandbox-7k3m.goyap.ai',
  'http://localhost:3000',  // for local development
  'http://localhost:5173'   // for Vite dev server
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
```

## Deployment Steps

### 1. Deploy Ingress Configuration

```bash
# Apply the updated ingress configuration
kubectl apply -f infra/k8s/yap-ingress.yaml

# Verify deployment
kubectl get ingress yap-services
kubectl describe ingress yap-services
```

### 2. Monitor ALB Creation

```bash
# Check ALB status
kubectl get ingress yap-services -w

# Get ALB DNS name
kubectl get ingress yap-services -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

### 3. Configure DNS Records

After getting the ALB DNS name, create the CNAME records as described above.

### 4. Test Configuration

```bash
# Test DNS resolution
nslookup app.goyap.ai
nslookup delta-sandbox-7k3m.goyap.ai

# Test HTTPS endpoints
curl -I https://app.goyap.ai/api/auth/health
curl -I https://delta-sandbox-7k3m.goyap.ai/api/auth/health
```

## Security Considerations

### Testing Domain Security

The testing subdomain `delta-sandbox-7k3m.goyap.ai` is designed to be:
- **Non-guessable**: Uses random characters to prevent unauthorized access
- **Secure**: Still uses HTTPS with valid SSL certificates
- **Isolated**: Can be easily changed without affecting production

### Production Domain

The production domain `app.goyap.ai` is:
- **User-friendly**: Easy to remember and type
- **Brandable**: Aligns with the YAP brand
- **Secure**: Uses HTTPS with proper SSL certificates

## Troubleshooting

### Common Issues

1. **ALB Not Created**:
   - Check ingress controller logs: `kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller`
   - Verify IAM permissions for ALB controller

2. **SSL Certificate Issues**:
   - Ensure certificates are in the same region as your EKS cluster
   - Verify certificate validation is complete
   - Check certificate ARNs in ingress annotations

3. **DNS Resolution Issues**:
   - Verify CNAME records are correctly configured
   - Check DNS propagation: `dig app.goyap.ai`
   - Ensure ALB DNS name is correct

4. **CORS Errors**:
   - Check backend service CORS configuration
   - Verify allowed origins include both domains
   - Test with browser developer tools

### Monitoring Commands

```bash
# Check ingress status
kubectl get ingress yap-services -o wide

# View ingress events
kubectl describe ingress yap-services

# Check ALB controller logs
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# Test endpoint health
curl -k https://app.goyap.ai/api/auth/health
```

## Environment Variables

Consider updating your application's environment variables to reflect the new domains:

```bash
# Production environment
FRONTEND_URL=https://app.goyap.ai
BACKEND_URL=https://app.goyap.ai
ALLOWED_ORIGINS=https://app.goyap.ai

# Testing environment
FRONTEND_URL=https://delta-sandbox-7k3m.goyap.ai
BACKEND_URL=https://delta-sandbox-7k3m.goyap.ai
ALLOWED_ORIGINS=https://delta-sandbox-7k3m.goyap.ai
```

## Next Steps

1. **Apply ingress configuration**: `kubectl apply -f infra/k8s/yap-ingress.yaml`
2. **Request SSL certificates** in AWS ACM
3. **Create DNS records** after ALB is provisioned
4. **Update certificate ARNs** in ingress configuration
5. **Test both domains** end-to-end
6. **Update application configurations** if needed

This setup provides a secure, scalable foundation for both production and testing environments while maintaining proper SSL security and DNS configuration.
