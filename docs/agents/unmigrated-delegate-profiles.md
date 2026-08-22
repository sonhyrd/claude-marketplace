# Unmigrated repo profiles (temporary archive)

**`/delegate-tickets` does not read this file.** It is a parking bay, not a source of truth.

Repo profiles now live in the repo they describe, as `docs/agents/delegate-profile.md` — see
[profile-template.md](../../plugins/sss/skills/delegate-tickets/references/profile-template.md).
The entries below came from the central profile list this skill used to carry, and belong to repos
that were not checked out on the machine where the move was made, so they could not be written into
their repos at the time.

**Each entry is to be moved into its own repo as `docs/agents/delegate-profile.md` — with the
`CLAUDE.md` pointer line and any ticket-location rule lifted into that repo's
`docs/agents/issue-tracker.md` — and then deleted from here.** When the last entry goes, delete
this file. If it is still here with entries in it, that is a to-do, not a design.

Entries are verbatim as of the move, with one correction: the `e2e-skills` skill list dropped
`playwright-test-generator` and `cypress-debugger`, which the fork itself retired (`652c696`).
Treat every measured baseline in them as dated.

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


## agent-native (Agent Native framework monorepo)

- **Remote**: `BuilderIO/agent-native` — the checkout's `origin`. **Tickets live on the fork `sonhyrd/agent-native`, not on origin.** Every `gh issue` call must carry `--repo sonhyrd/agent-native`; a bare `gh issue view 4` resolves against BuilderIO upstream and returns an unrelated issue.
- **Branch prefix**: `sss/`
- **Post-merge check**: `pnpm typecheck && pnpm test:fast && pnpm guards` — the substance of `pnpm prep` without the oxfmt write. **`pnpm install` first**: a fresh checkout has no `node_modules` and the Orca setup hook for this repo is empty, so nothing is installed for you.
  - **`pnpm guards` is a real gate — clean on `main` at `d04621c8c` (2026-08-01), EXIT=0.** Any guard failure is a real regression.
  - **`pnpm test:fast` is NOT clean on `main`.** Verified known-failing baseline at `d04621c8c` (2026-08-01), 4 spec files:
    - `packages/core` — `src/cli/connect.spec.ts` (14 tests: `writeConfigs`, `runConnect`, `reconnect — URL-based discovery`)
    - `packages/docs` — `app/components/docs-content.test.ts` (2 tests)
    - `templates/design` — `app/components/design/bridge/bridge.guard.spec.ts` (5 tests, all 30s timeouts — reads as parallel-load noise)
    - `templates/design` — `app/components/design/bridge/reparent-matrix.guard.spec.ts` (`Chromium reparent matrix`)
  - Because the chain is `&&`, a `test:fast` failure means `guards` never runs. Run `pnpm guards` separately so a known-noise test failure cannot hide a real guard regression.
  - **Rebuild `packages/core` before typechecking when a merge adds a core export that a template imports.** Templates typecheck against `packages/core/dist`, not source, so a fresh export reads as `error TS2305: Module '"@agent-native/core/server"' has no exported member 'x'` — a stale artifact wearing the shape of a missing implementation. `pnpm --filter @agent-native/core build`, then re-run. Hit for real merging #7 (clips imported `sendBackgroundQueueMessage`); earlier merges passed only because no template imported the new symbols yet.
  - **Run `pnpm install` in the integration checkout after merging a branch that changed any `package.json`/`pnpm-lock.yaml`.** The worker installed into its own worktree; your checkout did not. Symptom is `error TS2307: Cannot find module 'x'` for a package that is plainly in `package.json` — another stale-environment failure wearing the shape of a code defect. Hit merging #9 (`@cloudflare/playwright`).
  - **`pnpm test:fast` is broadly load-sensitive while a dispatch fan-out is live.** Running it alongside two Claude workers produced timeout-only failures in `packages/core` `src/deploy/build.spec.ts`, `packages/docs` `app/vite-sitemap-plugin.spec.ts`, and `packages/docs` `tests/templates-routes.test.ts` — every one passed on a targeted isolated rerun. **Before treating any new failing file as a regression, rerun that file alone.** A bare `Test timed out in <n>ms` with no assertion is the tell.
  - **`packages/core` `src/deploy/build.spec.ts` `generateWorkerEntry > *` is load-sensitive flake, not a regression.** Times out at its 15s allowance whenever parallel workers are running; the failing count varies run to run (observed 1, 9, then 3 across three runs of the same tree) and every failure is a bare `Test timed out in 15000ms`, never an assertion. Passes at idle. Two independent workers reproduced it against an untouched merge-base. Do not chase it while a dispatch fan-out is live — confirm on a quiet machine or in CI.
  - Compare each merge-back against that list; only a *new* failing file is a regression. `templates/design` `bridge.guard.spec.ts` alone takes ~5.4 minutes.
- **Commit policy**: conventional commit, no issue-closing trailers — `feat(core): resolve dispatch target as a typed union`. **Never `closes #N` / `resolves #N`**: origin is BuilderIO/agent-native, so a fork issue number in a commit points at an unrelated upstream issue. The coordinator closes fork issues explicitly. Never add `Co-Authored-By` or any agent attribution.
- **Worker constraints**:
  - Read `CLAUDE.md` first — it is authoritative and overrides defaults. Read the matching skill in `.agents/skills/` before changing that area; `portability`, `reliable-mutations`, `verifying-changes`, and `secrets` are the load-bearing ones for hosting/runtime work.
  - **Changeset required** for any source change under `packages/core`, `packages/dispatch`, `packages/scheduling`, or `packages/pinpoint` (`pnpm changeset:add`). Never hand-bump a package version.
  - **A `catch`, default, or coercion returning a value callers cannot distinguish from success is a bug, not a guard.** Enforced by `guard:no-silent-coercion` on added lines. This is the whole point of the Cloudflare tickets — a silent degrade to inline is the defect under repair.
  - Migrations are additive only; never drop, rename, or truncate. `guard:additive-migrations`.
  - TypeScript only — no new `.js` or `.mjs` source files. Run `oxfmt --write` on files you modified.
  - Never hardcode API keys, tokens, webhook URLs, or signing secrets, in source, tests, fixtures, or issue comments. One resolver per credential key; run `pnpm guard:no-env-credentials` after a credential change.
  - **Never `git stash`** — the stash is shared across worktrees and would steal another worker's WIP. Use `git checkout` for baselines.
  - **Measure any baseline against `git merge-base main HEAD`, never `HEAD` and never `main..HEAD`** — once siblings merge, a plain range diff renders their work as deletions.
  - **Stay on your own branch.** Never create, switch, delete, reset, rebase, or stash branches. The coordinator owns merge-back.
  - `scripts/hooks/file-lease.mjs` denies a write when a peer session holds the file or it changed on disk under you. Re-read and build on their change; never force past it.
  - Actions are the single source of truth. Do not add a handler under `server/routes/api/` where an action fits (`guard:no-action-twin-routes`).
  - Run the narrow gate for your slice, not the monorepo: `pnpm --filter <pkg> exec vitest --run <spec>`. Reserve `pnpm typecheck && pnpm test:fast && pnpm guards` for the final pass.
  - Don't `pkill` on `agent-native dev` — the pattern matches the user's own long-running stack.
  - **Worker shells may have no outbound network.** A failed request to an external host proves nothing about that host. `ask` the coordinator to probe rather than concluding a service is down.


## e2e-skills

- **Remote**: `sonhyrd/e2e-skills` — private fork of the e2e-skills Agent Skill bundle (pw-prove, e2e-reviewer, playwright-debugger). Personal tool, not a public release surface.
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
