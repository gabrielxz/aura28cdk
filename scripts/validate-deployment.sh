#!/bin/bash
set -e

echo "🔍 Running Pre-Deployment Validation..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track validation status
VALIDATION_PASSED=true

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${RED}✗${NC} $2"
        VALIDATION_PASSED=false
    fi
}

echo ""
echo "1️⃣ Checking Node.js version..."
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -ge 20 ]; then
    print_status 0 "Node.js version is 20 or higher"
else
    print_status 1 "Node.js version must be 20 or higher (found: $(node --version))"
fi

echo ""
echo "2️⃣ Installing dependencies..."
npm ci --quiet
print_status $? "Dependencies installed"

echo ""
echo "3️⃣ Running linter..."
npm run lint --silent
print_status $? "Linting passed"

echo ""
echo "4️⃣ Building TypeScript..."
npm run build --silent
print_status $? "TypeScript build successful"

echo ""
echo "5️⃣ Running tests..."
npm test --silent
print_status $? "All tests passed"

echo ""
echo "6️⃣ Validating CDK synthesis..."
cd infrastructure
npx cdk synth -c env=dev --quiet > /dev/null 2>&1
print_status $? "CDK synthesis successful"

echo ""
echo "7️⃣ Checking Lambda deployment packages..."
# Check if orchestrator.zip exists and is valid
if [ -f "lambda/swetest-orchestrator/orchestrator.zip" ]; then
    unzip -t lambda/swetest-orchestrator/orchestrator.zip > /dev/null 2>&1
    print_status $? "Orchestrator Lambda package is valid"
else
    print_status 1 "Orchestrator Lambda package not found"
fi

echo ""
echo "8️⃣ Running CDK diff to preview changes..."
echo -e "${YELLOW}CDK Diff Output:${NC}"
npx cdk diff -c env=dev 2>&1 | head -50
echo ""

cd ..

echo ""
if [ "$VALIDATION_PASSED" = true ]; then
    echo -e "${GREEN}✅ All validation checks passed!${NC}"
    echo "You can now safely deploy with: npm run deploy:dev"
    exit 0
else
    echo -e "${RED}❌ Validation failed! Please fix the issues above before deploying.${NC}"
    exit 1
fi