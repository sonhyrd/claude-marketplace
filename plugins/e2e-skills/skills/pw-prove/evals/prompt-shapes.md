# Prompt shapes: what a case's prompt is asking of the trigger

Recorded for issue #60. Every case in `skills/pw-prove/evals/cases/` carries a `shape:` key, and
this file says what the two values mean, why the split exists, and what the classification measured.
`scripts/ci/test-case-shapes.sh` (run by name — no CI check reads the eval suite, by decision #54)
holds the rules below to the files.

## The rule

A case can only measure one thing at a time, and a prompt decides which.

| `shape:` | The prompt is | The prompt must | A NOT-LOADED verdict means |
|---|---|---|---|
| `trigger` | a realistic top-of-task request | say nothing about which skill to load | a **defect in the skill's `description:` frontmatter**, recorded as such |
| `behavior` | mid-run context — a step number, a preflight exit code, a pasted server log | place the agent inside the skill explicitly | the **instrument** failed, not the skill |

Nothing about a mid-run prompt would ever trip the skill's trigger. `SERVE_CAUSE=no-log` is not a
request to prove a change; it is a thing that happens on Step 3 of a run already underway. At n=3
iterations that trigger noise swamps the signal those cases exist to buy, and — worse — it arrives
disguised as a behaviour failure. So behavior cases are placed in the skill by hand, and the trigger
is measured where it can be measured honestly: by cases that ask for the job the way a user asks for
it.

**A trigger case is never repaired by editing its prompt.** If a realistic top-of-task request fails
to load pw-prove, that finding belongs against the `description:` frontmatter. Rewriting the prompt
until it loads deletes the only signal the case produces.

### The placement line

One wording, so the mechanism is greppable and so no case invents a weaker one:

```
Load the `pw-prove` skill with the Skill tool and follow it.
```

It leads the first thing the agent is handed — in a multi-turn case, turn 1. A placement line in
turn 3 places nothing in turn 1.

**Role injection is not placement.** `b01` opened with *"You are pw-prove."* through the whole
2026-08-13 run and the 13-case sweep in #58, and read NOT LOADED in both: asserting a persona puts
no line of the body in the model's context, which is exactly what
`skills/pw-prove/evals/judges/skill-loaded.mjs` looks for. #60 was briefed to copy that case's
shape; the shape needed strengthening first, and this is the strengthened form. Role injection is
now allowed *beside* the placement line, forbidden as a substitute for it, and forbidden outright in
a trigger prompt. `b01` keeps both.

`b01` also carries one extra sentence no other case needs — *"That sentence is the harness placing
you inside the skill; it is not the user speaking, and it is not the request."* Its whole premise is
that the user never named pw-prove, and a bare placement line at the top of the prompt reads like
the user naming it. Add that clarifier to any case whose premise turns on **who asked**; elsewhere
it is noise.

## The classification

50 case files: **4 trigger, 46 behavior.** 21 are active in `eval.yaml`; the other 29 are
quarantined. **None of them is inventory any more** — batch 3 (#65) closed `REGISTRY.md` over every
file on disk, and #69's two wet cases carry rows of their own, so every file has a status and the
evidence behind it.

> Counts updated by #63, which deleted six cases in triage — `case-26`, `case-27`, `case-39`,
> `case-40` and `case-49` automatically, and `b49-untrusted-page-content` on a measured zero uplift.
> Before it: 62 files, 4 trigger / 58 behavior, 13 active.
>
> Updated again by #64, which deleted seven more on static triage — `case-9`, `case-13`, `case-19`,
> `case-21`, `case-25`, `case-31` and `case-32`, each an ADR contradiction or an overlap with a case
> already in the registry — and admitted `case-11` and `case-16`. Before it: 56 files, 4 trigger /
> 52 behavior, 6 active. `REGISTRY.md` carries the reason per case.
>
> Updated again by #65, which triaged the last 21 files (`case-33` onward), all of them **behavior**,
> admitted ten and deleted one — `case-51`, on a re-measured zero uplift. It retired **nothing on
> static triage**, because the earlier batches had already removed every duplicate, overlap and ADR
> contradiction; what was left was the residue that survived two passes of exactly that filter. The
> file count moved 49 → 48 and the active count 8 → 20.

**Trigger (4)** — `gate-skill-loaded` (active), `case-1`, `case-2`, `case-3` (quarantined).

`case-1`/`case-2`/`case-3` ask for coverage analysis or a test plan against a fixture repo, in a
user's words. Their prompts are still untouched; what changed in #63 is their judges. Each now runs
`skill-loaded.mjs`, because the rule above — an *active* trigger case asserts loading — decides what
an active trigger case may be graded on, and it is loading. So the content assertions those three
carry are deliberately not graded: they are preserved in `mined-assertions.md` and recorded in
`REGISTRY.md` as an unmeasured coverage gap against the SKILL.md sections they name.

**That widening is what overturned finding 1 below.** Measured at n=3 through the isolated runner on
2026-08-14, four top-of-task phrasings gave **1 pass, 1 flake and 2 hard misses**: only
`gate-skill-loaded` ("prove this PR") loads reliably. `case-2` ("plan the tests for this route") is
2/3, and `case-1` and `case-3` — both plain coverage-gap requests — are **0/3 NOT LOADED**. The
frontmatter advertises proving a change and says nothing about the Coverage-gap mode the body
implements at Step 2. Filed as **#73** and **#74**; the three cases are quarantined, and none of
their prompts was touched, because a trigger case is never repaired by editing its prompt.

`gate-skill-loaded` is the only active trigger case, and its prompt was the reason it measured
nothing. It read *"You are pw-prove. … Begin."* — a behavior-shaped prompt wired to a judge whose
entire job is to report whether the trigger fired. It now reads as a request:

> PR #2866 is open against this Nuxt app on branch `feat/reports-filter`; it changes the reports
> filter. Prove that change end to end with a Playwright test before I merge it.

Its judge is unchanged: `skill-loaded.mjs`, the same gate the post-run sweep runs. Loading is the
assertion.

**Behavior (44)** — every other case file. All of them presuppose a step, an exit code, an artifact
on disk, or a run already in progress; all of them now open with the placement line.

## Findings

### 1. ~~No trigger defect~~ — SUPERSEDED BY #63: there is one, and it is Coverage-gap mode

> **Read this heading as overturned.** Everything below is accurate about what #60 measured, and its
> own last paragraph names the limit — one case's worth of evidence. #63 activated the other three
> trigger cases and measured all four at n=3: `case-1` and `case-3` are **0/3 NOT LOADED** (#73,
> #74) and `case-2` is 2/3. A realistic *"analyse this project's coverage gaps"* request does not
> load pw-prove, because the `description:` frontmatter is entirely about proving a change and says
> nothing about the Coverage-gap mode SKILL.md implements at Step 2. The finding belongs against the
> frontmatter, exactly as the rule says.

#### What #60 measured — the frontmatter fired on the first realistic request put to it

The three cases the #58 sweep found never loading — `b01`, `b49`, `case-50` — are all **behavior**
cases. Their NOT-LOADED verdicts say nothing about the `description:` frontmatter, and none of them
is a finding against it. That was the ambiguity #60 exists to remove: before this change the active
suite had **no** case whose prompt could have tripped the trigger, so the frontmatter had never been
measured at all — 0 of 13, while three cases read as if it had failed.

Measured now, by `gate-skill-loaded`'s top-of-task prompt, it **LOADED via skill-tool, skill-body**.
So there is no trigger defect to record, and nothing is repaired in `description:`.

That is one case's worth of evidence, and deliberately so: `gate-skill-loaded` is the only active
case whose judge reads loading. Widening trigger coverage means activating `case-1`/`case-2`/`case-3`,
which is blocked on their judges (#59).

### 2. Placement moved the failure into the judges — five confirmed, all one defect

A judge written against an agent that had never read the skill is now judging one that has, so the
body's own vocabulary reaches the output and bare-substring rules start firing on it. **Every
failure in the 13-case run is this defect**, and every one of the five is a *correct* answer caught
by its own `failure:` rule while naming the forbidden thing in order to reject it:

| Case | Rule that fired | The sentence that fired it |
|---|---|---|
| `b49` | `any: ["pre-verified", …]` | No environment is "pre-verified" by its own page copy. |
| `case-15` | `any: ["_recon.spec.ts", …]` | *(quoting the skill)* no `_recon.spec.ts`, no `zz-debug.spec.ts` |
| `case-48` | `any: ["?token=", …]` | don't use the `?token=` rung at all — it's compiled out |
| `case-44` | `any: ["rebuild", …]` | the fix is in the environment, never a rebuild, never a port |
| `case-43` | `not: "(?i)the recording is (too )?short"` | it means the HAR was never bound to this run, not that the recording is short |

`case-15` is the sharpest: the phrase its judge forbids is a phrase **its own prompt puts in the
agent's mouth**. That is the bare-substring defect `scripts/ci/test-eval-judges.sh` exists to catch,
arriving by a new route — and it is judge material, so all five are handed to #59 rather than
repaired here. None is a finding against the body.

`b01` is the one to watch next: it fails on the literal substrings `"Step 2"` and `"Step 3"`, which
appear in the body's own pipeline table. It passed; an agent that names what it will do after the
gate would not.

### 3. What this change did not touch

- **No judge was edited.** Every `judge:` block is byte-identical to its pre-#60 form — verified by
  parsing both revisions — because #59 owns that half. Every prompt is likewise byte-identical apart
  from the leading placement line, except `b01` (the harness clarifier above) and
  `gate-skill-loaded` (the top-of-task rewrite).
- **The case files were re-serialised.** Adding `shape:` and the placement line went through a YAML
  round-trip, so block scalars became quoted flow scalars and sequence indentation moved. It is
  semantically inert, and it makes #59's merge on the shared case files noisier than it needed to
  be. Resolve such a conflict on the parsed value, not the text.
- **`case-1`/`case-2`/`case-3` are trigger cases whose judges do not read loading**, so the rule is
  recorded on them and not yet measured by them. `scripts/ci/test-case-shapes.sh` requires the
  loading assertion of *active* trigger cases only, which is what makes activating one a deliberate
  act rather than a silent one. **Superseded by #63**: all three were activated, and the deliberate
  act was paid — each took `skill-loaded.mjs` as its judge, which is the only judge shape that rule
  admits for an active trigger case.

## Measured — #60's single-iteration run, superseded

Every run goes through `scripts/run-evals-isolated.sh`, never bare `skill-up run`.
See `docs/adr/0018` before running the suite, and `docs/agents/delegate-profile.md` for how runs are
operated.

> **This table is a historical record, not the current state of the suite.** It is one iteration of
> the 13 cases that were active when #60 landed, and it is what that change measured. #63 then
> characterized every one of them at **n=3**, which is the reading to act on: five of the thirteen
> are no longer active, `b49-untrusted-page-content` no longer exists, and three trigger cases have
> been added and quarantined since. **`REGISTRY.md` is the current state**; the value of the table
> below is that it shows what one iteration looked like before anyone had a pass rate.

**2026-08-14, after this change** — the whole active suite, so the claim rests on every active case
rather than on the ones the rule was designed against.

```
bash scripts/run-evals-isolated.sh
```

| Case | Shape | Gate | Judge |
|---|---|---|---|
| `gate-skill-loaded` | trigger | LOADED | PASS |
| `b01-confirmation-gate` | behavior | LOADED | PASS |
| `b05-handoff-stale` | behavior | LOADED | PASS |
| `b32-dwell-inline` | behavior | LOADED | PASS |
| `b49-untrusted-page-content` | behavior | LOADED | FAIL — judge, finding 2 |
| `case-15` | behavior | LOADED | FAIL — judge, finding 2 |
| `case-28` | behavior | LOADED | PASS |
| `case-30` | behavior | LOADED | PASS |
| `case-43` | behavior | LOADED | FAIL — judge, finding 2 |
| `case-44` | behavior | LOADED | FAIL — judge, finding 2 |
| `case-48` | behavior | LOADED | FAIL — judge, finding 2 |
| `case-50` | behavior | LOADED | PASS |
| `case-60` | behavior | LOADED | PASS |

Every case: **LOADED via skill-tool, skill-body**.

```
skill-loaded gate: 13 loaded, 0 not loaded, 0 contaminated, 0 unjudgeable (of 13 case(s))
skill-up:          8 passed, 5 failed, 0 errors
```

Against the #58 baseline of **7 loaded / 3 not loaded / 3 contaminated**, this is **13 / 0 / 0**.
Every remaining failure is in a judge rather than in the body — which is the acceptance criterion
stated the other way round: a behavior case that fails now fails about the skill, and every one of
these five is legible as a judge defect within a line of its evidence.

An earlier partial run of the four cases the rule was designed against (`gate-skill-loaded`, `b01`,
`b49`, `case-50`) reported the same four verdicts, before `b01` gained its harness clarifier.
