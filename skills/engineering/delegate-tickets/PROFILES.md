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
- **Post-merge check**: `pnpm test` (vitest unit sweep). Known-noise baseline failure on a clean tree: `tests/contract/staticJobExportUnoCss.test.mjs` (the generated `renderer/exportUnoCss.gen.ts` is stale on main) — treat as noise UNLESS a worker touched `JobPageView`/the static-export builder, in which case run `pnpm gen:export-uno-css` and commit the regenerated file.
- **Commit policy**: `A11y-N: <what the slice delivers>` — lead with the ticket number, describe the behaviour. **No `MAMAS-####` keys** (they auto-transition Jira) unless that exact ticket is delivered by that commit.
- **Worker constraints**:
  - Typecheck via `./node_modules/.bin/tsc --noEmit`, NEVER `npx tsc` or an rtk-wrapped tsc (RTK swallows ~152 errors). The full typecheck has a **153-error pre-existing baseline**, so don't gate on a clean run — only ensure you add no NEW errors in files you touch.
  - **Never `git stash`** — the stash is shared across worktrees and would steal another worker's WIP. Use `git checkout` for baselines.
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

## Template

- **Remote**: `<org>/<repo>` — substring of the origin URL
- **Branch prefix**: prefix for per-ticket branches (`<prefix><ticket-slug>`)
- **Post-merge check**: command that must pass after every merge-back
- **Commit policy**: what commit messages must and must not contain
- **Worker constraints**: repo rules every worker prompt carries verbatim
