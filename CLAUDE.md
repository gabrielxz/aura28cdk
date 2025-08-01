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
- **Infrastructure**: AWS CDK, CloudFront, S3, Route 53, ACM, Cognito, Secrets Manager
- **Authentication**: AWS Cognito with Hosted UI, JWT tokens
- **Testing**: Jest, React Testing Library
- **CI/CD**: GitHub Actions
- **Code Quality**: ESLint, Prettier
- **Package Management**: npm with workspaces

## Authentication Architecture

### AWS Cognito Setup

- **User Pool**: Email-based authentication with custom attributes for birth information
- **Hosted UI**: Cognito-managed login/signup pages
- **Custom Attributes**:
  - `custom:birthTime` - Birth time
  - `custom:birthPlace` - Birth location
  - `custom:birthLatitude` - Birth latitude
  - `custom:birthLongitude` - Birth longitude
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
   - **Solution**: Add to infrastructure/.eslintrc.json: `"ignorePatterns": ["*.d.ts", "*.js", "cdk.out"]`

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

## Future Enhancements

- Social login providers (Google, Apple, Facebook) - OAuth secrets provisioned
- Amazon Location Services for birth location geocoding
- OpenAI API integration for astrology readings
- Stripe payment processing
- Database integration (likely DynamoDB or RDS)
- API Gateway for serverless functions
- Ephemeris calculations for astrology

---

Last Updated: [Auto-updated by Git hooks]
