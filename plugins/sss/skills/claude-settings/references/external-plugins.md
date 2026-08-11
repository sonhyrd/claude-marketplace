# External plugin roster

The plugins this setup depends on, and where they come from — what each one is for, and the
rationale behind the ones whose packaging is a decision rather than an accident.

**This list is no longer worked through by hand.** The machine-readable roster is
`baseline/plugins.json`, captured by `scripts/capture-plugins.sh` and installed by
`scripts/apply-plugins.sh`. Sections 1 and 2 below are what that roster currently holds; if
they disagree with the JSON, the JSON is right and this file is stale.

Only *directory*-sourced marketplaces stay manual, because their path differs per machine —
that is section 3, and it is one command.

Enabled plugins only. Anything installed and left disabled is an evaluation leftover; capture
records what is enabled, so disabling is how something leaves the roster.

## 1. External marketplaces

Handled by `apply-plugins.sh`. The equivalent by hand:

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
`extraKnownMarketplaces`), so there is nothing to add — just enable. That absence is also why
capture treats its plugins as portable: a plugin whose marketplace has no
`extraKnownMarketplaces` entry cannot be directory-sourced, so there is no per-machine path to
strip.

- `commit-commands` — `/commit`, `/commit-push-pr`, `/clean_gone`
- `frontend-design`
- `skill-creator`

## 3. This repo — the one that stays manual

Added as a **directory** source pointing at the working tree, so uncommitted edits are live
locally and invisible on every other machine. That working-tree path is the reason it cannot
be in the roster: it is the one field a shared baseline cannot get right.

```bash
claude plugin marketplace add /path/to/claude-marketplace
claude plugin install sss@sss-marketplace matt@sss-marketplace e2e@sss-marketplace \
  web-search@sss-marketplace
(cd ~/.claude/plugins/cache/sss-marketplace/web-search/*/skills/web-search && bun install)
```

| Plugin | What it gives you |
|---|---|
| `sss` | Locally-authored skills — `/sss:pr-review`, `/sss:claude-settings`, `/sss:autoship`, … |
| `matt` | `mattpocock/skills` — `/matt:code-review`, `/matt:tdd`, `/matt:research`, … |
| `e2e` | `/e2e:pw-prove`, `/e2e:e2e-reviewer`, `/e2e:playwright-debugger` |
| `web-search` | `/web-search` — browser-backed Google/DuckDuckGo search, pages as Markdown |

`web-search` is the one that is not usable the moment it installs. It vendors upstream's
`package.json` without `node_modules` or a lockfile (upstream's `.gitignore` excludes both), so
its first call fails on a missing `playwright` until the `bun install` above runs. The cache
path is versioned — repeat it after a version bump, which lands in a new empty directory.

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
