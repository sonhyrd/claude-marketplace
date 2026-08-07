---
name: translation-sync
description: >
  Syncs local locale files to the hyrd-translation server via the bundled hyrd-trans CLI.
  Use when asked to sync translations, push locales to the translation server, run a translation
  sync, or when a PR's "Check locales/*.json" run is red for want of one.
  Reads .github/hyrd-trans-bot.json, validates the token, diffs each configured language against
  the server in ONE whole-file call, auto-applies ADDs, and batch-confirms UPDATE/DELETE. PR-aware
  gating (default-on) keeps UPDATE/DELETE only for keys this branch actually changed vs its base, so
  a shared server's unmerged keys are never proposed for deletion. After applying changes it
  auto-pushes an empty "chore: trigger translation sync" commit (PR branch only) so the GitHub
  Check locales/* bot re-runs against the now-synced server.
requires:
  cli: hyrd-trans.mjs        # ships next to this SKILL.md in the sss plugin; run with `node` (Node >= 20)
  subcommands:
    - check-auth
    - diff
    - apply
    - diff-all
    - apply-all
    - get                    # optional/diagnostic
  env:
    - HYRD_TRANS_TOKEN      # required — Bearer key, format hyrd_...
    - HYRD_TRANS_BASE_URL   # optional — defaults to https://i18n.paulsjob.ai
safety: >
  DEFAULT IS SAFE. No UPDATE or DELETE is applied without an explicit batch "accept"
  from the developer. ADDs of empty-valued keys are silently skipped.
---

# translation-sync skill

> First-time setup or trouble? See `SETUP.md`.

Orchestrate a full locale-to-server sync using the **bundled `hyrd-trans` CLI** (a dependency-free
Node script shipped beside this `SKILL.md` in the `sss` plugin — no install, no separate server, no
registry auth, nothing to vendor into the repo being synced).

The diff is computed **server-side over the whole file** (`POST /api/translations/sync-diff`):
you pass the path to the entire `{lang}.json` and the server returns only the real changes,
keyed in dot-notation (`namespace.term`). No per-namespace fan-out, no large payloads in the
conversation — this is what makes the sync fast.

**Scope.** One-way **local → server** push only. It **never edits local files** and does **not**
translate or gap-fill keys across languages (it won't copy `en.json` keys into `de.json`). Full
overview → `SETUP.md`.

---

## Output discipline

Narrate ONLY at four points:

1. **Step 5** — print the preview table (this is the sole pre-apply checkpoint).
2. **Step 7** — list pending UPDATE/DELETE and ask the single confirmation prompt.
3. **Step 8** — print the final summary table.
4. **Closing** — print the status line (synced / skipped / error).

Do **NOT** emit per-step "Step N done" status blocks between steps. Do **NOT** paste or narrate
the raw diff JSON or apply JSON at any point. All counts and outcomes are rolled up into the
Step 5 preview and Step 8 summary. Eliminating intermediate prose blocks is the primary way this
skill runs fast — each extra narration turn adds latency with no user-facing value.

---

## The CLI: how to invoke it

The CLI ships **inside this plugin**, not in the repo being synced, so `$CLI` resolves from the
**plugin root**. Resolve it once, at the top of the run:

```sh
CLI=$(
  {
    [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] &&
      printf '%s\n' "$CLAUDE_PLUGIN_ROOT/skills/translation-sync/hyrd-trans.mjs"
    find "$HOME/.claude/plugins/cache" -maxdepth 7 \
      -path '*/sss/*/skills/translation-sync/hyrd-trans.mjs' 2>/dev/null | sort -Vr
    printf '%s\n' "./plugins/sss/skills/translation-sync/hyrd-trans.mjs"
  } | while IFS= read -r c; do [ -f "$c" ] && printf '%s\n' "$c"; done | head -1
)
[ -n "$CLI" ] && CLI="$(cd "$(dirname "$CLI")" && pwd)/hyrd-trans.mjs" ||
  { echo "ERROR: hyrd-trans.mjs not found in the sss plugin. See SETUP.md." >&2; false; }
```

Non-zero exit means no CLI: **STOP** — never substitute a repo-local path, which fails mid-run after
the server has already been contacted. Why each line is written that way → `SETUP.md` › CLI resolution.

Always invoke from the **repo root of the repo being synced** (the default cwd). The CLI reads
`HYRD_TRANS_TOKEN` **fresh on every call** (a new process per invocation), so — unlike the old MCP —
the token does **not** have to be present when Claude Code launched.

### Getting the token — resolve `$RUN` too

The token is leased from the agent-native vault, not exported by hand. Prefix **every** `node $CLI`
call in this skill with `$RUN`:

```sh
RUN="agent-native vault exec --app dispatch-paulsjob --key HYRD_TRANS_TOKEN --"

$RUN node $CLI check-auth
```

`dispatch-paulsjob` is the default. If `config.vaultApp` (Step 1) is set, use that instead.

The wrapper passes stdin through and returns the CLI's exit code unchanged, so the contract below is
unaffected. Before the first call, check `command -v agent-native`. If it is missing, STOP — this
skill does not install it, and never asks for a pasted token:

> `ERROR: agent-native is not on PATH, so the translation token cannot be leased. See SETUP.md.`

**Output contract** (branch on these):

| Exit | Meaning | Where |
|---|---|---|
| `0` | success | clean JSON on **stdout** — `JSON.parse` it |
| `1` | usage/validation error (missing token, bad flag, unreadable file) | `{error}` on stderr |
| `2` | `401 Unauthorized` (bad/missing/inactive token) | `{error,status:401}` on stderr |
| `3` | other HTTP error (4xx/5xx) | `{error,status}` on stderr |

Subcommands (single-language):
- `node $CLI check-auth`
- `node $CLI get   --project <p> --language <lang> [--scope <s>] [--sub-project <sp>]`
- `node $CLI diff  --project <p> --language <lang> --local-path <file> [--scope <s>] [--sub-project <sp>] [--no-gate] [--base-ref <ref>]`
- `printf '%s' '<json>' | node $CLI apply --project <p> --language <lang> [--sub-project <sp>] [--dry-run]`
  where `<json>` is `{"adds":{…},"updates":{…},"deletes":[…]}` (any subset). Keys are dot-notation
  (`namespace.term`); omit `--scope` for the whole-file flow.

Subcommands (batch — all languages in one process, concurrent HTTP/PUT calls):
- `node $CLI diff-all --project <p> --languages de,en,id --locales-dir <dir> [--scope <s>] [--exclude a,b] [--sub-project <sp>] [--no-gate] [--base-ref <ref>]`
  Returns ONE JSON object keyed by language; each value is the existing `diff` result shape **plus**
  `ok: true`, OR `{ ok: false, error, status? }` if that language failed. Exit 0 whenever the
  batch dispatched (per-language failures are in the JSON, not the exit code). Each language's
  `gate.warning` (when present) is also printed to stderr prefixed `[<lang>]`.
- `printf '%s' '<keyed-json>' | node $CLI apply-all --project <p> [--sub-project <sp>] [--dry-run]`
  where `<keyed-json>` is `{"de":{"adds":{…},"updates":{…},"deletes":[…]},"en":{…}}`. Returns ONE
  JSON object keyed by language; each value is the existing `apply` result shape **plus** `ok: true`,
  OR `{ ok: false, error, status? }`. Exit 0 whenever the batch dispatched. Usage errors (no/malformed
  stdin) → exit 1.

The `diff`/`apply` single-language commands remain fully supported and are still used by the GitHub
PR-check bot and CI — `diff-all`/`apply-all` are additions, not replacements.

---

## Step 0 — Validate the token FIRST (fail fast)

Run `$RUN node $CLI check-auth` before anything else.

- **On exit 0** parse stdout `{ ok: true, keyName, keyId }` and print:
  `Token OK — authenticated as key "{keyName}".`
- **On exit 2 (`401`)** STOP immediately and report (do not continue to diff/apply):

  > `ERROR: the vault's token is invalid/inactive (the server rejected the key).`
  > Fix: issue an active `hyrd_…` key, then `agent-native vault add HYRD_TRANS_TOKEN --app
  > dispatch-paulsjob` to replace the stored value, and re-run — the CLI reads it fresh each call,
  > **no Claude Code restart is needed**.
- **On exit `≥ 64`** the vault wrapper failed and the CLI never ran (stderr says why). STOP.

**Why this step exists:** reads (`GET /api/translations/json`) are unauthenticated on the server,
so a bad token sails through every read/diff and only fails at the final write. `check-auth` (and
the authenticated diff) surface the problem up front instead.

---

## Step 1 — Locate config

Read `.github/hyrd-trans-bot.json` from the repo root. Extract:

| Field | Type | Notes |
|---|---|---|
| `languages` | `string[]` | Required. Language codes to sync (e.g. `["de","en","id"]`). |
| `projectName` | `string` | Required. Passed to every CLI call. MUST match a project on the server. |
| `localesDir` | `string` | Optional. Directory containing `{lang}.json` files. |
| `subProjectName` | `string` | Optional. Sub-project discriminator; omit if absent. |
| `path` | `string` | Optional. **Owned namespace** (single). Scopes the sync to keys under `{path}.` so a repo that owns one namespace inside a SHARED project never proposes deleting sibling namespaces. Omit it when this repo owns the whole project. |
| `exclude` | `string[]` | Optional. **Disowned namespaces** (the inverse of `path`). Top-level namespaces this repo does NOT own but that live in the same SHARED project — typically maintained by a sibling repo on the same server (e.g. `["widget"]`). Their server/local drift is dropped from the diff so it never surfaces as a change. Matching is top-level-namespace only (`widget` drops `widget.*`). Composes with `path` (scope keeps, then exclude removes). The skill passes it as `--exclude {a,b,…}` in Step 4. **The same field is read by the GitHub PR-check bot**, so the `Check locales/*.json` run stays green for disowned namespaces. |
| `gate` | `boolean` | Optional (**default `true`**). PR-aware gating: UPDATE/DELETE survive only for keys THIS branch actually changed vs its merge-base; everything else keeps the upstream (server) value, and ADDs always push. Set `false` to disable (whole-file behavior) — the skill then passes `--no-gate` to the CLI. |
| `vaultApp` | `string` | Optional (**default `dispatch-paulsjob`**). The agent-native app the token is leased from — the `--app` value in `$RUN`. Set it if this repo's token lives in a different connected app. |

> Field rationale (`path`/`exclude`/`gate`) → `SETUP.md` › Config reference.

If the file does not exist, stop and report:
> `ERROR: .github/hyrd-trans-bot.json not found. Create it before running this skill.`

---

## Step 2 — Resolve locale directory + audit files

Determine `effectiveDir`:

1. Use `config.localesDir` if set **and the directory exists**.
2. Else try `i18n/locales`, then `app/locales`, then `locales`.
3. If none found, stop: `ERROR: Could not locate locale directory. Set localesDir in .github/hyrd-trans-bot.json.`

If `config.localesDir` is set but missing on disk, warn and fall back:
> `WARNING: config.localesDir = "{x}" does not exist. Falling back to "{effectiveDir}".`

**File-vs-config audit (N2):** list `*.json` in `effectiveDir`. For any file whose base name is
NOT in `config.languages`:
> `WARNING: Found {file} in {effectiveDir} but "{lang}" is not in config.languages. SKIPPING.`

Do not process skipped languages in any later step.

---

## Step 3 — Understand the file shape (no scope guessing)

Read one in-config `{lang}.json` and note its shape:

- **Nested** `{ namespace: { term: value } }` (the common case — e.g. this repo has ~114
  namespaces). The server diff flattens this to `namespace.term` keys automatically.
- **Flat** `{ key: value }`. Also fine — keys are treated as-is (bare keys map to the `default`
  namespace server-side).

Pass the whole file; the server diffs every namespace in one call. You only "pick a scope" when
`config.path` is set (Step 1) — a scoped repo's file is itself single-namespace (e.g.
`{ "widget": { … } }`, which flattens to `widget.*`), and Step 4's `--scope {config.path}` filters
the diff to exactly that prefix. Un-scoped repos diff the whole file.

Do **not** read the whole 500KB file into the conversation — a `Read` of the first ~20 lines is
enough to see the shape. The diff in Step 4 sends only the file PATH, not its contents.

---

## Step 4 — Diff all languages (one concurrent call)

Run **`diff-all`** once for all in-config languages. Pass the file PATH via `--locales-dir` (NOT
file contents — that's what keeps large files out of the context window):

```sh
$RUN node $CLI diff-all \
  --project "{config.projectName}" \
  --languages "{config.languages.join(',')}" \
  --locales-dir "{effectiveDir}"
  # add --scope "{config.path}"                     only if config.path is set (scoped repo)
  # add --exclude "{config.exclude.join(',')}"      only if config.exclude is set (drop disowned namespaces)
  # add --sub-project "{config.subProjectName}"     only if it is set
  # add --no-gate                                   only if config.gate === false (disable PR gating)
  # add --base-ref "{ref}"                          only in CI, to pin the PR's target branch/SHA
```

The CLI derives each language's local path as `{locales-dir}/{lang}.json` and runs all diffs
concurrently. stdout is ONE JSON object keyed by language:

```json
{
  "de": { "ok": true,  "adds": [...], "updates": [...], "deletes": [...],
          "emptyValued": [...], "unchanged": N, "localKeyCount": N, "serverKeyCount": N, "gate": {...} },
  "en": { "ok": true,  ... },
  "id": { "ok": false, "error": "…", "status": 401 }
}
```

Parse this once and carry the keyed object through Steps 5–7. Do NOT emit per-language analysis
prose — consume the JSON silently and proceed directly to Step 5.

**PR-aware gating (default-ON).** Keeps **UPDATE/DELETE only for keys this branch actually
changed/removed** vs its merge-base; ADDs always push (shared-server rationale → `SETUP.md`). The
result carries a `gate` object:
`{ mode: "gated" | "off" | "failed-safe", baseRef, baseSha, gitRoot, changedKeyCount, removedKeyCount, droppedUpdates, droppedDeletes, warning? }`.
- `--no-gate` (or `config.gate === false`) → `mode: "off"`: the un-gated whole-file diff (use when
  this repo owns the whole project on a non-shared server).
- `--base-ref <ref>` overrides auto-detection (CI passes the PR target SHA/branch).
- **Fail-safe:** when the base can't be resolved (no git repo, shallow CI clone missing the base,
  detached HEAD, no default branch), the CLI returns **ADDs only**, drops all updates/deletes, sets
  `mode: "failed-safe"`, and prints `gate.warning` to **stderr** prefixed `[<lang>]` (still exit 0).
  Never a silent whole-file delete.

**Scoped repos (`config.path` set):** the CLI filters each language's JSON to keys under
`{config.path}.` before returning, and `localKeyCount`/`serverKeyCount` are the **scoped** counts.
Sibling namespaces never appear as `deletes`. Scope and gate compose (both are intersections).
Without `--scope` the result is the full whole-file diff (still PR-gated unless `--no-gate`).

Keys are **dot-notation** (`namespace.term`). Adds carry `value`; updates carry
`oldValue`/`newValue`; deletes carry `oldValue`.

If a language entry has `ok: false`, carry its error into the Step 5 preview. Exit `2` on ALL
languages means the token went bad — stop and re-run Step 0's guidance.

> **Do not** read the locale file into the conversation. Always use `--locales-dir` — that's what
> keeps large files out of the context window (the CLI reads + uploads each file for you).

---

## Step 5 — Preview (dry-run — always first)

Print a per-language summary BEFORE applying anything:

```
Language  Adds (auto)  Updates  Deletes  Suppressed (gate)  Empty-valued (skipped)  Unchanged
--------  -----------  -------  -------  -----------------  ----------------------  ---------
en        20           0        0        u:1 d:93           0                       8434
de        18           1        0        u:0 d:93           0                       8410
```

- **Adds:** applied automatically (Step 6).
- **Updates / Deletes:** require batch confirmation (Step 7). These are the post-gate counts —
  only changes THIS branch actually made.
- **Suppressed (gate):** `gate.droppedUpdates` (`u:`) and `gate.droppedDeletes` (`d:`) — upstream
  changes kept because this branch didn't touch them. A high suppressed count on a shared server is
  normal and is exactly what prevents clobbering other branches' unmerged keys.
- **Gate mode:** if `gate.mode === "off"` (`--no-gate`/`config.gate === false`) the table shows the
  un-gated whole-file counts. If `gate.mode === "failed-safe"`, render `gate.warning` LOUDLY (the
  base couldn't be resolved, so updates/deletes were suppressed wholesale — re-run with `--base-ref`
  or from a complete clone):

  ```
  ===========================================================================
  WARNING  {lang}.json — PR GATE DID NOT RUN (base not resolved)
    All UPDATE/DELETE suppressed (adds-only). {gate.reason}
    Fix: run from a full git clone, or pass --base-ref <PR target branch/SHA>.
  ===========================================================================
  ```
- **Failed language (`ok: false`):** include the language in the table with an `ERROR` row showing
  its `error` message (and `status` if present). It is excluded from Steps 6–7.
- **Empty-valued:** local value is `""` — cannot be stored (server treats `""` as delete);
  excluded silently.
- List individual **updates** and **deletes** (these are gated and usually few). For **adds**,
  list them only if `≤ 50`; otherwise show the count and a few samples (a first-time import can be
  thousands — those are better seeded via the import UI; see `SETUP.md` › Known limitations).

### M2 mass-delete guard (warning only)
Because the diff is now whole-file, `deletes` are **real** (keys on the server that the local file
no longer has). For each language where `deletes.length > 0` AND
(`localKeyCount === 0` OR `localKeyCount < serverKeyCount * 0.5`), print a LOUD warning:

```
===========================================================================
WARNING  {lang}.json — POSSIBLE INCOMPLETE/EMPTY FILE
  Local has {localKeyCount} keys  |  Server has {serverKeyCount} keys
  Accepting will DELETE {deletes.length} keys. Reject unless you intend this.
===========================================================================
```

This never auto-decides; the developer must still explicitly accept the batch in Step 7.

> **Interaction with PR gating.** With gating default-on, surviving `deletes` are already
> branch-real (keys this branch actually removed), so the M2 ratio guard is effectively dormant —
> the spurious mass-delete it was built for is suppressed upstream by the gate. M2 remains a useful
> backstop for the truly-empty-file case (`localKeyCount === 0`) and for `--no-gate` runs.

---

## Step 6 — Auto-apply ADDs

Build a keyed payload containing every language that has `adds.length > 0`. For each such language,
build `{ "<namespace.term>": "<value>" }` from the diff's `adds` (dot-notation keys), then pipe
the whole keyed object to **`apply-all`** in ONE call (no `--scope` — dot-notation keys route
themselves server-side). This holds for **scoped** repos too: the scoped diff already emits
`{path}.term` keys, which the server routes to the right namespace — do **not** pass `--scope` to
`apply-all`:

```sh
printf '%s' '{"de":{"adds":{"namespace.term":"value",…}},"en":{"adds":{…}}}' \
  | $RUN node $CLI apply-all --project "{config.projectName}"
  # add --sub-project "{config.subProjectName}" only if it is set
```

Parse the stdout keyed result. Each language's entry is the existing `apply` result shape plus
`ok: true` (or `ok: false` on failure). Languages with `adds.length === 0` are simply omitted from
the payload — do not include them. Do not emit per-language "auto-applied" or "no adds" prose —
all counts roll up into Step 8.

> For a very large first import (hundreds+), apply in chunks of ~500 keys per call to stay within
> request limits, or use the import UI instead (see `SETUP.md` › Known limitations).

---

## Step 7 — Batch-confirm UPDATE/DELETE

For each language with `updates.length > 0` OR `deletes.length > 0`, re-show the M2 warning (if
any), list every change:

```
[de] Pending changes requiring confirmation:

  UPDATES (1):
    settings.title:  "Einstellung"  ->  "Einstellungen"

  DELETES (2):
    board.old:       "Alt"       ->  (remove)
    nav.deprecated:  "Veraltet"  ->  (remove)
```

Ask ONE question (a single prompt that still preserves per-language choice — no extra round-trips):
`Apply the listed UPDATE/DELETE batches? Reply "yes" (all listed languages), "no" (none), or name
the languages to SKIP (e.g. "skip en id").`

- **On yes:** every listed language is accepted.
- **On "skip <langs>":** every listed language EXCEPT the named ones is accepted; each skipped
  language is marked rejected in Step 8.
- **On no / anything else:** all listed languages are rejected (Step 8 shows `rejected`).

Build a keyed payload carrying `{updates:{…}, deletes:[…]}` for ONLY the accepted languages and
apply via ONE `apply-all` call (no `--scope`):
```sh
printf '%s' '{"de":{"updates":{"key":"newVal",…},"deletes":["key",…]},"en":{…}}' \
  | $RUN node $CLI apply-all --project "{config.projectName}"
  # add --sub-project "{config.subProjectName}" only if it is set
```
Retain the per-language result for Step 8.

Within a single language the UPDATE+DELETE batch is still all-or-nothing (no per-item gating); the
developer may accept some languages and skip others in this one prompt.

> Tip: run with `--dry-run` first to inspect the exact would-send payload (the CLI returns it under
> `server.wouldSend` without calling PUT).

---

## Step 8 — Final summary

```
=== Translation Sync Summary ===

Language  Adds applied  Updates applied  Deletes applied  Skipped (reason)
--------  ------------  ---------------  ---------------  ----------------
en        20            0                0                —
de        20            1                0 (rejected)     —
id        —             —                —                out-of-config lang
```

Build this table from the `apply-all` results (Steps 6 and 7). Languages that errored in Step 4
(`ok: false`) show `—` with reason `diff error: {error}`.

Remind the developer: the webhook/import-UI fallback (`apply.post.ts`, `import.vue`) is unaffected
and still works. Translation history is recorded server-side for all applied changes.

---

## Step 9 — Re-trigger the PR check (auto empty commit + push)

The GitHub PR-check bot (`Check locales/{lang}.json`) compares your locale files against the
**deployed/live** server and only re-runs **on a new push**. Steps 6–7 just updated the server, but
the existing PR check still reflects the **pre-sync** state and stays red until the branch is pushed
again. So, when this run actually applied changes, finish by pushing an empty commit to re-run it.

> **Clean working tree is expected.** When the environment auto-commits locale edits (e.g. a hook
> that commits and stages changes), the working tree will be clean by the time Step 9 runs. This is
> normal — do NOT investigate a clean tree, run `git log` archaeology, or question why no unstaged
> changes are present. The three guards below are sufficient; act on their output only.

Run the following bash block in one shot to evaluate all three guards and print a single decision:

```sh
BRANCH=$(git rev-parse --abbrev-ref HEAD)
DEFAULT=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')
APPLIED_COUNT=<sum of adds+updates+deletes from Step 8>   # substitute the real number

if [ "$APPLIED_COUNT" -le 0 ]; then
  echo "SKIP: No changes applied this run — skipping PR-check re-trigger."
elif [ "$BRANCH" = "HEAD" ] || [ -z "$BRANCH" ] || [ "$BRANCH" = "${DEFAULT:-development}" ] || [ "$BRANCH" = "main" ]; then
  echo "SKIP: On default/detached branch — skipping PR-check re-trigger (no PR to re-run)."
elif ! git diff --cached --quiet; then
  echo "SKIP: Staged changes present — not folding them into a trigger commit. Commit/stash them and push to re-trigger."
else
  echo "PUSH"
fi
```

- If the output line starts with `SKIP:` — report the reason verbatim. Stop. No further git
  investigation.
- If the output is `PUSH` — run:
  ```sh
  git commit --allow-empty -m "chore: trigger translation sync"
  git push 2>/dev/null || git push -u origin HEAD
  ```
  With a clean index, `--allow-empty` creates a no-op commit that leaves the working tree and your
  local files untouched. Report:
  `Re-triggered PR check: pushed empty commit {short-sha} to {BRANCH} — the Check locales/* run will re-evaluate against the now-synced server.`

If the push fails (no network / protected branch / no upstream remote), report the error **and** the
local empty commit's SHA so the developer can push manually. Never edit local files in this step.

---

## Safety contract

| Action | Behaviour |
|---|---|
| Bad/missing token | Step 0 STOPS the run before any change. |
| ADD (local key absent on server) | Auto-applied via `apply-all` — no confirmation. Always pushed (left wins), gate or no gate. |
| UPDATE (key in both, value changed) | Requires explicit batch "yes". **PR gate (default-on): suppressed unless this branch changed the key vs base.** |
| DELETE (server key absent locally) | Requires explicit batch "yes" (+ M2 guard). **PR gate (default-on): suppressed unless this branch removed the key vs base — so a shared server's unmerged keys are never proposed for deletion.** |
| PR gate base unresolvable | Fail-safe: ADDs only, all UPDATE/DELETE suppressed, `gate.warning` on stderr prefixed `[<lang>]` (exit 0). |
| Empty-valued key (local `""`) | Always skipped — never sent. |
| Local locale files | Never modified — this skill only reads them and writes to the server. |
| Re-trigger commit (Step 9) | Empty commit (`--allow-empty`) + push, made **automatically** only when changes were applied this run, the branch is a non-default PR branch, and the index is clean. No local files staged/modified; skipped otherwise. |
| Out-of-config / missing locale file | Warned and skipped (`diff-all` returns `ok: false` for that language). |
| Rejected batch | Entire UPDATE+DELETE set for that language is skipped. |

**No UPDATE or DELETE is applied unless the developer explicitly types "yes".**

---

## More — onboarding, troubleshooting, limitations

Troubleshooting table, known limitations (M1 empty-string, large first-time import), and full
onboarding → `SETUP.md`.
