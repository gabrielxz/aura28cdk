# Troubleshooting Guide - Aura28 CDK Deployment

## Common Deployment Failures and Solutions

### 1. "The specified key does not exist" - S3 Artifact Issues

**Symptoms:**

- CloudFormation fails with S3 NoSuchKey error
- Lambda Custom Resource fails to download build artifacts

**Root Causes:**

- CodeBuild adds build ID to artifact paths (e.g., `build/<build-id>/layer.zip`)
- Buildspec overrides CDK artifact configuration
- S3 eventual consistency issues

**Solutions:**

1. Use dynamic path resolution in Lambda code:
   ```javascript
   const layerZipKey = listResult.Contents?.find((obj) => obj.Key.endsWith('layer.zip'))?.Key;
   ```
2. Remove `name` field from buildspec artifacts section
3. Add retry logic with delays for S3 operations

---

### 2. "Cannot find module 'aws-sdk'" in Lambda

**Symptoms:**

- Lambda function fails with module not found error
- Works locally but fails in AWS

**Root Cause:**

- Node.js 20.x Lambda runtime doesn't include AWS SDK v2

**Solutions:**

1. Migrate to AWS SDK v3:

   ```javascript
   // Old (v2)
   const AWS = require('aws-sdk');
   const s3 = new AWS.S3();

   // New (v3)
   import { S3Client } from '@aws-sdk/client-s3';
   const s3 = new S3Client({});
   ```

2. Or bundle AWS SDK v2 in your deployment package

---

### 3. SSM Parameter Circular Dependencies

**Symptoms:**

- CDK deployment fails with circular dependency error
- "Cannot read parameter that doesn't exist yet"

**Root Cause:**

- Trying to read SSM parameters during stack creation that are created by the same stack

**Solution:**

- Pass values directly between constructs instead of through SSM:

  ```typescript
  // Instead of reading from SSM
  const layerArn = ssm.StringParameter.valueFromLookup(this, '/layer/arn');

  // Pass directly from Custom Resource
  const layerArn = customResource.getAttString('LayerArn');
  ```

---

### 4. Lambda Package Missing Dependencies

**Symptoms:**

- "Cannot find module" errors at runtime
- Package works locally but not in Lambda

**Root Causes:**

- Dependencies not bundled in deployment package
- Using `zip` command without including node_modules

**Solutions:**

1. Ensure node_modules is included:
   ```bash
   cd lambda/function
   npm install
   zip -r ../function.zip .
   ```
2. Use CDK's NodejsFunction for automatic bundling:
   ```typescript
   new NodejsFunction(this, 'Function', {
     entry: 'lambda/function/index.ts',
     bundling: { minify: true },
   });
   ```

---

### 5. "Command not found" in Lambda

**Symptoms:**

- Lambda fails with "zip: command not found"
- Shell commands don't work in Lambda

**Root Cause:**

- Lambda runtime has limited system commands available

**Solution:**

- Use Node.js libraries instead of shell commands:
  ```javascript
  // Instead of exec('zip ...')
  import archiver from 'archiver';
  const archive = archiver('zip');
  ```

---

### 6. CDK Synthesis Passes but Deployment Fails

**Symptoms:**

- `cdk synth` succeeds
- `cdk deploy` fails with various errors

**Root Causes:**

- Runtime-only issues (missing files, permissions)
- External resource dependencies
- API rate limits

**Prevention:**

1. Run comprehensive validation:
   ```bash
   ./scripts/validate-deployment.sh
   ```
2. Use `cdk diff` to preview changes
3. Add `--strict` flag to synthesis:
   ```bash
   cdk synth --strict
   ```

---

## Debugging Tools and Commands

### Check CloudWatch Logs

```bash
# View Lambda logs
aws logs tail /aws/lambda/<function-name> --follow

# View CodeBuild logs
aws logs tail /aws/codebuild/<project-name> --follow
```

### Validate Lambda Packages

```bash
# Check package contents
unzip -l lambda/function.zip

# Test package integrity
unzip -t lambda/function.zip

# Run pre-flight checks
./scripts/preflight-lambda-check.sh
```

### CDK Debugging

```bash
# Verbose output
cdk deploy --verbose

# Show all context values
cdk context --clear
cdk context

# Validate without deploying
cdk synth --strict
```

### S3 Debugging

```bash
# List bucket contents
aws s3 ls s3://bucket-name/path/ --recursive

# Check object metadata
aws s3api head-object --bucket bucket-name --key path/to/object
```

---

## Pre-Deployment Checklist

Before deploying, ensure:

- [ ] All tests pass: `npm test`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Lambda packages exist: `ls infrastructure/lambda/*/\*.zip`
- [ ] CDK synthesis works: `cd infrastructure && cdk synth`
- [ ] Validation passes: `./scripts/validate-deployment.sh`
- [ ] No deprecated APIs: Check CDK warnings
- [ ] AWS credentials configured: `aws sts get-caller-identity`

---

## Emergency Rollback

If deployment fails and leaves stack in bad state:

1. **Manual rollback:**

   ```bash
   aws cloudformation cancel-update-stack --stack-name Aura28-dev-Stack
   ```

2. **Delete and recreate (dev only):**

   ```bash
   cdk destroy -c env=dev
   cdk deploy -c env=dev
   ```

3. **Fix stuck DELETE_IN_PROGRESS:**
   - Check CloudFormation console for resource causing issue
   - Manually delete the resource if needed
   - Retry stack deletion

---

## Getting Help

1. Check CloudWatch Logs for detailed error messages
2. Review recent commits that might have introduced issues
3. Run validation scripts to identify problems
4. Check AWS Service Health Dashboard for outages
5. Review this guide for common issues

For persistent issues, provide:

- Error message from CloudFormation
- Relevant CloudWatch logs
- Output from validation scripts
- Recent changes made
