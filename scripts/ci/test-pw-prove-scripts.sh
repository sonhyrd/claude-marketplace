#!/usr/bin/env bash
# Process-boundary tests for the shipped pw-prove entry points that no other suite reaches:
# preflight.mjs (the Step-3 readiness gate) and probe.mjs's argument/socket contract. The seam is
# the highest one available — spawn the script, assert on the exit code and the bytes it wrote.
#
# Carried over from the retired generator-scripts suite: these cases test behaviour that survives
# verbatim in pw-prove's own copies, and deleting them with the generator would have left
# preflight.mjs exercised by nothing but its usage-error path.
#
# Deliberately no network egress. Port 1 is reserved and never listens; the ready-origin case binds
# a real loopback server so the "up and serving" branch is genuinely taken. The probe cases run in a
# scratch dir with no node_modules anywhere up its tree, so `start` must refuse BEFORE any launch.
# hermetic.mjs, publish-proof.mjs and clips.mjs have their own suites.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1
S="skills/pw-prove/scripts"

pass=0; fail=0
ok()   { echo "  [PASS] $1"; pass=$((pass + 1)); }
bad()  { echo "  [FAIL] $1"; fail=$((fail + 1)); }

W=$(mktemp -d); trap 'rm -rf "$W"' EXIT

# Run a script and assert its exit code (the contract), plus optionally that stderr names its gate.
# usage: expect_exit <want-rc> <name> -- <cmd...>
expect_exit() {
  local want="$1" name="$2"; shift 3
  ( cd "$W" && "$@" >"$W/out" 2>"$W/err" ); local rc=$?
  if [ "$rc" != "$want" ]; then
    bad "$name — exit $rc, wanted $want"; sed 's/^/         /' "$W/err" | head -2; return
  fi
  ok "$name — exit $rc"
}
stderr_has() {
  if grep -qF -- "$2" "$W/err"; then ok "$1"; else bad "$1 — stderr lacks '$2'"; fi
}

echo "-- preflight: three bring-up phases that fail distinctly --"
# The whole point of the phase split is that these three failures are three answers, not one
# not-ready verdict: a missing configuration key (exit 4), a broken build (exit 5) and an absent
# preview server (exit 3). Each case asserts the code AND the diagnostic that goes with it.

# config — a contract declaring a key nobody set. Must fail in seconds and NAME the key, and must
# not reach the build: BUILD_COMMAND here would take a minute and write a marker if it ever ran.
mkdir -p "$W/cfg"
printf '# the app own declared contract\nAPI_BASE_URL=\nTENANT_SLUG=acme\n' >"$W/cfg/.env.example"
start=$(date +%s)
expect_exit 4 "missing required key is a CONFIG failure, not a not-ready verdict" -- \
  env -u API_BASE_URL ENV_CONTRACT="$W/cfg/.env.example" \
      BUILD_COMMAND="touch $W/cfg/BUILD-RAN.marker; sleep 60" \
      BASE_URL=http://127.0.0.1:1 READY_TIMEOUT=2 node "$REPO_ROOT/$S/preflight.mjs"
elapsed=$(( $(date +%s) - start ))
stderr_has "  the failure names the missing key" "API_BASE_URL"
if grep -q '^MISSING_KEYS=API_BASE_URL$' "$W/out" && grep -q '^PHASE_FAILED=config$' "$W/out"; then
  ok "config failure is machine-readable — PHASE_FAILED=config, MISSING_KEYS names the key"
else
  bad "config failure summary — stdout: $(tr '\n' ' ' <"$W/out" | tail -c 160)"
fi
if [ "$elapsed" -le 10 ] && [ ! -e "$W/cfg/BUILD-RAN.marker" ]; then
  ok "config fails in seconds (${elapsed}s) and before the build is paid for"
else
  bad "config phase took ${elapsed}s / build marker present=$([ -e "$W/cfg/BUILD-RAN.marker" ] && echo yes || echo no)"
fi
# A key declared WITH a value declares its own default — it is not required, and must not be flagged.
expect_exit 0 "a declared default (TENANT_SLUG=acme) is not reported missing" -- \
  env API_BASE_URL=http://api.example.test ENV_CONTRACT="$W/cfg/.env.example" \
      node "$REPO_ROOT/$S/preflight.mjs" config
# REQUIRED_ENV is the other declaration form (what recon hands over when the app ships no contract).
expect_exit 4 "REQUIRED_ENV names its own missing keys" -- \
  env -u PWPROVE_FIXTURE_KEY REQUIRED_ENV="PWPROVE_FIXTURE_KEY" node "$REPO_ROOT/$S/preflight.mjs" config
stderr_has "  REQUIRED_ENV failure names the key" "PWPROVE_FIXTURE_KEY"

# build — a non-zero build is a BUILD failure carrying the build's own standard error.
expect_exit 5 "a failing build is a BUILD failure, not a server that never became ready" -- \
  env BUILD_COMMAND='echo "ERR_NUXT_PRERENDER: route /people failed" >&2; exit 2' \
      BASE_URL=http://127.0.0.1:1 READY_TIMEOUT=2 node "$REPO_ROOT/$S/preflight.mjs" build serve
stderr_has "  the build failure carries the build stderr" "ERR_NUXT_PRERENDER: route /people failed"
if grep -q '^PHASE_FAILED=build$' "$W/out" && grep -q '^BUILD_EXIT=2$' "$W/out"; then
  ok "build failure is machine-readable — PHASE_FAILED=build, BUILD_EXIT carries the exit code"
else
  bad "build failure summary — stdout: $(tr '\n' ' ' <"$W/out" | tail -c 160)"
fi

echo ""
echo "-- preflight: dead origin, refused timeout, ready origin --"
# The serve phase is the third distinct outcome: the build passed, so an unreachable origin can only
# be the preview server. Port 1 is reserved and never listens.
expect_exit 3 "a passing build then an unreachable preview is a SERVE failure" -- \
  env BUILD_COMMAND='exit 0' BASE_URL=http://127.0.0.1:1 READY_TIMEOUT=2 \
      node "$REPO_ROOT/$S/preflight.mjs" build serve
if grep -q '^PHASE_FAILED=serve$' "$W/out" && grep -q '^BUILD=ok$' "$W/out"; then
  ok "serve failure is machine-readable — PHASE_FAILED=serve with BUILD=ok above it"
else
  bad "serve failure summary — stdout: $(tr '\n' ' ' <"$W/out" | tail -c 160)"
fi
expect_exit 1 "an unknown phase name is a usage error" -- \
  env BASE_URL=http://127.0.0.1:1 node "$REPO_ROOT/$S/preflight.mjs" rebuild
expect_exit 3 "dead origin STOPs after READY_TIMEOUT" -- \
  env BASE_URL=http://127.0.0.1:1 READY_TIMEOUT=2 node "$REPO_ROOT/$S/preflight.mjs"
# A non-numeric timeout used to spin forever (`waited >= NaN` is never true). It must refuse instead.
expect_exit 1 "non-numeric READY_TIMEOUT is refused, not looped on" -- \
  env BASE_URL=http://127.0.0.1:1 READY_TIMEOUT=abc node "$REPO_ROOT/$S/preflight.mjs"

node -e 'require("http").createServer((q,s)=>{s.writeHead(200);s.end("ok")}).listen(8739,"127.0.0.1")' &
SRV=$!
for _ in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:8739 && break; sleep 0.1; done
( cd "$W" && BASE_URL=http://127.0.0.1:8739 READY_TIMEOUT=10 node "$REPO_ROOT/$S/preflight.mjs" >"$W/out" 2>"$W/err" )
rc=$?
{ kill $SRV && wait $SRV; } 2>/dev/null   # wait, else the shell prints its own "Terminated" line
if [ "$rc" -eq 0 ] && grep -q '^READY=yes$' "$W/out"; then
  ok "ready origin — exit 0 and READY=yes on stdout"
else
  bad "ready origin — exit $rc, stdout: $(head -c 120 "$W/out")"
fi

echo ""
echo "-- probe: browserless refusal + client contract (NO browser in CI) --"
# The refusal is the CI-provable half of the probe contract: $W has no node_modules anywhere up its
# tree, so `start` must refuse cleanly (exit 2) BEFORE any launch attempt — never boot a browser,
# never hang. The batched-command happy path needs a real app + browser and is verified manually.
expect_exit 1 "no subcommand is a usage error" -- \
  node "$REPO_ROOT/$S/probe.mjs"
expect_exit 2 "browserless env: start refuses cleanly (no pinned Playwright from cwd)" -- \
  node "$REPO_ROOT/$S/probe.mjs" start
stderr_has "  refusal names the pinned-Playwright requirement" "pinned Playwright"
expect_exit 3 "send with no daemon listening at the socket" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" send '[{"cmd":"snapshot"}]'
expect_exit 3 "close with no daemon listening at the socket" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" close
expect_exit 1 "unparsable batch is a usage error (checked before connecting)" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" send 'not json'
expect_exit 1 "batch must be a JSON ARRAY of {cmd} objects" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" send '{"cmd":"snapshot"}'

echo ""
echo "  pw-prove scripts: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
