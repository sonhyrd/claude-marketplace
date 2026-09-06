---
name: claude-settings
description: >-
  Sync Claude Code settings across machines from a repo-tracked baseline. Applies the shared
  regions of ~/.claude/settings.json and deploys the native statusline script, or captures
  this machine's current values back
  into the baseline. Use when setting up Claude Code on a new machine or VPS, when the user
  says their settings/statusline/skill overrides are out of sync between machines, when they
  want to save or restore their Claude Code configuration, or when adding a segment to the
  statusline, or when a new machine is missing plugins that another machine has, or when
  web-search fails with "No supported browser binary found" on a box with no browser. Also
  installs the tracked plugin roster via the claude plugin CLI, and the CLI roster the sss
  skills shell out to — `ocr` for pr-review's third track, and the shim that makes `orca`
  resolve to Orca's CLI instead of its desktop launcher, which is what to reach for when a
  skill reports Orca unavailable on a machine where Orca is running.
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
| `outputStyle` | Yes | A style name, no path — see below |
| `env` | **Two keys** | `CLAUDE_CODE_DISABLE_AUTO_MEMORY` and `PONYTAIL_DEFAULT_MODE` only — see below. Everything else (`PYENV_VERSION`, `CLAUDE_HOST_LABEL`, `CLAUDE_CODE_PLUGIN_PREFER_HTTPS`) is machine-specific |
| `hooks` | **No** | Contains absolute paths (`~/.orca/agent-hooks/`, `~/.claude/hooks/`) |
| `~/.claude/CLAUDE.md` + its imports | Yes | Not a settings key — a file set, copied. See below |
| `enabledPlugins`, `extraKnownMarketplaces` | **Partly** | Non-directory sources sync via `baseline/plugins.json`; directory sources carry a per-machine path and do not |

Writing `hooks`, or the rest of `env`, from a shared baseline would break the machine it lands
on. Do not add them without changing the paths to be `$HOME`-relative first — that is a
separate change.

### The two `env` keys that sync

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

`PONYTAIL_DEFAULT_MODE=ultra` is the second, and it is in the baseline for the same reason: it
names an intensity, not a path, so one value is correct everywhere. It is first in ponytail's own
resolution order, ahead of `~/.config/ponytail/config.json`, so the shared key settles the question
on every machine the baseline reaches.

**Both keys must appear in the capture `jq` below, and a key the capture does not name is a key
capture silently deletes.** Capture rebuilds the `env` object from the names it lists rather than
editing what is there, so an `env` key added to `baseline/settings.base.json` by hand — or by a
commit — vanishes from the baseline on the next capture run from any machine. Adding a third key is
therefore two edits, not one: the capture clause and this section.

Because apply is a **deep merge** (`jq -s '.[0] * .[1]'`), landing these keys adds them to whatever
`env` the machine already has — `CLAUDE_HOST_LABEL` and friends survive untouched. That is the
property that makes syncing named `env` keys safe, and it is why the merge must stay a deep
merge and never become a whole-object replace.

### `outputStyle`

`/config`'s **Output style** row lands in `~/.claude/settings.json` as `outputStyle`, naming a style
by its display name — `Concise` among them. It syncs for the reason `skillOverrides` does: it names
a preference and nothing else, no path, no host, no version, so one value is correct on every
machine, and a style chosen on the laptop and absent on the VPS is the incoherent state the baseline
exists to end.

The panel's other rows stay machine-local. `verbose` and `askUserQuestionTimeout` are real settings
keys and would sync just as cleanly — they are left out because they were not asked for, not because
they resist it, and adding one is a line in the capture list plus a line in the table.

**`outputStyle` is absent from `settings.json` until it is changed from its default**, which is why
capture filters nulls rather than writing the key with a null value. Deep-merging
`"outputStyle": null` onto another machine would overwrite a real choice there with nothing — the
one way a sync of optional keys can lose a setting rather than spread one.

## The plugin roster

Plugins live in a **separate baseline file**, `baseline/plugins.json`, not in
`settings.base.json` — because they are not applied by merging JSON. See below.

The portable/local split is computed, not hand-maintained:

- **Portable** — every marketplace whose `source.source` is not `directory`, plus every
  enabled plugin belonging to one. A `github` source (`{"repo": "cloudflare/skills"}`) is
  identical on every machine. `claude-plugins-official` ships with Claude Code and never
  appears in `extraKnownMarketplaces` at all, so its plugins have no marketplace entry to
  filter on and are portable by definition.
- **Machine-local — the path only.** A marketplace added as a directory source carries a path
  (`/home/orca/work/claude-marketplace` on one box, something else on another) and that path is
  exactly what cannot be shared. The plugin *names* behind it can be, so they are captured under
  `localMarketplaces` (`{"sss-marketplace": ["e2e", "matt", "sss", "web-search"]}`) and apply
  installs them like any other. Only the path is resolved per machine, in this order:
  `$SSS_MARKETPLACE_PATH`, then the `extraKnownMarketplaces` entry already in settings, then
  **the repo containing the script itself** — running apply out of a fresh clone needs no path
  typed anywhere, because that clone *is* the marketplace. If none of the three answer, those
  plugins are listed and skipped with the command to finish; a machine that has never had this
  repo is not an error.

**`sss-marketplace` itself is no longer one of those.** It is registered from
`sonhyrd/claude-marketplace` as a plain `github` source, so it captures like `cloudflare` or
`ponytail` and `localMarketplaces` is empty. That is what lets a host with no checkout — the
`cursor-5` and `contabo` Orca environments among them — install `sss`, `e2e`, `matt` and
`web-search` from the baseline alone. The `localMarketplaces` machinery above stays because the
scripts still support a directory source; nothing in the roster uses it today. Switching a machine
back is `claude plugin marketplace remove sss-marketplace` then `add <path>`, at the cost of
re-installing the four plugins, which `remove` drops from `enabledPlugins`.

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

## Updating the marketplace on another host

`sss-marketplace` resolves from `sonhyrd/claude-marketplace`, so a change reaches another machine
only after it clears **three** gates, and skipping any one of them looks exactly like the change
never happened:

1. **Committed and pushed to the default branch.** A GitHub source clones the default branch. Work
   sitting on a feature branch — merged in a PR that is still open, or squash-merged but not yet
   fetched — is not there.
2. **The version in `.claude-plugin/marketplace.json` moved.** The plugin cache is keyed on it
   (`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`), so a host already holding
   `sss@1.6.0` will not re-fetch different content published under `1.6.0`. This is the same trap
   `CLAUDE.md` documents for the `matt` subtree, and it is silent: the host reports the plugin
   installed and at the right version while running the old files.
3. **The host ran `marketplace update`.** Registration is not a subscription; nothing polls.

On the target host, that is:

```bash
claude plugin marketplace update sss-marketplace
claude plugin update sss@sss-marketplace     # repeat per plugin, or reinstall
```

Then restart Claude Code there — a refreshed plugin's skills do not appear in the session that
refreshed them.

**Prefer `update` over `remove` + `add`.** `remove` drops every plugin of that marketplace from
`enabledPlugins`, so the re-add has to be followed by an install per plugin; that is the recovery
path for a corrupt clone, not the routine one.

### Driving every host from here

`scripts/update-hosts.sh` runs the pass above on every Orca-managed host and reports what landed:

```bash
DRY_RUN=1 ./scripts/update-hosts.sh baseline/plugins.json     # preview which hosts it would touch
./scripts/update-hosts.sh baseline/plugins.json               # all environments
./scripts/update-hosts.sh baseline/plugins.json cursor-5      # named hosts only
```

The marketplace, its repo and its plugin list all come from the roster, so adding a plugin to
`baseline/plugins.json` is the only edit needed for every host to pick it up. A host still on a
directory source is swapped once (`remove` + `add` + install each plugin); one already on GitHub
takes `marketplace update` + `plugin update`. Re-running is a no-op that re-prints the evidence.

**It reports the clone commit and the cached versions, not the CLI's success lines.** `claude
plugin update` prints success for a plugin whose version did not move, so "updated" and "re-read
the same files" are indistinguishable from the exit code — gate 2 above is exactly the failure that
looks like success. The commit and the version list are what separate them, which is why they are
the output rather than a tick.

Three things it has to work around, each of which cost a debugging pass:

- **`terminal wait --for exit` never fires.** The remote command finishing does not exit the pty —
  the shell returns to its prompt and stays alive — so a wait on `exit` burns its entire timeout on
  a run that succeeded in seconds, and the script reads as hung rather than slow. The payload prints
  its own `---DONE---` marker and the script polls for that.
- **The payload crosses the wire base64-encoded.** It is a multi-line script and `--command` takes
  one string; every scheme that tries to preserve the newlines, `printf %q` included, hands the CLI
  something it word-splits into an unrunnable command and then blocks on, with no terminal created
  and no handle returned.
- **A remote `terminal create` requires `--worktree`** — it cannot infer one from the client's cwd.
  Any non-archived worktree on that host will do, because every command here is host-global rather
  than repo-scoped, so the script takes the first one rather than requiring a checkout of this repo.

Node dependencies are installed for any skill shipping a `package.json` with no `node_modules`.
`web-search` is the one in this roster and **its manifest is at `skills/web-search/package.json`,
not at the plugin cache root** — pointing npm at the root fails `ENOENT` on one host and with npm's
`Tracker "idealTree" already exists` on another, which reads as a broken npm rather than a wrong
directory. `npm_config_*` is unset first for the same reason: an Orca terminal inherits those, and a
nested `npm install` dies on that same `idealTree` error.

### The prompt to hand another host

Orca-managed hosts (`orca host list` names them — `cursor-5` and `contabo` here) each run their own
Claude Code with their own `~/.claude/settings.json`. Nothing in this skill reaches across; the
update runs *there*. Paste this into a session on that host:

> Update the `sss-marketplace` plugins from GitHub and verify the update actually landed.
>
> 1. `claude plugin marketplace update sss-marketplace`
> 2. `claude plugin update` for each of `sss`, `e2e`, `matt`, `web-search` at `@sss-marketplace`
> 3. Confirm the marketplace clone is at the current default-branch tip:
>    `git -C ~/.claude/plugins/marketplaces/sss-marketplace log --oneline -1`
> 4. Confirm the cache holds the version `.claude-plugin/marketplace.json` names for each plugin:
>    `ls ~/.claude/plugins/cache/sss-marketplace/*/`
> 5. If a plugin ships a `package.json` with no `node_modules` — `web-search` does — run
>    `npm install` in its cache directory, or its first call fails on a missing `playwright`.
>
> Report the clone's commit and each plugin's cached version. If a cached version matches the
> manifest but the content looks stale, say so rather than assuming the update worked: an unchanged
> version number never re-fetches.

A host that has never had this marketplace needs `claude plugin marketplace add
sonhyrd/claude-marketplace` first, and then the four installs — which is what running **apply** out
of `baseline/plugins.json` does for it, with no path typed anywhere.

## User-level memory travels as a set

`~/.claude/CLAUDE.md` is the user-level memory every session on a machine reads. It is **not a
settings key** — it is a file, and it may pull in others: a line beginning `@` imports a path
resolved relative to the importing file's own directory, so `@RTK.md` means `~/.claude/RTK.md`.

**The file and its imports are one unit, and syncing half of it is worse than syncing none.** The
measured state: one machine held a `CLAUDE.md` of exactly one line, `@RTK.md`, and the guide it
imports existed only there; a second machine had no `CLAUDE.md` at all. Copying the importer alone
would have given the second machine an import pointing at nothing — a memory file that reads as
configured and supplies no memory, which is strictly harder to notice than the absence it replaced.

So `baseline/memory/` holds the **whole closure**: `CLAUDE.md` plus every file reachable from it by
`@`, followed transitively. Apply copies the directory; capture walks the imports and rewrites it.

**An import that names an absolute path is machine-local and stops the capture**, for the reason
`hooks` does not sync at all: `@/Users/you/notes.md` resolves on exactly one box. The fix is to move
that file next to `CLAUDE.md` and import it by name, which is a change to the user's memory rather
than something a sync should make on their behalf.

**A synced guide can describe machinery this skill does not sync.** `RTK.md` documents a CLI whose
command rewriting is driven by a **hook**, and hooks are the one region deliberately left out of the
baseline. The guide is accurate wherever `rtk` and its hook are installed and inert everywhere else;
it is carried because a memory file that exists on one machine and not another is the incoherence
being fixed, not because this skill provisions what it describes.

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

## The CLI roster

Two command-line tools that are neither settings nor plugins, and that `sss` skills stop without.
They stay out of `baseline/plugins.json` because they install through their own installers rather
than through `claude plugin`, which is the same reason plugins stay out of `settings.base.json`.

### `ocr` — the third review track

`sss:pr-review` runs three review tracks over one diff, and the third is `sss:ocr-delegate` driving
the `ocr` CLI. With `ocr` absent that track cannot run, and `pr-review` stops the run rather than
reporting two tracks as though they were three.

```bash
ocr --version || npm install -g @alibaba-group/open-code-review@latest
```

Delegation mode needs **no LLM endpoint** — the host agent performs the review and `ocr` supplies
only file selection and rule resolution — so that one command is the whole install. Every version
works: below v1.9.3 `ocr-delegate` parses text where it would otherwise parse JSON, and the track
still runs in full.

`npm install -g` needs a writable prefix. Where `npm config get prefix` names a root-owned directory,
the fix is a Node managed in userspace (`nvm`, `fnm`, a tarball under `~/.local`), not `sudo npm` —
a root-owned global tree is a machine that needs `sudo` for every later install.

### `orca` — the name the AppImage took

Where Orca ships as an AppImage, the install puts its **desktop launcher** on `PATH` as `orca` and
the **CLI** beside it as `orca-ide`:

```
~/.local/bin/orca     -> /opt/orca/squashfs-root/AppRun                   # Electron launcher
~/.local/bin/orca-ide -> /opt/orca/squashfs-root/resources/bin/orca-ide   # the CLI
```

The launcher accepts every subcommand, prints Electron startup noise, and **exits 0**. So
`orca worktree current --json` prints no JSON while reporting success, and anything that shells the
bare name concludes Orca is unavailable on a machine where Orca is running fine. `orca-ide --help`
prints its own usage as `orca <command>`: the CLI already believes it owns this name.

`scripts/orca-shim.sh` gives it the name, deployed to `~/.local/bin/orca`. Three properties matter,
and the first two are the browser shim's:

- **Resolution is at run time, not install time.** An Orca upgrade that moves the AppImage cannot
  leave a dangling exec behind, and the shim re-finds both binaries on every call.
- **A bare `orca` still launches the desktop app**, as do the AppImage's own `--appimage-*` flags.
  Everything else is the CLI's. Subcommands are deliberately not enumerated — a hardcoded list goes
  stale on the first release that adds one.
- **An Orca re-install overwrites it.** The shim occupies the exact path the installer symlinks, so
  a machine that upgrades Orca needs this deployed again. That is the price of the name, and it is
  why apply re-checks rather than assuming a shim it once deployed is still there.

**The shim is for the callers this repo cannot edit.** Every `sss` skill that shells Orca resolves
the binary itself — `sss:autoship` owns that idiom (`reference.md`, section "Orca
orchestration") and `scripts/check-orca-cli.sh` asserts it — so those already work on a machine this skill has never touched. The bundled `orca-cli`
and `orchestration` skills are not ours, and they keep calling `orca`; the shim is what makes those
land. Deploying it and resolving in-skill answer two different callers rather than being two
attempts at one.

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

4. **Deploy the memory set**, after reporting drift on any file that already differs — the same
   rule as the statusline, and for the same reason: a local edit to `~/.claude/CLAUDE.md` is real
   work.
   ```bash
   diff -rq "$SKILL_DIR/baseline/memory" ~/.claude 2>/dev/null | grep -v '^Only in'
   cp "$SKILL_DIR"/baseline/memory/*.md ~/.claude/
   ```
   Then **verify every import resolves**, because a dangling one is the failure this set exists to
   prevent and it is silent:
   ```bash
   grep -ho '^@[^ ]*' ~/.claude/*.md | sed 's/^@//' | while read -r f; do
     [ -e "$HOME/.claude/$f" ] || echo "dangling import: $f"
   done
   ```
   Any output and the copy was incomplete — say which import dangles rather than reporting success.

5. **Merge the baseline** into `~/.claude/settings.json`, preserving everything else:
   ```bash
   jq -s '.[0] * .[1]' ~/.claude/settings.json "$SKILL_DIR/baseline/settings.base.json" \
     > /tmp/settings.merged.json
   ```
   Validate the result parses and still contains `env`, `hooks`, and `enabledPlugins` before
   moving it into place. `jq -s '.[0] * .[1]'` deep-merges, so unlisted regions survive.

6. **Install the plugin roster.** Preview first — it clones third-party repos, and
   `i-have-adhd` ships a `SessionStart` hook:
   ```bash
   DRY_RUN=1 "$SKILL_DIR/scripts/apply-plugins.sh" "$SKILL_DIR/baseline/plugins.json"
   ```
   Show the user what is missing, confirm, then run it without `DRY_RUN`. Lines starting `=`
   are already present and will be skipped; `+` is a change; `!` is either a directory-sourced
   marketplace whose path could not be resolved, or an item that failed. **A failure no longer
   aborts the run** — the roster finishes, the epilogue lists what failed, and the script exits
   non-zero. Read the exit code, not the absence of a crash; an aborted run used to skip every
   plugin after the failing one silently. For an unresolved path the epilogue prints the one
   command that finishes those:
   ```bash
   SSS_MARKETPLACE_PATH=/path/to/claude-marketplace \
     "$SKILL_DIR/scripts/apply-plugins.sh" "$SKILL_DIR/baseline/plugins.json"
   ```
   **A plugin that fails to clone means this host has no usable SSH to GitHub.** It hits only
   plugins whose marketplace entry declares their own `github` source — those are fetched by a
   *second* clone, separate from the marketplace's, while a `"source": "./"` plugin is served
   from the marketplace clone that already succeeded. So one plugin fails while every plugin
   around it installs, which reads as a broken plugin rather than a broken host. The remedy is
   `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`, which makes the CLI skip its SSH probe and clone over
   HTTPS; the epilogue prints it. It is **machine-local** — it states that *this* host has no
   usable SSH, which is a fact about the host exactly as `CLAUDE_HOST_LABEL` is — so it goes in
   that machine's `settings.json` `env` and never in the baseline, where it would force HTTPS
   onto machines whose SSH keys work fine. There is deliberately no preflight for this:
   `command -v ssh` passes on a box that has `ssh` but no key accepted by GitHub, and a check
   that cannot detect the condition is worse than reporting it after the fact.

   Apply also installs Node dependencies for any newly installed skill that ships a
   `package.json` with no `node_modules` — `web-search` vendors upstream's manifest without a
   lockfile, so without this it installs and then fails its first call on a missing
   `playwright`. Skills with no `package.json` are untouched, which is nearly all of them.

7. **Deploy the browser shim, but only if nothing else answers.** `web-search` is the one
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

8. **Install the CLI roster, and verify each one answers.** Both are cheap to check and
   silent to be missing, which is why they are checked every apply rather than once:

   ```bash
   ocr --version || npm install -g @alibaba-group/open-code-review@latest
   orca worktree current --json          # must print JSON, not Electron noise
   ```

   Deploy the Orca shim when that second line prints anything other than JSON **and**
   `orca-ide` exists — that pair is the AppImage layout and nothing else is:

   ```bash
   mkdir -p ~/.local/bin
   cp "$SKILL_DIR/scripts/orca-shim.sh" ~/.local/bin/orca
   chmod +x ~/.local/bin/orca
   orca worktree current --json          # verify: JSON now, or the shim changed nothing
   ```

   Two failures to report rather than paper over. JSON from a directory Orca does not manage
   is still a pass — the CLI answered, which is what this checks. If the re-check still prints
   no JSON, say so and stop rather than deploying more: a second shim over a first one buries
   the cause. Where `orca-ide` is absent entirely, Orca's CLI is not installed on this machine
   and the fix is Orca's installer, not a shim.

9. **Report the baseline's commit** so the user knows what they deployed:
   `git -C "$SKILL_DIR" log -1 --format='%h %s' -- baseline scripts`

10. Tell the user the statusline refreshes on the next assistant message, and that **plugins
   need a Claude Code restart** — a newly installed plugin's skills do not appear in the
   session that installed them.

## Capture — this machine to baseline

Pull the synced regions out of the live settings and write them back to `baseline/`:

```bash
jq '({statusLine, skillOverrides, permissions, attribution, includeCoAuthoredBy, outputStyle}
     | with_entries(select(.value != null)))
    + ({env: (.env // {} | with_entries(select(.key |
         IN("CLAUDE_CODE_DISABLE_AUTO_MEMORY", "PONYTAIL_DEFAULT_MODE"))))}
       | if .env == {} then {} else . end)
    | .statusLine.command = "~/.claude/statusline-native.sh"' \
  ~/.claude/settings.json > "$SKILL_DIR/baseline/settings.base.json"
```

**`with_entries(select(.value != null))` is load-bearing.** `jq`'s object construction invents a key
with a null value for every name the input does not have, so without the filter a capture on a
machine that never touched `outputStyle` writes `"outputStyle": null` into the baseline — and apply's
deep merge then lands that null on a machine where the user *had* chosen a style. Filtering keeps
capture additive in the same way apply already is.

The `.statusLine.command` rewrite is required — the live file holds an absolute path
(`/Users/<you>/.claude/...`) that is wrong on every other machine.

The `env` clause takes **an explicit allow-list of names**, never `.env` whole — capturing the whole
object would push this machine's `CLAUDE_HOST_LABEL`, `PYENV_VERSION` and
`CLAUDE_CODE_PLUGIN_PREFER_HTTPS` onto every other box. The list is the *only* record of which keys
travel, so extending the baseline's `env` means extending it here in the same commit; see the two
`env` keys section above. Note the asymmetry it creates: capturing on a machine where auto-memory is
*on* drops the key from the baseline, but apply only ever adds keys, so the machines that already
have it keep it. Turning memory back on everywhere is therefore a deliberate edit to
`baseline/settings.base.json` plus an `unset`/removal on each machine, not something a capture can
do by accident.

If the user changed `~/.claude/statusline-native.sh` directly, copy it back to
`scripts/statusline.sh` too, so the repo is the source of truth again. Same for
`~/.local/bin/chromium` and `scripts/browser-shim.sh`, and for `~/.local/bin/orca` and
`scripts/orca-shim.sh` — a shim's whole job is to name paths that vary per machine, so a
hand-added path on one box is one the next box probably wants. Copy `~/.local/bin/orca` back
only when it is this shim: after an Orca re-install that path is the installer's symlink again,
and capturing it would overwrite the shim with a link to one machine's AppImage.

Then capture the memory set, following the imports rather than listing filenames:

```bash
rm -rf "$SKILL_DIR/baseline/memory" && mkdir -p "$SKILL_DIR/baseline/memory"
queue=CLAUDE.md
while [ -n "$queue" ]; do
  next=""
  for f in $queue; do
    [ -e "$HOME/.claude/$f" ] || { echo "missing import: $f" >&2; exit 1; }
    cp "$HOME/.claude/$f" "$SKILL_DIR/baseline/memory/$f"
    for imp in $(grep -ho '^@[^ ]*' "$HOME/.claude/$f" | sed 's/^@//'); do
      case "$imp" in /*|~*) echo "machine-local import: $imp" >&2; exit 1 ;; esac
      [ -e "$SKILL_DIR/baseline/memory/$imp" ] || next="$next $imp"
    done
  done
  queue="$next"
done
chmod 644 "$SKILL_DIR"/baseline/memory/*.md
```

**Walking the imports is the point.** A hand-kept list of filenames goes stale the first time
someone adds an `@` line, and the way it goes stale is the dangling import this set exists to
prevent. The loop also refuses on the two shapes that cannot travel: a missing import, and one
naming an absolute or `~`-rooted path. `chmod 644` normalises the mode — `RTK.md` was `600` on the
machine it came from, which is an accident of how it was written rather than a property worth
carrying.

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

Then remind them: **other hosts only see what is committed and pushed to the default branch.**
`sss-marketplace` is a `github` source on every machine now, so nothing in a working tree is live
anywhere — not even locally. See *Updating the marketplace on another host* below for what a change
has to clear before another box runs it.

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
