# Agent Operating Rules — Aura28

## Purpose

Ship Jira/issue-scoped changes safely and predictably so CI stays green and deploys are never blocked.

## Golden Path (must run before any commit/push)

```bash
npm ci          # install & auto-install Husky
npm run fix     # auto-format + lint-fix
npm run verify  # read-only checks; must exit 0
```

**Only commit/push if `npm run verify` succeeds.**

If it fails and you can't resolve quickly, open a Draft PR titled `WIP: needs help` and include failing logs.

## Scripts (don't change these without approval)

- **fix**: `prettier --write .` → `eslint --fix infrastructure/**/*.ts` → `eslint --fix "frontend/**/*.{ts,tsx}"`

- **verify**: `prettier --check .` → `eslint infrastructure/**/*.ts` → `eslint "frontend/**/*.{ts,tsx}" --max-warnings=0` → `tsc --noEmit`

**Policy**: In `infrastructure/lambda/**`, `console.info|warn|error` are allowed (CloudWatch logging). `console.log` may warn; avoid it. Frontend remains strict.

## Scope & Source of Truth

- Implement only the ticket/issue acceptance criteria.
- Do not add routes, components, or infrastructure beyond the approved scope.
- Ask questions only if essential information is missing.

## Planning

Before coding, present a brief plan for approval (a bulleted summary in the chat/PR description is fine).

Include:

- File-level changes
- Tests to add/update
- A "Done When" checklist mapped to acceptance criteria

## Implementation Rules

- Implement exactly the approved plan—no side quests.
- Keep diffs small and focused. If work grows, prefer stacked PRs with a clear order.
- Do not add dependencies unless strictly required and explicitly justified.
- No directory renames, package-manager changes, or CI edits unless requested by the ticket and approved.

## Tooling & Environment

- **Node 20**, **npm**. Use the existing repo layout and CI as-is.
- Husky pre-commit is repo-local and auto-installed via `npm ci`. Do not bypass hooks.
- If working in a fresh VM without hooks, the Golden Path above is mandatory before any commit/push.

## Commits & PRs

- **Conventional Commits** preferred.
- Reference the Jira key if available; otherwise reference the GitHub issue or a concise description.
- Open PRs from a feature branch (do not push to main/develop directly).

### PR must include:

1. Summary of changes
2. Acceptance-criteria checklist with statuses
3. Test notes (what changed, how to run)
4. Rollback plan (revert/flag/infra rollback steps)

## Guardrails (CI alignment)

- CI runs a verify job mirroring `npm run verify`. Your branch must pass it.
- Do not modify ESLint/Prettier/TS configs or GitHub Actions without explicit approval.

## Safety

- No secrets in logs.
- Keep changes minimal and targeted; fix root causes without unrelated refactors.

## When things go wrong

- If local verify fails and the fix isn't trivial: open a Draft PR with logs, label `needs-help`, and stop.
- If CI fails on the PR: reproduce locally with `npm run verify`, then push only when green.
