# Git Workflow Guide

## Simplified Git Workflow

The git workflow has been streamlined with automated hooks for efficiency:

### Pre-Commit (Automatic - Fast)

When you run `git commit`, the pre-commit hook automatically:

- Runs ESLint with auto-fix on staged files
- Runs Prettier to format staged files
- Takes only a few seconds

### Pre-Push (Automatic - Comprehensive)

When you run `git push`, the pre-push hook automatically:

- Runs TypeScript type checking
- Runs all tests
- Verifies code formatting
- Takes 30-60 seconds

### Quick Commands

```bash
# Make your changes
git add .
git commit -m "Your descriptive commit message"  # Pre-commit hook runs automatically
git push origin develop                          # Pre-push hook runs automatically
```

### If Hooks Fail

**Pre-commit failures**: The changes are auto-fixed. Review them and commit again:

```bash
git add .
git commit -m "Your message"
```

**Pre-push failures**: Fix the issues before pushing:

```bash
# For TypeScript errors
npm run build

# For test failures
npm test

# For format issues
npm run format
```

### Manual Validation (Optional)

If you want to manually run all checks before committing:

```bash
./scripts/pre-commit-check.sh
```

This runs a comprehensive check similar to CI/CD.

For detailed explanation, see the "Pre-Commit Checklist" section in CLAUDE.md.

## Git Workflow Rules

**CRITICAL**: These rules MUST be followed at all times:

### Branch Management

- **NEVER push directly to main branch**
- **ALWAYS work in the develop branch** unless explicitly instructed otherwise
- **Production deployments** only happen via merging develop → main
- **Default branch**: Always use `develop` for all changes

### Commit Workflow

1. Make changes in develop branch
2. Run pre-commit checklist (all 9 steps above IN ORDER)
3. Only merge to main when explicitly requested by user

### Quick Reference Commands

```bash
# Switch to develop branch
git checkout develop

# Check current branch
git branch

# Stage all changes
git add .

# Commit with message
git commit -m "Your commit message"

# Push to develop
git push origin develop
```

## CI Simulation

Before pushing, you can simulate the entire CI pipeline locally:

```bash
./scripts/ci-local.sh
```

This runs all CI jobs in parallel (just like GitHub Actions) and shows you exactly what would fail.

## Pre-Push Validation

Check recent CI status before pushing:

```bash
./scripts/check-ci-status.sh
```

This uses GitHub CLI to check if recent builds have been failing and warns you about potential issues.

## Common CI/CD Failures and Solutions

### Format Check Failure in Infrastructure

**Error**: `Code style issues found in X files. Run Prettier with --write to fix.`

**Cause**: Declaration files (`.d.ts`) were not formatted after build.

**Solution**:

1. Run `npm run build` at root
2. Run `npm run format` at root
3. Run `npm run format:check` at root AND `cd infrastructure && npm run format:check`
4. Commit the formatted `.d.ts` files

---

**Remember**: Following this workflow ensures code quality, prevents CI/CD failures, and maintains a stable production environment.
