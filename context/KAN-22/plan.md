# Technical Implementation Plan: Display Generic Error Message When Reading Generation Fails

## Ticket: KAN-22

## Date: 2025-08-13

## Executive Summary

Implement proper error handling in the Lambda function that generates readings to ensure users receive a friendly, generic error message when the OpenAI API fails, while maintaining detailed error logging for debugging purposes. This prevents exposure of technical implementation details and stack traces to end users, improving the overall user experience and security posture.

## Library Research & Documentation

### Libraries Consulted

- AWS Lambda Developer Guide: Error handling best practices
  - Relevant sections reviewed: Lambda error handling patterns, CloudWatch logging
  - Key patterns to follow: Separation of user-facing errors and internal logging

### Context7 Documentation Referenced

- Query: "aws lambda error handling best practices"
- Key findings: Lambda functions should return structured error responses with appropriate status codes while logging detailed errors to CloudWatch for debugging

## Acceptance Criteria

- [ ] When OpenAI API fails, Lambda returns generic error message: "We're sorry, but we couldn't generate your reading at this time. Please try again later."
- [ ] Full error details are logged to CloudWatch with appropriate log levels
- [ ] Frontend displays only the generic error message, not stack traces
- [ ] Database stores sanitized error indicator, not full error details
- [ ] Error response maintains consistent structure with successful responses

## Technical Architecture

### System Components Affected

- Frontend: Error display logic in readings-tab.tsx
- Backend: Lambda error handling in generate-reading.js
- Database: Error field sanitization in DynamoDB
- Infrastructure: No changes required

## Implementation Tasks

### Backend Tasks

#### Files to Modify

- `/home/gabriel/myProjects/aura28cdk/infrastructure/lambda/readings/generate-reading.js`: Implement proper error handling and response sanitization

#### Tasks

- [ ] Create a helper function to generate sanitized error responses
- [ ] Wrap OpenAI API call in proper try-catch with detailed CloudWatch logging
- [ ] Modify error response structure to return generic message in body
- [ ] Update DynamoDB error storage to use sanitized error indicator
- [ ] Ensure all error paths log full details to CloudWatch using console.error
- [ ] Maintain consistent response structure for both success and error cases
- [ ] Test error handling with various failure scenarios (network, auth, rate limit)

### Frontend Tasks

#### Files to Modify

- `/home/gabriel/myProjects/aura28cdk/frontend/app/dashboard/readings-tab.tsx`: Review and confirm proper error display

#### Tasks

- [ ] Verify error display logic shows only the error message from API response
- [ ] Ensure no stack traces or technical details are displayed
- [ ] Confirm error state UI provides clear user feedback
- [ ] Test error display with various error response formats

### Database Tasks

#### Schema Changes

- No schema changes required - error field already exists in reading records

#### Tasks

- [ ] Ensure error field stores only sanitized error type (e.g., "GENERATION_FAILED")
- [ ] Verify no sensitive information is persisted in DynamoDB

### Infrastructure Tasks

#### Resources to Update

- No infrastructure changes required

#### Tasks

- [ ] No infrastructure tasks needed

## Testing Requirements

### Unit Tests

- [ ] `/home/gabriel/myProjects/aura28cdk/infrastructure/test/readings.test.js`: Add test cases for error scenarios
  - Test OpenAI API failure returns generic message
  - Test CloudWatch logging contains full error details
  - Test DynamoDB stores sanitized error
  - Test various error types (network, auth, rate limit)

### Integration Tests

- [ ] Test end-to-end error flow from Lambda to frontend
- [ ] Verify CloudWatch logs capture detailed errors
- [ ] Confirm frontend displays only generic message
- [ ] Test error recovery on retry

### End-to-End Tests

- [ ] Simulate OpenAI API failure in development environment
- [ ] Verify user sees friendly error message
- [ ] Confirm no technical details exposed in browser console
- [ ] Test retry functionality after error

## Success Metrics

- Error Message Quality: User-friendly, non-technical error messages displayed
- Logging Completeness: 100% of errors logged with full details to CloudWatch
- Security: Zero technical implementation details exposed to frontend
- User Experience: Clear, actionable error messages that guide users

## Risk Mitigation

- Error Message Consistency: Ensure all error paths return the same generic message format
- Logging Overhead: Use appropriate log levels to avoid excessive CloudWatch costs
- Retry Logic: Consider implementing exponential backoff for OpenAI API retries in future
- Error Monitoring: Set up CloudWatch alarms for high error rates

## Dependencies

- External libraries: No new dependencies required
- Internal dependencies: Existing AWS SDK clients (DynamoDB, SSM, S3)
- Team dependencies: None - can be implemented independently

## Rollout Strategy

- Deploy to dev environment first for testing
- Verify error handling with simulated failures
- Monitor CloudWatch logs for proper error capture
- Deploy to production after successful dev testing
- Monitor error rates and user feedback post-deployment

## Implementation Details

### Error Response Structure

```javascript
// Generic error response for users
{
  statusCode: 500,
  headers: corsHeaders,
  body: JSON.stringify({
    message: "We're sorry, but we couldn't generate your reading at this time. Please try again later."
  })
}
```

### CloudWatch Logging Pattern

```javascript
console.error('Error generating reading:', {
  error: error instanceof Error ? error.message : 'Unknown error',
  stack: error instanceof Error ? error.stack : undefined,
  userId,
  readingId,
  timestamp: new Date().toISOString(),
});
```

### DynamoDB Error Storage

```javascript
{
  ...readingRecord,
  status: 'Failed',
  error: 'GENERATION_FAILED', // Sanitized error indicator
  updatedAt: new Date().toISOString()
}
```

## Post-Implementation Considerations

- Monitor error rates in CloudWatch metrics
- Set up alerts for unusual error patterns
- Consider implementing retry logic with exponential backoff
- Document error codes for support team reference
- Plan for graceful degradation strategies
