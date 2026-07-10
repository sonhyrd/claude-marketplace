# Tickets: autoship

Build the `autoship` skill — idea-or-issue → autonomous grill/spec/slice → drain the Frontier → one PR. Source spec: `.scratch/autoship-spec.md`.

Work the **frontier**: any ticket whose blockers are all done. This chain is purely linear — top to bottom.

## Installable skeleton with hard preconditions

**What to build:** typing `/autoship <idea-or-issue-ref>` works like any other installed skill. In a repo missing its preconditions (Orca runtime with orchestration enabled, or the issue-tracker setup output) it stops and reports exactly what is missing, never improvising. In a configured repo it normalizes the argument — free text or an Issue reference — into a source brief, reports the brief, and stops. The skill lives in the personal bucket with its reference file beside it, is listed in the personal bucket README, and is symlinked into the harness skill directories.

**Blocked by:** None — can start immediately.

- [ ] `skills/personal/autoship/SKILL.md` exists, user-invoked (`disable-model-invocation: true`), prose uses **Issue** and **Frontier** (never "ticket"/"queue")
- [ ] Concrete orca CLI invocations live in `skills/personal/autoship/reference.md`, not SKILL.md (progressive disclosure)
- [ ] Invoked in a repo without tracker setup or without a running Orca orchestration runtime → stops with a precise report of the missing precondition
- [ ] Invoked with free text → reports a source brief synthesized from the text; invoked with an Issue reference → reports a source brief fetched from the configured tracker
- [ ] `skills/personal/README.md` lists autoship with a one-line description linked to its SKILL.md
- [ ] `scripts/link-skills.sh` re-run; `/autoship` resolves from the harness skill directories

## Front half — autonomous align to published Issues

**What to build:** a run now proceeds past intake: the coordinator creates a fresh Orca worktree branched from the repo default base, dispatches one align worker terminal in it that reads and follows the grilling + domain-modeling, to-spec, and to-tickets SKILL.mds in a single context, and answers that worker's questions over orchestration ask/reply as the product-owner proxy — grounded in the source brief, CONTEXT.md, and ADRs, never blocking, logging every ungrounded decision in an assumptions log. The run ends (for now) when the align worker reports done: spec produced, Issues with blocking edges published to the target repo's configured tracker, and the coordinator reports spec + Issues + assumptions log.

**Blocked by:** Installable skeleton with hard preconditions.

- [ ] Run creates a dedicated Orca worktree branched from the repo default base; the invoking worktree is untouched
- [ ] Align worker reads the user-only SKILL.mds (never Skill-invokes them) and runs grill → spec → slice in one context
- [ ] Align worker questions reach the coordinator via orchestration ask/reply; the coordinator answers from the source brief + repo domain docs
- [ ] An ungrounded question gets the most reversible answer and an entry in the assumptions log; the run never stalls waiting for a human
- [ ] Issues with blocking edges exist in the target repo's configured tracker when the run ends; the coordinator's final report includes spec, Issues, and assumptions log

## Back half — Frontier drain to one PR

**What to build:** the full happy path. After the align worker finishes, the coordinator mirrors the published Issues into orchestration tasks with dependency edges and drains the Frontier sequentially: one fresh worker terminal per Issue in the run worktree, each following the implement skill (which embeds code-review) with a bounded review loop — fix must-fix findings, re-review once, log residuals — and one commit per Issue. When the last Issue completes, the branch is pushed and one PR opens against the repo default base carrying the spec summary, the assumptions log, and per-Issue status with residual findings; Issues are closed/linked per the tracker configuration.

**Blocked by:** Front half — autonomous align to published Issues.

- [ ] Issues are mirrored into orchestration tasks whose dependency edges match the published blocking edges
- [ ] Exactly one Issue worker runs at a time, in dependency order, each in a fresh terminal in the run worktree
- [ ] Each Issue worker follows the implement skill, runs at most two review cycles, and reports done exactly once with residual findings in its payload
- [ ] One commit per Issue lands on the run branch
- [ ] One PR opens against the repo default base; its description contains the spec summary, the assumptions log, and per-Issue status; Issues are closed/linked per tracker config
- [ ] Happy-path smoke run on a sandbox repo produces all of the above artifacts

## Failure path — halt and draft-PR report

**What to build:** a run that cannot finish still ends well. When an Issue's dispatch circuit-breaks, the coordinator halts further dispatch (dependents are blocked anyway), pushes the commits that already landed, and opens a **draft** PR whose description accurately reports which Issues completed, which failed and why, plus the assumptions log. Issues stay open in the tracker. The user resumes by hand.

**Blocked by:** Back half — Frontier drain to one PR.

- [ ] A circuit-broken Issue stops all further dispatching
- [ ] Completed commits are pushed; the PR is opened as a draft, never ready-for-review
- [ ] The draft PR description reports completed Issues, the failed Issue with its failure reason, and the assumptions log
- [ ] No Issue is closed in the tracker on a failed run
- [ ] Verified on the sandbox repo with a deliberately impossible Issue in the chain
