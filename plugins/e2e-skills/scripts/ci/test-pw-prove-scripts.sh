#!/usr/bin/env bash
# Process-boundary tests for the shipped pw-prove entry points that no other suite reaches:
# preflight.mjs (the Step-3 four-phase bring-up gate) and probe.mjs's argument/socket contract. The seam is
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

# config — a declared key nobody set. Must fail in seconds and NAME the key, and must not reach
# the build: BUILD_COMMAND here would take a minute and write a marker if it ever ran.
mkdir -p "$W/cfg"
start=$(date +%s)
expect_exit 4 "missing required key is a CONFIG failure, not a not-ready verdict" -- \
  env -u API_BASE_URL REQUIRED_ENV="API_BASE_URL" \
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
# A key set in the environment satisfies its declaration and must not be flagged.
expect_exit 0 "a key present in the environment is not reported missing" -- \
  env API_BASE_URL=http://api.example.test REQUIRED_ENV="API_BASE_URL" \
      node "$REPO_ROOT/$S/preflight.mjs" config
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
printf 'API_BASE_URL=http://api.internal\n' >"$W/monorepo/apps/web/.env"
expect_exit 0 "a key supplied by the app's own .env satisfies the declaration (APP_ROOT, not cwd)" -- \
  env -u API_BASE_URL APP_ROOT="$W/monorepo/apps/web" REQUIRED_ENV="API_BASE_URL" \
      node "$REPO_ROOT/$S/preflight.mjs" config
# Nothing declared must not read as a pass: the check did not happen, and the output says which.
( cd "$W" && env -u API_BASE_URL -u REQUIRED_ENV node "$REPO_ROOT/$S/preflight.mjs" config >"$W/out" 2>"$W/err" )
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
echo "-- preflight: the browser phase (the one dependency a package-manager install does not place) --"
# Playwright's browser binaries do not live in node_modules, so a repository can pin @playwright/test,
# pass every other gate, pay a 162s build, and have the runner exit 2 on `Executable doesn't exist at
# ...`. This phase moves that failure to the front, before the build.
#
# The seam is the project's OWN pinned Playwright CLI, resolved from APP_ROOT through the package's
# own `bin` declaration. Never `npx playwright`: measured 2026-08-19, `npx playwright install
# --dry-run` in a directory without the runner tries to DOWNLOAD playwright@latest, which is exactly
# the auto-install the skill forbids and would fire on the repo that lacks it. A stub package at that
# seam gives every verdict with no browser, no network and no real Playwright anywhere.
PWAPP="$W/pwapp"
mkdir -p "$PWAPP/node_modules/playwright"
printf '{"name":"pwapp","private":true,"packageManager":"pnpm@9.0.0"}\n' >"$PWAPP/package.json"
printf '{"name":"playwright","version":"0.0.0-stub","bin":{"playwright":"cli.js"}}\n' \
  >"$PWAPP/node_modules/playwright/package.json"
cat >"$PWAPP/node_modules/playwright/cli.js" <<'PWSTUB'
// Stand-in for the target project's pinned Playwright CLI. `install <browser> --dry-run` is the only
// verb the browser phase uses, and the bytes below are a VERBATIM transcription of a real
// `playwright install chromium --dry-run` (playwright 1.61.1, linux, captured 2026-08-19) with only
// the cache root made substitutable. Note what that real output contains and a hand-written stub
// would not: chromium resolves to THREE entries, and the headless shell — the binary the probe
// actually launches, and the one named in the original report — is the LAST of them.
//
// The known limitation, stated rather than hidden: if Playwright changes this format, this suite
// stays green while the real check rots. Re-capture these bytes rather than trusting this copy.
const argv = process.argv.slice(2).join(' ');
if (argv !== 'install chromium --dry-run') {
  process.stderr.write(`stub: unexpected argv '${argv}'\n`);
  process.exit(1);
}
if (process.env.PWSTUB_FAIL === '1') {
  process.stderr.write('stub: simulated CLI failure\n');
  process.exit(1);
}
if (process.env.PWSTUB_GARBAGE === '1') {
  process.stdout.write('nothing that looks like an install location\n');
  process.exit(0);
}
const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/nonexistent-ms-playwright';
process.stdout.write(
  `Chrome for Testing 149.0.7827.55 (playwright chromium v1228)\n` +
  `  Install location:    ${root}/chromium-1228\n` +
  `  Download url:        https://cdn.playwright.dev/builds/cft/149.0.7827.55/linux64/chrome-linux64.zip\n` +
  `\n` +
  `FFmpeg (playwright ffmpeg v1011)\n` +
  `  Install location:    ${root}/ffmpeg-1011\n` +
  `  Download url:        https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1011/ffmpeg-linux.zip\n` +
  `\n` +
  `Chrome Headless Shell 149.0.7827.55 (playwright chromium-headless-shell v1228)\n` +
  `  Install location:    ${root}/chromium_headless_shell-1228\n` +
  `  Download url:        https://cdn.playwright.dev/builds/cft/149.0.7827.55/linux64/chrome-headless-shell-linux64.zip\n` +
  `\n`,
);
PWSTUB

# usage: browser_run <cache-root> [EXTRA=env ...] — runs the browser phase in the stub app.
browser_run() {
  local cache="$1"; shift
  ( cd "$PWAPP" && env APP_ROOT="$PWAPP" PLAYWRIGHT_BROWSERS_PATH="$cache" "$@" \
      node "$REPO_ROOT/$S/preflight.mjs" browser >"$W/out" 2>"$W/err" )
}
summary_has() {
  if grep -q "^$2\$" "$W/out"; then ok "$1"; else bad "$1 — stdout: $(tr '\n' ' ' <"$W/out" | tail -c 200)"; fi
}

# missing — an empty cache. The refusal must name the install command for THIS project's package
# manager, and the path it looked at, so a cache pointed somewhere unexpected is diagnosable.
CACHE="$W/pw-cache"
browser_run "$CACHE"; rc=$?
if [ "$rc" = 6 ]; then ok "an absent browser is its own refusal — exit 6"; else bad "absent browser — exit $rc, wanted 6"; fi
summary_has "the refusal is machine-readable — BROWSER=missing" "BROWSER=missing"
summary_has "and it says which phase stopped — PHASE_FAILED=browser" "PHASE_FAILED=browser"
if grep -qF 'pnpm exec playwright install chromium' "$W/err"; then
  ok "the refusal names the install command for the project's own package manager"
else
  bad "install command — stderr: $(tr '\n' ' ' <"$W/err" | tail -c 200)"
fi
if grep -qF "$CACHE/chromium_headless_shell-1228" "$W/err"; then
  ok "the refusal names the headless shell by path — the binary the probe actually launches"
else
  bad "refusal does not name the headless-shell path — stderr: $(tr '\n' ' ' <"$W/err" | tail -c 200)"
fi

# partial — the directories exist, the completion marker does not. This is an interrupted download,
# and it is the state a directory-exists check cannot see.
mkdir -p "$CACHE/chromium-1228" "$CACHE/chromium_headless_shell-1228" "$CACHE/ffmpeg-1011"
browser_run "$CACHE"; rc=$?
if [ "$rc" = 6 ]; then ok "a half-downloaded cache still refuses — exit 6"; else bad "partial install — exit $rc, wanted 6"; fi
summary_has "a partial install is not reported as merely missing — BROWSER=partial" "BROWSER=partial"

# ok — Playwright's own completion marker present in each location.
touch "$CACHE/chromium-1228/INSTALLATION_COMPLETE" \
      "$CACHE/chromium_headless_shell-1228/INSTALLATION_COMPLETE" \
      "$CACHE/ffmpeg-1011/INSTALLATION_COMPLETE"
browser_run "$CACHE"; rc=$?
if [ "$rc" = 0 ]; then ok "a complete install passes — exit 0"; else bad "complete install — exit $rc, wanted 0: $(tr '\n' ' ' <"$W/err" | tail -c 200)"; fi
summary_has "a pass says so — BROWSER=ok" "BROWSER=ok"
summary_has "the bundled ffmpeg is reported alongside it — FFMPEG=ok" "FFMPEG=ok"

# The bundled ffmpeg is EVIDENCE (video), not the proof. Its absence is a WARN and never the exit
# code: a run must still be able to prove a change with a degraded recording pipeline.
rm -rf "$CACHE/ffmpeg-1011"
browser_run "$CACHE"; rc=$?
if [ "$rc" = 0 ]; then ok "a missing bundled ffmpeg warns and does not block — exit 0"; else bad "missing ffmpeg — exit $rc, wanted 0"; fi
summary_has "and it is still reported — FFMPEG=missing" "FFMPEG=missing"
mkdir -p "$CACHE/ffmpeg-1011" && touch "$CACHE/ffmpeg-1011/INSTALLATION_COMPLETE"

# no-runner — greenfield reaches Step 3 before Step 5b bootstraps the runner, so refusing here would
# block a run that is about to be fixed. It must SKIP, and a skip must never read as a pass.
mkdir -p "$W/norunner"
( cd "$W/norunner" && env APP_ROOT="$W/norunner" node "$REPO_ROOT/$S/preflight.mjs" browser \
    >"$W/out" 2>"$W/err" ); rc=$?
if [ "$rc" = 0 ]; then ok "greenfield skips rather than refusing — exit 0"; else bad "no-runner — exit $rc, wanted 0"; fi
summary_has "a skip is distinct from a pass — BROWSER=skipped" "BROWSER=skipped"
summary_has "and it names why — BROWSER_SKIP=no-runner" "BROWSER_SKIP=no-runner"

# probe-failed — a checker that stops bring-up because the CHECKER broke is a false stop in the one
# phase whose whole purpose is preventing misdiagnosis. Both failure shapes skip with a named reason.
browser_run "$CACHE" PWSTUB_FAIL=1; rc=$?
if [ "$rc" = 0 ]; then ok "a broken CLI skips rather than stopping the run — exit 0"; else bad "probe-failed — exit $rc, wanted 0"; fi
summary_has "and says the checker failed, not the browser — BROWSER_SKIP=probe-failed" "BROWSER_SKIP=probe-failed"
browser_run "$CACHE" PWSTUB_GARBAGE=1; rc=$?
if [ "$rc" = 0 ]; then ok "unparseable output skips too — exit 0"; else bad "unparseable output — exit $rc, wanted 0"; fi
summary_has "unparseable output is a checker failure — BROWSER_SKIP=probe-failed" "BROWSER_SKIP=probe-failed"

# The package manager is read from the project, not passed in. A lockfile answers when the
# declarative `packageManager` field does not.
NPMAPP="$W/npmapp"
mkdir -p "$NPMAPP/node_modules"
cp -r "$PWAPP/node_modules/playwright" "$NPMAPP/node_modules/playwright"
printf '{"name":"npmapp","private":true}\n' >"$NPMAPP/package.json"
printf '{"lockfileVersion":3}\n' >"$NPMAPP/package-lock.json"
( cd "$NPMAPP" && env APP_ROOT="$NPMAPP" PLAYWRIGHT_BROWSERS_PATH="$W/pw-empty" \
    node "$REPO_ROOT/$S/preflight.mjs" browser >"$W/out" 2>"$W/err" )
if grep -qF 'npm exec -- playwright install chromium' "$W/err"; then
  ok "a lockfile answers when no packageManager field is declared"
else
  bad "lockfile-derived install command — stderr: $(tr '\n' ' ' <"$W/err" | tail -c 200)"
fi

# The whole point of the phase is its POSITION: the check must happen before anything expensive.
# BUILD_COMMAND here would write a marker if the build were ever reached.
rm -f "$PWAPP/BUILD-RAN.marker"
( cd "$PWAPP" && env APP_ROOT="$PWAPP" PLAYWRIGHT_BROWSERS_PATH="$W/pw-empty" \
    BUILD_COMMAND="touch $PWAPP/BUILD-RAN.marker" \
    node "$REPO_ROOT/$S/preflight.mjs" browser build >"$W/out" 2>"$W/err" ); rc=$?
if [ "$rc" = 6 ] && [ ! -e "$PWAPP/BUILD-RAN.marker" ]; then
  ok "the browser check runs BEFORE the build — a 162s build is never paid to learn this"
else
  bad "browser/build ordering — exit $rc, build marker present=$([ -e "$PWAPP/BUILD-RAN.marker" ] && echo yes || echo no)"
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
echo "-- preflight: a RESTART is proven by a new announcement, not by an answer on the port --"
# The live proof produced a false RED here: the preview restart failed with EADDRINUSE, the OLD
# process answered the port, the poll said SERVE=ok, and the mutation run failed against an artifact
# nothing had rebuilt. A restart needs a liveness IDENTITY, not a liveness check — so SERVE_RESTART=1
# requires an announcement written AFTER the restart mark (RESTART_LOG_OFFSET), and an answer alone
# proves nothing.

# The stale process: one server that stays up across every case below, exactly as the old preview
# server did. It answers on 8751 whatever the log says.
# Started under the EXIT trap, not just killed at the end of the block: every case below needs
# SOMETHING answering 8751, so a run that dies mid-block must not leave the port held for the next.
STALE=""
kill_stale() { [ -n "$STALE" ] && { kill "$STALE" && wait "$STALE"; } 2>/dev/null; STALE=""; }
trap 'kill_stale; rm -rf "$W"' EXIT
for _ in $(seq 1 50); do
  curl -s -o /dev/null --max-time 1 http://127.0.0.1:8751 && break   # a leftover listener: wait it out
  node -e 'require("http").createServer((q,s)=>{s.writeHead(200);s.end("ok")}).listen(8751,"127.0.0.1")' 2>/dev/null &
  STALE=$!
  sleep 0.2
  curl -s -o /dev/null --max-time 1 http://127.0.0.1:8751 && break
done

# 1. Stale process answers — the observed failure verbatim. The restart never bound, said so, and the
# port still answers. That must be a bring-up failure, and it must be fast: there is nothing to wait
# for once the new process has told us it could not bind.
printf 'Listening on http://127.0.0.1:8751\n' >"$W/restart.log"
MARK=$(wc -c <"$W/restart.log" | tr -d ' ')
printf 'Error: listen EADDRINUSE: address already in use :::8751\n' >>"$W/restart.log"
start=$(date +%s)
expect_exit 3 "a restart that failed with EADDRINUSE is a SERVE failure, though the old process answers" -- \
  env BASE_URL=http://127.0.0.1:8751 SERVER_LOG="$W/restart.log" RESTART_LOG_OFFSET="$MARK" \
      SERVE_RESTART=1 READY_TIMEOUT=20 node "$REPO_ROOT/$S/preflight.mjs" serve
elapsed=$(( $(date +%s) - start ))
if grep -q '^SERVE_CAUSE=restart-port-in-use$' "$W/out" && grep -q '^RESTART=unproven$' "$W/out" \
   && ! grep -q '^SERVE=ok$' "$W/out"; then
  ok "the stale answer is named — SERVE_CAUSE=restart-port-in-use, RESTART=unproven, never SERVE=ok"
else
  bad "stale-process-answers — stdout: $(tr '\n' ' ' <"$W/out" | tail -c 200)"
fi
if [ "$elapsed" -le 8 ]; then ok "a bind failure stops at once (${elapsed}s), it is not waited out"; else bad "port-in-use waited ${elapsed}s of a 20s budget"; fi

# 2. Stale process answers with a quiet log — no bind error, just nothing new. The old announcement
# is BEFORE the mark, so it is not evidence about this restart, and an answer on the port is not
# either. Distinct cause: something answered, its identity could not be proven.
printf 'Listening on http://127.0.0.1:8751\n' >"$W/quiet.log"
MARK=$(wc -c <"$W/quiet.log" | tr -d ' ')
expect_exit 3 "an answering server with no announcement after the restart mark is unproven, not ok" -- \
  env BASE_URL=http://127.0.0.1:8751 SERVER_LOG="$W/quiet.log" RESTART_LOG_OFFSET="$MARK" \
      SERVE_RESTART=1 READY_TIMEOUT=4 node "$REPO_ROOT/$S/preflight.mjs" serve
if grep -q '^SERVE_CAUSE=restart-unannounced$' "$W/out" && grep -q '^RESTART=unproven$' "$W/out"; then
  ok "an unprovable restart is its own answer — SERVE_CAUSE=restart-unannounced"
else
  bad "restart-unannounced cause — stdout: $(tr '\n' ' ' <"$W/out" | tail -c 200)"
fi

# 3. FALSE-POSITIVE GUARD — a legitimately fast restart. The new process bound and announced before
# the poll even started, so its announcement is already in the log when the first round reads it.
# That is the common case and it must pass on the first round, not be misread as the stale one.
printf 'Listening on http://127.0.0.1:8751\n' >"$W/fast.log"
MARK=$(wc -c <"$W/fast.log" | tr -d ' ')
printf 'restarting...\nListening on http://127.0.0.1:8751\n' >>"$W/fast.log"
start=$(date +%s)
( cd "$W" && env BASE_URL=http://127.0.0.1:8751 SERVER_LOG="$W/fast.log" RESTART_LOG_OFFSET="$MARK" \
    SERVE_RESTART=1 READY_TIMEOUT=20 node "$REPO_ROOT/$S/preflight.mjs" serve >"$W/out" 2>"$W/err" )
rc=$?
elapsed=$(( $(date +%s) - start ))
if [ "$rc" -eq 0 ] && grep -q '^RESTART=proven$' "$W/out" && grep -q '^SERVE=ok$' "$W/out" && [ "$elapsed" -le 8 ]; then
  ok "a restart that announced before the poll began is proven at once (${elapsed}s), not read as stale"
else
  bad "fast restart false-positive guard — exit $rc, ${elapsed}s, stdout: $(tr '\n' ' ' <"$W/out" | tail -c 200)"
fi

# 3b. The mark is a BYTE count and the log is full of multi-byte characters — a preview banner is
# nothing but `➜` and `✔`. Counting the mark in characters would push it PAST the new announcement
# and report this healthy restart stale, which is the same false verdict from the other side.
printf '  ➜  Local:   http://127.0.0.1:8751/\n  ➜  Network: use --host to expose\n  ✔  built in 812ms\n' >"$W/utf8.log"
MARK=$(wc -c <"$W/utf8.log" | tr -d ' ')
printf '  ➜  Local:   http://127.0.0.1:8751/\n' >>"$W/utf8.log"
( cd "$W" && env BASE_URL=http://127.0.0.1:8751 SERVER_LOG="$W/utf8.log" RESTART_LOG_OFFSET="$MARK" \
    SERVE_RESTART=1 READY_TIMEOUT=6 node "$REPO_ROOT/$S/preflight.mjs" serve >"$W/out" 2>"$W/err" )
rc=$?
if [ "$rc" -eq 0 ] && grep -q '^RESTART=proven$' "$W/out"; then
  ok "the restart mark is read as bytes, so a multi-byte banner does not hide the new announcement"
else
  bad "utf-8 restart mark — exit $rc, stdout: $(tr '\n' ' ' <"$W/out" | tail -c 200)"
fi

# 3c. No mark at all. A log written fresh per start makes the default mark of 0 correct, and a log
# that APPENDS makes it prove the restart with the previous process's own announcement. Nothing here
# can tell those apart, so the run says so — once — rather than asserting either.
printf 'Listening on http://127.0.0.1:8751\n' >"$W/nomark.log"
( cd "$W" && env -u RESTART_LOG_OFFSET BASE_URL=http://127.0.0.1:8751 SERVER_LOG="$W/nomark.log" \
    SERVE_RESTART=1 READY_TIMEOUT=6 node "$REPO_ROOT/$S/preflight.mjs" serve >"$W/out" 2>"$W/err" )
rc=$?
if [ "$rc" -eq 0 ] && grep -qF 'no RESTART_LOG_OFFSET given' "$W/err" \
   && [ "$(grep -cF 'no RESTART_LOG_OFFSET given' "$W/err")" = 1 ]; then
  ok "an unmarked restart against an already-announcing log warns once, and does not pretend to know"
else
  bad "unmarked restart warning — exit $rc, stderr: $(tr '\n' ' ' <"$W/err" | tail -c 200)"
fi

# 4. Clean restart — the announcement lands DURING the poll, which is what a restart normally looks
# like. The poll re-reads the log every round, so the identity arrives when the server is ready.
printf 'Listening on http://127.0.0.1:8751\n' >"$W/clean.log"
MARK=$(wc -c <"$W/clean.log" | tr -d ' ')
( sleep 3; printf 'Listening on http://127.0.0.1:8751\n' >>"$W/clean.log" ) &
LATE=$!
( cd "$W" && env BASE_URL=http://127.0.0.1:8751 SERVER_LOG="$W/clean.log" RESTART_LOG_OFFSET="$MARK" \
    SERVE_RESTART=1 READY_TIMEOUT=20 node "$REPO_ROOT/$S/preflight.mjs" serve >"$W/out" 2>"$W/err" )
rc=$?
wait $LATE 2>/dev/null
kill_stale
if [ "$rc" -eq 0 ] && grep -q '^RESTART=proven$' "$W/out" && grep -q '^SERVE=ok$' "$W/out"; then
  ok "a clean restart announcing mid-poll is proven when its announcement lands"
else
  bad "clean restart — exit $rc, stdout: $(tr '\n' ' ' <"$W/out" | tail -c 200)"
fi

# 5. The port genuinely free — nothing listening at all. That is still the ordinary absent-server
# failure, not a restart-identity one: keeping them apart is the difference between "start it" and
# "kill the one that is already there".
printf 'restarting...\n' >"$W/free.log"
expect_exit 3 "a restart onto a genuinely free port is an absent server, not a stale one" -- \
  env BASE_URL=http://127.0.0.1:1 SERVER_LOG="$W/free.log" SERVE_RESTART=1 READY_TIMEOUT=2 \
      node "$REPO_ROOT/$S/preflight.mjs" serve
if grep -q '^SERVE_CAUSE=no-announcement$' "$W/out" && grep -q '^RESTART=unproven$' "$W/out"; then
  ok "nothing answering keeps its own cause — SERVE_CAUSE=no-announcement with RESTART=unproven"
else
  bad "free-port restart — stdout: $(tr '\n' ' ' <"$W/out" | tail -c 200)"
fi

# A restart with no log cannot be proven by anything, so it refuses rather than falling back to the
# answer-on-the-port check the whole mode exists to replace.
expect_exit 3 "a restart with no SERVER_LOG refuses — identity cannot be read from an answer" -- \
  env -u SERVER_LOG BASE_URL=http://127.0.0.1:1 SERVE_RESTART=1 READY_TIMEOUT=2 \
      node "$REPO_ROOT/$S/preflight.mjs" serve
if grep -q '^SERVE_CAUSE=restart-no-log$' "$W/out"; then
  ok "a restart without a log says so — SERVE_CAUSE=restart-no-log"
else
  bad "restart-no-log cause — stdout: $(tr '\n' ' ' <"$W/out" | tail -c 200)"
fi
# A non-numeric mark would silently include the whole log, which is the stale case again.
expect_exit 1 "a RESTART_LOG_OFFSET that is not a byte count is a usage error" -- \
  env BASE_URL=http://127.0.0.1:1 SERVER_LOG="$W/free.log" SERVE_RESTART=1 RESTART_LOG_OFFSET=abc \
      READY_TIMEOUT=2 node "$REPO_ROOT/$S/preflight.mjs" serve

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
# The two malformed shapes a mis-remembered form produces. Neither may reach a page: a rejection an
# agent can act on beats a call that returns nothing and reads as an answer.
expect_exit 1 "eval with no expression at all is a usage error" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" send '[{"cmd":"eval"}]'
stderr_has "  the empty-eval rejection names the accepted shapes" 'map of named'
expect_exit 1 "eval with a non-string \"fn\" is a usage error" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" send '[{"cmd":"eval","expression":{"fn":42,"arg":1}}]'
stderr_has "  the bad-fn rejection names the function form" '"fn"'
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
// The page the expressions run against. `evaluate` below is the load-bearing part of this stub: a
// stub that merely ECHOED its arguments back reported the {fn, arg} form as working for three
// releases while it returned nothing and dropped the argument (#52). Real Playwright is handed a
// STRING here — its client sets `isFunction` from `typeof pageFunction`, never 'function' for source
// text — and evaluates that string as an EXPRESSION, discarding extra arguments. So does this. An
// argument only arrives if the probe put it INSIDE the expression.
const win = { location: { href: 'http://fake.test/people' }, document: { title: 'Fake' } };
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
  evaluate: async (expression) => {
    const v = await new Function('window', 'location', 'document', `return (${String(expression)})`)(
      win, win.location, win.document,
    );
    // The value crosses a wire: what does not survive JSON comes back as undefined, which is exactly
    // how a bare arrow-function source used to arrive.
    try { return JSON.parse(JSON.stringify(v)); } catch { return undefined; }
  },
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
probe_send '[{"cmd":"navigate","url":"/people"},{"cmd":"console"},{"cmd":"eval","expression":"location.href"},{"cmd":"eval","expression":{"fn":"a => a.id","arg":{"id":7}}},{"cmd":"eval","expression":{"url":"location.href","t":"document.title"}},{"cmd":"viewport","width":390}]'
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
if grep -qF '[3] eval -> "http://fake.test/people"' "$W/out"; then
  ok "eval's string form is unchanged — the expression is evaluated and its VALUE returned"
else
  bad "eval string form — stdout: $(grep -F '[3]' "$W/out" | head -c 200)"
fi
# The form printed in SKILL.md, run verbatim, asserted on the VALUE the function computed from its
# argument: 7 can only appear if `arg` reached `a`. The old assertion checked that page.evaluate was
# CALLED with the argument, which it was — Playwright then discarded it (#52).
if grep -qF '[4] eval -> 7' "$W/out"; then
  ok "eval's {fn, arg} form calls fn WITH arg and returns what it computed"
else
  bad "eval {fn,arg} form — stdout: $(grep -F '[4]' "$W/out" | head -c 200)"
fi
if grep -qF '[5] eval -> {"url":"http://fake.test/people","t":"Fake"}' "$W/out"; then
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

# The form above must be the form an agent READS — a documented shape the suite does not run is how
# the {fn, arg} form stayed inert through three releases (#52).
for form in '{"cmd":"eval","expression":"location.href"}' \
            '{"cmd":"eval","expression":{"fn":"a => a.id","arg":{"id":7}}}' \
            '{"cmd":"eval","expression":{"url":"location.href","t":"document.title"}}'; do
  if grep -qF "$form" skills/pw-prove/SKILL.md; then
    ok "  SKILL.md prints the eval form this suite runs: $form"
  else
    bad "  SKILL.md prints a different eval form than the suite runs: $form"
  fi
done

# The live-application reproduction from docs/studies/live-proof-pr2866.md §2, verbatim: the argument
# is stashed on the page by one command and read back by the NEXT one. Both halves failed silently
# before — `undefined` returned, `window.__probeArg` never written.
probe_send '[{"cmd":"eval","expression":{"fn":"(s) => { window.__probeArg = s; return 42 }","arg":{"a":41}}},{"cmd":"eval","expression":"JSON.stringify(window.__probeArg)"}]'
if grep -qF '[1] eval -> 42' "$W/out"; then
  ok "the {fn, arg} form returns the function's value rather than serialising to undefined"
else
  bad "{fn,arg} return value — stdout: $(grep -F '[1]' "$W/out" | head -c 200)"
fi
if grep -qF '[2] eval -> "{\"a\":41}"' "$W/out"; then
  ok "the argument really arrived in the page — a later eval reads back what fn stored"
else
  bad "{fn,arg} argument delivery — stdout: $(grep -F '[2]' "$W/out" | head -c 200)"
fi

# --- `start` detaches, reports, and RETURNS ----------------------------------------------------
# The defect: `start` used to BECOME the daemon, so a foreground call blocked until the idle timeout
# and an observed run lost 180s to its harness's 3-minute cap. The contract is now the script's: it
# spawns the daemon, waits only until the socket answers, prints where it is, and exits 0.
START_SOCK="$W/start.sock"
probe_start() { ( cd "$APP" && env PROBE_SOCK="$START_SOCK" PROBE_IDLE=45 \
  node "$REPO_ROOT/$S/probe.mjs" start >"$W/out" 2>"$W/err" ); }
# PROBE_IDLE is 45s and the daemon self-closes on it, so a `start` that blocked would sit here far
# longer than the daemon takes to boot. 30s is generous for a stub launch and far under 45.
start_began=$(date +%s)
probe_start
rc=$?
start_took=$(( $(date +%s) - start_began ))
if [ "$rc" -eq 0 ] && [ "$start_took" -lt 30 ]; then
  ok "start returns once the daemon is listening (exit 0 in ${start_took}s) rather than becoming it"
else
  bad "start — exit $rc after ${start_took}s, stderr: $(tr '\n' ' ' <"$W/err" | tail -c 200)"
fi
# Backgrounding must cost no diagnostics: the socket path and the effective parameters are printed
# BEFORE it returns, which is what an inline run would have shown.
if grep -qF "socket $START_SOCK" "$W/err"; then
  ok "  start names the socket it left the daemon on"
else
  bad "  start does not print the socket path — stderr: $(tr '\n' ' ' <"$W/err" | tail -c 200)"
fi
if grep -qF 'BASE_URL=' "$W/err" && grep -qF 'RECORD_HAR=' "$W/err" \
   && grep -qF 'STORAGE_STATE=' "$W/err"; then
  ok "  start prints the effective BASE_URL/RECORD_HAR/STORAGE_STATE"
else
  bad "  start omits the effective parameters — stderr: $(tr '\n' ' ' <"$W/err" | tail -c 240)"
fi
# The daemon it left behind is real: a send against that socket answers without starting anything.
( cd "$APP" && env PROBE_SOCK="$START_SOCK" node "$REPO_ROOT/$S/probe.mjs" send '[{"cmd":"eval","expression":"1"}]' >"$W/out" 2>"$W/err" )
if [ $? -eq 0 ] && grep -qF '[1] eval -> 1' "$W/out" && ! grep -qF 'starting one first' "$W/err"; then
  ok "  the daemon start left behind answers a later send"
else
  bad "  send after start — stdout: $(head -c 160 "$W/out"), stderr: $(tail -c 160 "$W/err")"
fi
# An uncertain agent re-issuing `start` must not cost a live recon context: it is a no-op that SAYS
# so and exits 0. The old behaviour was exit 1, which reads as a failure worth recovering from.
probe_start
rc=$?
if [ "$rc" -eq 0 ] && grep -qF 'already listening' "$W/err"; then
  ok "a second start against a live daemon is a no-op that says so — exit 0"
else
  bad "second start — exit $rc, stderr: $(tr '\n' ' ' <"$W/err" | tail -c 200)"
fi
# ...and it did not replace the socket: the same daemon still answers.
( cd "$APP" && env PROBE_SOCK="$START_SOCK" node "$REPO_ROOT/$S/probe.mjs" send '[{"cmd":"eval","expression":"2"}]' >"$W/out" 2>"$W/err" )
if [ $? -eq 0 ] && grep -qF '[1] eval -> 2' "$W/out"; then
  ok "  the second start left the running daemon intact"
else
  bad "  daemon after second start — stdout: $(head -c 160 "$W/out")"
fi
( cd "$APP" && env PROBE_SOCK="$START_SOCK" node "$REPO_ROOT/$S/probe.mjs" close >/dev/null 2>&1 )

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
