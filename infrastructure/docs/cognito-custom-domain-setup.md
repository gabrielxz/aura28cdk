# Cognito Custom Domain Setup Guide

## Overview

This guide explains how to configure a custom domain for AWS Cognito Hosted UI in the Aura28 application. Custom domains provide a branded authentication experience and are recommended for production environments.

## Prerequisites

- AWS account with Route53 hosted zone configured
- Domain name registered and DNS managed by Route53
- AWS CDK deployed infrastructure
- SSL certificate will be automatically created via AWS Certificate Manager (ACM)

## Configuration

### 1. Infrastructure Configuration

Custom domains are configured in the CDK stack by providing the `customDomain` option when creating the `CognitoAuthConstruct`:

```typescript
new CognitoAuthConstruct(this, 'CognitoAuth', {
  environment: 'prod',
  domainPrefix: 'aura28-prod',
  callbackUrls: ['https://aura28.com/auth/callback'],
  logoutUrls: ['https://aura28.com'],
  customDomain: {
    domainName: 'auth.aura28.com',
    hostedZone: route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: 'aura28.com',
    }),
  },
});
```

### 2. Environment-Specific Behavior

- **Development (`dev`)**: Custom domain configuration is ignored, uses default Cognito domain
- **Production (`prod`)**: Custom domain is applied when configured

### 3. Deployment Steps

1. **Update Stack Configuration**

   Modify your stack to include the custom domain configuration:

   ```typescript
   // In your stack file
   const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
     domainName: 'yourdomain.com',
   });

   const cognitoAuth = new CognitoAuthConstruct(this, 'CognitoAuth', {
     // ... other config
     customDomain: {
       domainName: 'auth.yourdomain.com',
       hostedZone: hostedZone,
     },
   });
   ```

2. **Deploy the Stack**

   ```bash
   cd infrastructure
   npx cdk deploy -c env=prod
   ```

3. **Certificate Validation**
   - ACM certificate is automatically created and validated via DNS
   - DNS validation records are automatically added to Route53
   - Certificate validation typically takes 5-30 minutes

4. **Domain Activation**
   - After certificate validation, Cognito custom domain becomes active
   - Process can take up to 60 minutes for full propagation

### 4. Frontend Configuration

Update your frontend environment variables to use the custom domain:

```bash
# .env.production
NEXT_PUBLIC_COGNITO_CUSTOM_DOMAIN=auth.yourdomain.com
```

The frontend application will automatically use the custom domain when available.

### 5. DNS Configuration

The CDK stack automatically creates:

- ACM certificate for the custom domain
- Route53 A record pointing to Cognito's CloudFront distribution
- DNS validation records for certificate

No manual DNS configuration is required when using Route53.

## Verification

### Check Custom Domain Status

1. **AWS Console**
   - Navigate to Cognito User Pools
   - Select your user pool
   - Go to "App integration" → "Domain name"
   - Verify custom domain status shows "ACTIVE"

2. **CloudFormation Outputs**
   - Check stack outputs for `CognitoCustomDomain` value
   - Verify `CognitoHostedUIURL` points to your custom domain

3. **Test Authentication Flow**
   - Navigate to `https://[your-custom-domain]/login`
   - Verify SSL certificate is valid
   - Complete authentication flow

## Troubleshooting

### Certificate Validation Issues

**Problem**: Certificate stuck in "PENDING_VALIDATION" status

**Solution**:

1. Verify Route53 hosted zone ID is correct
2. Check DNS validation records were created
3. Wait up to 30 minutes for validation
4. If still pending, check CloudFormation events for errors

### Domain Not Active

**Problem**: Custom domain shows "CREATING" status for extended period

**Solution**:

1. Certificate must be validated first
2. Domain activation can take up to 60 minutes
3. Check CloudWatch logs for errors
4. Verify domain name is not already in use by another Cognito User Pool

### Frontend Not Using Custom Domain

**Problem**: Application still redirects to default Cognito domain

**Solution**:

1. Verify `NEXT_PUBLIC_COGNITO_CUSTOM_DOMAIN` environment variable is set
2. Rebuild and redeploy frontend application
3. Clear browser cache and cookies
4. Check CloudFormation outputs for correct domain value

## Rollback Procedure

To remove custom domain and revert to default Cognito domain:

1. Remove `customDomain` configuration from stack
2. Redeploy: `npx cdk deploy -c env=prod`
3. Update frontend environment variables
4. Redeploy frontend application

## Security Considerations

- Custom domain certificate is automatically renewed by ACM
- All authentication traffic is encrypted with TLS 1.2+
- Domain ownership is verified through DNS validation
- Consider implementing AWS WAF for additional protection

## Monitoring

Monitor custom domain health via:

- CloudWatch metrics for Cognito User Pool
- ACM certificate expiration alerts
- Route53 health checks
- Application authentication success rates

## Additional Resources

- [AWS Cognito Custom Domains Documentation](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-add-custom-domain.html)
- [AWS Certificate Manager Guide](https://docs.aws.amazon.com/acm/latest/userguide/acm-overview.html)
- [Route53 Hosted Zones](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/hosted-zones-working-with.html)
