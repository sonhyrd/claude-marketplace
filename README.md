# e2e-skills

Three Agent Skills for end-to-end test work on Playwright projects, plus a deterministic scanner.
Find Playwright/Cypress E2E tests that pass CI while proving little or nothing — and prove a change
with a test that actually guards it.

This is a private fork, maintained for one operator. It is **not independently installable**: the
private local marketplace owns the plugin manifests and decides which skills ship, and this repo is
the source of truth for skill content only. Propagation is by git subtree, one direction, no
exceptions — see [Distribution](#distribution).

| Need | Use |
| --- | --- |
| Prove a PR / branch / ticket / diff with a Playwright test | [`pw-prove`](#pw-prove--prove-a-change) |
| Review existing Playwright/Cypress specs for silent-pass smells | [`e2e-reviewer`](#e2e-reviewer--static-review) |
| Diagnose a failed `playwright-report/` | [`playwright-debugger`](#playwright-debugger--root-cause-diagnosis) |
| Run a deterministic local scan | [`scan.mjs`](#standalone-scanner) |

## Distribution

The repo is grafted into `~/SonDev/claude-marketplace` as an editable git subtree at
`plugins/e2e-skills`. The marketplace's own `.claude-plugin/plugin.json` names the shipped skills
(`pw-prove`, `e2e-reviewer`) and carries the version. Nothing here is installed by any other route.

To propagate a change, from the **marketplace** checkout:

```bash
git subtree pull --prefix plugins/e2e-skills <path-or-url-to-this-repo> main --squash
```

There is deliberately no installer script and no git hook in this repo. Two propagation paths is
how a runtime ends up executing a skill version the repo does not have.

## Verification gate

Both must pass before every commit:

```bash
bash scripts/ci/ci-local.sh          # the single source of truth for what CI runs
bash scripts/ci/pre-push-security.sh # secrets and credential-leak guard (manual — no hook)
```

`ci-local.sh` runs shell/Node syntax sweeps, the review checks (eval schema, skill surface, framework
scope, link integrity, docs orphan, language, pattern parity), the parity drift smoke test, the
scanner pattern corpus against its frozen golden, the process-boundary suites over the shipped
`pw-prove` scripts (preflight, probe, hermetic, probe-HAR, probe-warm, publish-proof, run-ledger),
and the repo's own smell scan.

**The pattern-corpus golden is a hard invariant.** Never run `test-corpus.sh --update` to make a red
run green — a golden diff means something moved, and moving it silently is the exact failure this
repo exists to catch.

## `pw-prove` — prove a change

The fast path from a change to a reviewed, passing Playwright proof. Owns server bring-up, auth and
live-DOM recon; evidence (trace + one clip per scenario, published as one chaptered recording) is a
byproduct of the proof run, not a separate production pass.

```
Step 1  Dispatch + Environment   PR-mode · target mode · coverage-gap mode
Step 2  Diff -> AC               PR state read, acceptance criteria, touched surfaces
Step 3  Bring-up + Probe         one live pass: base merge, dev server, auth, recon, api.har
Step 4  Plan                     PR-mode notify-and-continue · coverage-gap approval gate
Step 5  Generate                 POM always, HAR-first mocks, PROVES headers, clip fidelity
Step 6  e2e-reviewer             YAGNI audit + PROVES audit + the reviewer skill as a gate
Step 7  Verify                   tsc, warm, proof run, hermetic audit, mutation check
Step 8  Deliver                  publish, commit, push, PR comment, completion report
```

Invoke it with a PR number/URL, a ticket key, a branch, a route, or nothing at all. Shipped scripts
(`skills/pw-prove/scripts/`, Node stdlib only, nothing installed into the target project):
`preflight.mjs`, `probe.mjs`, `hermetic.mjs`, `publish-proof.mjs`, `clips.mjs`, `pwprove-run.mjs`.

## `e2e-reviewer` — static review

Catches E2E tests that pass CI but fail to catch real regressions, in Playwright **and** Cypress
specs. Every finding is adversarially verified — refute-first — before it is reported.

### 24 Patterns Detected — Grouped by Severity

#### P0 — Must Fix (silent always-pass)

Tests pass when the feature is broken. No real verification is happening.

| # | Pattern | Before | After |
|---|---------|--------|-------|
| 1 | **Name-assertion mismatch** | Name says "status" but only checks `toBeVisible()` | Add assertion for status content, or rename to match actual check |
| 2 | **Missing Then** | Cancel action, verify text restored — but input still visible? | Verify both restored state and dismissed state |
| 3 | **Error swallowing** | `try/catch` in spec, `.catch(() => {})` in POM | Let errors fail; remove silent catch from POM methods |
| 3b | **Cypress `uncaught:exception` suppression** | `cy.on('uncaught:exception', () => false)` blanket-swallows app errors | Scope handler to specific known errors; re-throw unknown errors |
| 4 | **Always-passing assertion** | `toBeGreaterThanOrEqual(0)`; `toBeAttached()` with no comment; `expect(await el.isVisible()).toBe(true)` (one-shot); `expect(await el.textContent()).toBe(x)` (one-shot); `expect(locator).toBeTruthy()` (Locator always truthy); `{ timeout: 0 }` on assertions (disables retry) | `toBeGreaterThan(0)`; `toBeVisible()`; web-first assertions with auto-retry |
| 5 | **Bypass patterns** (5a P0, 5b P1) | `if (await el.isVisible()) { expect(...) }`; `{ force: true }` without comment | Always assert; move env checks to `beforeEach`; add `// JUSTIFIED:` to force:true |
| 7 | **Focused test leak** | `test.only(...)` committed — CI runs one test, silently skips the rest | Delete `.only`; use `--grep` or `--spec` for local focus |
| 8 | **Missing assertion** | `await page.locator('.x');` (discarded); `await el.isVisible();` (boolean thrown away) | Add `await expect(locator).toBeVisible()` or delete the line |
| 12 | **Missing auth setup** | Protected-route spec navigates to `/dashboard` with no login/`storageState`/auth fixture | Add `beforeEach` login, configure `storageState`, or use auth fixture — otherwise test passes against the login page |
| 15 | **Missing `await` on `expect()`** | `expect(page.locator('.toast')).toBeVisible()` returns an unobserved Promise | Add `await` so the assertion actually runs |
| 16 | **Missing `await` on action** | `page.locator('#submit').click()` may not execute before the next line | Add `await` so the action completes |

#### P1 — Should Fix (poor diagnostics / wastes CI time)

Tests work but mislead developers, waste CI time, or set up future regressions.

| # | Pattern | Before | After |
|---|---------|--------|-------|
| 6 | **Raw DOM queries** | `document.querySelector` in `evaluate()` | Use framework locator/query APIs (`locator` / `cy.get`) |
| 9 | **Hard-coded sleep** | `waitForTimeout(2000)` / `cy.wait(2000)` / `waitForLoadState('networkidle')` | Rely on framework auto-wait; use condition-based waits |
| 10 | **Flaky test patterns** | `items.nth(2)` without comment; `test.describe.serial()` | Use `data-testid` or role selectors; replace serial with self-contained tests |
| 13 | **Inconsistent POM usage** | POM imported but spec uses raw `page.fill`/`page.click` for POM-owned actions | Route all interactions through the POM so UI changes update in one place |
| 14 | **Hardcoded credentials** | `loginPage.login('demo-admin', '<literal-password>')` in test code | Use `process.env.TEST_USER`, Playwright config secrets, or test data fixtures |
| 17 | **Direct `page.click(selector)` API** | `page.click('#submit')` / `page.fill('#input', 'text')` skips the Locator layer | Use `page.locator(selector).click()` for auto-wait and better error messages |
| 18 | **`expect.soft()` overuse** | All assertions in a test are `expect.soft()` — test never fails early | Ensure at least one hard `expect()` gates per test; use `soft` only for independent details |
| 19 | **Module-level mutable state in test code** | `let testNotebookSequence = 0;` at column 0 in a test utility — collides across parallel workers and survives retries | Drop the counter; derive uniqueness from `Date.now()` + `Math.random().toString(36).slice(2, 8)`, or move state into `test.beforeEach` |
| 20 | **Unmocked real-backend writes** | Signup/checkout spec submits real mutations — every CI run creates real accounts/orders | Stub write/credential endpoints with `page.route()` / `cy.intercept()`; one designated real-backend smoke spec max |
| 22 | **Optimistic UI without call proof** | Like-toggle test asserts `aria-pressed` flip — UI updates optimistically, passes with the POST deleted | Pair UI assertion with `page.waitForRequest()` (armed before the click) or a route-hit flag |

#### P2 — Nice to Fix (maintenance / robustness)

Weak but not wrong — addressed when refactoring.

| # | Pattern | Before | After |
|---|---------|--------|-------|
| 11 | **YAGNI + Zombie Specs** | `clickEdit()` never called; empty wrapper class; single-use Util; entire spec duplicated by another | Delete unused members; inline single-use Util methods; delete zombie spec files |
| 21 | **Manually-captured session-file dependency** | `storageState: 'auth/member.json'` produced only by a manual capture script — absent on CI, silently expires | Regenerate session programmatically (API-login helper or `setup` project); manual files only as a cache with a programmatic fallback |
| 23 | **Fixture ignores render guards** | Liked-tab fixture seeds `liked: false`; the card component `return null`s every item — empty UI looks like infra flake | Read the item component's early returns/filters before seeding; seed fields to pass every guard for the view under test |

Pattern IDs and severities are frozen. Full taxonomy: [docs/e2e-test-smells.md](docs/e2e-test-smells.md).

## `playwright-debugger` — root-cause diagnosis

Reads a `playwright-report/` directory (local or downloaded from CI) and classifies each failure
into the frozen `F1`–`F15` taxonomy — flaky timing, selector broken, network dependency, assertion
mismatch, missing Then, condition branch, isolation failure, environment mismatch, data dependency,
auth/session, async order, POM drift, error swallowing, animation race, hydration race — with a
concrete fix per failure. Extract, classify, trace (`trace.zip`), fix.

## Standalone scanner

```bash
node skills/e2e-reviewer/scripts/scan.mjs path/to/tests
```

Needs Node 18+ and [ripgrep](https://github.com/BurntSushi/ripgrep) on `PATH`. Installs nothing into
the target project. It prefers project-local lint tools and otherwise auto-downloads pinned public
packages via `npx`; set `E2E_SMELL_NO_ESLINT_DOWNLOAD=1` and `E2E_SMELL_NO_AST_GREP_DOWNLOAD=1` to
run fully offline. `// JUSTIFIED: <reason>` on the line above suppresses a finding.

## Reference

Scope: [framework scope](docs/framework-scope.md) (Playwright and Cypress only) ·
[24-smell taxonomy](docs/e2e-test-smells.md).

Agent workflow config: [delegation profile](docs/agents/delegate-profile.md) ·
[issue tracker](docs/agents/issue-tracker.md). Agent guide: [AGENTS.md](./AGENTS.md).

Specs: [publish the Proof page over MCP](docs/specs/0001-clips-mcp-publish.md).

Architecture decisions: [0001 PR-mode is zero-input](docs/adr/0001-pr-mode-zero-input.md) ·
[0002 merge main before proof](docs/adr/0002-merge-main-before-proof.md) ·
[0003 mock-first with declared carve-out](docs/adr/0003-mock-first-declared-carve-out.md) ·
[0004 probe-required recon](docs/adr/0004-probe-required-recon.md) ·
[0005 pw-prove as a lean skill](docs/adr/0005-pw-prove-lean-coexisting-skill.md) ·
[0006 evidence as byproduct](docs/adr/0006-evidence-as-byproduct-trace-video.md) ·
[0007 proof clip fidelity](docs/adr/0007-proof-clip-fidelity.md) ·
[0008 committed proof config](docs/adr/0008-committed-proof-config.md) ·
[0009 one proof page](docs/adr/0009-one-proof-page.md) ·
[0010 serialize, isolate, audit](docs/adr/0010-serialize-isolate-audit.md) ·
[0011 HAR flush + runner origin](docs/adr/0011-har-flush-and-runner-origin.md) ·
[0012 publish to Clips](docs/adr/0012-publish-to-clips-stream-copy-concat.md) ·
[0013 the warm lead is a browser](docs/adr/0013-warm-lead-is-a-browser-not-a-curl.md) ·
[0014 one vaulted bearer over JSON-RPC](docs/adr/0014-one-vaulted-bearer-over-json-rpc.md).

## License

Apache-2.0. Forked from [voidmatcha/e2e-skills](https://github.com/voidmatcha/e2e-skills) &copy;
voidmatcha; the licence and its attribution are preserved. Fork maintained by
[sonhyrd](https://github.com/sonhyrd).
