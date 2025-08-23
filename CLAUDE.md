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
│   ├── docs/             # Setup and configuration guides
│   ├── lambda/           # Lambda functions
│   │   ├── payments/     # Stripe payment handlers
│   │   ├── readings/     # Reading generation functions
│   │   └── users/        # User management functions
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

## Stripe Payment Integration

### Payment Flow Architecture

The application uses a secure two-stage payment flow:

1. **Checkout Session Creation**: Frontend calls API to create Stripe checkout session
2. **Payment Processing**: User redirected to Stripe for secure payment
3. **Webhook Verification**: Stripe sends webhook to verify successful payment
4. **Reading Generation**: System automatically generates reading for paid user

### Lambda Functions

#### Create Checkout Session (`/lambda/payments/create-checkout-session.ts`)

- **Purpose**: Creates Stripe checkout sessions for payment processing
- **Endpoint**: `POST /users/{userId}/checkout-session`
- **Features**:
  - Supports both subscription and one-time payment modes
  - User authorization validation (users can only create sessions for themselves)
  - Configurable success/cancel URLs
  - Metadata support for tracking user context

#### Stripe Webhook Handler (`/lambda/payments/stripe-webhook-handler.ts`)

- **Purpose**: Processes Stripe webhook events after successful payments
- **Endpoint**: `POST /webhooks/stripe` (public, signature verified)
- **Features**:
  - Webhook signature verification using Stripe signing secret
  - Processes `checkout.session.completed` and `checkout.session.async_payment_succeeded` events
  - Automatically invokes reading generation Lambda after successful payment
  - Idempotency protection prevents duplicate processing
  - Rate limiting: 100 requests/second, 200 burst limit
  - Exponential backoff retry logic for failed reading generations

### Security Features

- **Webhook Signature Verification**: All webhook requests verified using Stripe signing secret
- **Internal Lambda Authentication**: Shared secret system for Lambda-to-Lambda invocations
- **Rate Limiting**: API Gateway throttling prevents abuse of webhook endpoint
- **User Authorization**: Checkout session creation requires JWT token validation

## API Endpoints

### User Management

- `GET /users/{userId}/profile` - Get user profile (JWT required)
- `PUT /users/{userId}/profile` - Update profile (JWT required, validates userId match)

### Payment & Reading Generation

- `POST /users/{userId}/checkout-session` - Create Stripe checkout session (JWT required)
- `POST /webhooks/stripe` - Stripe webhook endpoint (public, signature verified)

**Note**: Reading generation is only triggered via Stripe webhook after successful payment verification.

## Environment Variables

**Frontend** (`.env.local`):

```bash
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_xxxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_COGNITO_DOMAIN=aura28-dev
NEXT_PUBLIC_COGNITO_REGION=us-east-1
NEXT_PUBLIC_API_GATEWAY_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com
```

**Lambda** (auto-configured):

```bash
TABLE_NAME=Aura28-{env}-Users
STRIPE_API_KEY_PARAMETER_NAME=/aura28/{env}/stripe/api-key
STRIPE_WEBHOOK_SECRET_PARAMETER_NAME=/aura28/{env}/stripe/webhook-secret
WEBHOOK_INTERNAL_SECRET=auto-generated-per-environment
GENERATE_READING_FUNCTION_NAME=aura28-{env}-generate-reading
WEBHOOK_PROCESSING_TABLE_NAME=Aura28-{env}-Users
```

## GitHub Actions Secrets

**Dev**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `NEXT_PUBLIC_API_GATEWAY_URL`  
**Prod**: Same with `PROD_` prefix

## SSM Parameters (AWS Systems Manager)

**Stripe Configuration**:

- `/aura28/{env}/stripe/api-key` - Stripe API secret key (SecureString)
- `/aura28/{env}/stripe/webhook-secret` - Stripe webhook signing secret (SecureString)

**Reading System**:

- `/aura28/{env}/reading/system_prompt_s3key` - S3 key for system prompts
- `/aura28/{env}/reading/user_prompt_s3key` - S3 key for user prompt templates

**Setup Command**:

```bash
aws ssm put-parameter --name "/aura28/{env}/stripe/webhook-secret" --value "whsec_..." --type "SecureString"
```

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

## Stripe Webhook Configuration

### Prerequisites

- AWS CDK stack deployed
- Stripe account with API keys configured in SSM Parameter Store
- Access to Stripe Dashboard

### Setup Steps

1. **Get Webhook Endpoint URL**: After CDK deployment, webhook endpoint is at:

   ```
   https://{api-gateway-id}.execute-api.us-east-1.amazonaws.com/{stage}/api/webhooks/stripe
   ```

2. **Configure Stripe Dashboard**:
   - Navigate to **Developers** → **Webhooks** → **Add endpoint**
   - Enter webhook endpoint URL
   - Select events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`

3. **Update SSM Parameter**: Copy webhook signing secret from Stripe Dashboard and store in SSM:
   ```bash
   aws ssm put-parameter \
     --name "/aura28/{env}/stripe/webhook-secret" \
     --value "whsec_your_secret_here" \
     --type "SecureString"
   ```

### Testing

- Use Stripe CLI for development testing: `stripe listen --forward-to localhost:3001/api/webhooks/stripe`
- Monitor CloudWatch logs for webhook processing
- Check `Aura28/Webhooks` metrics for success/failure rates

**Setup Guide**: See `/infrastructure/docs/stripe-webhook-setup.md` for detailed instructions.

## Frontend Integration

### Payment Flow

- **Checkout Session Creation**: `UserApi.createCheckoutSession()` method initiates Stripe checkout
- **Payment Processing**: Users redirected to Stripe for secure payment
- **Post-Payment**: Users automatically redirected back to success/cancel URLs
- **Reading Access**: Readings generated automatically after successful payment webhook

### API Methods

```typescript
// Create Stripe checkout session
await userApi.createCheckoutSession(userId, {
  sessionType: 'one-time' | 'subscription',
  priceId: 'price_xyz...',
  successUrl: 'https://app.com/success',
  cancelUrl: 'https://app.com/cancel',
});
```

### Security Changes

- **Removed**: Direct reading generation from dashboard UI
- **Removed**: Manual "Generate Reading" button
- **Added**: Payment-first flow ensures readings only available after purchase

## Monitoring & Observability

### CloudWatch Metrics

**Namespace**: `Aura28/Webhooks`

- `WebhookProcessingSuccess` - Successful webhook processing count
- `WebhookProcessingFailure` - Failed webhook processing count
- `ReadingGenerationSuccess` - Successful reading generation count
- `ReadingGenerationFailure` - Failed reading generation count
- `WebhookSignatureVerificationFailure` - Invalid signature attempts
- `DuplicateEventProcessing` - Idempotency protection activations

### Alarms & Monitoring

- Webhook failure rate thresholds
- Reading generation success rate monitoring
- Invalid signature attempt detection
- Processing time performance metrics

## Key Notes

- **Payment-First Architecture**: Reading generation only occurs after verified Stripe payment
- **Webhook Security**: All Stripe webhooks verified with signing secrets and rate limited
- **Internal Lambda Security**: Shared secret system prevents unauthorized Lambda invocations
- **Idempotency Protection**: Duplicate webhook events automatically detected and prevented
- Frontend static export for CloudFront
- DynamoDB composite keys for extensibility
- Lambda validates user can only access own data
- All infrastructure via CDK - no manual AWS console changes
- Do not modify ESLint/Prettier/TS configs or GitHub Actions without approval

**For git workflow details, see gitWorkflow.md**
