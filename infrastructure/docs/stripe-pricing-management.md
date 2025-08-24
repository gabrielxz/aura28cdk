# Stripe Pricing Management Guide

## Overview

This guide explains how to manage Stripe price IDs for the Aura28 application using AWS Systems Manager (SSM) Parameter Store. As of KAN-69, price IDs are dynamically fetched from SSM rather than being hardcoded in environment variables.

## Architecture

### Storage Location

Price IDs are stored in SSM Parameter Store at:

```
/aura28/{environment}/stripe/allowed-price-ids
```

### Format

- **Type**: String (not SecureString)
- **Value**: Comma-separated list of Stripe price IDs
- **Example**: `price_1234567890abcdef,price_0987654321fedcba,price_xyz123`

### Caching

- Lambda functions cache price IDs for 5 minutes (configurable via `PRICE_ID_CACHE_TTL_SECONDS`)
- Cache is maintained per Lambda container
- Reduces SSM API calls and improves performance

## Managing Price IDs

### Via AWS Console

1. Navigate to AWS Systems Manager → Parameter Store
2. Find the parameter `/aura28/{env}/stripe/allowed-price-ids`
3. Click "Edit"
4. Update the value with comma-separated price IDs
5. Click "Save changes"

### Via AWS CLI

```bash
# View current price IDs
aws ssm get-parameter \
  --name "/aura28/dev/stripe/allowed-price-ids" \
  --region us-east-1

# Update price IDs
aws ssm put-parameter \
  --name "/aura28/dev/stripe/allowed-price-ids" \
  --value "price_abc123,price_def456,price_ghi789" \
  --overwrite \
  --region us-east-1

# Update for production
aws ssm put-parameter \
  --name "/aura28/prod/stripe/allowed-price-ids" \
  --value "price_live_abc123,price_live_def456" \
  --overwrite \
  --region us-east-1
```

## Price ID Validation Rules

### When Validation Occurs

- Price ID validation happens when creating Stripe checkout sessions
- Both subscription and one-time payment modes validate price IDs
- Dynamic pricing (one-time payments without price ID) bypasses validation

### Validation Logic

1. If SSM parameter is empty or contains no valid IDs → No validation (all price IDs allowed)
2. If SSM parameter contains IDs → Only listed IDs are allowed
3. If SSM fetch fails → Falls back to `ALLOWED_PRICE_IDS` environment variable (deprecated)

### Empty/Malformed Handling

- Empty strings and whitespace are filtered out
- Leading/trailing spaces are trimmed
- Multiple consecutive commas are handled gracefully

## Cache Behavior

### Cache Duration

- Default: 300 seconds (5 minutes)
- Configurable via `PRICE_ID_CACHE_TTL_SECONDS` environment variable

### Cache Invalidation

- Cache expires after TTL
- New Lambda containers start with empty cache
- No manual cache clearing mechanism (container recycling handles this)

### Performance Impact

- First request to Lambda container: ~50ms SSM fetch latency
- Subsequent requests (cached): <1ms lookup time
- Cache is per-container, not shared across containers

## Deployment Process

### Initial Deployment

1. CDK creates SSM parameter with placeholder values
2. Update SSM parameter with actual price IDs post-deployment
3. Lambda functions automatically use new values (with cache delay)

### Updating Price IDs

1. Update SSM parameter value
2. Wait up to 5 minutes for cache expiration
3. New requests will use updated price IDs
4. No code deployment required

## Backward Compatibility

### Environment Variable Fallback

During transition period, the system supports fallback to `ALLOWED_PRICE_IDS` environment variable:

1. First attempt: Fetch from SSM Parameter Store
2. If SSM fails: Use `ALLOWED_PRICE_IDS` environment variable
3. If both unavailable: Allow all price IDs (no validation)

### Migration Path

1. **Phase 1**: Deploy code with SSM support + environment variable fallback
2. **Phase 2**: Populate SSM parameters with production price IDs
3. **Phase 3**: Clear environment variable values
4. **Phase 4**: Remove environment variable support in future release

## Troubleshooting

### Common Issues

#### Price ID Rejected Despite Being in SSM

- **Cause**: Cache hasn't expired yet
- **Solution**: Wait 5 minutes or trigger new Lambda container

#### SSM Parameter Not Found

- **Symptoms**: Logs show "Error fetching allowed price IDs from SSM"
- **Cause**: Parameter doesn't exist or Lambda lacks permissions
- **Solution**: Verify parameter exists and Lambda has `ssm:GetParameter` permission

#### Empty Price ID List

- **Symptoms**: All price IDs are allowed
- **Cause**: SSM parameter value is empty or malformed
- **Solution**: Update SSM parameter with valid comma-separated IDs

### Debug Logging

Lambda functions log the following for debugging:

- SSM fetch success/failure
- Number of price IDs loaded
- Cache expiry time
- Fallback to environment variable
- Invalid price ID attempts

### Monitoring

CloudWatch Logs contain:

```
INFO: Loaded allowed price IDs from SSM: { count: 3, cacheExpiryTime: '2024-01-01T12:05:00.000Z' }
WARN: Using price IDs from environment variable (deprecated)
WARN: Attempted to use disallowed price ID: { priceId: 'price_invalid', userId: 'user123' }
```

## Best Practices

### Price ID Management

1. Use descriptive Stripe price IDs (e.g., `price_monthly_premium_usd`)
2. Maintain separate price IDs for dev/staging/production
3. Document price ID purposes in team wiki
4. Test price ID changes in dev environment first

### Security

1. Price IDs are not sensitive (public in Stripe.js)
2. Use standard SSM parameters, not SecureString
3. Limit IAM permissions to only required Lambda functions
4. Audit price ID changes via CloudTrail

### Operations

1. Update price IDs during low-traffic periods
2. Monitor checkout session creation success rates after changes
3. Keep environment variable as emergency fallback during initial rollout
4. Document all price ID changes in change log

## Environment-Specific Configuration

### Development

```bash
Parameter: /aura28/dev/stripe/allowed-price-ids
Example: price_test_monthly,price_test_annual,price_test_onetime
```

### Staging

```bash
Parameter: /aura28/staging/stripe/allowed-price-ids
Example: price_test_monthly_v2,price_test_annual_v2
```

### Production

```bash
Parameter: /aura28/prod/stripe/allowed-price-ids
Example: price_live_monthly_29,price_live_annual_290,price_live_special
```

## Related Documentation

- [Stripe Webhook Setup](./stripe-webhook-setup.md)
- [AWS SSM Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
- [Stripe Price IDs](https://stripe.com/docs/api/prices)
