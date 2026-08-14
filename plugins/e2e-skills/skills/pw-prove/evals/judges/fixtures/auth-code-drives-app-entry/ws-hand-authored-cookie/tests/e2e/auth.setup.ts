import { test as setup } from '@playwright/test'

setup('seed the session cookie', async ({ context }) => {
  await fetch('/api/auth/login')
  await context.addCookies([
    { name: 'app_session', value: 'eyJhbGciOiJIUzI1NiJ9.fake.signature', domain: 'localhost', path: '/' },
  ])
})
