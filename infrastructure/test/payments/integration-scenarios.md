# Stripe Checkout Integration Test Scenarios

## Overview

This document outlines comprehensive integration test scenarios for the Stripe Checkout implementation (KAN-65). These scenarios cover end-to-end testing from the frontend through the API Gateway to the Lambda function and Stripe API.

## Test Environment Setup

### Prerequisites

1. AWS environment with deployed CDK stack
2. Stripe test API keys configured in SSM Parameter Store
3. Cognito user pool with test users
4. Frontend application running locally or in staging

### Test Data

- Test User ID: `test-user-123`
- Test Price IDs: `price_test_subscription`, `price_test_onetime`
- Test Success URL: `https://staging.aura28.com/payment/success`
- Test Cancel URL: `https://staging.aura28.com/payment/cancel`

## Integration Test Scenarios

### 1. Complete Subscription Checkout Flow

**Scenario**: User successfully creates and completes a subscription checkout

**Steps**:

1. User logs into the application
2. User navigates to pricing/subscription page
3. User clicks "Subscribe" button
4. Frontend calls `createCheckoutSession` with subscription parameters
5. API Gateway validates JWT token
6. Lambda function creates Stripe checkout session
7. User is redirected to Stripe checkout page
8. User completes payment with test card
9. User is redirected to success URL
10. Webhook confirms payment (future implementation)

**Expected Results**:

- Checkout session created with correct parameters
- User successfully redirected to Stripe
- Payment processes successfully
- User redirected to success URL with session ID

**Test Verification**:

```javascript
// Frontend verification
const session = await userApi.createCheckoutSession(userId, {
  sessionType: 'subscription',
  priceId: 'price_test_subscription',
  successUrl: 'https://staging.aura28.com/payment/success?session_id={CHECKOUT_SESSION_ID}',
  cancelUrl: 'https://staging.aura28.com/payment/cancel',
});

expect(session.sessionId).toBeDefined();
expect(session.url).toContain('checkout.stripe.com');

// Backend verification (CloudWatch logs)
// Check for: "Successfully created checkout session"
// Verify session parameters match request
```

### 2. One-Time Payment Checkout Flow

**Scenario**: User successfully creates a one-time payment checkout

**Steps**:

1. User logs into the application
2. User navigates to one-time purchase page
3. User clicks "Buy Now" button
4. Frontend calls `createCheckoutSession` with one-time parameters
5. Lambda creates session with default price data
6. User completes checkout and payment

**Expected Results**:

- One-time payment session created
- Default price of $29.00 applied
- Payment mode (not subscription mode) used

### 3. Authentication Failure Scenarios

#### 3.1 Missing JWT Token

**Scenario**: User attempts checkout without authentication

**Steps**:

1. User accesses checkout without logging in
2. Frontend attempts to call API without token

**Expected Results**:

- Frontend throws "Not authenticated" error
- No API call made

#### 3.2 Expired JWT Token

**Scenario**: User's token expires during checkout

**Steps**:

1. User logs in and waits for token to expire
2. User attempts to create checkout session

**Expected Results**:

- API returns 401 Unauthorized
- Frontend prompts user to re-authenticate

### 4. Authorization Failure Scenarios

#### 4.1 Cross-User Access Attempt

**Scenario**: User attempts to create checkout for different user ID

**Steps**:

1. User A logs in
2. User A attempts to create checkout with User B's ID

**Expected Results**:

- Lambda returns 403 Forbidden
- CloudWatch logs security warning
- No Stripe session created

### 5. Validation Error Scenarios

#### 5.1 Invalid Session Type

**Test Request**:

```json
{
  "sessionType": "invalid-type",
  "successUrl": "https://example.com/success",
  "cancelUrl": "https://example.com/cancel"
}
```

**Expected**: 400 Bad Request - "Invalid or missing sessionType"

#### 5.2 Invalid URLs

**Test Request**:

```json
{
  "sessionType": "subscription",
  "priceId": "price_test123",
  "successUrl": "not-a-url",
  "cancelUrl": "/relative/path"
}
```

**Expected**: 400 Bad Request - "Invalid successUrl or cancelUrl"

#### 5.3 Missing Required Fields

**Test Request**:

```json
{
  "sessionType": "subscription"
}
```

**Expected**: 400 Bad Request - "Missing successUrl or cancelUrl"

#### 5.4 Disallowed Price ID

**Test Request**:

```json
{
  "sessionType": "subscription",
  "priceId": "price_not_in_allowlist",
  "successUrl": "https://example.com/success",
  "cancelUrl": "https://example.com/cancel"
}
```

**Expected**: 400 Bad Request - "Invalid price ID"

### 6. Stripe API Error Scenarios

#### 6.1 Invalid Stripe API Key

**Setup**: Configure invalid API key in SSM
**Expected**: 500 Internal Server Error (sanitized message)

#### 6.2 Stripe Service Outage

**Simulation**: Mock Stripe API timeout
**Expected**: 500 Internal Server Error with retry logic

#### 6.3 Invalid Price ID in Stripe

**Test**: Use non-existent price ID
**Expected**: Stripe error propagated appropriately

### 7. Performance and Load Testing

#### 7.1 Cold Start Performance

**Test**: Measure Lambda cold start time
**Target**: < 3 seconds for cold start
**Metric**: CloudWatch Duration metric

#### 7.2 Concurrent Session Creation

**Test**: Create 10 sessions simultaneously
**Expected**: All sessions created successfully
**Verification**: No rate limiting or throttling errors

#### 7.3 SSM Parameter Caching

**Test**: Multiple requests in succession
**Expected**: SSM parameter fetched only once (cached)
**Verification**: CloudWatch logs show single SSM call

### 8. Edge Cases

#### 8.1 Special Characters in Metadata

**Test Request**:

```json
{
  "sessionType": "subscription",
  "priceId": "price_test123",
  "successUrl": "https://example.com/success",
  "cancelUrl": "https://example.com/cancel",
  "metadata": {
    "special": "!@#$%^&*()",
    "unicode": "🚀 火箭"
  }
}
```

**Expected**: Metadata properly encoded and stored

#### 8.2 Maximum Request Size

**Test**: Send request with large metadata object
**Expected**: Request processed or appropriate error returned

#### 8.3 Network Interruption During Checkout

**Test**: Interrupt network after session creation
**Expected**: Session remains valid, user can retry

### 9. Security Testing

#### 9.1 SQL Injection Attempts

**Test**: Include SQL injection patterns in parameters
**Expected**: Input sanitized, no injection possible

#### 9.2 XSS Attempts

**Test**: Include script tags in metadata
**Expected**: Content properly escaped

#### 9.3 API Key Exposure

**Test**: Check all response bodies and logs
**Expected**: No Stripe API key visible anywhere

### 10. Monitoring and Alerting

#### 10.1 CloudWatch Metrics

**Verify**:

- Lambda invocation count
- Error rate < 1%
- Average duration < 1 second
- Concurrent executions

#### 10.2 CloudWatch Alarms

**Configure**:

- Error rate > 5% triggers alarm
- Duration > 5 seconds triggers alarm
- Throttling triggers alarm

#### 10.3 Log Analysis

**Check for**:

- Successful session creation logs
- Error patterns
- Security warnings
- Performance bottlenecks

## Automated Testing Strategy

### CI/CD Pipeline Tests

```yaml
# GitHub Actions workflow
- name: Run Unit Tests
  run: |
    npm test test/payments/create-checkout-session.test.ts
    npm test frontend/__tests__/lib/api/user-api.test.ts

- name: Deploy to Staging
  run: npx cdk deploy -c env=staging

- name: Run E2E Tests
  run: npm run test:e2e:stripe

- name: Performance Tests
  run: npm run test:performance:checkout
```

### Local Development Testing

```bash
# Run all payment-related tests
npm test -- --testPathPattern=payment
npm test -- --testPathPattern=checkout
npm test -- --testPathPattern=stripe

# Run with coverage
npm test -- --coverage --testPathPattern=checkout
```

## Test Data Management

### Stripe Test Cards

- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Insufficient Funds: `4000 0000 0000 9995`
- 3D Secure Required: `4000 0025 0000 3155`

### Test User Accounts

- Standard User: `test.user@example.com`
- Premium User: `premium.user@example.com`
- Admin User: `admin@example.com`

## Rollback Procedures

### If Tests Fail in Production

1. Revert Lambda function to previous version
2. Update API Gateway deployment
3. Clear SSM parameter cache
4. Notify team of rollback
5. Investigate root cause

## Future Test Scenarios

### Webhook Integration Tests (KAN-66)

- Payment confirmation webhook
- Subscription update webhook
- Payment failure webhook
- Retry logic for failed webhooks

### Subscription Management Tests (KAN-67)

- Cancel subscription
- Update payment method
- Change subscription plan
- Resume cancelled subscription

### Customer Portal Integration (KAN-68)

- Access customer portal
- Update billing information
- Download invoices
- View payment history

## Test Reporting

### Metrics to Track

- Test pass rate
- Code coverage percentage
- Average test execution time
- Number of bugs found in testing
- Time to resolution for test failures

### Test Report Template

```markdown
## Test Execution Report - [Date]

**Environment**: [Dev/Staging/Prod]
**Test Suite**: Stripe Checkout Integration
**Build**: [Build Number]

### Results Summary

- Total Tests: X
- Passed: X
- Failed: X
- Skipped: X
- Coverage: X%

### Failed Tests

[List of failed tests with reasons]

### Performance Metrics

- Avg Response Time: Xms
- P95 Response Time: Xms
- Error Rate: X%

### Action Items

[List of issues to address]
```

## Conclusion

This comprehensive test strategy ensures the Stripe Checkout integration is robust, secure, and performant. Regular execution of these test scenarios will maintain system reliability and catch issues before they reach production.
