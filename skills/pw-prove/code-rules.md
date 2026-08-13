# Code Generation Rules

## Hard rules (always)

Non-negotiable for every generated spec, regardless of project shape:

- **`await` everything** — every `expect()` on a Locator and every Playwright action (`.click()`, `.fill()`, `.type()`, `.press()`, `.check()`, `.selectOption()`, `.hover()`). A missing `await` silently skips the assertion or action.
- **Web-first assertions only** — `toBeVisible()`, `toHaveText()`, `toHaveURL()`, etc. Never `expect(await el.isVisible()).toBe(true)` (resolves once, no retry).
- **Hermetic by default** — every network call the spec triggers is answered by a mock; a live round-trip exists only as a declared carve-out (see Network Determinism). Step 7's hermetic audit fails the run on any undeclared live call.
- **Stub all writes** — signup, login, payment, any mutation goes through `page.route()`. A generated test never mutates real shared backend data.
- **Gate hydration** — on SSR/SSG apps, gate the first interaction on a hydration signal, never `waitForTimeout()` after `goto`.
- **One hard `expect()` per test** — a test built only from `expect.soft()` never fails early.

## Structure Detection

**Always Page Object Model (POM) — no exceptions.** Every generated spec uses a Page Object; POM keeps selectors in one place and survives DOM churn. Flat sibling specs change nothing: even in a repo where every existing E2E spec is flat, scaffold a POM for the new coverage — do not match the flat house style, and do not offer a `structure: flat` opt-out. "Internal consistency with flat siblings" is not a reason to write flat.

| What you find | What to generate |
|---------------|-----------------|
| POM directory exists, no POM for this page | New POM class (extends `BasePage` if present) + spec file |
| POM directory exists, POM for this page already exists | Extend existing POM — add new locators only + new spec file |
| No POM directory (greenfield, **or** a repo whose existing specs are all flat) | **Scaffold a POM** — `<testDir>/pages/<Feature>Page.ts` + spec. Do **not** match the flat siblings, and never rewrite them. |

**Do not mistake a route folder for a POM directory.** A Nuxt/Next `pages/` (or `app/`) folder holds route components, not Page Objects — it never counts as "POM directory exists." Look for Page Object *classes* the specs import, not any directory named `pages/`.

**Extending an existing POM:** read the file first; match its existing naming and structural patterns — even if they differ from the rules below. Apply the rules below only to newly added code.

**Scaffolding a new POM dir:** put it at the test root — `<testDir>/pages/<Feature>Page.ts` — unless the project already uses `models/` or `page-objects/`, in which case match that name. One class per feature/page, following the POM Rules below. Never retro-refactor existing flat specs — add the POM for the *new* coverage and leave the siblings untouched.

---

## Selector Priority (best → worst)

1. `getByRole('button', { name: 'Submit' })` — role + accessible name
2. `getByLabel('Email')` — form label — **only when the label/aria-label actually exists**; verify in the Step 3 snapshot before using
3. `getByPlaceholder('Email')` — for label-less inputs (placeholder/title only). Common in real-world apps; `getByLabel` on these matches nothing and the test dies in `beforeEach`
4. `getByTestId('submit-btn')` / `[data-testid="submit-btn"]` — explicit test hook
5. `getByText('Save')` / `.filter({ hasText: 'text' })` — visible text
6. attribute selector `[formControlName="email"]` — stable attribute
7. CSS class — **POM files only**, stable structural classes only (not styling classes)
8. `.nth()` / `.first()` / `.last()` — **forbidden** without `// JUSTIFIED:` on the line above

**Project-configured test ids rank with role+name.** When `playwright.config.*` sets `use: { testIdAttribute: '...' }`, or `data-testid` (or the project's equivalent) is pervasive in the components under test, treat `getByTestId` as a **tier-1 locator alongside role+name** — not #4. A deliberate, stable test hook beats brittle text/placeholder locators; keep `getByText`/`getByPlaceholder` as the fallback when no role or test id fits.

**Anchored regexes are a trap in `getByText` on mixed-content elements.** `getByText` matches the element's *text content*, and an element that also holds an icon, a `<span>`, or any other child yields a string the anchor no longer fits — `getByText(/^(Vererbt|Inherited)/)` matched nothing against a badge whose span held an icon element plus the text node, while the unanchored `/(Vererbt|Inherited)/` matched immediately. Drop the anchors in `getByText` unless the element is a pure text node. Anchors stay correct in `getByRole(…, { name: /^X$/ })` — that matches the **accessible name**, which is already normalized.

Never use XPath. Never use CSS class chains that couple to styling.

---

## POM Rules (new files only)

```typescript
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly form: {
    emailInput: Locator;
    passwordInput: Locator;
    submitButton: Locator;
  };
  readonly errorMessage: Locator;

  constructor(private page: Page) {
    this.form = {
      emailInput: page.getByLabel('Email'),
      passwordInput: page.getByLabel('Password'),
      submitButton: page.getByRole('button', { name: 'Sign in' }),
    };
    this.errorMessage = page.getByText('Invalid credentials');
  }

  async navigate() {
    await this.page.goto('/login');
  }
}
```

- `readonly` locators only — no getter methods
- Composition pattern: group related locators into named objects
- `navigate()` uses `page.goto(path)` unless a custom navigation utility exists in the project

---

## Spec Rules

```typescript
import { test, expect } from '@playwright/test';
import { LoginPage } from '../models/login-page';

test.describe('Login', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.navigate();
  });

  test('should sign in with valid credentials', async ({ page }) => {
    // Given: user is on the login page (handled by beforeEach)

    // When: user fills in valid credentials and submits
    await loginPage.form.emailInput.fill(process.env.TEST_USER!);
    await loginPage.form.passwordInput.fill(process.env.TEST_PASSWORD!);
    await loginPage.form.submitButton.click();

    // Then: user is redirected to the dashboard
    await expect(page).toHaveURL('/dashboard');
  });

  test('should show error for invalid credentials', async () => {
    // Given: user is on the login page

    // When: user submits invalid credentials
    await loginPage.form.emailInput.fill('nonexistent@test.invalid');
    await loginPage.form.passwordInput.fill('wrongpassword');
    await loginPage.form.submitButton.click();

    // Then: error message is shown
    await expect(loginPage.errorMessage).toBeVisible();
  });
});
```

- BDD comments: `// Given:`, `// When:`, `// Then:`
- Each test fully independent — own storage, session, cookies
- `beforeEach` for shared navigation setup only — never for shared state
- Mock external APIs with Playwright Network API; do not call real third-party services
- **Auto-waiting assertions only:** `toBeVisible()`, `toBeHidden()`, `toHaveText()`, `toContainText()`, `toHaveCount()`, `toHaveURL()`
- Use `expect.soft()` for independent, non-critical checks — but at least one hard `expect()` must gate the primary condition per test (a soft-only test never fails early)

**Forbidden:**

> Maintenance: the rules below (and the mirrored entries elsewhere in this file) duplicate e2e-reviewer patterns for generation-time convenience. Pattern semantics — IDs, severities, false-positive exclusions — are owned by `skills/e2e-reviewer/references/pattern-reference.md`; on conflict, that file wins.

| Forbidden | Use instead |
|-----------|-------------|
| `waitForTimeout(N)` | `await expect(el).toBeVisible({ timeout: N })` — sole exception: the env-gated payoff dwell (see [Clip Fidelity](#clip-fidelity)) |
| `expect(await el.isVisible()).toBe(true)` | `await expect(el).toBeVisible()` |
| `const n = await el.count()` | `await expect(el).toHaveCount(N)` or `.first()` + `toBeVisible()` |
| `toBeAttached()` | `toBeVisible()` — `toBeAttached` is vacuous on always-rendered elements. Negative `not.toBeAttached()` and checks on dynamically-injected elements are acceptable (matches e2e-reviewer #4b). |
| `expect(locator).toBeTruthy()` | `await expect(locator).toBeVisible()` — Locator is always a truthy JS object |
| `page.click(selector)` / `page.fill(selector, v)` | `page.locator(selector).click()` / `.fill(v)` — locator-first actions are easier to compose and review |
| `{ force: true }` | Fix the root cause (element not actionable); if unavoidable, add `// JUSTIFIED:` |
| `waitUntil: 'networkidle'` | `waitUntil: 'domcontentloaded'` or condition-based wait — unreliable on SPAs |
| `expect(page.url()).toContain(x)` | `await expect(page).toHaveURL(x)` — one-shot, no retry |
| Framework component selectors in spec (`app-button`, `my-component`) | POM only |
| XPath selectors | `getByRole` / `getByLabel` / `getByTestId` |
| `import { URL } from '@playwright/test'` | Use the global `URL` (or the `(route, request)` route-callback signature) — Playwright doesn't export `URL`; the param is the DOM global, and importing it fails typecheck |

---

## Clip Fidelity

The Proof clip is **reviewer-facing evidence**, not a leftover (`docs/adr/0007`, amended by `docs/adr/0015`). Everything below belongs in the **committed** spec, so the Step-7 proof run and the CI run render identically by construction rather than by luck.

### The filming law

Apply one principle, not a list of positions:

> **`PW_PROVE_CLIP` may only ever add time. It may never change what the app is asked to do.**

Two consequences, and they are the whole rule:

- **Waits are the only gated operation.** A dwell — and nothing else — sits behind `if (process.env.PW_PROVE_CLIP)`.
- **Everything else is unconditional.** Centring, scrolling, and the choice of input method are written plainly in the spec and **run in CI too**. If a legible clip needs the element centred, CI centres it as well; that is what makes the filmed rendering the same rendering CI produces.

A gated dwell may sit at **any beat** — after a navigation, after a form fills, after an intermediate assertion, at the end — **except in a race window**.

> A **race window** is the gap between an action and the assertion that covers it: the one place where extra time changes the verdict. A dwell there makes the filmed run more patient than CI, so the proof passes while CI flakes. That is smell #9 with a switch on it.

Every dwell sits **after** its beat's own assertion, which is what puts it outside the race window. Confining the dwell to the end of the test was the crude form of this rule; the race window is the rule.

**Consequently forbidden**, even though each is tempting while filming:

| Forbidden | Why the filming law rejects it |
|---|---|
| A `PW_PROVE_CLIP`-gated `pressSequentially()` in place of `fill()` | Swaps one `input` event for N keystroke events *before* the assertion. A debounced field, a per-key validator or a typeahead is driven **differently in the film than in CI** — the filmed software is not the shipped software. |
| An ungated `pressSequentially(value, { delay })` | The delay is a per-keystroke fixed sleep **every CI run pays forever**. That is smell #9's cost profile walking back in through the front door. |
| A gated `test.use({ viewport })`, or any gated scroll/centring | Changes what the app is asked to render. A rendering that exists only while filming means healing, the hermetic audit and the mutation check all ran against something CI never produces. |
| A gated `route()`, click, assertion timeout or retry count | Not a wait. Anything that alters traffic, input or tolerance changes the run, not its duration. |

### Viewport pin

Resolve the **effective viewport** from the project's Playwright config:

| What the config carries | Verdict | Action |
|---|---|---|
| An explicit `viewport:` key, in top-level `use` or a project's `use` | **Deliberate** | Respect it. Never pin over it. |
| A viewport arriving only from a desktop device-descriptor spread (`...devices['Desktop Chrome']`) | **Scaffold default** | Pin over it. |
| A **mobile / non-desktop** descriptor (`...devices['iPhone 15']`, `isMobile: true`) | **Deliberate** | Respect it — a desktop pin over a mobile descriptor is nonsense. |
| Nothing at all (Playwright's 1280×720 default) | **Scaffold default** | Pin over it. |

Only an **explicit key** counts as deliberate. Nearly every scaffolded config spreads a device descriptor carrying 1280×720; reading that as a project decision would mean the pin never fires on real projects.

When the verdict is *scaffold default*, pin a legible desktop viewport in the spec:

```typescript
test.use({ viewport: { width: 1600, height: 900 } });
```

Pin in the **spec** — never by editing the project's committed `playwright.config` (out of bounds), and never *only* in the proof config. A viewport that exists solely while filming means locator healing, the hermetic audit and the mutation check all ran against a rendering CI never produces: a viewport-axis silent-always-pass, which is precisely the family this pipeline exists to prevent.

Report the resolved effective viewport in the run's Assumptions block. Step 7 passes it as `PW_PROVE_W`/`PW_PROVE_H` so the recording size matches and the clip is never downscaled — the proof config itself stays static and carries no per-run value.

### Framing

**Framing is the third property of the clip fidelity contract**, beside legible size and held payoff — and it is mandatory, not a polish pass. A clip can hold the success signal for the full dwell and still be worthless, because the signal sits jammed against the screen edge — or was pushed off-frame entirely by a re-render that landed after the scroll. **Centre the element under proof, at the moment of the hold** — `await el.evaluate((n) => n.scrollIntoView({ block: 'center', inline: 'center' }))`, immediately before the dwell it frames (see the §Payoff dwell snippet, which is the shape to copy).

- **`scrollIntoViewIfNeeded()` is not framing.** It moves the *minimum* distance, so it parks the element against whichever edge it entered from. Playwright's actionability scroll does the same. Both leave a frame one re-render away from useless.
- **At the moment of the hold, not before it.** Centre after the assertion that proves the payoff, so any re-render that assertion waited for has already happened. Centring earlier and dwelling later films whatever the re-render moved into place.
- **Ungated.** Framing is a scroll, not a wait — the filming law puts it in the committed spec unconditionally.

### Payoff dwell

The clip's last informative frame is the success signal, and a hermetic proof reaches it in a fraction of a second — faster than a reviewer can see. **Every generated `test()` carries at least one dwell**, framed. This is the canonical dwell: Step 5 carries it inline, `clip-fidelity.mjs` prints it on failure, and CI fails on any variant.

```typescript
// Then: the save is confirmed
const status = page.getByRole('status');
await expect(status).toHaveText('Saved');                     // assertion covering this beat
await status.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));  // framing, ungated
// JUSTIFIED: proof-clip payoff hold. Runs only under PW_PROVE_CLIP (the pw-prove Step-7 proof
// run); it sits after the assertion covering the beat above, so it adds time and nothing else.
// CI never sets it.
if (process.env.PW_PROVE_CLIP) await page.waitForTimeout(2500);
```

Every constraint here is load-bearing:

- **At least one per test**, outside every race window. The last one goes at the end of the test, on the payoff. A further mid-test hold is legitimate when a beat the reviewer must see (a route transition, a filled form, an intermediate state) would otherwise flash past, and it goes **after** that beat's own assertion.
- **Framed.** A dwell holds on something; if the reader cannot see it, the hold bought nothing. Centre first, hold second.
- **Env-gated on `PW_PROVE_CLIP`.** Only the Step-7 proof run sets it. CI never does, so the suite does not get slower with every proof that lands.
- **`// JUSTIFIED:` on the preceding line**, naming the gate and why it is safe. e2e-reviewer honors the marker for #9 across all three detection tiers, so the quality gate stays quiet — and stays meaningful. A dwell without the marker is an unexplained fixed wait and gets flagged like any other.
- **Written as an `if (…)`, inline in the `test()` body.** Brace style and line wrapping are free — braced or not, on one line or two, all read the same. Two things are not: a gate written without parentheses (`process.env.PW_PROVE_CLIP && await …`) is not recognised, and a dwell hoisted into a helper does not count for the tests that call it, because one shared dwell would satisfy tests that hold on nothing.

This is the **only** sanctioned `page.waitForTimeout()` in generated output. Any other one is #9 and gets fixed, not justified.

### Atomic input

The evidence is the **state change**, not the keystrokes — so fill atomically and hold on the field's end state. (The exception is an acceptance criterion that is itself *about entering data*.)

```typescript
// When: the reviewer enters the new title
await page.getByLabel('Title').fill('Q3 revenue review');
// Then: the form accepts it
await expect(page.getByLabel('Title')).toHaveValue('Q3 revenue review');
await page.getByLabel('Title').evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
// JUSTIFIED: proof-clip payoff hold. Runs only under PW_PROVE_CLIP (the pw-prove Step-7 proof
// run); it sits after the assertion covering the beat above, so it adds time and nothing else.
// CI never sets it.
if (process.env.PW_PROVE_CLIP) await page.waitForTimeout(2500);
```

A held filled field reads as well as keystrokes and costs CI nothing.

---

## Network Determinism

**Hermetic by default, HAR-first.** Every call the spec triggers is answered from a committed fixture; the only live traffic a spec may carry is a **declared carve-out**. Read traffic replays from an **API-scoped HAR, scrubbed at capture**, recorded during the Step-3 probe pass (`RECORD_HAR`); the one **mutation under assertion** is hand-mocked. This keeps generated mock code small (the reads are recorded, not authored) and the spec self-hermetic and CI-durable.

```typescript
// reads: replay the committed HAR. notFound:'abort' makes an unrecorded call FAIL loudly
// instead of leaking to the live backend — the strict-hermetic default.
// PW_PROVE_HAR points at this run's bound working copy (Step 7 item 1b); unset — in CI — the
// committed file is used. Playwright matches on EXACT request-URL equality, so a live run must
// replay the bound copy or every read aborts.
await page.routeFromHAR(process.env.PW_PROVE_HAR ?? '<feature>.api.har', {
  url: '**/api/**',
  notFound: 'abort',
});
// the mutation under assertion: hand-mock it so no write leaves the browser (see below).
await page.route('**/api/v1/section-config', route => route.fulfill({ status: 200, body: '{}' }));
```

| Traffic | Strategy |
|---------|----------|
| **Writes / credential paths** (signup, login, payment, any mutation) | **Always stub** with `page.route()`. The mutation under assertion is the one hand-written mock; a generated test must never create real accounts, hit real payment providers, or mutate shared backend data. |
| First-party reads | **Replay from the committed `api.har`** (`routeFromHAR`, `notFound:'abort'`) — recorded once during the probe pass, deterministic and CI-durable. No hand-authored `route.fulfill` for reads. |
| Third-party services | Covered by the HAR's `**/api/**` scope only if first-party; otherwise stub explicitly (also Spec Rules above) |
| A real round-trip that **IS the acceptance criterion** | **Declared carve-out only** — see below |

**The HAR is a committed deliverable.** Scoped to `**/api/**` (so it stays small — no bundle/asset bytes), **scrubbed at the moment of capture** — `probe.mjs` hands the recording to `har-scrub.mjs` on context close, so the file is never unscrubbed on disk and there is no scrub step to place, remember or get wrong — and refreshed with a `routeFromHAR(..., { update: true })` run when it drifts. Every secret in it is a stable placeholder (`__PWPROVE_SECRET_<n>__`, or `__PWPROVE_SCRUBBED__` inside a URL) rather than a deletion, so the recording still replays; loopback origins are canonical (`http://localhost`, no port), so a live run cannot replay the committed file directly: Playwright's HAR lookup matches on **exact request-URL string equality** (`harBackend.js`: `candidate.request.url !== url`, verified in playwright-core 1.58.2 and 1.62.1), with no tolerance for port, origin or query. `har-scrub.mjs bind --out <gitignored> --origin "$BASE_URL" --bindings <json>` writes the run-local working copy replay actually reads — this run's origin substituted back, and each placeholder in the match key (request URL, query string, and a POST's body) bound to this run's own value. It refuses on a placeholder it cannot bind rather than letting the entry abort as if the application were broken, and refuses a destination git would commit. The committed file is never rewritten. Before it is staged, Step 8 runs `har-scrub.mjs <file> --verify` and a non-zero exit stops the run — a leaked bearer in a committed HAR is the same incident as one in a log line, so it is held by a refusal, not by a request that someone confirm. Gitignoring it is forbidden: the committed spec must replay hermetically in CI without a live backend, and a HAR-absent run must never fall through to the shared tenant.

**Declared carve-out** — the one sanctioned exception, used only when the real round-trip is itself the behavior under proof (e.g. "the live rate endpoint answers"). It must be:

1. **Named in the Step 4 scenario plan**, and
2. **Declared in the spec header**, one line per live endpoint:
   ```typescript
   // CARVE-OUT: GET /api/v2/exchange-rates — live round-trip IS the AC — restore: read-only
   // CARVE-OUT: POST /api/v2/drafts — draft lifecycle IS the AC — restore: DELETE /api/v2/drafts/:id in afterEach (proven below)
   ```
3. **Reads may run freely; writes need a proven restore** (the restore call must itself be exercised in the spec), and a carve-out **never creates data on a shared tenant**.

Step 7's hermetic audit compares the run's live calls against these headers: any live call with no matching `CARVE-OUT:` line **fails the run**, green or not.

**Match the URL path, query-tolerant — derive the pattern from an OBSERVED request, not source intent.** A mock end-anchoring the full href (`/\/documents$/`, or `url === '…/documents'`) silently misses a query suffix the app appends (`?lang=en`, `?v=2`): the route never intercepts, the real (often empty) response renders, and the spec fails at the ready selector instead of on the mock. Match the path with a trailing-query-tolerant glob (`page.route('**/documents*', …)`) or test `new URL(route.request().url()).pathname` — never the whole href with a `$` anchor. Get the real URL from an observed request — the Step 3 probe's `network-summary` (which prints each endpoint's observed query suffix), or the failing run's own request log — never by guessing from source, and never by writing a throwaway spec to log it (non-deliverable spec probes are forbidden, SKILL Step 3).

When the app funnels API calls through a proxy endpoint (e.g. `/api/request?cmd=<path>`), write ONE shared route-mock helper that matches on the decoded routing parameter and exposes response builders — not per-test `page.route()` calls with duplicated URL parsing:

```typescript
// helpers/mockApi.ts — match on the decoded routing param; unlisted calls fall through
await page.route('**/api/request?**', route => {
  const cmd = decodeCmd(route.request().url());
  const hit = map[cmd];
  return hit
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hit) })
    : route.continue();
});
```

Fall-through (`route.continue()`) is how live traffic escapes a hermetic spec: **a misspelled key silently leaks a call — possibly a write — to the real backend.** Default the helper to answering every API call it sees (empty success + loud warning for unlisted cmds); reserve `route.continue()` for endpoints a declared carve-out names. Record that requirement in the project's conventions doc (Step 5b).

**The mock layer is decided by where the call originates, not just the URL.** `page.route()` intercepts only requests the *browser* makes. Server-side calls — Next.js SSR/RSC, route handlers, a BFF, `getServerSideProps` — never pass through it, so a `page.route()` mock silently misses them and the test hits the real backend. Mock those at a server-side seam: an E2E-only env var flipping the server's fetch boundary to fixed responses (`process.env.E2E_MOCK` → canned payloads), or the project's existing test double. Detect the origin first: data present in the initial SSR HTML (view-source) = a server call; `page.route()` won't help.

**Request-aware rules.** When the same endpoint must answer differently by method or parameters (tab filters, pagination pages, POST toggles), extend the helper with an ordered rule list instead of sprinkling conditional logic in specs:

```typescript
type MockRule = {
  when?: { method?: string; params?: Record<string, string> };
  response: { status?: number; body: unknown };
};
// map value: single response (back-compat) OR MockRule[] — first match wins.
// params compare only the listed keys: URL query for GET/DELETE,
// urlencoded body for POST (body value wins if a key exists in both).
```

Two hard rules learned from production use:

- **A registered-but-unmatched rule array must NOT fall through to the network.** If the cmd is in the map but no rule matches, answer with an empty success + a loud warning that includes the method and params — a param typo (`liked: 'True'`) must surface as a warning, never as a real-backend write.
- Pagination contracts become testable with a `start`/`offset` param rule per page: seed page 1 at exactly the page size (a short page often sets an internal "loaded end" flag that suppresses the next request), then assert the page-2 item appears after scroll *and* a page-1 item is still attached (append, not replace).
- **Before narrowing a rule with `when.params`, prove the app actually sends that param at that point in time — wire evidence, not source intent.** A component reading `router.query` in a first-render `useRef`/initializer fires its initial fetch during hydration, before `router.isReady` — the param is silently dropped from the wire even though the source "passes" it, so the narrowed rule never matches, the strict fallback answers empty, and a previously-green render test fails for a contract the app never honors. If the param is best-effort in practice, keep the broad rule and comment the WHY, citing the file:line of the early read.

**Prove the call, not just the pixels.** For write interactions with optimistic UI (like toggles, deletes), the UI updates before — and regardless of — the request. Pair every such assertion with request proof:

```typescript
const call = page.waitForRequest(r => r.method() === 'POST' && r.url().includes('cmd=%2Fv2%2Fuser%2Fsentence%2Flike'));
await likeToggle.click();
await call; // without this line the test passes even if the wiring to the API is deleted
await expect(likeToggle).toHaveAttribute('aria-pressed', 'true');
```

**Read the payload off the awaited `Request` — never off a route-handler closure.** `waitForRequest` resolves on the request *event*, which fires **before** the matching route handler's body runs, so a variable the handler assigns may still be `undefined` at the line that asserts it. The awaited request is the only source that is guaranteed populated:

```typescript
const call = page.waitForRequest(r => r.method() === 'PATCH' && r.url().includes('/api/settings'));
await page.route('**/api/settings', r => r.fulfill({ status: 200, body: '{}' }));  // hermetic: nothing reaches the tenant
await saveButton.click();
const body = (await call).postDataJSON();          // ← populated; a `let captured` set inside the handler is not
expect(body).toMatchObject({ locale: 'de' });
```

Fulfilling locally in the route handler is also what keeps a mutation proof hermetic — no write leaves the browser, so re-running the spec never touches shared data.

**…but prove the call HAPPENS before asserting it (the inverse trap).** "Prove the call" applies only to calls the app actually makes at runtime. Canonical counterexample: unmount-cleanup API calls — an empty-deps effect's cleanup captures its guard as a stale closure from mount time, so if the guard (e.g. a `quizSetId` arriving with the fetch response) was empty at mount, `if (id) api.cancel(id)` is a dead path forever, and a `waitForRequest` on it times out against correct test code. Before shipping a call-proof assertion on exit/unmount/cleanup paths, verify the request fires at least once (solo run, network log); if it never does, assert the user-visible outcome instead, file the stale closure as an app defect, and leave a comment with the file:line so the proof can be added when the defect is fixed.

**Assert the success *signal*, not just the side effect.** The terminal assertion of a write/delete flow is what the app shows the user on success — the toast / `alert` / redirect / empty-state — not only the earlier DOM change (a row vanishing). It's what a human reads as "it worked," what the proof clip captures — asserting on the success signal makes Playwright wait until it's on screen, so the recorded run ends on it (SKILL Step 7) — and asserting a row's *absence* alone passes even when the app silently failed and never confirmed. Assert the visible confirmation; the row-gone check may be a *second* assertion, never the only one.

**Destructive/mutating specs must be re-runnable — WARN if they aren't.** A delete/create spec acting on a pre-existing record passes once, then fails every re-run (row gone, or a unique key collides) — including in CI, where a one-shot destructive spec green locally fails on the next run. Durable pattern: self-seeding — arrange the target inside the test (API or UI create in the test / `beforeEach`), then act on it, so verification and CI both pass. When a generated spec mutates data it did not itself create, **WARN the user** ("this deletes a real record — it won't survive a re-run or CI without seeding its own fixture") rather than silently shipping a spec that only passes once. Do not auto-invent the seed path unless the create route is obvious from Step 3–5 recon.

---

## SSR & Hydration

- **Gate the first interaction on hydration for server-rendered apps** (Next.js, Nuxt, SvelteKit, Astro, Remix). SSR paints interactive-looking elements before listeners attach; Playwright's actionability checks pass against that inert DOM, so the first click "succeeds", does nothing, and the spec fails at the *next* assertion — intermittently, because hydration sometimes wins the race. Detect SSR from the framework config/`package.json` before generating.
- Preferred gate, in order:
  1. An app-provided hydration marker: `await expect(page.locator('html[data-hydrated]')).toBeAttached();` — if the app exposes none, propose the one-line marker upstream (set an attribute in a root `useEffect`/`onMounted`); it fixes every spec at once.
  2. A self-verifying first action: `await expect(async () => { await button.click(); await expect(dialog).toBeVisible({ timeout: 1000 }); }).toPass();` — retries the click until it lands.
- Never `page.waitForTimeout()` after `goto` as a hydration guard — the #9 band-aid the reviewer flags, and it still races on slow CI. (The one sanctioned dwell is the [payoff hold](#clip-fidelity): env-gated, and placed outside the race window — never a wait for something to become ready.)
- Nuance: Qwik apps are resumable, not hydrated — no page-global gate needed. Island frameworks (Astro) hydrate per-island per their `client:*` directive — gate on the specific island's readiness (its own marker or a self-verifying action on that island), not a page-global signal.

---

## Auth & Session

- Authenticate **once**, programmatically (API-login helper or a `setup` project), persist with `storageState`, reuse it in specs that need a session. UI-driven login belongs only in specs that test the login flow itself.
- Never hard-depend on a **manually captured** session file — a locally generated `auth/*.json` that a fresh clone or CI won't have, and that silently expires. Generated tests must be able to recreate their session from code.
- Logged-out scenarios use a fresh context (no `storageState`) — don't "log out first" inside a test.
- **Login-success flows: route mocks can't mint cookies.** Session cookies are usually issued server-side (the app server proxies the login call and sets cookies from the backend response); a browser-layer route mock returns the success body but no `Set-Cookie`, so post-login SSR still sees an anonymous user. Hybrid pattern: mock the login POST for the form/UX behavior, seed the session cookies through the project's sanctioned test seam (test-auth endpoint, API login helper) right before submit, then assert the full redirect chain. Comment WHY in the spec — it reads like cheating until you know cookie issuance is server-side.

---

## Branch State Seeding

- Multi-step funnels (onboarding, checkout, multi-page applications): do **not** drive the shared prefix (consent → phone-auth → …) through the UI in every spec — re-running the common steps is slow, and one prefix change breaks every downstream test at once.
- Seed the user to the **branch's starting state** through a test-only API/endpoint, then exercise only the branch under test — the `storageState` approach for auth, extended to application state.
- Real UI steps for the prefix belong **only** in the one spec that specifically verifies that prefix. Everywhere else, seed and skip ahead.
- Record which seeding endpoints/fixtures exist in the project's conventions doc (Step 5b) so later runs reuse them instead of re-driving the funnel.

---

## Shared Mutable State (baseline / inheritance assertions)

A scenario asserting an inheritance/default **baseline** on state the whole tenant shares and can mutate (a global override, a shared setting, a default a prior run's edit can leave dirty) must not trust the state it inherits:

- **Self-heal before asserting.** Reset the stored overrides, save once, reload so the assertion reads persisted state — *then* assert the default. Reading whatever the last run left behind isn't proving the default; it passes or fails on litter.
- **Restore in `finally`/`afterEach` reloads FIRST.** A mid-test failure can leave the visible draft clean while the store still holds the override, so a guard that reads the *draft* skips cleanup and leaks the override into the next run's baseline. Reload, read persisted state, then restore. (Shape: a `clearVisibleOverrides()` that reloads before it reads.)

---

## Suppression Convention

When a forbidden pattern is genuinely unavoidable, add `// JUSTIFIED: <reason>` on the **line immediately above**. This tells the `e2e-reviewer` to skip the hit during grep checks.

Patterns that accept `// JUSTIFIED:`:
- `.nth()` / `.first()` / `.last()` — explain why positional selection is required
- `{ force: true }` — explain why the element is not normally actionable
- `{ timeout: 0 }` — explain why auto-retry must be disabled
- `evaluate()` / `waitForFunction()` with raw DOM — explain why the framework API can't express the condition

**No suppression exists for:** `test.only` / `it.only` (always remove before commit).
