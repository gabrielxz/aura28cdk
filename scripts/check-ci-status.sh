#!/bin/bash

# Check recent CI status from GitHub
# Warns about recent failures and patterns

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get repository info
REPO=$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')

if [ -z "$REPO" ]; then
    echo -e "${RED}Error: Could not determine GitHub repository${NC}"
    exit 1
fi

echo "======================================"
echo "📊 Checking CI Status for $REPO"
echo "======================================"
echo ""

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
    echo -e "${YELLOW}Warning: GitHub CLI (gh) not installed${NC}"
    echo "Install it from: https://cli.github.com/"
    exit 0
fi

# Get current branch
BRANCH=$(git branch --show-current)
echo -e "${BLUE}Current branch:${NC} $BRANCH"
echo ""

# Get recent workflow runs
echo "Recent CI runs on $BRANCH:"
echo ""

# Fetch last 5 runs
RUNS=$(gh run list --repo "$REPO" --branch "$BRANCH" --limit 5 --json conclusion,createdAt,event,headSha,status 2>/dev/null || echo "")

if [ -z "$RUNS" ]; then
    echo -e "${YELLOW}Could not fetch CI status (check GitHub CLI auth)${NC}"
    exit 0
fi

# Parse and display runs
FAILURES=0
TOTAL=0

echo "$RUNS" | jq -r '.[] | "\(.conclusion) \(.createdAt) \(.headSha[0:7])"' | while read -r conclusion created sha; do
    TOTAL=$((TOTAL + 1))
    
    if [ "$conclusion" = "success" ]; then
        echo -e "${GREEN}✓${NC} $sha - $created"
    elif [ "$conclusion" = "failure" ]; then
        echo -e "${RED}✗${NC} $sha - $created"
        FAILURES=$((FAILURES + 1))
    elif [ "$conclusion" = "cancelled" ]; then
        echo -e "${YELLOW}⊘${NC} $sha - $created (cancelled)"
    else
        echo -e "${BLUE}⟳${NC} $sha - $created (in progress)"
    fi
done

# Get failure rate
if [ $TOTAL -gt 0 ]; then
    FAILURE_RATE=$((FAILURES * 100 / TOTAL))
    
    echo ""
    echo "======================================"
    echo "📈 Statistics:"
    echo "  • Recent runs: $TOTAL"
    echo "  • Failures: $FAILURES"
    echo "  • Success rate: $((100 - FAILURE_RATE))%"
    
    if [ $FAILURE_RATE -gt 50 ]; then
        echo ""
        echo -e "${RED}⚠️  HIGH FAILURE RATE DETECTED${NC}"
        echo "More than half of recent CI runs have failed."
        echo ""
        echo "Recommendations:"
        echo "  1. Run './scripts/ci-local.sh' to simulate CI locally"
        echo "  2. Check recent failure logs: gh run view --log-failed"
        echo "  3. Ensure all tests pass locally before pushing"
    elif [ $FAILURES -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}⚠️  Recent failures detected${NC}"
        echo "Some recent CI runs have failed. Consider running:"
        echo "  • ./scripts/pre-commit-check.sh"
        echo "  • ./scripts/ci-local.sh"
    else
        echo ""
        echo -e "${GREEN}✅ CI is healthy!${NC}"
    fi
fi

# Check for uncommitted changes
echo ""
echo "======================================"
echo "Local status:"

if [[ -n $(git status --porcelain) ]]; then
    echo -e "${YELLOW}⚠️  You have uncommitted changes${NC}"
    echo "Run 'git status' to see details"
else
    echo -e "${GREEN}✓${NC} Working directory clean"
fi

# Check if branch is up to date
if git remote show origin | grep -q "local out of date"; then
    echo -e "${YELLOW}⚠️  Your branch is behind origin/$BRANCH${NC}"
    echo "Consider running: git pull origin $BRANCH"
else
    echo -e "${GREEN}✓${NC} Branch is up to date"
fi

echo ""
echo "======================================"
echo "Ready to push? Run './scripts/ci-local.sh' first!"