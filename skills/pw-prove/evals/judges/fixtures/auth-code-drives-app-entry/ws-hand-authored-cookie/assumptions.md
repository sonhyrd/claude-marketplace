## Assumptions

- **Auth rung: server-set cookie.** `server/api/auth/login.post.ts` mints `app_session` server-side,
  so the spec API-logs in and reuses the `Set-Cookie` the app returns.
- **Skipped rung: the `?token=` bootstrap, guard `import.meta.dev`.** `app/composables/useAuth.ts`
  reads `route.query.token` only under `import.meta.dev`, which the production build folds to
  `false`. The rung is **absent** from the artifact under proof, so it was recorded and skipped
  rather than attempted; waiting for the app to consume that parameter would time out on a path that
  was compiled out.
