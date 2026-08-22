# Worker launch

Read when a run names an engine, a model or a reasoning effort for its workers, and when
`worker-start` answered `ready` but the worker has not moved. Step 5 of [`SKILL.md`](../SKILL.md)
starts every worker with one `worker-start`; this file is what it passes to it, and what `ready`
does not cover.

## The engine is `--agent`, not argv

Workers run on `claude` by default. One engine per run — the coordinator is always the invoking
Claude Code session.

| the user named | what step 5 passes |
| -------------- | ------------------ |
| nothing | `--agent claude` |
| an engine | `--agent cursor` |
| an engine and a model | `--agent <engine> --model <opaque provider model id>` |
| an engine, a model and an effort | `--agent <engine> --model <id> --effort <level>` |

There is no argv column, and [ADR-0011](../../../../../docs/adr/0011-delegate-tickets-dispatches-through-worker-start.md)
says why there is not.

**`--effort` requires `--model`, and neither combines with `--terminal`.** Step 7's terminal reuse
is where that trips: it hands a settled terminal to the next Dispatch as `--terminal <handle>`, and
a `--model` or `--effort` left on the command line from the first launch rejects the call. Launch
options apply to fresh agent terminals only; they override the agent's default arguments and come
back in the receipt under `launch.requested` and `launch.effective`.

## The permissionless flag is app config

Orca launches each engine with the arguments in `settings.agentDefaultArgs`, keyed by engine id —
`--dangerously-skip-permissions` for `claude`, `--yolo` (alias `--force`) for `cursor`. **No
argument this skill passes sets it.** A host left on manual launches workers that stop at an
approval prompt with nobody watching: not a failure, never reported as one, and indistinguishable
from a slow worker until the dispatch times out.

Step 4 of `SKILL.md` owns the read and the refusal, and it reads that map for **the engine this run
will pass to `--agent`** — not for `claude` by habit. Do not work around a manual-mode host by
spelling the flag into a launch command; the flag belongs to the launch the app owns.

## cursor

An `--agent cursor` run requires `/setup-cursor-worker` to have been run on this machine — check
`which cursor-agent && cursor-agent status` first, and stop and say so if either fails. Falling back
to `claude` silently hands the user a run on an engine they did not pick.

Pass **no `--model`** unless the user named one: a `cursor-agent` launched without it inherits the
account's current model selection (set in the TUI's `/model` picker — see `/setup-cursor-worker`),
which is the only route to 1M context. Every flat id passed via `--model` resolves to 300K, and the
base id and the bracket syntax from `--help` are rejected outright, killing the agent on startup.

## `ready` is a process, not a moving agent

`worker-start` exits 0 only for `ready`, and readiness is decided on **process identity**: a bare
shell is the negative signal for "is an agent running". That is a stronger check than the retry loop
it replaced, and it is blind in exactly one way — **it cannot see what a TUI renders.**

`cursor-agent` gates on **Workspace Trust per directory**, which the permissionless flag does NOT
cover, so every freshly created worktree hits it. The box is drawn by `cursor-agent` itself, which
is the foreground process and is a recognised agent — so `worker-start` reports `ready` for a worker
that will never move. Clear it before treating the worker as live: send the single key `a`
(`<orca> terminal send --text "a"`, **no `--enter`** — it is a menu key), then re-read.

**Match the agent's own status line, never the absence of the trust box.** The dismissed box stays
in scrollback and the status line lands *below* it, so a tail of the last few lines shows the trust
prompt long after the agent is up — reading as a hung worker and inviting a second `a` or a needless
teardown of a healthy pane. Read the tail **whole** (`<orca> terminal read --json` →
`result.terminal.tail`) and require the model/branch line.
