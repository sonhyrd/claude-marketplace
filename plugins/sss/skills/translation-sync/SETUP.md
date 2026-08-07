# translation-sync — Setup & reference

This file is a sibling of SKILL.md, read on demand (first-time setup or on error). It is never required to complete a normal sync.

---

## Overview & scope

Orchestrate a full locale-to-server sync using the **bundled `hyrd-trans` CLI** (a dependency-free
Node script that ships beside this `SKILL.md` inside the `sss` plugin — no install, no separate
server, no registry auth, and nothing to vendor into the repo being synced).

The diff is computed **server-side over the whole file** (`POST /api/translations/sync-diff`):
you pass the path to the entire `{lang}.json` and the server returns only the real changes,
keyed in dot-notation (`namespace.term`). No per-namespace fan-out, no large payloads in the
conversation — this is what makes the sync fast.

**Scope — read this first.** This skill is a one-way **local → server** push. It reads your
`{lang}.json` files and applies their changes to the translation server. It **never edits your
local locale files**, and it does **not** translate or fill keys across languages (e.g. it will not
copy keys that exist in `en.json` into `de.json`). The only thing it does is: diff each local file
against the server and push the differences. If you want cross-language gap-filling, that is a
separate task — do not expect this skill to do it.

---

## First-time setup

Before the first sync in a repo:

1. **Node ≥20 on PATH.** The CLI is a dependency-free Node script run with `node`. Verify with
   `node --version` (≥ v20; the test suite is verified on v24.15.0).
2. **Create `.github/hyrd-trans-bot.json`** at the repo root with at least `languages` and
   `projectName`. See the Step 1 config-field table in `SKILL.md` for every field
   (`languages`, `projectName`, `localesDir?`, `subProjectName?`, `path?`, `exclude?`, `gate?`)
   and the `path`/`exclude`/`gate` rationale below.
3. **`agent-native` on PATH.** The token is leased from the vault (app `dispatch-paulsjob`, key
   `HYRD_TRANS_TOKEN`), not exported by hand. Verify with `command -v agent-native`; **this skill
   does not install it.** If the key isn't in the vault yet, seed it once (non-echoing prompt):
   `agent-native vault add HYRD_TRANS_TOKEN "hyrd-translation sync bearer" --app dispatch-paulsjob`.
   To lease from a different app, set `"vaultApp": "<name>"` in `.github/hyrd-trans-bot.json`
   (`agent-native vault list` with no `--app` exits `66` naming the connected apps).
4. **Verify** with `$RUN node $CLI check-auth` (resolve `$CLI` from the plugin root and `$RUN`
   per `SKILL.md` › The CLI).
   Exit 0 → `{ ok: true, keyName, keyId }` means you are ready to run the skill.

---

## CLI resolution

`SKILL.md` › The CLI resolves `$CLI` from the **plugin root**, never from the repo being synced —
that repo does not carry the CLI. Three candidates, in preference order, first hit wins:

1. `$CLAUDE_PLUGIN_ROOT/skills/translation-sync/hyrd-trans.mjs` — authoritative when Claude Code
   exports it.
2. `~/.claude/plugins/cache/*/sss/*/skills/translation-sync/hyrd-trans.mjs` — a normal plugin
   install. Sorted with `sort -Vr`, a **version** sort. Plain `sort -r` is lexicographic and would
   pick `1.9.0` over `1.10.0`, silently running a stale CLI against the live server.
3. `./plugins/sss/skills/translation-sync/hyrd-trans.mjs` — the claude-marketplace checkout,
   for dogfooding this repo.

Two details that look like style and are not:

- **`find`, not a glob.** An unmatched glob is a hard error in `zsh`, and the block has to survive
  whichever shell the session is using.
- **The result is absolutised** (`cd "$(dirname …)" && pwd`). Candidate 3 is cwd-relative, so
  without this a later `cd` — into the repo being synced, say — silently invalidates `$CLI`.

Failure is a **stop**, not a fallback: the block writes to stderr and exits non-zero. Substituting a
repo-local path instead would fail as `Cannot find module` several steps into a run that has already
contacted the server. If it fires, install the `sss` plugin.

---

## Config reference

> **Scope (`path`).** If `config.path` is set, this repo owns a single namespace inside a larger,
> shared server project (e.g. a widget owning `widget.*` in a project that also holds `settings.*`,
> `board.*`, … for other apps). Pass it as `--scope {config.path}` in Step 4 — the whole-file diff is
> then filtered client-side to that namespace, so sibling namespaces are never surfaced as DELETEs.
> If `config.path` is **absent**, this repo owns the whole project and the diff stays whole-file
> (every namespace). Either way the server request is identical; scoping is a client-side filter.

> **Exclude (`exclude`).** The inverse of `path`, for the common SHARED-project case where this repo
> owns *almost* everything but a sibling repo maintains one namespace on the same server (e.g. a nuxt
> app owns `settings.*`, `board.*`, … but the **widget** repo owns `widget.*`). Set
> `"exclude": ["widget"]` and Step 4 passes `--exclude widget` — the whole-file diff drops every key
> under those namespaces client-side, so the widget repo's unmerged drift is never proposed for
> sync/delete here. The **PR-check bot reads the same field**, so `Check locales/{lang}.json` stops
> reporting "i18n Changes found" for the disowned namespace. `path` and `exclude` compose (scope keeps,
> then exclude removes); use `path` when you own ONE namespace, `exclude` when you own all-but-a-few.

### PR gating

**PR-aware gating (default-ON).** The server is **shared** across branches, so a whole-file diff
surfaces every not-yet-merged upstream key as a spurious DELETE and every upstream reword as a
spurious UPDATE-to-revert. Gating fixes this client-side: the CLI compares your locale file against
its version at the **merge-base with the auto-detected default branch** (`origin/HEAD` →
`development`/`main`) and keeps **UPDATE/DELETE only for keys this branch actually changed/removed**;
ADDs always push (local-only key → left wins).

---

## Token remediation

When `check-auth` exits `2` (`401 Unauthorized`), apply these fixes, in order:

1. Confirm a `hyrd_…` key was issued and is **active** (`/user/settings` on the server).
2. Replace the stored value: `agent-native vault add HYRD_TRANS_TOKEN "…" --app dispatch-paulsjob`
   (adding an existing key updates it) and re-run. The CLI reads the token fresh each call — **no
   Claude Code restart is needed**.

An exit `≥ 64` means the vault wrapper failed before the CLI ran; stderr says why.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `check-auth` exits `2` (`401 Unauthorized`) | The vault's stored token is invalid/inactive | Confirm the key is active, then replace it with `agent-native vault add` and re-run. No restart needed — the CLI reads the token fresh each call. |
| `check-auth` exits `1` | No `HYRD_TRANS_TOKEN` reached the CLI — the key isn't in the vault | `agent-native vault list --app dispatch-paulsjob`; seed it with `vault add`. |
| `agent-native: command not found` | The vault CLI isn't on PATH | Stop — this skill does not install it. Do not substitute a hand-exported token. |
| Reads work but writes 401 | Expected: `GET /api/translations/json` is unauthenticated; only writes (and `check-auth`) validate the token | Fix the token per Step 0 — the read "working" never meant the token was valid. |
| `get` "nested (multi-context) response" | You called the legacy single-scope read without a scope | Use `diff` (whole-file) for sync; `get` is diagnostic only. |
| Skill computes "missing keys" across languages / edits local files | You are on an OLD skill version that had a cross-language auto-fill step | This skill is local→server only. Reinstall the latest skill (it has no auto-translate step). |
| Large unexpected DELETE count | Local file is incomplete/empty vs server | M2 guard fires — reject the batch; restore the file first. |
| `node: command not found` / `Cannot find module …/hyrd-trans.mjs` | Node not on PATH, or `$CLI` resolved to nothing because the `sss` plugin is not installed | Ensure Node ≥20 is on PATH, then re-run the `$CLI` resolution block in `SKILL.md` › The CLI. If it prints the `ERROR:` line, install the `sss` plugin (`claude plugin install sss@sss-marketplace`) — the CLI ships with the plugin, not with the repo being synced. |
| Sync feels slow / huge output | You passed file **contents** instead of `--local-path` / `--locales-dir` | Always pass `--locales-dir` (batch) or `--local-path` (single) so the file stays out of the conversation. |
| All languages `ok: false, status: 401` in `diff-all` output | Token went bad mid-run | Re-run Step 0 — `check-auth` will confirm; re-export the token. |

---

## Known limitations

- **M1 — empty-string values can't be stored.** A local value of `""` is treated by the server as
  a delete, so such keys are reported in `emptyValued` and excluded from adds/updates. Use the UI
  to store a genuinely empty string.
- **Large first-time import.** The very first sync of a brand-new project surfaces every key as an
  add (potentially thousands). That response is large and one-time — prefer the import UI for the
  initial seed, then use this skill for incremental changes. If you do apply a large batch via the
  CLI, send it in chunks of ~500 keys; the sync is **idempotent**, so if a chunk fails you can
  simply re-run the skill — the next diff recomputes only what is still missing. (This skill does
  not implement a transactional multi-chunk apply; recovery is "re-run".)
