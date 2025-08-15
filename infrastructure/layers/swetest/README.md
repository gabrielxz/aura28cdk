# Swiss Ephemeris Lambda Layer

## Overview

This directory contains scripts to build and deploy a Lambda-compatible Swiss Ephemeris layer. The layer must be built on Amazon Linux 2023 to ensure binary compatibility with AWS Lambda.

## Problem

The Swiss Ephemeris library contains native C++ code that must be compiled for the specific OS and architecture where it will run. Building on Mac or Ubuntu creates binaries that won't work on AWS Lambda (Amazon Linux 2).

## Solution

Build the layer on an EC2 instance running Amazon Linux 2023 with the same architecture (x86_64) and Node.js version (18.x) as the Lambda functions.

## Prerequisites

- AWS CLI configured with appropriate permissions
- Access to launch EC2 instances
- S3 bucket for storing layer artifacts (will be created if needed)

## Build Process

### Step 1: Launch EC2 Instance

Launch an Amazon Linux 2023 EC2 instance:

```bash
aws ec2 run-instances \
  --image-id ami-0c02fb55731490381 \
  --instance-type t2.micro \
  --key-name your-key-pair \
  --security-group-ids sg-xxxxxxxx \
  --subnet-id subnet-xxxxxxxx \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=SwissEphBuild}]'
```

Or use the AWS Console:

- AMI: Amazon Linux 2023
- Instance Type: t2.micro (free tier eligible)
- Architecture: x86_64
- Region: us-east-1 (same as Lambda functions)

### Step 2: Connect to EC2

```bash
ssh -i your-key.pem ec2-user@<instance-ip>
```

### Step 3: Copy Build Script

Copy the `build-on-ec2.sh` script to the EC2 instance:

```bash
scp -i your-key.pem build-on-ec2.sh ec2-user@<instance-ip>:~/
```

### Step 4: Run Build Script

On the EC2 instance:

```bash
chmod +x build-on-ec2.sh
./build-on-ec2.sh
```

This will:

- Install Node.js 18.x and build tools
- Compile Swiss Ephemeris for Amazon Linux 2023
- Download ephemeris data files
- Create `swetest-layer-al2023-x86_64-node18-v1.zip`

### Step 5: Download Layer

Copy the built layer back to your local machine:

```bash
scp -i your-key.pem ec2-user@<instance-ip>:/tmp/swetest-layer-build/swetest-layer-al2023-x86_64-node18-v1.zip ./
```

### Step 6: Publish Layer

On your local machine:

```bash
./publish-layer.sh
```

This will:

- Upload layer to S3
- Publish Lambda layer version
- Store ARN in SSM Parameter Store for both dev and prod

### Step 7: Terminate EC2

Don't forget to terminate the EC2 instance:

```bash
aws ec2 terminate-instances --instance-ids i-xxxxxxxxx
```

## CDK Integration

The CDK stack automatically reads the layer ARN from SSM Parameter Store:

- Development: `/aura28/dev/layers/swetest-arn`
- Production: `/aura28/prod/layers/swetest-arn`

## Validation

After deployment, test with the Albert Einstein natal chart:

- Date: March 14, 1879
- Time: 11:30 AM (Ulm, Germany)
- Location: 48.40° N, 9.99° E
- Expected: Houses should calculate successfully

## Troubleshooting

### ERR_DLOPEN_FAILED

This means binary incompatibility. Ensure:

- Built on Amazon Linux 2023
- Architecture matches (x86_64)
- Node.js version matches (18.x)

### Module not found

Check CloudWatch logs for the ephemeris path. Should be:

```
SE_EPHE_PATH=/opt/nodejs/node_modules/swisseph/ephe
```

### Files not found

Verify ephemeris files are included in the layer:

```bash
unzip -l swetest-layer-al2023-x86_64-node18-v1.zip | grep ".se1"
```

## Files

- `build-on-ec2.sh` - Builds the layer on Amazon Linux 2023
- `publish-layer.sh` - Publishes layer to Lambda and updates SSM
- `build-layer.sh` - Old local build script (doesn't work for Lambda)
