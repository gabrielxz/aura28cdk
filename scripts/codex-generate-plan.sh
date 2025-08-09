#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <JIRA_KEY>" >&2
  exit 2
fi

JIRA_KEY="$1"
ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")"/.. && pwd)
TEMPLATE="$ROOT_DIR/.codex/plan.template.md"
OUT_PLAN="$ROOT_DIR/plan.md"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "Template not found: $TEMPLATE" >&2
  exit 3
fi

if [[ -z "${JIRA_SITE:-}" || -z "${JIRA_EMAIL:-}" || -z "${JIRA_API_TOKEN:-}" ]]; then
  echo "Missing Jira env vars. Please export JIRA_SITE, JIRA_EMAIL, JIRA_API_TOKEN." >&2
  exit 4
fi

echo "[codex] Fetching Jira issue $JIRA_KEY from $JIRA_SITE.atlassian.net"
ISSUE_JSON=$(curl -fsSL -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  -H 'Accept: application/json' \
  "https://$JIRA_SITE.atlassian.net/rest/api/3/issue/$JIRA_KEY?fields=summary,description&expand=renderedFields")

issue_summary=$(printf '%s' "$ISSUE_JSON" | jq -r '.fields.summary')
desc_html=$(printf '%s' "$ISSUE_JSON" | jq -r '.renderedFields.description // empty')

# Convert rendered HTML to readable text; keep headings and lists.
rendered_text=$(printf '%s' "$desc_html" \
  | sed -E 's/<[Hh][1-6][^>]*>/\n## /g; s#</[Hh][1-6]>#\n#g' \
  | sed -E 's#<li[^>]*>#- #g; s#</li>#\n#g' \
  | sed -E 's#<br[[:space:]]*/?>#\n#g' \
  | sed -E 's#<p[^>]*>#\n#g; s#</p>#\n#g' \
  | sed -E 's#<[^>]+>##g' \
  | sed -E 's/[\r]+//g' \
  | sed -E '/^\s*$/N;/^\s*$/D')

echo "[codex] Writing plan to $OUT_PLAN"
cp "$TEMPLATE" "$OUT_PLAN"

# Safe in-place replacements even if placeholders contain special chars
perl -0777 -pe "s/\Q<JIRA_KEY>\E/$JIRA_KEY/g; s/\Q<JIRA_SUMMARY>\E/$issue_summary/g" -i "$OUT_PLAN"

# Inject full Jira description (rendered) where placeholder exists
awk -v marker="<INSERT_JIRA_DESCRIPTION_HERE>" -v content="$rendered_text" '
  $0==marker {print content; next} {print}
' "$OUT_PLAN" > "$OUT_PLAN.tmp" && mv "$OUT_PLAN.tmp" "$OUT_PLAN"

echo "[codex] Plan generated. Review and edit plan.md, then proceed."
