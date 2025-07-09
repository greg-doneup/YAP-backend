# YAP DNS Configuration Guide

This guide outlines the steps needed to configure DNS for your YAP application on goyap.ai.

## Prerequisites

1. Domain registration for goyap.ai
2. Access to DNS management for your domain
3. AWS Application Load Balancer (ALB) DNS name from your Kubernetes cluster

## Getting Your Load Balancer DNS Name

After deploying your Kubernetes ingress, you can get the ALB DNS name with:

```bash
kubectl get ingress yap-services -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

## Current Domain Structure

The YAP application uses the following subdomains:
- **Production**: `app.goyap.ai`
- **Testing**: `delta-sandbox-7k3m.goyap.ai` (secure, non-guessable)

## Setting Up DNS Records

1. Log in to your domain registrar's DNS management console
2. Create the following CNAME records:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | app | [ALB_DNS_NAME] | 300 |
| CNAME | delta-sandbox-7k3m | [ALB_DNS_NAME] | 300 |

For example, if your ALB DNS name is `k8s-yapmain-yapservi-xxxxxxxxx-xxxxxxxxx.us-east-1.elb.amazonaws.com`:
- CNAME record for app.goyap.ai -> k8s-yapmain-yapservi-xxxxxxxxx-xxxxxxxxx.us-east-1.elb.amazonaws.com
- CNAME record for delta-sandbox-7k3m.goyap.ai -> k8s-yapmain-yapservi-xxxxxxxxx-xxxxxxxxx.us-east-1.elb.amazonaws.com

## Verifying DNS Configuration

After configuring the DNS records, you can verify they're working with:

```bash
dig app.goyap.ai
dig delta-sandbox-7k3m.goyap.ai
```

It may take up to 24-48 hours for DNS changes to fully propagate, but typically it's much faster (minutes to a few hours).

## Testing HTTPS Access

Once DNS propagation is complete, you can test HTTPS access to your application:

1. Open a web browser
2. Navigate to https://app.goyap.ai (production) or https://delta-sandbox-7k3m.goyap.ai (testing)
3. Verify that the connection is secure (no certificate warnings)
4. Verify that the YAP application loads correctly

## SSL Certificate Configuration

The ingress configuration requires SSL certificates for both domains. See the [Ingress DNS and SSL Setup Guide](./ingress-dns-ssl-setup-guide.md) for detailed instructions on:
- Requesting AWS ACM certificates
- Configuring certificate ARNs in the ingress
- Validating certificates

## Troubleshooting

If you encounter issues with the TLS certificate or HTTPS access:

1. Check the ingress status:
   ```bash
   kubectl get ingress yap-services
   kubectl describe ingress yap-services
   ```

2. Check ALB controller logs:
   ```bash
   kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
   ```

3. Verify SSL certificate status in AWS ACM:
   ```bash
   aws acm list-certificates --region us-east-1
   aws acm describe-certificate --certificate-arn [CERTIFICATE_ARN] --region us-east-1
   ```

4. Test DNS resolution:
   ```bash
   nslookup app.goyap.ai
   nslookup delta-sandbox-7k3m.goyap.ai
   ```

5. Check ALB target group health:
   ```bash
   aws elbv2 describe-target-health --target-group-arn [TARGET_GROUP_ARN]
   ```

For additional help, consult the AWS ALB Ingress Controller documentation or contact your DNS provider's support.

## Related Documentation

- [Ingress DNS and SSL Setup Guide](./ingress-dns-ssl-setup-guide.md) - Detailed SSL certificate and DNS configuration
- [YAP Backend Frontend Integration Guide](../YAP-BACKEND_FRONTEND_INTEGRATION_GUIDE.md) - Frontend integration instructions
