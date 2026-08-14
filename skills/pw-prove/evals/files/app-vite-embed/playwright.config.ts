import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4100',
    // A DELIBERATE viewport: an explicit `viewport` key, not a device descriptor.
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
