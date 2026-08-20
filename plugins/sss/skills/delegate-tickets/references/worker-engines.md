# Worker engines

Read when a run passes `--engine cursor`, or when a worker's terminal renders a frame but the agent
never moves. Step 5 of [`SKILL.md`](../SKILL.md) dispatches through this table.

Workers run on `claude` by default. One engine per run — the coordinator is always the invoking
Claude Code session.

| `--engine` | terminal command |
| ---------- | ---------------- |
| `claude` (default) | `claude --effort medium --dangerously-skip-permissions` |
| `cursor` | `cursor-agent --force` |
| `cursor:<model-id>` | `cursor-agent --force --model <model-id>` |

## cursor

`--force` (alias `--yolo`) is cursor's `--dangerously-skip-permissions`. An unattended worker that
hits an approval prompt does not slow down, it hangs: the terminal stays alive and `tui-idle`
reports ready while the agent waits forever.

`--engine cursor` requires `/setup-cursor-worker` to have been run on this machine — check `which
cursor-agent && cursor-agent status` first, and stop and say so if either fails. Falling back to
`claude` silently hands the user a run on an engine they did not pick.

Pass **no `--model`** unless the user named one: a `cursor-agent` launched without it inherits the
account's current model selection (set in the TUI's `/model` picker — see `/setup-cursor-worker`),
which is the only route to 1M context. Every flat id passed via `--model` resolves to 300K, and the
base id and the bracket syntax from `--help` are rejected outright, killing the agent on startup.

## A rendered TUI frame is not the same as a running agent

`cursor-agent` gates on **Workspace Trust per directory**, which `--force` does NOT cover, so every
freshly created worktree hits it even on a machine `/setup-cursor-worker` already set up. The trust
box is itself a TUI, so `tui-idle` reports ready and `terminal read` shows *something* while the
agent does nothing at all. Send the single key `a` (`terminal send --text "a"`, **no `--enter`** —
it is a menu key), then re-read.

**Match the agent's status line, never the absence of the trust box.** The dismissed box stays in
scrollback and the status line lands *below* it, so a tail of the last few lines shows the trust
prompt long after the agent is up — reading as a hung worker and inviting a second `a` or a needless
teardown of a healthy pane. Read the tail **whole** (`terminal read --json` →
`result.terminal.tail`) and require the model/branch line.
