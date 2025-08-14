# Technical Implementation Plan: Fix OAuth invalid_grant Error

## Ticket: KAN-23

## Date: 2025-08-14

## Executive Summary

Fix the OAuth invalid_grant error that occurs when users navigate back to `/auth/callback` using the browser's back button. The issue happens because the authorization code has already been exchanged for tokens, and Cognito rejects duplicate exchange attempts. The solution involves implementing proper history management, URL cleanup, and authentication state checks to prevent invalid callback attempts.

## Library Research & Documentation

### Libraries Consulted

- Next.js v15.4.5: /vercel/next.js
  - Relevant sections reviewed: Route Handlers, Middleware, Redirect functions, History API
  - Key patterns to follow: Server-side redirects with history.replace, Route Handler authentication flows

### Context7 Documentation Referenced

- Next.js routing patterns for authentication callbacks
- Browser history manipulation with router.replace vs router.push
- Server-side redirect strategies to prevent back button issues
- OAuth callback handling best practices

## Acceptance Criteria

- [x] Users can safely use browser back button without encountering invalid_grant errors
- [x] Authorization codes are removed from URL after successful exchange
- [x] Already-authenticated users are immediately redirected from callback page
- [x] Duplicate code exchange attempts are prevented
- [x] Clean browser history without callback URLs containing authorization codes
- [x] Proper error handling for edge cases (expired codes, network failures)
- [x] No regression in normal authentication flow

## Technical Architecture

### System Components Affected

- Frontend: Auth callback page component, AuthService class
- Backend: N/A (no backend changes required)
- Database: N/A
- Infrastructure: N/A

## Implementation Tasks

### Frontend Tasks

#### Files to Modify

- `frontend/app/auth/callback/page.tsx`: Convert to server component with immediate redirect logic
- `frontend/lib/auth/auth-service.ts`: Add method to check for existing valid tokens
- `frontend/app/auth/callback/route.ts`: Create new Route Handler for server-side processing

#### Tasks

- [x] Create Route Handler for `/auth/callback` to handle OAuth code exchange server-side
- [x] Implement immediate redirect for already-authenticated users in Route Handler
- [x] Use `NextResponse.redirect` with proper status codes to prevent URL from appearing in history
- [x] Add code validation before attempting exchange to prevent duplicate attempts
- [x] Implement proper error handling with user-friendly messages
- [x] Clean up URL parameters after successful authentication
- [x] Add session state check to prevent redundant token exchanges
- [x] Implement fallback client-side redirect for edge cases
- [x] Add loading state management during authentication process
- [x] Ensure proper cleanup of authorization codes from browser history

### Backend Tasks

#### Files to Modify

- N/A - No backend changes required

#### Tasks

- N/A

### Database Tasks

#### Schema Changes

- N/A - No database changes required

#### Tasks

- N/A

### Infrastructure Tasks

#### Resources to Update

- N/A - No infrastructure changes required

#### Tasks

- N/A

## Testing Requirements

### Unit Tests

- [ ] `frontend/__tests__/app/auth/callback/route.test.ts`: Test Route Handler authentication logic
  - Test successful code exchange and redirect
  - Test handling of already-authenticated users
  - Test error handling for invalid codes
  - Test prevention of duplicate exchanges
- [ ] `frontend/__tests__/lib/auth/auth-service.test.ts`: Add tests for token validation
  - Test existing token validation logic
  - Test token expiry checks
  - Test refresh token flow

### Integration Tests

- [ ] Test complete OAuth flow with browser back button navigation
  - Login → Callback → Dashboard → Back button behavior
  - Verify no invalid_grant errors occur
  - Verify proper redirects for authenticated users
- [ ] Test callback page direct access scenarios
  - Direct access with valid code
  - Direct access with invalid/expired code
  - Direct access when already authenticated
- [ ] Test browser history manipulation
  - Verify callback URLs are not retained in history
  - Verify proper navigation flow after authentication

### End-to-End Tests

- [ ] Complete authentication flow testing
  - New user registration and callback
  - Existing user login and callback
  - Browser back/forward navigation after auth
- [ ] Error recovery testing
  - Network failure during code exchange
  - Expired authorization codes
  - Invalid state parameters
- [ ] Multi-tab authentication scenarios
  - Authentication in multiple tabs
  - Session consistency across tabs

## Success Metrics

- Zero invalid_grant errors: No occurrences in application logs
- Clean browser history: Callback URLs with codes not retained
- User experience: Seamless back button navigation without errors
- Performance: Authentication callback processing < 500ms
- Error rate: < 0.1% failed authentication attempts due to callback issues

## Risk Mitigation

- Browser compatibility issues: Test across Chrome, Firefox, Safari, Edge
  - Mitigation: Use standard Web APIs, provide fallback mechanisms
- Race conditions in token exchange: Multiple rapid callback attempts
  - Mitigation: Implement request deduplication and state management
- Session state inconsistency: Token storage conflicts
  - Mitigation: Use atomic operations for token management
- Network latency impacts: Slow token exchange causing timeouts
  - Mitigation: Implement proper timeout handling and retry logic
- Security considerations: Exposure of authorization codes
  - Mitigation: Immediate cleanup of sensitive data from URLs

## Dependencies

- External libraries:
  - next/navigation (v15.4.5) - For routing and redirects
  - jwt-decode (v4.0.0) - For token validation
- Internal dependencies:
  - AuthService class for token management
  - Cognito configuration for OAuth endpoints
- Team dependencies: None

## Rollout Strategy

1. **Development Phase**:
   - Implement Route Handler for server-side callback processing
   - Update client-side callback page to use new flow
   - Add comprehensive error handling

2. **Testing Phase**:
   - Deploy to development environment
   - Conduct thorough testing of all scenarios
   - Verify browser compatibility

3. **Staging Validation**:
   - Deploy to staging environment
   - User acceptance testing
   - Performance validation

4. **Production Deployment**:
   - Deploy during low-traffic period
   - Monitor error logs for invalid_grant occurrences
   - Be prepared for quick rollback if issues arise

5. **Post-Deployment**:
   - Monitor authentication metrics
   - Gather user feedback
   - Address any edge cases discovered

## Implementation Notes

- The solution leverages Next.js 15's Route Handlers for server-side processing
- History manipulation uses `router.replace()` to prevent back button issues
- Token validation happens before any exchange attempts to prevent duplicates
- Error messages are user-friendly while logging detailed errors for debugging
- The implementation maintains backward compatibility with existing auth flow
