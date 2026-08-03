---
name: claude-settings
description: >-
  Sync Claude Code settings across machines from a repo-tracked baseline. Applies the shared
  regions of ~/.claude/settings.json (statusLine, skillOverrides, permissions, attribution)
  and deploys the native statusline script, or captures this machine's current values back
  into the baseline. Use when setting up Claude Code on a new machine or VPS, when the user
  says their settings/statusline/skill overrides are out of sync between machines, when they
  want to save or restore their Claude Code configuration, or when adding a segment to the
  statusline. Never touches env, hooks, or enabledPlugins — those are machine-local.
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
| `enabledPlugins` | **No** | Marketplace sources differ per machine (directory vs clone) |

Writing `env` or `hooks` from a shared baseline would break the machine it lands on. Do not
add them without changing the paths to be `$HOME`-relative first — that is a separate change.

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

5. **Report the baseline's commit** so the user knows what they deployed:
   `git -C "$SKILL_DIR" log -1 --format='%h %s' -- baseline scripts`

6. Tell the user the statusline refreshes on the next assistant message.

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
