---
title: autoship — idea-or-issue → autonomous pipeline → one PR
status: open
triage: ready-for-agent
created: 2026-07-10
---

# Spec: autoship

## Problem Statement

Shipping a piece of work through the full quality pipeline (grill the idea, write a spec, slice it into Issues, implement each, review each, open a PR) currently requires the user to sit at the keyboard for every phase: typing `/grill-with-docs`, answering the interview, typing `/to-spec`, `/to-tickets`, approving the breakdown, then running `/implement` once per Issue in fresh sessions. The pipeline is high-quality but human-serial — an idea filed in the evening waits until the user has hours free. The old `ship-ticket` command automated the tail but kept two hard human gates and was hard-wired to one company repo.

## Solution

A user-invoked skill, `autoship`, that runs the entire pipeline autonomously using Orca orchestration: a coordinator agent replaces the human at every gate, worker agents in a dedicated Orca worktree run the existing engineering skills (grilling + domain-modeling, to-spec, to-tickets, implement with its embedded code-review), and the run ends in one pull request whose description carries everything a human needs to judge it — spec summary, assumptions log, per-Issue status. The user fires one command and reviews one PR.

## User Stories

1. As the skill user, I want to invoke `autoship` with a free-text idea, so that work I describe in one sentence gets shipped without further attention from me.
2. As the skill user, I want to invoke `autoship` with a reference to an existing Issue in the configured Issue tracker, so that already-triaged work can be driven to a PR.
3. As the skill user, I want the run to happen in a fresh Orca worktree, so that my current worktree stays free while the run proceeds.
4. As the skill user, I want the skill to stop and report if Orca orchestration is unavailable or the target repo has no Issue tracker configuration, so that it never improvises around missing prerequisites.
5. As the skill user, I want every decision the pipeline could not ground in my brief or the repo docs recorded in an assumptions log, so that I can audit what was guessed.
6. As the skill user, I want the assumptions log surfaced in the PR description, so that PR review is a sufficient gate for the whole run.
7. As the skill user, I want one PR per run rather than one per Issue, so that review effort stays proportional to the feature.
8. As the skill user, I want a failed run to leave a draft PR with a report of what landed and what failed, so that partial work is never lost or silently shipped as ready.
9. As the skill user, I want Issues closed or linked per the tracker configuration when the run succeeds, so that the Issue tracker reflects reality without manual bookkeeping.
10. As the coordinator, I want the intake normalized into a source brief, so that every later proxy answer is grounded in one document.
11. As the coordinator, I want to answer align-worker questions via orchestration ask/reply grounded in the source brief, CONTEXT.md, and ADRs, so that the pipeline never stalls waiting for a human.
12. As the coordinator, I want to make the most reversible choice when a question is ungrounded, so that wrong guesses stay cheap to undo.
13. As the coordinator, I want the published Issues mirrored into orchestration tasks with dependency edges, so that I have external memory of the Frontier across a long run.
14. As the coordinator, I want to dispatch exactly one Issue worker at a time in dependency order, so that vertical slices of the same feature never collide.
15. As the coordinator, I want to halt dispatch when an Issue circuit-breaks, so that work downstream of a failure is never attempted.
16. As the align worker, I want to run the grilling interview, spec synthesis, and Issue slicing in one context, so that to-spec's "synthesize the current conversation" works as designed.
17. As the align worker, I want to read the user-only SKILL.md files and follow them rather than Skill-invoke them, so that skill invocability rules are respected.
18. As the align worker, I want to publish Issues with blocking edges to the configured Issue tracker, so that the back half has a real Frontier to drain.
19. As an Issue worker, I want a fresh terminal with only my Issue and the spec as context, so that context from earlier Issues never pollutes my work.
20. As an Issue worker, I want to follow the implement skill including its embedded code-review, so that every Issue is reviewed before it is committed.
21. As an Issue worker, I want a bounded review loop — fix must-fix findings, re-review once, log residuals — so that a subjective reviewer cannot trap me indefinitely.
22. As an Issue worker, I want to report worker_done exactly once with my status and residual findings, so that the coordinator's picture of the run is accurate.
23. As the PR reviewer (the user, later), I want the PR description to contain the spec summary, assumptions log, and per-Issue results, so that I can judge the run without replaying it.
24. As the skill user, I want the skill's prose to use the glossary terms Issue and Frontier, so that the vocabulary stays consistent across the skills collection.
25. As the repo owner, I want autoship kept in the personal bucket, so that a skill requiring my Orca setup is never promoted to users who cannot run it.

## Implementation Decisions

- **Form**: one new skill, `autoship`, user-invoked (`disable-model-invocation: true`), in the `personal/` bucket. Entry in `personal/README.md`'s flat list only — no top-level README entry, no plugin.json, no docs page (non-promoted bucket rules). Installed via the existing symlink script.
- **Preconditions** (stop-and-report, never improvise): Orca runtime running with orchestration enabled; target repo has been configured by `/setup-matt-pocock-skills` (its issue-tracker output exists).
- **Intake**: argument is free text or an Issue reference; the coordinator normalizes either into a **source brief**.
- **Run isolation**: coordinator creates one fresh Orca worktree per run, branched from the repo default base; all workers are terminals in that worktree.
- **Roles**: the coordinator (the invoking session) is the product-owner proxy and DAG owner. One **align worker** runs grilling + domain-modeling, then to-spec, then to-tickets, in a single context, asking the coordinator questions via orchestration ask/reply. One **Issue worker** per Issue, dispatched sequentially, follows the implement skill.
- **Gate policy**: never block. Ungrounded decisions take the most reversible option and are recorded in an **assumptions log** that travels to the PR description. No escalations, no human gates mid-run.
- **Frontier drain**: coordinator mirrors published Issues into orchestration tasks with dependency edges, dispatches the Frontier one Issue at a time in dependency order, each in a fresh terminal, one commit per Issue on the run branch.
- **Review loop**: bounded at two review cycles per Issue — fix must-fix findings, re-review once, log residual findings in the worker_done payload.
- **Done means**: branch pushed, one PR to the repo default base; description carries spec summary, assumptions log, per-Issue status and residual findings; Issues closed/linked per tracker configuration.
- **Failure**: a circuit-broken Issue halts dispatch; completed work is pushed as a **draft** PR with a report of completed/failed Issues and the assumptions log; Issues stay open.
- **Vocabulary**: Issue and Frontier throughout (both now in CONTEXT.md); "ticket" and "queue" do not appear.
- **Progressive disclosure**: SKILL.md states roles, outcomes, and gotchas; the concrete orca CLI invocations live in a reference file beside it, mirroring the orchestration skill's own command reference.

## Testing Decisions

- A good test judges **external behavior only**: the artifacts a run leaves behind (worktree, published spec and Issues with edges, commits, PR contents), never the internal message choreography (ask/reply traffic, task mirroring), which is implementation detail.
- **One seam, end-to-end**: invoke `/autoship` on a sandbox repo (Orca running, tracker setup done there) with a trivial idea. Verify: run worktree created; spec published; Issues with blocking edges published; one commit per Issue; PR opened whose description contains spec summary, assumptions log, per-Issue status.
- **Failure path** through the same seam: a run containing one deliberately impossible Issue must halt and produce a draft PR with an accurate completed/failed report.
- Prior art: the skill-creator skill's eval approach (invoke the skill, judge the output) is the closest existing pattern in this collection; there is no per-phase test harness for skills and none is added.

## Out of Scope

- Parallel Frontier dispatch and worktree-per-Issue merge coordination (upgrade path if sequential runs feel slow).
- Escalation gates, confidence thresholds, or any mid-run human touchpoint (revisit only if runs produce confidently-wrong specs).
- Promotion to `engineering/`, docs page, ask-matt routing (blocked on shedding the Orca dependency, which is not planned).
- Runtime-proof evidence capture (the old ship-it demo video) — no repo-agnostic equivalent exists; code-review is the per-Issue quality bar.
- Multi-run concurrency in one repo; retries beyond the orchestration circuit-breaker; any non-Orca fallback (e.g. Agent tool) when orchestration is unavailable.

## Further Notes

- The known epistemic trade-off, accepted deliberately: with no human between intake and PR, grilling sharpens *consistency* rather than *intent*. The assumptions log and draft-PR failure mode are the mitigations; if they prove insufficient, the fix is an escalation gate, not prompt tuning.
- The old `ship-ticket`'s two-tracker model collapses here to whatever single tracker the target repo's setup configured; evidence-back-to-Jira has no equivalent and is dropped, not ported.
