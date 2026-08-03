// Spec importing the project fixtures wrapper — no literal '@playwright/test' import in
// this file. The scope filter must classify it IN scope via its page-API markers; the
// import-only filter used to scope it OUT and report a false "0 P0".
import { test, expect } from './fixtures';

test('invoice can be archived', async ({ page }) => {
  await page.goto('/billing/invoices');
  await page.getByRole('button', { name: 'Archive' }).click();
  expect(await page.locator('.invoice-status').isVisible()).toBe(true);
});
