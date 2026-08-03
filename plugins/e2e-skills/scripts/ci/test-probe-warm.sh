#!/usr/bin/env bash
# Regression guard for pw-prove's Step-7 warm lead (ADR 0013).
#
# ADR 0007 wrote the warm lead to stop the clip opening on a cold build; implemented as a `curl` it
# warmed the HTML document and nothing else, so a Vite-family app still paid ~25s of dep
# pre-bundling INSIDE the recording (Playwright video is context-scoped — recording starts at
# context creation, and there is no delayed start and no trim). ADR 0013 made the warm a real
# browser load from a separate, unfilmed process: `probe.mjs warm <url>`.
#
# The contract this guard freezes is the EXIT CODE surface, because the SKILL's fallback chain is
# written against it — `probe.mjs warm … || curl … || echo warm-failed`:
#
#   exit 1  usage error (no url, or a relative url with no BASE_URL)
#   exit 2  browserless — the ONLY code that must fall through to the curl
#   exit 0  the browser reached the server, whether or not the navigation landed. A warm miss is
#           REPORTED, never fatal, and must NOT trigger the curl: curl cannot warm what the browser
#           just failed to warm, and a warm that costs the run a failure is worse than a slow clip.
#
# The live half — that a browser warm actually removes the boot from the film — is verified against
# a real app, the same split ADR 0011's guard uses. What is provable without a browser is that the
# refusal codes still say what the fallback chain reads them as saying.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1
P="$REPO_ROOT/skills/pw-prove/scripts/probe.mjs"

pass=0; fail=0
ok()  { echo "  [PASS] $1"; pass=$((pass + 1)); }
bad() { echo "  [FAIL] $1"; fail=$((fail + 1)); }

# A directory with a package.json and NO node_modules is a browserless environment by construction —
# createRequire finds no playwright to resolve. Never run these from the repo root.
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
echo '{"name":"warm-guard","private":true}' > "$W/package.json"

run_exit() { (cd "$W" && env PWPROVE_LEDGER="$W/ledger.jsonl" node "$P" "$@" >"$W/out" 2>&1); echo $?; }

echo "-- probe warm: the exit-code surface the SKILL fallback chain reads --"

code=$(run_exit warm)
if [ "$code" -eq 1 ]; then ok "warm with no url exits 1 (usage), not 2 — a typo must not read as browserless"
else bad "warm with no url must exit 1, got $code"; fi

code=$(run_exit warm /people)
if [ "$code" -eq 1 ]; then ok "a relative url with no BASE_URL exits 1 rather than warming the wrong origin"
else bad "relative url without BASE_URL must exit 1, got $code"; fi

code=$(run_exit warm http://127.0.0.1:1/x)
if [ "$code" -eq 2 ]; then ok "browserless exits 2 — the one code that falls through to the curl warm"
else bad "browserless must exit 2 so the curl fallback fires, got $code"; fi

if grep -q 'Fall back to the curl warm' "$P"; then
  ok "the browserless refusal names the fallback, so the operator is not left guessing"
else
  bad "the browserless refusal must name the curl fallback"
fi

echo ""
echo "-- probe warm: a warm miss is reported, never fatal --"

# `warm-failed:` is the token the SKILL reports as `warm miss, clips are boot-heavy`. It is printed
# on stdout (not stderr) and paired with a zero exit, so the || chain does NOT reach for the curl.
if grep -q 'warm-failed: ' "$P"; then
  ok "a navigation failure prints a warm-failed: line the report can quote"
else
  bad "a navigation failure must print warm-failed: — a silent miss reads as a warm clip"
fi
# The warm block alone — from its `if (MODE === 'warm')` to the daemon banner that follows it.
# Unbounded, the greps below would run into the daemon's recordHar/storageState and fail for the
# wrong reason.
awk '/^if \(MODE === .warm.\) \{/{f=1} /^\/\/ =+ daemon \(start\)/{f=0} f' "$P" > "$W/warm.js"
if [ ! -s "$W/warm.js" ]; then
  bad "could not locate the warm block in $P — the guard cannot run (did the mode get renamed?)"
else
  if grep 'process\.exit' "$W/warm.js" | grep -qvE 'exit\((1|2)\)'; then
    bad "warm must not exit non-zero outside usage (1) and browserless (2)"
  else
    ok "warm adds no third failure exit — the proof run never dies of a cold cache"
  fi
fi

echo ""
echo "-- probe warm: it is unfilmed, and the ledger can price it --"

if grep -q "process.argv\[2\] === 'warm' ? 'warm' : 'recon'" "$P"; then
  ok "the run ledger records warm as its own phase (what did the warm lead cost?)"
else
  bad "warm must be its own ledger phase, else its cost is invisible in ~/.ptg/ledger.jsonl"
fi
if grep -qE 'recordVideo|recordHar|storageState' "$W/warm.js"; then
  bad "warm must record nothing — no video, no HAR, no storageState; it leaves server cache only"
else
  ok "warm records nothing: no video, no HAR, no storageState"
fi

echo ""
echo "  probe warm: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
