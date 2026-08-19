import { test as setup } from '@playwright/test'

setup('seed the session', async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('auth.token', process.env.E2E_BEARER!)
    localStorage.setItem('auth.user', JSON.stringify({ id: '1', email: 'user@example.com' }))
  })
})
