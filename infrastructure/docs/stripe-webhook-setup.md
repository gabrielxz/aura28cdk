# Stripe Webhook Setup Guide

## Overview

This guide explains how to configure Stripe webhooks for the Aura28 application after deployment. The webhook handler processes successful payments and automatically generates readings for users.

## Prerequisites

- AWS CDK deployment completed
- Stripe account with API keys configured in SSM Parameter Store
- Access to Stripe Dashboard

## Setup Steps

### 1. Get Your Webhook Endpoint URL

After deploying the CDK stack, your webhook endpoint will be available at:

```
https://{api-gateway-id}.execute-api.{region}.amazonaws.com/{stage}/api/webhooks/stripe
```

You can find the exact URL in the CDK deployment output or in the AWS API Gateway console.

### 2. Configure Webhook in Stripe Dashboard

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Developers** → **Webhooks**
3. Click **Add endpoint**
4. Enter your webhook endpoint URL
5. Select the following events to listen for:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
6. Click **Add endpoint**

### 3. Copy the Webhook Signing Secret

1. After creating the webhook, click on the webhook endpoint in your Stripe Dashboard
2. Click **Reveal** under "Signing secret"
3. Copy the signing secret (it starts with `whsec_`)

### 4. Update SSM Parameter Store

Store the webhook signing secret in AWS Systems Manager Parameter Store:

```bash
aws ssm put-parameter \
  --name "/aura28/{env}/stripe/webhook-secret" \
  --value "whsec_your_actual_secret_here" \
  --type "SecureString" \
  --overwrite \
  --region us-east-1
```

Replace `{env}` with your environment (dev or prod).

### 5. Test the Webhook

#### Using Stripe CLI (Recommended for Development)

1. Install [Stripe CLI](https://stripe.com/docs/stripe-cli)
2. Login to Stripe CLI:
   ```bash
   stripe login
   ```
3. Forward events to your webhook endpoint:
   ```bash
   stripe listen --forward-to https://{api-gateway-id}.execute-api.{region}.amazonaws.com/{stage}/api/webhooks/stripe
   ```
4. Trigger a test event:
   ```bash
   stripe trigger checkout.session.completed
   ```

#### Manual Testing

1. In Stripe Dashboard, navigate to your webhook endpoint
2. Click **Send test webhook**
3. Select `checkout.session.completed` as the event type
4. Click **Send test webhook**

### 6. Monitor Webhook Performance

The webhook handler emits CloudWatch metrics for monitoring:

- **Aura28/Webhooks** namespace contains all webhook-related metrics
- Key metrics to monitor:
  - `WebhookProcessed` - Total webhooks processed
  - `WebhookSuccess` - Successful webhook processing
  - `WebhookError` - Failed webhook processing
  - `WebhookInvalidSignature` - Invalid signature attempts
  - `WebhookDuplicate` - Duplicate webhook events (idempotency)
  - `ReadingGenerationSuccess` - Successful reading generations
  - `ReadingGenerationFailure` - Failed reading generations
  - `WebhookProcessingTime` - Time to process webhooks
  - `ReadingGenerationTime` - Time to generate readings

## Configuration Notes

### Rate Limiting

The webhook endpoint is configured with the following rate limits:

- **Rate Limit**: 100 requests per second
- **Burst Limit**: 200 requests

### Timeout Configuration

- **Webhook Handler Timeout**: 30 seconds
- **Reading Generation Timeout**: 120 seconds

### Retry Logic

The webhook handler implements exponential backoff retry for reading generation:

- **Max Retries**: 3
- **Base Delay**: 1 second
- **Max Delay**: 10 seconds
- **Backoff**: Exponential with jitter

### Security Features

- **Signature Verification**: All webhooks are verified using Stripe's signature verification
- **Internal Invocation Secret**: Reading generation Lambda uses a shared secret to prevent unauthorized invocations
- **Idempotency**: Duplicate webhook events are automatically detected and skipped

## Troubleshooting

### Common Issues

1. **"Invalid signature" errors**
   - Verify the webhook secret in SSM matches the one in Stripe Dashboard
   - Ensure the raw request body is being passed correctly (no modifications)

2. **Reading not generated after payment**
   - Check CloudWatch logs for the webhook handler Lambda
   - Verify `userId` is present in `client_reference_id` or metadata
   - Ensure user profile exists in DynamoDB

3. **Timeout errors**
   - Monitor Lambda execution times in CloudWatch
   - Consider increasing timeout if reading generation is consistently slow

4. **Duplicate readings**
   - Check if idempotency checking is working (CloudWatch metric: `WebhookDuplicate`)
   - Verify DynamoDB table has proper permissions

### CloudWatch Logs

Check logs in the following log groups:

- `/aws/lambda/aura28-{env}-stripe-webhook-handler` - Webhook processing logs
- `/aws/lambda/aura28-{env}-generate-reading` - Reading generation logs

## Production Checklist

Before going to production:

- [ ] Configure production Stripe API keys in SSM
- [ ] Set up production webhook endpoint in Stripe
- [ ] Store production webhook secret in SSM
- [ ] Test end-to-end flow with real payment
- [ ] Set up CloudWatch alarms for critical metrics
- [ ] Configure dead letter queue for failed processing (future enhancement)
- [ ] Document rollback procedure
- [ ] Set up monitoring dashboard

## Support

For issues or questions:

1. Check CloudWatch logs for detailed error messages
2. Review CloudWatch metrics for performance issues
3. Verify all SSM parameters are correctly configured
4. Test webhook signature verification using Stripe CLI
