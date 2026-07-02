// Fixture for scripts/ci/codex-smoke.sh (check 2: e2e-reviewer).
// Contains exactly one deliberate silent-always-pass assertion; the smoke test
// asks Codex to load the e2e-reviewer skill and name the matching pattern ID.
import { test, expect } from '@playwright/test';

test('order summary renders after checkout', async ({ page }) => {
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Place order' }).click();
  // JUSTIFIED: intentional smell — committed codex-smoke fixture; the Codex
  // compatibility smoke test asks the agent to identify this pattern.
  expect(page.locator('[data-testid="order-summary"]')).toBeTruthy();
});
