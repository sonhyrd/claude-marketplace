// Corpus fixture: one deliberate hit for every Playwright check scan.mjs runs.
// Every smell below is intentional. See ../../README.md.
import { test, expect } from '@playwright/test';

let sharedCounter = 0;

test.describe.serial('corpus', () => {
  test('every playwright smell, once', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle');
    const el = document.querySelector('#app');
    await page.click('#save').catch(() => {});
    await page.click('#save', { force: true });
    await page.fill('#password', 'password123');
    expect(sharedCounter).toBeGreaterThanOrEqual(0);
    await expect(page.locator('#row')).toBeAttached();
    expect(await page.locator('#row').count()).toBe(3);
    expect(page.locator('#row')).toBeTruthy();
    await expect(page.locator('#row')).toBeVisible({ timeout: 0 });
    expect(page.url()).toContain('/home');
    if (await page.locator('#modal').isVisible()) {
      await page.locator('#modal').press('Escape');
    }
    await page.locator('#row').first().click();
    await page.locator('#row').isVisible();
    expect(page.locator('#row')).toBeVisible();
    expect(await page.locator('#row')).toBeVisible();
    page.locator('#btn').click();
    await expect.soft(page.locator('#row')).toBeVisible();
    page.locator('#dangling');
  });
});

test.only('focused', async ({ page }) => {
  await page.goto('/');
});
