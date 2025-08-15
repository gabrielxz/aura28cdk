#!/bin/bash

# Build Swiss Ephemeris Layer on Amazon Linux 2023 EC2
# This script must be run on an Amazon Linux 2023 EC2 instance
# Architecture: x86_64, Runtime: Node.js 18.x

set -e

echo "=== Swiss Ephemeris Lambda Layer Builder for Amazon Linux 2023 ==="
echo "This script builds a Lambda-compatible Swiss Ephemeris layer"
echo ""

# Check if running on Amazon Linux
if ! grep -q 'Amazon Linux' /etc/os-release 2>/dev/null; then
    echo "WARNING: This script should be run on Amazon Linux 2023 for binary compatibility"
    echo "Current OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check architecture
ARCH=$(uname -m)
if [ "$ARCH" != "x86_64" ]; then
    echo "ERROR: This script requires x86_64 architecture"
    echo "Current architecture: $ARCH"
    exit 1
fi

# Install dependencies if needed
echo "=== Installing build dependencies ==="
sudo yum update -y
sudo yum groupinstall -y "Development Tools"
sudo yum install -y gcc-c++ make python3

# Install Node.js 18.x if not present
if ! command -v node &> /dev/null || [[ $(node --version) != v18* ]]; then
    echo "=== Installing Node.js 18.x ==="
    curl -sL https://rpm.nodesource.com/setup_18.x | sudo bash -
    sudo yum install -y nodejs
fi

echo "Node.js version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Architecture: $ARCH"
echo ""

# Create working directory
WORK_DIR="/tmp/swetest-layer-build"
rm -rf $WORK_DIR
mkdir -p $WORK_DIR
cd $WORK_DIR

echo "=== Building Swiss Ephemeris module ==="

# Create package.json for the layer
cat > package.json << 'EOF'
{
  "name": "swetest-layer",
  "version": "1.0.0",
  "description": "Swiss Ephemeris Lambda Layer",
  "dependencies": {
    "swisseph": "^2.10.3"
  }
}
EOF

# Install Swiss Ephemeris (will compile native module)
npm install --production

# Create layer structure
echo "=== Creating layer structure ==="
mkdir -p nodejs
mv node_modules nodejs/

# Download ephemeris files
echo "=== Downloading ephemeris data files ==="
cd nodejs/node_modules/swisseph
mkdir -p ephe
cd ephe

# Download essential ephemeris files from Swiss Ephemeris repository
EPHE_FILES=(
    "semo_18.se1"    # Moon ephemeris
    "sepl_18.se1"    # Planets ephemeris
    "seas_18.se1"    # Asteroids ephemeris
    "seleapsec.txt"  # Leap seconds
    "seorbel.txt"    # Orbital elements
    "sefstars.txt"   # Fixed stars (optional but useful)
)

for file in "${EPHE_FILES[@]}"; do
    echo "Downloading $file..."
    curl -sO "https://raw.githubusercontent.com/aloistr/swisseph/master/ephe/$file" || {
        echo "WARNING: Failed to download $file"
    }
done

# Verify files
echo ""
echo "=== Ephemeris files in layer ==="
ls -lh *.se1 *.txt 2>/dev/null | head -10

# Go back to work directory
cd $WORK_DIR

# Create the layer ZIP
echo ""
echo "=== Creating layer ZIP ==="
LAYER_NAME="swetest-layer-al2023-x86_64-node18-v1.zip"
zip -r $LAYER_NAME nodejs/

# Calculate size
SIZE=$(du -h $LAYER_NAME | cut -f1)
echo "Layer size: $SIZE"

# Test the module can be loaded
echo ""
echo "=== Testing module loading ==="
cat > test.js << 'EOF'
const path = require('path');
process.env.SE_EPHE_PATH = path.join(__dirname, 'nodejs/node_modules/swisseph/ephe');

try {
    const swisseph = require('./nodejs/node_modules/swisseph');
    console.log('✓ Swiss Ephemeris module loaded successfully');
    console.log('  Version:', swisseph.swe_version ? swisseph.swe_version() : 'Unknown');
    
    // Test ephemeris path
    swisseph.swe_set_ephe_path(process.env.SE_EPHE_PATH);
    console.log('✓ Ephemeris path set to:', process.env.SE_EPHE_PATH);
    
    // Test basic calculation
    const jd = swisseph.swe_julday(1879, 3, 14, 11.5, swisseph.SE_GREG_CAL);
    console.log('✓ Julian day calculation works:', jd);
    
    console.log('\nSUCCESS: Layer is ready for Lambda!');
} catch (error) {
    console.error('✗ Failed to load module:', error.message);
    process.exit(1);
}
EOF

node test.js

echo ""
echo "=== Build complete! ==="
echo "Layer file: $WORK_DIR/$LAYER_NAME"
echo ""
echo "Next steps:"
echo "1. Upload to S3:"
echo "   aws s3 cp $LAYER_NAME s3://your-bucket/layers/"
echo ""
echo "2. Publish Lambda layer:"
echo "   aws lambda publish-layer-version \\"
echo "     --layer-name aura28-swetest-al2023 \\"
echo "     --content S3Bucket=your-bucket,S3Key=layers/$LAYER_NAME \\"
echo "     --compatible-runtimes nodejs18.x \\"
echo "     --compatible-architectures x86_64 \\"
echo "     --description 'Swiss Ephemeris for Lambda (AL2023, Node 18, x86_64)'"
echo ""
echo "3. Store ARN in SSM:"
echo "   aws ssm put-parameter \\"
echo "     --name /aura28/dev/layers/swetest-arn \\"
echo "     --value 'arn:aws:lambda:...' \\"
echo "     --type String"