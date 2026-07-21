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

## Template

- **Remote**: `<org>/<repo>` — substring of the origin URL
- **Branch prefix**: prefix for per-ticket branches (`<prefix><ticket-slug>`)
- **Post-merge check**: command that must pass after every merge-back
- **Commit policy**: what commit messages must and must not contain
- **Worker constraints**: repo rules every worker prompt carries verbatim
