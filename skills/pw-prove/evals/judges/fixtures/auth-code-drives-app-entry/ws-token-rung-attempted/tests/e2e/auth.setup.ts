import { test as setup, expect } from '@playwright/test'

setup('bootstrap the session from the query parameter', async ({ page }) => {
  await page.goto(`/reports?token=${process.env.E2E_BEARER}`)
  await expect(page).toHaveURL(/\/reports$/, { timeout: 60_000 })
})
