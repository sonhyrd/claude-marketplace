# 8. `pr-review` trusts its tracks at the level they report

- **Status:** Accepted
- **Date:** 2026-08-17
- **Issue:** [#41](https://github.com/sonhyrd/claude-marketplace/issues/41)

## Context

`sss:pr-review` shipped a fix stage gated on severity: Critical and High applied, Medium and Low
"described, never applied — they are judgement calls by construction". Across 12 logged real runs
(2026-08-07 → 08-17, on `nuxt-hyrd-chrysus` and `hyrd-widget` PRs) the read stage held perfectly and
the fix stage did not:

- **10 of 12 runs stopped after the report and asked permission.** The user answered by re-typing a
  rule the skill already contained — `fix all high`, `fix critical high and bug`, `fix all medium`.
  The one run that proceeded unprompted did so because its launch prompt said "never wait for one".
- **The user's ad-hoc wording then became the fix stage's scope** in 6 of 7 runs in one sample. Two
  runs on comparable PRs fixed incomparable sets of things.
- **Findings were parked on reasons the user overruled**, 3 of 5 runs in the other sample. One run
  closed two High findings with "an outward-facing GitHub write you haven't authorized"; the user
  said `fix all high` and both were applied with no new information.
- **Every run produced a 5–7 item Medium list nobody revisited**, while 6 of 7 runs applied some
  Medium findings anyway, three of them unprompted. The written policy and the observed behaviour
  had fully diverged.
- **Findings vanished between the report and the fix section** in 4 of 7 runs, once under an invented
  heading ("## Two things need you"), once under an invented third disposition ("Two findings dropped
  on verification") that Step 4c said did not exist.

Underneath it sat a self-contradiction. Step 4a said take OCR's severity as given *and* said "any
track calling it a bug → Critical". `bug` is OCR's `category` field, not a severity, so the two rules
collided on every `medium·bug` finding — hit in 4 of 7 runs, producing invented hybrids and one agent
writing the tell out loud: *"Real bug, but Medium by policy."*

None of it was covered by a test. The 8 existing eval cases covered Step 1's guards, Step 2's
fan-out, the Step 3/4 write boundary, Step 4b's overlap ordering, Step 5's absence and Step 6b's
schema. Zero covered severity assignment, `## Fixes`, admission, or whether the fix stage ran at all.
The untested half was the broken half.

## Decision

**A track we invoked on purpose, whose brief we wrote, is trusted at the level it reports.**

- **Admission is per track, not per severity.** Every Standards finding and every Spec
  missing/partial/wrong-implementation finding is applied; OCR findings are applied down to Medium.
- **Severity keeps a job, and it is not admission** — it orders the fix queue and it is the grade the
  `pw-prove` handoff carries.
- **The two refusals are closed.** OCR Low and Spec scope creep are described by policy, and
  everything else is applied unless one of exactly four reasons holds: the fix reaches outside the
  diff's own hunks, the finding rests on a misreading, two findings contradict each other, or the
  finding targets PR metadata rather than the tree.
- **No confirmation is asked at the Step 3 → Step 4 boundary.** The report still prints before any
  file is edited; what is gone is the pause after it. The run's one human checkpoint stays
  `pw-prove`'s own gate ([ADR-0005](./0005-pw-prove-unpinned-behind-a-confirmation-gate.md)).
- **`bug` is a category, never a grade**, and Blocker is a second word for Critical rather than a
  fifth tier.

## Rationale

**This deliberately overrides `matt:code-review`'s own framing.** That skill prefaces its twelve-smell
baseline with "**Always a judgement call.** Each smell is a labelled heuristic, never a hard
violation", and asks its Standards sub-agent to separate hard violations from judgement calls.
`pr-review` applies both classes.

The override is not a claim that the caution is wrong. It is calibrated for a skill that **only
reports** — a lone reviewer whose reader may not look twice, where a heuristic acted on unilaterally
is a refactor nobody asked for. `pr-review` is a different situation: the same diff is read by three
independently-contexted tracks, the agreements between them are printed, and the fix stage runs after
that cross-check with the whole report on screen. The distinction survives, it just moved job — it
feeds the severity used for ordering and for the handoff, and no longer gates what gets touched.

**Severity was the wrong gate anyway.** It was doing two jobs at once, and the collision showed up as
the `bug` contradiction: to admit a real defect OCR had graded Medium, the run had to re-grade it to
Critical, which meant lying about the grade to get the right behaviour. Splitting the jobs lets OCR's
severity be read verbatim, which is the second half of trusting the track.

**Containment replaces an exclusion list for Standards.** Four of the twelve smells (Shotgun Surgery,
Divergent Change, Refused Bequest, Speculative Generality) document fixes that restructure modules or
inheritance. Naming them would freeze a list against an upstream file we do not own; gating on
whether the fix stays inside the diff's own hunks lets a contained instance of any smell land while
still stopping a module split, and reuses a reason the closed list already carries.

**Applying OCR Medium is consistent with OCR's own guidance**, not a departure from it:
`sss:ocr-delegate` says "Describe Medium fixes *that require manual intervention*" — not "never apply
Medium".

## Consequences

- **`## Fixes` becomes accountable rather than descriptive.** Step 3 numbers findings `S1…`, `P1…`,
  `O1…`, and the stage is unfinished until every ID appears exactly once across three headings. That
  turns "applied or explained" from a promise into a condition a run can fail.
- **The apply set is roughly five times its former size.** Step 4b's four ordered buckets could not
  survive that and collapsed to two rules; the invariant they protected — overlap orders, never
  admits or promotes — is restated and unchanged.
- **The review commit gets larger.** Containment for Standards and the OCR Low exclusion are what
  keep it from becoming a restructure; if a review commit ever does, that boundary is what to look at
  first, not the admission table.
- **Nothing in `matt:code-review` is edited.** It is a verbatim subtree; only how `pr-review` treats
  its output changed. A future upstream sync cannot revert this decision, and cannot ratify it either.
- **Four eval cases now cover the fix stage** — the stage starts unasked, per-track admission, the ID
  accounting, and `bug` as a category. The no-confirmation case sits directly beside
  `report-before-write.yaml`, and both must stay green: nothing is written before the report, and
  nothing is asked after it.
- **`## Fixes` is the hardest part of this change to hold, and the prose that holds it is deliberately
  thin.** Eval trials repeatedly split a PR-body finding into a section *beside* `## Fixes` — `## Not
  code`, `## Not applied — needs your call` — on the reasoning that `Applied` implies a commit and a
  stale PR description has none. Two attempts to fix it by naming that failure mode in `SKILL.md`
  made it **worse**, from one trial in three to three in three: spelling out the changelog reading and
  its conclusion put the invention in front of the model with a prohibition attached, which is the
  elephant problem. What is in 4d now is positive only — the three heading names, all three emitted
  every time, and `Described, not applied` named as the home for a finding the commit does not carry.
  The war story lives here rather than in the skill on purpose; do not move it back.
  `evals/cases/fixes-accounts-for-every-id.yaml` is what notices, and its judge is **positional**
  (`(?s)### Described, not applied[^#]*O3`) because keyword matching cannot tell an answer that
  writes an invented heading from one that names it while refusing to.
- **That case ships flaky, at roughly one pass in three over 21 measured trials, and it ships that
  way on purpose.** Its assertions are not softened to make the suite green: it is catching a real
  weakness, and a green suite that hides it is worth less than an honest amber one. The failures are
  never random — every one reaches the same conclusion by the same route ("`## Fixes` lists commits,
  and this finding has no commit"), relocating the invention as the prose closes each door. Treat a
  *sustained* 0-in-3 as a regression and a 3-in-3 as the fix landing; a single failing trial is
  within measured variance. Quarantining or splitting the case is the alternative if CI needs green,
  and it was rejected here.
- **The eval sandbox is not a git repository**, so these cases probe what the skill *decides*, not
  what it does. A correct answer often ends by naming that blocker and offering to re-run, which
  reads like a confirmation prompt to a loose keyword — one reason every `failure` rule in this
  suite has to be decision-level.
- **Nothing mechanical guards the closed four-reason list.** A future edit that adds a fifth reason
  will pass every test. That is what this file is for; a grep guard is the follow-up if the ADR
  proves insufficient.
- **Step 1's own frictions are not addressed here** — skipped guards, the stacked-PR probe aimed at
  `main`, abbreviated SHAs in the provenance line, and a read-only-run fallback no logged run ever
  exercised. Step 1 is three revisions deep with its own ADR
  ([0007](./0007-pr-review-acquires-the-tree-in-step-1.md)) and its own test file, and deserves its
  own decision.

## Alternatives considered

- **Keep the severity gate and re-tune the tiers** — promote baseline smells to High, say. Rejected:
  it keeps severity doing two jobs, which is the defect, and it makes the handoff's grades lie about
  what the tracks reported.
- **Keep the confirmation prompt and make the answer a default** ("proceeding unless you say stop").
  Rejected: the observed cost is the turn, not the wording. 10 of 12 runs already spent it, and a
  default the user must still read is a prompt.
- **Enumerate the four restructuring smells as exclusions.** Rejected in favour of containment — see
  Rationale.
- **Add a Blocker tier.** Rejected: the handoff's `severity` enum belongs to `pw-prove`, and
  extending it is two files in two plugins plus a parity test plus a targeted push to the fork. One
  synonym line costs nothing and this skill routes cross-plugin changes rather than making them.
