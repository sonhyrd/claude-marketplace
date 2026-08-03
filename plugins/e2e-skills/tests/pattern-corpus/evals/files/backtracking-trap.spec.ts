// Corpus fixture: the possessive-quantifier backtracking trap. See ../../README.md.
//
// Check #15 opens `^\s*+expect\(\s*+(?!await\b)`. The `*+` forbids backtracking into the
// whitespace before `await`. Rewrite it as `\s*` and the engine consumes the spaces, fails
// the lookahead, hands one space back, and the lookahead — now looking at ` await` — passes.
// The check silently inverts: these two lines start reporting under the BASE #15 block.
//
// They belong to the awaited-locator variant of #15 instead, and test-corpus.sh asserts
// this file never appears under the base block. Every smell below is intentional.
import { test, expect } from '@playwright/test';

test('the await is misplaced inside expect, behind leading whitespace', async ({ page }) => {
  await page.goto('/');
  expect( await page.locator('#one')).toBeVisible();
  expect(  await page.locator('#two')).toBeVisible();
});
