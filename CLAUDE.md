# CLAUDE.md - Aura28 Project Philosophy and Technical Manifest

## Project Overview

Aura28 is a modern web platform built with Next.js, TypeScript, Tailwind CSS, and deployed using AWS CDK. The project follows infrastructure-as-code principles and emphasizes code quality, testing, and automated deployment.

## Core Development Principles

### 1. Infrastructure as Code (IaC)

- **Technology**: AWS CDK in TypeScript
- **Default Region**: us-east-1
- **Environment Management**: Uses CDK context variables (`-c env=dev` or `-c env=prod`)
- **Stack Naming**: Follows pattern `Aura28-{env}-Stack`

### 2. Frontend Architecture

- **Framework**: Next.js 14+ with App Router
- **Language**: TypeScript with strict type checking
- **Styling**: Tailwind CSS with shadcn/ui components
- **Static Export**: Configured for static site generation

### 3. Code Quality Standards

- **Formatting**: Prettier handles ALL code formatting
  - Configuration in `.prettierrc.json`
  - Includes CSS files in addition to TS/JS/JSON/MD
  - Run `npm run format` at root level
- **Linting**: ESLint configured for TypeScript monorepo
  - Extends `prettier` to avoid conflicts
  - Frontend disables `@next/next/no-html-link-for-pages` rule
  - Infrastructure ignores `.d.ts` files and allows underscore-prefixed unused vars
  - Run `npm run lint` at root level

### 4. Testing Requirements

- **Framework**: Jest for both frontend and infrastructure
- **Coverage**: All new features must include tests
- **CI/CD**: Tests run automatically before deployment
- **Commands**:
  - `npm run test:frontend`
  - `npm run test:infrastructure`
- **Infrastructure Test Setup**: Tests create temporary `frontend/out` directory to avoid build dependency
- **Frontend Jest Config**: Uses type assertion for Next.js compatibility (`as any`)

### 5. AWS Resource Management

- **Tagging**: All resources tagged with `Project: Aura28CDK`
  - Applied at stack level: `cdk.Tags.of(this).add('Project', 'Aura28CDK')`
- **S3 Bucket Policies**:
  - Production: `removalPolicy: RETAIN`
  - Development: `removalPolicy: DESTROY`
  - Lifecycle rule: Abort incomplete multipart uploads after 7 days

### 6. Deployment Strategy

- **Branches**:
  - `develop` → dev.aura28.com
  - `main` → aura28.com
- **CI/CD**: GitHub Actions with separate jobs for linting, testing, and deployment
- **SSL/TLS**: Certificates managed via ACM in us-east-1

## Route Manifest

### Current Routes

- `/` - Homepage (Hello Carri landing page)
- `/login` - Redirects to Cognito Hosted UI
- `/logout` - Logs out user and redirects to home
- `/auth/callback` - OAuth callback handler
- `/dashboard` - User dashboard (protected route)
- `/account-settings` - Account settings page (protected route)

### Planned Routes

- `/api/*` - API endpoints (when server components are added)

## Initial AWS Setup

Before deploying this project, ensure the following prerequisites:

1. **AWS CDK Bootstrap**: Run `cdk bootstrap aws://{account-id}/us-east-1`
2. **Route 53 Hosted Zone**: Must exist for your domain (aura28.com)
3. **GitHub Secrets**: Configure in your repository settings:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION` (us-east-1)

## Project Structure

```
aura28cdk/
├── frontend/                # Next.js application
│   ├── app/                # App Router pages
│   ├── components/         # React components
│   └── __tests__/         # Frontend tests
├── infrastructure/         # AWS CDK code
│   ├── bin/               # CDK app entry point
│   ├── lib/               # Stack definitions
│   └── test/              # Infrastructure tests
└── .github/workflows/     # CI/CD pipelines
```

## Development Workflow

### Local Development

1. Install dependencies: `npm install` (at root)
2. Run frontend: `cd frontend && npm run dev`
3. Run tests: `npm test` (at root)
4. Format code: `npm run format` (at root)
5. Lint code: `npm run lint` (at root)

<<<<<<< Updated upstream

### Pre-Commit Checklist

**IMPORTANT**: Before committing or pushing any changes, you MUST complete ALL of the following steps in this specific order.

1. **Run linting**: `npm run lint` (at root level)
   - Catches potential code quality issues before spending time on other checks.

2. **Run tests**: `npm test` (at root level)
   - Verifies all tests pass and prevents breaking existing functionality.
   - **Important**: Also run `npm run test:frontend` and `npm run test:infrastructure` separately to ensure test output is clearly visible.

3. **Build check**: `npm run build` (at root level)
   - Ensures the project builds successfully and catches TypeScript compilation errors.
   - **This step must be run BEFORE formatting**, as it generates declaration files (`.d.ts`) that also need to be formatted.

4. **Run formatting**: `npm run format` (at root level)
   - This ensures all source code AND build artifacts (like `.d.ts` files) follow consistent formatting rules.
   - Run this _after_ the build to prevent CI/CD failures due to formatting.

5. **Verify no untracked files**: `git status`
   - Ensure all necessary files, including newly formatted build artifacts, are staged for commit.

6. **Review changes**: `git diff --staged`
   - Double-check that your changes are intentional and that formatting changes to generated files look correct.

**Note**: The order of these steps is critical. Running `build` before `format` prevents CI pipeline failures related to the formatting of generated files.

### Important Lessons Learned

1. **Format Check Differences**: The `npm run format:check` command in CI/CD may behave differently than `npm run format` at the root level. Always run both:
   - `npm run format` - to fix formatting issues
   - `npm run format:check` - to verify formatting matches CI/CD expectations
   - Run these from the same directory that CI/CD uses (e.g., `cd frontend && npm run format:check`)

2. **Test Output Visibility**: When running `npm test` at root level, important failures can be buried in verbose output from multiple test suites. Always run focused test commands:
   - `npm run test:frontend` - for clear frontend test output
   - `npm run test:infrastructure` - for infrastructure tests
   - This ensures you catch all test failures before pushing

3. **Test Isolation**: Frontend tests must properly isolate localStorage and other browser APIs:
   - Clear localStorage in `beforeEach` hooks
   - Mock `console.error` for tests that expect errors to reduce noise
   - Ensure tests don't interfere with each other

4. **State Management in Tests**: When testing React components with state updates:
   - Be aware of timing issues between state updates and side effects
   - Use `waitFor` assertions for async state changes
   - Ensure state is properly synchronized before assertions

5. **Mock Dependencies Completely**: When adding new dependencies to components:
   - Update ALL test mocks to include new properties/methods
   - Example: Adding `refreshUser` to `useAuth` requires updating all `useAuth` mocks
   - Missing mock properties will cause runtime errors in tests
   - Always run `npm run test:frontend` after modifying auth context or hooks

## Maintenance Guidelines

### When Adding New Features

1. Update this CLAUDE.md file with new routes or architectural changes
2. Add appropriate tests
3. Run linting and formatting
4. Ensure all AWS resources are properly tagged

### When Updating Dependencies

1. Test thoroughly in development first
2. Update both frontend and infrastructure as needed
3. Run full test suite
4. Deploy to dev environment before production

## Technology Stack Summary

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, shadcn/ui
- **Infrastructure**: AWS CDK, CloudFront, S3, Route 53, ACM, Cognito, DynamoDB, Secrets Manager
- **Database**: DynamoDB with pay-per-request billing
- **Authentication**: AWS Cognito with Hosted UI, JWT tokens
- **Testing**: Jest, React Testing Library
- **CI/CD**: GitHub Actions
- **Code Quality**: ESLint, Prettier
- **Package Management**: npm with workspaces

## Authentication Architecture

### AWS Cognito Setup

- **User Pool**: Email-based authentication (profile data stored in DynamoDB)
- **Hosted UI**: Cognito-managed login/signup pages
- **OAuth Flow**: Authorization code grant with PKCE
- **Token Storage**: Client-side localStorage with automatic refresh

### Frontend Auth Implementation

- **Custom Auth Service**: Lightweight SDK using `@aws-sdk/client-cognito-identity-provider`
- **React Context**: Auth state management with `AuthProvider`
- **Protected Routes**: Client-side route protection
- **Session Management**: Automatic token refresh every 5 minutes

### Environment Variables

Required for frontend (in `.env.local`):

```bash
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_xxxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_COGNITO_DOMAIN=aura28-dev
NEXT_PUBLIC_COGNITO_REGION=us-east-1
NEXT_PUBLIC_API_GATEWAY_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com
```

Lambda environment variables (automatically configured):

```bash
TABLE_NAME=Aura28-{env}-Users
```

### Manual Configuration Steps

After CDK deployment:

1. Copy Cognito values from CDK output to `frontend/.env.local`
2. For social login (future):
   - Populate AWS Secrets Manager entries:
     - `aura28/oauth/google/{env}`
     - `aura28/oauth/facebook/{env}`
     - `aura28/oauth/apple/{env}`
   - Configure identity providers in Cognito console

## Database Architecture

### DynamoDB Setup

- **Table Name**: `Aura28-{env}-Users` (environment-specific)
- **Primary Key**: Composite key design
  - **Partition Key**: `userId` (String) - Cognito user ID
  - **Sort Key**: `createdAt` (String) - Fixed value 'PROFILE' for profile data
- **Billing**: Pay-per-request mode for cost optimization
- **Data Protection**: Point-in-time recovery enabled
- **Removal Policy**:
  - Development: DESTROY (allows clean teardown)
  - Production: RETAIN (protects user data)

### Data Model

```typescript
interface UserProfile {
  userId: string; // Partition key (Cognito ID)
  createdAt: 'PROFILE'; // Sort key (fixed value for profile)
  email: string;
  profile: {
    birthName: string;
    birthDate: string; // ISO date string
    birthTime?: string; // Optional time
    birthCity: string;
    birthState: string;
    birthCountry: string;
  };
  updatedAt: string; // ISO timestamp
}
```

### Access Patterns

1. **Get user profile**: Query with userId and createdAt='PROFILE'
2. **Update user profile**: Put item with userId and createdAt='PROFILE'
3. **Future**: Store multiple records per user with different sort keys

## Configuration Management

### Consolidated Configuration Files

As of the latest update, all linting, formatting, and ignore configurations have been consolidated to the root level for easier maintenance:

1. **ESLint Configuration** (`.eslintrc.json`)
   - Single root configuration with overrides for frontend and infrastructure
   - Frontend uses Next.js ESLint rules
   - Infrastructure uses TypeScript ESLint with custom rules
   - No separate ESLint configs in subdirectories

2. **Git Ignore** (`.gitignore`)
   - Single comprehensive .gitignore at root level
   - Covers all frontend and infrastructure patterns
   - No separate .gitignore files in subdirectories

3. **Prettier Ignore** (`.prettierignore`)
   - Comprehensive patterns for all build artifacts
   - Properly excludes compiled files while keeping source files

### Favicon Caching Solution

To address favicon caching issues in CloudFront:

- Added specific cache behavior for `/favicon*` paths
- Custom cache policy with 1-hour default TTL and 24-hour max TTL
- Ensures favicon updates are reflected more quickly in production

## Known Issues and Solutions

### Common CI/CD Failures

1. **Infrastructure Tests Fail with "Cannot find asset at frontend/out"**
   - **Cause**: Tests run before frontend is built
   - **Solution**: Infrastructure tests create temporary directory in beforeAll/afterAll hooks

2. **Jest TypeScript Configuration Error**
   - **Cause**: Type mismatch with Next.js jest config
   - **Solution**: Use type assertion in jest.config.ts: `export default createJestConfig(config as any)`

3. **Frontend Format Check Fails on CSS Files**
   - **Cause**: Root prettier config missing CSS file pattern
   - **Solution**: Include CSS in prettier patterns: `"**/*.{ts,tsx,js,jsx,json,css,md,yml,yaml}"`

4. **ESLint Errors on .d.ts Files**
   - **Cause**: TypeScript declaration files not in tsconfig
   - **Solution**: Now handled in root .eslintrc.json with proper ignorePatterns

5. **Birth Date Off-by-One Display Error**
   - **Cause**: JavaScript Date parsing timezone conversion (UTC to local time)
   - **Solution**: Add `{ timeZone: 'UTC' }` to `toLocaleDateString()` calls
   - **Example**: `new Date(birthDate).toLocaleDateString('en-US', { timeZone: 'UTC' })`

## Migration Notes

### S3 Bucket Naming Conflicts

S3 bucket names must be globally unique. If you encounter conflicts:

- Delete the old stack first
- Or use a different naming pattern in the new stack

## Useful Development Commands

### Testing Commands

```bash
# Run specific frontend test file
cd frontend && npm test -- __tests__/onboarding.test.tsx

# Run frontend tests in watch mode
cd frontend && npm test -- --watch

# Run tests with coverage
npm run test:frontend -- --coverage
```

### Debugging Commands

```bash
# Check current AWS Cognito client configuration
aws cognito-idp describe-user-pool-client \
  --user-pool-id us-east-1_rsin8LPL2 \
  --client-id YOUR_CLIENT_ID \
  --region us-east-1

# View CDK synthesized template
cd infrastructure && npx cdk synth --no-staging > synth.yaml

# Check CDK diff before deploying
cd infrastructure && npx cdk diff -c env=dev
```

## API Architecture

### API Gateway Setup

- **Type**: REST API with Cognito authorizer
- **Authentication**: JWT token validation via Cognito User Pool
- **CORS**: Enabled for all endpoints
- **Environment-specific URLs**: Separate APIs for dev and prod

### Lambda Functions

#### Update User Profile

- **Endpoint**: `PUT /users/{userId}/profile`
- **Purpose**: Save user profile data to DynamoDB
- **Authentication**: Cognito JWT required
- **Validation**: Ensures userId matches authenticated user

#### Get User Profile

- **Endpoint**: `GET /users/{userId}/profile`
- **Purpose**: Retrieve user profile from DynamoDB
- **Authentication**: Cognito JWT required
- **Validation**: Users can only access their own profile

### API Integration

```typescript
// Frontend API client example
const response = await fetch(`${process.env.NEXT_PUBLIC_API_GATEWAY_URL}/users/${userId}/profile`, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(profileData),
});
```

## GitHub Actions Configuration

### Required Secrets

#### Development Environment

- `AWS_ACCESS_KEY_ID` - AWS credentials
- `AWS_SECRET_ACCESS_KEY` - AWS credentials
- `AWS_REGION` - us-east-1
- `NEXT_PUBLIC_API_GATEWAY_URL` - Dev API Gateway URL

#### Production Environment

- `PROD_AWS_ACCESS_KEY_ID` - AWS credentials
- `PROD_AWS_SECRET_ACCESS_KEY` - AWS credentials
- `PROD_AWS_REGION` - us-east-1
- `PROD_NEXT_PUBLIC_API_GATEWAY_URL` - Prod API Gateway URL

## Future Enhancements

- Social login providers (Google, Apple, Facebook) - OAuth secrets provisioned
- Amazon Location Services for birth location geocoding
- OpenAI API integration for astrology readings
- Stripe payment processing
- ~~Database integration~~ ✅ DynamoDB implemented
- ~~API Gateway for serverless functions~~ ✅ REST API implemented
- ~~Lambda functions for business logic~~ ✅ Profile Lambda functions implemented
- Ephemeris calculations for astrology
- Global Secondary Indexes for additional query patterns
- DynamoDB Streams for real-time updates

---

Last Updated: January 4, 2025
