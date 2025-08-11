# Git Workflow Guide

## Pre-Commit Checklist

**IMPORTANT**: Before committing or pushing any changes, you MUST complete ALL of the following steps IN THIS EXACT ORDER:

**⚠️ WARNING**: The order of these steps is CRITICAL. Running them out of order will cause CI/CD failures!

### 1. Run linting

```bash
npm run lint  # (at root level)
```

- Catches potential code quality issues early
- Ensures TypeScript and ESLint rules are satisfied
- Run this FIRST to catch issues before other checks

### 2. Run tests

```bash
npm test  # (at root level)
```

- Verifies all tests pass
- Prevents breaking existing functionality
- **Important**: Also run `npm run test:frontend` and `npm run test:infrastructure` separately to ensure test output is clearly visible

### 3. Build check (CRITICAL: Must come BEFORE formatting!)

```bash
npm run build  # (at root level)
```

- Ensures the project builds successfully
- Catches TypeScript compilation errors
- **CRITICAL**: This generates `.d.ts` declaration files that MUST be formatted
- **MUST run BEFORE formatting** to ensure generated files exist

### 4. Run formatting

```bash
npm run format  # (at root level)
```

- Formats all code including newly generated `.d.ts` files from the build
- Ensures consistent code style
- **MUST run AFTER build** to format generated declaration files

### 5. Verify formatting (NEW - CRITICAL STEP!)

```bash
npm run format:check  # (at root level)
```

Then also verify from infrastructure directory:

```bash
cd infrastructure && npm run format:check
```

- **CRITICAL**: Both commands must show "All matched files use Prettier code style!"
- CI/CD runs format:check from the infrastructure directory separately
- If either fails, run `npm run format` again and re-check
- This step prevents CI/CD formatting failures

### 6. Verify no untracked files

```bash
git status
```

- Ensure all necessary files are staged (including formatted `.d.ts` files)
- Check for any accidentally modified files
- Look for any generated files that need to be committed

### 7. Review changes

```bash
git diff --staged
```

- Double-check your changes are intentional
- Look for any debug code or temporary changes
- Verify all formatted files are included

## Why This Order Matters

The build step (step 3) generates TypeScript declaration files (`.d.ts`). These files MUST exist before formatting (step 4) can format them. If you format before building, the CI/CD pipeline will fail because it will find unformatted declaration files.

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
2. Run pre-commit checklist (all 7 steps above IN ORDER)
3. Commit and push to develop
4. Only merge to main when explicitly requested by user

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
