Agent Operating Rules for Aura28

Purpose

- Provide a repeatable, safe workflow to implement Jira-scoped changes, pass guardrails, and open PRs without scope creep.

Scope & Source of Truth

- Implement only what is in the linked Jira ticket’s acceptance criteria.
- Do not add routes, components, or infrastructure beyond the approved plan.
- Ask questions only if Jira lacks essential information; do not re-ask what’s already stated.

Tooling & Environment

- Use existing package manager and Node version: npm with Node 20 (as in CI). Do not switch tools or package manager.
- Use current repo layout and CI as-is; no renames or structural changes unless required by the ticket and approved in the plan.

Planning

- For each Jira ticket, draft plan.md from the template, listing explicit file-level changes and reasons.
- Include tests to add/update and a Done-When checklist mapped to acceptance criteria.
- Keep diffs small; if a change exceeds ~300 lines, propose stacked PRs with clear dependency order.

Implementation

- Implement exactly what is listed in plan.md’s Approach section—nothing else.
- Do not add dependencies unless strictly required and justified in the plan.
- No directory renames, package manager changes, or CI edits unless demanded by the ticket and explicitly approved.

Guardrails (must pass before PR)

- Install deps → Lint → Typecheck → Tests, failing fast.
- Use the repo’s existing commands and toolchain; do not introduce new tools.

Commits & PRs

- Use Conventional Commits.
- PR must reference the Jira key, and include:
  - Summary of changes.
  - Acceptance-criteria checklist with statuses.
  - Test notes (what was added/updated and how to run).
  - Rollback plan (e.g., revert commit, feature flag off, or infra rollback steps).

Jira & GitHub Integration

- Prefer local edits and branches, then open a PR with GitHub CLI (gh).
- Post a concise Jira comment summarizing changes with a PR link.

Safety

- No secrets in logs.
- Keep changes minimal and targeted; fix root causes without unrelated refactors.
