#!/bin/bash

# CI Simulation Script
# Simulates GitHub Actions CI environment locally
# Runs all jobs in parallel and reports results

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Temp directory for job outputs
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Function to run a job in background
run_job() {
    local job_name=$1
    local output_file="$TEMP_DIR/$job_name.out"
    local status_file="$TEMP_DIR/$job_name.status"
    
    shift
    echo -e "${CYAN}[STARTING]${NC} $job_name"
    
    # Run command in background and capture output
    (
        if eval "$@" > "$output_file" 2>&1; then
            echo "0" > "$status_file"
        else
            echo "1" > "$status_file"
        fi
    ) &
}

# Display results
show_results() {
    echo ""
    echo "======================================"
    echo "📊 CI Simulation Results"
    echo "======================================"
    echo ""
    
    local all_passed=true
    
    for job in "format-check" "lint-frontend" "lint-infrastructure" "test-frontend" "test-infrastructure" "build"; do
        if [ -f "$TEMP_DIR/$job.status" ]; then
            local status=$(cat "$TEMP_DIR/$job.status")
            if [ "$status" = "0" ]; then
                echo -e "${GREEN}✓${NC} $job: PASSED"
            else
                echo -e "${RED}✗${NC} $job: FAILED"
                all_passed=false
                
                # Show error output
                if [ -f "$TEMP_DIR/$job.out" ]; then
                    echo -e "${YELLOW}  Error output:${NC}"
                    tail -n 10 "$TEMP_DIR/$job.out" | sed 's/^/    /'
                fi
            fi
        else
            echo -e "${YELLOW}⚠${NC} $job: DID NOT COMPLETE"
            all_passed=false
        fi
    done
    
    echo ""
    echo "======================================"
    
    if $all_passed; then
        echo -e "${GREEN}✅ All CI checks would pass!${NC}"
        return 0
    else
        echo -e "${RED}❌ CI would fail with the above errors${NC}"
        echo ""
        echo "Fix these issues before pushing to avoid CI failures."
        return 1
    fi
}

# Start simulation
echo "======================================"
echo "🚀 Starting CI Simulation"
echo "======================================"
echo "Running all CI jobs in parallel..."
echo ""

# Install dependencies once
echo -e "${BLUE}[SETUP]${NC} Installing dependencies..."
if ! npm ci > "$TEMP_DIR/install.out" 2>&1; then
    echo -e "${RED}[ERROR]${NC} Failed to install dependencies"
    cat "$TEMP_DIR/install.out"
    exit 1
fi
echo -e "${GREEN}[READY]${NC} Dependencies installed"
echo ""

# Run all jobs in parallel (like CI does)
run_job "format-check" "npm run format:check"
run_job "lint-frontend" "ESLINT_USE_FLAT_CONFIG=false npx eslint 'frontend/**/*.{ts,tsx}' --max-warnings=0"
run_job "lint-infrastructure" "npm run lint:infrastructure"
run_job "test-frontend" "npm run test:frontend -- --ci --coverage=false"
run_job "test-infrastructure" "npm run test:infrastructure"
run_job "build" "npm run build"

# Wait for all jobs to complete
echo ""
echo "Waiting for jobs to complete..."
wait

# Show results
show_results
exit_code=$?

# Detailed failure analysis
if [ $exit_code -ne 0 ]; then
    echo ""
    echo "📝 Suggested fixes:"
    
    if [ -f "$TEMP_DIR/format-check.status" ] && [ "$(cat $TEMP_DIR/format-check.status)" = "1" ]; then
        echo "  • Format issues: Run 'npm run format'"
    fi
    
    if [ -f "$TEMP_DIR/lint-frontend.status" ] && [ "$(cat $TEMP_DIR/lint-frontend.status)" = "1" ]; then
        echo "  • Frontend lint issues: Check TypeScript types and ESLint rules"
    fi
    
    if [ -f "$TEMP_DIR/lint-infrastructure.status" ] && [ "$(cat $TEMP_DIR/lint-infrastructure.status)" = "1" ]; then
        echo "  • Infrastructure lint issues: Run 'npm run lint:infrastructure' for details"
    fi
    
    if [ -f "$TEMP_DIR/test-frontend.status" ] && [ "$(cat $TEMP_DIR/test-frontend.status)" = "1" ]; then
        echo "  • Frontend test failures: Run 'npm run test:frontend' for details"
    fi
    
    if [ -f "$TEMP_DIR/test-infrastructure.status" ] && [ "$(cat $TEMP_DIR/test-infrastructure.status)" = "1" ]; then
        echo "  • Infrastructure test failures: Check Docker availability"
    fi
    
    if [ -f "$TEMP_DIR/build.status" ] && [ "$(cat $TEMP_DIR/build.status)" = "1" ]; then
        echo "  • Build failures: Check TypeScript compilation errors"
    fi
fi

exit $exit_code