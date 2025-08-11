#!/bin/bash

# Pre-commit validation script
# This script runs all CI checks locally before allowing commits
# It uses the exact same commands and flags as GitHub Actions

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}[CHECKING]${NC} $1..."
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Track if any check fails
FAILED=0

# Start validation
echo "======================================"
echo "🔍 Running Pre-commit CI Validation"
echo "======================================"
echo ""

# 1. Lint Frontend (with exact CI flags)
print_step "Frontend Linting"
if ESLINT_USE_FLAT_CONFIG=false npx eslint "frontend/**/*.{ts,tsx}" --max-warnings=0 2>/dev/null; then
    print_success "Frontend linting passed"
else
    print_error "Frontend linting failed"
    FAILED=1
fi

# 2. Lint Infrastructure (allow warnings for console.log in Lambda functions)
print_step "Infrastructure Linting"
if ESLINT_USE_FLAT_CONFIG=false npx eslint "infrastructure/**/*.ts" --max-warnings=10 2>/dev/null; then
    print_success "Infrastructure linting passed"
else
    print_error "Infrastructure linting failed"
    FAILED=1
fi

# 3. Run Frontend Tests
print_step "Frontend Tests"
if npm run test:frontend -- --ci --coverage=false 2>/dev/null; then
    print_success "Frontend tests passed"
else
    print_error "Frontend tests failed"
    FAILED=1
fi

# 4. Run Infrastructure Tests (with Docker check)
print_step "Infrastructure Tests"
if docker --version >/dev/null 2>&1; then
    if npm run test:infrastructure 2>/dev/null; then
        print_success "Infrastructure tests passed"
    else
        print_error "Infrastructure tests failed"
        FAILED=1
    fi
else
    print_warning "Docker not available - infrastructure tests will be limited in CI"
    # Run tests anyway to catch non-Docker issues
    if npm run test:infrastructure 2>/dev/null; then
        print_success "Infrastructure tests passed (Docker skipped)"
    else
        print_error "Infrastructure tests failed"
        FAILED=1
    fi
fi

# 5. Build Check
print_step "Build"
if npm run build 2>/dev/null; then
    print_success "Build succeeded"
else
    print_error "Build failed"
    FAILED=1
fi

# 6. Format Check (both root and infrastructure)
print_step "Format Check (Root)"
if npm run format:check 2>/dev/null; then
    print_success "Root format check passed"
else
    print_error "Root format check failed - run 'npm run format'"
    FAILED=1
fi

print_step "Format Check (Infrastructure)"
if cd infrastructure && npm run format:check 2>/dev/null && cd ..; then
    print_success "Infrastructure format check passed"
else
    print_error "Infrastructure format check failed"
    cd .. 2>/dev/null  # Ensure we're back at root
    FAILED=1
fi

# 7. Check for TypeScript 'any' types in critical files
print_step "TypeScript Strict Type Check"
if ! grep -r "any\[\]" frontend/jest.setup.ts 2>/dev/null; then
    print_success "No unsafe 'any[]' types found"
else
    print_error "Found 'any[]' types in jest.setup.ts - use proper types"
    FAILED=1
fi

# 8. Check for uncommitted changes (excluding this check)
print_step "Git Status"
if [[ -z $(git status --porcelain | grep -v "scripts/pre-commit-check.sh") ]]; then
    print_success "Working directory clean"
else
    print_warning "Uncommitted changes detected"
    git status --short | grep -v "scripts/pre-commit-check.sh"
fi

echo ""
echo "======================================"

# Final result
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All pre-commit checks passed!${NC}"
    echo "Safe to commit your changes."
    exit 0
else
    echo -e "${RED}❌ Pre-commit validation failed!${NC}"
    echo ""
    echo "Please fix the issues above before committing."
    echo "This prevents CI/CD failures in GitHub Actions."
    echo ""
    echo "Tips:"
    echo "  • Run 'npm run lint' to fix linting issues"
    echo "  • Run 'npm run format' to fix formatting"
    echo "  • Run 'npm test' to debug test failures"
    echo "  • Check TypeScript types in jest.setup.ts"
    exit 1
fi