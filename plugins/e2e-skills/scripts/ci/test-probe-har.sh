#!/usr/bin/env bash
# Regression guard for pw-prove's RECORD_HAR contract (ADR 0011).
#
# pw-prove sells HAR-first mocking: the recon pass records an API-scoped HAR and the deliverable
# spec replays it via routeFromHAR. That whole rule was unreachable for every run — probe.mjs's
# shutdown closed the browser without closing the CONTEXT, and Playwright flushes a recordHar on
# context close, so the probe reported a clean recon and wrote no file. The agent then hand-wrote
# the mocks the HAR was supposed to eliminate. A silent no-op behind a documented flag.
#
# Proving the real flush needs a browser this repo does not carry, so the CI-provable half is
# structural: the ordering inside shutdown(), and the warning that fires when no HAR lands. The
# live half is verified against a real app in testbed/ (see ADR 0011 for the recorded run).
#
# probe.mjs is duplicated per skill; only pw-prove's copy supports RECORD_HAR. PTG's copy is
# deliberately out of scope here — asserting the contract on a script that never claimed it would
# be a test that passes for the wrong reason.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1
P="skills/pw-prove/scripts/probe.mjs"

pass=0; fail=0
ok()  { echo "  [PASS] $1"; pass=$((pass + 1)); }
bad() { echo "  [FAIL] $1"; fail=$((fail + 1)); }

W=$(mktemp -d); trap 'rm -rf "$W"' EXIT

echo "-- probe RECORD_HAR: the flush ordering --"

# Everything between `const shutdown = async` and the line that closes the arrow function.
# Comment lines are stripped first: the fix carries a `// ... browser.close() alone ...` rationale
# comment, and matching it would compare prose against code.
awk '/const shutdown = async/{f=1} f && !/^ *\/\//{print} f && /^    };$/{exit}' "$P" > "$W/shutdown.txt"
if [ ! -s "$W/shutdown.txt" ]; then
  bad "could not locate shutdown() in $P — the guard cannot run (did the function get renamed?)"
else
  c_line=$(grep -n 'context\.close()' "$W/shutdown.txt" | head -1 | cut -d: -f1)
  b_line=$(grep -n 'browser\.close()' "$W/shutdown.txt" | head -1 | cut -d: -f1)
  if [ -n "$c_line" ] && [ -n "$b_line" ] && [ "$c_line" -lt "$b_line" ]; then
    ok "shutdown awaits context.close() BEFORE browser.close() (recordHar flushes on context close)"
  else
    bad "shutdown must await context.close() before browser.close() — RECORD_HAR writes nothing otherwise (context:${c_line:-missing} browser:${b_line:-missing})"
  fi
fi

echo ""
echo "-- probe RECORD_HAR: a missing HAR is loud, never a clean recon --"

if grep -q 'RECORD_HAR was set but no HAR landed' "$P"; then
  ok "close warns when RECORD_HAR was set but no file landed"
else
  bad "close must warn when RECORD_HAR was set but no file landed — a silent miss reads as success"
fi
if grep -q 'Do NOT' "$P" && grep -q 'routeFromHAR spec against a HAR that does not exist' "$P"; then
  ok "the warning names the consequence (do not commit routeFromHAR against a missing HAR)"
else
  bad "the warning must name the consequence, not just report a missing file"
fi
if grep -q 'HAR written' "$P"; then
  ok "the success path prints the byte count, so 'recorded' is falsifiable"
else
  bad "a successful HAR write must report its size — an empty HAR is not a recorded HAR"
fi

echo ""
echo "  probe HAR: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
