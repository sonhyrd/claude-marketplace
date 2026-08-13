import { test, expect } from '@playwright/test'

test('renders the greeting for the current audience', async ({ page }) => {
  // PROVES: The widget greets a returning visitor by name.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible()
})
