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
- Each worker gets a fresh session in its worktree and runs `/implement <ticket-ref>`, with the profile's worker constraints included verbatim in its prompt. Launch every worker as `claude --effort medium --dangerously-skip-permissions` (use orca-cli's custom-argv path — `terminal create --command 'claude --effort medium --dangerously-skip-permissions'` — not the bare default launcher). `/implement` drives `/tdd` and `/code-review` itself — don't re-specify them. Definition of done: `/implement` closes clean, plus the profile's post-merge check passes.

## 5. Merge back in DAG order

As each worktree finishes: merge it into the current branch, resolve conflicts, rerun the profile's post-merge check on the merged result, mark the ticket done (edit the ticket file's Status locally; close the issue on GitHub), then dispatch any tickets it just unblocked — the frontier advances.

Commits follow the profile's commit policy. Never bare `git stash` in shared worktrees.

## 6. Run to completion

Escalate only on an unresolvable merge conflict or a ticket whose acceptance criteria contradict the spec. Done when every ticket is merged and marked, closed out by a final report — per ticket: status, branch, files changed, checks run, blockers hit.
