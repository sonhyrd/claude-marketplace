# Mined assertions from the retired `evals.json`

Recovered from `skills/pw-prove/evals/evals.json` (57 entries, 365 assertions) immediately before that file was deleted (issue #61). This file is the only surviving copy of the material below.

## What was actually lost, and what was not

The migration that produced `evals/cases/*.yaml` carried `prompt`, `expected_output` and the fixture list across intact — verified verbatim against all 57 entries, whitespace-normalised, with zero misses. Two fields were dropped:

1. **`assertions[]`** — up to 14 per entry. This is the material a dormant case needs to
   get a judge. It exists nowhere else.
2. **`title`** — a descriptive one-liner, replaced by the generated `pw-prove - <n>`.

So a case is repaired from **this file plus its own `case-*.yaml`**, not from this file alone:
the prompt and the expected output are already on disk beside the judge you are writing.

## How to use it

An assertion here is a *claim about the answer*, not a judge. It was written for a format that graded free prose, so it is input to a judge, never a `criteria:` line copied verbatim — see the spec's judge-repair rule (#54) and `scripts/ci/test-eval-judges.sh` for the shape a repaired judge has to survive. In particular a negative assertion ("Does not hallucinate ...") must anchor to the emitted artifact, not to the surrounding prose; the bare-substring reading of exactly that kind of assertion is what produced seven false failures in the 2026-08-13 run.

Note also that under `agent_judge` a pass rate is `passed_criteria / total_criteria` against a 0.7 threshold, so a 14-assertion case does **not** become a 14-criteria judge for free — adding criteria loosens the ones already there.

## Index

- 57 entries, 365 assertions recovered. **The recovered material is immutable** — every assertion below, including those of the five entries whose case files #63 deleted, is kept verbatim. The mining is the recovery; deleting a case does not un-recover it. Only the Status column moves, and it is a pointer: `REGISTRY.md` owns pass rate, uplift and status, and wins any disagreement.
- Status as of #63 (batch 1 triage), over the 57 mined entries: **3 active** (`case-15`, `case-50`, `case-60`), **8 quarantined** (`case-1`, `case-2`, `case-3`, `case-28`, `case-30`, `case-43`, `case-44`, `case-48` — on disk, out of the active list, each with a recorded pass rate in `REGISTRY.md`), **5 retired** (case files deleted: `case-26`, `case-27`, `case-39`, `case-40`, `case-49`), and **41 dormant**. 3 + 8 + 5 + 41 = 57.
- A dormant entry is `judge.type: agent_judge` with no `criteria:` key, which `skill-up validate` rejects outright. A dormant case is a hard config error, not a vacuous pass.
- Status as of #64 (batch 2 triage), over the same 57 mined entries: **5 active** (batch 1's three plus `case-11`, `case-16`), **17 quarantined** (batch 1's eight plus `case-4`, `case-5`, `case-7`, `case-8`, `case-12`, `case-17`, `case-20`, `case-22`, `case-23`, `case-24`, `case-29` — every one on disk, out of the active list, each with a recorded pass rate in `REGISTRY.md`), **12 retired** (batch 1's five plus `case-9`, `case-13`, `case-19`, `case-21`, `case-25`, `case-31`, `case-32`), and **23 dormant**. 5 + 17 + 12 + 23 = 57.
- These counts cover entries mined from `evals.json` only. `eval.yaml`'s active list also carries `gate-skill-loaded`, `b01-confirmation-gate` and `b05-handoff-stale`, which have no legacy entry here; `b32-dwell-inline` is quarantined and `b49-untrusted-page-content` was deleted for zero uplift.

| Case | Judge | Status | Assertions | Recovered title |
| --- | --- | --- | ---: | --- |
| [`case-1.yaml`](cases/case-1.yaml) | `script` | **quarantined #63** | 14 | Coverage gap analysis with POM project |
| [`case-2.yaml`](cases/case-2.yaml) | `script` | **quarantined #63** | 12 | Test generation plan for /checkout with POM |
| [`case-3.yaml`](cases/case-3.yaml) | `script` | **quarantined #63** | 13 | Flat-sibling repo — scaffold a POM anyway (POM is always the default) |
| [`case-4.yaml`](cases/case-4.yaml) | `agent_judge` | dormant | 7 | Exploration auth/seed gate: stop and ask when credentials are missing |
| [`case-5.yaml`](cases/case-5.yaml) | `agent_judge` | dormant | 5 | PR-mode proof link: a skip must show the failing probe (no silent drop) |
| [`case-7.yaml`](cases/case-7.yaml) | `agent_judge` | dormant | 4 | Step 4 PR-mode is notify-and-continue; coverage-gap keeps the approval gate |
| [`case-8.yaml`](cases/case-8.yaml) | `agent_judge` | dormant | 5 | Step 8 lands the proof: the report is structurally invalid without the tail lines |
| `case-9.yaml` (deleted) | `agent_judge` | **retired #64** | 4 | Hermetic audit: undeclared live call fails the run; a declared carve-out passes |
| [`case-11.yaml`](cases/case-11.yaml) | `agent_judge` | dormant | 8 | Greenfield project (no Playwright) — Step 5b bootstraps the runner as a pinned dep |
| [`case-12.yaml`](cases/case-12.yaml) | `agent_judge` | dormant | 8 | Legible stop report: bring-up failure names verbatim evidence and produces nothing |
| `case-13.yaml` (deleted) | `agent_judge` | **retired #64** | 6 | Server-set login cookie: obtain it via API-login, do not hand-author the cookie value |
| [`case-15.yaml`](cases/case-15.yaml) | `script` | **active #63** | 6 | Step 3 recon is probe-first: batched questions through one persistent browser, non-deliverable spec probes forbidden |
| [`case-16.yaml`](cases/case-16.yaml) | `agent_judge` | dormant | 4 | POM inventory + extend-existing-POM on route match (duplicate needs stated justification) |
| `case-17.yaml` (deleted) | `script` | **retired #78** | 3 | PROVES header quotes the AC verbatim; Step 6 audit blocks Step 7 on a missing/paraphrased header |
| `case-19.yaml` (deleted) | `agent_judge` | **retired #64** | 3 | Token diet in the fix loop: no inter-tool narration, spec written once — audit trail unaffected |
| [`case-20.yaml`](cases/case-20.yaml) | `agent_judge` | dormant | 3 | A heavy context earns a fresh-session recommendation, never an auto-background |
| `case-21.yaml` (deleted) | `agent_judge` | **retired #64** | 16 | Clip fidelity: the full bundle (size, held payoff, framing) on a project that declares no viewport |
| [`case-22.yaml`](cases/case-22.yaml) | `agent_judge` | dormant | 9 | Clip fidelity guard: respect a deliberate project viewport |
| [`case-23.yaml`](cases/case-23.yaml) | `agent_judge` | dormant | 7 | Clip fidelity: a desktop device descriptor is scaffold default, not a deliberate viewport |
| [`case-24.yaml`](cases/case-24.yaml) | `agent_judge` | dormant | 7 | Proof config is reused, not rewritten, when the repo already has one |
| `case-25.yaml` (deleted) | `agent_judge` | **retired #64** | 9 | Step 8 delivers ONE chaptered Clips recording, not N bare clip links |
| `case-26.yaml` (deleted) | `agent_judge` | **retired #63** | 5 | Every scenario times out on its first navigation — a saturated dev server, not a broken spec |
| `case-27.yaml` (deleted) | `agent_judge` | **retired #63** | 6 | The mutation check must not overwrite the proof clips |
| [`case-28.yaml`](cases/case-28.yaml) | `script` | **quarantined #63** | 6 | Hermetic audit runs the script, with --spec, and never hand-rolls a trace parser |
| [`case-29.yaml`](cases/case-29.yaml) | `agent_judge` | dormant | 6 | An AC already proven by the diff's own unit tests is folded, not silently dropped |
| [`case-30.yaml`](cases/case-30.yaml) | `script` | **quarantined #63** | 7 | Publish URL is read from the PWPROVE_URL marker, not stdout line 1 |
| `case-31.yaml` (deleted) | `agent_judge` | **retired #64** | 5 | The runner's origin is proven reachable before the proof run, not inferred from a healthy localhost |
| `case-32.yaml` (deleted) | `agent_judge` | **retired #64** | 5 | A webServer timeout with zero tests run is diagnosed as an unreachable origin, not a slow or broken spec |
| [`case-33.yaml`](cases/case-33.yaml) | `script` | **active #65** | 5 | A recon pass that produced no HAR is a stated deviation, never a silent fallback to hand-written mocks |
| [`case-34.yaml`](cases/case-34.yaml) | `script` | **active #65** | 10 | The filming law: a legible clip is bought with time only, never with a different input path |
| [`case-35.yaml`](cases/case-35.yaml) | `script` | **active #65** | 6 | Step 6 blocks Step 7 when the generated spec has no PW_PROVE_CLIP reader |
| [`case-36.yaml`](cases/case-36.yaml) | `script` | **active #65** | 7 | A deliberate project viewport is respected — the clip-fidelity audit must not demand a pin |
| [`case-37.yaml`](cases/case-37.yaml) | `script` | **active #65** | 7 | Step 7 looks at the clip: an illegible frame is diagnosed and fixed before the one re-film |
| [`case-38.yaml`](cases/case-38.yaml) | `script` | **active #65** | 5 | Absent video tooling skips the frame inspection — it never fails the run, and never reads as a good clip |
| `case-39.yaml` (deleted) | `agent_judge` | **retired #63** | 6 | Step 6 exit 2 on a dwell hoisted into a helper — inline it, do not conclude there is none |
| `case-40.yaml` (deleted) | `agent_judge` | **retired #63** | 4 | A dwell wrapped across two lines already satisfies Step 6 — do not reformat it to appease the audit |
| [`case-41.yaml`](cases/case-41.yaml) | `script` | **quarantined #65** | 4 | Step 8 runs the residue refusal — it does not confirm the HAR by eye |
| [`case-42.yaml`](cases/case-42.yaml) | `script` | **quarantined #65** | 4 | The recon HAR is already scrubbed at capture — do not hand-roll a second scrub |
| [`case-43.yaml`](cases/case-43.yaml) | `script` | **quarantined #63** | 4 | Every read aborting in Step 7 is an unbound HAR, not a short recording |
| [`case-44.yaml`](cases/case-44.yaml) | `script` | **quarantined #63** | 6 | A missing configuration key is a configuration failure, named in seconds — not a slow server |
| [`case-45.yaml`](cases/case-45.yaml) | `script` | **active #65** | 6 | The committed proof config must not inherit the project's development webServer |
| [`case-46.yaml`](cases/case-46.yaml) | `script` | **active #65** | 7 | Two attempts with the same failure signature take the handover stop, not a third try |
| [`case-47.yaml`](cases/case-47.yaml) | `script` | **quarantined #65** | 5 | Genuinely different failures are a converging run — spend the full budget of three |
| [`case-48.yaml`](cases/case-48.yaml) | `script` | **quarantined #63** | 9 | A dev-guarded session bootstrap does not exist in the built target — descend the ladder |
| `case-49.yaml` (deleted) | `agent_judge` | **retired #63** | 6 | An unestablished session fails loudly in seconds, not at a sixty-second timeout |
| [`case-50.yaml`](cases/case-50.yaml) | `script` | **active #63** | 7 | The server announced a shifted port — poll what it said, not what you asked for |
| `case-51.yaml` (deleted) | `script` | **retired #65** | 6 | A server whose log names no origin is not a port mismatch |
| [`case-52.yaml`](cases/case-52.yaml) | `script` | **active #65** | 6 | A batch pays for one build, and the mutation check pays for its own |
| [`case-53.yaml`](cases/case-53.yaml) | `script` | **quarantined #65** | 6 | The probe's vocabulary: an empty shell is a console question, and a batch sent first is not a failure |
| [`case-54.yaml`](cases/case-54.yaml) | `script` | **quarantined #65** | 7 | A HAR the scrubber destroyed is re-recorded, never hand-repaired — and exit 6 is not exit 3 |
| [`case-55.yaml`](cases/case-55.yaml) | `script` | **quarantined #65** | 7 | A mutation-check restart that cannot be proven has no verdict to read |
| [`case-56.yaml`](cases/case-56.yaml) | `script` | **quarantined #65** | 6 | A proven restart is proven — do not re-litigate a fast one |
| [`case-57.yaml`](cases/case-57.yaml) | `script` | **active #65** | 5 | A probe question that needs an argument uses the {fn, arg} form, and its answer is the value |
| [`case-58.yaml`](cases/case-58.yaml) | `script` | **quarantined #65** | 5 | The eval argument carries data, not a page handle |
| [`case-59.yaml`](cases/case-59.yaml) | `script` | **quarantined #65** | 6 | Every scenario times out on its first navigation — serialise once to diagnose, then report the finding |
| [`case-60.yaml`](cases/case-60.yaml) | `script` | **active #63** | 5 | The proof run names no worker count |
| [`case-61.yaml`](cases/case-61.yaml) | `script` | **quarantined #65** | 5 | Scenarios that contend over one shared record serialise in the spec, not on the command line |

## Per-case detail

### `case-1.yaml` — Coverage gap analysis with POM project

Legacy id `1` · judge `agent_judge` · dormant · 14 assertions.

Fixtures (still listed in the case file):

- `evals/files/project-pom/playwright.config.ts`
- `evals/files/project-pom/tests/auth.spec.ts`
- `evals/files/project-pom/tests/pages/login-page.ts`
- `evals/files/project-pom/tests/pages/base-page.ts`
- `evals/files/project-pom/src/routes.ts`

Dropped assertions:

- Detects POM pattern (tests/pages/ directory exists)
- Identifies BasePage as base class for POMs
- Identifies LoginPage as existing POM
- Recognizes /login route as covered by auth.spec.ts
- Identifies /dashboard as uncovered route
- Identifies /settings as uncovered route
- Identifies /profile as uncovered route
- Identifies /checkout as uncovered route
- Flags /checkout as high priority (form-heavy page)
- Recommends new POMs extend BasePage
- Detects baseURL as http://localhost:3000 from playwright.config.ts
- Detects testDir as ./tests from playwright.config.ts
- Does not hallucinate routes not in src/routes.ts
- Lists at least 4 uncovered routes

### `case-2.yaml` — Test generation plan for /checkout with POM

Legacy id `2` · judge `agent_judge` · dormant · 12 assertions.

Fixtures (still listed in the case file):

- `evals/files/project-pom/playwright.config.ts`
- `evals/files/project-pom/tests/auth.spec.ts`
- `evals/files/project-pom/tests/pages/login-page.ts`
- `evals/files/project-pom/tests/pages/base-page.ts`
- `evals/files/project-pom/src/routes.ts`

Dropped assertions:

- Proposes CheckoutPage class extending BasePage
- Places POM file in tests/pages/checkout-page.ts
- Places spec file in tests/checkout.spec.ts
- Includes happy path scenario (successful checkout/purchase)
- Includes error/validation scenario (e.g., invalid payment, missing fields)
- Includes Locator Mapping Table with selector candidates
- Locators use getByRole, getByLabel, or getByTestId (not CSS selectors)
- Proposes authentication setup in beforeEach (checkout is protected route)
- References /checkout/confirmation as expected post-purchase URL
- Does not propose getters for locators (uses readonly properties)
- Scenario format includes Given/When/Then or equivalent structure
- Does not hallucinate UI elements not inferable from routes

### `case-3.yaml` — Flat-sibling repo — scaffold a POM anyway (POM is always the default)

Legacy id `3` · judge `agent_judge` · dormant · 13 assertions.

Fixtures (still listed in the case file):

- `evals/files/project-flat/playwright.config.ts`
- `evals/files/project-flat/tests/login.spec.ts`
- `evals/files/project-flat/src/app/page.tsx`

Dropped assertions:

- Detects no POM directory and that the existing specs are flat
- Scaffolds a POM for the new coverage even though the existing specs are all flat
- Does NOT match the flat siblings — does not recommend a flat spec for the new coverage
- Places the new POM at the test root (tests/pages/<Feature>Page.ts)
- False-positive guard: does NOT rewrite or retro-refactor the existing tests/login.spec.ts — flat siblings are left untouched
- Does not mistake a Next.js route folder (app/ or pages/) for a Playwright POM dir
- Identifies login as covered by login.spec.ts
- Identifies home page (/) as uncovered
- Identifies /signup as uncovered (linked in page.tsx)
- Detects baseURL as http://localhost:3000
- Detects testDir as ./tests
- Detects Next.js App Router structure (src/app/)
- Does not hallucinate pages not present in project files

### `case-4.yaml` — Exploration auth/seed gate: stop and ask when credentials are missing

Legacy id `4` · judge `agent_judge` · dormant · 7 assertions.

Fixtures (still listed in the case file):

- `evals/files/project-pom/playwright.config.ts`
- `evals/files/project-pom/tests/auth.spec.ts`
- `evals/files/project-pom/tests/pages/login-page.ts`
- `evals/files/project-pom/tests/pages/base-page.ts`
- `evals/files/project-pom/src/routes.ts`

Dropped assertions:

- Detects that playwright.config.ts contains no storageState, no setup project, and no globalSetup
- Detects that no seed scripts or auth state files exist in the project
- True positive: STOPS and asks the user for credentials or a seeding command before exploring /dashboard
- Does not invent credentials or treat the example credentials in tests/auth.spec.ts as real accounts
- Does not register real accounts or mutate backend data to reach the target state
- False-positive guard: does NOT stop-and-ask for the public /login route — tests/auth.spec.ts reaches it via loginPage.open() with no prior session, so no credentials are required to explore it
- Does not hallucinate auth mechanisms (storageState files, setup projects) not present in the fixture

### `case-5.yaml` — PR-mode proof link: a skip must show the failing probe (no silent drop)

Legacy id `5` · judge `agent_judge` · dormant · 5 assertions.

Dropped assertions:

- True positive: the `skipped` line pastes the actual preflight probe output as evidence, not a bare `skipped -- credential refused` written from memory
- Does not emit a 'Complete' report that silently drops the Proof page line in PR-mode
- Does not fabricate or guess a clips.paulsjob.ai share URL
- False-positive guard: does not fail or abort the run over the undelivered proof link -- the passing tests and the mutation verdict are still reported and the run closes normally
- Attributes the skip to the refused publish credential (ffmpeg is installed), not to missing video tooling

### `case-7.yaml` — Step 4 PR-mode is notify-and-continue; coverage-gap keeps the approval gate

Legacy id `7` · judge `agent_judge` · dormant · 4 assertions.

Dropped assertions:

- True positive: in PR-mode, posts the plan and proceeds immediately to Step 5 without waiting for a reply (notify-and-continue; silence is consent)
- Resolves POM-vs-flat, dirty-tree, and selector-strategy side-questions from the contract as stated Assumptions in the plan — asks the user none of them
- The plan includes an Assumptions block naming the contract-resolved decisions
- False-positive guard: in coverage-gap mode it still STOPS at the approval gate and writes no code until explicit approval — notify-and-continue does not leak into coverage-gap mode

### `case-8.yaml` — Step 8 lands the proof: the report is structurally invalid without the tail lines

Legacy id `8` · judge `agent_judge` · dormant · 5 assertions.

Dropped assertions:

- True positive: commits the spec + POM to the PR branch, pushes, and posts the share link as a PR comment BEFORE emitting the Complete report — without asking "want me to commit?"
- The report skeleton contains the Committed, Pushed, and PR comment lines (plus Proof page and Mutation) and treats a report missing any of them as structurally invalid
- True positive: with a prose argument and no existing PR, creates one (fresh branch push + gh pr create) and posts the share-link comment there
- False-positive guard: the hygiene sweep excludes throwaway artifacts from the commit but KEEPS playwright.proof.config.ts — it is a deliverable, not litter
- False-positive guard: does not delete test-results/ before the publish — the clips live there

### `case-9.yaml` — Hermetic audit: undeclared live call fails the run; a declared carve-out passes

Legacy id `9` · judge `agent_judge` · dormant · 4 assertions.

Dropped assertions:

- True positive: fails Run A on the undeclared live call even though the spec itself passed — undeclared live traffic is a run-failure, not a footnote
- Flags Run A's staging POST as a write to a shared tenant (data pollution), not merely a determinism concern
- False-positive guard: does NOT fail Run B — a declared, read-only carve-out is sanctioned and the run proceeds
- Carries the verdict into the report's Tests line as hermetic (carve-outs: none | <list>)

### `case-11.yaml` — Greenfield project (no Playwright) — Step 5b bootstraps the runner as a pinned dep

Legacy id `11` · judge `agent_judge` · dormant · 8 assertions.

Dropped assertions:

- Detects the project as greenfield via hasTestRunner: false
- True positive: Step 5b installs @playwright/test as a pinned dev dependency (pnpm/npm/yarn add -D), not via an npx-floated runner
- Installs the browser binary once (npx playwright install chromium)
- Authors a minimal playwright.config with testDir, baseURL, and a webServer block running the project's dev command
- Adds an e2e tsconfig so Step 7 tsc --noEmit has a target
- Does NOT treat 'never auto-install Playwright' as a blocker or stop-and-ask on a greenfield project
- False-positive guard: does NOT npx-float or reinstall a different Playwright version; after the pinned install, later steps still use --no-install
- Sequences the bootstrap before Step 6 (e2e-reviewer) and Step 7 (test run), which cannot run without a runner

### `case-12.yaml` — Legible stop report: bring-up failure names verbatim evidence and produces nothing

Legacy id `12` · judge `agent_judge` · dormant · 8 assertions.

Dropped assertions:

- STOPs at Step 3 (bring-up) rather than generating a spec
- Attributes the failure to the app not booting, tracing it to the nuxt.config import of a missing module
- Quotes the blocker VERBATIM (the 'Cannot find module' error and the preflight STOP), not a paraphrase
- States explicitly that nothing was produced — no spec, no POM
- False-positive guard: does NOT run the pre-existing e2e/onboarding.spec.ts against the dead server and does NOT report it as green
- Does NOT edit the app's own source/config to force a boot (application-source change is out of test-authoring scope)
- Does NOT emit the Step 8 completion tail (Proof page / Committed / Pushed) for a stop
- Gives a concrete unblock action and offers to re-run

### `case-13.yaml` — Server-set login cookie: obtain it via API-login, do not hand-author the cookie value

Legacy id `13` · judge `agent_judge` · dormant · 6 assertions.

Dropped assertions:

- Calls the real login endpoint (POST /api/login) with the discovered credential to obtain the session
- Seeds the cookie the login RETURNS (Set-Cookie), not a hand-authored name/value pair
- False-positive guard: does NOT hand-author a guessed cookie literal (e.g. addCookies ptg_auth=1) when a login endpoint and credential are available
- Explains that a guessed literal only works against a non-validating backend and would bypass or fail a real signed session cookie
- Recreates the session from code (no committed session file), consistent with the auth rules
- Reserves hand-seeding a static literal for a documented static dev flag with no login path

### `case-15.yaml` — Step 3 recon is probe-first: batched questions through one persistent browser, non-deliverable spec probes forbidden

Legacy id `15` · judge `rule_based` · active · 6 assertions.

Dropped assertions:

- True positive: refuses to create _recon.spec.ts (or any spec file that is not a deliverable) for the recon question — the test runner is not a REPL
- Uses probe.mjs with ONE persistent browser (start once, batched send, explicit close or idle self-close) instead of booting Playwright per question
- Answers via compact summaries: snapshot (aria) and network-summary — never a raw DOM dump pasted into the response
- States the browserless behavior: clean refusal (exit 2), recon falls back to source reading + the heal loop; does NOT npx-float a Playwright install
- False-positive guard: does NOT flag the Step-7 proof run through playwright.proof.config.ts as a forbidden probe — the proof run is the validator, and the deliverable spec is not a throwaway
- False-positive guard: keeps the heal-loop bounds unchanged (rerun only the failing test, full suite once) — the probe replaces recon probes, not the Step 7 validator

### `case-16.yaml` — POM inventory + extend-existing-POM on route match (duplicate needs stated justification)

Legacy id `16` · judge `agent_judge` · dormant · 4 assertions.

Dropped assertions:

- True positive: extends the existing CheckoutPage (route already in pomInventory) instead of scaffolding a second POM for /checkout
- Requires a stated justification line in the Step 4 Assumptions block before shipping any duplicate POM for a route already covered in pomInventory
- References the Step 1 pomInventory as the route→PageObject source it matches against
- False-positive guard: still creates a fresh ProfilePage for /profile — an uncovered route with no POM in the inventory is NOT forced into an existing class and is not left without a POM

### `case-17.yaml` — PROVES header quotes the AC verbatim; Step 6 audit blocks Step 7 on a missing/paraphrased header

Legacy id `17` · judge `script` · **retired #78** — 3/3 at n=3, then a re-measured **zero uplift** on a certified skill-free baseline · 3 assertions.

Dropped assertions:

- True positive: blocks Step 7 for the test with no // PROVES: header until a verbatim-AC header is added
- True positive: rejects the paraphrased `// PROVES: validates status input` because the header must quote the acceptance criterion word-for-word from the Step 2 AC table
- False-positive guard: does NOT demand a PROVES header on the POM file — it is exempt and its absence is not flagged

### `case-19.yaml` — Token diet in the fix loop: no inter-tool narration, spec written once — audit trail unaffected

Legacy id `19` · judge `agent_judge` · dormant · 3 assertions.

Dropped assertions:

- True positive: runs tool calls back-to-back inside the fix loop without narrating between them
- True positive: writes the spec once from the pomInventory + Locator Mapping Table rather than scaffolding a skeleton and rewriting it
- False-positive guard: still writes the Step 4 plan post, the Assumptions block, and the Step 8 report in full — the diet trims loop narration, not the required audit trail

### `case-20.yaml` — A heavy context earns a fresh-session recommendation, never an auto-background

Legacy id `20` · judge `agent_judge` · dormant · 3 assertions.

Dropped assertions:

- True positive: recommends a fresh session or a background agent when invoked into a heavy, unrelated session
- Continues the run inline in the current session when the user declines or does not answer
- False-positive guard: never auto-backgrounds the run or spawns a background agent on its own — the choice is the user's

### `case-21.yaml` — Clip fidelity: the full bundle (size, held payoff, framing) on a project that declares no viewport

Legacy id `21` · judge `agent_judge` · dormant · 16 assertions.

Fixtures (still listed in the case file):

- `evals/files/project-flat/playwright.config.ts`
- `evals/files/project-flat/tests/login.spec.ts`

Dropped assertions:

- Resolves the effective viewport as a scaffold default (config declares no explicit viewport key)
- Pins viewport 1600x900 in the generated spec via test.use()
- Places the viewport pin in the committed spec, not only in the proof config
- Does not edit the project's committed playwright.config.ts
- Writes the proof config as `playwright.proof.config.ts` next to the project config, and stages it rather than deleting it in Step 8 hygiene
- Keeps the proof config static — recording size comes from PW_PROVE_W/PW_PROVE_H with a 1600x900 default, not a literal substituted per run
- Passes the effective viewport on the proof command as PW_PROVE_W=1600 PW_PROVE_H=900
- Uses the object form `video: { mode: 'on', size: ... }` rather than bare `video: 'on'`
- False-positive guard: proposes NO warm lead — no `probe.mjs warm`, no curl of the route before filming; the proof target is a built preview and there is nothing to warm
- Sets PW_PROVE_CLIP=1 on the Step 7 proof run
- Generates a dwell gated on process.env.PW_PROVE_CLIP
- Places the dwell after the assertion covering the beat it holds -- never between an action and the assertion that covers it
- Puts a `// JUSTIFIED:` comment on the line above the dwell
- Centres the held element with an UNGATED scrollIntoView({ block: 'center' }) immediately before the dwell -- framing is a scroll, not a wait, so it is not gated on PW_PROVE_CLIP
- Does not reintroduce a second run, a post-processing pass, or a hand-built page to make the clip usable
- False-positive guard: proposes no ffmpeg in Step 7 and no re-encode, trim or transcode anywhere -- the only ffmpeg on this path is Step 8's stream-copy concatenation, which decodes no frame and so cannot repair a clip recorded at the wrong viewport

### `case-22.yaml` — Clip fidelity guard: respect a deliberate project viewport

Legacy id `22` · judge `agent_judge` · dormant · 9 assertions.

Fixtures (still listed in the case file):

- `evals/files/project-viewport/playwright.config.ts`
- `evals/files/project-viewport/src/routes.ts`

Dropped assertions:

- Identifies the explicit `viewport:` key at project level in playwright.config.ts
- Classifies an explicit viewport key as a deliberate project decision
- Does NOT pin 1600x900
- Does NOT emit a test.use({ viewport: ... }) override in the generated spec
- Passes PW_PROVE_W=1440 PW_PROVE_H=900 on the proof command, matching the project's viewport
- False-positive guard: does NOT hardcode 1440x900 into playwright.proof.config.ts — the file stays static and project-agnostic
- False-positive guard: proposes no route warm before the proof run — the warm lead is gone with the development-server target
- Still generates the JUSTIFIED, PW_PROVE_CLIP-gated dwell, framed by an ungated centring call
- Does not edit the project's committed playwright.config.ts

### `case-23.yaml` — Clip fidelity: a desktop device descriptor is scaffold default, not a deliberate viewport

Legacy id `23` · judge `agent_judge` · dormant · 7 assertions.

Fixtures (still listed in the case file):

- `evals/files/project-pom/playwright.config.ts`
- `evals/files/project-pom/tests/auth.spec.ts`

Dropped assertions:

- Generated spec contains test.use({ viewport: { width: 1600, height: 900 } })
- Proof run passes PW_PROVE_W=1600 PW_PROVE_H=900
- Assumptions block records a `pinned:` verdict, not a `deliberate:` one
- Does not resolve the effective viewport to the descriptor's 1280x720
- Resolves the descriptor without being told it carries 1280x720
- Does not edit the project's committed playwright.config.ts
- Generated spec still carries the JUSTIFIED, PW_PROVE_CLIP-gated dwell, framed by an ungated centring call

### `case-24.yaml` — Proof config is reused, not rewritten, when the repo already has one

Legacy id `24` · judge `agent_judge` · dormant · 7 assertions.

Dropped assertions:

- Reuses the existing e2e/playwright.proof.config.ts untouched
- Does not rewrite, regenerate, or substitute a per-run viewport literal into the existing proof config
- Passes --config e2e/playwright.proof.config.ts on the Step 7 proof run
- Passes the effective viewport as PW_PROVE_W/PW_PROVE_H on the proof command
- False-positive guard: Step 8 hygiene does NOT delete playwright.proof.config.ts — only test-results/, playwright-report/, and legacy .pw-prove.proof.config.* files
- Omits the proof config from the completion report's Generated block because this run did not create it
- Does not edit the project's own playwright.config.ts

### `case-25.yaml` — Step 8 delivers ONE chaptered Clips recording, not N bare clip links

Legacy id `25` · judge `agent_judge` · dormant · 9 assertions.

Dropped assertions:

- Publishes with a single publish-proof.mjs call over a manifest, not one call per clip
- Passes the manifest path as the only argument -- no per-project folder and no key prefix, since Clips assigns the identifier
- Orders clips[] by AC, the order a reviewer watches, which is chapter order
- Takes the share URL from the PWPROVE_URL marker line, not from stdout line 1
- Sets BEARER and SCAN on the publish call
- PR comment leads with ONE share link; per-AC rows are ?t=<seconds> timestamp deep links inside the same recording
- Completion report has a `Proof page:` line carrying the share URL, not `Proof clips:` with N bare webm URLs
- Requires the clips to be concatenated by ffmpeg stream copy into ONE recording with one chapter per AC — and stream copy only: no re-encode, no trim, no second run, no post-processing pass
- States that a gate tripping on any clip aborts the whole recording rather than publishing a partial one

### `case-26.yaml` — Every scenario times out on its first navigation — a saturated dev server, not a broken spec

Legacy id `26` · judge `agent_judge` · dormant · 5 assertions.

Dropped assertions:

- Diagnoses dev-server saturation from the all-tests-timeout-at-first-goto signature
- Re-runs with --workers=1 rather than editing the spec
- Checks the origin is alive (curl) before re-running
- False-positive guard: does NOT heal locators or raise timeouts in response to this failure
- False-positive guard: does not pin workers by editing the committed proof config or the project's playwright.config

### `case-27.yaml` — The mutation check must not overwrite the proof clips

Legacy id `27` · judge `agent_judge` · dormant · 6 assertions.

Dropped assertions:

- Passes --output=/tmp/pw-prove-mutation (or another dir outside test-results/) on the mutation run
- Does not set PW_PROVE_CLIP on the mutation run
- Uses -g to run only the guarding test, not the whole spec
- Verifies the tree is unchanged with process substitution on both sides
- Verifies the clip count in test-results/ still matches the scenario count after the revert
- False-positive guard: does not re-run the whole proof spec to regenerate clips when the mutation run was isolated

### `case-28.yaml` — Hermetic audit runs the script, with --spec, and never hand-rolls a trace parser

Legacy id `28` · judge `rule_based` · active · 6 assertions.

Dropped assertions:

- Invokes scripts/hermetic.mjs instead of writing a throwaway trace parser
- Passes --spec so the route.fetch class is checked
- Treats route.fetch round-trips as live traffic needing a declared carve-out despite appearing MOCKED in the trace
- Matches LIVE entries against the spec's CARVE-OUT header to reach the verdict
- Fails the run on any undeclared live call even though the tests passed
- False-positive guard: does not treat the script's output as the verdict itself

### `case-29.yaml` — An AC already proven by the diff's own unit tests is folded, not silently dropped

Legacy id `29` · judge `agent_judge` · dormant · 6 assertions.

Dropped assertions:

- Reads the unit test file that ships in the diff before finalizing scenarios
- Folds pure-function ACs into the single wiring scenario instead of one scenario each
- Keeps folded ACs visible as table rows with `already covered: <test file>`
- Keeps the wire-contract assertion (what the browser actually sends) as a browser-layer scenario
- False-positive guard: does not fold an AC that the unit test cannot observe (DOM state, flag gating, the outbound request)
- False-positive guard: does not silently delete a folded AC from the table or the report

### `case-30.yaml` — Publish URL is read from the PWPROVE_URL marker, not stdout line 1

Legacy id `30` · judge `rule_based` · active · 7 assertions.

Dropped assertions:

- Captures the URL via the PWPROVE_URL marker rather than stdout line 1
- Keeps stderr in a log file for gate diagnosis
- On an empty URL, reads the exit code and the log to tell an undelivered publish from a tripped gate instead of immediately re-publishing
- Reads the kept fallback file from the PWPROVE_PROOF_FILE marker line the same way, not from a guessed path
- False-positive guard: does not pipe `2>&1` into a bare `head -n1` to capture the URL
- True positive: exempts the kept $TMPDIR/pw-prove-proof.webm from the Step-8 hygiene sweep when the publish came back undelivered, and says it was attached to the PR by hand
- False-positive guard: does not offer or hunt for a local file after a GATE exit (3/6/8/9) -- a gated artifact is wrong, not merely undelivered, and the script withholds it deliberately

### `case-31.yaml` — The runner's origin is proven reachable before the proof run, not inferred from a healthy localhost

Legacy id `31` · judge `agent_judge` · dormant · 5 assertions.

Dropped assertions:

- Curls the literal `http://127.0.0.1:4000` from the config, not only the `localhost` form it already verified
- On a refusal, names the loopback-family mismatch (server bound to [::1]) rather than concluding the server is down
- Sets E2E_BASE_URL to the reachable form and states it will prefix EVERY later runner invocation, not just the proof run
- Records a `Runner origin:` line in the Step-4 Assumptions block
- False-positive guard: does not edit webServer.url or use.baseURL in the project's playwright.config.ts

### `case-32.yaml` — A webServer timeout with zero tests run is diagnosed as an unreachable origin, not a slow or broken spec

Legacy id `32` · judge `agent_judge` · dormant · 5 assertions.

Dropped assertions:

- Identifies that Playwright could not reach webServer.url and tried to boot a duplicate server
- Re-dials the config's literal URL to confirm, rather than raising the webServer timeout
- Carries the Runner-origin env var on the retried invocation
- False-positive guard: does not add timeouts to the spec, does not add retries, and does not treat this as a locator or assertion failure
- False-positive guard: does not confuse it with the every-test-times-out-on-first-goto signature (that one is worker saturation and is fixed with --workers=1)

### `case-33.yaml` — A recon pass that produced no HAR is a stated deviation, never a silent fallback to hand-written mocks

Legacy id `33` · judge `script` · **active #65** · 5 assertions.

Dropped assertions:

- Notices the missing HAR before writing `routeFromHAR` against it
- Does not commit a spec that replays a HAR file that does not exist
- Either re-records with the probe or states the no-HAR deviation explicitly in the plan's Assumptions block and in the completion report
- Reads the probe's close output for the RECORD_HAR verdict (written path + byte count, or the warning) instead of assuming the recon was clean
- False-positive guard: does not treat an absent HAR as evidence that the surface makes no API calls

### `case-34.yaml` — The filming law: a legible clip is bought with time only, never with a different input path

Legacy id `34` · judge `script` · **active #65** · 10 assertions.

Dropped assertions:

- Applies the filming law: the only PW_PROVE_CLIP-gated construct in the generated spec is a wait
- Fills the Title field atomically with `fill()` and holds on the filled field's end state rather than filming the typing
- Does NOT emit a PW_PROVE_CLIP-gated `pressSequentially()`, and names the reason: N keystroke events instead of one input event, before the assertion
- Does NOT emit an ungated `pressSequentially(..., { delay })`, and names the reason: a per-keystroke fixed sleep every CI run pays forever
- Centres the element under proof with an UNGATED scrollIntoView({ block: 'center' }) at the moment of each hold, not `scrollIntoViewIfNeeded()`
- Places the framing call AFTER the assertion that waits out the toast re-render, so the camera cannot be left pointed at pre-render coordinates
- Places a dwell after the fill's own assertion (a mid-test hold is permitted), and never between the Save click and the toast assertion
- Every dwell carries its `// JUSTIFIED:` line on the preceding line and is gated on process.env.PW_PROVE_CLIP
- False-positive guard: does NOT gate the centring, the scroll or the viewport pin on PW_PROVE_CLIP -- those change what the app is asked to render, so they stay unconditional and CI renders identically
- False-positive guard: proposes no second run, no post-processing of the recording and no edit to the project's committed playwright.config.ts

### `case-35.yaml` — Step 6 blocks Step 7 when the generated spec has no PW_PROVE_CLIP reader

Legacy id `35` · judge `script` · **active #65** · 6 assertions.

Dropped assertions:

- Runs clip-fidelity.mjs spec as part of Step 6, passing both --config and the Assumptions block's verdict verbatim
- Treats exit 2 as BLOCKING Step 7, the same way a missing PROVES header does
- Names the cause: no test() carries a PW_PROVE_CLIP-gated wait, so Step 7's PW_PROVE_CLIP=1 would be inert
- Adds a framed, PW_PROVE_CLIP-gated dwell with its `// JUSTIFIED:` line to each test(), then re-runs the audit
- Does not start the Step-7 proof run while the audit is non-zero
- False-positive guard: does not conclude the spec is fine because the YAGNI audit, the PROVES-header audit and e2e-reviewer are all clean

### `case-36.yaml` — A deliberate project viewport is respected — the clip-fidelity audit must not demand a pin

Legacy id `36` · judge `script` · **active #65** · 7 assertions.

Dropped assertions:

- Derives `deliberate` because of the explicit viewport: key, not the Desktop Chrome spread
- Reports the audit as passing (exit 0) with no viewport pin in the spec
- Does NOT add `test.use({ viewport: { width: 1600, height: 900 } })` to the spec
- Names the rule: a deliberate project viewport is respected, never pinned over
- Carries 1440x810 into Step 7 as PW_PROVE_W/PW_PROVE_H so the recording is not downscaled
- False-positive guard: does not read the `...devices['Desktop Chrome']` spread as scaffold default when an explicit viewport: key sits in the same use block
- False-positive guard: does not edit the project's committed playwright.config.ts

### `case-37.yaml` — Step 7 looks at the clip: an illegible frame is diagnosed and fixed before the one re-film

Legacy id `37` · judge `script` · **active #65** · 7 assertions.

Dropped assertions:

- States what each extracted frame shows, per clip, in the report
- Diagnoses clip 3 as element-off-frame rather than re-filming blind
- Applies the ungated scrollIntoView({ block: 'center' }) fix to the COMMITTED spec, not the proof config and not behind PW_PROVE_CLIP
- Re-runs `clip-fidelity.mjs spec` on the edited spec and requires exit 0 before re-filming
- Re-films exactly once
- A still-illegible second frame publishes with an explicit warning instead of failing the run
- False-positive guard: does not re-film without a preceding fix, since a re-film with no fix is deterministic and reproduces the same frame

### `case-38.yaml` — Absent video tooling skips the frame inspection — it never fails the run, and never reads as a good clip

Legacy id `38` · judge `script` · **active #65** · 5 assertions.

Dropped assertions:

- Treats exit 6 as a skip and continues Step 7
- Reports the clips as uninspected rather than as good
- Does not fail the run over absent video tooling
- Does not install ffmpeg or any dependency into the user's project
- False-positive guard: does not describe what the frames show, having never opened one

### `case-39.yaml` — Step 6 exit 2 on a dwell hoisted into a helper — inline it, do not conclude there is none

Legacy id `39` · judge `agent_judge` · dormant · 6 assertions.

Dropped assertions:

- Identifies the dwell as present but in the wrong PLACE — hoisted into a helper — rather than absent
- Inlines the framed, `// JUSTIFIED:`, PW_PROVE_CLIP-gated dwell into each test() body and removes the helper call
- Re-runs `clip-fidelity.mjs spec` and requires exit 0 before Step 7
- Names why the scope is strict: one shared dwell would satisfy tests that hold on nothing
- False-positive guard: does not report the spec as having no dwell at all, and does not add a second dwell while leaving the `await payoffHold(page)` call in place
- False-positive guard: does not edit clip-fidelity.mjs, relax the audit, or skip Step 6 on the grounds that the helper is equivalent

### `case-40.yaml` — A dwell wrapped across two lines already satisfies Step 6 — do not reformat it to appease the audit

Legacy id `40` · judge `agent_judge` · dormant · 4 assertions.

Dropped assertions:

- Reports the audit as exiting 0 and proceeds to Step 7
- Names the rule: the gate and the guarded wait need not share a line; brace style and wrapping are not part of the contract
- False-positive guard: does NOT join the gate and the wait onto one line, add braces, or otherwise reformat a compliant dwell
- False-positive guard: does not report the spec as carrying no PW_PROVE_CLIP-gated wait

### `case-41.yaml` — Step 8 runs the residue refusal — it does not confirm the HAR by eye

Legacy id `41` · judge `script` · **quarantined #65** · 4 assertions.

Dropped assertions:

- Runs har-scrub.mjs --verify against the HAR before staging
- Names exit 3 as a hard stop that keeps the HAR out of the commit
- False-positive guard: does not answer by inspecting the file and confirming no credential remains
- False-positive guard: does not print or quote any credential value from the HAR

### `case-42.yaml` — The recon HAR is already scrubbed at capture — do not hand-roll a second scrub

Legacy id `42` · judge `script` · **quarantined #65** · 4 assertions.

Dropped assertions:

- States the HAR is already scrubbed because probe.mjs scrubs on context close
- Cites the probe's reported secret count / REFUSED line as the evidence
- False-positive guard: does not hand-write a scrubber in node -e or python3
- False-positive guard: does not plan a scrub step for just before commit

### `case-43.yaml` — Every read aborting in Step 7 is an unbound HAR, not a short recording

Legacy id `43` · judge `rule_based` · active · 4 assertions.

Dropped assertions:

- Diagnoses an unbound HAR (exact-URL matching against a canonical recording), not a missing recording
- Runs har-scrub.mjs bind into a gitignored path and sets PW_PROVE_HAR for every later invocation
- False-positive guard: does not re-record the HAR or hand-mock the reads
- False-positive guard: does not relax notFound:'abort' or allow a live round-trip

### `case-44.yaml` — A missing configuration key is a configuration failure, named in seconds — not a slow server

Legacy id `44` · judge `rule_based` · active · 6 assertions.

Dropped assertions:

- True positive: identifies exit 4 as the configuration phase failing, and names NUXT_PUBLIC_AUTH_URL as the missing key
- Sets the key in the environment the build and preview will run under (or the dotenv file they load), then re-runs `config build`
- States that the build did not run, so the build and the server are not yet implicated
- False-positive guard: does NOT treat it as a readiness/not-ready problem — no READY_TIMEOUT increase, no port kill, no server restart, no rebuild loop
- False-positive guard: does not fabricate a value for a key it cannot source; an unsourceable key is reported by name, not guessed
- Does not report NUXT_PUBLIC_API_BASE as missing when it is already set in the environment

### `case-45.yaml` — The committed proof config must not inherit the project's development webServer

Legacy id `45` · judge `script` · **active #65** · 6 assertions.

Dropped assertions:

- True positive: identifies that the `...base` spread inherits webServer and would start the project's dev server
- Adds `webServer: undefined` to the committed proof config as a one-time, in-place migration and stages it
- Explains the missing readiness wait is acceptable because the agent owns the lifecycle and preflight.mjs gates bring-up
- False-positive guard: does NOT edit the project's own playwright.config.ts
- False-positive guard: does NOT regenerate or rewrite the whole proof config per-run (docs/adr/0008 keeps it static)
- Does not work around it by moving the preview onto the config's port or by setting CI=1

### `case-46.yaml` — Two attempts with the same failure signature take the handover stop, not a third try

Legacy id `46` · judge `script` · **active #65** · 7 assertions.

Dropped assertions:

- Stops the loop at attempt 2 on the unchanged failure signature instead of attempting a third fix
- Names the signature as error class plus failing locator
- Invokes playwright-debugger against playwright-report/ for the diagnosis before stopping
- Posts the handover as a PR comment via gh pr comment, carrying the spec, the verbatim failure and the diagnosis
- False-positive guard: does not commit or push the failing spec/POM to the branch
- False-positive guard: does not emit the Step 8 delivery tail (no Proof page / Mutation / Committed / Pushed lines)
- False-positive guard: does not file the handover as a file in a repository directory instead of on the PR

### `case-47.yaml` — Genuinely different failures are a converging run — spend the full budget of three

Legacy id `47` · judge `script` · **quarantined #65** · 5 assertions.

Dropped assertions:

- Continues to attempt 3 because the failure signature changed
- Names the changed error class and/or changed failing locator as the reason the checkpoint does not fire
- Reruns only the failing test during the attempt and the full spec once as the gate
- False-positive guard: does not take the handover stop on line `Error: expect(locator).toHaveText(expected)` merely because two attempts have failed
- False-positive guard: does not post a handover PR comment while the run is still converging

### `case-48.yaml` — A dev-guarded session bootstrap does not exist in the built target — descend the ladder

Legacy id `48` · judge `rule_based` · active · 9 assertions.

Dropped assertions:

- True positive: identifies `import.meta.dev` as a development-only guard that removes the `?token=` rung from the built artifact, and skips that rung
- Descends to client-storage seeding rather than attempting the compiled-away path
- Seeds BOTH the credential (`auth.token`) and the user record (`auth.user`), naming the empty-shell failure a credential-only seed causes
- Derives the rule from grepping the mechanism's enclosing guard in the app's own source, not from a per-application special case
- Asserts the authenticated state (signed-in element / store user) against a short explicit budget, rather than waiting on the stripped query parameter
- Gates recon on the page rendering POPULATED — treats an authenticated-but-empty shell as an incomplete seed, not as a broken locator
- Records the skipped rung and its guard in the Step-4 Assumptions block
- False-positive guard: does NOT edit the application's source or config to re-enable the dev-only path or replace the guard with a runtime flag
- False-positive guard: does NOT reintroduce a development server to make the dev-only rung available

### `case-49.yaml` — An unestablished session fails loudly in seconds, not at a sixty-second timeout

Legacy id `49` · judge `agent_judge` · dormant · 6 assertions.

Dropped assertions:

- True positive: attributes the 60 s timeout to a rung that is compiled out, not to a slow app, a flaky wait, or a broken locator
- Replaces the stripped-parameter side-effect wait with a short-budget assertion on the authenticated state itself
- Descends to the next rung the app's source shows it reads, seeding credential and user record where that rung is client storage
- False-positive guard: does NOT raise the timeout or retry the same navigation to make the wait pass
- False-positive guard: does NOT continue into recon or spec generation with an unauthenticated session
- Exhausted ladder produces a Step-3 STOP report naming each rung and the dev-only guard, not a fabricated pass

### `case-50.yaml` — The server announced a shifted port — poll what it said, not what you asked for

Legacy id `50` · judge `rule_based` · active · 7 assertions.

Dropped assertions:

- True positive: reads port 3001 from the server's announcement instead of re-polling the requested 3000
- Re-runs the serve phase with SERVER_LOG so the port and address family come from the log
- Takes the effective origin from the serve summary's BASE_URL= line rather than reassembling it by hand
- Carries the effective origin into the probe, the Runner origin line, the HAR binding and every runner invocation
- Notes the announced [::1] form and that a server reachable on one loopback family is not absent
- False-positive guard: does not report the server as broken, absent or not-ready
- False-positive guard: does not kill/restart the server, rebuild, or raise READY_TIMEOUT to keep polling 3000

### `case-51.yaml` — A server whose log names no origin is not a port mismatch

Legacy id `51` · judge `script` · **retired #65** — 3/3 at n=3, then a re-measured **zero uplift** on a certified skill-free baseline · 6 assertions.

Dropped assertions:

- True positive: treats no-announcement plus the printed crash as the server or the built output, not as a port mismatch
- Uses the printed log lines (the missing module path) as the diagnostic
- Checks what the build produced and starts the project's own preview command against it
- False-positive guard: does not search for a shifted port or dial other loopback forms/ports
- False-positive guard: does not re-run the build phase, which already reported BUILD=ok
- False-positive guard: does not raise READY_TIMEOUT and poll longer

### `case-52.yaml` — A batch pays for one build, and the mutation check pays for its own

Legacy id `52` · judge `script` · **active #65** · 6 assertions.

Dropped assertions:

- True positive: reads `BUILD=reused` with its reason as a passing bring-up phase, not as a skipped build
- Forces the mutation-check build with `BUILD_REUSE=never` and restarts the preview before running the guarding test
- Rebuilds again after the revert so later steps do not run against the mutated artifact
- False-positive guard: does NOT rebuild at Step 3 when the commit and tree are unchanged and the run reported a reuse hit
- False-positive guard: does NOT accept a green mutation run performed against an artifact built before the mutation
- Keeps the mutation run's output at `/tmp/pw-prove-mutation` so the recorded clips are not overwritten

### `case-53.yaml` — The probe's vocabulary: an empty shell is a console question, and a batch sent first is not a failure

Legacy id `53` · judge `script` · **quarantined #65** · 6 assertions.

Dropped assertions:

- True positive: uses the `console` verb to ask why the surface rendered empty, rather than re-snapshotting or reading source
- True positive: reads both values in ONE eval via an object-form expression (named map, or {fn, arg}) instead of separate round trips
- States that no `viewport` verb exists and that the effective viewport is pinned in the spec, not probed
- False-positive guard: does NOT treat the 'no daemon — starting one first' sequencing as an error, and does not restart the daemon or re-run the batch because of it
- False-positive guard: does NOT claim the string form of `eval` was replaced — a plain {"cmd":"eval","expression":"location.href"} remains valid
- False-positive guard: does NOT reach for a throwaway _recon.spec.ts or `playwright test` for any of the three questions

### `case-54.yaml` — A HAR the scrubber destroyed is re-recorded, never hand-repaired — and exit 6 is not exit 3

Legacy id `54` · judge `script` · **quarantined #65** · 7 assertions.

Dropped assertions:

- Reads exit 6 as a destroyed recording, not as credential residue
- Names a short low-entropy value (e.g. a locale cookie) as the cause, rather than blaming the scrubber's shape rules
- Re-records the recon pass (or narrows the secret set) instead of hand-substituting the placeholders back
- Refuses to stage or commit the wrecked HAR
- Explains why the earlier `--verify` reported clean: over-scrub leaves no residue, so a residue check cannot see it
- False-positive guard: does NOT re-run `har-scrub.mjs` over the file as the remedy — a second scrub cannot restore text the first one replaced
- False-positive guard: does NOT relax or edit har-scrub.mjs's threshold to make the gate pass

### `case-55.yaml` — A mutation-check restart that cannot be proven has no verdict to read

Legacy id `55` · judge `script` · **quarantined #65** · 7 assertions.

Dropped assertions:

- True positive: treats SERVE_CAUSE=restart-port-in-use / RESTART=unproven as a bring-up failure that invalidates the mutation run
- Names the stale predecessor as what answers the port, still serving the pre-mutation artifact
- Kills the process holding the port, restarts, and re-polls with SERVE_RESTART=1 until RESTART=proven before re-running the test
- Takes the mutation verdict only from the run made against the proven restart
- False-positive guard: does NOT record RED or claim the spec guards the change on this run
- False-positive guard: does NOT raise the test timeout, retry the spec, or treat the loading splash as slowness
- False-positive guard: does NOT continue to the revert/rebuild step or to Step 8 on this evidence

### `case-56.yaml` — A proven restart is proven — do not re-litigate a fast one

Legacy id `56` · judge `script` · **quarantined #65** · 6 assertions.

Dropped assertions:

- True positive: reads RESTART=proven plus the failed assertion as a genuine RED and records it
- States that the announcement past the restart mark is what makes the served artifact the mutated one
- Continues the step: reverts exactly, rebuilds and restarts with SERVE_RESTART=1 and a fresh mark, verifies the tree
- False-positive guard: does NOT treat a sub-second restart as evidence of a stale server
- False-positive guard: does NOT kill the process, restart again, or re-run the serve poll to double-check identity
- False-positive guard: does NOT withhold or weaken the RED verdict

### `case-57.yaml` — A probe question that needs an argument uses the {fn, arg} form, and its answer is the value

Legacy id `57` · judge `script` · **active #65** · 5 assertions.

Dropped assertions:

- True positive: reads `eval -> undefined` from arrow-function source as a form mistake, not as the page's answer
- Explains that a string expression evaluates to a function object and no call is made
- Re-asks through the {fn, arg} form (or a self-contained string expression) and takes the returned value as the answer
- False-positive guard: does NOT report `undefined` as a property of the application under proof
- False-positive guard: does NOT escalate to a spec run or codegen to answer a recon question

### `case-58.yaml` — The eval argument carries data, not a page handle

Legacy id `58` · judge `script` · **quarantined #65** · 5 assertions.

Dropped assertions:

- True positive: identifies that `arg` is JSON-serialised data and cannot carry a DOM node or a live handle
- Moves the querySelector inside `fn` and passes the selector (or the id) as the argument
- False-positive guard: does NOT claim the {fn, arg} form drops its argument or returns nothing
- False-positive guard: does NOT rewrite the question into the named-map form, whose values take no argument
- False-positive guard: does NOT invent a handle/element-passing capability the probe DSL does not document

### `case-59.yaml` — Every scenario times out on its first navigation — serialise once to diagnose, then report the finding

Legacy id `59` · judge `script` · **quarantined #65** · 6 assertions.

Dropped assertions:

- Re-runs at --workers=1 as a one-command diagnostic rather than editing the spec
- Checks the origin is alive (curl) before re-running
- States that a spec passing only when serialised is a finding to report, not a fix to adopt silently
- False-positive guard: does NOT heal locators or raise timeouts in response to this failure
- False-positive guard: does not pin workers by editing the committed proof config or the project's playwright.config
- False-positive guard: does not diagnose this as a saturated dev server — the proof target is a built preview that compiles nothing

### `case-60.yaml` — The proof run names no worker count

Legacy id `60` · judge `script` · active · 5 assertions.

Dropped assertions:

- Passes no --workers flag on the proof run
- Clears test-results/ before the run and passes PW_PROVE_CLIP=1 with PW_PROVE_W/H from the effective viewport
- False-positive guard: does not pass --workers=1 (the mandate is retired by docs/adr/0017)
- False-positive guard: does not substitute a hard-coded number such as --workers=4
- False-positive guard: does not add `workers` to the committed proof config or edit the project's playwright.config

### `case-61.yaml` — Scenarios that contend over one shared record serialise in the spec, not on the command line

Legacy id `61` · judge `script` · **quarantined #65** · 5 assertions.

Dropped assertions:

- Adds test.describe.configure({ mode: 'serial' }) scoped to the contending scenarios
- Comments the reason (the shared record) beside the configure line
- States that a fresh browser context per test is not the issue — shared tenant state is
- False-positive guard: does not fix it with --workers=1 on the command line
- False-positive guard: does not add retries, waitForTimeout or an increased timeout to absorb the race
