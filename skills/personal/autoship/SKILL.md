---
name: autoship
description: Take a free-text idea or an Issue reference through the autonomous pipeline — spec, Issues, Frontier drain — to one reviewable PR. Requires Orca orchestration and a repo configured by /setup-matt-pocock-skills.
disable-model-invocation: true
---

# Autoship

Autoship takes one argument — an idea or an existing Issue — and drives it through the full quality pipeline autonomously: align it into a spec, slice it into Issues, drain the Frontier one Issue at a time, and end in **one pull request** whose description carries everything a reviewer needs. The invoking session is the coordinator; it replaces the human at every gate. The user fires one command and reviews one PR.

This file states what each phase must achieve. The concrete commands behind the checks and lookups live in [reference.md](./reference.md).

## Preconditions — stop and report

Verify both before doing anything else (check commands in [reference.md](./reference.md)). A failed precondition ends the run immediately with a report of exactly what is missing and how to fix it. Never improvise around a missing precondition — no fallback agents, no substitute trackers, no partial runs.

1. **Orca orchestration is available.** The Orca runtime is running and orchestration commands answer. Fix: start Orca and enable orchestration in Settings > Experimental.
2. **The target repo is configured.** `/setup-matt-pocock-skills` has been run here — its Issue-tracker output exists in the repo. Fix: run `/setup-matt-pocock-skills` in the target repo first.

## Phases

One continuous run: Intake → Run worktree → Align → Publish → Drain → Ship.

### 1. Intake

The argument is either **free text** (an idea in the user's words) or an **Issue reference** in the repo's configured Issue tracker. Normalize whichever arrived into a **source brief** — the single document every later decision in the run is grounded in. A source brief contains:

- **Problem** — what needs to exist or change, in one or two paragraphs.
- **Constraints** — anything the input fixes in advance: scope limits, named approaches, out-of-bounds areas. Empty is fine; invented constraints are not.
- **Provenance** — where the brief came from: the verbatim free text, or the Issue reference plus which tracker it was fetched from and when.

For free text, synthesize the brief from the words given — capture intent faithfully, add nothing. For an Issue reference, fetch the Issue from the configured tracker (lookups in [reference.md](./reference.md)) and distill its title, body, and any linked discussion into the same shape.

Report the source brief to the user, then proceed.

### 2. Run worktree

Every run gets one fresh Orca worktree, created top-level and branched from the **repo default base** — never from the invoking branch; anything the run needs to know about the invoking branch goes into the source brief instead. The worktree name is derived from the brief (a short slug of the problem). The invoking worktree stays untouched for the whole run: every worker is a terminal in the run worktree, and every artifact the run produces lives there. Creation commands and base-branch rules are in [reference.md](./reference.md).

### 3. Align

One **align worker** — a fresh agent terminal in the run worktree — turns the source brief into a spec and published Issues. It reads and follows four skills as instructions (paths in [reference.md](./reference.md)): grilling plus domain-modeling to stress-test the brief, to-spec to synthesize the spec, to-tickets to slice it into Issues with blocking edges. All four run **in one continuous context**: to-spec synthesizes the current conversation, so the grilling interview must still be in the window when the spec is written. The worker never Skill-invokes any of them — it reads the files and follows them (see Gotchas).

Wherever those skills address "the user", the user is the coordinator. The worker routes every question over orchestration ask/reply, and the coordinator answers as the **product-owner proxy**, grounded in exactly three sources: the source brief, the target repo's `CONTEXT.md`, and its ADRs. An answer that none of those supports is **ungrounded**.

**Never block.** The run never waits for a human. An ungrounded question gets the most reversible answer — the one cheapest to undo when PR review proves it wrong — and an entry in the **assumptions log**: `.scratch/autoship/assumptions.md` in the run worktree, one entry per decision recording the question, the answer given, and why it was the most reversible option. The log travels into the PR description at Ship; it is what makes reviewing the PR a sufficient audit of the whole run.

### 4. Publish

The align phase ends when the worker has published the spec and the Issues — each Issue carrying its blocking edges — to the target repo's configured tracker, following its `docs/agents/issue-tracker.md`, and sent `worker_done`. The coordinator verifies the published artifacts, then reports progress to the user: where the spec lives, the published Issues with their edges, and the assumptions log so far. Nothing here waits for approval — the run continues straight into the drain; the PR is the gate.

### 5. Drain the Frontier

First, mirror the DAG: one orchestration task per published Issue, with dependency edges matching the published blocking edges exactly. From here the task list is the coordinator's **external memory of the Frontier** — which Issue can start next is always recomputed from the task DAG, never recalled from the context window; a long run must survive the coordinator remembering nothing but this list.

The drain is strictly sequential: exactly one Issue worker at a time, in dependency order, each dispatched into a **fresh terminal in the run worktree**. A worker's context is deliberately small: its single Issue, the spec, and the conventions agreed during align — nothing from earlier Issues. The worker reads and follows the implement skill (user-only — read, never Skill-invoke), which ends in code-review and a commit.

The review loop is bounded: fix every must-fix finding, re-review once, then stop — whatever remains rides along as **residual findings** in the `worker_done` payload. Two review cycles per Issue, hard cap; a subjective reviewer must never trap a worker. Each Issue lands as **exactly one commit** on the run branch. On a successful `worker_done`, the coordinator records the Issue's status and residual findings (they travel to the PR description), marks the task completed, and dispatches the next ready Issue.

### 6. Ship

When the last Issue completes, the coordinator pushes the run branch and opens **one pull request** against the repo default base. The PR description is the run's entire report: the spec summary, the assumptions log (even if empty), and per-Issue status with residual findings. Issues are closed or linked per the target repo's tracker configuration. The PR is where the human judges the run, so the description must be sufficient on its own — whatever it omits, the reviewer will never see. Report the PR URL to the user; the run ends.

## Gotchas

- **Read, never invoke — code-review is the one exception.** to-spec, to-tickets, and implement are user-only (`disable-model-invocation: true`) — no worker can Skill-invoke them. Workers read those SKILL.md files and follow them in their own context, which is also what keeps the align worker's grill → spec → slice sequence in the single window to-spec requires. code-review is model-invocable, so an Issue worker may Skill-invoke it where implement calls for it.
- **A fresh terminal per Issue is non-negotiable.** A reused terminal drags the previous Issue's assumptions, half-read files, and debugging state into work that must stand alone. New terminal per Issue — even when an idle one is sitting right there.
- **Sequential on purpose.** The Issues are vertical slices of one feature, sharing one worktree and one branch; two workers at once collide in the same files. One at a time, in dependency order — parallel drain is out of scope.
- **Wait for tui-idle before dispatching.** Dispatching into a worker terminal that is still starting up races the agent's TUI and loses the task.
- **A silent wait window is a checkpoint, not a failure.** Align interviews and Issue implementations run long. When a wait returns nothing, check that the worker terminal is alive and keep waiting — never restart or kill a worker just because it is slow.
