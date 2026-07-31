---
name: delegate-tickets
description: Delegate an approved ticket tree to parallel Orca workers — one child worktree per ticket, dispatched in DAG order and merged back as each finishes.
disable-model-invocation: true
---

# Delegate Tickets

Delegate a ticket tree produced by `/to-tickets` to parallel workers, coordinated with the `/orchestration` skill: one Orca child worktree per ticket, dispatched in DAG order, merged back into the current branch as each finishes.

The tickets' **blocking edges ARE the dependency DAG** — use them as-is, never re-derive dependencies. Wide refactors already serialize through their edges by construction.

> **Plugin prerequisites.** Requires the `matt` plugin from this marketplace (for
> `/to-tickets` and `/implement`) and an Orca install (for `/orchestration`). See
> [references/quickstart.md](references/quickstart.md).

## 1. Resolve the repo profile

Match `git remote get-url origin` against the profiles in [PROFILES.md](PROFILES.md). No match → interview the user for each field in the profile template, append the new profile to `PROFILES.md`, then continue. The profile supplies every repo-specific value the steps below reference: branch prefix, post-merge check, commit policy, worker constraints.

## 2. Resolve the ticket tree

Read the target repo's `docs/agents/issue-tracker.md` (written by `/setup-matt-pocock-skills`) to learn where tickets live:

- **Local files** → tickets are `.scratch/<feature-slug>/issues/*.md`. The argument is the feature slug; with no argument, use the only `.scratch/*/issues/` directory if exactly one exists, otherwise ask which.
- **GitHub** → the argument names the parent issue, label, or milestone; fetch every ticket under it, including its blocking links.

If `issue-tracker.md` doesn't exist: fall back to a `.scratch/*/issues/` tree if one exists; otherwise stop and point the user at `/setup-matt-pocock-skills`.

## 3. Print the DAG

Read every ticket file/issue. Print the DAG: which tickets are unblocked now, which wait on what. Done when every ticket in the tree is accounted for as either unblocked or blocked-by-named-tickets.

## 4. Preflight the orchestration runtime

Before building any briefs, worktrees, or terminals, prove the orchestration lifecycle actually writes. `run-create` succeeding proves nothing — the runtime can be fenced per-command:

```bash
orca orchestration task-create --spec "PROBE" --json
```

`"ok": false` with `code: legacy_read_only` ("this retained legacy coordinator could not prove its original process identity") means the whole lifecycle is fenced and no supervised dispatch is possible. **Stop and ask the user to quit and reopen the Orca app** — restarting this session or spawning a fresh terminal does not clear it, and `orca orchestration reset --all` wipes task history for *every* run, so never reach for it while other worktrees hold live agents. Delete the probe task once it succeeds.

This step is cheap and it is the whole point of doing it first: a run that discovers the fence at dispatch time has already spent its setup budget.

## 5. Dispatch the frontier

Coordinate through the `/orchestration` skill — real Orca task/dispatch state, not generic subagents.

- One Orca **child worktree** per ticket, branched off the current branch as `<branch-prefix><ticket-slug>`.
- Dispatch the unblocked frontier in parallel, but **cap concurrency at 2 workers** unless the user raises it. Each worktree creation fires the repo's setup hook (`pnpm install` and friends); a wider fan-out puts those in contention and `orca terminal create` blocks past the Bash timeout, leaving half-built workers. It also keeps the merge-back review surface small enough to actually check. A blocked ticket dispatches only after ALL its blockers have merged back.
- Each worker gets a fresh session in its worktree. Its prompt must tell it to **read and follow `~/.claude/skills/implement/SKILL.md` by absolute path**, then name its ticket ref, then carry the profile's worker constraints verbatim. Path-reading rather than `/implement` is deliberate: `implement` is user-only (`disable-model-invocation: true`), so no dispatched worker of any engine can Skill-invoke it. `implement` drives TDD and `code-review` itself — don't re-specify them, and never hand-write a substitute process into the brief. Definition of done: `implement` closes clean, plus the profile's post-merge check passes.
- Where a brief is too long to inject as one message, write it to a file (`/tmp/<slug>/<ticket>.md`) and send a one-liner pointing at the file — but the brief still *points at* `implement`'s SKILL.md rather than restating it.
- Launch every worker with the run's engine argv (below), via orca-cli's custom-argv path — `terminal create --command '<engine argv>'` — not the bare default launcher.
- **Confirm each worker actually started before dispatching.** `terminal wait --for tui-idle` is satisfied by the bare shell that exists before a TUI mounts, and by the shell an agent leaves behind when it dies on startup — so follow it with `terminal read` and require a rendered agent frame, re-reading up to 5 times. A pane showing only a shell prompt is a dead worker: close it, create a fresh terminal, never dispatch into it.

### Worker engine

Workers run on `claude` by default; `--engine cursor` runs them all on `cursor-agent`. One engine per run. The coordinator is always the invoking Claude Code session.

| `--engine` | terminal command |
| ---------- | ---------------- |
| `claude` (default) | `claude --effort medium --dangerously-skip-permissions` |
| `cursor` | `cursor-agent --force` |
| `cursor:<model-id>` | `cursor-agent --force --model <model-id>` |

`--force` (alias `--yolo`) is cursor's `--dangerously-skip-permissions`. An unattended worker that hits an approval prompt does not slow down, it hangs: the terminal stays alive and `tui-idle` reports ready while the agent waits forever.

`--engine cursor` requires `/setup-cursor-worker` to have been run on this machine — check `which cursor-agent && cursor-agent status` first and stop if either fails; never silently fall back to `claude`.

Pass **no `--model`** unless the user named one: a `cursor-agent` launched without it inherits the account's current model selection (set in the TUI's `/model` picker — see `/setup-cursor-worker`), which is the only route to 1M context. Every flat id passed via `--model` resolves to 300K, and the base id and the bracket syntax from `--help` are rejected outright, killing the agent on startup.

## 6. Merge back in DAG order

As each worktree finishes: merge it into the current branch, resolve conflicts, rerun the profile's post-merge check on the merged result, mark the ticket done (edit the ticket file's Status locally; close the issue on GitHub), then dispatch any tickets it just unblocked — the frontier advances.

Review each worker's branch against `git merge-base <integration-branch> HEAD`, never `<integration-branch>..HEAD`. A branch is cut from the base at dispatch time, so once siblings merge, a plain range diff renders **their** work as deletions and a clean branch reads as a revert.

Commits follow the profile's commit policy. Never bare `git stash` in shared worktrees.

## 7. Run to completion

Escalate only on an unresolvable merge conflict or a ticket whose acceptance criteria contradict the spec. Done when every ticket is merged and marked, closed out by a final report — per ticket: status, branch, files changed, checks run, blockers hit.
