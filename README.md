# Aura28

A modern web platform built with Next.js, TypeScript, Tailwind CSS, and deployed with AWS CDK.

## Project Structure

```
aura28cdk/
├── frontend/          # Next.js application
├── infrastructure/    # AWS CDK infrastructure
└── .github/          # GitHub Actions workflows
```

## Development Setup

### Prerequisites

- Node.js 20.x
- AWS CLI configured with appropriate permissions
- GitHub repository with AWS secrets configured

### Local Development

1. **Frontend Development:**

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   Visit http://localhost:3000

2. **Build Frontend:**
   ```bash
   cd frontend
   npm run build
   ```

### AWS Infrastructure

The infrastructure is managed using AWS CDK and includes:

- S3 buckets for static hosting
- CloudFront distributions for global CDN
- Route 53 DNS configuration
- SSL certificates via ACM

## Deployment

### GitHub Secrets Required

Add these secrets to your GitHub repository:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (e.g., us-east-1)

### Environments

- **Development**: https://dev.aura28.com (deploys from `develop` branch)
- **Production**: https://aura28.com (deploys from `main` branch)

### Manual Deployment

```bash
cd infrastructure
npm install
npm run build

# Deploy development
npx cdk deploy Aura28DevStack

# Deploy production
npx cdk deploy Aura28ProdStack
```

## Architecture

- **Frontend**: Next.js 14 with App Router, static export
- **Styling**: Tailwind CSS v3 with Shadcn/ui components
- **Infrastructure**: AWS CDK v2
- **Hosting**: S3 + CloudFront
- **CI/CD**: GitHub Actions

## Future Features

- User authentication
- OpenAI integration
- Stripe payment processing
- And more!
