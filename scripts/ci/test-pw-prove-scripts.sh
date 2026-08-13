#!/usr/bin/env bash
# Process-boundary tests for the shipped pw-prove entry points that no other suite reaches:
# preflight.mjs (the Step-3 three-phase bring-up gate) and probe.mjs's argument/socket contract. The seam is
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

# There is no unbuilt fallback: asking for the build phase without a command is a refusal, not a
# quiet skip that would let a run prove whatever server happened to be listening.
expect_exit 1 "the build phase refuses to be skipped when no BUILD_COMMAND is given" -- \
  env -u BUILD_COMMAND node "$REPO_ROOT/$S/preflight.mjs" build
stderr_has "  the refusal names the built proof target" "BUILT application"
# A build that never exits is a build failure, reported as one, with the timeout named.
expect_exit 5 "a build that outruns BUILD_TIMEOUT is a BUILD failure" -- \
  env BUILD_COMMAND='sleep 30' BUILD_TIMEOUT=2 node "$REPO_ROOT/$S/preflight.mjs" build
if grep -q '^BUILD_EXIT=timeout$' "$W/out"; then ok "a timed-out build says so — BUILD_EXIT=timeout"; else bad "timed-out build summary — $(tr '\n' ' ' <"$W/out" | tail -c 120)"; fi
# The app's dotenv files are ITS files. Resolving them against the caller's cwd made a key the app
# itself supplies read as missing — a false stop, in the phase that exists to prevent misdiagnosis.
mkdir -p "$W/monorepo/apps/web"
printf 'API_BASE_URL=\n' >"$W/monorepo/apps/web/.env.example"
printf 'API_BASE_URL=http://api.internal\n' >"$W/monorepo/apps/web/.env"
expect_exit 0 "a key supplied by the app's own .env satisfies the contract (APP_ROOT, not cwd)" -- \
  env -u API_BASE_URL APP_ROOT="$W/monorepo/apps/web" ENV_CONTRACT=.env.example \
      node "$REPO_ROOT/$S/preflight.mjs" config
# Nothing declared must not read as a pass: the check did not happen, and the output says which.
( cd "$W" && env -u API_BASE_URL -u REQUIRED_ENV -u ENV_CONTRACT node "$REPO_ROOT/$S/preflight.mjs" config >"$W/out" 2>"$W/err" )
if grep -q '^CONFIG=undeclared$' "$W/out" && grep -qF 'no configuration contract declared' "$W/err"; then
  ok "an undeclared contract reports CONFIG=undeclared, not CONFIG=ok"
else
  bad "undeclared contract — stdout: $(tr '\n' ' ' <"$W/out" | tail -c 120)"
fi

echo ""
echo "-- preflight: the built output is reused while the commit and tree stand still --"
# A build costs 104-201s. Paid once per proof it IS the cost of the built proof target; paid once per
# batch it rounds to nothing, which is how the fastest observed session finished in twelve minutes.
# Every case below asserts BOTH halves of the contract: whether the build command actually ran, and
# whether the run SAID which it did — an operator must be able to see whether a build was paid.
R="$W/reuse"
mkdir -p "$R"
git -C "$R" init -q
git -C "$R" config user.email pwprove@example.test
git -C "$R" config user.name pw-prove
printf 'v1\n' >"$R/src.txt"
git -C "$R" add -A >/dev/null && git -C "$R" commit -qm 'one'
STAMP="$W/build-stamp.json"
BUILDS="$W/builds.log"
: >"$BUILDS"
builds_run() { wc -l <"$BUILDS" | tr -d ' '; }
# Run the build phase against that repo. Extra `KEY=value` args go to `env`, before node.
run_build() {
  ( cd "$R" && env APP_ROOT="$R" BUILD_STAMP="$STAMP" BUILD_COMMAND="echo built >>$BUILDS" \
      "$@" node "$REPO_ROOT/$S/preflight.mjs" build >"$W/out" 2>"$W/err" )
}
# usage: assert_reuse <name> <want BUILD=> <want reason> <want cumulative build count>
assert_reuse() {
  local name="$1" want_build="$2" want_reason="$3" want_count="$4" got
  got="$(builds_run)"
  if grep -q "^BUILD=$want_build\$" "$W/out" && grep -q "^BUILD_REUSE_REASON=$want_reason\$" "$W/out" &&
     [ "$got" = "$want_count" ]; then
    ok "$name"
  else
    bad "$name — builds=$got (wanted $want_count), summary: $(grep -E '^BUILD' "$W/out" | tr '\n' ' ')"
  fi
}

run_build
assert_reuse "the first build in a worktree is paid, and says why (no-stamp)" ok no-stamp 1
run_build
assert_reuse "an unchanged commit and tree reuses the built output" reused commit-and-tree-unchanged 1
stderr_has "  the reuse is legible in the run's own output" "build REUSED"
# Any source change rebuilds — and a status-only check would miss this, since ` M src.txt` is the
# same line whatever the edit was.
printf 'v2\n' >"$R/src.txt"
run_build
assert_reuse "an edit to a tracked source file forces a rebuild" ok tree-changed-since-build 2
# Same tree, new commit: the artifact was produced from a different commit and must not stand.
git -C "$R" commit -qam 'two'
run_build
assert_reuse "committing that edit forces a rebuild (the commit moved)" ok commit-changed 3
# A tree dirtied since the build never reuses it, tracked or not.
printf 'scratch\n' >"$R/untracked.txt"
run_build
assert_reuse "an untracked file dirties the tree and forces a rebuild" ok tree-changed-since-build 4
rm -f "$R/untracked.txt"
# The mutation check mutates source by definition; it must never inherit an artifact, even when the
# fingerprint would somehow agree.
run_build BUILD_REUSE=never
assert_reuse "BUILD_REUSE=never always rebuilds (the mutation check's contract)" ok forced 5
# A failed build must not leave a stamp behind: the next run would inherit a half-written artifact.
( cd "$R" && env APP_ROOT="$R" BUILD_STAMP="$STAMP" BUILD_COMMAND='exit 2' \
    node "$REPO_ROOT/$S/preflight.mjs" build >"$W/out" 2>"$W/err" )
if [ ! -e "$STAMP" ]; then ok "a failed build drops the stamp — nothing inherits a broken artifact"; else bad "a failed build left $STAMP in place"; fi
run_build
assert_reuse "the run after a failed build is paid for again" ok no-stamp 6
# No git worktree = nothing to compare, so the honest answer is to build.
mkdir -p "$W/nogit"
( cd "$W/nogit" && env APP_ROOT="$W/nogit" BUILD_STAMP="$W/nogit-stamp.json" \
    BUILD_COMMAND="echo built >>$BUILDS" node "$REPO_ROOT/$S/preflight.mjs" build >"$W/out" 2>"$W/err" )
assert_reuse "outside a git worktree there is nothing to compare, so the build is paid" ok no-git 7

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
  env BASE_URL=http://127.0.0.1:1 READY_TIMEOUT=2 node "$REPO_ROOT/$S/preflight.mjs" serve
if grep -q '^SERVE_CAUSE=no-log$' "$W/out"; then
  ok "a failure with no SERVER_LOG says a port shift could not be ruled out — SERVE_CAUSE=no-log"
else
  bad "no-log serve failure — stdout: $(tr '\n' ' ' <"$W/out" | tail -c 160)"
fi
# A non-numeric timeout used to spin forever (`waited >= NaN` is never true). It must refuse instead.
expect_exit 1 "non-numeric READY_TIMEOUT is refused, not looped on" -- \
  env BASE_URL=http://127.0.0.1:1 READY_TIMEOUT=abc node "$REPO_ROOT/$S/preflight.mjs" serve
# The short budget must BE short: each attempt can itself take curl's --max-time, so a loop that
# counted iterations instead of the clock ran a "20s budget" for over a minute. 6s must not become 15.
start=$(date +%s)
expect_exit 3 "the serve budget is wall clock, not iterations" -- \
  env BASE_URL=http://127.0.0.1:1 READY_TIMEOUT=6 node "$REPO_ROOT/$S/preflight.mjs" serve
elapsed=$(( $(date +%s) - start ))
if [ "$elapsed" -le 12 ]; then ok "serve budget honoured (${elapsed}s for READY_TIMEOUT=6)"; else bad "serve poll ran ${elapsed}s on a 6s budget"; fi

node -e 'require("http").createServer((q,s)=>{s.writeHead(200);s.end("ok")}).listen(8739,"127.0.0.1")' &
SRV=$!
for _ in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:8739 && break; sleep 0.1; done
( cd "$W" && BASE_URL=http://127.0.0.1:8739 READY_TIMEOUT=10 node "$REPO_ROOT/$S/preflight.mjs" serve >"$W/out" 2>"$W/err" )
rc=$?
{ kill $SRV && wait $SRV; } 2>/dev/null   # wait, else the shell prints its own "Terminated" line
if [ "$rc" -eq 0 ] && grep -q '^READY=yes$' "$W/out"; then
  ok "ready origin — exit 0 and READY=yes on stdout"
else
  bad "ready origin — exit $rc, stdout: $(head -c 120 "$W/out")"
fi
if grep -q '^PORT_SOURCE=requested$' "$W/out" && grep -q '^PORT_SHIFTED=no$' "$W/out"; then
  ok "an unshifted origin says so — PORT_SOURCE=requested, PORT_SHIFTED=no"
else
  bad "unshifted origin summary — stdout: $(tr '\n' ' ' <"$W/out" | tail -c 160)"
fi

echo ""
echo "-- preflight: the port and the address family come from the server's own output --"
# Three of eight observed readiness failures were the agent polling a port the server had not bound,
# and one was a server bound to a single loopback family while the agent dialled the other. The
# server announced both, plainly, in its own log — so the log is read, not the guess re-polled.

# A framework that shifts the port announces the shift. Polling the guess burned the full budget and
# reported a healthy server absent; re-polling the announced port answered immediately.
printf 'Nuxt 3.11.2 with Nitro 2.9.6\nUnable to find an available port (tried 8740)... Using alternative port 8741\nListening on http://[::1]:8741\n' >"$W/shifted.log"
node -e 'require("http").createServer((q,s)=>{s.writeHead(200);s.end("ok")}).listen(8741,"127.0.0.1")' &
SRV=$!
for _ in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:8741 && break; sleep 0.1; done
( cd "$W" && BASE_URL=http://127.0.0.1:8740 SERVER_LOG="$W/shifted.log" READY_TIMEOUT=10 \
    node "$REPO_ROOT/$S/preflight.mjs" serve >"$W/out" 2>"$W/err" )
rc=$?
if [ "$rc" -eq 0 ] && grep -q '^READY=yes$' "$W/out" && grep -q '^PORT_SHIFTED=yes$' "$W/out" \
   && grep -q '^BASE_URL=http://127.0.0.1:8741$' "$W/out" && grep -q '^PORT_SOURCE=announced$' "$W/out"; then
  ok "an announced port shift is followed, not reported as a not-ready server"
else
  bad "announced port shift — exit $rc, stdout: $(tr '\n' ' ' <"$W/out" | tail -c 200)"
fi

# The bound address family is honoured: this server answers on 127.0.0.1 only, and both the caller's
# guess and the log's own line name the other loopback form. Reachable on one form is not absent.
printf '  ➜  Local:   http://[::1]:8741/\n' >"$W/family.log"
( cd "$W" && BASE_URL=http://[::1]:8741 SERVER_LOG="$W/family.log" READY_TIMEOUT=10 \
    node "$REPO_ROOT/$S/preflight.mjs" serve >"$W/out" 2>"$W/err" )
rc=$?
{ kill $SRV && wait $SRV; } 2>/dev/null
if [ "$rc" -eq 0 ] && grep -q '^BASE_URL=http://127.0.0.1:8741$' "$W/out" && grep -q '^ADDRESS_FAMILY=ipv4$' "$W/out"; then
  ok "a server reachable on the other loopback family is found, and the family is reported"
else
  bad "address family fallback — exit $rc, stdout: $(tr '\n' ' ' <"$W/out" | tail -c 200)"
fi

# A server that genuinely never started still fails — and the cause is not a port mismatch. The
# marker says what is KNOWN (the log names no origin), because a server that binds quietly reaches
# this branch too and a confident wrong verdict is the misdiagnosis the phase split exists to end.
printf 'Error: Cannot find module ./.output/server/index.mjs\n' >"$W/dead.log"
expect_exit 3 "a server that never started is still a SERVE failure" -- \
  env BASE_URL=http://127.0.0.1:1 SERVER_LOG="$W/dead.log" READY_TIMEOUT=2 \
      node "$REPO_ROOT/$S/preflight.mjs" serve
if grep -q '^SERVE_CAUSE=no-announcement$' "$W/out"; then
  ok "a log naming no origin is distinguishable from a port mismatch — SERVE_CAUSE=no-announcement"
else
  bad "no-announcement cause — stdout: $(tr '\n' ' ' <"$W/out" | tail -c 160)"
fi
stderr_has "  the stop quotes the server's own last output" "Cannot find module"

# A server that announced an origin and then died is a THIRD answer: the announcement was read, and
# it does not answer. Nothing was guessed, so re-guessing the port is not the fix.
printf 'Listening on http://localhost:8747\n' >"$W/gone.log"
expect_exit 3 "an announced origin that does not answer is a SERVE failure" -- \
  env BASE_URL=http://127.0.0.1:1 SERVER_LOG="$W/gone.log" READY_TIMEOUT=2 \
      node "$REPO_ROOT/$S/preflight.mjs" serve
if grep -q '^SERVE_CAUSE=announced-unreachable$' "$W/out" && grep -q '^ANNOUNCED_PORTS=8747$' "$W/out"; then
  ok "an announced-but-dead origin names what was announced — SERVE_CAUSE=announced-unreachable"
else
  bad "announced-unreachable cause — stdout: $(tr '\n' ' ' <"$W/out" | tail -c 160)"
fi

# A SERVER_LOG path that does not exist is not evidence the server never started — it is a missing
# log, and saying so keeps the two apart.
expect_exit 3 "a SERVER_LOG that does not exist is reported as a missing log, not a dead server" -- \
  env BASE_URL=http://127.0.0.1:1 SERVER_LOG="$W/nope.log" READY_TIMEOUT=2 \
      node "$REPO_ROOT/$S/preflight.mjs" serve
if grep -q '^SERVE_CAUSE=no-log$' "$W/out"; then
  ok "a missing SERVER_LOG file reports SERVE_CAUSE=no-log"
else
  bad "missing SERVER_LOG — stdout: $(tr '\n' ' ' <"$W/out" | tail -c 160)"
fi

# Reading the log must never COST a run. A chatty log mentions origins that are not the server —
# an API base, a registry, a database — and the port the caller actually asked for must still be
# dialled inside the short budget, or passing SERVER_LOG would fail a case that passed without it.
printf 'proxying /api -> http://api.internal:59123\ncache at http://cache.internal:59124\nqueue http://mq.internal:59125\nwarming...\n' >"$W/chatty.log"
node -e 'require("http").createServer((q,s)=>{s.writeHead(200);s.end("ok")}).listen(8742,"127.0.0.1")' &
SRV=$!
for _ in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:8742 && break; sleep 0.1; done
( cd "$W" && BASE_URL=http://127.0.0.1:8742 SERVER_LOG="$W/chatty.log" READY_TIMEOUT=10 \
    node "$REPO_ROOT/$S/preflight.mjs" serve >"$W/out" 2>"$W/err" )
rc=$?
{ kill $SRV && wait $SRV; } 2>/dev/null
if [ "$rc" -eq 0 ] && grep -q '^PORT_SOURCE=requested$' "$W/out" && grep -q '^BASE_URL=http://127.0.0.1:8742$' "$W/out"; then
  ok "a chatty log does not starve the port the caller asked for"
else
  bad "chatty log starvation — exit $rc, stdout: $(tr '\n' ' ' <"$W/out" | tail -c 200)"
fi

# An address inside a longer one is not a port: `listening on 192.168.1.5:8080` must not announce 192.
printf 'listening on 192.168.1.5:8080\n' >"$W/octet.log"
expect_exit 3 "an address octet is not read as an announced port" -- \
  env BASE_URL=http://127.0.0.1:1 SERVER_LOG="$W/octet.log" READY_TIMEOUT=2 \
      node "$REPO_ROOT/$S/preflight.mjs" serve
if grep -q '^ANNOUNCED_PORTS=8080$' "$W/out"; then
  ok "the port comes from the address, not from its first octet — ANNOUNCED_PORTS=8080"
else
  bad "octet parse — stdout: $(tr '\n' ' ' <"$W/out" | tail -c 160)"
fi

# The origin is parsed now that candidates are built from it, so a malformed one is a usage refusal
# rather than a poll that burns its whole budget on a string that could never have answered.
expect_exit 1 "a BASE_URL that is not a URL is a usage error, not a serve failure" -- \
  env BASE_URL=localhost:3000 READY_TIMEOUT=2 node "$REPO_ROOT/$S/preflight.mjs" serve

echo ""
echo "-- probe: browserless refusal + client contract (NO browser in CI) --"
# The refusal is the CI-provable half of the probe contract: $W has no node_modules anywhere up its
# tree, so `start` must refuse cleanly (exit 2) BEFORE any launch attempt — never boot a browser,
# never hang.
expect_exit 1 "no subcommand is a usage error" -- \
  node "$REPO_ROOT/$S/probe.mjs"
# The vocabulary must be discoverable from the usage text, not by rejection: fifteen of twenty
# audited sessions learned it from an error line, and the model reached for verbs that never existed.
# The expected set is READ FROM the usage text and then checked against every other surface, so a
# verb added to the script and nowhere else fails here rather than drifting quietly.
VERBS=$(sed -n 's/^probe.mjs: batch verbs: //p' "$W/err" | tr -d ' ' | tr '|' ' ')
if [ -n "$VERBS" ]; then
  ok "the usage text publishes the batch vocabulary ($VERBS)"
else
  bad "the usage text publishes no vocabulary line — stderr: $(head -c 160 "$W/err")"
  VERBS="navigate click fill wait snapshot eval console network-summary storage-state close"
fi
for verb in navigate click fill wait snapshot eval console network-summary storage-state close; do
  case " $VERBS " in *" $verb "*) ok "  usage text names the '$verb' verb" ;;
    *) bad "  usage text omits the '$verb' verb" ;; esac
done
case " $VERBS " in *" viewport "*) bad "a viewport verb exists — it is deliberately not part of the DSL" ;;
  *) ok "no viewport verb is published" ;; esac
# The skill's cheat-sheet is the other surface an agent reads. It must name the SAME verbs — an
# agent that learns the vocabulary from SKILL.md must not be able to learn a verb that is not there.
missing=""
for verb in $VERBS; do grep -qF -- "\`$verb\`" skills/pw-prove/SKILL.md || missing="$missing $verb"; done
if [ -z "$missing" ]; then
  ok "the skill's command cheat-sheet lists every verb the probe accepts"
else
  bad "SKILL.md's cheat-sheet omits:$missing"
fi
expect_exit 2 "browserless env: start refuses cleanly (no pinned Playwright from cwd)" -- \
  node "$REPO_ROOT/$S/probe.mjs" start
stderr_has "  refusal names the pinned-Playwright requirement" "pinned Playwright"
# A batch sent before a daemon was started is an ORDERING mistake, not a run failure: `send` starts
# one first. Here that start hits the browserless gate, so the refusal an operator sees is the real
# one (exit 2, "pinned Playwright") rather than exit 3 "no daemon" — which said nothing about the
# environment and was every probe failure in the audited sample.
expect_exit 2 "send with no daemon starts one rather than failing on the ordering" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" send '[{"cmd":"snapshot"}]'
stderr_has "  the sequencing is stated, not implied" "starting one first"
expect_exit 3 "close with no daemon listening at the socket" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" close
expect_exit 1 "unparsable batch is a usage error (checked before connecting)" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" send 'not json'
expect_exit 1 "batch must be a JSON ARRAY of {cmd} objects" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" send '{"cmd":"snapshot"}'

# An eval whose "expression" is neither form is rejected by the CLIENT, before a browser is involved,
# and the rejection names every accepted form. Exit 1 (usage) and not 2 proves the check ran first.
expect_exit 1 "eval with a non-string, non-object expression is a usage error" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" send '[{"cmd":"eval","expression":42}]'
stderr_has "  the eval rejection names the string form" '"location.href"'
stderr_has "  the eval rejection names the function form" '"fn"'
stderr_has "  the eval rejection names the named-map form" 'map of named'
expect_exit 1 "eval named map with a non-string value is a usage error" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" send '[{"cmd":"eval","expression":{"n":1}}]'
# ...and the accepted forms get PAST the client: reaching the browserless gate (exit 2) is the proof
# that the shape was accepted, since exit 1 is the only thing client validation can produce.
expect_exit 2 "eval string form still passes client validation (250 calls already use it)" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" send '[{"cmd":"eval","expression":"location.href"}]'
expect_exit 2 "eval function-object form passes client validation" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" send '[{"cmd":"eval","expression":{"fn":"a => a.id","arg":{"id":7}}}]'
expect_exit 2 "eval named-map form passes client validation" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" send '[{"cmd":"eval","expression":{"url":"location.href"}}]'

echo ""
echo "-- probe: the DSL against a live daemon (stub Playwright, no browser) --"
# The daemon's own vocabulary is only reachable through a resolvable `playwright` — the ONE external
# dependency the probe declares. A stub package at that exact seam boots the real daemon, the real
# socket protocol and the real command dispatch, with no browser anywhere. Everything asserted below
# is a line the daemon wrote to a socket, which is what every caller depends on.
APP="$W/fakeapp"
mkdir -p "$APP/node_modules/playwright"
printf '{"name":"fakeapp","private":true}\n' >"$APP/package.json"
printf '{"name":"playwright","version":"0.0.0-stub","main":"index.mjs"}\n' \
  >"$APP/node_modules/playwright/package.json"
cat >"$APP/node_modules/playwright/index.mjs" <<'STUB'
// Minimal stand-in for the target project's pinned Playwright: enough surface for the probe daemon
// to boot and dispatch commands. goto() emits the console traffic a real page load would, so the
// `console` verb has something to report and its reset-on-navigate ordering is observable.
const handlers = new Map();
const on = (ev, h) => { (handlers.get(ev) ?? handlers.set(ev, []).get(ev)).push(h); };
const emit = (ev, ...a) => (handlers.get(ev) ?? []).forEach((h) => h(...a));
const locator = (sel) => ({
  click: async () => {},
  fill: async () => {},
  waitFor: async () => {},
  ariaSnapshot: async () => `- generic "${sel}"`,
});
const page = {
  on,
  url: () => 'http://fake.test/people',
  title: async () => 'Fake',
  goto: async () => {
    emit('console', { type: () => 'error', text: () => 'Uncaught TypeError: rows is not iterable' });
    emit('pageerror', new Error('boom from the page'));
    return { status: () => 200 };
  },
  waitForLoadState: async () => {},
  waitForTimeout: async () => {},
  locator,
  evaluate: async (expression, arg) => ({ expression: String(expression), arg: arg ?? null }),
};
const context = {
  on: () => {},
  newPage: async () => page,
  storageState: async () => ({}),
  close: async () => {},
};
export const chromium = {
  launch: async () => ({ newContext: async () => context, close: async () => {} }),
};
STUB

SOCK="$W/live.sock"
probe_send() { ( cd "$APP" && env PROBE_SOCK="$SOCK" PROBE_IDLE=45 node "$REPO_ROOT/$S/probe.mjs" send "$1" >"$W/out" 2>"$W/err" ); }
trap '( cd "$APP" 2>/dev/null && env PROBE_SOCK="$SOCK" node "$REPO_ROOT/$S/probe.mjs" close >/dev/null 2>&1 ); rm -rf "$W"' EXIT

# One send, no start: the daemon is started first and the batch runs. This is the sequencing fix and
# the DSL widening proven in the same round trip.
probe_send '[{"cmd":"navigate","url":"/people"},{"cmd":"console"},{"cmd":"eval","expression":"location.href"},{"cmd":"eval","expression":{"fn":"a => a.id","arg":{"id":7}}},{"cmd":"eval","expression":{"url":"location.href","title":"document.title"}},{"cmd":"viewport","width":390}]'
rc=$?
if [ "$rc" -eq 0 ]; then ok "send with no daemon running boots one and answers the batch — exit 0"; else
  bad "autostarted send — exit $rc, stderr: $(tail -2 "$W/err")"; fi
if grep -qF '[1] navigate http://fake.test/people -> HTTP 200' "$W/out"; then
  ok "the autostarted daemon answered the first command"
else
  bad "autostarted batch — stdout: $(tr '\n' ' ' <"$W/out" | tail -c 200)"
fi
if grep -qF '[2] console' "$W/out" && grep -qF 'rows is not iterable' "$W/out" \
   && grep -qF 'boom from the page' "$W/out"; then
  ok "the console verb returns the page's console output and its uncaught errors"
else
  bad "console verb — stdout: $(tr '\n' ' ' <"$W/out" | tail -c 240)"
fi
if grep -qF '[3] eval -> {"expression":"location.href","arg":null}' "$W/out"; then
  ok "eval's string form is unchanged — the expression reaches the page verbatim"
else
  bad "eval string form — stdout: $(grep -F '[3]' "$W/out" | head -c 200)"
fi
if grep -qF '[4] eval -> {"expression":"a => a.id","arg":{"id":7}}' "$W/out"; then
  ok "eval's function-object form passes its argument through to the page"
else
  bad "eval {fn,arg} form — stdout: $(grep -F '[4]' "$W/out" | head -c 200)"
fi
if grep -F '[5] eval ->' "$W/out" | grep -qF '\"url\": (location.href)' \
   && grep -F '[5] eval ->' "$W/out" | grep -qF '\"title\": (document.title)'; then
  ok "eval's named-map form answers several questions in one round trip"
else
  bad "eval named-map form — stdout: $(grep -F '[5]' "$W/out" | head -c 220)"
fi
# The verb deliberately NOT added, and the rejection that has to teach the vocabulary.
if grep -qF "[6] viewport ERROR: unknown cmd 'viewport'" "$W/out"; then
  ok "no viewport verb exists — the effective viewport is pinned in the spec, not probed"
else
  bad "viewport must stay unknown — stdout: $(grep -F '[6]' "$W/out" | head -c 200)"
fi
missing=""
for verb in $VERBS; do
  grep -F '[6]' "$W/out" | grep -qF "$verb" || missing="$missing $verb"
done
if [ -z "$missing" ]; then
  ok "the unknown-verb rejection names the full current vocabulary"
else
  bad "unknown-verb rejection omits:$missing"
fi

# A second send reuses the daemon it found — the autostart is a sequencing net, not a per-batch boot.
probe_send '[{"cmd":"eval","expression":"1"}]'
rc=$?
if [ "$rc" -eq 0 ] && ! grep -qF 'starting one first' "$W/err"; then
  ok "a later send reuses the running daemon rather than starting another"
else
  bad "second send — exit $rc, stderr: $(tr '\n' ' ' <"$W/err" | tail -c 160)"
fi
( cd "$APP" && env PROBE_SOCK="$SOCK" node "$REPO_ROOT/$S/probe.mjs" close >"$W/out" 2>"$W/err" )
if [ $? -eq 0 ] && grep -qF 'closing' "$W/out"; then ok "close shuts the autostarted daemon down"; else
  bad "close — stdout: $(head -c 160 "$W/out")"; fi

echo ""
echo "  pw-prove scripts: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
