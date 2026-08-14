import { test as setup, expect, request } from '@playwright/test'

// Rungs considered, in the skill's order:
//   ?token= bootstrap  -- ABSENT. `useAuth.ts` guards it with `import.meta.dev`, which the
//                         production build folds to false, so page.goto('/reports?token=<jwt>')
//                         would never be consumed. Not attempted.
//   storageState file  -- none in the repo.
//   server-set cookie  -- THIS. `server/api/auth-login.post.ts` mints `app_session` server-side,
//                         so the value cannot be hand-authored: no { name: 'app_session', value: '<jwt>' }.
//   localStorage seed  -- the app reads no auth key from localStorage; a localStorage.setItem seed
//                         here would render an authenticated-looking shell with no session at all.

setup('authenticate against the app\'s own login endpoint', async ({ playwright, context, baseURL }) => {
  const api = await playwright.request.newContext({ baseURL })
  const res = await api.post('/api/auth/login', {
    data: { email: process.env.TEST_USER, password: process.env.TEST_PASSWORD },
    timeout: 10_000,
  })
  expect(res.status(), 'the app rejected the credential').toBe(200)

  // The session is whatever the server just set. Read it back rather than minting one.
  const jar = await api.storageState()
  await context.addCookies(jar.cookies)
  await api.dispose()
})
