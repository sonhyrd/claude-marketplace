# Repo profiles

Matched by `git remote get-url origin` — the profile whose **Remote** is a substring of the origin URL applies. To add a repo, copy the template and fill every field.

## chrysus

- **Remote**: `hyrdrocks/nuxt-hyrd-chrysus`
- **Branch prefix**: `sss/`
- **Post-merge check**: `pnpm typecheck:scoped`
- **Commit policy**: describe the slice; no `MAMAS-####` keys unless that exact ticket is delivered by that commit — keys auto-transition Jira.
- **Worker constraints**:
  - `pnpm typecheck:scoped` only — never full `vue-tsc`, never `pnpm build`.
  - Load `/paul-api-types` before touching any Paul-API code.
  - New i18n keys in alphabetical order within their namespace.

## paul-career-builder (burbot)

- **Remote**: `sonhyrd/paul-career-builder` — also matches the local-only checkout on path `paul-career-builder/burbot` (agent-native design template / Career Page Studio). Same project, two checkouts; the constraints below apply to both.
- **Branch prefix**: `sss/`
- **Post-merge check**: `pnpm typecheck && pnpm test`
- **Commit policy**: `NN: <what the slice delivers>` — lead with the ticket number, describe the behaviour. No Jira keys (no Jira automation wired here).
- **Worker constraints**:
  - **Editing any `*.bridge.ts` means running `pnpm codegen:bridge` and committing the regenerated `.generated/bridge/*.generated.ts`.** The generated files are committed and `bridge.guard.spec.ts` fails if they drift from source. Never hand-edit a `.generated/` file.
  - On a merge conflict inside `.generated/`, never hand-resolve — resolve the `.bridge.ts` source, then re-run `pnpm codegen:bridge` and take that output.
  - Bridge scripts run inside an iframe: no imports/requires, no outer-scope references, everything wrapped in an IIFE.
  - Job Data Actions are consumed as **simple GETs** — never add request headers to a runtime fetch; a custom header triggers a CORS preflight the builder rejects.
  - Never write design rows with raw SQL; use the app actions.
  - `pnpm test` is vitest. Three tests (`agent-card`, `auth.spec`, `fig-file-import`) fail only under parallel run and pass in isolation — known noise, not regressions.

## hyrd-widget

- **Remote**: `hyrdrocks/hyrd-widget`
- **Branch prefix**: `sss/`
- **Post-merge check**: `pnpm test` (vitest unit sweep). **Green on a clean tree as of 2026-07-27 (87 files / 882 tests)** — any failure is a real regression. The old known-noise entry for `tests/contract/staticJobExportUnoCss.test.mjs` is RETIRED: `renderer/exportUnoCss.gen.ts` is fresh on main again and that test passes. If a worker touches `JobPageView`/the static-export builder it must still run `pnpm gen:export-uno-css` and commit the regenerated file.
- **Commit policy**: `<ticket-number>: <what the slice delivers>` — lead with the ticket number (e.g. `694:`, or `A11y-3:` for the accessibility series), describe the behaviour. **No `MAMAS-####` keys** (they auto-transition Jira) unless that exact ticket is delivered by that commit.
- **Worker constraints**:
  - Typecheck via `./node_modules/.bin/tsc --noEmit`, NEVER `npx tsc` or an rtk-wrapped tsc (RTK swallows most errors and reports 1). The full typecheck has a **161-error pre-existing baseline (verified 2026-07-27)**, so don't gate on a clean run — only ensure you add no NEW errors in files you touch.
  - **Never `git stash`** — the stash is shared across worktrees and would steal another worker's WIP. Use `git checkout` for baselines.
  - **Measure any baseline against the merge-base, never `HEAD`.** `git worktree add /tmp/x HEAD` measures a worker's own commits and is worthless — use `git merge-base <integration-branch> HEAD`. Two separate workers got this wrong on the same run (2026-07-27).
  - **Worker shells have no outbound network.** A failed `curl` to an external host proves nothing about that host; it is the sandbox. Workers must ask the coordinator to probe rather than concluding a fixture is dead.
  - Any interactive element you add/edit (button, link, input, select, toggle) needs a `data-testid` bound to a constant in `src/utils/test-id.ts` AND an Amplitude `track`/`trackAuth` call via `useTracking()` — follow the `data-testid` and `amplitude-tracking` skills.
  - New i18n keys alphabetical within their namespace; route hardcoded accessible strings (aria-label, iframe title) through i18n.
  - Preserve radix-vue/vaul primitives; prefer native HTML before adding ARIA (per `docs/accessibility-audit.md`).
  - `pnpm test` is the unit gate; Playwright e2e (`pnpm exec playwright test`) is NOT a CI gate, but these a11y tickets add axe/keyboard specs — run the specs you add or touch locally (`pnpm install` first; the repo pins PW 1.61.1 and stale node_modules lie).

## second-me (Dispatch)

- **Remote**: `sonhyrd/second-me`
- **Branch prefix**: `sss/`
- **Post-merge check**: `pnpm typecheck && pnpm test` — both clean on a fresh tree (48 tests, 3 files). No known-noise baseline; any failure is a real regression.
- **Commit policy**: conventional commit + `(resolves #N)` — `feat(teams): send a queued draft into a Teams thread (resolves #21)`. The trailer auto-closes the issue on merge to master.
- **Worker constraints**:
  - `.env` and `data/app.db*` are gitignored and absent from a fresh worktree. **Symlink** them back to the primary checkout (`/Users/sondh0127/SonDev/second-me/`) — never copy, never `cat`, never echo a secret value into terminal output, a test fixture, a commit, or an issue comment.
  - The sqlite database is shared through that symlink. Before running a dev server or anything that writes to it, `ask` the coordinator — two workers must never write it concurrently.
  - Never `pkill` on "agent-native dev"; `just dev` runs behind portless and the pattern matches the user's own long-running stack.
  - Tests are vitest, `include: ["server/**/*.spec.ts"]`. Match the prior art in `server/orchestrator.spec.ts`: dependency injection with plain functions, no mocking framework, no fixtures.
  - Never hardcode API keys, tokens, webhook URLs, tenant/app ids, or signing secrets. Read them through the existing secret resolution; use obvious placeholders in examples.
  - Prefer Dispatch actions over raw SQL for vault, integrations, resource grants, messaging, routing, and approvals.
  - Integration webhooks use the queue-and-processor pattern — no fire-and-forget promises after a serverless response.
  - `serviceUrl` for Teams is region-pinned; always read it from the stored thread mapping, never hardcode it.

## paul-clips (Clips)

- **Remote**: `hyrdrocks/paul-clips` — agent-native screen-recording / transcript / meetings app. Primary checkout: `/Users/sondh0127/SonDev/clips`.
- **Branch prefix**: `sss/`
- **Post-merge check**: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest --run --passWithNoTests` — **never** `pnpm typecheck` / `pnpm test` (see constraints). Verified baseline on a clean tree at `24409b7`: 0 tsc errors, 128 test files / 697 tests passing. No known-noise failures — any failure is a real regression.
- **Commit policy**: sentence-case imperative describing the slice, e.g. `Add import-recording-from-url action for public video URLs`. No ticket numbers, no Jira keys, no `resolves #N` / `closes #N` trailers — the log has none and issues are closed explicitly by the coordinator.
- **Worker constraints**:
  - **`node_modules` and `.env` are symlinks to `/Users/sondh0127/SonDev/clips`.** Never run bare `pnpm <anything>` — pnpm's dep-status check tries to *purge the modules directory*, which through the symlink would delete the primary checkout's `node_modules`. Run binaries directly from `./node_modules/.bin/`.
  - Never install, add, remove, or upgrade a package. All worktrees share one dependency tree; a single install corrupts every concurrent worker. Need a dependency? `ask` the coordinator.
  - `pnpm typecheck` (`agent-native typecheck`) does not work in a symlinked worktree — Vite's module runner can't resolve nitro's dev-entry through the out-of-root symlink. Use `./node_modules/.bin/tsc --noEmit`, which is a real gate (verified: it catches errors in `actions/lib/`).
  - **Never `git stash`** — the stash is shared across worktrees and would steal another worker's WIP. Use `git checkout` for baselines.
  - Actions are the single source of truth for app operations; never bypass the access helpers, and never add a new HTTP endpoint where an action fits.
  - Never hardcode API keys, tokens, webhook URLs, signing secrets, or customer data. Use registered secrets / OAuth / runtime config and obvious placeholders in examples.
  - Never store blobs in SQL — no base64, `data:` URLs, video/audio, images or thumbnails in app tables, `application_state`, `settings`, or `resources`. Persist URLs, ids, or handles.
  - Read the relevant skill in `.agents/skills/` before deeper work (`recording`, `actions`, `security`, `video-sharing`); `AGENTS.md` is the repo's agent guide and is authoritative.
  - Tests are vitest. Prefer the established seam: extract a pure module and test it directly (prior art: `actions/lib/create-recording-schema.ts` + `actions/create-recording.test.ts`) over HTTP-route tests with hoisted module mocks.
  - Don't run the dev server (`just dev` / `pnpm dev`) — it runs behind portless in the user's own long-running stack. Never `pkill` on "agent-native dev".

## Template

- **Remote**: `<org>/<repo>` — substring of the origin URL
- **Branch prefix**: prefix for per-ticket branches (`<prefix><ticket-slug>`)
- **Post-merge check**: command that must pass after every merge-back
- **Commit policy**: what commit messages must and must not contain
- **Worker constraints**: repo rules every worker prompt carries verbatim

## e2e-skills

- **Remote**: `sonhyrd/e2e-skills` — private fork of the e2e-skills Agent Skill bundle (playwright-test-generator, pw-prove, e2e-reviewer, the two debuggers). Personal tool, not a public release surface.
- **Branch prefix**: `sss/`
- **Post-merge check**: `bash scripts/ci/ci-local.sh` — the single source of truth for CI (shell + Node syntax, parity, security, evals, public skill surface, framework scope, links, docs orphans, language, scanner corpus, probe HAR contract, run-ledger smoke, e2e smell scan). Must be green on a clean tree; any failure is a real regression. Follow with `bash scripts/ci/pre-push-security.sh` before pushing.
- **Commit policy**: conventional commit scoped to the skill — `feat(pw-prove): <what the slice delivers>`, `fix(pw-prove): <what broke>`. Describe the behaviour, not the files. No issue-closing trailers.
- **Worker constraints**:
  - **Shipped scripts under `skills/*/scripts/` are plain ESM `.mjs` on the Node standard library — zero npm dependencies, no build step, nothing installed into a user's repo.** Invoke with `node`, never `bash`. Repo tooling under `scripts/` stays shell.
  - Shipped scripts **orchestrate, they don't match**: `rg` (PCRE2), `ffmpeg`, `ffprobe`, `git`, `gh`, `curl`, `npx playwright` stay subprocesses. Never rewrite a Tier-3 PCRE2 pattern as a JS RegExp — at least one is load-bearing on a possessive quantifier JS cannot express, and rewriting it silently inverts the check.
  - Changing a pattern, severity, or failure-category ID is forbidden without an explicit instruction — downstream evals and adopters depend on them being stable.
  - Editing a skill means updating its parity surfaces in lock-step (SKILL.md, references, docs, README, the three plugin manifests); `scripts/ci/review.sh` fails fast on drift. Version bumps touch all three manifests in one commit.
  - Behaviour changes add or update `evals/evals.json` — at least one true positive and one false-positive guard naming the exact line and why.
  - A skill that delegates to a subagent in `agents/` MUST keep an inline fallback reaching an identical verdict; subagents are invisible to the `skills` CLI copy and to Codex.
  - Playwright and Cypress only. Say "out of scope" for Selenium/WebdriverIO/etc rather than emitting half-working examples. The word "Puppeteer" must not appear outside `docs/framework-scope.md`.
  - **Never `git stash`** — the stash is shared across worktrees and would steal another worker's WIP. Use `git checkout` for baselines.
  - No state-changing operations on third-party repos: clone into `testbed/` and run locally, never push forks, open PRs/issues, or post comments.
