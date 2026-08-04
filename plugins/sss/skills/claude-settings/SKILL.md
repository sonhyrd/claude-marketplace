---
name: claude-settings
description: >-
  Sync Claude Code settings across machines from a repo-tracked baseline. Applies the shared
  regions of ~/.claude/settings.json (statusLine, skillOverrides, permissions, attribution)
  and deploys the native statusline script, or captures this machine's current values back
  into the baseline. Use when setting up Claude Code on a new machine or VPS, when the user
  says their settings/statusline/skill overrides are out of sync between machines, when they
  want to save or restore their Claude Code configuration, or when adding a segment to the
  statusline, or when a new machine is missing plugins that another machine has. Also
  installs the tracked plugin roster (external marketplaces and their plugins) via the
  claude plugin CLI. Never touches env or hooks — those are machine-local.
---

# Claude settings sync

Keeps the portable parts of `~/.claude/settings.json` in version control and deploys them to
each machine. Two directions: **apply** (baseline → machine) and **capture** (machine → baseline).

## What syncs and what does not

| Region | Synced | Why |
|---|---|---|
| `statusLine` | Yes | Path is `~`-relative, so one string works on macOS and Linux |
| `skillOverrides` | Yes | Pure preference, no paths. ~50 hand-tuned entries |
| `permissions` | Yes | `defaultMode` and `deny` list are portable |
| `attribution`, `includeCoAuthoredBy` | Yes | Plain booleans/strings |
| `env` | **No** | Machine-specific (`PYENV_VERSION`, `CLAUDE_HOST_LABEL`) |
| `hooks` | **No** | Contains absolute paths (`~/.orca/agent-hooks/`, `~/.claude/hooks/`) |
| `enabledPlugins`, `extraKnownMarketplaces` | **Partly** | Non-directory sources sync via `baseline/plugins.json`; directory sources carry a per-machine path and do not |

Writing `env` or `hooks` from a shared baseline would break the machine it lands on. Do not
add them without changing the paths to be `$HOME`-relative first — that is a separate change.

## The plugin roster

Plugins live in a **separate baseline file**, `baseline/plugins.json`, not in
`settings.base.json` — because they are not applied by merging JSON. See below.

The portable/local split is computed, not hand-maintained:

- **Portable** — every marketplace whose `source.source` is not `directory`, plus every
  enabled plugin belonging to one. A `github` source (`{"repo": "cloudflare/skills"}`) is
  identical on every machine. `claude-plugins-official` ships with Claude Code and never
  appears in `extraKnownMarketplaces` at all, so its plugins have no marketplace entry to
  filter on and are portable by definition.
- **Machine-local** — directory sources and their plugins. This repo is added as a directory
  source pointing at the working tree, so its path (`/home/orca/work/claude-marketplace` on
  one box, something else on another) is exactly what cannot be shared. `sss`, `matt` and
  `e2e` are therefore still a manual `marketplace add` on a new machine — one command.

**Apply drives the `claude plugin` CLI, it does not merge these keys into `settings.json`.**
That distinction is the whole reason this is a second file. Hand-writing
`extraKnownMarketplaces` leaves no clone on disk, so the marketplace is registered but
resolves to nothing; `claude plugin marketplace add` clones it, validates the manifest, and
writes both settings keys itself. Both CLI commands are idempotent, so apply is safe to
re-run.

`references/external-plugins.md` remains the human-readable roster — what each plugin is for,
and the rationale for the ones whose packaging is a decision rather than an accident.

## Why the statusline script is copied, not referenced

A plugin **cannot** ship a main `statusLine`. Plugin `settings.json` supports only the `agent`
and `subagentStatusLine` keys. And `${CLAUDE_PLUGIN_ROOT}` points at a versioned cache path
(`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`) that the docs describe as
ephemeral — pointing settings at it breaks on every plugin update.

So the script is copied to a stable `~/.claude/statusline-native.sh` and settings point there.
The per-machine `settings.json` write is unavoidable; this skill automates it.

## Apply — baseline to this machine

1. **Check dependencies.** The statusline needs `jq`, `bash`, and `git`. Run
   `command -v jq bash git`. If any is missing, stop and tell the user the install command
   (`brew install jq` / `apt install jq`). Do not write settings with a broken dependency.

2. **Report drift before overwriting.** If `~/.claude/statusline-native.sh` already exists,
   `diff` it against `scripts/statusline.sh` and show the user any difference. A local edit
   on this machine is real work — confirm before replacing it.

3. **Deploy the script.**
   ```bash
   cp "$SKILL_DIR/scripts/statusline.sh" ~/.claude/statusline-native.sh
   chmod +x ~/.claude/statusline-native.sh
   ```

4. **Merge the baseline** into `~/.claude/settings.json`, preserving everything else:
   ```bash
   jq -s '.[0] * .[1]' ~/.claude/settings.json "$SKILL_DIR/baseline/settings.base.json" \
     > /tmp/settings.merged.json
   ```
   Validate the result parses and still contains `env`, `hooks`, and `enabledPlugins` before
   moving it into place. `jq -s '.[0] * .[1]'` deep-merges, so unlisted regions survive.

5. **Install the plugin roster.** Preview first — it clones third-party repos, and
   `i-have-adhd` ships a `SessionStart` hook:
   ```bash
   DRY_RUN=1 "$SKILL_DIR/scripts/apply-plugins.sh" "$SKILL_DIR/baseline/plugins.json"
   ```
   Show the user what is missing, confirm, then run it without `DRY_RUN`. Lines starting `=`
   are already present and will be skipped. Then add this repo by hand — it is the one
   marketplace the roster cannot carry:
   ```bash
   claude plugin marketplace add /path/to/claude-marketplace
   claude plugin install sss@sss-marketplace matt@sss-marketplace e2e@sss-marketplace
   ```

6. **Report the baseline's commit** so the user knows what they deployed:
   `git -C "$SKILL_DIR" log -1 --format='%h %s' -- baseline scripts`

7. Tell the user the statusline refreshes on the next assistant message, and that **plugins
   need a Claude Code restart** — a newly installed plugin's skills do not appear in the
   session that installed them.

## Capture — this machine to baseline

Pull the synced regions out of the live settings and write them back to `baseline/`:

```bash
jq '{statusLine, skillOverrides, permissions, attribution, includeCoAuthoredBy}
    | .statusLine.command = "~/.claude/statusline-native.sh"' \
  ~/.claude/settings.json > "$SKILL_DIR/baseline/settings.base.json"
```

The `.statusLine.command` rewrite is required — the live file holds an absolute path
(`/Users/<you>/.claude/...`) that is wrong on every other machine.

If the user changed `~/.claude/statusline-native.sh` directly, copy it back to
`scripts/statusline.sh` too, so the repo is the source of truth again.

Then capture the plugin roster, which computes the portable/local split itself:

```bash
"$SKILL_DIR/scripts/capture-plugins.sh" "$SKILL_DIR/baseline/plugins.json"
```

It prints what it captured. Check the list for anything that was an evaluation leftover —
capture records what is *enabled*, and an enabled-but-unwanted plugin propagates to every
machine on the next apply. Disabling it and re-capturing is the fix, not editing the JSON.

**`skillOverrides` is inert for plugin-sourced skills.** Capture takes the key verbatim from
live settings, so an override naming a plugin skill will be picked up even though it does
nothing. Check new entries against the plugin list before committing: pin a plugin skill with
`disable-model-invocation: true` in its frontmatter instead.

Then remind them: **the VPS only sees what is committed and pushed.** On this laptop the
marketplace is a directory source pointed at the working tree, so uncommitted edits are live
locally and invisible everywhere else.

## Statusline segments

`scripts/statusline.sh` reads only Claude Code's stdin JSON. No API calls, no caches, no
transcript parsing.

```
🖥 vps-1 | 🤖 Opus 5 | 🧠 medium | 🌿 main ✓ | ⚡ 12.5k · 6% | 💰 $0.00 | ⏱️ 2% | 🕐 1m31s
```

| Segment | Source field |
|---|---|
| 🖥 host | `$CLAUDE_HOST_LABEL` env var — **hidden unless set** |
| 🤖 model | `.model.display_name` |
| 🧠 effort | `.effort.level`, falls back to `default` |
| 🌿 git | `git -C .workspace.current_dir`, `✓` clean / `*` dirty |
| ⚡ context | `.context_window.total_input_tokens`, `.used_percentage` |
| 💰 cost | `.cost.total_cost_usd` |
| ⏱️ 5h limit | `.rate_limits.five_hour.used_percentage` |
| 🕐 elapsed | `.cost.total_duration_ms` as wall-clock |

Every segment is omitted when its field is absent, so a missing field degrades to a shorter
bar rather than an error. If `jq` is unavailable the script prints `⚠ jq missing` instead of
rendering empty, which would otherwise look like a working-but-blank statusline.

### Labelling a machine

The 🖥 segment only appears when `CLAUDE_HOST_LABEL` is set. Add it to *that machine's*
`~/.claude/settings.json` by hand — it is machine-local and this skill will not write it:

```json
{ "env": { "CLAUDE_HOST_LABEL": "vps-1" } }
```

Leave it unset on your primary machine so the bar stays short there.

### Adding a segment

Edit `scripts/statusline.sh`, append to the `seg=()` array in display order, then run
**capture** so the repo copy and the deployed copy match. Available fields are documented at
<https://docs.claude.com/en/docs/claude-code/statusline>. Note `rate_limits.*.resets_at` is
unix epoch seconds — use `date -r` on macOS but `date -d @` on Linux, so prefer fields that
need no date math if the script must stay portable.
