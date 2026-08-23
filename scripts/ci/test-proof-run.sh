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
# The filming run's per-run values arrive as ENVIRONMENT, not argv, so the shim records them too —
# otherwise "carries the effective viewport it was given" would be unobservable at this boundary.
{ printf 'PW_PROVE_CLIP=%s\n' "${PW_PROVE_CLIP-}"
  printf 'PW_PROVE_W=%s\n' "${PW_PROVE_W-}"
  printf 'PW_PROVE_H=%s\n' "${PW_PROVE_H-}"; } > "$NPX_ENV"
# A filming run leaves webms behind; the shim stands in for that so the frame phase has clips.
for c in ${NPX_MAKE_CLIPS-}; do mkdir -p "test-results/$c"; printf 'webm\n' > "test-results/$c/video.webm"; done
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
: > "$NPX_STDOUT"
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
  FAKE_VIDEO="${FAKE_VIDEO-}" NPX_MAKE_CLIPS="${NPX_MAKE_CLIPS-}" \
  node "$S" "$@" >"$W/out" 2>"$W/err" ); }

env_has() {
  if grep -qxF -- "$2" "$NPX_ENV"; then ok "$1"; else bad "$1 — env lacks '$2': $(tr '\n' ' ' < "$NPX_ENV")"; fi
}

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
[ "$(jq_field 'schema')" = 2 ] && ok "the summary declares its schema" || bad "schema wrong: $(summary)"

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
echo "  proof-run: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
