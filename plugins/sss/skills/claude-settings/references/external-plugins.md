# External plugin roster

The plugins this setup depends on, and where they come from — what each one is for, and the
rationale behind the ones whose packaging is a decision rather than an accident.

**This list is no longer worked through by hand.** The machine-readable roster is
`baseline/plugins.json`, captured by `scripts/capture-plugins.sh` and installed by
`scripts/apply-plugins.sh`. Sections 1 and 2 below are what that roster currently holds; if
they disagree with the JSON, the JSON is right and this file is stale.

Directory-sourced marketplaces are in the roster too, by name — see section 3. Only their
*path* is machine-local, and apply resolves that itself.

Enabled plugins only. Anything installed and left disabled is an evaluation leftover; capture
records what is enabled, so disabling is how something leaves the roster.

## 1. External marketplaces

Handled by `apply-plugins.sh`. The equivalent by hand:

```bash
/plugin marketplace add cloudflare/skills
/plugin marketplace add ayghri/i-have-adhd
/plugin marketplace add plannotator/effective-html
/plugin marketplace add bradautomates/claude-video
/plugin marketplace add DietrichGebert/ponytail
```

| Marketplace | Source | Plugin to enable | What it gives you |
|---|---|---|---|
| `cloudflare` | `cloudflare/skills` | `cloudflare` | Workers, Durable Objects, Wrangler, Agents SDK |
| `i-have-adhd` | `ayghri/i-have-adhd` | `i-have-adhd` | ADHD-shaped output; `/i-have-adhd:i-have-adhd` |
| `effective-html` | `plannotator/effective-html` | `plannotator-effective-html` | Plan/prototype MCP tooling |
| `claude-video` | `bradautomates/claude-video` | `watch` | `/watch` — video → frames + transcript |
| `ponytail` | `DietrichGebert/ponytail` | `ponytail` | Lazy-senior-dev mode; `/ponytail:ponytail-review`, the over-engineering track `sss:pr-review` spawns |

**`ponytail` is the one entry here that changes every session's behaviour, not just the sessions
that invoke it.** Its `plugin.json` registers three hooks — `SessionStart`, `SubagentStart` and
`UserPromptSubmit` — and the first two inject its `AGENTS.md` (YAGNI, stdlib first, deletion over
addition) into the context of every session and every subagent on the machine. That is the plugin
working as designed and it is worth knowing before enabling it, because a machine that has it and a
machine that does not will answer the same prompt differently. The hooks shell out to `node`, so a
box with no Node on `PATH` gets a failing `SessionStart` hook rather than a quiet no-op. Mode is
tracked per session by `ponytail-mode-tracker.js`; `/ponytail:ponytail` turns it on and off in
conversation.

`sss:pr-review` depends on this one: its Complexity track invokes the `ponytail:ponytail-review`
skill, and its Step 1 preflight stops the run when the plugin is not enabled. So it is a roster
entry with a hard consumer, not an optional extra.

## 2. Built-in marketplace — enable only, no add

`claude-plugins-official` is Anthropic's own marketplace. It ships with Claude Code and is
distributed out of band (it is not a git clone and never appears in
`extraKnownMarketplaces`), so there is nothing to add — just enable. That absence is also why
capture treats its plugins as portable: a plugin whose marketplace has no
`extraKnownMarketplaces` entry cannot be directory-sourced, so there is no per-machine path to
strip.

- `atlassian` — Jira and Confluence. The one entry here that ships an **MCP server** rather than
  skills alone: a remote HTTP server at `mcp.atlassian.com`, so it authenticates per machine and an
  install is not a working connection until that is done. Its tools are namespaced
  `mcp__plugin_atlassian_atlassian__<tool>` — the plugin and the server share the name `atlassian` —
  and they appear only after a Claude Code restart, so verify the real ids there rather than
  assuming them. **Not the same thing as the claude.ai Atlassian connector**, which surfaces
  `mcp__claude_ai_Atlassian_Rovo__*` from an account-level integration; a machine can have either,
  both, or neither, and only this one is in the roster
- `commit-commands` — `/commit`, `/commit-push-pr`, `/clean_gone`
- `frontend-design`
- `skill-creator`

## 3. This repo — in the roster by name, resolved by path

Added as a **directory** source pointing at the working tree, so uncommitted edits are live
locally and invisible on every other machine. That working-tree path is the one field a shared
baseline cannot get right — but the plugin names are fine, so they live in the roster under
`localMarketplaces` and `apply-plugins.sh` installs them. It resolves the path from
`$SSS_MARKETPLACE_PATH`, then settings, then the repo containing the script itself.

| Plugin | What it gives you |
|---|---|
| `sss` | Locally-authored skills — `/sss:pr-review`, `/sss:claude-settings`, `/sss:autoship`, … |
| `matt` | `mattpocock/skills` — `/matt:code-review`, `/matt:tdd`, `/matt:research`, … |

**A checkout that predates a plugin hides it.** The marketplace resolves against the working
tree, so on a branch cut before `<plugin>` landed, `claude plugin list` reports
`Plugin <plugin> not found in marketplace sss-marketplace` while settings still show it
installed and enabled. Nothing is broken — check out `main`, or a branch based on it.

## Verifying a machine

`~/.claude/settings.json` holds the authoritative machine-local record in two keys:

```bash
jq '{extraKnownMarketplaces, enabledPlugins}' ~/.claude/settings.json
```

`extraKnownMarketplaces` lists every registered source; `enabledPlugins` maps
`<plugin>@<marketplace>` to a boolean. The two drift apart: a marketplace can stay registered
after its plugin is disabled, and a `false` entry can outlive the marketplace itself. When
pruning, remove the entry from **both** keys — dropping only the `enabledPlugins` line leaves
the source registered. Apply never prunes: a plugin dropped from the roster stays installed on
every machine that already has it until someone uninstalls it there.

Note that `claude plugin list` shows only *installed* plugins, so it cannot tell you a
marketplace is registered with nothing installed from it. `claude plugin marketplace list` is
the one that shows that, and the mismatch between the two is the usual "I enabled it, why is
nothing there" state. To check a machine against the roster without changing it:

```bash
DRY_RUN=1 scripts/apply-plugins.sh baseline/plugins.json
```

## i-have-adhd stays upstream

It is installed from `ayghri/i-have-adhd`, not vendored into `sss`. Copying it in would buy
one fewer `marketplace add` here and cost a fork with no upstream sync path, a duplicated
`SessionStart` hook, and a third-party skill living in a directory reserved for
locally-authored ones. It would not have made the skill enable itself on a new machine
either, because `enabledPlugins` is machine-local regardless of where the skill ships from.

Its always-on mode is a `SessionStart` hook in that plugin, gated on a flag file — create
`~/.claude/.i-have-adhd-always` to turn it on, delete it to turn it off. That flag is
machine-local too.
