#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <JIRA_KEY>" >&2
  exit 2
fi

JIRA_KEY="$1"
ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")"/.. && pwd)
cd "$ROOT_DIR"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) not found. Please install and run 'gh auth login'." >&2
  exit 3
fi

PLAN_FILE="plan.md"
if [[ ! -f "$PLAN_FILE" ]]; then
  echo "plan.md not found in repo root. Generate it first and commit changes." >&2
  exit 4
fi

# Create a branch name from Jira key and plan title
TITLE=$(sed -n 's/^Title: \(.*\)$/\1/p' "$PLAN_FILE" | head -n1 | tr '[:upper:]' '[:lower:]')
SLUG=$(printf '%s' "$TITLE" | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-40)
BRANCH="feat/${JIRA_KEY,,}-${SLUG:-change}"

current_branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$current_branch" != "$BRANCH" ]]; then
  git checkout -b "$BRANCH" 2>/dev/null || git checkout "$BRANCH"
fi

echo "[codex] Committing changes"
git add -A
git commit -m "feat(${JIRA_KEY}): implement plan items" || echo "[codex] Nothing to commit"

echo "[codex] Pushing branch $BRANCH"
git push -u origin "$BRANCH" 2>/dev/null || git push -u origin "$BRANCH"

PR_TITLE="${JIRA_KEY}: ${TITLE:-Update}"

# Build PR body from plan.md sections
PR_BODY=$(cat <<'EOF'
This PR implements the scoped changes for the referenced Jira ticket.

Summary
See plan.md for full context. Key details below.

Acceptance Criteria Checklist
<!-- Copy of Done-When Checklist and acceptance criteria -->
EOF
)

AC=$(awk '/^Done-When Checklist/{flag=1; print; next} /^DO NOT$/{flag=0} flag {print}' "$PLAN_FILE" || true)

echo "[codex] Opening PR via gh"
PR_URL=$(gh pr create --title "$PR_TITLE" --body "$PR_BODY

$AC" --fill 2>/dev/null | tail -n1)
echo "[codex] PR: $PR_URL"

# Optional: Comment on Jira with PR link if creds provided
if [[ -n "${JIRA_SITE:-}" && -n "${JIRA_EMAIL:-}" && -n "${JIRA_API_TOKEN:-}" ]]; then
  echo "[codex] Posting Jira comment"
  SUMMARY="PR opened: $PR_URL"
  curl -fsSL -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
    -H 'Content-Type: application/json' \
    -X POST \
    -d "{\"body\": \"$SUMMARY\"}" \
    "https://$JIRA_SITE.atlassian.net/rest/api/3/issue/$JIRA_KEY/comment" >/dev/null || \
    echo "[codex] Jira comment failed (non-fatal)" >&2
fi

echo "[codex] Done"

