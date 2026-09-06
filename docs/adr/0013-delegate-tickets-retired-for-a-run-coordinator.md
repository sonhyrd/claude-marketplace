# 13. Ticket fan-out is retired in favour of a run coordinator

- **Status:** Accepted
- **Date:** 2026-09-06
- **Supersedes:** [ADR-0004](./0004-delegate-profile-amendments-replace-rather-than-stack.md), [ADR-0006](./0006-delegate-tickets-unpinned-behind-a-confirmation-gate.md), [ADR-0010](./0010-delegate-tickets-gates-merge-back-on-a-review-receipt.md), [ADR-0011](./0011-delegate-tickets-dispatches-through-worker-start.md)

## Context

`/sss:delegate-tickets` took an approved ticket tree, cut one Orca child worktree per ticket,
dispatched them in DAG order, and merged each branch back as its worker finished. Four ADRs record
decisions taken while building it, and every one of them was a real decision: how profile amendments
compose (0004), the pin traded for a confirmation gate (0006), merge-back gated on a review receipt
(0010), dispatch through `worker-start` (0011).

ADR-0014 in the `sonhyrd/orchestrator` distro then put a **run coordinator** between the coordinator
and the Worker: one issue, one branch, one pull request, one gate. `run-matt` and `sss:autoship`
cover the ground `delegate-tickets` covered, under that shape.

The forcing move was elsewhere and was not a matter of preference. `delegate-tickets` step 1 reads
`docs/agents/delegate-profile.md` in the target repo, and falls to an **Absent** branch when it is
missing — a branch that interviews the user in order to *write the file back*. Two live repos
(`hyrdrocks/hyrd-widget#1326`, `hyrdrocks/nuxt-hyrd-chrysus#3659`) are deleting that file. A skill
whose missing-input branch recreates the artefact being retired cannot stay: it does not merely
survive the deprecation, it undoes it, once per repo, at the moment somebody runs it.

## Decision

Retire the skill and the profile artefacts it read. Keep the four ADRs, with their bodies untouched,
marked `Superseded` and pointing here.

## Consequences

**What is lost, measured rather than assumed.** Five Orca worker-lifecycle verbs —
`worker-start`, `worker-stop`, `worker-release`, `worker-show`, `worker-read` — lose their only
assertion in this repo. `scripts/check-delegate-cli.sh` asked a live Orca binary whether every
command the skill named actually existed, and it is renamed to `scripts/check-orca-cli.sh` and
repointed at `sss:autoship`, the successor that carries the same CLI-resolution idiom. That does not
recover the five: the only two files anywhere under `plugins/sss/skills/` that ever named any of
them are `delegate-tickets/SKILL.md` and `delegate-tickets/references/worker-launch.md`, both
deleted here. Pointing the guard at every skill that carries the idiom — `autoship`,
`setup-cursor-worker`, `pr-review`, `claude-settings` — would add three directories and cover zero
additional commands, so the single `autoship` target is taken. The reduction is **unavoidable rather
than chosen**: the document that asserted those verbs is the document being retired. `worktree
create` and `terminal wait` are not affected; `autoship` names both.

**What the fan-out did that a run coordinator does not.** Genuine parallelism across independent
tickets: N workers on N worktrees, bounded by a concurrency cap, against one pull request per ticket
tree. A run coordinator serialises a run into one issue, one branch, one pull request. For a tree of
independent tickets that is slower in wall-clock. It is taken anyway, because the fan-out's cost was
paid in the places parallelism is expensive and hard to see — merge-back conflicts between sibling
branches, a review surface that had to be gated on a receipt (ADR-0010) at a measured ~1-in-3 trip
rate, and per-repo profile state that had to be written, amended and kept true (ADR-0004) before any
of it could start. One gate on one branch removes all three, and the profile artefact disappears
with the skill that required it.

**The idiom keeps an owner.** `sss:autoship`'s `reference.md`, section "Orca orchestration", is now
the canonical statement of how an `sss` skill resolves the Orca binary, and
`scripts/check-orca-cli.sh` asserts it against that file. `setup-cursor-worker`, `pr-review` and
`claude-settings` point at it by name. Four skills citing a deleted skill as the owner of a
load-bearing idiom was the concrete breakage this retirement had to repair, and it was not visible
from the skill's own directory.
