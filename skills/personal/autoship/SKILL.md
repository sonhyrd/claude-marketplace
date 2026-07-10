---
name: autoship
description: Take a free-text idea or an Issue reference through the autonomous pipeline — spec, Issues, Frontier drain — to one reviewable PR. Requires Orca orchestration and a repo configured by /setup-matt-pocock-skills.
disable-model-invocation: true
---

# Autoship

Autoship takes one argument — an idea or an existing Issue — and drives it through the full quality pipeline autonomously: align it into a spec, slice it into Issues, drain the Frontier one Issue at a time, and end in **one pull request** whose description carries everything a reviewer needs. The invoking session is the coordinator; it replaces the human at every gate. Later phases (align, Frontier drain, failure handling) are specified in later sections as they land; today the pipeline runs through Intake and stops.

This file states what each phase must achieve. The concrete commands behind the checks and lookups live in [reference.md](./reference.md).

## Preconditions — stop and report

Verify both before doing anything else (check commands in [reference.md](./reference.md)). A failed precondition ends the run immediately with a report of exactly what is missing and how to fix it. Never improvise around a missing precondition — no fallback agents, no substitute trackers, no partial runs.

1. **Orca orchestration is available.** The Orca runtime is running and orchestration commands answer. Fix: start Orca and enable orchestration in Settings > Experimental.
2. **The target repo is configured.** `/setup-matt-pocock-skills` has been run here — its Issue-tracker output exists in the repo. Fix: run `/setup-matt-pocock-skills` in the target repo first.

## Phases

Only Intake exists so far; later phases append below it as they are built.

### 1. Intake

The argument is either **free text** (an idea in the user's words) or an **Issue reference** in the repo's configured Issue tracker. Normalize whichever arrived into a **source brief** — the single document every later decision in the run is grounded in. A source brief contains:

- **Problem** — what needs to exist or change, in one or two paragraphs.
- **Constraints** — anything the input fixes in advance: scope limits, named approaches, out-of-bounds areas. Empty is fine; invented constraints are not.
- **Provenance** — where the brief came from: the verbatim free text, or the Issue reference plus which tracker it was fetched from and when.

For free text, synthesize the brief from the words given — capture intent faithfully, add nothing. For an Issue reference, fetch the Issue from the configured tracker (lookups in [reference.md](./reference.md)) and distill its title, body, and any linked discussion into the same shape.

**In this skeleton version, the run ends here: report the source brief to the user and stop.**
