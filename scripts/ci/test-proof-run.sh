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
cat > "$BIN/npx" <<'SHIM'
#!/usr/bin/env bash
: > "$NPX_ARGV"
for a in "$@"; do printf '%s\n' "$a" >> "$NPX_ARGV"; done
if [ -d "test-results" ]; then echo present > "$NPX_PRESTATE"; else echo absent > "$NPX_PRESTATE"; fi
[ -f "$NPX_STDOUT" ] && cat "$NPX_STDOUT"
exit "${NPX_EXIT:-0}"
SHIM
chmod +x "$BIN/npx"

export NPX_ARGV="$W/argv" NPX_PRESTATE="$W/prestate" NPX_STDOUT="$W/runner-out"
: > "$NPX_STDOUT"

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
jq_field() { summary | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);process.stdout.write(String(eval("o."+process.argv[1])))})' "$1"; }
argv_has() {
  if grep -qxF -- "$2" "$NPX_ARGV"; then ok "$1"; else bad "$1 — argv lacks '$2': $(tr '\n' ' ' < "$NPX_ARGV")"; fi
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
echo "-- the attempt bound --"
NPX_EXIT=1 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts --attempt-bound 2
[ "$?" = 7 ] && ok "an attempt past the bound is refused with exit 7" \
  || bad "expected exit 7 past the attempt bound"
[ "$(cat "$NPX_PRESTATE")" = absent ] || true
prev=$(wc -l < "$NPX_ARGV")
NPX_EXIT=1 run audit --config playwright.proof.config.ts --test-dir e2e --base main \
  --written e2e/a.spec.ts --attempt-bound 2
[ "$(wc -l < "$NPX_ARGV")" = "$prev" ] \
  && ok "a refused attempt spends no run" || bad "the runner was invoked past the bound"

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
