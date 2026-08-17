# Claude Marketplace

A marketplace of Claude Code plugins — skills, MCP servers, and the vendored subtrees they build on.
A glossary and nothing else: rules live in `CLAUDE.md`, decisions in [`docs/adr/`](./docs/adr/).

## Delegation

**Coordinator**:
The invoking Claude Code session in a delegated run. Owns the DAG, dispatch, merge-back, and every
write to the delegation profile.
_Avoid_: orchestrator, parent agent

**Worker**:
One agent in one child worktree, implementing exactly one ticket.
_Avoid_: subagent, child agent

**Frontier**:
The tickets whose blockers have all merged back, and which can therefore dispatch now.
_Avoid_: ready queue, next batch

**Integration branch**:
The branch a run merges every worker's slice back into, and the base its worktrees are cut from.
Distinct from the repo's default base, which is what a worktree gets when nobody names one.
_Avoid_: target branch, parent branch, base branch (which names a flag, not this)

**Delegation profile**:
A repo's `docs/agents/delegate-profile.md` — the facts a delegated run needs about that repo. A
**snapshot** of what is true now, not a ledger of what was.
_Avoid_: repo profile, worker config

**Baseline**:
A recorded measurement of a check on a known-good tree: the counts, the commit, the date. Names the
measurement, never the tree it was measured on.
_Avoid_: clean run, reference run

**Known noise**:
A check failure that reproduces on the integration branch independent of any worker's changes. A
failure becomes known noise by being named in the baseline; until then it is a regression.
_Avoid_: flaky, pre-existing failure, expected failure

**Prohibition**:
A repo rule injected verbatim into every worker brief, true only because the work is delegated.
Its counterpart is a **Convention**, which the repo's own agent guide owns.
_Avoid_: worker constraint, guardrail

## Review

**Track**:
One independently-contexted reviewer in a review run, whose report is printed verbatim and scored
only against itself. Tracks are never merged or ranked against each other.
_Avoid_: lane, pass, reviewer

**Stage**:
One serial phase of a review run, sharing the run's context and working tree — `pr-review` reports in
one and fixes in the next. Stages are ordered and may each depend on the last; a **Track** is
concurrent, isolated, and never merged or ranked. What runs in sequence is a stage, never a track.
_Avoid_: track (the error this term exists to prevent), round, leg — and **Step**, which is one
numbered instruction inside a stage, not the stage itself

**Read-only run**:
A review run whose working tree could not be moved to the PR head, so only the read stage exists —
the report is complete and valid, and the fix, sync and proof stages are absent. Named by the reason
it happened, never by the stages that are missing.
_Avoid_: degraded run, failed run, dry run, report-only run

**Admission**:
Whether a finding is one the fix stage will act on. Decided per **Track**, never by severity — a
severity orders the queue once admission has already happened.
_Avoid_: filtering, triage, gating, in scope

**Apply set**:
The admitted findings of one review run — what the fix stage edits. Its complement is described
rather than applied, always with a stated reason; a finding in neither set is a stage that has not
finished.
_Avoid_: fix list, queue (which is the apply set in order), backlog

**Axis**:
One question a single review skill asks of a diff — `matt:code-review` asks two, Standards and Spec.
An axis belongs to the skill that asks it; a **Track** is who ran it. Two of `pr-review`'s three
tracks are that skill's two axes.
_Avoid_: dimension, angle

## Plugins

**Subtree**:
A vendored upstream repo under `plugins/`, synced with `git subtree`. Each is either **verbatim** or
**editable** — the distinction is per-subtree and load-bearing.
_Avoid_: vendored dir, fork
