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
  - Run `npm run format` at root level
- **Linting**: ESLint configured for TypeScript monorepo
  - Extends `prettier` to avoid conflicts
  - Frontend disables `@next/next/no-html-link-for-pages` rule
  - Run `npm run lint` at root level

### 4. Testing Requirements

- **Framework**: Jest for both frontend and infrastructure
- **Coverage**: All new features must include tests
- **CI/CD**: Tests run automatically before deployment
- **Commands**:
  - `npm run test:frontend`
  - `npm run test:infrastructure`

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

### Planned Routes

- `/login` - User authentication
- `/dashboard` - User dashboard
- `/api/*` - API endpoints (when server components are added)

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
- **Infrastructure**: AWS CDK, CloudFront, S3, Route 53, ACM
- **Testing**: Jest, React Testing Library
- **CI/CD**: GitHub Actions
- **Code Quality**: ESLint, Prettier
- **Package Management**: npm with workspaces

## Environment Variables

Currently, no environment variables are required for local development. Future additions will be documented here.

## Future Enhancements

- User authentication system
- OpenAI API integration
- Stripe payment processing
- Database integration (likely DynamoDB or RDS)
- API Gateway for serverless functions

---

Last Updated: [Auto-updated by Git hooks]
