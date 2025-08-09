#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")"/.. && pwd)
cd "$root_dir"

echo "[guardrails] Installing dependencies (npm ci at root)"
npm ci

echo "[guardrails] Linting all workspaces"
npm run lint

echo "[guardrails] Typechecking frontend (no emit)"
npx -w frontend tsc -p tsconfig.json --noEmit

echo "[guardrails] Typechecking infrastructure (no emit)"
npx -w infrastructure tsc --noEmit

echo "[guardrails] Running tests across workspaces"
npm run test

echo "[guardrails] OK: lint, typecheck, and tests passed"

