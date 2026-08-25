# 12. `pr-review` publishes its own review

- **Status:** Accepted
- **Date:** 2026-08-25
- **Issue:** [#82](https://github.com/sonhyrd/claude-marketplace/issues/82)
- **Overturns:** Step 4e's `Never push` rule and its stated rationale. Everything ADR-0008 and
  ADR-0009 decided about the fix stage and the proof stands.

## Context

`sss:pr-review` runs three tracks over one resolved diff, prints an aggregated report, applies the
findings and commits them — and then none of it reaches the pull request. The report exists in the
invoking session's chat and nowhere else. The commit sits on a local branch, because Step 4e said:

> Commit the applied fixes to the current branch in the repo's own subject-line style, naming the
> PR. **Never push.** Later stages own the pushing, and a third pusher makes the PR history
> unreadable.

That was not an oversight, and it is not a gap to patch. The position is stated in five places
across `SKILL.md` — Step 3 closes with the literal policy line *"Report in chat. Posting to GitHub
is a separate ask."*, Step 4's opening says *"nothing is pushed"*, `4c` rebuts an invented refusal
by calling it *"a push this stage never makes"*, `4c` reason 4 measures a PR-body edit against *"the
push Step 4 already defers to later stages"*, and `6a` repeats *"Still never push"*. A skill states
a thing five times when it means it.

**What `Never push` was protecting.** The run already contains two pushers that are not this stage:
`translation-sync` in Step 5 pushes its own empty re-trigger commit, and `pw-prove` in Step 6 pushes
the spec, POM and HAR commits that belong to the proof. Adding a third would put three
independently-timed pushes on one branch inside one invocation, and a reviewer reading the PR's
commit list afterwards could not tell which stage produced which commit or in what order. The rule
kept the branch's history attributable to the two stages that own artifacts on it.

**What it cost.** *"A separate ask"* was never given any instructions to follow, so it has always
resolved to *nothing happens*. For the person who typed `/sss:pr-review <PR#>` the run looks
complete. For everyone else on the PR it is invisible: no review, no findings, and a diff that does
not contain the fixes the report says were applied. The invoker's remaining options are to copy the
report out of their terminal by hand, or to lose it when the session ends.

## Decision

**The review publishes itself.** When Step 1 resolved a PR number, `4e` becomes commit-and-push, and
a new `4f` posts the aggregated report to that PR as a single issue comment.

- **`Never push` and its third-pusher rationale are deleted**, along with the four other statements
  of the same position and the Notes bullet that explained why Step 5 may push and Step 4 may not.
- **The push is plain** — no force, no `--force-with-lease`, no `-u`. Step 1's unpushed-commits
  guard means a non-fast-forward rejection is always a colleague's concurrent push, and forcing
  would discard it.
- **The body is the report reproduced, never regenerated**: track count, `## Standards`, `## Spec`,
  `## OCR`, `## Overlap`, the per-track closing lines, with `4d`'s `## Fixes` appended.
- **Never an edit of an earlier comment.** Each run appends, on a hidden `<!-- sss:pr-review -->`
  marker, naming the reviewed SHA and whether the fixes were pushed. That produces one new comment
  per run on every body that fits, and a numbered sequence carrying one report on the bodies that do
  not — a split is n comments of one run, never n runs. A run that applied nothing still posts.
- **In branch mode the stage is absent** — not skipped with a note, not a prompt — the same shape
  the Sync stage already has when a repo carries no translation config.
- **Neither failure stops the run.** A rejected push degrades to posting anyway with a local-SHA
  line; a failed comment prints the body in chat and the run carries on to Sync and Prove.

## Rationale

**The invoker asked for the fixes and cannot use them while they sit local.** That is the whole
argument, and it is a different one from "posting would be nice". Typing `/sss:pr-review <PR#>`
authorizes a run whose declared output is a report and a set of applied fixes. Delivering both to a
branch nobody else can see delivers neither: the report reaching exactly one person's terminal is
the defect, not a limitation of scope. `Never push` was optimising the legibility of an artifact —
the PR's commit list — at the price of the artifact having any content to be legible about.

**The third-pusher concern was real and is now the smaller cost.** It is not being declared wrong.
Three pushes in one invocation genuinely is harder to read than two, and this ADR is what a future
reader finds when they wonder why a review skill pushes. What changed is the comparison: an
unreadable history is a cost paid by a reader who has the fixes; an unpushed commit is a cost paid
by a reader who does not. The comment mitigates the thing the rule protected, because it names the
commit it describes — the history that got harder to read now has one entry explaining itself.

**Publishing is an addition, never an overwrite**, and that is what keeps `4c` reason 4 intact
rather than collateral. A PR-body finding is still described and never applied. Its old
justification compared "loudness" against a push the stage did not make, and this change falsifies
that premise — so the reason is re-grounded rather than dropped: a comment *adds* text to a thread,
a body edit *overwrites words the author wrote*. The distinction survives the reversal because it
was never really about loudness. The change strengthens reason 4 in passing: the suggested rewrite
now reaches the author on the PR inside `## Fixes`, where before it lived only in the invoker's
chat.

**`4c`'s anti-invention rule is re-grounded for the same reason.** It rejected the observed excuse
*"an outward-facing write you haven't authorized"* on the grounds that this stage never makes a
push. It now makes one. The excuse stays on the forbidden list and its rebuttal becomes the correct
one: invoking the skill authorizes the push and the comment. Left unedited, the rule would have been
a true prohibition resting on a false premise, which is exactly the shape a future reader deletes.

**A new ADR, not an amendment to 0009.** ADR-0004 established that amendments replace rather than
stack, and 0009 owns a different decision — spawning the proof in a fresh session — that merely
rhymes with this one by also concerning what the run does at its end. Folding this in would have
required rewriting 0009's decision to hold two, and left the `Never push` reversal findable only
under a heading about `pw-prove`.

## Consequences

- **`pw-prove` still owns its own push.** Step 6's *"do not push to make its job smaller"* stands
  unchanged; it governs the spec, POM and HAR commits that belong to the proof, and nothing in this
  decision reaches across the plugin boundary into `plugins/e2e-skills/`.
- **The run now writes outward in three places** — the branch, the PR thread, and (conditionally)
  the translation server — with no human checkpoint anywhere, per ADR-0009. The consent for all
  three is the invocation.
- **The comment can be stale by the time it is read.** It names the reviewed SHA precisely so a
  later arrival can tell; nothing updates or deletes a previous run's comment, and each run appends.
  The hidden marker is written to make a "find our previous comments" change possible later, not to
  use now.
- **The stage has two failure surfaces and routes around neither by retrying.** `4e`'s push can be
  rejected — with no force of any kind that can only be a colleague's concurrent commit, which is
  precisely what the plain push refuses to overwrite — and `4f`'s `gh` call can fail. A rejected
  push degrades to `4f` posting anyway with the local-SHA line; a failed comment prints the body in
  chat. Both paths are loud in the invoker's chat rather than silent, which is why neither gets an
  eval case: the suite's environment is `type: none`, so a GitHub failure is not reliably
  provokable.
- **Body overflow is a real limit, not a hypothetical.** GitHub caps a comment at 65,536 characters
  and rejects the whole write past it, and three verbatim track reports plus `## Fixes` can exceed
  that. The split falls on `##` boundaries only and is numbered `1/n`; every finding ID reaching the
  PR is the property being protected. Each part carries the marker, so a later "find our comments"
  pass finds the whole sequence rather than its first part; only the first carries the header, which
  describes one review and would read as several if repeated.
- **`4f` is a sub-step, not a new numbered Step.** Renumbering Sync and Prove would churn every
  cross-reference in `SKILL.md`, fifteen eval cases, `CONTEXT.md` and three ADRs — and `4f` sitting
  directly beneath the rule it amends means a reader meets both at once.
- **`tests/bash/test-pr-review-publish-cases.sh` is what notices a quiet restoration.** It asserts
  `Never push` is absent from the fix stage, that `4f` exists, and that `gh pr comment` is named.
  Five statements of the old position were deleted; a future edit re-adding any one of them would
  otherwise pass every other test in the suite.
- **What we gave up is the attributable history.** A reviewer reading the PR's commit list can no
  longer assume every push came from a stage that owns an artifact on the branch. That is the trade,
  stated plainly so it can be reversed knowingly — and reversing it means going back to a review
  nobody but its invoker can read.

## Alternatives considered

- **Inline per-finding review comments, or a formal review via `gh pr review`.** Better ergonomics
  for replying to one finding. Rejected: the tracks do not all carry reliable line anchors, so
  inline comments would half-fail on precisely the runs with the most findings — the runs where the
  report matters most.
- **Post the report but keep `Never push`.** Preserves the two-pusher history exactly. Rejected: it
  publishes a report whose `## Fixes` section claims `Applied` against a diff that does not contain
  the fixes, which is worse than not publishing.
- **Update the previous run's comment instead of appending.** `4d`'s "supersede rather than append"
  rule suggests it. Rejected: that rule governs one live chat document with one reader. A PR thread
  is an append-only record other people quote and reply to, and silently rewriting a comment someone
  answered destroys their answer's context.
- **Suppress the comment when nothing was applied.** Rejected: three tracks agreeing a PR needs
  nothing is a result, and suppressing it makes a clean review indistinguishable from a review that
  never ran.
- **Ask before pushing.** Rejected on ADR-0008's and ADR-0009's shared argument: a checkpoint on the
  path the user already consented to by typing the invocation guards a stage they asked for.
