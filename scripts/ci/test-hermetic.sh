#!/usr/bin/env bash
# Process-boundary tests for hermetic.mjs — the Step-7 audit that classifies a proof run's traces.
#
# The fixture is a synthesized trace.zip holding a `0-trace.network` JSONL in the shape Playwright
# 1.61 writes (verified against a real run during the ADR-0010 spike). Synthesizing it keeps the
# repo free of a binary fixture AND pins the exact field the classifier keys on: a request the
# browser put on the wire carries `serverIPAddress`; a route.fulfill() response does not.
#
# Skips cleanly when `zip` is absent (the script itself needs only `unzip`).
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1
S="skills/pw-prove/scripts/hermetic.mjs"

pass=0; fail=0
ok()  { echo "  [PASS] $1"; pass=$((pass + 1)); }
bad() { echo "  [FAIL] $1"; fail=$((fail + 1)); }

if ! command -v zip >/dev/null 2>&1 || ! command -v unzip >/dev/null 2>&1; then
  echo "  [SKIP] hermetic: zip/unzip not available"
  exit 0
fi

W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
mkdir -p "$W/test-results/spec-a-chromium"

# One entry per class, exactly as a real trace records them.
cat > "$W/0-trace.network" <<'JSON'
{"type":"resource-snapshot","snapshot":{"_resourceType":"document","serverIPAddress":"127.0.0.1","request":{"url":"http://app.test/en/settings","method":"GET"},"response":{"status":200}}}
{"type":"resource-snapshot","snapshot":{"_resourceType":"fetch","serverIPAddress":"10.0.0.4","request":{"url":"http://api.test/api/v1/current-user?x=1","method":"GET"},"response":{"status":200}}}
{"type":"resource-snapshot","snapshot":{"_resourceType":"fetch","request":{"url":"http://api.test/api/v1/sections/custom_scripts","method":"PUT"},"response":{"status":200}}}
{"type":"resource-snapshot","snapshot":{"_resourceType":"fetch","request":{"url":"http://widget.intercom.io/boot","method":"POST"},"response":{"status":-1,"_failureText":"net::ERR_ABORTED"}}}
JSON
( cd "$W" && zip -q "test-results/spec-a-chromium/trace.zip" 0-trace.network )

cat > "$W/patched.spec.ts" <<'SPEC'
await page.route('**/api/flags**', async (r) => {
  const real = await r.fetch()
  await r.fulfill({ json: { ...(await real.json()), on: true } })
})
const v = await page.evaluate(() => fetch('/api/live').then(r => r.json()))
SPEC
cat > "$W/clean.spec.ts" <<'SPEC'
await page.route('**/api/flags**', r => r.fulfill({ json: { on: true } }))
const v = await page.evaluate(() => fetch('/api/live').then(r => r.json()))
SPEC

run() { ( cd "$W" && PWPROVE_LEDGER="$W/ledger.jsonl" node "$REPO_ROOT/$S" "$@" >"$W/out" 2>"$W/err" ); }
has() { if grep -qF -- "$2" "$W/out"; then ok "$1"; else bad "$1 — output lacks '$2'"; fi; }

echo "-- classification --"
run test-results --spec clean.spec.ts
rc=$?
[ "$rc" = 0 ] && ok "exit 0 on a readable trace" || { bad "exit $rc"; head -3 "$W/err"; }
has "a request with serverIPAddress is LIVE" "GET http://api.test/api/v1/current-user  ×1 [200]"
has "a fulfilled request (no serverIPAddress) is MOCKED" "PUT http://api.test/api/v1/sections/custom_scripts"
has "an aborted request is FAILED, not LIVE" "net::ERR_ABORTED"
has "query strings are stripped — a carve-out is declared against origin+path" "current-user  ×1"
has "document/asset loads are omitted by default" "1 document/asset load(s) omitted"
if grep -q "LIVE — the browser reached the network: 1 distinct" "$W/out"; then
  ok "exactly one LIVE entry (the document load does not count)"
else
  bad "LIVE count wrong: $(grep 'LIVE' "$W/out")"
fi

echo ""
echo "-- the route.fetch blind spot (a trace records the browser, not Playwright) --"
run test-results --spec patched.spec.ts
if grep -q "IN-SPEC LIVE ROUND-TRIPS (route.fetch / request.fetch): 1" "$W/out"; then
  ok "catches a one-letter route param — 'const real = await r.fetch()'"
else
  bad "missed r.fetch(): $(grep 'IN-SPEC' "$W/out")"
fi
run test-results --spec clean.spec.ts
if grep -q "IN-SPEC LIVE ROUND-TRIPS (route.fetch / request.fetch): 0" "$W/out"; then
  ok "false-positive guard: a browser-side fetch() inside page.evaluate is NOT a round-trip"
else
  bad "false positive on page.evaluate fetch: $(grep -A2 'IN-SPEC' "$W/out")"
fi
run test-results
has "no --spec reports the class as UNCHECKED, never as clean" "not checked"

echo ""
echo "-- no traces is a STOP, not an empty pass --"
mkdir -p "$W/empty"
run empty --spec clean.spec.ts
[ "$?" = 2 ] && ok "exit 2 when no trace.zip exists" || bad "expected exit 2 for a traceless dir"
grep -q "trace: 'on'" "$W/err" && ok "STOP names the fix (record traces)" || bad "STOP message lacks the fix"

echo ""
echo "  hermetic: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
