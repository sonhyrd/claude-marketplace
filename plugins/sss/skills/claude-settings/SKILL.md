---
name: claude-settings
description: >-
  Sync Claude Code settings across machines from a repo-tracked baseline. Applies the shared
  regions of ~/.claude/settings.json (statusLine, skillOverrides, permissions, attribution)
  and deploys the native statusline script, or captures this machine's current values back
  into the baseline. Use when setting up Claude Code on a new machine or VPS, when the user
  says their settings/statusline/skill overrides are out of sync between machines, when they
  want to save or restore their Claude Code configuration, or when adding a segment to the
  statusline, or when a new machine is missing plugins that another machine has, or when
  web-search fails with "No supported browser binary found" on a box with no browser. Also
  installs the tracked plugin roster (external marketplaces and their plugins) via the
  claude plugin CLI. Never touches hooks, and touches exactly one `env` key — the auto-memory
  kill switch; the rest of `env` is machine-local.
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
| `env` | **One key** | `CLAUDE_CODE_DISABLE_AUTO_MEMORY` only — see below. Everything else (`PYENV_VERSION`, `CLAUDE_HOST_LABEL`) is machine-specific |
| `hooks` | **No** | Contains absolute paths (`~/.orca/agent-hooks/`, `~/.claude/hooks/`) |
| `enabledPlugins`, `extraKnownMarketplaces` | **Partly** | Non-directory sources sync via `baseline/plugins.json`; directory sources carry a per-machine path and do not |

Writing `hooks`, or the rest of `env`, from a shared baseline would break the machine it lands
on. Do not add them without changing the paths to be `$HOME`-relative first — that is a
separate change.

### The one `env` key that syncs

`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` turns off Claude Code's automatic memory — the persistent
file-based store under `~/.claude/projects/<project>/memory/` that a session reads at start and
writes to as it goes. It is in the baseline because it is a **preference, not a path**: it names
no directory, no host and no version, so it is exactly as portable as `skillOverrides`, and
memory left on for one machine only is the worst of both worlds — the same user gets recalled
facts on the laptop and none on the VPS.

Two mechanisms are *not* this one, and neither belongs in the baseline:

- `/pause-memory` is session-scoped and lives in the transcript, not in settings. Use it to turn
  memory off for the next hour; use this key to turn it off for good.
- `autoMemoryEnabled` is a global-config key in `~/.claude.json`, a file this skill does not
  manage at all. The env var is the setting this skill can reach.

Because apply is a **deep merge** (`jq -s '.[0] * .[1]'`), landing this key adds it to whatever
`env` the machine already has — `CLAUDE_HOST_LABEL` and friends survive untouched. That is the
property that makes syncing a single `env` key safe, and it is why the merge must stay a deep
merge and never become a whole-object replace.

## The plugin roster

Plugins live in a **separate baseline file**, `baseline/plugins.json`, not in
`settings.base.json` — because they are not applied by merging JSON. See below.

The portable/local split is computed, not hand-maintained:

- **Portable** — every marketplace whose `source.source` is not `directory`, plus every
  enabled plugin belonging to one. A `github` source (`{"repo": "cloudflare/skills"}`) is
  identical on every machine. `claude-plugins-official` ships with Claude Code and never
  appears in `extraKnownMarketplaces` at all, so its plugins have no marketplace entry to
  filter on and are portable by definition.
- **Machine-local — the path only.** This repo is added as a directory source pointing at the
  working tree, so its path (`/home/orca/work/claude-marketplace` on one box, something else
  on another) is exactly what cannot be shared. The plugin *names* behind it can be, so they
  are captured under `localMarketplaces` (`{"sss-marketplace": ["e2e", "matt", "sss",
  "web-search"]}`) and apply installs them like any other. Only the path is resolved per
  machine, in this order: `$SSS_MARKETPLACE_PATH`, then the `extraKnownMarketplaces` entry
  already in settings, then **the repo containing the script itself** — running apply out of a
  fresh clone needs no path typed anywhere, because that clone *is* the marketplace. If none
  of the three answer, those plugins are listed and skipped with the command to finish; a
  machine that has never had this repo is not an error.

A registered marketplace with nothing enabled from it is **not** captured. Otherwise every
other machine clones a third-party repo to install nothing from it — the roster follows
enabled plugins, and a marketplace is only along for the ride.

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

## Why a chromium shim is deployed

`web-search` needs a Chromium-family browser and finds one by **name on `PATH`** — its
resolver's OS default-path tier is populated for macOS and Windows but empty on Linux, so a
Linux box with no `chromium`/`google-chrome` on `PATH` fails every call with `No supported
browser binary found`. That is the normal state of a VPS, where the only browser present is
usually the Chrome that Playwright downloaded into `~/.cache/ms-playwright`, under a
versioned path nothing looks in.

`scripts/browser-shim.sh` bridges the two, deployed to `~/.local/bin/chromium` so the
resolver's existing `"chromium"` candidate hits. Three properties matter:

- **A real system browser always wins.** The shim `exec`s `/usr/bin/chromium`,
  `google-chrome`, `/opt/google/chrome/chrome`, a snap, or a macOS `.app` before it looks at
  any cache, so it cannot shadow a browser installed later — which is the standing hazard of
  putting a file named `chromium` first on `PATH`.
- **Resolution is at run time, not install time.** Playwright deletes old revisions on
  upgrade; a symlink to `chromium-1234` becomes a dangling exec the day it becomes
  `chromium-1250`. The shim re-picks the highest revision on every call.
- **`chromium_headless_shell-*` is skipped** even though it speaks CDP, because it cannot run
  headed and the `web-search` daemon may.

The alternative — patching `lib/browser-bin.js` to read the Playwright cache — is the better
*upstream* fix and the wrong one here: `plugins/web-search/` is vendored verbatim from
`ogulcancelik/agent-skills`, and this buys the same result with no tracked deviation. Setting
`WEB_SEARCH_BROWSER_BIN` in `settings.json` would also work but lands in `env`, which this
skill does not sync, and would only apply inside Claude Code rather than to any shell.

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
   are already present and will be skipped; `+` is a change; `!` is a directory-sourced
   marketplace whose path could not be resolved, and the epilogue prints the one command that
   finishes those:
   ```bash
   SSS_MARKETPLACE_PATH=/path/to/claude-marketplace \
     "$SKILL_DIR/scripts/apply-plugins.sh" "$SKILL_DIR/baseline/plugins.json"
   ```
   Apply also installs Node dependencies for any newly installed skill that ships a
   `package.json` with no `node_modules` — `web-search` vendors upstream's manifest without a
   lockfile, so without this it installs and then fails its first call on a missing
   `playwright`. Skills with no `package.json` are untouched, which is nearly all of them.

6. **Deploy the browser shim, but only if nothing else answers.** `web-search` is the one
   skill in the roster that needs a browser. Check first — a machine with Chrome installed
   needs no shim:
   ```bash
   for b in google-chrome google-chrome-stable chrome brave brave-browser chromium \
            chromium-browser microsoft-edge msedge; do command -v "$b" && break; done
   ```
   If that prints nothing (and on macOS, `/Applications/Google Chrome.app` is absent too),
   deploy it:
   ```bash
   mkdir -p ~/.local/bin
   cp "$SKILL_DIR/scripts/browser-shim.sh" ~/.local/bin/chromium
   chmod +x ~/.local/bin/chromium
   ```
   Then **verify it resolves**, because a shim that exits 127 is a shim that changed nothing:
   ```bash
   command -v chromium && chromium --version
   ```
   Two failures to report rather than paper over. If `command -v chromium` finds nothing,
   `~/.local/bin` is not on this machine's `PATH` — say so and stop, since the alternative
   (`WEB_SEARCH_BROWSER_BIN` in `env`) is a machine-local edit this skill does not make. If
   `--version` exits 127, the box has neither a browser nor a Playwright cache; the fix is
   `npx playwright install chromium`, and re-running the shim then needs no redeploy.

7. **Report the baseline's commit** so the user knows what they deployed:
   `git -C "$SKILL_DIR" log -1 --format='%h %s' -- baseline scripts`

8. Tell the user the statusline refreshes on the next assistant message, and that **plugins
   need a Claude Code restart** — a newly installed plugin's skills do not appear in the
   session that installed them.

## Capture — this machine to baseline

Pull the synced regions out of the live settings and write them back to `baseline/`:

```bash
jq '{statusLine, skillOverrides, permissions, attribution, includeCoAuthoredBy}
    + (.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY
       | if . then {env: {CLAUDE_CODE_DISABLE_AUTO_MEMORY: .}} else {} end)
    | .statusLine.command = "~/.claude/statusline-native.sh"' \
  ~/.claude/settings.json > "$SKILL_DIR/baseline/settings.base.json"
```

The `.statusLine.command` rewrite is required — the live file holds an absolute path
(`/Users/<you>/.claude/...`) that is wrong on every other machine.

The `env` clause takes **one named key**, never `.env` whole — capturing the whole object would
push this machine's `CLAUDE_HOST_LABEL` and `PYENV_VERSION` onto every other box. Note the
asymmetry it creates: capturing on a machine where auto-memory is *on* drops the key from the
baseline, but apply only ever adds keys, so the machines that already have it keep it. Turning
memory back on everywhere is therefore a deliberate edit to `baseline/settings.base.json` plus
an `unset`/removal on each machine, not something a capture can do by accident.

If the user changed `~/.claude/statusline-native.sh` directly, copy it back to
`scripts/statusline.sh` too, so the repo is the source of truth again. Same for
`~/.local/bin/chromium` and `scripts/browser-shim.sh` — the shim's whole job is to name paths
that vary per machine, so a hand-added path on one box is one the next box probably wants.

Then capture the plugin roster, which computes the portable/local split itself:

```bash
"$SKILL_DIR/scripts/capture-plugins.sh" "$SKILL_DIR/baseline/plugins.json"
```

It prints what it captured, marking directory-sourced entries `(local)`. Check the list for
anything that was an evaluation leftover — capture records what is *enabled*, and an
enabled-but-unwanted plugin propagates to every machine on the next apply. Disabling it and
re-capturing is the fix, not editing the JSON.

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
