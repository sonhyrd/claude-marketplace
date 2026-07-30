---
name: delegate-tickets
description: Delegate an approved ticket tree to parallel Orca workers — one child worktree per ticket, dispatched in DAG order and merged back as each finishes.
disable-model-invocation: true
---

# Delegate Tickets

Delegate a ticket tree produced by `/to-tickets` to parallel workers, coordinated with the `/orchestration` skill: one Orca child worktree per ticket, dispatched in DAG order, merged back into the current branch as each finishes.

The tickets' **blocking edges ARE the dependency DAG** — use them as-is, never re-derive dependencies. Wide refactors already serialize through their edges by construction.

## 1. Resolve the repo profile

Match `git remote get-url origin` against the profiles in [PROFILES.md](PROFILES.md). No match → interview the user for each field in the profile template, append the new profile to `PROFILES.md`, then continue. The profile supplies every repo-specific value the steps below reference: branch prefix, post-merge check, commit policy, worker constraints.

## 2. Resolve the ticket tree

Read the target repo's `docs/agents/issue-tracker.md` (written by `/setup-matt-pocock-skills`) to learn where tickets live:

- **Local files** → tickets are `.scratch/<feature-slug>/issues/*.md`. The argument is the feature slug; with no argument, use the only `.scratch/*/issues/` directory if exactly one exists, otherwise ask which.
- **GitHub** → the argument names the parent issue, label, or milestone; fetch every ticket under it, including its blocking links.

If `issue-tracker.md` doesn't exist: fall back to a `.scratch/*/issues/` tree if one exists; otherwise stop and point the user at `/setup-matt-pocock-skills`.

## 3. Print the DAG

Read every ticket file/issue. Print the DAG: which tickets are unblocked now, which wait on what. Done when every ticket in the tree is accounted for as either unblocked or blocked-by-named-tickets.

## 4. Dispatch the frontier

Coordinate through the `/orchestration` skill — real Orca task/dispatch state, not generic subagents.

- One Orca **child worktree** per ticket, branched off the current branch as `<branch-prefix><ticket-slug>`.
- Dispatch every currently-unblocked ticket in parallel. A blocked ticket dispatches only after ALL its blockers have merged back.
- Each worker gets a fresh session in its worktree and runs `/implement <ticket-ref>`, with the profile's worker constraints included verbatim in its prompt. `/implement` drives `/tdd` and `/code-review` itself — don't re-specify them. Definition of done: `/implement` closes clean, plus the profile's post-merge check passes.
- Launch every worker with the run's engine argv (below), via orca-cli's custom-argv path — `terminal create --command '<engine argv>'` — not the bare default launcher.
- **Confirm each worker actually started before dispatching.** `terminal wait --for tui-idle` is satisfied by the bare shell that exists before a TUI mounts, and by the shell an agent leaves behind when it dies on startup — so follow it with `terminal read` and require a rendered agent frame, re-reading up to 5 times. A pane showing only a shell prompt is a dead worker: close it, create a fresh terminal, never dispatch into it.

### Worker engine

Workers run on `claude` by default; `--engine cursor` runs them all on `cursor-agent`. One engine per run. The coordinator is always the invoking Claude Code session.

| `--engine` | terminal command |
| ---------- | ---------------- |
| `claude` (default) | `claude --effort medium --dangerously-skip-permissions` |
| `cursor` | `cursor-agent` |
| `cursor:<model-id>` | `cursor-agent --model <model-id>` |

`--engine cursor` requires `/setup-cursor-worker` to have been run on this machine — check `which cursor-agent && cursor-agent status` first and stop if either fails; never silently fall back to `claude`.

Launch cursor **bare** unless the user named a model: a bare `cursor-agent` inherits the account's current model selection (set in the TUI's `/model` picker — see `/setup-cursor-worker`), which is the only route to 1M context. Every flat id passed via `--model` resolves to 300K, and the base id and the bracket syntax from `--help` are rejected outright, killing the agent on startup.

## 5. Merge back in DAG order

As each worktree finishes: merge it into the current branch, resolve conflicts, rerun the profile's post-merge check on the merged result, mark the ticket done (edit the ticket file's Status locally; close the issue on GitHub), then dispatch any tickets it just unblocked — the frontier advances.

Commits follow the profile's commit policy. Never bare `git stash` in shared worktrees.

## 6. Run to completion

Escalate only on an unresolvable merge conflict or a ticket whose acceptance criteria contradict the spec. Done when every ticket is merged and marked, closed out by a final report — per ticket: status, branch, files changed, checks run, blockers hit.
