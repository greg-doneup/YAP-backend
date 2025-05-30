# YAP DNS Configuration Guide

This guide outlines the steps needed to configure DNS for your YAP application on goyap.ai.

## Prerequisites

1. Domain registration for goyap.ai
2. Access to DNS management for your domain
3. Load Balancer IP from your Kubernetes cluster

## Getting Your Load Balancer IP

After deploying your Kubernetes ingress, you can get the external IP address of the Load Balancer with:

```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

## Setting Up DNS Records

1. Log in to your domain registrar's DNS management console
2. Create the following A records:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | [LOAD_BALANCER_IP] | 300 |
| A | www | [LOAD_BALANCER_IP] | 300 |

For example, if your Load Balancer IP is `123.456.789.10`:
- A record for goyap.ai -> 123.456.789.10
- A record for www.goyap.ai -> 123.456.789.10

## Verifying DNS Configuration

After configuring the DNS records, you can verify they're working with:

```bash
dig goyap.ai
dig www.goyap.ai
```

It may take up to 24-48 hours for DNS changes to fully propagate, but typically it's much faster (minutes to a few hours).

## Testing HTTPS Access

Once DNS propagation is complete, you can test HTTPS access to your application:

1. Open a web browser
2. Navigate to https://goyap.ai
3. Verify that the connection is secure (no certificate warnings)
4. Verify that the YAP application loads correctly

## Troubleshooting

If you encounter issues with the TLS certificate or HTTPS access:

1. Check the certificate status:
   ```bash
   kubectl get certificate yap-tls-secret
   ```

2. Check cert-manager logs:
   ```bash
   kubectl logs -n cert-manager deployment/cert-manager
   ```

3. Check if the ingress is properly configured:
   ```bash
   kubectl describe ingress yap-services
   ```

4. Verify the ClusterIssuer status:
   ```bash
   kubectl describe clusterissuer letsencrypt-prod
   ```

For additional help, consult the cert-manager documentation or contact your DNS provider's support.
