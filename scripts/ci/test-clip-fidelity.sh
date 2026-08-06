#!/usr/bin/env bash
# Process-boundary tests for clip-fidelity.mjs — the Step-6 gate that a generated spec actually
# carries the Clip Fidelity contract, and the Step-7 frame the agent looks at (ADR 0015).
#
# What is frozen here is the EXIT-CODE SURFACE, because SKILL.md Steps 6 and 7 branch on it:
#   spec    0 satisfied · 1 usage · 2 dwell missing · 3 pin missing on 'pinned' · 4 disagreement
#           · 5 ambiguity                                                — non-zero BLOCKS Step 7
#   frames  0 a frame per clip · 6 no video tooling · 7 a clip yielded no frame
#                                          — 6 and 7 never fail the run; this is not a gate
#
# The originating regression gets its own case: a spec with no PW_PROVE_CLIP reader must FAIL. That
# run passed every gate the pipeline owned and produced a recording that showed nothing, which is
# precisely what a green exit here would mean again.
#
# The `spec` half is text fixtures only — no browser, no network, no Playwright install. The
# `frames` half is REAL synthetic video through REAL ffmpeg/ffprobe, nothing stubbed, because the
# properties under test (a frame from near the END, and a duration the container never declared) are
# properties of actual video and a fake would assert only that the fake was built to pass. It skips
# cleanly where the tooling is absent or the local build cannot write the codec — the publish-path
# suite's pattern.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1
S="skills/pw-prove/scripts/clip-fidelity.mjs"

pass=0; fail=0
ok()  { echo "  [PASS] $1"; pass=$((pass + 1)); }
bad() { echo "  [FAIL] $1"; fail=$((fail + 1)); }

W=$(mktemp -d); trap 'rm -rf "$W"' EXIT

run() { ( cd "$W" && PWPROVE_LEDGER="$W/ledger.jsonl" node "$REPO_ROOT/$S" "$@" >"$W/out" 2>"$W/err" ); }

# usage: expect <want-exit> <name> <args...>
expect() {
  local want="$1" name="$2"; shift 2
  run "$@"; local rc=$?
  if [ "$rc" = "$want" ]; then ok "$name (exit $rc)"; else
    bad "$name — exit $rc, wanted $want"; sed 's/^/         /' "$W/err" | head -4
  fi
}
saw() { if grep -qF -- "$2" "$W/out" "$W/err"; then ok "$1"; else bad "$1 — output lacks '$2'"; fi; }

# ---------------------------------------------------------------- configs (the four shapes)
cat > "$W/desktop.config.ts" <<'CFG'
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000', ...devices['Desktop Chrome'] },
});
CFG
cat > "$W/bare.config.ts" <<'CFG'
import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './e2e', use: { baseURL: 'http://localhost:3000' } });
CFG
cat > "$W/explicit.config.ts" <<'CFG'
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 810 } },
});
CFG
cat > "$W/mobile.config.ts" <<'CFG'
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ use: { ...devices['iPhone 15'] } });
CFG
cat > "$W/fn.config.ts" <<'CFG'
import { defineConfig } from '@playwright/test';
export default ({ mode }) => defineConfig({ use: { viewport: mode === 'wide' ? null : undefined } });
CFG
cat > "$W/multi.config.ts" <<'CFG'
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
CFG
# A commented-out descriptor must not decide the verdict — the live block is desktop-only.
cat > "$W/commented.config.ts" <<'CFG'
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  use: {
    // legacy, kept for reference: ...devices['iPhone 15'],
    // viewport: { width: 375, height: 812 },
    ...devices['Desktop Chrome'],
  },
});
CFG
cat > "$W/multi-agree.config.ts" <<'CFG'
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
CFG

# ---------------------------------------------------------------- specs
# A compliant spec: committed pin, framing, and a JUSTIFIED gated dwell per test.
cat > "$W/good.spec.ts" <<'SPEC'
import { test, expect } from '@playwright/test';
test.use({ viewport: { width: 1600, height: 900 } });

test('saves the renamed report', async ({ page }) => {
  // PROVES: a renamed report is saved
  await page.goto('/reports/1');
  const status = page.getByRole('status');
  await expect(status).toHaveText('Saved');
  await status.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  // JUSTIFIED: proof-clip payoff hold. Runs only under PW_PROVE_CLIP; it sits after the assertion
  // covering the beat above, so it adds time and nothing else. CI never sets it.
  if (process.env.PW_PROVE_CLIP) await page.waitForTimeout(2500);
});

test('rejects an empty title', async ({ page }) => {
  // PROVES: an empty title is rejected
  await expect(page.getByText('Title is required')).toBeVisible();
  // JUSTIFIED: proof-clip payoff hold. Runs only under PW_PROVE_CLIP. CI never sets it.
  if (process.env.PW_PROVE_CLIP) await page.waitForTimeout(2000);
});
SPEC

# THE ORIGINATING REGRESSION: pin present, no reader for PW_PROVE_CLIP anywhere.
cat > "$W/no-dwell.spec.ts" <<'SPEC'
import { test, expect } from '@playwright/test';
test.use({ viewport: { width: 1600, height: 900 } });
test('saves the renamed report', async ({ page }) => {
  await expect(page.getByRole('status')).toHaveText('Saved');
});
SPEC

# A dwell nobody justified — an unexplained fixed wait, which is smell #9 with a switch on it.
cat > "$W/unjustified.spec.ts" <<'SPEC'
import { test, expect } from '@playwright/test';
test.use({ viewport: { width: 1600, height: 900 } });
test('saves the renamed report', async ({ page }) => {
  await expect(page.getByRole('status')).toHaveText('Saved');

  if (process.env.PW_PROVE_CLIP) await page.waitForTimeout(2500);
});
SPEC

# Two tests, one of them silent.
cat > "$W/one-of-two.spec.ts" <<'SPEC'
import { test, expect } from '@playwright/test';
test.use({ viewport: { width: 1600, height: 900 } });
test('first', async ({ page }) => {
  await expect(page.getByText('a')).toBeVisible();
  // JUSTIFIED: proof-clip payoff hold. Runs only under PW_PROVE_CLIP. CI never sets it.
  if (process.env.PW_PROVE_CLIP) await page.waitForTimeout(2500);
});
test('second', async ({ page }) => {
  await expect(page.getByText('b')).toBeVisible();
});
SPEC

# Dwelled, framed, but never pinned.
cat > "$W/no-pin.spec.ts" <<'SPEC'
import { test, expect } from '@playwright/test';
test('saves the renamed report', async ({ page }) => {
  await expect(page.getByRole('status')).toHaveText('Saved');
  // JUSTIFIED: proof-clip payoff hold. Runs only under PW_PROVE_CLIP. CI never sets it.
  if (process.env.PW_PROVE_CLIP) await page.waitForTimeout(2500);
});
SPEC

# The braced gate: the same construct as the one-liner, in another brace style.
cat > "$W/braced.spec.ts" <<'SPEC'
import { test, expect } from '@playwright/test';
test.use({ viewport: { width: 1600, height: 900 } });
test('saves the renamed report', async ({ page }) => {
  await expect(page.getByRole('status')).toHaveText('Saved');
  // JUSTIFIED: proof-clip payoff hold. Runs only under PW_PROVE_CLIP. CI never sets it.
  if (process.env.PW_PROVE_CLIP) {
    await page.waitForTimeout(2500);
  }
});
SPEC

# A justified dwell with an unmarked twin: the twin is still an unexplained fixed wait.
cat > "$W/unmarked-twin.spec.ts" <<'SPEC'
import { test, expect } from '@playwright/test';
test.use({ viewport: { width: 1600, height: 900 } });
test('saves the renamed report', async ({ page }) => {
  await expect(page.getByText('Editing')).toBeVisible();
  // JUSTIFIED: proof-clip payoff hold. Runs only under PW_PROVE_CLIP. CI never sets it.
  if (process.env.PW_PROVE_CLIP) await page.waitForTimeout(1500);
  await expect(page.getByRole('status')).toHaveText('Saved');
  if (process.env.PW_PROVE_CLIP) await page.waitForTimeout(9000);
});
SPEC

# A PW_PROVE_CLIP gate on something that is not a wait is not a dwell.
cat > "$W/gated-non-wait.spec.ts" <<'SPEC'
import { test, expect } from '@playwright/test';
test.use({ viewport: { width: 1600, height: 900 } });
test('saves the renamed report', async ({ page }) => {
  if (process.env.PW_PROVE_CLIP) await page.screenshot({ path: 'x.png' });
  await expect(page.getByRole('status')).toHaveText('Saved');
});
SPEC

# The masking trap: braces, a `test(` and a PW_PROVE_CLIP mention that live inside strings, a
# template literal, a regex and a comment. None of them may be read as code.
cat > "$W/tricky.spec.ts" <<'SPEC'
import { test, expect } from '@playwright/test';
test.use({ viewport: { width: 1600, height: 900 } });
// A commented-out draft: test('ghost', async ({ page }) => { await page.waitForTimeout(1) });
test('handles quotes, braces and regexes', async ({ page }) => {
  await page.getByText("it's a } brace").click();
  await expect(page.getByText(/save{2}/)).toBeVisible();
  const label = `total: ${1 + 1} }`;
  const draft = "if (process.env.PW_PROVE_CLIP) await page.waitForTimeout(1)";
  await expect(page.getByLabel(label)).toBeVisible();
  // JUSTIFIED: proof-clip payoff hold. Runs only under PW_PROVE_CLIP. CI never sets it.
  if (process.env.PW_PROVE_CLIP) await page.waitForTimeout(2500);
});
SPEC

echo "-- the contract is satisfied --"
expect 0 "compliant spec, desktop-descriptor config, declared pinned" \
  spec good.spec.ts --config desktop.config.ts --verdict pinned:1600x900
saw "names the derivation branch, not just the answer" "only a desktop device-descriptor spread"
saw "reports the dwell coverage as a count" "2/2 test() block(s)"

echo ""
echo "-- the originating regression: PW_PROVE_CLIP=1 over a spec with no reader --"
expect 2 "a spec with no PW_PROVE_CLIP reader FAILS" \
  spec no-dwell.spec.ts --config desktop.config.ts --verdict pinned:1600x900
saw "the STOP says the flag would be inert" "INERT"
expect 2 "a gated dwell with no // JUSTIFIED: line above it FAILS" \
  spec unjustified.spec.ts --config desktop.config.ts --verdict pinned:1600x900
saw "names the unjustified dwell's line" "has no // JUSTIFIED: line above it"
expect 2 "one silent test among two FAILS (the check is per-test, not per-file)" \
  spec one-of-two.spec.ts --config desktop.config.ts --verdict pinned:1600x900
saw "counts the compliant tests too" "1/2 test() block(s)"
expect 2 "an unmarked dwell beside a justified one still FAILS" \
  spec unmarked-twin.spec.ts --config desktop.config.ts --verdict pinned:1600x900
saw "names the UNMARKED dwell's line, not the justified one" "unmarked-twin.spec.ts:8 has no // JUSTIFIED:"
expect 2 "a PW_PROVE_CLIP gate on something that is not a wait is not a dwell" \
  spec gated-non-wait.spec.ts --config desktop.config.ts --verdict pinned:1600x900
expect 0 "FALSE-POSITIVE GUARD: a braced gate is the same construct as the one-liner" \
  spec braced.spec.ts --config desktop.config.ts --verdict pinned:1600x900

echo ""
echo "-- the pin --"
expect 3 "a 'pinned' verdict with no test.use({ viewport }) FAILS" \
  spec no-pin.spec.ts --config desktop.config.ts --verdict pinned:1600x900
saw "the STOP names the spec as the place to pin" "test.use({ viewport: { width: 1600, height: 900 } });"
expect 0 "FALSE-POSITIVE GUARD: a 'deliberate' verdict with no pin PASSES" \
  spec no-pin.spec.ts --config explicit.config.ts --verdict deliberate:1440x810
saw "says the pin is not required rather than staying silent" "not required"

echo ""
echo "-- verdict derivation, all four config shapes --"
expect 0 "explicit viewport: key -> deliberate" \
  spec no-pin.spec.ts --config explicit.config.ts --verdict deliberate:1440x810
saw "reads the explicit key's dimensions back" "an explicit viewport: key (1440x810)"
expect 0 "desktop device-descriptor spread -> pinned (scaffold default)" \
  spec good.spec.ts --config desktop.config.ts --verdict pinned:1600x900
expect 0 "mobile descriptor -> deliberate (a desktop pin over a phone is nonsense)" \
  spec no-pin.spec.ts --config mobile.config.ts --verdict deliberate:393x852
saw "names the descriptor it respected" "a non-desktop device descriptor (iPhone 15)"
expect 0 "nothing at all -> pinned (Playwright's 1280x720 default)" \
  spec good.spec.ts --config bare.config.ts --verdict pinned:1600x900
saw "says the config carried nothing" "nothing at all"
expect 0 "multi-project agreeing on desktop -> pinned, not ambiguous" \
  spec good.spec.ts --config multi-agree.config.ts --verdict pinned:1600x900
expect 0 "FALSE-POSITIVE GUARD: a commented-out descriptor does not decide the verdict" \
  spec good.spec.ts --config commented.config.ts --verdict pinned:1600x900
saw "the live desktop spread is what was read" "only a desktop device-descriptor spread (Desktop Chrome)"

echo ""
echo "-- the size is checked where the config states it, and only there --"
expect 4 "an explicit 1440x810 config against a declared 1280x720 FAILS" \
  spec no-pin.spec.ts --config explicit.config.ts --verdict deliberate:1280x720
saw "the STOP names what Step 7 would record at" "PW_PROVE_W/PW_PROVE_H"
expect 0 "a device descriptor states no size, so no size is compared" \
  spec no-pin.spec.ts --config mobile.config.ts --verdict deliberate:999x999

echo ""
echo "-- disagreement is itself a failure, in both directions --"
expect 4 "declared deliberate, derived pinned" \
  spec good.spec.ts --config desktop.config.ts --verdict deliberate:1280x720
saw "quotes both sides" "derives"
expect 4 "declared pinned, derived deliberate" \
  spec good.spec.ts --config explicit.config.ts --verdict pinned:1600x900
saw "the STOP points at the resolution rule" "code-rules.md"

echo ""
echo "-- ambiguity refuses rather than guessing --"
expect 5 "a function-export config" \
  spec good.spec.ts --config fn.config.ts --verdict pinned:1600x900
saw "names the reason as the computed export" "exports a FUNCTION"
expect 5 "projects whose use blocks resolve to different verdicts" \
  spec good.spec.ts --config multi.config.ts --verdict pinned:1600x900
saw "names the disagreeing projects" "chromium: pinned, mobile: deliberate"

echo ""
echo "-- strings, templates, regexes and comments are not code --"
expect 0 "a spec whose strings carry braces, a ghost test() and a fake gate still passes" \
  spec tricky.spec.ts --config desktop.config.ts --verdict pinned:1600x900
saw "the commented-out draft is not counted as a test" "1/1 test() block(s)"

echo ""
echo "-- usage errors --"
expect 1 "no subcommand"
expect 1 "unknown subcommand" film
expect 1 "no spec file" spec --config desktop.config.ts --verdict pinned:1600x900
expect 1 "missing --config (the verdict is re-derived, never trusted)" \
  spec good.spec.ts --verdict pinned:1600x900
expect 1 "missing --verdict" spec good.spec.ts --config desktop.config.ts
expect 1 "unparseable --verdict" \
  spec good.spec.ts --config desktop.config.ts --verdict maybe:1600x900
expect 1 "unreadable --config" \
  spec good.spec.ts --config nope.config.ts --verdict pinned:1600x900
expect 1 "unreadable spec" \
  spec nope.spec.ts --config desktop.config.ts --verdict pinned:1600x900
saw "the usage line names the open subcommand surface" "clip-fidelity.mjs spec <spec-file...>"
expect 1 "frames with no clip file" frames
expect 1 "frames with an unknown flag" frames "$W/nope.webm" --sharpen
# The offset and the output directory are FIXED, not flags: both would be knobs on the two things
# the design pins (the frame comes from inside the hold; the image lands where Step 8 sweeps it).
expect 1 "frames takes no --offset — the frame's position is not tunable" \
  frames "$W/nope.webm" --offset 4
expect 1 "frames takes no --out — where the image lands is not tunable" \
  frames "$W/nope.webm" --out /tmp

echo ""
echo "-- frames: the tooling is absent (the one case that needs no video at all) --"
# The publish-skip precedent, transplanted: a machine without ffmpeg can still prove a change, so
# this SKIPS with a stated line. An empty PATH is how the tooling is made absent — nothing is
# stubbed, and `node` is reached by its absolute path because it is no longer on the PATH either.
mkdir -p "$W/emptybin"
NODE_BIN=$(command -v node)
( cd "$W" && PATH="$W/emptybin" PWPROVE_LEDGER="$W/ledger.jsonl" \
  "$NODE_BIN" "$REPO_ROOT/$S" frames test-results/held/video.webm >"$W/out" 2>"$W/err" )
rc=$?
if [ "$rc" = "6" ]; then ok "absent video tooling exits 6 (its own code, not a spec exit)"; else
  bad "absent video tooling — exit $rc, wanted 6"; sed 's/^/         /' "$W/err" | head -4; fi
saw "the skip states which tool is missing" "is not runnable"
saw "the skip says the run carries on" "THE RUN CONTINUES"
saw "the skip refuses to let an uninspected clip read as a good one" "uninspected rather than as good"

echo ""
echo "-- frames: one frame per clip, from the hold (real synthetic video, real tooling) --"
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "  [SKIP] ffmpeg/ffprobe not on PATH — the frame extract cannot be exercised against real video"
else
  # The fixture is the assertion. Two seconds of BLACK followed by one second of WHITE: a frame from
  # the start is unambiguously dark and a frame from the hold is unambiguously bright, so "near the
  # end rather than the start" is measured off the pixels rather than trusted from a log line.
  mkdir -p "$W/test-results/held" "$W/test-results/live" "$W/test-results/broken" "$W/elsewhere"
  ffmpeg -y -f lavfi -i "color=c=black:s=320x180:r=10:d=2" -f lavfi -i "color=c=white:s=320x180:r=10:d=1" \
    -filter_complex "[0:v][1:v]concat=n=2:v=1[v]" -map "[v]" -c:v libvpx-vp9 -b:v 200k \
    "$W/test-results/held/video.webm" >/dev/null 2>&1
  # THE CONTAINER LIES. `-live 1` muxes the same footage the way a live screen recording is written:
  # no duration in the container, which is what a real Playwright webm frequently looks like.
  ffmpeg -y -i "$W/test-results/held/video.webm" -c copy -f webm -live 1 \
    "$W/test-results/live/video.webm" >/dev/null 2>&1
  DECLARED=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$W/test-results/live/video.webm" 2>/dev/null)

  if [ ! -s "$W/test-results/held/video.webm" ] || [ ! -s "$W/test-results/live/video.webm" ]; then
    echo "  [SKIP] this ffmpeg build cannot write libvpx-vp9 webm — no clip to extract a frame from"
  elif [ "$DECLARED" != "N/A" ] && [ -n "$DECLARED" ]; then
    # NOT a skip: the container-lies case is the reason the decode fallback exists, and a fixture
    # that quietly declares a duration would test the easy path twice while reporting both green.
    bad "the live-muxed fixture still declares a duration ($DECLARED) — the decode fallback is untested"
  else
    # The average luminance of a frame, 0-255, by scaling it to a single grey pixel and reading that
    # byte. One ffmpeg call, no image library, and it answers the only question asked of the frame.
    lum() { ffmpeg -v error -i "$1" -vf scale=1:1 -pix_fmt gray -f rawvideo - 2>/dev/null | od -An -tu1 | tr -d ' \n'; }

    expect 0 "two clips, one frame each" \
      frames test-results/held/video.webm test-results/live/video.webm
    saw "the verdict tells the agent to look" "NOW LOOK AT EACH ONE"
    saw "it names all three diagnoses" "element off-frame"
    saw "it bounds the re-film to one attempt" "re-film ONCE"
    saw "it says a second bad frame publishes anyway" "PUBLISHES with an"

    HELD="$W/test-results/held/video.frame.png"
    LIVE="$W/test-results/live/video.frame.png"
    [ -s "$HELD" ] && ok "a non-empty image beside the clip: test-results/held/video.frame.png" \
      || bad "no frame was written for the held clip"
    [ -s "$LIVE" ] && ok "a non-empty image for the no-duration clip too (the decode fallback)" \
      || bad "no frame was written for the live-muxed clip"
    saw "the no-duration clip's line says the duration was DECODED, not read" "by decode fallback"
    saw "the held clip's line says its duration came from the container" "from the container"

    # Both frames must come from the WHITE tail, not the black head. The start-frame reading is
    # taken here too: without it a suite that reported 'bright' would not have shown the fixture
    # was ever dark, and the assertion would prove nothing about WHERE the frame came from.
    ffmpeg -y -ss 0 -i "$W/test-results/held/video.webm" -frames:v 1 -update 1 "$W/start.png" >/dev/null 2>&1
    START=$(lum "$W/start.png"); GOT=$(lum "$HELD"); GOT_LIVE=$(lum "$LIVE")
    if [ "${START:-999}" -lt 40 ] 2>/dev/null; then
      ok "the fixture's opening second is dark (luminance $START) — the contrast is real"
    else bad "the fixture's first frame is not dark (luminance $START) — the end-vs-start test is vacuous"; fi
    if [ "${GOT:-0}" -gt 200 ] 2>/dev/null; then
      ok "the extracted frame is from the payoff hold, not the boot (luminance $GOT vs $START at 0s)"
    else bad "the extracted frame has luminance $GOT — it did not come from near the end"; fi
    if [ "${GOT_LIVE:-0}" -gt 200 ] 2>/dev/null; then
      ok "the no-duration clip's frame is from near its end too (luminance $GOT_LIVE)"
    else bad "the no-duration clip's frame has luminance $GOT_LIVE — the decode fallback mis-placed it"; fi

    # A clip nothing can read is one missing frame, not a failed run — and the OTHER clip still
    # gets its frame, because an inspection that gives up on the first bad file inspects nothing.
    printf 'this is not a video' > "$W/test-results/broken/video.webm"
    # Delete the earlier run's frame FIRST. Asserting on a file the previous case wrote would pass
    # off a stale image, and the case could then never fail — which is the shape of always-pass this
    # whole repository exists to catch.
    rm -f "$HELD"
    expect 7 "an unreadable clip exits 7 rather than failing the run" \
      frames test-results/broken/video.webm test-results/held/video.webm
    saw "it names the clip that yielded nothing" "NO FRAME"
    saw "the run carries on past a clip it could not read" "THE RUN CONTINUES"
    [ -s "$HELD" ] && ok "the readable clip beside it still produced its frame" \
      || bad "one unreadable clip suppressed the other clip's frame"

    echo ""
    echo "-- frames: the image lands where Step 8 will sweep it --"
    rm -f "$HELD"
    expect 0 "the frame is written into the clip's own directory (under test-results/)" \
      frames test-results/held/video.webm
    [ -s "$HELD" ] && ok "written to test-results/held/, so no image lands in the repository" \
      || bad "the frame was not written beside the clip"
    if grep -q "WARNING" "$W/out"; then bad "a path Step 8 already sweeps warned about itself"; else
      ok "no warning for a path Step 8 already sweeps"; fi
    # The one case that escapes the sweep: a clip that was never under test-results/ to begin with.
    cp "$W/test-results/held/video.webm" "$W/elsewhere/video.webm"
    expect 0 "a clip outside test-results/ still yields its frame" frames elsewhere/video.webm
    [ -s "$W/elsewhere/video.frame.png" ] && ok "the frame lands beside that clip too" \
      || bad "no frame was written beside the clip outside test-results/"
    saw "a frame outside test-results/ is warned about, since nothing will sweep it" \
      "Step 8's hygiene sweep will not remove it"

    echo ""
    echo "-- frames: telemetry --"
    run frames test-results/held/video.webm
    if [ "$(grep -c '^PWPROVE_RUN ' "$W/out")" = "1" ]; then
      ok "exactly one PWPROVE_RUN line on a frames run"
    else bad "expected exactly one PWPROVE_RUN line, got $(grep -c '^PWPROVE_RUN ' "$W/out")"; fi
  fi
fi

echo ""
echo "-- telemetry never fails a run --"
run spec good.spec.ts --config desktop.config.ts --verdict pinned:1600x900
if [ "$(grep -c '^PWPROVE_RUN ' "$W/out")" = "1" ]; then
  ok "exactly one PWPROVE_RUN line on a passing run"
else
  bad "expected exactly one PWPROVE_RUN line, got $(grep -c '^PWPROVE_RUN ' "$W/out")"
fi
( cd "$W" && PWPROVE_LEDGER=/dev/null/nope/ledger.jsonl node "$REPO_ROOT/$S" spec good.spec.ts \
  --config desktop.config.ts --verdict pinned:1600x900 >"$W/out" 2>"$W/err" )
[ "$?" = 0 ] && ok "an unwritable ledger leaves the exit code alone" || bad "unwritable ledger changed the exit code"

echo ""
echo "  clip-fidelity: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
