#!/usr/bin/env bash
# Run before every commit, from the project root: ./check.sh
# Stops at the first failure and exits non-zero.
set -euo pipefail

cd "$(dirname "$0")"
VENV=backend/.venv/bin

step() { printf '\n== %s\n' "$1"; }
fail() { printf '\nFAILED: %s\n' "$1" >&2; exit 1; }

# 1. Lint
step "ruff"
"$VENV/ruff" check backend/ || fail "ruff"

# 2. Backend tests (exit code 5 = no tests collected; allowed until the first test exists)
step "pytest"
set +e
(cd backend && .venv/bin/python -m pytest -q)
code=$?
set -e
if [ "$code" -eq 5 ]; then
  echo "WARNING: no tests collected yet"
elif [ "$code" -ne 0 ]; then
  fail "pytest (exit code $code)"
fi

# 3. Secret scan: tracked files plus untracked files that are not gitignored
step "secret scan"
patterns=(
  -e 'sk-ant-[A-Za-z0-9_-]{20,}'                           # Anthropic API key
  -e "ANTHROPIC_API_KEY[[:space:]]*=[[:space:]]*['\"]?[A-Za-z0-9_-]{8,}"  # key assigned a value
  -e '-----BEGIN [A-Z ]*PRIVATE KEY-----'                  # private key file
  -e 'AKIA[0-9A-Z]{16}'                                    # AWS access key id
)
if git grep -I -n -E --untracked "${patterns[@]}" -- . ':!check.sh'; then
  fail "possible secret found (see lines above)"
fi
tracked_env=$(git ls-files | grep -E '(^|/)\.env(\..*)?$' | grep -v '\.example$' || true)
if [ -n "$tracked_env" ]; then
  fail "env file tracked by git: $tracked_env"
fi
echo "no secrets found"

# 4. Frontend (only once it exists)
step "frontend"
if [ -f frontend/package.json ]; then
  (cd frontend && npm run lint && npm test) || fail "frontend"
else
  echo "skipped: frontend/ does not exist yet"
fi

# 5. What is about to be committed
step "git status"
git status --short

printf '\nAll checks passed.\n'
