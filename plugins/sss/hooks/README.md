# sss hooks

A portable version of the rtk hook that previously lived in
`~/.claude/settings.json`. Shipping it from the plugin means one tracked copy
that installs the same way on every host — laptop, VPS, CI — instead of a
settings blob that has to be hand-edited per machine.

`hooks.json` is auto-discovered by Claude Code from the plugin root and is also
declared explicitly in the marketplace entry.

## Wrappers

| Script | Events | Runs |
| --- | --- | --- |
| `rtk.sh` | `PreToolUse(Bash)` | `rtk hook claude` — token-saving command rewrites |

The Orca, Superset and herdr hooks are installed per machine by their own
tooling and stay in `~/.claude/settings.json`; they are deliberately not
shipped here.

## Contract

The wrapper is a **no-op that exits 0 when rtk is absent**. That is the whole
point of the layer: the plugin ships the wiring, not the tool, so a host
without rtk installs cleanly and never has a hook blocking a Bash call. It
drains stdin before exiting so the hook payload writer never sees a broken
pipe.

When rtk *is* present the wrapper `exec`s it, so stdout and exit code pass
through unchanged — required here, since rtk returns hook JSON that rewrites
the command Claude runs.

## Environment

| Variable | Effect |
| --- | --- |
| `SSS_HOOKS_DISABLED=1` | Kill switch — the wrapper becomes a no-op |
| `SSS_RTK_BIN` | rtk binary (default: `rtk` on `PATH`) |

## Migrating a host

This fires **in addition to** anything still in `~/.claude/settings.json`.
After enabling the plugin on a host, delete the `rtk hook claude` entry from
that file, or the rewrite runs twice.
