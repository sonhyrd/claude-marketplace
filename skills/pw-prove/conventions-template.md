# E2E Conventions Template (AGENTS.md section)

Used by Step 5b when a project has no testing-conventions doc. Fill every `<angle-bracket>` field from what Step 3 exploration **actually observed** — a conventions doc that parrots generic best practices instead of project reality is worse than none, because future agents will trust it.

Append the section below to the project's root `AGENTS.md` (create the file if absent). If the team uses Claude Code and no `CLAUDE.md` exists, create one containing a single pointer: `See AGENTS.md.`

---

## E2E Testing

### Layout
- Specs: `<testDir>/<area>/<feature>.spec.ts`
- Page objects: `<pom-dir — e.g. tests/pages/. pw-prove adds a POM even when existing specs are flat>`
- Shared fixtures: `<fixtures file, or "none">`
- Never touch: `<protected areas — e.g. visual-regression suites, snapshot baselines, capture scripts>`

### Locator strategy (this app's reality)
- Buttons / links: `getByRole('button' | 'link', { name })`
- Form inputs: `<"getByLabel — labels exist" | "inputs have NO labels — use getByPlaceholder('<string>') or getByRole('textbox'); getByLabel matches nothing here">`
- Last resort: `data-testid`. Raw CSS chains / XPath: forbidden.

### Assertions
Auto-waiting web-first assertions only (`toBeVisible`, `toHaveURL`, `toHaveText`, `toHaveCount`). No `waitForTimeout`, no one-shot boolean checks (`expect(await el.isVisible())`).

### Network (HAR-first)
- API shape: `<e.g. "all calls proxied through /api/request?cmd=<path>">`
- Reads: replayed from a committed, API-scoped (`**/api/**`), capture-time-scrubbed HAR — `page.routeFromHAR(process.env.PW_PROVE_HAR ?? '<feature>.api.har', { url: '**/api/**', notFound: 'abort' })` — `PW_PROVE_HAR` is the run-local copy bound by `har-scrub.mjs bind`; CI replays the committed file. Recorded during recon; refresh with `{ update: true }` when it drifts. No hand-authored read mocks.
- Writes/credentials (signup, login, payment, mutations): the mutation under assertion is the one hand-written `route.fulfill`; every other write MUST be stubbed too. A write must never reach the real backend.
- Real backend allowed: `<which read endpoints / the one designated smoke spec — only as a declared // CARVE-OUT:>`

### Auth
- Session setup: `<programmatic helper / setup project + storageState path>`
- Do NOT depend on: `<manually captured session files — name them>`
- Logged-out scenarios: fresh context (project `<name>`)

### Routing facts (verified)
- `<e.g. "logged-out + protected route → 307 redirect to /">`
- `<e.g. "logged-in non-guest + / → redirect to /home; guest sessions excluded">`

### Run
- All E2E: `<command>`
- Single spec: `<command> <path>`
- Dev server: `<"auto-started via playwright webServer (reuses a running one)" | "must be running at <url> first">`

### Adding tests (AI agents start here)
To add E2E coverage for feature X: copy the shape of `<seed spec path>`, add locators only via the Locator Mapping Table workflow, replay reads from a recorded `api.har` and hand-mock the mutation under assertion, then run `<verify command>`.
Deferred areas — do not auto-generate without sign-off: `<e.g. payment (external PG redirect), member-session deep flows>`.
