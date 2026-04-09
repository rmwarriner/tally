#!/usr/bin/env bash
# CLI Phase 1 Regression Script
# Usage: bash scripts/cli-regression.sh [--integration]
#
# Layer 1 (unit) runs always.
# Layer 2 (integration) runs only with --integration flag and requires pnpm dev:api.
# Layer 3 (contract) is covered by the integration suite via subprocess tests.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INTEGRATION=false

for arg in "$@"; do
  [[ "$arg" == "--integration" ]] && INTEGRATION=true
done

# ── colours ──────────────────────────────────────────────────────────────────
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
BOLD="\033[1m"
RESET="\033[0m"

pass() { echo -e "${GREEN}✓${RESET} $1"; }
fail() { echo -e "${RED}✗${RESET} $1"; }
info() { echo -e "${YELLOW}→${RESET} $1"; }
header() { echo -e "\n${BOLD}$1${RESET}"; }

FAILURES=0

run_or_fail() {
  local label="$1"; shift
  if "$@"; then
    pass "$label"
  else
    fail "$label"
    FAILURES=$((FAILURES + 1))
  fi
}

# ── Layer 1: Typecheck ────────────────────────────────────────────────────────
header "Layer 0 — Typecheck"
run_or_fail "tally-cli typechecks" pnpm --filter @tally-cli/app typecheck

# ── Layer 1: Unit tests ───────────────────────────────────────────────────────
header "Layer 1 — Unit Tests (config, api-client, output, period)"
run_or_fail "unit tests pass" pnpm vitest run tally-cli/src/lib

# ── Layer 2: Integration tests ────────────────────────────────────────────────
if [[ "$INTEGRATION" == "true" ]]; then
  header "Layer 2 — Integration Tests (requires pnpm dev:api)"

  API_URL="${TALLY_API_URL:-http://localhost:3000}"
  info "Checking API at $API_URL/healthz ..."

  if ! curl -sf "$API_URL/healthz" > /dev/null 2>&1; then
    fail "Dev API not reachable at $API_URL — run pnpm dev:api first"
    FAILURES=$((FAILURES + 1))
  else
    pass "API is reachable"

    if [[ -z "${TALLY_TOKEN:-}" ]]; then
      info "TALLY_TOKEN not set — integration tests will use default 'dev-token'"
    fi

    if [[ -z "${TALLY_BOOK:-}" ]]; then
      info "TALLY_BOOK not set — integration tests will use TEST_BOOK_ID if available"
    fi

    run_or_fail "integration tests pass" pnpm --filter @tally-cli/app test:integration
  fi
else
  info "Skipping integration tests (pass --integration to run them)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
header "Summary"
if [[ "$FAILURES" -eq 0 ]]; then
  pass "All checks passed"
  exit 0
else
  fail "$FAILURES check(s) failed"
  exit 1
fi
