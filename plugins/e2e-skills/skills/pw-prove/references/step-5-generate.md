# pw-prove — Step 5 reference: Generate

Moved verbatim from `SKILL.md`, whose Step 5 says when to read it. Nothing here changes the procedure `SKILL.md` states.

**Always POM — no exceptions:** every generated spec uses a Page Object. Scaffold one even when existing specs are flat — do not match the flat siblings, never rewrite them; add the POM for the new coverage only. There is no `structure: flat` opt-out. A Nuxt/Next `pages/` route folder is not a POM dir.

**Extend, don't duplicate — match the Step 1 `pomInventory` by route.** Route already has a Page Object → extend that class, never scaffold a second POM for the same route. A duplicate ships only with a stated justification line in the Assumptions block. An uncovered route with no POM still gets a fresh one.

**HAR-first mocking.** Replay read traffic from the committed `api.har` via `page.routeFromHAR('<feature>.api.har', { url: '**/api/**', notFound: 'abort' })` — `notFound: 'abort'` keeps the spec strictly hermetic (an unrecorded call aborts, surfacing as a visible failure rather than a silent live round-trip). Hand-write `route.fulfill` **only** for the mutation under assertion (the stateful write the scenario tests). The HAR is committed, API-scoped, and already scrubbed — `probe.mjs` scrubbed it at capture, so every secret in it is a stable placeholder and its loopback origins are canonical (`http://localhost`, no port).

**Replay reads a bound working copy, never the committed file directly.** Playwright matches a recorded entry by **exact request-URL string equality** (`harBackend.js`: `candidate.request.url !== url` — verified in playwright-core 1.58.2 and 1.62.1), so a canonical, placeheld HAR can never match a live run: every read would abort under `notFound: 'abort'` and read as a broken application. Step 7 binds it to this run first (`har-scrub.mjs bind`), and the spec reads the bound copy through one env var with the committed file as its default:

```ts
// The committed HAR is canonical and secret-free; PW_PROVE_HAR points at this run's bound copy.
await page.routeFromHAR(process.env.PW_PROVE_HAR ?? '<feature>.api.har', {
  url: '**/api/**',
  notFound: 'abort',
});
```

**No HAR from the recon pass? Say so — never fall back silently to hand-written mocks.** A spec that replays a HAR which is not there aborts every call under `notFound: 'abort'`, which reads as a broken application rather than as a missing recording. Record the deviation as `no api.har — <reason>` in **both** the Step-4 Assumptions block and the Step-8 completion report, and hand-mock only what the scenario under proof actually needs.

### Step 5b: Conventions & Seed (first run on a project)

0. **Bootstrap the runner if greenfield (`hasTestRunner: false`)** — independent of the conventions gate, because Steps 6–7 can't run without it. Add `@playwright/test` with the project's package manager so it lands **pinned** in `package.json` (a pinned dep is not the npx-floated install the "never auto-install" rule forbids); `npx playwright install chromium`; author a minimal `playwright.config.*` (`testDir`, `use.baseURL`, a `webServer` running the project's `dev` with `reuseExistingServer: !process.env.CI`, `forbidOnly: !!process.env.CI`, `retries: process.env.CI ? 2 : 0`); add `<testDir>/tsconfig.json` for `tsc`. Idempotent; skip any existing artifact.
1. Generate a project-adapted E2E conventions section from `conventions-template.md` into the root `AGENTS.md` (+ a one-line `CLAUDE.md` pointer if used). Append to existing files; create only when absent.
2. Designate the best generated spec as the seed — reference it by path ("copy the shape of `<path>`").
3. Fill the template's project-reality fields from what Step 3 observed (label-less inputs, API proxy shape, auth mechanism, HAR scope, protected areas), never from generic best practices.
4. Propose lint hardening from `recommended-lint.md`: no E2E lint config → offer the preset + `forbidOnly: !!process.env.CI`; config exists → surface only missing rules as an opt-in diff. Never overwrite. State that `e2e-reviewer` still covers the silent-always-pass families no rule can express.
