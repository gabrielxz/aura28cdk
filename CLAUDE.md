# CLAUDE.md - Aura28 Project Reference

## Pre-Commit Checks (Golden Path)

```bash
npm ci          # install dependencies & auto-install Husky
npm run fix     # auto-format and lint-fix
npm run lint    # verify linting passes
npm run build   # verify TypeScript compilation
npm test        # verify all tests pass
```

**Important**: Use `git-workflow-executor` agent for commits - it handles these checks automatically.

## Commands

- `npm run fix` - Auto-format with Prettier and fix ESLint issues
- `npm run test:frontend` - Frontend tests only
- `npm run test:infrastructure` - Infrastructure tests only
- `cd infrastructure && npx cdk diff -c env=dev` - Preview CDK changes
- `cd infrastructure && npx cdk deploy -c env=dev` - Deploy to AWS

**Policy**: In `infrastructure/lambda/**`, `console.info|warn|error` are allowed (CloudWatch). Frontend strict - no console.

## Tech Stack

- **Frontend**: Next.js 14+, TypeScript, Tailwind CSS, shadcn/ui
- **Infrastructure**: AWS CDK, CloudFront, S3, Route 53, Cognito, DynamoDB, Lambda
- **Database**: DynamoDB with pay-per-request billing
- **Auth**: AWS Cognito with Hosted UI, JWT tokens
- **Node 20**, **npm** workspaces, Husky pre-commit hooks

## Project Structure

```
aura28cdk/
├── frontend/               # Next.js app
│   ├── app/               # App Router pages
│   ├── components/        # React components
│   └── __tests__/        # Frontend tests
├── infrastructure/        # AWS CDK
│   ├── assets/           # Static assets for deployment
│   │   └── prompts/      # Prompt templates (source of truth)
│   ├── lambda/           # Lambda functions
│   └── lib/              # Stack definitions
└── .github/workflows/    # CI/CD pipelines
```

## Routes

- `/` - Homepage
- `/login` - Cognito Hosted UI redirect
- `/logout` - Logout and redirect
- `/auth/callback` - OAuth callback
- `/dashboard` - Protected user dashboard
- `/account-settings` - Protected settings

## Database Schema

**Table**: `Aura28-{env}-Users`  
**Keys**: `userId` (PK), `createdAt` (SK - always 'PROFILE')

```typescript
interface UserProfile {
  userId: string; // Cognito ID
  createdAt: 'PROFILE';
  email: string;
  profile: {
    birthName: string;
    birthDate: string; // ISO date
    birthTime?: string;
    birthCity: string;
    birthState: string;
    birthCountry: string;
  };
  updatedAt: string;
}
```

## API Endpoints

- `GET /users/{userId}/profile` - Get user profile (JWT required)
- `PUT /users/{userId}/profile` - Update profile (JWT required, validates userId match)

## Environment Variables

**Frontend** (`.env.local`):

```bash
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_xxxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_COGNITO_DOMAIN=aura28-dev
NEXT_PUBLIC_COGNITO_REGION=us-east-1
NEXT_PUBLIC_API_GATEWAY_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com
```

**Lambda** (auto-configured): `TABLE_NAME=Aura28-{env}-Users`

## GitHub Actions Secrets

**Dev**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `NEXT_PUBLIC_API_GATEWAY_URL`  
**Prod**: Same with `PROD_` prefix

## AWS Configuration

- **Region**: us-east-1
- **Branches**: develop → dev environment, main → prod
- **Stack**: `Aura28-{env}-Stack`
- **Tags**: `Project: Aura28CDK`
- **S3 Policy**: DESTROY (dev), RETAIN (prod)

## Prompt Management System

**Architecture**: Prompts are stored as files in the repository and automatically deployed to S3 during CDK deployment.

### Directory Structure

```
infrastructure/assets/prompts/
├── dev/
│   └── soul_blueprint/
│       ├── system.txt         # System prompt for dev
│       └── user_template.md    # User prompt template for dev
└── prod/
    └── soul_blueprint/
        ├── system.txt         # System prompt for prod
        └── user_template.md    # User prompt template for prod
```

### How It Works

1. **Source of Truth**: Prompt files in `infrastructure/assets/prompts/{env}/` are version-controlled
2. **Deployment**: CDK's `BucketDeployment` automatically syncs prompts to S3 bucket `aura28-{env}-config`
3. **Configuration**: SSM parameters store S3 keys:
   - `/aura28/{env}/reading/system_prompt_s3key` → `prompts/{env}/soul_blueprint/system.txt`
   - `/aura28/{env}/reading/user_prompt_s3key` → `prompts/{env}/soul_blueprint/user_template.md`
4. **Runtime**: Lambda fetches S3 keys from SSM, then reads prompt content from S3

### Updating Prompts

1. Edit files in `infrastructure/assets/prompts/{env}/`
2. Deploy with `npx cdk deploy -c env={env}`
3. Prompts are automatically uploaded to S3
4. Lambda fetches latest version on next invocation (with caching)

**Note**: Prompts use `{{placeholders}}` format (e.g., `{{birthName}}`, `{{natalChartData}}`)

## Key Notes

- Frontend static export for CloudFront
- DynamoDB composite keys for extensibility
- Lambda validates user can only access own data
- All infrastructure via CDK - no manual AWS console changes
- Do not modify ESLint/Prettier/TS configs or GitHub Actions without approval

**For git workflow details, see gitWorkflow.md**
