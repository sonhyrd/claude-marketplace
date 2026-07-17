#!/usr/bin/env bash
# Golden check for the scanner's Tier-3 net: run scan.mjs over the fixture corpus (one deliberate
# instance of every check, plus a JUSTIFIED twin for each) and require the output not to move.
#
# This is what proved the shell-to-Node port — the shell scanner generated golden.txt and the Node
# one had to reproduce it byte for byte. It outlives the port as the regression net: change a
# pattern, and this tells you exactly which of the 25 checks you moved.
#
# Refresh the golden deliberately, never reflexively:  bash scripts/ci/test-corpus.sh --update
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1

CORPUS="tests/pattern-corpus/evals/files"
GOLDEN="tests/pattern-corpus/golden.txt"
UPDATE=0
[ "${1:-}" = "--update" ] && UPDATE=1

fail() { echo "test-corpus: $1" >&2; exit 1; }

# Three things are normalized away, and only three.
#
# 1. The Tier-1/Tier-2 PREAMBLE is dropped: everything before the Tier-3 header. Those lines report
#    which engines the HOST has (npx present? ast-grep on PATH?), so pinning them would make this
#    check fail on a machine that merely has different tools installed, which says nothing about the
#    patterns. Tier 2 is structurally blind inside an evals/files tree anyway — its rules carry a
#    hard-coded `ignores: '**/evals/files/**'` — so it contributes 0 AST hits on every host, and the
#    Summary line (which is kept) still pins that 0. This check is about Tier 3, where all 25 checks
#    live; the repo self-scan in ci-local.sh is what exercises Tiers 1 and 2.
#
# 2. Hit order WITHIN a block: ripgrep traverses directories in parallel, so the order of files
#    inside one check's block is not stable run to run (observed: ~1 run in 45). The SET of hits is
#    the contract, not the order rg happened to emit them in. Sort each run of indented lines.
#
# 3. The trailing PTG_RUN run-ledger line (issue #5) is dropped: its duration_ms varies every run,
#    and the run-ledger smoke (test-run-ledger.sh) is where that contract is asserted — pinning it
#    here would say nothing about the patterns.
#
# Everything else — block order, headers, hit counts, the Summary line — is compared verbatim.
normalize() {
  awk '
    /^PTG_RUN / { next }
    function flush(  i, j, t) {
      for (i = 1; i < n; i++) {
        t = buf[i]
        for (j = i - 1; j >= 0 && buf[j] > t; j--) buf[j + 1] = buf[j]
        buf[j + 1] = t
      }
      for (i = 0; i < n; i++) print buf[i]
      n = 0
    }
    /^--- Tier 3:/ { started = 1 }
    !started { next }
    /^  / { buf[n++] = $0; next }
    { flush(); print }
    END { flush() }
  '
}

scan() {
  E2E_SMELL_NO_ESLINT_DOWNLOAD=1 E2E_SMELL_NO_AST_GREP_DOWNLOAD=1 E2E_SMELL_FAIL_ON="$1" \
    node skills/e2e-reviewer/scripts/scan.mjs "$CORPUS" 2>/dev/null
}

actual=$(scan none)
rc=$?
[ "$rc" -eq 0 ] || fail "scan.mjs exited $rc under E2E_SMELL_FAIL_ON=none (expected 0)"

if [ "$UPDATE" = "1" ]; then
  printf '%s\n' "$actual" | normalize > "$GOLDEN"
  echo "test-corpus: golden refreshed -> $GOLDEN"
  exit 0
fi

[ -f "$GOLDEN" ] || fail "missing $GOLDEN — regenerate with: bash scripts/ci/test-corpus.sh --update"

if ! diff -u "$GOLDEN" <(printf '%s\n' "$actual" | normalize); then
  fail "scanner output moved against the golden (diff above).
  A pattern changed behavior. If that was deliberate, re-read the diff, then:
    bash scripts/ci/test-corpus.sh --update"
fi

# The possessive quantifier in #15 (`expect\(\s*+(?!await\b)`) is the one check that can silently
# INVERT: rewrite `\s*+` as `\s*` and the engine backtracks into the whitespace, the lookahead lands
# on ` await` instead of `await`, and correctly-classified lines start reporting under the BASE #15
# block. The golden above would catch it as a count change — this catches it by NAME, so the next
# person to touch #15 gets told what they broke rather than just that something moved.
# Anchor on the digit that opens the hit count: the BASE block's header ends "...expect (1 hit)",
# the variant's ends "...expect (awaited locator) (3 hits)". Matching a bare "expect (" would catch
# both and the check would always trip.
base15=$(printf '%s\n' "$actual" | awk '
  /^\[P0\] #15 Missing await on Playwright expect \([0-9]/ { inblock = 1; next }
  /^\[/ { inblock = 0 }
  inblock && /^  / { print }
')
if printf '%s\n' "$base15" | grep -q 'backtracking-trap'; then
  fail "#15 lost its possessive quantifier — backtracking-trap.spec.ts is being reported under the
  BASE '#15 Missing await on Playwright expect' block. Those lines carry a misplaced await INSIDE
  expect() and belong to the 'awaited locator' variant. Restore \`\\s*+\` in the #15 pattern."
fi

# The corpus is full of deliberate P0s, so the p0 gate must trip on it. A scanner that reports hits
# but exits 0 is the exact silent-always-pass failure this whole skill exists to catch.
scan p0 >/dev/null
[ "$?" -eq 1 ] || fail "E2E_SMELL_FAIL_ON=p0 did not exit 1 over a corpus full of P0 hits"

echo "  corpus golden matches; 25/25 checks fire; #15 keeps its possessive quantifier"
