// Corpus fixture: the suppressed twin of pw-hits.spec.ts. Every line below carries a
// `// JUSTIFIED:` marker on the line above it and must produce NO hit — except `.only(`,
// which is never exemptible (the #7 no-exemption contract).
import { test, expect } from '@playwright/test';

// JUSTIFIED: corpus twin — module state is the thing under test here
let sharedCounter = 0;

// JUSTIFIED: corpus twin — these steps genuinely share a login session
test.describe.serial('corpus twin', () => {
  test('every playwright smell, suppressed', async ({ page }) => {
    await page.goto('/');
    // JUSTIFIED: corpus twin — third-party widget animates on a fixed timer
    await page.waitForTimeout(1000);
    // JUSTIFIED: corpus twin — the page has no deterministic settle signal
    await page.waitForLoadState('networkidle');
    // JUSTIFIED: corpus twin — asserting on a node outside the page's own tree
    const el = document.querySelector('#app');
    // JUSTIFIED: corpus twin — this click is a best-effort dismissal, failure is fine
    await page.click('#save').catch(() => {});
    // JUSTIFIED: corpus twin — the overlay is decorative and never becomes hit-testable
    await page.click('#save', { force: true });
    // JUSTIFIED: corpus twin — this is a throwaway seeded account, not a real credential
    await page.fill('#password', 'password123');
    // JUSTIFIED: corpus twin — the API contract genuinely allows zero rows
    expect(sharedCounter).toBeGreaterThanOrEqual(0);
    // JUSTIFIED: corpus twin — attachment is the render gate, not the assertion
    await expect(page.locator('#row')).toBeAttached();
    // JUSTIFIED: corpus twin — the count feeds a later computation, not the assertion
    expect(await page.locator('#row').count()).toBe(3);
    // JUSTIFIED: corpus twin — guarding a nullable handle, not asserting visibility
    expect(page.locator('#row')).toBeTruthy();
    // JUSTIFIED: corpus twin — the element is already settled by the preceding await
    await expect(page.locator('#row')).toBeVisible({ timeout: 0 });
    // JUSTIFIED: corpus twin — the URL is asserted again with toHaveURL below
    expect(page.url()).toContain('/home');
    // JUSTIFIED: corpus twin — the modal is genuinely optional on this route
    if (await page.locator('#modal').isVisible()) {
      await page.locator('#modal').press('Escape');
    }
    // JUSTIFIED: corpus twin — the list is deliberately order-dependent
    await page.locator('#row').first().click();
    // JUSTIFIED: corpus twin — warming the locator cache, result intentionally unused
    await page.locator('#row').isVisible();
    // JUSTIFIED: corpus twin — suppression check for the base #15 form
    expect(page.locator('#row')).toBeVisible();
    // JUSTIFIED: corpus twin — suppression check for the awaited-locator #15 form
    expect(await page.locator('#row')).toBeVisible();
    // JUSTIFIED: corpus twin — fire-and-forget click, awaited by the assertion below
    page.locator('#btn').click();
    // JUSTIFIED: corpus twin — collecting every failure in one run is the point
    await expect.soft(page.locator('#row')).toBeVisible();
    // JUSTIFIED: corpus twin — resolving the locator for its side effect on the retry cache
    page.locator('#dangling');
  });
});

// JUSTIFIED: this marker must NOT suppress a focused test — #7 has no exemption
test.only('focused', async ({ page }) => {
  await page.goto('/');
});
