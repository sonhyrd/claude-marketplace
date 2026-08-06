#!/usr/bin/env bash
# Process-boundary tests for clip-fidelity.mjs — the Step-6 gate that a generated spec actually
# carries the Clip Fidelity contract (ADR 0015).
#
# What is frozen here is the EXIT-CODE SURFACE, because SKILL.md Step 6 branches on it:
#   0 satisfied · 1 usage · 2 dwell missing · 3 pin missing on 'pinned' · 4 disagreement · 5 ambiguity
#
# The originating regression gets its own case: a spec with no PW_PROVE_CLIP reader must FAIL. That
# run passed every gate the pipeline owned and produced a recording that showed nothing, which is
# precisely what a green exit here would mean again.
#
# Text fixtures only — no browser, no network, no Playwright install.
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
expect 1 "unknown subcommand" frames
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
