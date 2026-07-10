---
name: autoship
description: Take a free-text idea or an Issue reference through the autonomous pipeline — spec, Issues, Frontier drain — to one reviewable PR. Requires Orca orchestration and a repo configured by /setup-matt-pocock-skills.
disable-model-invocation: true
---

# Autoship

Autoship takes one argument — an idea or an existing Issue — and drives it through the full quality pipeline autonomously: align it into a spec, slice it into Issues, drain the Frontier one Issue at a time, and end in **one pull request** whose description carries everything a reviewer needs. The invoking session is the coordinator; it replaces the human at every gate. Later phases (Frontier drain, failure handling) are specified in later sections as they land; today the pipeline runs through Align — spec and Issues published — and stops.

This file states what each phase must achieve. The concrete commands behind the checks and lookups live in [reference.md](./reference.md).

## Preconditions — stop and report

Verify both before doing anything else (check commands in [reference.md](./reference.md)). A failed precondition ends the run immediately with a report of exactly what is missing and how to fix it. Never improvise around a missing precondition — no fallback agents, no substitute trackers, no partial runs.

1. **Orca orchestration is available.** The Orca runtime is running and orchestration commands answer. Fix: start Orca and enable orchestration in Settings > Experimental.
2. **The target repo is configured.** `/setup-matt-pocock-skills` has been run here — its Issue-tracker output exists in the repo. Fix: run `/setup-matt-pocock-skills` in the target repo first.

## Phases

Intake through Align exist so far; later phases append below them as they are built.

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

**Never block.** The run never waits for a human. An ungrounded question gets the most reversible answer — the one cheapest to undo when PR review proves it wrong — and an entry in the **assumptions log**: `.scratch/autoship/assumptions.md` in the run worktree, one entry per decision recording the question, the answer given, and why it was the most reversible option. The log travels into the PR description in a later phase; it is what makes reviewing the PR a sufficient audit of the whole run.

### 4. Publish and report

The align phase ends when the worker has published the spec and the Issues — each Issue carrying its blocking edges — to the target repo's configured tracker, following its `docs/agents/issue-tracker.md`, and sent `worker_done`. The coordinator verifies the published artifacts, then reports to the user: where the spec lives, the published Issues with their edges, and the assumptions log (even if empty). **In this version, the run ends here** — the Frontier drain continues the run in later sections.

## Gotchas

- **Read, never invoke.** to-spec and to-tickets are user-only (`disable-model-invocation: true`) — a worker cannot Skill-invoke them. The align worker reads all four SKILL.md files and follows them in its own context, which is also what keeps the grill → spec → slice sequence in the single window to-spec requires.
- **Wait for tui-idle before dispatching.** Dispatching into a worker terminal that is still starting up races the agent's TUI and loses the task.
- **A silent wait window is a checkpoint, not a failure.** Align interviews run long. When a wait returns nothing, check that the worker terminal is alive and keep waiting — never restart or kill a worker just because it is slow.
