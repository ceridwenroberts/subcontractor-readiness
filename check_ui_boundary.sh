#!/usr/bin/env bash
# Run on a UI redesign branch, from the project root:  ./check_ui_boundary.sh [base-ref]
# Default base is "main". Exits non-zero if the redesign touched the protected logic layer,
# broke a UI rule, or removed a required element. Run ./check.sh as well before merging.
# See docs/ui-handoff.md.
set -uo pipefail

cd "$(dirname "$0")"
BASE="${1:-main}"
failed=0

fail() { printf '  FAIL: %s\n' "$1"; failed=1; }
step() { printf '\n== %s\n' "$1"; }

if ! git rev-parse --verify --quiet "$BASE" >/dev/null; then
  echo "Base ref '$BASE' not found. Usage: ./check_ui_boundary.sh [base-ref]"
  exit 2
fi

# 1. The logic layer must not change on a UI branch.
step "protected files unchanged (vs $BASE)"
PROTECTED='^(backend/|templates/|evals/|frontend/lib/|frontend/package(-lock)?\.json$|check\.sh$|check_ui_boundary\.sh$|CLAUDE\.md$|PLAN\.md$)'
changed=$(
  {
    git diff --name-only "$BASE"...HEAD
    git diff --name-only HEAD
    git ls-files --others --exclude-standard
  } 2>/dev/null | sort -u
)
touched=$(printf '%s\n' "$changed" | grep -E "$PROTECTED" || true)
if [ -n "$touched" ]; then
  printf '%s\n' "$touched" | sed 's/^/  /'
  fail "protected files changed. Revert them, or make the change as a normal slice (not in a UI redesign)."
else
  echo "  ok"
fi

UI_DIRS=(frontend/app frontend/components)
GREP_OPTS=(-rn --include='*.ts' --include='*.tsx')

# 2. Things the UI must never do.
step "forbidden patterns in the UI"
forbid() { # description, extended regex
  local hits
  hits=$(grep "${GREP_OPTS[@]}" -E "$2" "${UI_DIRS[@]}" 2>/dev/null || true)
  if [ -n "$hits" ]; then
    printf '%s\n' "$hits" | sed 's/^/  /'
    fail "$1"
  fi
}
forbid "call the backend only through frontend/lib/api.ts (no fetch in the UI)" '\bfetch\('
forbid "no browser storage or cookies in the UI (the sign-in token lives in lib/token.ts)" 'localStorage|sessionStorage|document\.cookie'
forbid "never render document text as HTML" 'dangerouslySetInnerHTML'
forbid "no NEXT_PUBLIC_ values in the UI" 'NEXT_PUBLIC_'
forbid "no 'any' in TypeScript" '(:\s*any\b|\bas any\b|<any>)'
words=$(grep "${GREP_OPTS[@]}" -iwE 'approved|compliant|qualified|pass|passed|fail|failed|score' "${UI_DIRS[@]}" 2>/dev/null || true)
if [ -n "$words" ]; then
  printf '%s\n' "$words" | sed 's/^/  /'
  fail "verdict words are banned in the UI (report what the documents show, never a verdict or score)"
fi
[ "$failed" -eq 0 ] && echo "  ok"

# 3. Elements the product rules require.
step "required elements present"
need() { # file, fixed string, why
  if [ ! -f "$1" ] || ! grep -qF -- "$2" "$1"; then
    fail "$1 must still contain '$2' ($3)"
  fi
}
FIND=frontend/components/FindingCard.tsx
ENG='frontend/app/engagements/[engagementId]/page.tsx'
need "$FIND" 'provider_label' "provider label on every finding"
need "$FIND" 'evaluateDecision' "decision rules come from lib/decisionForm.ts"
need "$FIND" 'buildDecision' "decision payload comes from lib/decisionForm.ts"
need "$FIND" 'latest_request' "new upload request panel"
need "$FIND" 'viewerPath' "link from a quote to the document viewer"
need "$ENG" 'DISCLAIMER' "disclaimer on the engagement page"
need "$ENG" 'PlaceholderBanner' "placeholder-template banner"
need "$ENG" 'OverdueBanner' "deletion-date overdue banner"
need "$ENG" 'HowItWasMade' "model details, kept quiet"
need "$ENG" 'assessEngagementStream' "assessment with progress"
need "$ENG" 'FindingCard' "findings list"
need 'frontend/app/projects/[projectId]/page.tsx' 'PlaceholderBanner' "placeholder-template banner"
need 'frontend/app/projects/[projectId]/page.tsx' 'OverdueBanner' "deletion-date overdue banner"
need 'frontend/app/engagements/[engagementId]/summary/page.tsx' 'summary.disclaimer' "disclaimer on the summary"
need 'frontend/app/page.tsx' 'listOpenRequests' "needs-a-new-upload table"
need 'frontend/app/page.tsx' 'PlaceholderBanner' "placeholder-template banner"
need 'frontend/app/documents/[documentId]/page.tsx' 'findQuoteRange' "quote highlight"
need 'frontend/app/documents/[documentId]/page.tsx' 'documentFileUrl' "link to the original PDF"
need frontend/components/SessionBar.tsx 'Simulated' "the sign-in is labelled Simulated"
need frontend/components/HowItWasMade.tsx 'WHO_TEXT.scripted' "Simulated notice for the scripted provider"
[ "$failed" -eq 0 ] && echo "  ok"

echo
if [ "$failed" -eq 0 ]; then
  echo "UI boundary check passed."
else
  echo "UI boundary check FAILED." >&2
  exit 1
fi
