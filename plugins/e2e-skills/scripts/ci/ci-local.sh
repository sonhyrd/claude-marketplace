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
export PWPROVE_LEDGER=/dev/null

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
# The SHIPPED scripts are Node. `node --check` is the safety net the shell versions never had:
# under `set -eu` a typo'd variable name exits 0 having done nothing, where this fails at parse time.
while IFS= read -r file; do
  [ -z "$file" ] && continue
  node --check "$file" || fail "node syntax: $file"
done < <(find skills scripts -name '*.mjs' -type f 2>/dev/null)
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

if [ "${E2E_SKILLS_SKIP_PW_PROVE_SCRIPTS:-}" != "1" ]; then
  step "pw-prove scripts (process boundary)"
  # preflight four-phase bring-up gate + probe argument/socket contract: exit codes and emitted bytes.
  # Binds one loopback server for the ready-origin branch; never touches the network.
  if [ "$QUIET" = "1" ]; then
    bash scripts/ci/test-pw-prove-scripts.sh >/dev/null 2>&1 || fail "test-pw-prove-scripts.sh"
  else
    bash scripts/ci/test-pw-prove-scripts.sh || fail "test-pw-prove-scripts.sh"
  fi
fi

if [ "${E2E_SKILLS_SKIP_HERMETIC_TESTS:-}" != "1" ]; then
  step "Hermetic audit (hermetic.mjs, process boundary)"
  # ADR 0010: trace classification (serverIPAddress = went to the wire) + the route.fetch blind
  # spot. Synthesized trace fixture; skips if zip/unzip are absent; never touches the network.
  if [ "$QUIET" = "1" ]; then
    bash scripts/ci/test-hermetic.sh >/dev/null 2>&1 || fail "test-hermetic.sh"
  else
    bash scripts/ci/test-hermetic.sh || fail "test-hermetic.sh"
  fi
fi

if [ "${E2E_SKILLS_SKIP_PUBLISH_PROOF:-}" != "1" ]; then
  step "Publish proof (publish-proof.mjs, process boundary)"
  # ADR 0012: manifest in, ONE Clips share link out — this replaced the proof-page check when the
  # R2 path was deleted, so there is one publish shape and one check over it. The transport is
  # JSON-RPC to an MCP endpoint, and PW_PROVE_CLIPS_ENDPOINT points that at
  # a throwaway local stub server that captures the request; ffmpeg/ffprobe stay REAL over real
  # synthetic clips, so the chapter offsets and the stream-copy claim are proven against actual
  # files. Skips if ffmpeg is absent; never touches the network.
  if [ "$QUIET" = "1" ]; then
    bash scripts/ci/test-publish-proof.sh >/dev/null 2>&1 || fail "test-publish-proof.sh"
  else
    bash scripts/ci/test-publish-proof.sh || fail "test-publish-proof.sh"
  fi
fi

if [ "${E2E_SKILLS_SKIP_PROBE_HAR:-}" != "1" ]; then
  step "Probe RECORD_HAR contract (probe.mjs, structural)"
  # ADR 0011: recordHar flushes on CONTEXT close, so a shutdown that only closes the browser makes
  # HAR-first mocking a silent no-op. Structural — the live flush needs a browser CI lacks.
  if [ "$QUIET" = "1" ]; then
    bash scripts/ci/test-probe-har.sh >/dev/null 2>&1 || fail "test-probe-har.sh"
  else
    bash scripts/ci/test-probe-har.sh || fail "test-probe-har.sh"
  fi
fi

if [ "${E2E_SKILLS_SKIP_HAR_SCRUB:-}" != "1" ]; then
  step "HAR scrubber (har-scrub.mjs, process boundary)"
  # Issue #36: the documented header-only scrub leaves a bearer in Referer values and token= query
  # parameters, so the positive fixture carries one in both and the residue check must refuse.
  # Also freezes the stable-placeholder and origin-normalisation contracts replay depends on.
  # Synthetic fixtures only; never touches the network.
  if [ "$QUIET" = "1" ]; then
    bash scripts/ci/test-har-scrub.sh >/dev/null 2>&1 || fail "test-har-scrub.sh"
  else
    bash scripts/ci/test-har-scrub.sh || fail "test-har-scrub.sh"
  fi
fi

if [ "${E2E_SKILLS_SKIP_CLIP_FIDELITY:-}" != "1" ]; then
  step "Clip-fidelity audit (clip-fidelity.mjs spec, exit codes)"
  # ADR 0015: the Step-6 gate that the generated spec actually carries the contract — a JUSTIFIED,
  # PW_PROVE_CLIP-gated dwell per test(), and a committed pin whenever the re-derived viewport
  # verdict is `pinned`. SKILL.md Step 6 branches on the exit codes, so those are what is frozen.
  # Text fixtures only; never touches the network.
  if [ "$QUIET" = "1" ]; then
    bash scripts/ci/test-clip-fidelity.sh >/dev/null 2>&1 || fail "test-clip-fidelity.sh"
  else
    bash scripts/ci/test-clip-fidelity.sh || fail "test-clip-fidelity.sh"
  fi
fi

if [ "${E2E_SKILLS_SKIP_RUN_LEDGER:-}" != "1" ]; then
  step "Run-ledger smoke (PWPROVE_RUN contract)"
  # Issue #5: every shipped-script invocation leaves one PWPROVE_RUN {json} record — stdout line plus
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
