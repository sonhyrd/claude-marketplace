# External plugin roster

The plugins this setup depends on, and where they come from. `claude-settings` deliberately
does **not** sync `enabledPlugins` — marketplace sources differ per machine (a directory
source here, a clone there), so writing them from a shared baseline would break the machine
it lands on. This file is the manual counterpart: the list you work through by hand when
bringing up a new machine or VPS.

Enabled plugins only. Anything installed and left disabled is an evaluation leftover and is
deliberately omitted.

## 1. External marketplaces — add, then enable

```bash
/plugin marketplace add cloudflare/skills
/plugin marketplace add ayghri/i-have-adhd
/plugin marketplace add plannotator/effective-html
/plugin marketplace add bradautomates/claude-video
```

| Marketplace | Source | Plugin to enable | What it gives you |
|---|---|---|---|
| `cloudflare` | `cloudflare/skills` | `cloudflare` | Workers, Durable Objects, Wrangler, Agents SDK |
| `i-have-adhd` | `ayghri/i-have-adhd` | `i-have-adhd` | ADHD-shaped output; `/i-have-adhd:i-have-adhd` |
| `effective-html` | `plannotator/effective-html` | `plannotator-effective-html` | Plan/prototype MCP tooling |
| `claude-video` | `bradautomates/claude-video` | `watch` | `/watch` — video → frames + transcript |

## 2. Built-in marketplace — enable only, no add

`claude-plugins-official` is Anthropic's own marketplace. It ships with Claude Code and is
distributed out of band (it is not a git clone and never appears in
`extraKnownMarketplaces`), so there is nothing to add — just enable:

- `commit-commands` — `/commit`, `/commit-push-pr`, `/clean_gone`
- `frontend-design`
- `skill-creator`

## 3. This repo

Added as a **directory** source pointing at the working tree, so uncommitted edits are live
locally and invisible on every other machine:

```bash
/plugin marketplace add /path/to/claude-marketplace
```

Enable `sss`, `matt`, and `e2e`.

## Verifying a machine

`~/.claude/settings.json` holds the authoritative machine-local record in two keys:

```bash
jq '{extraKnownMarketplaces, enabledPlugins}' ~/.claude/settings.json
```

`extraKnownMarketplaces` lists every registered source; `enabledPlugins` maps
`<plugin>@<marketplace>` to a boolean. The two drift apart: a marketplace can stay registered
after its plugin is disabled, and a `false` entry can outlive the marketplace itself. When
pruning, remove the entry from **both** keys — dropping only the `enabledPlugins` line leaves
the source registered.

## i-have-adhd stays upstream

It is installed from `ayghri/i-have-adhd`, not vendored into `sss`. Copying it in would buy
one fewer `marketplace add` here and cost a fork with no upstream sync path, a duplicated
`SessionStart` hook, and a third-party skill living in a directory reserved for
locally-authored ones. It would not have made the skill enable itself on a new machine
either, because `enabledPlugins` is machine-local regardless of where the skill ships from.

Its always-on mode is a `SessionStart` hook in that plugin, gated on a flag file — create
`~/.claude/.i-have-adhd-always` to turn it on, delete it to turn it off. That flag is
machine-local too.
