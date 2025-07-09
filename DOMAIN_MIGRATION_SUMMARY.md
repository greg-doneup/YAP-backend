# YAP Domain Migration Summary

## Overview

This document summarizes the changes made to migrate from `perci.goyap.ai` to a new dual-domain structure with enhanced security and production readiness.

## New Domain Structure

### Before
- Single domain: `perci.goyap.ai`

### After
- **Production**: `app.goyap.ai`
- **Testing**: `delta-sandbox-7k3m.goyap.ai` (secure, non-guessable)

## Files Modified

### 1. Ingress Configuration
- **File**: `infra/k8s/yap-ingress.yaml`
- **Changes**: 
  - Replaced `perci.goyap.ai` with dual-domain structure
  - Added certificate ARN placeholders
  - Enhanced annotations for SSL and load balancer configuration

### 2. Service CORS Configuration
- **Files**:
  - `services/auth/src/index.ts`
  - `services/profile/src/index.ts`
  - `services/profile/src/app.ts`
  - `services/learning-service/src/index.ts`
- **Changes**: Updated hardcoded CORS origins from `perci.goyap.ai` to `delta-sandbox-7k3m.goyap.ai`

### 3. Kubernetes Deployment Configurations
- **Files**:
  - `infra/k8s/auth.yaml`
  - `infra/k8s/learning-service.yaml`
  - `infra/k8s/profile-config.yaml`
  - `services/auth/auth-deployment.yaml`
- **Changes**: Updated `ALLOWED_ORIGINS` environment variables

### 4. Additional Ingress Files
- **Files**:
  - `infra/k8s/yap-frontend-ingress.yaml`
  - `infra/k8s/yap-alb-ingress.yaml`
- **Changes**: Updated domain references for consistency

### 5. Documentation
- **Files**:
  - `docs/dns-configuration-guide.md` (updated)
  - `docs/ingress-dns-ssl-setup-guide.md` (created)
- **Changes**: Updated DNS configuration instructions for new domain structure

### 6. Deployment Scripts
- **Files**:
  - `scripts/deploy-domain-migration.sh` (created)
- **Changes**: Created automated deployment script with guidance

## Security Improvements

### Testing Domain Security
- **Non-guessable**: `delta-sandbox-7k3m.goyap.ai` uses random characters
- **Isolated**: Can be changed without affecting production
- **Secure**: Uses HTTPS with valid SSL certificates

### Production Domain
- **User-friendly**: `app.goyap.ai` is memorable and brandable
- **Professional**: Aligns with YAP brand identity
- **Secure**: Proper SSL certificate configuration

## CORS Configuration Updates

All services now support both domains:
```
https://app.goyap.ai                    # Production
https://delta-sandbox-7k3m.goyap.ai     # Testing
https://goyap.ai                       # Legacy support
http://localhost:3000                  # Development
http://localhost:8100                  # Development
```

## Deployment Requirements

### 1. SSL Certificates
Request certificates in AWS ACM for:
- `app.goyap.ai`
- `delta-sandbox-7k3m.goyap.ai`

### 2. DNS Configuration
Create CNAME records:
- `app.goyap.ai` → ALB DNS name
- `delta-sandbox-7k3m.goyap.ai` → ALB DNS name

### 3. Certificate ARN Updates
Update `infra/k8s/yap-ingress.yaml` with actual certificate ARNs:
```yaml
alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-east-1:ACCOUNT:certificate/PROD_CERT,arn:aws:acm:us-east-1:ACCOUNT:certificate/TEST_CERT
```

## Testing Checklist

### Pre-deployment
- [ ] SSL certificates requested and validated
- [ ] DNS CNAME records created
- [ ] Certificate ARNs updated in ingress

### Post-deployment
- [ ] Ingress deployed successfully
- [ ] ALB created and healthy
- [ ] DNS resolution working for both domains
- [ ] HTTPS certificates valid
- [ ] API endpoints responding correctly
- [ ] Frontend loading properly
- [ ] CORS working for both domains

## Rollback Plan

If issues occur, rollback by:
1. Reverting ingress configuration to use `perci.goyap.ai`
2. Reverting CORS configurations in services
3. Redeploying with original configuration

## Commands for Deployment

```bash
# 1. Deploy the configuration
./scripts/deploy-domain-migration.sh

# 2. Check deployment status
kubectl get ingress yap-services
kubectl describe ingress yap-services

# 3. Get ALB DNS name
kubectl get ingress yap-services -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'

# 4. Test endpoints
curl -I https://app.goyap.ai/api/auth/healthz
curl -I https://delta-sandbox-7k3m.goyap.ai/api/auth/healthz
```

## Benefits of New Structure

1. **Security**: Non-guessable testing domain prevents unauthorized access
2. **Professionalism**: Clean production domain (`app.goyap.ai`)
3. **Separation**: Clear distinction between production and testing
4. **Scalability**: Easy to add more subdomains in the future
5. **Branding**: Consistent with YAP brand identity

## Next Steps

1. **Execute deployment**: Run the deployment script
2. **Configure SSL**: Request and validate certificates
3. **Update DNS**: Create CNAME records
4. **Test thoroughly**: Verify all functionality works
5. **Monitor**: Watch for any issues post-deployment
6. **Update documentation**: Keep internal docs current

This migration enhances security, professionalism, and maintainability of the YAP platform while providing a clear path for future scaling.
