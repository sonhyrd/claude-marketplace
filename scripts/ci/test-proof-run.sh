#!/usr/bin/env bash
# Process-boundary tests for proof-run.mjs — the module that owns Step 7's mechanics.
#
# The seam is the module's process boundary and nothing else: exit code, the JSON summary line, the
# argv handed to the runner, and the state of the working tree afterwards. Nothing is reached into,
# nothing is exported for the test's benefit, and no assertion is made on a message's wording beyond
# the tokens the contract names.
#
# THE ARGV *IS* THE CONTRACT. Both defects this module exists to prevent were wrong arguments — a
# `<testDir>/**/*.spec.*` pathspec that returns nothing on a flat test dir, and an inherited
# `webServer` entry pointed the wrong way — so a suite asserting only exit codes would have caught
# neither. The runner is therefore observed, not mocked out: a recording `npx` shim is placed ahead
# of the real one on PATH, so the invocation under assertion is the invocation a real run makes.
#
# No browser is ever launched, and nothing touches the network.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1
S="$REPO_ROOT/skills/pw-prove/scripts/proof-run.mjs"

pass=0; fail=0
ok()  { echo "  [PASS] $1"; pass=$((pass + 1)); }
bad() { echo "  [FAIL] $1"; fail=$((fail + 1)); }

W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
BIN="$W/bin"; mkdir -p "$BIN"

# The recording shim. It writes the argv it was handed one word per line (so an argument carrying a
# space cannot be mistaken for two), records whether the results directory was standing when the
# runner started — which is how "cleared BEFORE the run" is observable at all — and replays a
# canned exit code and stdout from files the case sets.
# The type check goes through the same `npx` the runner does, so the shim splits on which tool it
# was handed: the two invocations are separate contracts and an assertion about one must never be
# satisfiable by the other.
cat > "$BIN/npx" <<'SHIM'
#!/usr/bin/env bash
case " $* " in
  *" tsc "*)
    : > "$NPX_TSC_ARGV"
    for a in "$@"; do printf '%s\n' "$a" >> "$NPX_TSC_ARGV"; done
    [ -f "$NPX_TSC_STDOUT" ] && cat "$NPX_TSC_STDOUT"
    exit "${NPX_TSC_EXIT:-0}"
    ;;
esac
: > "$NPX_ARGV"
for a in "$@"; do printf '%s\n' "$a" >> "$NPX_ARGV"; done
if [ -d "test-results" ]; then echo present > "$NPX_PRESTATE"; else echo absent > "$NPX_PRESTATE"; fi
# The bound recording reaches the run through the environment, so the environment is recorded too.
printf '%s
' "${PW_PROVE_HAR-<unset>}" > "$NPX_ENV_HAR"
# The filming run's per-run values arrive as ENVIRONMENT, not argv, so the shim records them too —
# otherwise "carries the effective viewport it was given" would be unobservable at this boundary.
{ printf 'PW_PROVE_CLIP=%s
' "${PW_PROVE_CLIP-}"
  printf 'PW_PROVE_W=%s
' "${PW_PROVE_W-}"
  printf 'PW_PROVE_H=%s
' "${PW_PROVE_H-}"; } > "$NPX_ENV"
# A filming run leaves webms behind; the shim stands in for that so the frame phase has clips.
for c in ${NPX_MAKE_CLIPS-}; do mkdir -p "test-results/$c"; printf 'webm
' > "test-results/$c/video.webm"; done
# The failure the mutation verb exists to catch: a run that writes over the delivered evidence.
[ -n "${NPX_CLOBBER-}" ] && rm -rf test-results
# A run that leaves something behind in the tree — the residue the post-revert check is for.
[ -n "${NPX_STRAY-}" ] && printf 'left behind\n' > "$NPX_STRAY"
[ -f "$NPX_STDOUT" ] && cat "$NPX_STDOUT"
exit "${NPX_EXIT:-0}"
SHIM
chmod +x "$BIN/npx"

# The video tooling, faked at the same boundary. `-version` decides whether the tooling is USABLE at
# all (video.mjs probes by running each tool), so a case turns it off by setting FAKE_VIDEO=absent.
# A clip whose path carries `good` probes as ten readable seconds and yields a frame; anything else
# is unreadable, which is the "a clip yielded no frame" path.
cat > "$BIN/ffprobe" <<'FF'
#!/usr/bin/env bash
[ "${FAKE_VIDEO-}" = absent ] && exit 1
[ "$1" = "-version" ] && { echo "ffprobe fake"; exit 0; }
file="${@: -1}"
case "$file" in
  *good*) echo '{"streams":[{"codec_type":"video","codec_name":"vp8","width":1600,"height":900}],"format":{"duration":"10.000000"}}'; exit 0 ;;
  *) echo "unreadable" >&2; exit 1 ;;
esac
FF
cat > "$BIN/ffmpeg" <<'FF'
#!/usr/bin/env bash
[ "${FAKE_VIDEO-}" = absent ] && exit 1
[ "$1" = "-version" ] && { echo "ffmpeg fake"; exit 0; }
target="${@: -1}"
case "$target" in
  *.png) printf 'PNG' > "$target"; exit 0 ;;
esac
exit 0
FF
chmod +x "$BIN/ffprobe" "$BIN/ffmpeg"

export NPX_ARGV="$W/argv" NPX_PRESTATE="$W/prestate" NPX_STDOUT="$W/runner-out" NPX_ENV="$W/env"
export NPX_TSC_ARGV="$W/tsc-argv" NPX_TSC_STDOUT="$W/tsc-out" NPX_ENV_HAR="$W/env-har"
: > "$NPX_STDOUT"; : > "$NPX_TSC_STDOUT"; : > "$NPX_TSC_ARGV"
: > "$NPX_ENV"

# One fixture repository per case group: a real git repo, because the spec set is resolved from a
# real merge base. The test directory is FLAT — that is the shape the broken pathspec returned
# nothing on, so it is the shape the fixture must have.
new_repo() {
  R="$W/repo-$1"; rm -rf "$R"; mkdir -p "$R/e2e"
  git -C "$R" init -q -b main
  git -C "$R" config user.email t@t.test
  git -C "$R" config user.name t
  printf 'x\n' > "$R/README.md"
  printf '{}\n' > "$R/playwright.proof.config.ts"
  git -C "$R" add -A && git -C "$R" commit -qm base
}

run() { ( cd "$R" && PATH="$BIN:$PATH" PWPROVE_LEDGER="$W/ledger.jsonl" \
  FAKE_VIDEO="${FAKE_VIDEO-}" NPX_MAKE_CLIPS="${NPX_MAKE_CLIPS-}" NPX_CLOBBER="${NPX_CLOBBER-}" \
  NPX_STRAY="${NPX_STRAY-}" \
  node "$S" "$@" >"$W/out" 2>"$W/err" ); }

env_has() {
  if grep -qxF -- "$2" "$NPX_ENV"; then ok "$1"; else bad "$1 — env lacks '$2': $(tr '\n' ' ' < "$NPX_ENV")"; fi
}

summary() { grep -m1 '^PWPROVE_SUMMARY ' "$W/out" | sed 's/^PWPROVE_SUMMARY //'; }
# A path the summary does not carry prints <missing> rather than a stack trace, so a red case shows
# what it asserted instead of drowning the run in one.
jq_field() { summary | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);process.stdout.write(String(eval("o."+process.argv[1])))}catch{process.stdout.write("<missing>")}})' "$1"; }
argv_has() {
  if grep -qxF -- "$2" "$NPX_ARGV"; then ok "$1"; else bad "$1 — argv lacks '$2': $(tr '\n' ' ' < "$NPX_ARGV")"; fi
}
# The scrubber is a sibling module invoked by absolute path, so it cannot be observed with a PATH
# shim the way the runner is. The argv the module built travels in the summary instead, and that is
# what is asserted here — the same contract, read at the same process boundary.
bind_argv() { jq_field 'phases.har_bind.argv.join("\u0001")'; }
bind_argv_has() {
  if bind_argv | tr '\001' '\n' | grep -qxF -- "$2"; then ok "$1"
  else bad "$1 — bind argv lacks '$2': $(bind_argv | tr '\001' ' ')"; fi
}
bind_argv_lacks() {
  if bind_argv | tr '\001' '\n' | grep -qxF -- "$2"; then bad "$1 — bind argv carries '$2'"
  else ok "$1"; fi
}
tsc_argv_has() {
  if grep -qxF -- "$2" "$NPX_TSC_ARGV"; then ok "$1"; else bad "$1 — tsc argv lacks '$2': $(tr '\n' ' ' < "$NPX_TSC_ARGV")"; fi
}

echo "-- usage --"
new_repo usage
run
[ "$?" = 1 ] && ok "no verb is a usage error (exit 1)" || bad "expected exit 1 with no verb"
run frobnicate
[ "$?" = 1 ] && ok "an unknown verb is a usage error (exit 1)" || bad "expected exit 1 for an unknown verb"
run audit --config playwright.proof.config.ts --test-dir e2e --base main --bogus
[ "$?" = 1 ] && ok "an unknown flag is a usage error (exit 1)" || bad "expected exit 1 for an unknown flag"

echo ""
echo "-- unreadable input --"
new_repo unreadable
run audit --config nope.config.ts --test-dir e2e --base main
[ "$?" = 2 ] && ok "a config path that does not exist is exit 2" || bad "expected exit 2 for a missing config"
run audit --config playwright.proof.config.ts --test-dir e2e --base main --written e2e/ghost.spec.ts
[ "$?" = 2 ] && ok "a --written spec that is not on disk is exit 2" || bad "expected exit 2 for a missing written spec"

echo ""
echo "-- spec-set resolution over a FLAT test directory (the shape that returned nothing) --"
new_repo flat
git -C "$R" checkout -qb feature
printf 'test\n' > "$R/e2e/carried-a.spec.ts"
printf 'test\n' > "$R/e2e/carried-b.test.tsx"
printf 'test\n' > "$R/e2e/notes.md"
printf 'test\n' > "$R/src-change.ts"
git -C "$R" add -A && git -C "$R" commit -qm "specs on the branch"
printf 'test\n' > "$R/e2e/written.spec.ts"   # this run's own spec: untracked by construction
NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/written.spec.ts
rc=$?
[ "$rc" = 0 ] && ok "a green audit run exits 0" || { bad "exit $rc"; head -5 "$W/err"; }
for spec in e2e/carried-a.spec.ts e2e/carried-b.test.tsx e2e/written.spec.ts; do
  argv_has "the flat-dir spec set reaches the runner: $spec" "$spec"
done
if grep -qxF -- "e2e/notes.md" "$NPX_ARGV" || grep -qxF -- "src-change.ts" "$NPX_ARGV"; then
  bad "a non-spec file leaked into the spec set"
else
  ok "the extension filter runs AFTER the directory pathspec — non-specs are dropped"
fi

echo ""
echo "-- carried vs written tagging --"
[ "$(jq_field 'specs.find(s=>s.path=="e2e/carried-a.spec.ts").tag')" = carried ] \
  && ok "a spec the diff carries is tagged carried" || bad "carried tag wrong: $(summary)"
[ "$(jq_field 'specs.find(s=>s.path=="e2e/written.spec.ts").tag')" = written ] \
  && ok "the spec this run wrote is tagged written" || bad "written tag wrong: $(summary)"

echo ""
echo "-- the runner invocation --"
argv_has "the no-install form" "--no-install"
argv_has "the runner" "playwright"
argv_has "the subcommand" "test"
argv_has "the project defaults to the browser the pipeline launches" "--project=chromium"
argv_has "the proof config" "playwright.proof.config.ts"
if grep -qE '^(-j|--workers)' "$NPX_ARGV"; then
  bad "a worker override reached the runner (ADR-0017 forbids one)"
else
  ok "no worker override — concurrency stays Playwright's (ADR-0017)"
fi

echo ""
echo "-- the results directory is cleared BEFORE the run --"
new_repo cleared
printf 'test\n' > "$R/e2e/a.spec.ts"
mkdir -p "$R/test-results/stale-run"
printf 'old\n' > "$R/test-results/stale-run/video.webm"
NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts
[ "$(cat "$NPX_PRESTATE")" = absent ] \
  && ok "test-results was gone when the runner started" || bad "stale test-results survived into the run"
[ -f "$R/test-results/stale-run/video.webm" ] \
  && bad "the stale webm is still on disk" || ok "the stale webm from an earlier run is gone"

echo ""
echo "-- an empty spec set stops the run --"
new_repo empty
: > "$NPX_ARGV"   # truncate, so "the runner was never invoked" is observable rather than inherited
NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main
[ "$?" = 3 ] && ok "an empty spec set is exit 3, its own code" || bad "expected exit 3 on an empty set"
[ -s "$NPX_ARGV" ] && bad "the runner was invoked over an empty set" || ok "nothing was run over an empty set"

echo ""
echo "-- the single-test filter the heal loop uses --"
new_repo filter
printf 'test\n' > "$R/e2e/a.spec.ts"
: > "$NPX_ARGV"
NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts --grep "saves the profile"
argv_has "the filter flag" "-g"
argv_has "the filter value travels as ONE argument" "saves the profile"

echo ""
echo "-- module state is excluded repo-locally, never through the project's .gitignore --"
grep -qxF '.pw-prove/' "$R/.git/info/exclude" \
  && ok ".pw-prove/ is in .git/info/exclude" || bad ".pw-prove/ was not excluded repo-locally"
[ -f "$R/.gitignore" ] && bad "the project's .gitignore was written to" || ok "the project's .gitignore is untouched"
[ -z "$(git -C "$R" status --porcelain --ignored=no -- .pw-prove)" ] \
  && ok "the module's state leaves no stray diff for Step 8 to explain" || bad ".pw-prove shows in git status"

echo ""
echo "-- a git WORKTREE, where .git is a file and not a directory --"
new_repo worktree
printf 'test\n' > "$R/e2e/a.spec.ts"
git -C "$R" add -A && git -C "$R" commit -qm spec
WT="$W/wt-checkout"
git -C "$R" worktree add -q -b wt "$WT" 2>/dev/null
if [ -f "$WT/.git" ]; then
  ( cd "$WT" && PATH="$BIN:$PATH" PWPROVE_LEDGER="$W/ledger.jsonl" NPX_EXIT=0 \
    node "$S" audit --config playwright.proof.config.ts --test-dir e2e --base main \
      --written e2e/a.spec.ts >"$W/out" 2>"$W/err" )
  [ "$?" = 0 ] && ok "the verb runs in a worktree (exclude resolved via --git-common-dir)" \
    || { bad "worktree run failed"; head -2 "$W/err"; }
  grep -qxF '.pw-prove/' "$R/.git/info/exclude" \
    && ok "the entry lands in the shared common exclude file" || bad "no exclude entry from the worktree"
else
  echo "  [SKIP] worktree: git worktree add unavailable"
fi

echo ""
echo "-- tests red, and the failure signature --"
new_repo red
printf 'test\n' > "$R/e2e/a.spec.ts"
cat > "$W/runner-out" <<'OUT'
  1) [chromium] › e2e/a.spec.ts:12:5 › saves the profile
    TimeoutError: locator.click: Timeout 30000ms exceeded.
    Call log:
      - waiting for locator('[data-testid="save"]')
OUT
NPX_EXIT=1 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts
[ "$?" = 6 ] && ok "a red run is exit 6" || bad "expected exit 6 on a red run"
[ "$(jq_field 'signature.error_class')" = TimeoutError ] \
  && ok "the summary carries the error class" || bad "error class wrong: $(summary)"
[ "$(jq_field 'signature.locator')" = '[data-testid="save"]' ] \
  && ok "the summary carries the failing locator" || bad "locator wrong: $(summary)"
[ -f "$R/.pw-prove/audit-state.json" ] \
  && ok "the signature is persisted under the run's dot-directory" || bad "no persisted state"

echo ""
echo "-- the no-progress checkpoint: an unchanged signature is refused --"
NPX_EXIT=1 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts
[ "$?" = 7 ] && ok "repeating an unchanged signature is exit 7, not exit 6" \
  || bad "expected exit 7 for an unchanged signature"
grep -q "signature" "$W/err" && ok "the refusal names the signature" || bad "refusal message is silent about why"

echo ""
echo "-- a CHANGED signature continues the loop --"
# Its own fixture: a stalled loop stays stalled by design, so convergence must be measured from a
# loop that never stalled rather than from the one the previous case just ended.
new_repo converging
printf 'test\n' > "$R/e2e/a.spec.ts"
cat > "$W/runner-out" <<'OUT'
  1) [chromium] › e2e/a.spec.ts:12:5 › saves the profile
    TimeoutError: locator.click: Timeout 30000ms exceeded.
    Call log:
      - waiting for locator('[data-testid="save"]')
OUT
NPX_EXIT=1 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts
cat > "$W/runner-out" <<'OUT'
  1) [chromium] › e2e/a.spec.ts:14:5 › saves the profile
    Error: expect(locator).toBeVisible() failed
    Locator: locator('#saved-banner')
OUT
NPX_EXIT=1 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts
[ "$?" = 6 ] && ok "a different signature is exit 6 — the spec is converging" \
  || bad "a changed signature was refused"

echo ""
echo "-- a stalled loop is refused BEFORE the next run is spent --"
R="$W/repo-red"   # the fixture whose loop stalled two cases above
prev=$(wc -l < "$NPX_ARGV")
NPX_EXIT=1 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts
[ "$?" = 7 ] && ok "the invocation after a stall is exit 7" || bad "a stalled loop was re-entered"
[ "$(wc -l < "$NPX_ARGV")" = "$prev" ] \
  && ok "a stalled loop spends no run at all" || bad "the runner ran after the loop stalled"

echo ""
echo "-- the attempt bound: three converging attempts, then no fourth --"
new_repo bound
printf 'test\n' > "$R/e2e/a.spec.ts"
for n in 1 2 3; do
  cat > "$W/runner-out" <<OUT
  1) [chromium] › e2e/a.spec.ts:1$n:5 › saves the profile
    Error: expect(locator).toBeVisible() failed
    Locator: locator('#attempt-$n')
OUT
  NPX_EXIT=1 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
    --written e2e/a.spec.ts
  rc=$?
  [ "$rc" = 6 ] || bad "attempt $n: exit $rc, wanted 6 (each signature differs, so the loop converges)"
done
ok "three attempts with moving signatures each spend a run and report red"
prev=$(wc -l < "$NPX_ARGV")
cat > "$W/runner-out" <<'OUT'
  1) [chromium] › e2e/a.spec.ts:14:5 › saves the profile
    Error: expect(locator).toBeVisible() failed
    Locator: locator('#attempt-4')
OUT
NPX_EXIT=1 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts
[ "$?" = 7 ] && ok "a fourth attempt is refused with exit 7" || bad "the bound of 3 did not hold"
[ "$(wc -l < "$NPX_ARGV")" = "$prev" ] \
  && ok "the refused attempt spends no run" || bad "the runner was invoked past the bound"

echo ""
echo "-- phase 1: the type check, and which tsconfig the verb takes --"
# The branch is the verb's, not the reader's: there is deliberately no flag to point it elsewhere.
new_repo tsc-e2e
printf 'test\n' > "$R/e2e/a.spec.ts"
printf '{}\n' > "$R/tsconfig.json"
printf '{}\n' > "$R/e2e/tsconfig.json"
: > "$NPX_TSC_ARGV"
NPX_TSC_EXIT=0 NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts
[ "$?" = 0 ] && ok "a clean type check lets the audit run" || { bad "type check blocked a clean run"; head -3 "$W/err"; }
tsc_argv_has "the type check never auto-installs" "--no-install"
tsc_argv_has "the type checker" "tsc"
tsc_argv_has "it emits nothing" "--noEmit"
tsc_argv_has "the e2e tsconfig wins when the project has one" "e2e/tsconfig.json"
[ "$(jq_field 'phases.typecheck.status')" = ok ] \
  && ok "the summary carries the type-check phase" || bad "typecheck phase missing: $(summary)"
[ "$(jq_field 'phases.typecheck.tsconfig')" = e2e/tsconfig.json ] \
  && ok "the summary names the tsconfig the phase used" || bad "tsconfig not named: $(summary)"

new_repo tsc-root
printf 'test\n' > "$R/e2e/a.spec.ts"
printf '{}\n' > "$R/tsconfig.json"
: > "$NPX_TSC_ARGV"
NPX_TSC_EXIT=0 NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts
tsc_argv_has "the root tsconfig is the fallback when there is no e2e one" "tsconfig.json"
if grep -qxF -- "e2e/tsconfig.json" "$NPX_TSC_ARGV"; then
  bad "the verb named an e2e tsconfig that is not on disk"
else
  ok "no e2e tsconfig is invented when the project has none"
fi

new_repo tsc-none
printf 'test\n' > "$R/e2e/a.spec.ts"
: > "$NPX_TSC_ARGV"
NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts
[ "$?" = 0 ] && ok "a project with no tsconfig runs anyway" || bad "a JS project was blocked by the type check"
[ -s "$NPX_TSC_ARGV" ] && bad "the type checker ran with no tsconfig to point it at" \
  || ok "the phase is skipped rather than guessed at"
[ "$(jq_field 'phases.typecheck.status')" = skipped ] \
  && ok "the summary says the phase was skipped" || bad "skip not reported: $(summary)"

echo ""
echo "-- a type error stops the run before anything expensive --"
new_repo tsc-red
printf 'test\n' > "$R/e2e/a.spec.ts"
printf '{}\n' > "$R/e2e/tsconfig.json"
printf 'e2e/a.spec.ts(3,7): error TS2322: Type string is not assignable to type number.\n' > "$W/tsc-out"
: > "$NPX_ARGV"
NPX_TSC_EXIT=2 NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts
[ "$?" = 4 ] && ok "a type error is exit 4, its own code" || bad "expected exit 4 on a type error"
[ -s "$NPX_ARGV" ] && bad "the browser run was paid for after a type error" \
  || ok "no browser run is paid for to learn the spec does not compile"
[ "$(jq_field 'phases.typecheck.status')" = failed ] \
  && ok "the summary carries the failed phase" || bad "failure not in summary: $(summary)"
grep -q 'TS2322' "$W/err" && ok "the refusal carries the compiler's own diagnosis" \
  || bad "the type error was swallowed"
: > "$W/tsc-out"

echo ""
echo "-- phase 2: the HAR bind, delegated to the scrubber --"
# A canonical, portless recording with every secret placeheld — the committed shape. Replay matches
# on exact URL equality, so it has to be bound to this run's origin before any test can match it.
write_har() { printf '%s\n' "{\"log\":{\"version\":\"1.2\",\"entries\":[{\"request\":{\"method\":\"GET\",\"url\":\"$2\",\"headers\":[],\"queryString\":[],\"cookies\":[]},\"response\":{\"status\":200,\"headers\":[],\"cookies\":[],\"redirectURL\":\"\",\"content\":{\"text\":\"{}\"}}}]}}" > "$1"; }

new_repo har-ok
printf 'test\n' > "$R/e2e/a.spec.ts"
write_har "$R/e2e/feature.api.har" "http://localhost/api/items"
: > "$NPX_ENV_HAR"
NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts --har e2e/feature.api.har --origin http://127.0.0.1:4173
[ "$?" = 0 ] && ok "a bindable recording lets the audit run" || { bad "bind blocked a clean run"; head -5 "$W/err"; }
[ -f "$R/.pw-prove/feature.api.har" ] \
  && ok "the bound copy lands under the run's gitignored dot-directory" || bad "no bound copy on disk"
grep -q '127.0.0.1:4173' "$R/.pw-prove/feature.api.har" \
  && ok "the recording is bound to THIS run's origin" || bad "the bind did not re-point the origin"
grep -q 'localhost/api' "$R/e2e/feature.api.har" \
  && ok "the committed recording stays canonical" || bad "the committed HAR was rewritten"
[ "$(cat "$NPX_ENV_HAR")" = "$R/.pw-prove/feature.api.har" ] \
  && ok "the bound recording is reachable by the run that follows (PW_PROVE_HAR)" \
  || bad "PW_PROVE_HAR did not reach the runner: $(cat "$NPX_ENV_HAR")"
[ "$(jq_field 'phases.har_bind.status')" = ok ] \
  && ok "the summary carries the bind phase" || bad "bind phase missing: $(summary)"

new_repo har-none
printf 'test\n' > "$R/e2e/a.spec.ts"
NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts
[ "$?" = 0 ] && ok "a project with no recording runs anyway" || bad "a project with no HAR was blocked"
[ "$(jq_field 'phases.har_bind.status')" = skipped ] \
  && ok "the bind phase is skipped rather than failed" || bad "skip not reported: $(summary)"

new_repo har-ghost
printf 'test\n' > "$R/e2e/a.spec.ts"
NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts --har e2e/ghost.api.har
[ "$?" = 2 ] && ok "a --har that is not on disk is exit 2, not a silent skip" \
  || bad "a named-but-absent recording did not stop the run"

echo ""
echo "-- a bind that cannot be made safe stops the run under its own code --"
new_repo har-unbound
printf 'test\n' > "$R/e2e/a.spec.ts"
write_har "$R/e2e/feature.api.har" "http://localhost/api/items?token=__PWPROVE_SCRUBBED__"
: > "$NPX_ARGV"
NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts --har e2e/feature.api.har --origin http://127.0.0.1:4173
[ "$?" = 5 ] && ok "a placeholder in the replay match key is exit 5" \
  || bad "expected exit 5 for an unbindable recording"
grep -q '__PWPROVE_SCRUBBED__' "$W/err" && ok "the refusal names the placeholder" \
  || bad "the refusal does not say which placeholder is unbindable"
[ -s "$NPX_ARGV" ] && bad "the run was paid for over a recording whose every read would abort" \
  || ok "nothing was run over an unbindable recording"
[ "$(jq_field 'phases.har_bind.reason')" = unbound-placeholder ] \
  && ok "the summary distinguishes an unbindable key from a committable output" \
  || bad "bind reason wrong: $(summary)"

new_repo har-committable
printf 'test\n' > "$R/e2e/a.spec.ts"
printf '!.pw-prove/\n' > "$R/.gitignore"   # the project un-ignores the run's own directory
write_har "$R/e2e/feature.api.har" "http://localhost/api/items"
: > "$NPX_ARGV"
NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts --har e2e/feature.api.har --origin http://127.0.0.1:4173
[ "$?" = 5 ] && ok "a bind output git would commit is exit 5" \
  || bad "expected exit 5 for a committable bind output"
[ "$(jq_field 'phases.har_bind.reason')" = committable-output ] \
  && ok "the summary names the committable output" || bad "bind reason wrong: $(summary)"
[ -s "$NPX_ARGV" ] && bad "the run was paid for after a refused bind" || ok "nothing was run"

echo ""
echo "-- the argv handed to the scrubber, which is this phase's contract --"
R="$W/repo-har-ok"   # the bindable fixture from above; its summary is the one on disk
NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts --har e2e/feature.api.har --origin http://127.0.0.1:4173
bind_argv_has "the scrubber's bind mode" "bind"
bind_argv_has "the recording it was pointed at" "e2e/feature.api.har"
bind_argv_has "the destination is fixed under the run's own directory" ".pw-prove/feature.api.har"
bind_argv_has "the origin flag" "--origin"
bind_argv_has "this run's origin travels as ONE argument" "http://127.0.0.1:4173"
bind_argv_lacks "no bindings file is invented when none was given" "--bindings"

echo ""
echo "-- the documented branch where the project owns rebinding: --origin is dropped --"
new_repo har-no-origin
printf 'test\n' > "$R/e2e/a.spec.ts"
write_har "$R/e2e/feature.api.har" "http://localhost/api/items"
NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts --har e2e/feature.api.har
[ "$?" = 0 ] && ok "a bind with no --origin still runs" || { bad "the no-origin branch failed"; head -3 "$W/err"; }
bind_argv_lacks "an origin the caller did not give is never substituted" "--origin"
bind_argv_has "the recording is still bound" "e2e/feature.api.har"
grep -q 'localhost/api' "$R/.pw-prove/feature.api.har" \
  && ok "the recorded origin is left for the project's own rebinder" || bad "the origin was re-pointed anyway"

echo ""
echo "-- --bindings resolves a placeholder that sits in the match key --"
new_repo har-bindings
printf 'test\n' > "$R/e2e/a.spec.ts"
write_har "$R/e2e/feature.api.har" "http://localhost/api/items?token=__PWPROVE_SCRUBBED__"
mkdir -p "$R/.pw-prove"
printf '{"__PWPROVE_SCRUBBED__":"value-this-run-supplied"}\n' > "$R/.pw-prove/bindings.json"
NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts --har e2e/feature.api.har --origin http://127.0.0.1:4173 \
  --bindings .pw-prove/bindings.json
[ "$?" = 0 ] && ok "a bindings file turns exit 5 back into a run" || { bad "the bindings branch failed"; head -5 "$W/err"; }
bind_argv_has "the bindings flag reaches the scrubber" "--bindings"
bind_argv_has "the bindings path travels as ONE argument" ".pw-prove/bindings.json"
grep -q 'value-this-run-supplied' "$R/.pw-prove/feature.api.har" \
  && ok "the match key now carries this run's own value" || bad "the placeholder survived into the bound copy"
run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts --har e2e/feature.api.har --bindings .pw-prove/ghost.json
[ "$?" = 2 ] && ok "a --bindings file that is not on disk is exit 2" || bad "a missing bindings file was ignored"

echo ""
echo "-- exits that stop before the phases report not-reached, never skipped --"
# `skipped` would claim the project has no tsconfig and no recording; nothing of the sort was asked.
new_repo not-reached
: > "$NPX_TSC_ARGV"
NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main
[ "$?" = 3 ] && ok "an empty spec set still stops first" || bad "expected exit 3"
[ "$(jq_field 'phases.typecheck.status')" = not-reached ] \
  && ok "an empty spec set reports the type check as not-reached" || bad "status wrong: $(summary)"
[ "$(jq_field 'phases.har_bind.status')" = not-reached ] \
  && ok "an empty spec set reports the bind as not-reached" || bad "status wrong: $(summary)"
[ -s "$NPX_TSC_ARGV" ] && bad "the type checker ran over a spec set that resolved empty" \
  || ok "an empty spec set buys no type check"

R="$W/repo-red"   # the fixture whose loop stalled earlier
: > "$NPX_TSC_ARGV"
NPX_EXIT=1 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts
[ "$?" = 7 ] && ok "a stalled loop still refuses first" || bad "expected exit 7"
[ "$(jq_field 'phases.typecheck.status')" = not-reached ] \
  && ok "a checkpoint refusal reports the phases as not-reached" || bad "status wrong: $(summary)"
[ -s "$NPX_TSC_ARGV" ] && bad "a stalled loop paid for a type check" \
  || ok "a stalled loop buys nothing at all — not even a type check"
NPX_EXIT=0

echo ""
echo "-- the phases run in order: type check, then bind, then the run --"
new_repo phase-order
printf 'test\n' > "$R/e2e/a.spec.ts"
printf '{}\n' > "$R/e2e/tsconfig.json"
write_har "$R/e2e/feature.api.har" "http://localhost/api/items"
: > "$NPX_ARGV"
NPX_TSC_EXIT=2 NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts --har e2e/feature.api.har --origin http://127.0.0.1:4173
[ "$?" = 4 ] && ok "the type error wins over the bind" || bad "expected exit 4"
[ -f "$R/.pw-prove/feature.api.har" ] && bad "the bind ran after the type check had already failed" \
  || ok "a failed type check costs no bind"
NPX_TSC_EXIT=0

echo ""
echo "-- a green run ends the loop and clears the budget --"
new_repo green
printf 'test\n' > "$R/e2e/a.spec.ts"
: > "$W/runner-out"
NPX_EXIT=0 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts
[ "$?" = 0 ] && ok "green is exit 0" || bad "expected exit 0"
[ "$(jq_field 'result')" = green ] && ok "the summary says green" || bad "result wrong: $(summary)"
[ "$(jq_field 'signature')" = null ] && ok "a green run carries no signature" || bad "signature not cleared"

echo ""
echo "-- one summary line, and one ledger line per invocation --"
[ "$(grep -c '^PWPROVE_SUMMARY ' "$W/out")" = 1 ] \
  && ok "exactly one JSON summary line on stdout" || bad "summary line count wrong"
if grep -m1 '^PWPROVE_RUN ' "$W/out" | grep -q '"phase":"audit"'; then
  ok "one ledger line, phase audit"
else
  bad "no PWPROVE_RUN line with phase audit: $(grep '^PWPROVE_RUN ' "$W/out")"
fi

echo ""
echo "=============================== film ==============================="

# A fixture whose spec CARRIES the clip-fidelity contract, and one that does not. The two differ in
# exactly one thing — the PW_PROVE_CLIP-gated dwell — because that is the hole the precondition
# exists to close: a real run passed the clip flag at Step 7 over a spec with no reader for it.
film_repo() {
  new_repo "$1"
  cat > "$R/playwright.config.ts" <<'CFG'
import { defineConfig } from '@playwright/test';
export default defineConfig({ use: { viewport: { width: 1600, height: 900 } } });
CFG
  cat > "$R/e2e/a.spec.ts" <<'SPEC'
import { test, expect } from '@playwright/test';
test('saves the profile', async ({ page }) => {
  await expect(page.getByText('Saved')).toBeVisible();
  // JUSTIFIED: proof-clip payoff hold. Runs only under PW_PROVE_CLIP.
  if (process.env.PW_PROVE_CLIP) await page.waitForTimeout(2500);
});
SPEC
  cat > "$R/e2e/no-dwell.spec.ts" <<'SPEC'
import { test, expect } from '@playwright/test';
test('saves the profile', async ({ page }) => {
  await expect(page.getByText('Saved')).toBeVisible();
});
SPEC
}

FILM_FLAGS=(--config playwright.proof.config.ts --test-dir e2e --base main
  --project-config playwright.config.ts --verdict deliberate:1600x900)

echo "-- usage: film's own required flags --"
film_repo film-usage
run film --config playwright.proof.config.ts --test-dir e2e --base main \
  --project-config playwright.config.ts
[ "$?" = 1 ] && ok "film without --verdict is a usage error (exit 1)" || bad "expected exit 1 without --verdict"
run film --config playwright.proof.config.ts --test-dir e2e --base main \
  --verdict deliberate:1600x900
[ "$?" = 1 ] && ok "film without --project-config is a usage error (exit 1)" \
  || bad "expected exit 1 without --project-config"
run film "${FILM_FLAGS[@]}" --verdict sideways:1600x900 --written e2e/a.spec.ts
[ "$?" = 1 ] && ok "a verdict that is neither pinned: nor deliberate: is a usage error" \
  || bad "expected exit 1 for a malformed verdict"
run audit --config playwright.proof.config.ts --test-dir e2e --base main --verdict deliberate:1600x900
[ "$?" = 1 ] && ok "a film-only flag on audit is a usage error, never silently ignored" \
  || bad "audit accepted --verdict"
run film --config playwright.proof.config.ts --test-dir e2e --base main \
  --project-config nope.config.ts --verdict deliberate:1600x900 --written e2e/a.spec.ts
[ "$?" = 2 ] && ok "a --project-config that does not exist is exit 2" \
  || bad "expected exit 2 for a missing project config"

echo ""
echo "-- the fidelity contract is a PRECONDITION of filming --"
film_repo film-precondition
: > "$NPX_ARGV"
NPX_EXIT=0 run film "${FILM_FLAGS[@]}" --written e2e/no-dwell.spec.ts
[ "$?" = 12 ] && ok "a spec with no PW_PROVE_CLIP reader refuses filming (exit 12)" \
  || bad "expected exit 12 when the spec carries no dwell"
[ -s "$NPX_ARGV" ] && bad "the runner filmed over a spec that carries no dwell" \
  || ok "nothing was filmed while the precondition stood"
[ "$(jq_field 'result')" = refused ] && ok "the summary says refused" || bad "result wrong: $(summary)"
[ "$(jq_field 'schema')" = 3 ] && ok "the summary declares its schema" || bad "schema wrong: $(summary)"

echo ""
echo "-- the precondition does not clear the results directory --"
film_repo film-preserve
mkdir -p "$R/test-results/earlier-run"
printf 'old\n' > "$R/test-results/earlier-run/video.webm"
NPX_EXIT=0 run film "${FILM_FLAGS[@]}" --written e2e/no-dwell.spec.ts
[ -f "$R/test-results/earlier-run/video.webm" ] \
  && ok "a refused film leaves the previous run's evidence standing" \
  || bad "a refused film deleted the results directory"

echo ""
echo "-- the filming run itself --"
film_repo film-green
git -C "$R" checkout -qb feature
printf 'test\n' > "$R/e2e/carried.spec.ts"
cat > "$R/e2e/carried.spec.ts" <<'SPEC'
import { test, expect } from '@playwright/test';
test('carried scenario', async ({ page }) => {
  await expect(page.getByText('Saved')).toBeVisible();
  // JUSTIFIED: proof-clip payoff hold.
  if (process.env.PW_PROVE_CLIP) await page.waitForTimeout(2500);
});
SPEC
rm -f "$R/e2e/no-dwell.spec.ts"
git -C "$R" add -A && git -C "$R" commit -qm "specs on the branch"
mkdir -p "$R/test-results/stale-run"
printf 'old\n' > "$R/test-results/stale-run/video.webm"
: > "$NPX_ARGV"
NPX_MAKE_CLIPS="good-one good-two" NPX_EXIT=0 run film "${FILM_FLAGS[@]}" --written e2e/a.spec.ts
rc=$?
[ "$rc" = 0 ] && ok "a green filming run exits 0" || { bad "exit $rc"; head -5 "$W/err"; }
[ "$(cat "$NPX_PRESTATE")" = absent ] \
  && ok "test-results was cleared BEFORE the filming run" || bad "stale test-results survived into the filming run"
argv_has "the no-install form" "--no-install"
argv_has "the subcommand" "test"
argv_has "the proof config" "playwright.proof.config.ts"
argv_has "the project defaults to the browser the pipeline launches" "--project=chromium"
argv_has "the spec this run wrote reaches the filming run" "e2e/a.spec.ts"
argv_has "the carried spec is filmed too" "e2e/carried.spec.ts"
if grep -qE '^(-j|--workers)' "$NPX_ARGV"; then
  bad "a worker override reached the filming run (ADR-0017 forbids one)"
else
  ok "no worker override on the filming run either (ADR-0017)"
fi
env_has "the clip flag is set on this run" "PW_PROVE_CLIP=1"
env_has "the effective viewport travels as PW_PROVE_W, never a fixed literal" "PW_PROVE_W=1600"
env_has "the effective viewport travels as PW_PROVE_H" "PW_PROVE_H=900"

echo ""
echo "-- the clips and their measured durations are in the summary --"
NPX_MAKE_CLIPS="good-one good-two" NPX_EXIT=0 run film "${FILM_FLAGS[@]}" --written e2e/a.spec.ts
[ "$(jq_field 'clips.length')" = 2 ] && ok "both clips are in the summary" || bad "clip count wrong: $(summary)"
[ "$(jq_field 'clips[0].seconds')" = 10 ] \
  && ok "each clip carries its measured duration" || bad "duration wrong: $(summary)"
[ "$(jq_field 'clips[0].inspected')" = true ] \
  && ok "a clip that yielded a frame is inspected" || bad "inspected wrong: $(summary)"
[ -f "$R/test-results/good-one/video.frame.png" ] \
  && ok "one frame per clip is extracted beside it" || bad "no frame was written"

echo ""
echo "-- a clip that yields no frame is uninspected; the rest still get theirs --"
NPX_MAKE_CLIPS="good-one bad-two" NPX_EXIT=0 run film "${FILM_FLAGS[@]}" --written e2e/a.spec.ts
[ "$?" = 0 ] && ok "an unreadable clip still leaves the run passing" || bad "an unreadable clip failed the run"
[ "$(jq_field 'clips.find(c=>c.path.includes("bad-two")).inspected')" = false ] \
  && ok "the clip nothing could read is reported uninspected" || bad "uninspected wrong: $(summary)"
[ "$(jq_field 'clips.find(c=>c.path.includes("good-one")).inspected')" = true ] \
  && ok "the other clip still got its frame" || bad "a readable clip lost its frame: $(summary)"

echo ""
echo "-- absent video tooling leaves the run passing, every clip uninspected --"
FAKE_VIDEO=absent NPX_MAKE_CLIPS="good-one good-two" NPX_EXIT=0 run film "${FILM_FLAGS[@]}" \
  --written e2e/a.spec.ts
[ "$?" = 0 ] && ok "no ffmpeg is not a failed proof — exit 0" || bad "absent video tooling failed the run"
[ "$(jq_field 'clips.filter(c=>c.inspected).length')" = 0 ] \
  && ok "every clip is reported uninspected" || bad "a clip was claimed inspected with no tooling: $(summary)"
[ "$(jq_field 'result')" = green ] && ok "the run is still green" || bad "result wrong: $(summary)"
unset FAKE_VIDEO

echo ""
echo "-- a red filming run is exit 6, and nothing is claimed inspected --"
NPX_MAKE_CLIPS="good-one" NPX_EXIT=1 run film "${FILM_FLAGS[@]}" --written e2e/a.spec.ts
[ "$?" = 6 ] && ok "a red filming run is exit 6" || bad "expected exit 6 on a red filming run"

echo ""
echo "-- film shares the audit verb's spec-set resolution and empty-set stop --"
new_repo film-empty
cat > "$R/playwright.config.ts" <<'CFG'
import { defineConfig } from '@playwright/test';
export default defineConfig({ use: { viewport: { width: 1600, height: 900 } } });
CFG
: > "$NPX_ARGV"
NPX_EXIT=0 run film "${FILM_FLAGS[@]}"
[ "$?" = 3 ] && ok "an empty spec set stops film with the same exit 3" || bad "expected exit 3 on an empty set"
[ -s "$NPX_ARGV" ] && bad "the runner filmed an empty set" || ok "nothing was filmed over an empty set"
[ "$(jq_field 'viewport.width')" = 1600 ] \
  && ok "even the earliest stop reports the viewport the verb was given" || bad "viewport missing: $(summary)"

echo ""
echo "-- a DIFFERENT viewport is carried, not substituted --"
# Its own fixture, whose config pins a size nothing else in this suite uses. Re-running the case
# above with the same 1600x900 would pass against a module that hardcoded 1600x900, which is exactly
# the defect the "never a fixed literal" rule names — so the size has to MOVE, in the config text
# (which the fidelity precondition re-derives the verdict from) and in the verdict together.
film_repo film-viewport
cat > "$R/playwright.config.ts" <<'CFG'
import { defineConfig } from '@playwright/test';
export default defineConfig({ use: { viewport: { width: 1280, height: 720 } } });
CFG
: > "$NPX_ENV"
NPX_MAKE_CLIPS="good-one" NPX_EXIT=0 run film --config playwright.proof.config.ts \
  --test-dir e2e --base main --project-config playwright.config.ts \
  --verdict deliberate:1280x720 --written e2e/a.spec.ts
[ "$?" = 0 ] && ok "a 1280x720 project viewport films" || { bad "exit $?"; head -5 "$W/err"; }
env_has "the width the verdict declared is the width that travels" "PW_PROVE_W=1280"
env_has "the height the verdict declared is the height that travels" "PW_PROVE_H=720"
[ "$(jq_field 'viewport.width')" = 1280 ] \
  && ok "the summary states the viewport the run filmed at" || bad "viewport wrong: $(summary)"

echo ""
echo "-- one ledger line, phase film --"
film_repo film-ledger
NPX_MAKE_CLIPS="good-one" NPX_EXIT=0 run film "${FILM_FLAGS[@]}" --written e2e/a.spec.ts
# The delegated clip-fidelity calls emit ledger lines of their own — that is the convention, one
# record per entry point — so this asserts on THIS module's line rather than on the first one out.
if [ "$(grep -c '^PWPROVE_RUN .*"script":"proof-run.mjs".*"phase":"film"' "$W/out")" = 1 ]; then
  ok "one ledger line from proof-run.mjs, phase film"
else
  bad "no single PWPROVE_RUN line for proof-run.mjs with phase film: $(grep '^PWPROVE_RUN ' "$W/out")"
fi
[ "$(grep -c '^PWPROVE_SUMMARY ' "$W/out")" = 1 ] \
  && ok "exactly one JSON summary line from film" || bad "film summary line count wrong"

echo ""
echo "=============================== mutate ==============================="

# The mutation fixture is the one shape the verb is actually invoked in: a branch carrying a
# committed source file and a carried spec, this run's own written spec untracked beside them, and
# the source file MUTATED in the working tree — which is the state the agent leaves before it calls
# this verb. `test-results/` holds the clips the filming run just produced, and keeping them
# standing is the whole reason the verb exists separately.
# The isolated output is keyed by the repository it belongs to — proofs in parallel worktrees are
# this repo's normal shape and one machine-global directory would have them deleting each other's —
# so the test reads the path the run itself reports rather than reconstructing the key.
mut_out() { jq_field 'output'; }

mutate_repo() {
  new_repo "$1"
  git -C "$R" checkout -qb feature
  mkdir -p "$R/src"
  printf 'export const hint = "saved";\n' > "$R/src/app.ts"
  printf 'test\n' > "$R/e2e/carried.spec.ts"
  git -C "$R" add -A && git -C "$R" commit -qm "the change and its carried spec"
  printf 'test\n' > "$R/e2e/written.spec.ts"          # this run's own spec: untracked by construction
  printf 'export const hint = "";\n' > "$R/src/app.ts" # the mutation the agent chose
  for c in one two; do mkdir -p "$R/test-results/clip-$c"; printf 'webm\n' > "$R/test-results/clip-$c/video.webm"; done
}
MUT_FLAGS=(--config playwright.proof.config.ts --test-dir e2e --base main
  --written e2e/written.spec.ts --grep "saves the profile" --mutated src/app.ts)

echo "-- usage: mutate's own required flags, in both directions --"
mutate_repo mut-usage
run mutate --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/written.spec.ts --grep "saves the profile"
[ "$?" = 1 ] && ok "mutate without --mutated is a usage error (exit 1)" || bad "expected exit 1 without --mutated"
run mutate --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/written.spec.ts --mutated src/app.ts
[ "$?" = 1 ] && ok "mutate without --grep is a usage error (exit 1)" || bad "expected exit 1 without --grep"
run mutate --config playwright.proof.config.ts --test-dir e2e --base main \
  --grep "saves the profile" --mutated src/app.ts
[ "$?" = 1 ] && ok "mutate without --written is a usage error (exit 1)" \
  || bad "expected exit 1 without --written — the mutation scope is the scenarios this run wrote"
run audit --config playwright.proof.config.ts --test-dir e2e --base main --mutated src/app.ts
[ "$?" = 1 ] && ok "a mutate-only flag on audit is a usage error, never silently ignored" \
  || bad "audit accepted --mutated"
run mutate "${MUT_FLAGS[@]}" --verdict deliberate:1600x900
[ "$?" = 1 ] && ok "a film-only flag on mutate is a usage error" || bad "mutate accepted --verdict"

echo ""
echo "-- the mutation must be there, and revertible, BEFORE a run is paid for --"
mutate_repo mut-untracked
printf 'export const x = 1;\n' > "$R/src/untracked.ts"
: > "$NPX_ARGV"
run mutate --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/written.spec.ts --grep "saves the profile" --mutated src/untracked.ts
[ "$?" = 2 ] && ok "an untracked --mutated file is exit 2 — it has no pre-state to revert to" \
  || bad "expected exit 2 for an untracked mutated file"
[ -s "$NPX_ARGV" ] && bad "a run was paid for over a file that could not be reverted" \
  || ok "nothing was run"

mutate_repo mut-unmutated
git -C "$R" checkout -- src/app.ts   # the agent forgot to mutate
: > "$NPX_ARGV"
run mutate "${MUT_FLAGS[@]}"
[ "$?" = 2 ] && ok "a --mutated file carrying no change is exit 2" \
  || bad "expected exit 2 when nothing was actually mutated"
[ -s "$NPX_ARGV" ] && bad "a run went green by construction over an unmutated tree" \
  || ok "no run is paid for over an unmutated tree"

echo ""
echo "-- the isolated output, as argv --"
mutate_repo mut-argv
: > "$NPX_ARGV"
NPX_EXIT=1 run mutate "${MUT_FLAGS[@]}"
[ "$?" = 0 ] && ok "a RED mutation run is SUCCESS — the spec guards the change (exit 0)" \
  || { bad "expected exit 0 on a red mutation run"; head -5 "$W/err"; }
argv_has "the run is sent to an isolated output directory" "--output=$(mut_out)"
case "$(mut_out)" in
  */pw-prove-mutation-*) ok "the isolated output is keyed per repository, not machine-global" ;;
  *) bad "two parallel proofs would share one mutation output: $(mut_out)" ;;
esac
argv_has "and reports without recording anything" "--reporter=line"
argv_has "the guarding test scopes it to ONE test" "-g"
argv_has "the test title travels as ONE argument" "saves the profile"
argv_has "the spec this run wrote is what is mutation-verified" "e2e/written.spec.ts"
if grep -qxF -- "e2e/carried.spec.ts" "$NPX_ARGV"; then
  bad "a carried spec was mutation-verified — that verdict belongs to the run that wrote it"
else
  ok "a carried spec is filmed but not mutation-verified: the two scopes stay different"
fi
if grep -qxF -- "--reporter=html" "$NPX_ARGV"; then
  bad "the mutation run wrote an HTML report over the standing one"
else
  ok "no HTML reporter — the mutation run publishes nothing"
fi
if grep -qxF -- "PW_PROVE_CLIP=1" "$NPX_ENV"; then
  bad "the mutation run paid for a dwell and recorded a clip"
else
  ok "no clip flag — a mutation run records nothing"
fi
if grep -qE '^(-j|--workers)' "$NPX_ARGV"; then
  bad "a worker override reached the mutation run (ADR-0017 forbids one)"
else
  ok "no worker override on the mutation run either (ADR-0017)"
fi

echo ""
echo "-- the isolated output, as clips still standing --"
[ "$(cat "$NPX_PRESTATE")" = present ] \
  && ok "test-results was NOT cleared before the mutation run" \
  || bad "the mutation run cleared the delivered evidence — the one verb that must not"
[ -f "$R/test-results/clip-one/video.webm" ] && [ -f "$R/test-results/clip-two/video.webm" ] \
  && ok "the clips the filming run produced are still standing afterwards" \
  || bad "a clip did not survive the mutation run"
[ "$(jq_field 'clips.survived')" = 2 ] \
  && ok "the summary counts the clips that survived" || bad "survived wrong: $(summary)"
[ "$(jq_field 'clips.expected_at_least')" = 2 ] \
  && ok "the count is checked against the spec set, carried scenarios included" \
  || bad "expected_at_least wrong: $(summary)"
case "$(jq_field 'output')" in
  */pw-prove-mutation-*) ok "the summary names the isolated output, so no later step rebuilds it" ;;
  *) bad "output wrong: $(summary)" ;;
esac

echo ""
echo "-- the revert is unconditional and immediate --"
git -C "$R" diff --quiet -- src/app.ts \
  && ok "the mutated file is back at its pre-state after a red run" || bad "the mutation survived a red run"
[ "$(jq_field 'reverted')" = true ] && ok "the summary says the revert took" || bad "reverted wrong: $(summary)"
[ "$(jq_field 'result')" = guards ] \
  && ok "the summary names the verdict: the spec guards the change" || bad "result wrong: $(summary)"
[ "$(jq_field 'mutation_run')" = red ] \
  && ok "the summary carries what the run itself did, distinct from the verdict" \
  || bad "mutation_run wrong: $(summary)"

echo ""
echo "-- a GREEN mutation run is exit 8, its own code, NOT tests-red --"
mutate_repo mut-green
NPX_EXIT=0 run mutate "${MUT_FLAGS[@]}"
rc=$?
[ "$rc" = 8 ] && ok "a green mutation run is exit 8" || bad "expected exit 8 on a green mutation run, got $rc"
[ "$rc" != 6 ] && ok "exit 8 is not exit 6 — 'the spec does not guard it' is not 'the tests failed'" \
  || bad "a green mutation run collapsed into tests-red"
[ "$(jq_field 'result')" = unguarded ] && ok "the summary says unguarded" || bad "result wrong: $(summary)"
git -C "$R" diff --quiet -- src/app.ts \
  && ok "the revert ran on the green branch too — it is unconditional" \
  || bad "a green run left the mutation in the tree"
grep -q 'unguardable' "$W/err" \
  && ok "the refusal hands back the judgement the agent owes" || bad "exit 8 says nothing about what to do next"

echo ""
echo "-- residue after the revert is a HARD STOP under its own code --"
# The run itself left something in the tree that the revert of the declared file cannot take back
# out. The verdict is not read at all on this path: a proof never continues on a polluted tree, and
# nothing in the runner's own exit code says the tree moved.
mutate_repo mut-residue
NPX_STRAY="$W/repo-mut-residue/src/left-behind.ts" NPX_EXIT=1 run mutate "${MUT_FLAGS[@]}"
[ "$?" = 9 ] && ok "tree residue after the revert is exit 9" || bad "expected exit 9 for tree residue"
[ "$(jq_field 'residue')" = true ] && ok "the summary says the tree is polluted" || bad "residue wrong: $(summary)"
[ "$(jq_field 'result')" = residue ] && ok "residue outranks the verdict" || bad "result wrong: $(summary)"
grep -q 'left-behind.ts' "$W/err" && ok "the hard stop names what is still dirty" \
  || bad "the residue stop does not say what survived"
git -C "$R" diff --quiet -- src/app.ts \
  && ok "the revert still ran before the tree was judged" || bad "a residue stop left the mutation standing"

# And a tracked file the run modified, which shows as a moved diff rather than a new status line.
mutate_repo mut-residue-tracked
NPX_STRAY="$W/repo-mut-residue-tracked/README.md" NPX_EXIT=1 run mutate "${MUT_FLAGS[@]}"
[ "$?" = 9 ] && ok "a tracked file the run touched is residue too" \
  || bad "expected exit 9 when the run modified a tracked file"

echo ""
echo "-- clobbered clips are exit 10, and outrank the verdict --"
mutate_repo mut-clobber
NPX_CLOBBER=1 NPX_EXIT=1 run mutate "${MUT_FLAGS[@]}"
[ "$?" = 10 ] && ok "a mutation run that clobbered the clips is exit 10" \
  || bad "expected exit 10 when the delivered evidence was overwritten"
[ "$(jq_field 'clips.survived')" = 0 ] && ok "the summary counts nothing surviving" || bad "survived wrong: $(summary)"
[ "$(jq_field 'result')" = clips-clobbered ] \
  && ok "clobbered evidence outranks a red verdict" || bad "result wrong: $(summary)"
git -C "$R" diff --quiet -- src/app.ts \
  && ok "the revert still ran before the clip check" || bad "a clobbered run left the mutation standing"

echo ""
echo "-- fewer clips than the spec set is the same finding --"
mutate_repo mut-short
rm -rf "$R/test-results/clip-two"   # the set holds two specs; only one clip stands
NPX_EXIT=1 run mutate "${MUT_FLAGS[@]}"
[ "$?" = 10 ] && ok "one clip against a two-spec set is exit 10" \
  || bad "a clip count short of the spec set was accepted"

echo ""
echo "-- mutate shares the spec-set resolution and the empty-set stop --"
new_repo mut-empty
mkdir -p "$R/src"; printf 'x\n' > "$R/src/app.ts"
git -C "$R" add -A && git -C "$R" commit -qm src
printf 'y\n' > "$R/src/app.ts"
printf 'test\n' > "$R/e2e/written.spec.ts"
: > "$NPX_ARGV"
NPX_EXIT=1 run mutate --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/nothing.spec.ts --grep t --mutated src/app.ts
[ "$?" = 2 ] && ok "a --written spec that is not on disk is exit 2 on mutate too" \
  || bad "expected exit 2 for a missing written spec"

echo ""
echo "-- the film summary's own clip count is the floor when it is passed --"
# The spec SET is the only floor this verb can compute alone: one clip per spec FILE. A spec holding
# three scenarios filmed three clips, and the weaker floor would absorb two of them going missing.
mutate_repo mut-clips-count
NPX_EXIT=1 run mutate "${MUT_FLAGS[@]}" --clips 2
[ "$?" = 0 ] && ok "a count the standing clips meet still passes" || bad "a met --clips count failed the run"
mutate_repo mut-clips-short
NPX_EXIT=1 run mutate "${MUT_FLAGS[@]}" --clips 3
[ "$?" = 10 ] && ok "two clips against a three-scenario filming run is exit 10" \
  || bad "a multi-scenario spec's missing clips were absorbed by the spec-file floor"
[ "$(jq_field 'clips.expected_at_least')" = 3 ] \
  && ok "the summary names the count it held the clips to" || bad "expected_at_least wrong: $(summary)"
mutate_repo mut-clips-bad
run mutate "${MUT_FLAGS[@]}" --clips lots
[ "$?" = 1 ] && ok "a --clips that is not a count is a usage error" || bad "--clips accepted a non-number"
run audit --config playwright.proof.config.ts --test-dir e2e --base main --clips 2
[ "$?" = 1 ] && ok "--clips belongs to mutate alone" || bad "audit accepted --clips"

echo ""
echo "-- a run that executed NO test is never a red verdict --"
# The one verb where nonzero means success: a grep matching nothing would otherwise publish "the
# spec guards the change" over a run that executed no assertion at all.
mutate_repo mut-no-tests
printf 'Error: No tests found.\n' > "$W/runner-out"
NPX_EXIT=1 run mutate "${MUT_FLAGS[@]}"
[ "$?" = 2 ] && ok "a grep that matched no test is exit 2, not a red verdict" \
  || bad "a run that executed nothing was read as 'the spec guards the change'"
grep -q 'no verdict' "$W/err" && ok "the stop says there is no verdict to read" \
  || bad "the stop does not say why the run proves nothing"
git -C "$R" diff --quiet -- src/app.ts \
  && ok "the revert still ran before that stop" || bad "the no-tests stop left the mutation standing"
: > "$W/runner-out"

echo ""
echo "-- a red run carries its failure signature, so the agent can place it --"
mutate_repo mut-signature
cat > "$W/runner-out" <<'OUT'
  1) [chromium] > e2e/written.spec.ts:12:5 > saves the profile
    Error: expect(locator).toBeVisible() failed
    Locator: locator('#saved-banner')
OUT
NPX_EXIT=1 run mutate "${MUT_FLAGS[@]}"
[ "$?" = 0 ] && ok "the red run still exits 0" || bad "expected exit 0"
[ "$(jq_field 'signature.locator')" = "#saved-banner" ] \
  && ok "the summary names what went red, so an infrastructure failure is not read as a guard" \
  || bad "signature wrong: $(summary)"
[ "$(jq_field 'signature.error_class')" = "expect(locator).toBeVisible" ] \
  && ok "and the error class beside it" || bad "error class wrong: $(summary)"
: > "$W/runner-out"

# A GREEN run has no failure to describe, and a signature invented for one would be a fabrication.
mutate_repo mut-green-signature
NPX_EXIT=0 run mutate "${MUT_FLAGS[@]}"
[ "$(jq_field 'signature')" = null ] \
  && ok "a green mutation run carries no signature" || bad "signature not null on green: $(summary)"

echo ""
echo "-- one ledger line, phase mutate --"
mutate_repo mut-ledger
NPX_EXIT=1 run mutate "${MUT_FLAGS[@]}"
if [ "$(grep -c '^PWPROVE_RUN .*"script":"proof-run.mjs".*"phase":"mutate"' "$W/out")" = 1 ]; then
  ok "one ledger line from proof-run.mjs, phase mutate"
else
  bad "no single PWPROVE_RUN line for proof-run.mjs with phase mutate: $(grep '^PWPROVE_RUN ' "$W/out")"
fi
[ "$(grep -c '^PWPROVE_SUMMARY ' "$W/out")" = 1 ] \
  && ok "exactly one JSON summary line from mutate" || bad "mutate summary line count wrong"
[ -d "$R/.pw-prove" ] && bad "mutate left a state directory behind — it keeps none" \
  || ok "mutate writes no state of its own"

echo ""
echo "  proof-run: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
