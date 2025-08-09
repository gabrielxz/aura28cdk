# Git Workflow Guide

## Pre-Commit Checklist

**IMPORTANT**: Before committing or pushing any changes, you MUST complete ALL of the following steps:

### 1. Run formatting

```bash
npm run format  # (at root level)
```

- This ensures all code follows consistent formatting rules
- Prevents CI/CD failures due to formatting issues

### 2. Run linting

```bash
npm run lint  # (at root level)
```

- Catches potential code quality issues
- Ensures TypeScript and ESLint rules are satisfied

### 3. Run tests

```bash
npm test  # (at root level)
```

- Verifies all tests pass
- Prevents breaking existing functionality
- **Important**: Also run `npm run test:frontend` separately to ensure frontend test output is clearly visible

### 4. Build check

```bash
npm run build  # (at root level)
```

- Ensures the project builds successfully
- Catches TypeScript compilation errors

### 5. Verify no untracked files

```bash
git status
```

- Ensure all necessary files are staged
- Check for any accidentally modified files

### 6. Review changes

```bash
git diff --staged
```

- Double-check your changes are intentional
- Look for any debug code or temporary changes

## Git Workflow Rules

**CRITICAL**: These rules MUST be followed at all times:

### Branch Management

- **NEVER push directly to main branch**
- **ALWAYS work in the develop branch** unless explicitly instructed otherwise
- **Production deployments** only happen via merging develop → main
- **Default branch**: Always use `develop` for all changes

### Commit Workflow

1. Make changes in develop branch
2. Run pre-commit checklist (all 6 steps above)
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

---

**Remember**: Following this workflow ensures code quality, prevents CI/CD failures, and maintains a stable production environment.
