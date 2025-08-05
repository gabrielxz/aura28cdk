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

### 7. Git Workflow Rules

**CRITICAL**: These rules MUST be followed at all times:

- **NEVER push directly to main branch**
- **ALWAYS work in the develop branch** unless explicitly instructed otherwise
- **Production deployments** only happen via merging develop → main
- **Default branch**: Always use `develop` for all changes
- **Commit workflow**:
  1. Make changes in develop branch
  2. Run pre-commit checklist
  3. Commit and push to develop
  4. Only merge to main when explicitly requested by user

## Route Manifest

### Current Routes

- `/` - Homepage (Hello Carri landing page)
- `/login` - Redirects to Cognito Hosted UI
- `/logout` - Logs out user and redirects to home
- `/auth/callback` - OAuth callback handler
- `/dashboard` - User dashboard (protected route)

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

### Pre-Commit Checklist

**IMPORTANT**: Before committing or pushing any changes, you MUST complete ALL of the following steps:

1. **Run formatting**: `npm run format` (at root level)
   - This ensures all code follows consistent formatting rules
   - Prevents CI/CD failures due to formatting issues

2. **Run linting**: `npm run lint` (at root level)
   - Catches potential code quality issues
   - Ensures TypeScript and ESLint rules are satisfied

3. **Run tests**: `npm test` (at root level)
   - Verifies all tests pass
   - Prevents breaking existing functionality
   - **Important**: Also run `npm run test:frontend` separately to ensure frontend test output is clearly visible

4. **Build check**: `npm run build` (at root level)
   - Ensures the project builds successfully
   - Catches TypeScript compilation errors

5. **Verify no untracked files**: `git status`
   - Ensure all necessary files are staged
   - Check for any accidentally modified files

6. **Review changes**: `git diff --staged`
   - Double-check your changes are intentional
   - Look for any debug code or temporary changes

**Note**: Skipping these steps will likely cause GitHub Actions CI/CD pipeline failures, requiring additional commits to fix issues that could have been caught locally.

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

### Deployment

1. Make changes and test locally
2. Commit to `develop` branch
3. GitHub Actions runs tests and deploys to dev
4. Merge to `main` when ready for production

### CDK Commands

```bash
# Deploy to dev (default)
cd infrastructure && npx cdk deploy

# Deploy to prod
cd infrastructure && npx cdk deploy -c env=prod

# View differences
cd infrastructure && npx cdk diff -c env=prod
```

## Maintenance Guidelines

### When Adding New Features

1. Update this CLAUDE.md file with new routes or architectural changes
2. Add appropriate tests
3. Run linting and formatting before committing
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
- **Important Note**: Cognito custom attributes cannot be removed once created. Full stack deletion required for schema changes.

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

### Changing Stack Names

When updating stack naming conventions (e.g., from `Aura28DevStack` to `Aura28-dev-Stack`):

1. **Delete existing stacks in AWS CloudFormation console**
   - Development stacks can be deleted safely (S3 bucket has DESTROY policy)
   - Production requires manual S3 bucket deletion after stack deletion (RETAIN policy)

2. **Clean up Route 53 records**
   - Delete orphaned ACM validation CNAME records (start with underscore)
   - Keep NS and SOA records

3. **Update deployment commands**
   - Use context-based deployment: `npx cdk deploy -c env=dev`

### S3 Bucket Naming Conflicts

S3 bucket names must be globally unique. If you encounter conflicts:

- Delete the old stack first
- Or use a different naming pattern in the new stack

## Useful Development Commands

### User Management

Delete a single Cognito user:

```bash
aws cognito-idp admin-delete-user \
  --user-pool-id us-east-1_rsin8LPL2 \
  --username user@example.com \
  --region us-east-1
```

List all users:

```bash
aws cognito-idp list-users \
  --user-pool-id us-east-1_rsin8LPL2 \
  --region us-east-1
```

Delete all users (use with caution):

```bash
aws cognito-idp list-users --user-pool-id us-east-1_rsin8LPL2 --region us-east-1 | \
  jq -r '.Users[].Username' | \
  while read username; do
    echo "Deleting $username"
    aws cognito-idp admin-delete-user \
      --user-pool-id us-east-1_rsin8LPL2 \
      --username "$username" \
      --region us-east-1
  done
```

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

### Deployment Workflow

1. Code pushed to `develop` branch
2. GitHub Actions runs tests and linting
3. CDK deploys infrastructure to dev
4. Frontend builds with API Gateway URL
5. Static assets deployed to S3/CloudFront

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

6. **DynamoDB Undefined Values Error**
   - **Cause**: DynamoDB SDK doesn't allow undefined values in item attributes
   - **Error**: "Pass options.removeUndefinedValues=true to remove undefined values"
   - **Solution**: Build objects conditionally, only including fields with defined values
   - **Example**:

     ```typescript
     const profile: any = {
       birthName: profileData.birthName,
       birthDate: profileData.birthDate,
       // Required fields...
     };

     // Only add optional fields if they have values
     if (profileData.birthTime) {
       profile.birthTime = profileData.birthTime;
     }
     ```

7. **Cognito Custom Attributes Immutability**
   - **Issue**: Once custom attributes are added to a Cognito User Pool, they cannot be removed
   - **Impact**: Schema changes require complete stack deletion and recreation
   - **Solution**: Delete stack, clean up resources, and redeploy with new schema
   - **Prevention**: Carefully plan Cognito schema before production deployment

## Migration from Cognito Custom Attributes to DynamoDB

The project has migrated from storing user profile data in Cognito custom attributes to using DynamoDB with an API layer. This provides:

1. **Flexibility**: Profile schema can be modified without recreating the User Pool
2. **Scalability**: DynamoDB handles complex data structures better than Cognito attributes
3. **Performance**: Direct database queries vs parsing JWT tokens
4. **Cost Optimization**: Pay-per-request billing for DynamoDB
5. **Future-proofing**: Easier to add features like user history, preferences, etc.

### Migration Steps Taken

1. Removed Cognito custom attributes from CDK stack
2. Created DynamoDB table with userId/createdAt composite key
3. Implemented API Gateway with Lambda functions
4. Updated frontend to call API instead of Cognito UpdateUserAttributes
5. Added API Gateway URL to GitHub Actions secrets
6. Deployed to both dev and prod environments

---

Last Updated: January 4, 2025
