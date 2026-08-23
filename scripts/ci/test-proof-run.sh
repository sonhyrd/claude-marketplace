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
printf '%s\n' "${PW_PROVE_HAR-<unset>}" > "$NPX_ENV_HAR"
[ -f "$NPX_STDOUT" ] && cat "$NPX_STDOUT"
exit "${NPX_EXIT:-0}"
SHIM
chmod +x "$BIN/npx"

export NPX_ARGV="$W/argv" NPX_PRESTATE="$W/prestate" NPX_STDOUT="$W/runner-out"
export NPX_TSC_ARGV="$W/tsc-argv" NPX_TSC_STDOUT="$W/tsc-out" NPX_ENV_HAR="$W/env-har"
: > "$NPX_STDOUT"; : > "$NPX_TSC_STDOUT"; : > "$NPX_TSC_ARGV"

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
  node "$S" "$@" >"$W/out" 2>"$W/err" ); }

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
echo "  proof-run: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
