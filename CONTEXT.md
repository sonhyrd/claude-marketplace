# Claude Marketplace

A marketplace of Claude Code plugins — skills, MCP servers, and the vendored subtrees they build on.
This glossary pins the terms the skills use about *themselves* and about the delegated runs they
coordinate. It is a glossary, not a spec: no implementation details, no decisions (those are
[ADRs](./docs/adr/)).

## Delegation

**Delegation profile**:
The repo-specific facts `/delegate-tickets` needs to run against a given repo, living in that repo
as `docs/agents/delegate-profile.md`. Records what is true *now*, never what was true before
([ADR 0004](./docs/adr/0004-delegate-profile-amendments-replace-rather-than-stack.md)).
_Avoid_: repo profile, PROFILES.md entry, worker config

**Integration branch**:
The branch a delegation run merges every worker's slice back into — the coordinator's own branch,
and the base every worker worktree is cut from. Distinct from the repo default base (`main`), which
is what `orca worktree create` uses when nobody says otherwise.
_Avoid_: target branch, parent branch, base branch (which names the *flag*, not the concept)

**Baseline**:
A recorded measurement of a check's result on a known-good tree — the counts, the commit, the date.
Names the *measurement*, never the tree it was measured on. A profile carries exactly one per check.
_Avoid_: clean run, reference run

**Known noise**:
A check failure that reproduces on the integration branch independent of any worker's changes, and
so must not block a merge-back. A failure is known noise only once it is named in the baseline;
until then it is a regression.
_Avoid_: flaky, pre-existing failure, expected failure

**Prohibition**:
A repo rule injected **verbatim** into every worker brief, because a worker that has not read it
will plausibly break it and cost a rerun. Capped at ten. Distinct from a **Convention**, which the
repo's agent guide owns and the profile only points at.
_Avoid_: worker constraint, guardrail, rule

**Frontier**:
The set of tickets whose blockers have all merged back, and which can therefore dispatch now. It
advances as merge-backs land.
_Avoid_: ready queue, next batch

**Worker**:
One agent in one Orca child worktree, implementing exactly one ticket. Runs on the run's engine
(`claude` or `cursor-agent`), never coordinates, never owns merge-back.
_Avoid_: subagent, child agent

**Coordinator**:
The invoking Claude Code session. Owns the DAG, dispatch, merge-back, and every write to the
delegation profile. Always Claude Code, whatever engine the workers run.
_Avoid_: orchestrator, parent agent

## Plugins

**Subtree**:
A vendored upstream repo living under `plugins/`, synced with `git subtree`. Either **verbatim**
(`mattpocock-skills` — never edit) or **editable and bidirectional** (`e2e-skills` — edit in place
and push back). The distinction is per-subtree and load-bearing; see `CLAUDE.md`.
_Avoid_: vendored dir, fork

**Plugin name vs directory name**:
The name a host invokes a skill by (`matt`, `e2e`) is set in `plugin.json` and need not match the
directory, which is fixed by the subtree prefix. `/e2e:pw-prove` lives in `plugins/e2e-skills/`.
