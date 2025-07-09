# 🎯 EXACT DNS CONFIGURATION REQUIRED

## Current Status
✅ **ALB Deployed**: k8s-default-yapservi-13677a0ac9-1522850677.us-east-1.elb.amazonaws.com
✅ **SSL Certificates Requested**: Both certificates are pending DNS validation
✅ **Ingress Configured**: Both domains configured and ready

## 📋 REQUIRED DNS RECORDS

### 1. APPLICATION CNAME RECORDS (for your DNS provider)
Add these CNAME records to your DNS provider where `goyap.ai` is hosted:

```
Record Type: CNAME
Name: app
Value: k8s-default-yapservi-13677a0ac9-1522850677.us-east-1.elb.amazonaws.com
TTL: 300

Record Type: CNAME  
Name: delta-sandbox-7k3m
Value: k8s-default-yapservi-13677a0ac9-1522850677.us-east-1.elb.amazonaws.com
TTL: 300
```

### 2. SSL CERTIFICATE VALIDATION RECORDS (for your DNS provider)
Add these CNAME records to validate the SSL certificates:

**For app.goyap.ai certificate:**
```
Record Type: CNAME
Name: _f9be09b7266c85cfafaa3b548521198b.app
Value: _59b55fc8e907ffdad11a99c6aeb3d151.xlfgrmvvlj.acm-validations.aws.
TTL: 300
```

**For delta-sandbox-7k3m.goyap.ai certificate:**
```
Record Type: CNAME
Name: _4194de4eff479741c8f51704d717c6ad.delta-sandbox-7k3m
Value: _83d5172302ae52843dd6c79f22899615.xlfgrmvvlj.acm-validations.aws.
TTL: 300
```

## 🔧 CERTIFICATE INFORMATION

**Production Certificate ARN:**
```
arn:aws:acm:us-east-1:486276252245:certificate/c557d238-61c0-442b-a509-d970cfd2729b
```

**Testing Certificate ARN:**
```
arn:aws:acm:us-east-1:486276252245:certificate/58fccd1a-064a-4613-abb9-ed1dd9cf1488
```

## 📝 STEP-BY-STEP INSTRUCTIONS

### Step 1: Add DNS Records
1. Log into your DNS provider (where goyap.ai is hosted)
2. Add all 4 CNAME records listed above
3. Save the changes

### Step 2: Wait for Certificate Validation
After adding the DNS records, wait 5-10 minutes for AWS to validate the certificates:

```bash
# Check certificate status
aws acm describe-certificate --certificate-arn arn:aws:acm:us-east-1:486276252245:certificate/c557d238-61c0-442b-a509-d970cfd2729b --region us-east-1 | jq '.Certificate.Status'

aws acm describe-certificate --certificate-arn arn:aws:acm:us-east-1:486276252245:certificate/58fccd1a-064a-4613-abb9-ed1dd9cf1488 --region us-east-1 | jq '.Certificate.Status'
```

### Step 3: Update Ingress with SSL
Once certificates show "ISSUED" status, update the ingress configuration:

```bash
# This will be done automatically after certificate validation
```

## 🧪 TESTING

After DNS propagation (usually 2-15 minutes), test the setup:

```bash
# Test DNS resolution
nslookup app.goyap.ai
nslookup delta-sandbox-7k3m.goyap.ai

# Test HTTP endpoints (currently active)
curl -I http://app.goyap.ai/api/auth/healthz
curl -I http://delta-sandbox-7k3m.goyap.ai/api/auth/healthz

# Test HTTPS endpoints (after SSL is enabled)
curl -I https://app.goyap.ai/api/auth/healthz
curl -I https://delta-sandbox-7k3m.goyap.ai/api/auth/healthz
```

## 📋 SUMMARY OF WHAT YOU NEED TO DO

1. **Add 4 CNAME records** to your DNS provider (2 for applications, 2 for SSL validation)
2. **Wait 5-10 minutes** for SSL certificate validation
3. **I'll update the ingress** with SSL certificates once they're validated
4. **Test the endpoints** to ensure everything works

## 🚨 IMPORTANT NOTES

- **TTL 300**: Set TTL to 300 seconds (5 minutes) for faster propagation during testing
- **Validation Records**: The SSL validation records can be deleted after certificates are issued
- **Application Records**: The app and delta-sandbox-7k3m records should remain permanent
- **Testing Domain**: `delta-sandbox-7k3m.goyap.ai` is secure and non-guessable for testing

Let me know once you've added these DNS records and I'll monitor the certificate validation and complete the SSL setup!
