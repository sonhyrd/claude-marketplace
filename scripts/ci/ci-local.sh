#!/usr/bin/env bash
# Local mirror of the e2e-skills GitHub Actions checks.

set -uo pipefail

QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || {
  echo "ci-local.sh: cannot resolve repo root" >&2
  exit 1
}
cd "$REPO_ROOT" || {
  echo "ci-local.sh: cannot cd to $REPO_ROOT" >&2
  exit 1
}

if [ "${E2E_SKILLS_SKIP_CI_LOCAL:-}" = "1" ]; then
  echo "ci-local skipped via E2E_SKILLS_SKIP_CI_LOCAL=1" >&2
  exit 0
fi

# CI fixture invocations of the shipped scripts must not pollute the operator's real run ledger
# (~/.ptg/ledger.jsonl). /dev/null is a silent sink; test-run-ledger.sh overrides this per case.
export PTG_LEDGER=/dev/null

step() { [ "$QUIET" = "1" ] || echo "-- $* --"; }
fail() { echo "ci-local: $1 failed" >&2; exit 1; }

step "Shell syntax"
# The repo's own CI/dev scripts stay shell — they never ship to a user and cause no pain.
while IFS= read -r file; do
  [ -z "$file" ] && continue
  bash -n "$file" || fail "shell syntax: $file"
done < <(find scripts -name '*.sh' -type f 2>/dev/null)
[ "$QUIET" = "1" ] || echo "  all shell scripts parse"

step "Node syntax"
# The five SHIPPED scripts are Node. `node --check` is the safety net the shell versions never had:
# under `set -eu` a typo'd variable name exits 0 having done nothing, where this fails at parse time.
while IFS= read -r file; do
  [ -z "$file" ] && continue
  node --check "$file" || fail "node syntax: $file"
done < <(find skills -name '*.mjs' -type f 2>/dev/null)
[ "$QUIET" = "1" ] || echo "  all shipped .mjs scripts parse"

step "Review checks"
if [ "$QUIET" = "1" ]; then
  bash scripts/ci/review.sh --quiet >/dev/null 2>&1 || fail "review.sh"
else
  bash scripts/ci/review.sh || fail "review.sh"
fi

if [ "${E2E_SKILLS_SKIP_PARITY_SMOKE:-}" != "1" ]; then
  step "Pattern parity drift smoke test"
  if [ "$QUIET" = "1" ]; then
    bash scripts/ci/test-parity.sh >/dev/null 2>&1 || fail "test-parity.sh"
  else
    bash scripts/ci/test-parity.sh || fail "test-parity.sh"
  fi
fi

if [ "${E2E_SKILLS_SKIP_CORPUS:-}" != "1" ]; then
  step "Scanner pattern corpus (golden)"
  # One deliberate instance of every Tier-3 check, plus a JUSTIFIED twin for each, plus the
  # possessive-quantifier backtracking trap. Proves all 25 checks still fire and that suppression
  # still suppresses — against a frozen golden, so a changed pattern names itself.
  if [ "$QUIET" = "1" ]; then
    bash scripts/ci/test-corpus.sh >/dev/null 2>&1 || fail "test-corpus.sh"
  else
    bash scripts/ci/test-corpus.sh || fail "test-corpus.sh"
  fi
fi

if [ "${E2E_SKILLS_SKIP_GENERATOR_TESTS:-}" != "1" ]; then
  step "Generator scripts (process boundary)"
  # preflight / host-on-r2 / record: exit codes and emitted bytes. Skips the record cases if ffmpeg
  # is absent; never touches the network.
  if [ "$QUIET" = "1" ]; then
    bash scripts/ci/test-generator-scripts.sh >/dev/null 2>&1 || fail "test-generator-scripts.sh"
  else
    bash scripts/ci/test-generator-scripts.sh || fail "test-generator-scripts.sh"
  fi
fi

if [ "${E2E_SKILLS_SKIP_PROOF_PAGE_TESTS:-}" != "1" ]; then
  step "Proof page (host-proof.mjs, process boundary)"
  # ADR 0009: N clips + one index.html under one key prefix. Shims npx on PATH and captures what
  # WOULD have been uploaded, so the page itself is asserted on; never touches the network.
  if [ "$QUIET" = "1" ]; then
    bash scripts/ci/test-proof-page.sh >/dev/null 2>&1 || fail "test-proof-page.sh"
  else
    bash scripts/ci/test-proof-page.sh || fail "test-proof-page.sh"
  fi
fi

if [ "${E2E_SKILLS_SKIP_RUN_LEDGER:-}" != "1" ]; then
  step "Run-ledger smoke (PTG_RUN contract)"
  # Issue #5: every shipped-script invocation leaves one PTG_RUN {json} record — stdout line plus
  # home-ledger append (env-overridable, write-failure tolerated) — and preflight banners its
  # skill version first.
  if [ "$QUIET" = "1" ]; then
    bash scripts/ci/test-run-ledger.sh >/dev/null 2>&1 || fail "test-run-ledger.sh"
  else
    bash scripts/ci/test-run-ledger.sh || fail "test-run-ledger.sh"
  fi
fi

if [ "${E2E_SKILLS_SKIP_SMELL_SCAN:-}" != "1" ]; then
  step "E2E smell scan"
  # Self-scan checks OUR files' Tier-3 cleanliness. Skip the eslint download tier here:
  # local clones carry gitignored testbed/ trees that Tier 1 would otherwise lint for
  # minutes (watchdog-bounded but slow). The GitHub workflow (no testbed) still runs
  # scan.mjs with Tier 1 enabled, so the eslint path stays CI-exercised.
  if [ "$QUIET" = "1" ]; then
    E2E_SMELL_NO_ESLINT_DOWNLOAD=1 E2E_SMELL_FAIL_ON=p0 node skills/e2e-reviewer/scripts/scan.mjs . >/dev/null 2>&1 || fail "skills/e2e-reviewer/scripts/scan.mjs"
  else
    E2E_SMELL_NO_ESLINT_DOWNLOAD=1 E2E_SMELL_FAIL_ON=p0 node skills/e2e-reviewer/scripts/scan.mjs . || fail "skills/e2e-reviewer/scripts/scan.mjs"
  fi
fi

[ "$QUIET" = "1" ] || {
  echo ""
  echo "========================================"
  echo "  ci-local: all checks passed"
  echo "========================================"
}
exit 0
