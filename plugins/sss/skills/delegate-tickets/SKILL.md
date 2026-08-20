---
name: delegate-tickets
description: Delegate an approved ticket tree to parallel Orca workers — one child worktree per ticket, dispatched in DAG order and merged back as each finishes. Use when the user asks to delegate tickets, dispatch a ticket tree to workers, run tickets in parallel worktrees, or fan an approved plan out to Orca child worktrees.
---

# Delegate Tickets

Delegate a ticket tree produced by `/to-tickets` to parallel workers, coordinated with the `/orchestration` skill: one Orca child worktree per ticket, dispatched in DAG order, merged back into the current branch as each finishes.

The tickets' **blocking edges ARE the dependency DAG** — use them as-is, never re-derive dependencies. Wide refactors already serialize through their edges by construction.

> **Plugin prerequisites.** Requires the `matt` plugin from this marketplace (for
> `/to-tickets` and `/implement`) and an Orca install (for `/orchestration`). See
> [references/quickstart.md](references/quickstart.md).

## 1. Resolve the repo profile

### Confirmation gate — model-invoked runs only

**This is the first thing step 1 does.** Nothing above it reads a profile, creates a worktree, or starts a terminal.

| How this run started | Gate |
|---|---|
| The user typed `/sss:delegate-tickets …`, or their message named the skill | **None.** The request *is* the consent — go straight to the profile. |
| Another skill or an agent launched it through the Skill tool, with no user instruction naming it | **Stop and ask once, before any profile work.** |

The gate is what makes this skill safe to chain. A run cuts a git worktree per ticket, fires each repo's setup hook, launches autonomous agents with `--dangerously-skip-permissions`, and merges their branches back into the user's current branch — none of which a user who never asked for it can take back. It replaces the `disable-model-invocation: true` pin that used to make chaining impossible at all.

> `delegate-tickets` will dispatch the ticket tree for `<argument>` to parallel Orca workers — one
> child worktree per ticket, agents running unattended, branches merged back into
> `<current-branch>`. Run it?

The ticket count isn't known yet — the tree resolves in step 2, and resolving it first would mean reading the repo's profile and writing one if absent. Ask on the shape of the run, not on a number.

- **Yes** → continue. Ask nothing else that the profile already answers.
- **No, or no answer** → stop with one line: `delegate-tickets — declined at the confirmation gate; nothing was run.` Never a partial run, never "just the DAG then dispatch".

Once per run. A confirmed run does not re-ask at any later step.

### Profile

Read the target repo's `docs/agents/delegate-profile.md`. It supplies every repo-specific value the steps below reference: branch prefix, post-merge check, commit policy, prohibitions, conventions. Ticket location is **not** a profile field — that comes from `issue-tracker.md` in step 2.

Discovery is presence-based, not a lookup: the profile is in this repo or it isn't.

- **Present** → compare its `Remote` field against `git remote get-url origin`. On mismatch, **warn — loudly, then continue.** A profile naming another repo usually means a checkout was copied and the profile came with it. This is a warning, not a gate: presence-based discovery cannot tell a copied profile from a renamed remote, and blocking on the ambiguous case would stall more runs than it saves.
- **Absent** → interview the user inline, here, for each field in [references/profile-template.md](references/profile-template.md). Do not send them off to a setup skill; a first run must not die before it prints the DAG. Write the answers to `docs/agents/delegate-profile.md` **and** add the pointer line under `## Agent skills` in the repo's `CLAUDE.md`, then continue.

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

`"ok": false` with `code: legacy_read_only` ("this retained legacy coordinator could not prove its original process identity") means the whole lifecycle is fenced and no supervised dispatch is possible. **Stop and ask the user to quit and reopen the Orca app** — restarting this session or spawning a fresh terminal does not clear it, and `orca orchestration reset --all` wipes task history for *every* run, so never reach for it while other worktrees hold live agents.

Two other answers are not the fence and must not be treated as one:

- `run_required` — no Run is bound yet. Bind one (`run-create` / `run-use`) and probe again. This is a missing binding, not a fence, and it does **not** call for quitting the app.
- A bare usage error — you spelled a verb or flag this CLI does not have. Read `orca orchestration --help` rather than guessing a synonym; the verbs are not spelled consistently with each other, and a wrong flag fails identically to a fenced runtime.

**Retire the probe by completing it, not by deleting it** — there is no `task-delete` verb. Set its status instead (`task-update --status completed`), taking the id from the `task-create` response.

This step is cheap and it is the whole point of doing it first: a run that discovers the fence at dispatch time has already spent its setup budget.

## 5. Dispatch the frontier

Coordinate through the `/orchestration` skill — real Orca task/dispatch state, not generic subagents.

- One Orca **child worktree** per ticket, cut from the integration branch as
  `<branch-prefix><ticket-slug>`. **Pass `--base-branch <integration-branch>`** — `orca worktree
  create` defaults to the repo's default base, so an omitted flag cuts every worker from `main`.
  Then **verify it took**: `git merge-base <integration-branch> HEAD` in the new worktree must equal
  the integration branch head. An ignored flag and an absent flag fail identically, and both stay
  invisible until merge-back hands you a branch carrying commits its worker never wrote.
- Dispatch the unblocked frontier in parallel, but **cap concurrency at 2 workers** unless the user raises it. Each worktree creation fires the repo's setup hook (`pnpm install` and friends); a wider fan-out puts those in contention and `orca terminal create` blocks past the Bash timeout, leaving half-built workers. It also keeps the merge-back review surface small enough to actually check. A blocked ticket dispatches only after ALL its blockers have merged back.
- Each worker gets a fresh session in its worktree. Its prompt must tell it to **read and follow `implement`'s `SKILL.md` by absolute path**, then name its ticket ref, then carry the profile's **Prohibitions** verbatim.
  - **Resolve that path on THIS machine every run; never copy the last one you saw.** `implement` ships in the `matt` plugin, so it lives at `<marketplace-checkout>/plugins/mattpocock-skills/skills/engineering/implement/SKILL.md` — and the checkout root differs per host. `~/.claude/skills/` is the wrong place to send a worker: that directory holds a handful of symlinks, so a worker pointed there finds nothing, and **a worker that cannot find the skill invents a process and still passes the gates** — the omission is silent unless the worker happens to escalate. Locate it (`ls` the candidate, or search the marketplace checkout) and confirm the file exists **before** it goes in a brief. Prefer the marketplace checkout over any `~/.claude/plugins/cache/…` copy, which is version-pinned.
  - The brief must also spell out the absolute paths of the skills `implement` delegates to — `.../skills/engineering/tdd/SKILL.md` and `.../skills/engineering/code-review/SKILL.md` — under the same resolved root. A dispatched worker of any engine cannot invoke a slash command, so an unresolved name is a dead end for it. Leave its **Conventions** field where it is — a pointer to the repo's agent guide, which the worker loads on its own; injecting those too buries the ten rules that cost a rerun under thirty that don't. Path-reading rather than `/implement` is deliberate: `implement` is user-only (`disable-model-invocation: true`), so no dispatched worker of any engine can Skill-invoke it. `implement` drives TDD and `code-review` itself — don't re-specify them, and never hand-write a substitute process into the brief. Definition of done: `implement` closes clean, plus the profile's post-merge check passes.
- Where a brief is too long to inject as one message, write it to a file (`/tmp/<slug>/<ticket>.md`) and send a one-liner pointing at the file — but the brief still *points at* `implement`'s SKILL.md rather than restating it.
- **Acknowledge every orchestration batch you act on.** `orchestration check` returns the oldest **unacknowledged** batch, so handling a message is not the same as acking it: one unacked `worker_done` makes `check` replay that same text while every later message queues behind it, and the "you have N messages" counter climbs against a queue holding one stale item — which reads exactly like new mail arriving and being lost. Ack the batch as you handle it, with the `deliveryId` from the same response.
- **Never put backticks in a message body passed inside a double-quoted shell string.** The shell runs them as command substitution: a reply quoting a command name executes it, mangles the body, and exits non-zero, so the reply never lands — leaving a blocked worker to re-ask the identical question. Write the body to a file and pass it via `"$(cat <file>)"`, whose output is not re-parsed.
- Launch every worker with the run's engine argv (below), via orca-cli's custom-argv path — `terminal create --command '<engine argv>'` — not the bare default launcher.
- **Confirm each worker actually started before dispatching.** `terminal wait --for tui-idle` is satisfied by the bare shell that exists before a TUI mounts, and by the shell an agent leaves behind when it dies on startup — so follow it with `terminal read` and require a rendered agent frame, re-reading up to 5 times. A pane showing only a shell prompt is a dead worker: close it, create a fresh terminal, never dispatch into it.
  - **A rendered TUI frame is not the same as a running agent.** `cursor-agent` gates on **Workspace Trust per directory**, which `--force` does NOT cover, so every freshly created worktree hits it even on a machine `/setup-cursor-worker` already set up. The trust box is itself a TUI, so `tui-idle` reports ready and `terminal read` shows *something* while the agent does nothing at all. Send the single key `a` (`terminal send --text "a"`, **no `--enter`** — it is a menu key), then re-read.
  - **Match the agent's status line, never the absence of the trust box.** The dismissed box stays in scrollback and the status line lands *below* it, so a tail of the last few lines shows the trust prompt long after the agent is up — reading as a hung worker and inviting a second `a` or a needless teardown of a healthy pane. Read the tail **whole** (`terminal read --json` → `result.terminal.tail`) and require the model/branch line.

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

**Recompute the frontier from the edges themselves, not from a summary field.** On GitHub, `issue_dependencies_summary.blocked_by` lags behind the real edges: a dependent issue can still report a non-zero blocker count after every blocker is closed, which silently stalls tickets that are actually ready. The authoritative read is the dependency list — `gh api repos/<owner>/<repo>/issues/<n>/dependencies/blocked_by --jq '.[] | "#\(.number) \(.state)"'` — and a ticket is unblocked when every entry is `closed`.

**A merge-back that fails with `Unable to write index` and no conflicted paths is contention, not a conflict.** Several workers and the host app share one object store, so a concurrent write can produce that error with `MERGE_HEAD` left behind, nothing conflicted, and ample disk. `git merge --abort`, then run the identical merge once more; only investigate if the retry fails the same way. The message names the index, which invites a hunt for a phantom conflict.

**Send corrections before a worker reports, or not at all.** Any follow-up after `worker_done` restarts the worker with its dispatch capability already revoked: its second report is rejected and its `ask` fails, so it cannot reach you at all — while it may still **amend the commit you already merged**. Before closing a ticket, re-check the worker branch's head against the commit you merged; if it moved, take the delta as a patch (`git diff <merged> <new-head>`) rather than re-merging a sibling of an already-merged commit.

Review each worker's branch against `git merge-base <integration-branch> HEAD`, never `<integration-branch>..HEAD`. A branch is cut from the base at dispatch time, so once siblings merge, a plain range diff renders **their** work as deletions and a clean branch reads as a revert.

Commits follow the profile's commit policy. Never bare `git stash` in shared worktrees.

When a merge-back reveals a baseline, known-noise test, or environment trap the profile doesn't record, **amend `docs/agents/delegate-profile.md` before dispatching the next frontier** — and commit it with the work that discovered it. The profile lives in the tree you are merging into, so this is one edit, and the next worker's brief carries it.

**The profile is a snapshot, not a ledger.** It states what is true now; `git log` keeps what was
true before. So amending means rewriting the superseded line: one baseline per check, and each fact
in the field that owns it — a dispatch trap is a dispatch trap, not a post-merge check. Stack a
correction beneath a stale line and the stale one wins, because it comes first and a worker reading
top-down stops there.

**The owning file gets the fix.** When a merge-back disproves a line in the repo's `AGENTS.md`,
edit `AGENTS.md` — same tree, same commit — and leave the profile alone. Keep another file's
correction here only while that file is outside your write access.

## 7. Run to completion

Escalate only on an unresolvable merge conflict or a ticket whose acceptance criteria contradict the spec. Done when every ticket is merged and marked, closed out by a final report — per ticket: status, branch, files changed, checks run, blockers hit.
