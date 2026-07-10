// Project fixtures wrapper: specs import { test, expect } from './fixtures' — NOT from
// '@playwright/test' directly. The scanner scope filter must still treat those specs as
// E2E surface (they carry page-API runtime markers, not the literal import).
import { test as base, expect } from '@playwright/test';

export const test = base.extend<{ invoicePage: void }>({
  invoicePage: async ({ page }, use) => {
    await page.goto('/invoices');
    await use();
  },
});
export { expect };
