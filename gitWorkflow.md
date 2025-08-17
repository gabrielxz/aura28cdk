# Git Workflow Instructions for git-workflow-executor

## CRITICAL RULES

1. **NEVER commit directly to main branch**
2. **FORBIDDEN**: Any push/commit to main branch
3. **ALLOWED**: develop branch, feature/_ branches, fix/_ branches, chore/\* branches

## PRE-COMMIT VALIDATION STEPS

Execute these steps IN ORDER before any commit:

### Step 1: Check Current Branch

```bash
git branch --show-current
```

- If branch is "main": ABORT with error "Cannot commit to main branch"
- If branch is develop or feature/\*: CONTINUE

### Step 2: Install Dependencies

```bash
npm ci
```

- This ensures Husky hooks are installed

### Step 3: Run Initial Linting Check

```bash
npm run lint
```

- If FAILS: Note the errors and continue (will attempt auto-fix)
- If PASSES: Continue

### Step 4: Run Tests

```bash
npm test
```

- If FAILS: ABORT with error message and test output
- If PASSES: Continue

### Step 5: Run Build

```bash
npm run build
```

- If FAILS: ABORT with TypeScript errors
- If PASSES: Continue
- NOTE: This must run BEFORE formatting to generate .d.ts files

### Step 5a: Lambda Pre-flight Check (if Lambda functions modified)

If any files in `infrastructure/lambda/` were modified:

```bash
cd infrastructure && npx cdk synth -c env=dev --quiet
../scripts/preflight-lambda-check.sh
```

- If FAILS: ABORT with error "Lambda validation failed. Check package integrity and dependencies."
- If PASSES: Continue
- NOTE: This ensures Lambda packages are properly built and dependencies are correct

### Step 6: Auto-Fix Code Issues

```bash
npm run fix
```

- This runs Prettier formatting and ESLint auto-fixes
- May not fix all issues (e.g., no-console warnings need manual intervention)

### Step 6a: Re-Validate Linting

```bash
npm run lint
```

- If FAILS: ABORT with error "Linting still fails after auto-fix. Manual intervention required."
- If PASSES: Continue

### Step 7: Verify Formatting

```bash
npm run format:check
```

- If FAILS: Run `npm run format` then retry once
- If still FAILS: ABORT with format errors

### Step 8: Stage All Changes

```bash
git add .
```

- Stage all changes including formatted files

### Step 9: Review Changes

```bash
git status
git diff --staged
```

- Display for user review

## COMMIT EXECUTION

After all validation steps pass:

### Step 10: Create Commit

```bash
git commit -m "$(cat <<'EOF'
<commit_message>

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Step 11: Verify Commit Success

```bash
git status
```

- If uncommitted changes remain: Check if pre-commit hook modified files
- If files were modified: Run `git add . && git commit --amend --no-edit`

## ERROR HANDLING

### If Any Step Fails

1. Display the exact error message
2. Display which step failed (e.g., "Step 4: Tests failed")
3. If the failure is in steps 3-7, suggest running `npm run fix` manually
4. ABORT the commit process

### Pre-commit Hook Modifications

If files are modified by pre-commit hooks after commit:

1. Stage the modified files: `git add .`
2. Amend the commit: `git commit --amend --no-edit`
3. Maximum retry: 1 time

## BRANCH DETECTION LOGIC

```bash
current_branch=$(git branch --show-current)

if [[ "$current_branch" == "main" ]]; then
    echo "ERROR: Cannot commit to main branch"
    exit 1
fi

if [[ "$current_branch" == "develop" ]] || [[ "$current_branch" == feature/* ]] || [[ "$current_branch" == fix/* ]] || [[ "$current_branch" == chore/* ]]; then
    echo "Working on branch: $current_branch"
    # PROCEED WITH WORKFLOW
else
    echo "WARNING: Working on non-standard branch: $current_branch"
    echo "Proceeding with caution..."
    # PROCEED WITH WORKFLOW
fi
```

## POST-COMMIT ACTIONS

After successful commit:

1. Display commit hash: `git rev-parse HEAD`
2. Display commit message: `git log -1 --pretty=format:"%h %s"`
3. Suggest next action: "Push with: `git push origin <branch_name>`"

## FORBIDDEN OPERATIONS

NEVER execute these commands:

- `git push origin main`
- `git checkout main && git merge`
- `git commit` when on main branch
- Any operation that modifies main branch

## CI/CD ALIGNMENT

These local checks mirror CI/CD pipeline:

- Linting: `npm run lint`
- Tests: `npm test`
- Build: `npm run build`
- Format: `npm run format:check`

If all pass locally, CI/CD will pass.
