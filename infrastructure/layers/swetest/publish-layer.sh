#!/bin/bash

# Publish Swiss Ephemeris Lambda Layer and update SSM
# Run this after building the layer with build-on-ec2.sh

set -e

# Configuration
LAYER_FILE="swetest-layer-al2023-x86_64-node18-v1.zip"
S3_BUCKET="aura28-lambda-layers"  # Update this with your bucket name
S3_KEY="swetest/$LAYER_FILE"
LAYER_NAME="aura28-swetest-al2023"
REGION="us-east-1"

# Check if layer file exists
if [ ! -f "$LAYER_FILE" ]; then
    echo "ERROR: Layer file not found: $LAYER_FILE"
    echo "Please run build-on-ec2.sh first"
    exit 1
fi

echo "=== Publishing Swiss Ephemeris Lambda Layer ==="
echo "Layer file: $LAYER_FILE"
echo "S3 bucket: $S3_BUCKET"
echo "Region: $REGION"
echo ""

# Create S3 bucket if it doesn't exist
echo "=== Ensuring S3 bucket exists ==="
aws s3api head-bucket --bucket "$S3_BUCKET" 2>/dev/null || {
    echo "Creating S3 bucket: $S3_BUCKET"
    if [ "$REGION" = "us-east-1" ]; then
        aws s3api create-bucket --bucket "$S3_BUCKET" --region "$REGION"
    else
        aws s3api create-bucket --bucket "$S3_BUCKET" --region "$REGION" \
            --create-bucket-configuration LocationConstraint="$REGION"
    fi
}

# Upload to S3
echo "=== Uploading layer to S3 ==="
aws s3 cp "$LAYER_FILE" "s3://$S3_BUCKET/$S3_KEY"

# Publish Lambda layer
echo "=== Publishing Lambda layer ==="
LAYER_OUTPUT=$(aws lambda publish-layer-version \
    --layer-name "$LAYER_NAME" \
    --content "S3Bucket=$S3_BUCKET,S3Key=$S3_KEY" \
    --compatible-runtimes nodejs18.x \
    --compatible-architectures x86_64 \
    --description "Swiss Ephemeris for Lambda (Amazon Linux 2023, Node.js 18.x, x86_64)" \
    --region "$REGION" \
    --output json)

# Extract Layer ARN
LAYER_ARN=$(echo "$LAYER_OUTPUT" | grep -o '"LayerVersionArn": "[^"]*' | cut -d'"' -f4)
LAYER_VERSION=$(echo "$LAYER_OUTPUT" | grep -o '"Version": [0-9]*' | cut -d' ' -f2)

echo ""
echo "✓ Layer published successfully!"
echo "  Layer ARN: $LAYER_ARN"
echo "  Version: $LAYER_VERSION"

# Update SSM Parameters for both environments
echo ""
echo "=== Updating SSM Parameters ==="

# Development environment
DEV_PARAM="/aura28/dev/layers/swetest-arn"
echo "Updating $DEV_PARAM..."
aws ssm put-parameter \
    --name "$DEV_PARAM" \
    --value "$LAYER_ARN" \
    --type "String" \
    --description "Swiss Ephemeris Lambda Layer ARN for Development" \
    --overwrite \
    --region "$REGION"

# Production environment (use same layer)
PROD_PARAM="/aura28/prod/layers/swetest-arn"
echo "Updating $PROD_PARAM..."
aws ssm put-parameter \
    --name "$PROD_PARAM" \
    --value "$LAYER_ARN" \
    --type "String" \
    --description "Swiss Ephemeris Lambda Layer ARN for Production" \
    --overwrite \
    --region "$REGION"

echo ""
echo "✓ SSM Parameters updated!"
echo ""
echo "=== Summary ==="
echo "Layer Name: $LAYER_NAME"
echo "Layer ARN: $LAYER_ARN"
echo "Layer Version: $LAYER_VERSION"
echo "SSM Parameters:"
echo "  - $DEV_PARAM"
echo "  - $PROD_PARAM"
echo ""
echo "Next steps:"
echo "1. Update CDK code to reference layer from SSM"
echo "2. Deploy CDK stack to use the new layer"
echo "3. Test natal chart generation"