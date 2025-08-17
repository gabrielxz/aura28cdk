#!/bin/bash
set -e

echo "🚀 Lambda Pre-flight Check"
echo "=========================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track validation status
ALL_CHECKS_PASSED=true

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${RED}✗${NC} $2"
        ALL_CHECKS_PASSED=false
    fi
}

# Function to check Lambda package
check_lambda_package() {
    local package_path=$1
    local package_name=$2
    
    echo ""
    echo -e "${BLUE}Checking $package_name...${NC}"
    
    if [ ! -f "$package_path" ]; then
        print_status 1 "$package_name not found at $package_path"
        return
    fi
    
    # Check zip integrity
    unzip -t "$package_path" > /dev/null 2>&1
    print_status $? "Package integrity check"
    
    # Check for handler file
    local handler_file=$(basename "$package_path" .zip)
    unzip -l "$package_path" 2>/dev/null | grep -E "(index\.(js|mjs|ts)|handler\.(js|mjs|ts))" > /dev/null
    print_status $? "Handler file present"
    
    # Check for node_modules if it's a bundled package
    if unzip -l "$package_path" 2>/dev/null | grep -q "package.json"; then
        unzip -l "$package_path" 2>/dev/null | grep -q "node_modules"
        if [ $? -eq 0 ]; then
            print_status 0 "Dependencies bundled (node_modules found)"
        else
            # Check if it's using ESBuild (no node_modules needed)
            unzip -l "$package_path" 2>/dev/null | grep -q "index.js"
            if [ $? -eq 0 ]; then
                local file_size=$(unzip -l "$package_path" 2>/dev/null | grep "index.js" | awk '{print $1}')
                if [ "$file_size" -gt 10000 ]; then
                    print_status 0 "ESBuild bundle detected (single file)"
                else
                    print_status 1 "Missing dependencies (no node_modules or bundle)"
                fi
            fi
        fi
    fi
    
    # Check package size
    local size_mb=$(du -m "$package_path" | cut -f1)
    if [ "$size_mb" -gt 250 ]; then
        print_status 1 "Package too large (${size_mb}MB > 250MB limit)"
    elif [ "$size_mb" -gt 50 ]; then
        echo -e "${YELLOW}⚠️${NC}  Package is ${size_mb}MB (consider optimizing)"
    else
        print_status 0 "Package size OK (${size_mb}MB)"
    fi
}

# Function to check for AWS SDK usage
check_aws_sdk_version() {
    local lambda_dir=$1
    local lambda_name=$2
    
    echo ""
    echo -e "${BLUE}Checking AWS SDK usage in $lambda_name...${NC}"
    
    if [ -d "$lambda_dir" ]; then
        # Check for AWS SDK v2 usage (problematic in Node.js 20.x)
        grep -r "require.*aws-sdk" "$lambda_dir" --include="*.js" --include="*.mjs" --include="*.ts" 2>/dev/null | head -1
        if [ $? -eq 0 ]; then
            print_status 1 "AWS SDK v2 detected (not included in Node.js 20.x runtime)"
            echo "  Consider migrating to AWS SDK v3: @aws-sdk/client-*"
        else
            # Check for AWS SDK v3
            grep -r "@aws-sdk/client" "$lambda_dir" --include="*.js" --include="*.mjs" --include="*.ts" 2>/dev/null | head -1
            if [ $? -eq 0 ]; then
                print_status 0 "Using AWS SDK v3 (compatible)"
            else
                print_status 0 "No AWS SDK usage detected"
            fi
        fi
    fi
}

echo ""
echo "📦 Checking Lambda Deployment Packages..."
echo "----------------------------------------"

# Navigate to infrastructure directory
cd infrastructure 2>/dev/null || {
    echo -e "${RED}Error: infrastructure directory not found${NC}"
    exit 1
}

# Check orchestrator Lambda
if [ -f "lambda/swetest-orchestrator/orchestrator.zip" ]; then
    check_lambda_package "lambda/swetest-orchestrator/orchestrator.zip" "Swetest Orchestrator"
    check_aws_sdk_version "lambda/swetest-orchestrator" "Swetest Orchestrator"
fi

# Check for other Lambda functions (they use ESBuild)
echo ""
echo -e "${BLUE}Checking ESBuild Lambda functions...${NC}"

# Check if cdk.out directory exists (contains built functions)
if [ -d "cdk.out" ]; then
    lambda_count=$(find cdk.out -name "*.zip" -type f 2>/dev/null | wc -l)
    if [ "$lambda_count" -gt 0 ]; then
        print_status 0 "Found $lambda_count built Lambda functions in cdk.out"
    else
        echo -e "${YELLOW}⚠️${NC}  No Lambda functions found in cdk.out (run 'cdk synth' first)"
    fi
else
    echo -e "${YELLOW}⚠️${NC}  cdk.out directory not found (run 'cdk synth' to build)"
fi

echo ""
echo "🔍 Checking Lambda Source Code..."
echo "---------------------------------"

# Check all Lambda directories for common issues
for lambda_dir in lambda/*/; do
    if [ -d "$lambda_dir" ]; then
        lambda_name=$(basename "$lambda_dir")
        
        # Skip checking layers and test directories
        if [[ "$lambda_name" == *"layer"* ]] || [[ "$lambda_name" == *"test"* ]]; then
            continue
        fi
        
        echo ""
        echo -e "${BLUE}Checking $lambda_name...${NC}"
        
        # Check for handler file (could be .ts, .js, or specific function files)
        if ls "$lambda_dir"*.ts 2>/dev/null | head -1 > /dev/null; then
            print_status 0 "TypeScript source files found"
        elif ls "$lambda_dir"*.js 2>/dev/null | head -1 > /dev/null; then
            print_status 0 "JavaScript source files found"
        else
            print_status 1 "No source files found"
        fi
        
        # Check for console.log usage (should use console.info/warn/error in Lambda)
        grep -l "console\.log" "$lambda_dir"*.{js,mjs,ts} 2>/dev/null | head -1
        if [ $? -eq 0 ]; then
            echo -e "${YELLOW}⚠️${NC}  console.log found (use console.info/warn/error instead)"
        fi
        
        # Check for hardcoded credentials (security check) - exclude comments and common false positives
        grep -E "(aws_access_key_id|aws_secret_access_key).*=.*['\"]" "$lambda_dir"*.{js,mjs,ts} 2>/dev/null | grep -v "//" | head -1
        if [ $? -eq 0 ]; then
            print_status 1 "Potential hardcoded credentials detected!"
        fi
    fi
done

echo ""
echo "📋 Checking Build Configuration..."
echo "----------------------------------"

# Check if tsconfig exists
if [ -f "tsconfig.json" ]; then
    print_status 0 "TypeScript configuration found"
else
    print_status 1 "tsconfig.json not found"
fi

# Check for ESBuild configuration in CDK
grep -l "NodejsFunction" lib/**/*.ts 2>/dev/null | head -1
if [ $? -eq 0 ]; then
    print_status 0 "Using NodejsFunction (ESBuild) for Lambda bundling"
fi

echo ""
echo "🔧 Recommendations..."
echo "--------------------"

if [ "$ALL_CHECKS_PASSED" = true ]; then
    echo -e "${GREEN}✅ All Lambda pre-flight checks passed!${NC}"
else
    echo -e "${RED}❌ Some checks failed. Review the issues above.${NC}"
    echo ""
    echo "Common fixes:"
    echo "1. For missing packages: cd infrastructure/lambda/<function> && zip -r <package>.zip ."
    echo "2. For AWS SDK v2: Migrate to @aws-sdk/client-* packages"
    echo "3. For large packages: Exclude unnecessary files or use Lambda layers"
    echo "4. Run 'npm run build' to compile TypeScript functions"
fi

cd ..
exit $([ "$ALL_CHECKS_PASSED" = true ] && echo 0 || echo 1)