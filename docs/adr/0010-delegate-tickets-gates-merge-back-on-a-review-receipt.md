# 10. `delegate-tickets` gates merge-back on a review receipt

- **Status:** Accepted
- **Date:** 2026-08-21
- **Follows:** [ADR-0006](./0006-delegate-tickets-unpinned-behind-a-confirmation-gate.md)

## Context

A dispatched worker's code review is the only quality bar `/sss:delegate-tickets` puts on the work
it merges. The profile's post-merge check is static and offline; it cannot see a standards breach.
Nothing in the chain checked that the review ran.

Two read-only sweeps of this host's Claude Code history — 82 ticket-worker sessions and 40
coordinator sessions, 2026-08-02 to 2026-08-21 — measured what that cost:

- **22 of 82 workers ran no review of any kind.** Each read `implement`'s "Once done, use
  `/code-review`" line into context and never mentioned it again.
- **7 more ran a different review.** The bare name `/code-review` resolves to a **built-in** skill,
  not matt's two-axis one. One (`orchestrator-ticket-unattended-gate`) spawned 33–35 agents and
  burned roughly 400 transcript lines waiting on it.
- **2 were briefed at a path that does not exist**, read the error, and ran nothing. **2 died
  mid-review** and shipped a commit with no verdict and no `worker_done`.
- Of the **52** that did run the two-axis review, **51 came back with findings**. 21 applied them
  only partially, and **4 hard or correctness findings were dropped in silence** — one still sits in
  a merged repo (`qa-failures.mjs:275`, a re-implemented case rule the review told the worker to
  import).

The coordinator caught none of it, for one mechanical reason: **in 40 sessions, coordinators opened
a worker's review 0 times.** No `Read`, `Grep`, or `cat` of anything review-shaped. The review
reached them only as narrative — one clause inside a 3-sentence `worker_done` body. Coordinators
were not credulous about the *code*: 24 of 40 found something in their own merge-back diff read, and
they reran gates on the merged result rather than on report. But that read is a diff read. It caught
cross-branch damage — same-name-different-signature merges git reported no conflict for, colliding
ADR numbers, gates green on a worker tree and red on the merged one — and it never covered
standards.

Two incidents show the shape of the loss. A worker skipped its review, restarted after `worker_done`,
found **two real defects in code the coordinator had already merged**, and could not report them:
its dispatch capability was revoked, its second report rejected, its `ask` failed. Another worker's
review returned **5 findings including a P0 that hollowed out the acceptance gate** — after the
merge, sent as an escalation labelled "no action needed".

The clean fix is not available. `implement` and `code-review` live under
`plugins/mattpocock-skills/`, a vendored subtree; an edit there is destroyed by the next
`git subtree pull`.

## Decision

**A worker's review leaves a receipt, and a branch without one does not merge.**

- The worker writes `/tmp/<ticket-slug>/review.md` **before** it sends `worker_done`, listing every
  Standards and Spec finding with the fix that answers it, and passes it as `--report-path`.
- **Every finding is the worker's to fix.** A finding the profile's Prohibitions put outside its
  reach goes under a `HANDOFF` heading and belongs to the coordinator at merge-back.
- The brief names `code-review`'s **resolved absolute path**, and the definition of done names both
  axes.
- At merge-back the coordinator opens the receipt. Missing: run the **Standards axis** on that
  branch, then merge.

Stated as a definition-of-done clause, not as process — step 5 already forbids re-specifying
`implement` or hand-writing a substitute into the brief.

`receipt` is deliberate vocabulary. It carries proof-produced-at-the-time and presentable-on-demand
without defining either, and it gives the merge-back rule a binary form: no receipt, no merge.

Three alternatives were weighed and rejected:

- **Self-report in the `worker_done` body.** Unfalsifiable. A worker that dropped its findings
  reports "review clean", which is the failure being fixed.
- **A per-repo profile field.** This is a property of the `implement` chain, not of a repo. A field
  lets a repo omit the gate, and the profile template caps Prohibitions at ten precisely to resist
  this growth.
- **Both axes on a gate trip.** At a ~1-in-3 trip rate that is a second full review on a third of
  all tickets. The Spec axis is the half the coordinator's diff read already substitutes for.

## Consequences

**Absence becomes visible.** A review that never ran and a review that came back clean are today
indistinguishable to the coordinator. One is now a missing file.

**Roughly one branch in three pays for a Standards review it did not do.** 22 + 7 + 2 + 2 of 82 is
the measured trip rate on historical runs. A healthy run pays nothing.

**`fix all` holds at the run level, not the worker level.** Without `HANDOFF`, a worker facing a
finding Prohibition 7 or 10 forbids it from fixing must either break a prohibition or write a false
receipt — and a false receipt corrupts the artifact the gate reads. The escape hatch is what keeps
the strict bar honest.

**The gate catches absence, not dishonesty.** A worker that writes a receipt claiming fixes it never
made passes. That was not the observed failure: 31 of 82 sessions failed by not reviewing at all.

**One test guards it.** `tests/test_delegate_tickets_review_gate.py` asserts the six load-bearing
clauses against the shipped prose. The guarded failure is a maintainer trimming the gate for length,
which takes several clauses at once — hence one file that fails loudly over six that each fail
quietly.

**Other measured frictions are left alone.** `tui-idle` reporting a dead pane as alive (26 of 40
sessions), missing `node_modules` in fresh worktrees (14), `cursor-agent`'s Workspace Trust block
(12), stale GitHub `blocked_by` summaries (8). Real, separate tickets.
