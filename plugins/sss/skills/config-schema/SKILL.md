---
name: config-schema
description: >-
  Audit a repo's run-time configuration and emit a schema that makes missing config fail loudly
  instead of silently. Finds every environment-variable read, classifies each key by class (static
  or secret) and scope (run-time, build-time or tooling), diffs the committed `.env.example`
  against the code in both directions to find dead keys and undocumented live ones, and emits a
  declarative schema, a generated template with a `--check` mode, and assertions that name every
  missing key at once. Use when a repo has a rotted or missing `.env.example`, when
  `process.env.X || ''` or a silent empty default is turning a config error into a 502, when a
  fresh checkout or worktree will not boot without a hand-copied `.env`, when secrets or config
  values are committed in per-environment `.env.*` files, or when the user asks to audit, declare,
  validate, or centralise environment variables and run-time configuration. It writes files into
  the working tree and commits nothing.
argument-hint: "[path-to-repo]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
  - Bash(git:*)
  - Bash(pnpm:*)
  - Bash(npm:*)
  - Bash(node:*)
  - Bash(grep:*)
  - Bash(rg:*)
---

# config-schema

Make a repo's run-time configuration declared, validated, and impossible to silently drift.

The failure this exists to prevent: `process.env.NUXT_API_BASE_URL || ''` turns a missing upstream
into a per-request 502 while the dev server builds and serves fine. The process looks healthy. In a
client bundle the same mistake is worse — the key is inlined as `undefined` and ships, with no error
anywhere.

Read [references/vocabulary.md](references/vocabulary.md) first. `class`, `scope`, `devDefault`,
`Fail Fast` and `Secret` have exact meanings here, and this skill is the owner of that file —
`dev-local` consumes its `class: 'secret'` output.

## Non-negotiables

- **`|| ''` is banned.** A required key that is absent stops the process, in every environment.
- **`devDefault` must be unreachable in production.** Under Node the guard is `NODE_ENV` explicitly
  set and not `production`. Under a bundler it is the build mode, evaluated when the artifact is
  produced. A plain `default` is the thing `devDefault` exists to prevent — use it only for values
  that are genuinely correct in production too.
- **Never print a secret value.** Key names, lengths and presence only.
- **Commit nothing.** Write files into the working tree and leave them unstaged. Review is
  `git diff`.
- **Never guess `class`.** Ask, or refuse. See step 3.

## Steps

### 1. Establish the target and refuse early

Confirm the repo is clean enough to review a diff (`git status --short`); if it is dirty, say so and
let the user decide. Identify the framework from `package.json`.

**Supported: Vite (Vue/React) and Nuxt.** Anything else — refuse, naming what was found. The schema
is portable but the assertion glue is not, and improvised glue in a repo you do not own is worse
than no skill.

### 2. Audit — gather evidence, do not interpret yet

Search for every configuration read. Exclude `node_modules`, `dist`, `.git`, `.output`, `.nuxt` —
recursing into `node_modules` will return millions of matches and hang.

```
process\.env\.[A-Za-z_][A-Za-z0-9_]*
import\.meta\.env\.[A-Za-z_][A-Za-z0-9_]*
```

Record for each key **every** read site, not just the first. Then produce three findings:

- **Silent defaults** — every `|| ''`, `|| ""`, `?? ''`, and empty-string fallback. These are the
  bugs, and they are the reason the audit exists.
- **Dead template keys** — in `.env.example` / `.env.*`, read nowhere in code.
- **Undocumented live keys** — read in code, in no template. Usually the larger number.

Report the counts before going further. In `nuxt-hyrd-chrysus` this was 21 dead and 11 missing; in
`hyrd-widget`, 13 documented against ~60 read.

### 3. Classify

**`scope` is derived from evidence — do not ask.** The read site settles it:

| read site | scope |
|---|---|
| `import.meta.env.*` anywhere, or `process.env` inside `vite.config.*` / `nuxt.config.*` | **build** |
| server, app, or page source | **run-time** |
| `scripts/`, `script/`, `tests/`, `test/`, `mocks/`, `playwright.config.*`, `.agents/` | **tooling** |

A key can hold **more than one scope** — `VITE_BASE_URL` in `hyrd-widget` is read by the client
through `import.meta.env` and by the SSR server through `process.env`. Record both; do not force a
single value.

A prefix that a bundler inlines (`VITE_`, `NEXT_PUBLIC_`, `NUXT_PUBLIC_`) **proves the key is not a
Secret** — the value is compiled into a public artifact whatever its name says. Classify those
`static` automatically, including ones named `..._API_KEY` or `..._SECRET`. Say so in the report,
because it usually surprises people.

**`class` and `required` are not derivable.** Nothing in the code distinguishes a credential from a
URL, or optional from required. For every key not settled by the rule above, ask — batched, one pass,
with a proposed answer and the evidence (read sites, current value's presence and length, template
status) for each.

Both directions are harmful: a Secret misclassified as Static gets a `devDefault` committed for a
credential; a Static misclassified as Secret joins the vault key list and blocks Bring-up.

**If you cannot ask — refuse.** Print the unresolved keys with their evidence and exit non-zero. An
unattended worker that hits a prompt does not slow down, it **hangs**: the terminal stays alive and
the coordinator waits out its full timeout. There is deliberately no `--assume` flag, because the
assumption that would silently leak — Secret treated as Static — is the one a flag would make.

### 4. Emit

Four artifacts. Shapes and rationale in
[references/emitted-artifacts.md](references/emitted-artifacts.md).

1. **The schema** — one declarative table of key descriptors. Plain TypeScript, no new dependency.
2. **The template generator** with a `--check` mode that fails with the diff.
3. **The run-time assertion** — a boot plugin that names **every** missing required key at once, not
   the first.
4. **The build-time assertion and the drift check**, both inside the bundler config hook.

The check runs in the build, not a git hook or a CI step. Every CI that builds catches drift with no
CI file edited, it works in a repo with no PR workflow, and the developer hits it at dev-server
start rather than at review. It **fails with the diff**; it never regenerates silently, because a
build that rewrites a committed file leaves a tree that is right locally and stale in git.

### 5. Verify your own output

The emitted code is not done until it has been run:

- the repo's own typecheck passes
- the generated `--check` passes against the generated template
- the dev server or build starts

Report each as pass or fail. **If something fails, say so plainly** — do not describe the patch as
ready.

### 6. Report

Print: counts from step 2, the classification table, what was emitted, the verification results, and
what is left for the human. Then stop. Nothing is staged, nothing is committed.

## Handoff

`class: 'secret'` keys are the `--key` list `dev-local` consumes. Run this skill first.

## Known limits

- Committed per-environment files (`.env.staging`, `.env.production`) are **reported, not
  collapsed**. Folding three environments into one schema changes deploy behaviour and belongs to
  whoever owns the deploy.
- Dynamic reads (`process.env[name]`) are invisible to the search. Flag any you see; do not pretend
  the audit is exhaustive.
