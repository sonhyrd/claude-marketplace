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

## Template

- **Remote**: `<org>/<repo>` — substring of the origin URL
- **Branch prefix**: prefix for per-ticket branches (`<prefix><ticket-slug>`)
- **Post-merge check**: command that must pass after every merge-back
- **Commit policy**: what commit messages must and must not contain
- **Worker constraints**: repo rules every worker prompt carries verbatim
