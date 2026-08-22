# Spec 0002 — Fixing pw-prove: the prompt and the shipped scripts, ranked by measured cost

**Status:** ready-for-operator-decision · **Date:** 2026-08-22 · **Repo:** `sonhyrd/e2e-skills`
**Tracker:** [sonhyrd/e2e-skills#138](https://github.com/sonhyrd/e2e-skills/issues/138) ·
**Parent:** [#130](https://github.com/sonhyrd/e2e-skills/issues/130)
**Reads:** [friction findings](../studies/friction-findings.md) ·
[profile audit](../studies/profile-audit.md) ·
[session distillation](../studies/session-distillation.md) ·
[run forensics](../studies/run-forensics.md)
**Against:** `skills/pw-prove/SKILL.md` at **0.28.0**, and the shipped scripts at the same commit

---

## What this document is

The [run forensics](../studies/run-forensics.md) exercise measured what pw-prove cost across 26 real
sessions. This is the first document in that tree that proposes a **change**. Everything upstream is
evidence; every entry below names something editable and says what not editing it has already cost.

Three things it deliberately does not do.

**It files no tickets.** That is the operator's call after reading this list, and it is the whole
reason the ranking exists — see [Out of Scope](#out-of-scope) for the parent's reasoning.

**It sets no line-count target for `SKILL.md`.** The body is 1,236 lines. That number appears here
once, in this sentence, and is never used as an argument. Where a section is cut below, the reason is
that the evidence shows it was misread, re-read, or never reached — never that the file is long.
Where a long section is kept, [the restructuring section](#restructuring-skillmd-what-the-evidence-supports)
says why the evidence says to keep it.

**It assigns no new identifiers.** Each entry is named by the `FR` finding it answers. `FR1`–`FR32`
are stable in the manner of this repository's 24 pattern IDs and its `F1`–`F15` failure codes, and a
second namespace over the same evidence would be one more thing a reader has to disambiguate.

## How this list is ordered

**The order is [#136's ranking](../studies/friction-findings.md#how-this-list-is-ordered), unchanged,
and this spec does not re-rank.** Frequency across the 26 sessions orders the list; severity
overrides it, with four findings lifted above the frequency order; measured time is reported
alongside and never folded into a composite. #137 verified every one of those 25 rows against HEAD
and moved no rank.

Re-ranking here by *cost of fix* was considered and rejected. It would answer a different question —
what is cheap to do — and the operator can read cheapness off the **Fix cost** row of every entry
without the ordering pretending it is the same thing as measured harm.

Two fields are new here, and only two:

- **Fix target** — the `SKILL.md` section or the named shipped script the change lands in.
- **Fix cost** — an honest estimate of what making the change costs, including which CI surface it
  drags with it. `scan.mjs` output is frozen by a golden; the pattern corpus and the parity surfaces
  move in lock-step; a body edit owes a `metadata.version` bump. Those are stated per entry, not
  assumed.

**Read the verdict before the entry.** Two findings' stated mechanism did not survive #137's
verification, and both entries below act on the corrected mechanism: **FR22**'s `**/` is *not*
literal (the sweep partially matches, reverts nested codegen, leaves the repository-root file dirty,
and exits 0 — worse than the row first claimed), and **FR4**'s description of `hermetic.mjs`'s output
order was inverted.

### The ranked list in one screen

Severities are the study's own — `S1` a proof that passed while proving nothing, down to `S4` turns
spent but not minutes; the [definitions](../studies/friction-findings.md#how-this-list-is-ordered)
are not restated here.

| Rank | Finding | n/26 | Sev | Fix target | Fix class |
|---|---|---|---|---|---|
| 1 | [FR1](#1--fr1-preflightmjs-certifies-a-restart-that-died) | 3 | S1 | `preflight.mjs` + Step 3 | script + body |
| 2 | [FR2](#2--fr2-the-clip-gates-certify-filmability-never-subject) | 8 | S1 | `### Clip inspection`, `clip-fidelity.mjs`, Step 5 | body + script |
| 3 | [FR3](#3--fr3-the-base-merge-is-skipped-and-nothing-downstream-notices) | 4 | S1 | Step 3 base-sync, `preflight.mjs`, Step 8 | script + body |
| 4 | [FR20](#4--fr20-the-hygiene-sweep-deletes-the-only-evidence-the-run-produced) | 3 | S2 | Step 8 hygiene beat + the handover stop | body |
| 5 | [FR24](#5--fr24-the-mutation-rebuild--no-fix-to-the-price-one-fix-to-the-race) | 22 | S3 | `### Mutation check` | body (narrow) |
| 6 | [FR4](#6--fr4-a-script-is-re-run-only-to-re-read-its-own-output) | 15 | S4 | `hermetic.mjs`, `scan.mjs`, Steps 6–7 | script + body |
| 7 | [FR5](#7--fr5-the-reports-e2e-reviewer-line-is-unsupported-by-anything-the-run-saw) | 12 | S2 | `scan.mjs`, `### e2e-reviewer skill`, the report template | script + body |
| 8 | [FR6](#8--fr6-the-mandated-dwell-shape-defeats-the-scanners-suppression) | 11 | S3 | Step 5 template; optionally `scan.mjs` | body (+ optional script) |
| 9 | [FR9](#9--fr9-no-way-to-wait-on-a-background-task) | 8 | S3 | `### Bring the environment up`, Step 4 | body |
| 10 | [FR7](#10--fr7-step-8-says-no-questions-and-eight-runs-asked-one-at-the-push) | 8 | S3 | Step 1 environment facts + Step 8 item 4 | body |
| 11 | [FR8](#11--fr8-recon-is-skipped-or-arrives-after-the-spec-is-written) | 8 | S3 | `### Recon`, Step 4 | body |
| 12 | [FR10](#12--fr10-clips-n-inspected-counts-frames-from-a-film-that-was-thrown-away) | 7 | S2 | `clip-fidelity.mjs frames`, the report template | script + body |
| 13 | [FR12](#13--fr12-one-bounded-mutation-many-shipped-scenarios) | 6 | S1/S2 | `### Mutation check`, the report template | body |
| 14 | [FR14](#14--fr14-the-reports-ac-arithmetic-does-not-reconcile-with-its-own-tables) | 6 | S2 | `## pw-prove — Complete` | body |
| 15 | [FR11](#15--fr11-the-failure-bound-is-announced-and-walked-past-and-the-handover-is-taken-0-of-6) | 6 | S3 | `### Failure handling`, `### The handover stop` | body — **promise change** |
| 16 | [FR13](#16--fr13-step-6s-gate-runs-after-step-7-and-covers-the-wrong-spec-set) | 6 | S3 | Step 6 scope + Step 7 precondition | body + script |
| 17 | [FR15](#17--fr15-step-4s-plan-is-skipped-or-posted-without-the-blocks-that-make-it-checkable) | 5 | S3 | Step 4, `clip-fidelity.mjs spec` | body + script |
| 18 | [FR16](#18--fr16-the-gitinfoexclude-snippet-fails-in-a-worktree) | 5 | S4 | Step 7 item 1b | body — one line |
| 19 | [FR18](#19--fr18-the-profile-is-written-back-with-values-that-are-wrong-unusable-or-in-the-wrong-place) | 4 | S3 | `### Runtime profile`, `#### The run writes the profile back` | body |
| 20 | [FR17](#20--fr17-confirmed-fixed-at-0240--a-regression-guard-is-owed) | 4 | S4 | — (**confirmed-fixed**) | guard only |
| 21 | [FR21](#21--fr21-the-one-re-film-budget-is-a-spend-cap-on-a-loop-with-no-diagnosis) | 3 | S3 | `### Clip inspection` | body |
| 22 | [FR19](#22--fr19-the-whole-spec-is-re-run-during-the-heal-loop) | 3 | S3 | `### Failure handling` snippet | body — one snippet |
| 23 | [FR22](#23--fr22-the-hygiene-sweeps-pathspec-half-matches-and-exits-0) | 2 | S4 | Step 8 hygiene bullet | body — one line |
| 24 | [FR32](#24--fr32-confirmed-fixed-at-0220--the-ordering-is-load-bearing) | 1 | S3 | — (**confirmed-fixed**) | guard only |
| 25 | [FR23](#25--fr23-publish-proofmjs-prints-publish-failed-over-a-successful-http-200) | 1 | S3 | `clips.mjs`, `publish-proof.mjs` | script |

Two rows carry no fix and say so with their reasons: **FR24** is a by-design price the skill already
argues for, and **FR17** and **FR32** are `confirmed-fixed`. A `confirmed-fixed` finding does not get
a fix; whether it gets a *guard* is a separate question and both entries answer it.

The [repository-fault and boundary findings](../studies/friction-findings.md#repository-fault-and-boundary-findings)
— FR25 through FR31 — are **not in this spec**; [Out of Scope](#out-of-scope) says where each half
went.

---

## The ranked fixes

### 1 — FR1: `preflight.mjs` certifies a restart that died

| | |
|---|---|
| **Answers** | [FR1](../studies/friction-findings.md#fr1--preflightmjs-reports-restartproven-for-a-restart-that-died-and-the-body-forbids-checking) · rank 1, lifted from frequency rank 19 |
| **Measured** | 3 of 26 (`0259fd57`, `3072aa9b`, `c871a4f2`) · S1 · ~2m40s of redone mutation work, one killed listener, three preview-server starts for one mutation check |
| **Verdict** | confirmed at HEAD; `preflight.mjs`'s restart block is byte-identical from 0.24.0 |
| **Fix target** | `skills/pw-prove/scripts/preflight.mjs`, restart mode (`failedToBind()` at `:775`–`780`, the candidate loop at `:903`–`910`) and `### Bring the environment up (autonomous — don't stop to ask)` (`SKILL.md:472`) |
| **Fix cost** | one script change plus one fixture case in `scripts/ci/test-pw-prove-scripts.sh`; one paragraph in the body; a `metadata.version` bump |

**The mechanism, as verification measured it.** The check is *present* and the race defeats it. Each
poll round reads the log once, tests it with `failedToBind()`, then curls the candidates. `pnpm
preview` prints `serving …` **before** it binds, so on a sub-second restart the announcement is
already past the restart mark, the `EADDRINUSE` lands microseconds after preflight's read, the
predecessor answers the curl, the candidate loop breaks (`:903`–`904`) and the poll round breaks with
it (`:907`–`910`) — the log is never re-read. There is no PID check anywhere in the file, and the
file's comment at `:652` says why nothing reaches for one: *"`lsof`/`ps` are blind under sandboxing,
so neither can establish that a port is free or that a listener is ours."* That is a documented
refusal, not an oversight, and any fix here has to respect it.

**The change, in two halves that must ship together.**

1. **Re-read before declaring.** In restart mode, when a candidate answers, re-read the log tail from
   the restart mark **once more** and run `failedToBind()` against it before returning
   `RESTART=proven`. A bind failure found there is `SERVE_CAUSE=restart-port-in-use`, which the body
   already documents and already tells the run how to fix. This is the minimal correct change: it
   closes the read-order race without adding a dependency or a new phase.
2. **Confirm the restarted process is still alive.** The body's own restart recipe (`SKILL.md:1040`)
   already tells the run to record the new PID; have restart mode accept it and check it with Node's
   own `process.kill(pid, 0)` before declaring `RESTART=proven`. A restart that died on
   `EADDRINUSE` **exited**, so a liveness check on the recorded PID catches exactly the observed
   shape — and it is a Node standard-library call, so it neither adds a dependency nor reaches for
   `lsof`/`ps`, which `:652` refuses and which `AGENTS.md` does not permit as subprocesses. It does
   not prove the survivor holds the port; that is half 1's job, and half 1 alone closes every
   instance the corpus recorded. Half 2 is the cheap second signal, not a substitute.

**And the body must stop forbidding the cross-check that caught it three times out of three.**
`SKILL.md:472` reads *"`RESTART=proven` is proven — do not re-litigate a fast one."* Keep the
anti-thrash intent — re-polling, restarting again and killing things "to make sure" are real costs
the sentence exists to prevent — and scope it to what it should have said: **the mark excludes the
predecessor's announcement, and one PID confirmation is not re-litigation.** All three sessions
caught the false positive by an unrequested cross-check (`pgrep`+`curl`, a pid/port check, the server
log) that this sentence discourages.

**Why this ranks first.** `RESTART=proven` is the licence to read the mutation verdict. n=3 counts
the sessions where the false positive fired *and was caught*; every PR-mode run against a built
target executes this restart. One run named it itself: *"A proof-tooling bug cost a cycle and would
have faked a verdict"* (`c871a4f2:696`).

**Side effect worth having.** The [profile audit](../studies/profile-audit.md#c29--c5--the-same-defect-paid-three-times-then-written-twice)
shows this same hazard occupying two entries (~25 lines) of `nuxt-hyrd-chrysus`'s profile, in both
repositories, because the profile is the only write surface a run has. Fixing it in the script
retires both entries. See [FR18](#19--fr18-the-profile-is-written-back-with-values-that-are-wrong-unusable-or-in-the-wrong-place)
and [ADR 0022](#adrs-owed).

### 2 — FR2: the clip gates certify filmability, never subject

| | |
|---|---|
| **Answers** | [FR2](../studies/friction-findings.md#fr2--the-clip-gates-certify-that-a-clip-can-be-filmed-never-what-the-frame-shows) · rank 2, lifted from frequency rank 5 |
| **Measured** | 8 of 26 · S1 · carries the corpus's one **landed** false proof · ~24 min of superseded work plus two published recordings (`0259fd57`); ~11 min and 21 frame reads (`240d63c1`); ~9 min and two extra films (`3072aa9b`) |
| **Verdict** | confirmed at HEAD in all four shapes |
| **Fix target** | `### Clip inspection — look at the frame before anyone else does` (the diagnosis table, `SKILL.md:1003`–`1006`); `## Step 5: Generate`; `skills/pw-prove/scripts/clip-fidelity.mjs` |
| **Fix cost** | three body edits and one script check plus its case in `scripts/ci/test-clip-fidelity.sh`; a version bump. No parity surface moves |

**What is deliberate and stays.** `SKILL.md:905` states the design position — *"No gate measures the
finished webm — the agent looks instead"* — and [ADR 0015](../adr/0015-legibility-is-checked-not-prescribed.md)
records it. This entry does **not** propose a gate over the frame. It proposes closing the four gaps
the corpus found between what the gate certifies and what the instruction asks the agent to look for.

**Three body changes.**

1. **Two rows the diagnosis table does not have.** It has payoff-not-held, element-off-frame,
   payoff-expired and never-settled. Add:
   - *Wrong subject* — the frame is legible and shows something that is not the acceptance
     criterion's subject: a fixture standing in for the artifact the criterion names. Remedy: the
     proof fails. This is not a re-film; a re-film of the wrong subject is the wrong subject again.
     This is `0259fd57`, the corpus's only false proof that reached a reader — a green,
     mutation-verified, frame-inspected proof of a synthetic fixture logo for a defect reported
     against a specific real customer's logo file. Every gate passed. The operator caught it in one
     typed question.
   - *Legible but off-payoff* — the frame is clean and shows the settled state rather than the
     transient one the criterion is about. Remedy is the section's own diagnose → fix → one re-film
     path, and explicitly **not** reclassification as acceptable. `cbe2813b:503` reclassified two
     chapters rather than re-filming, citing a profile entry as its licence.
2. **Name the subject per clip, before the frame is opened.** Require the inspection to state, for
   each clip, the AC row it proves *and the artifact the frame must show*. A frame read against "does
   this look right" cannot fail the way a frame read against "is this the customer's file" can.
3. **A scenario that builds its own context records no video.** `bbae9aa2`'s no-JS scenario called
   `browser.newContext()`, which does not inherit `use.video`; the gate said 4/4 and the film produced
   3 clips. The body says nothing about this anywhere. Add it to Step 5's generation rules: a scenario
   that constructs its own context passes `recordVideo` explicitly, or is declared unfilmable in the
   report.

**One script change, and it is mechanical.** `clip-fidelity.mjs` has no clip-count reconciliation of
any kind. The body carries the manual version at `SKILL.md:1071` — *"`ls test-results/*/video.webm |
wc -l` equals the **PR spec set's** scenario count"* — which was present at 0.23.1 when `bbae9aa2`
ran and which, performed, would have caught it. Promote it into the script as a gate: reconcile the
film's clip count against the scenario count and exit non-zero on a mismatch. It is blind to the
other three shapes, all of which produce the right *number* of clips, and that is why it is one line
of this entry rather than the whole of it.

### 3 — FR3: the base merge is skipped, and nothing downstream notices

| | |
|---|---|
| **Answers** | [FR3](../studies/friction-findings.md#fr3--the-step-3-base-merge-is-skipped-and-the-run-gets-as-far-as-publishing-before-noticing) · rank 3, lifted from frequency rank 16 |
| **Measured** | 4 of 26 · S1 — three of the four published a proof page of a base that would not ship · ~14 min and 36 turns (`18697484`) · ~9 min and 23 turns (`998dd2c1`) · ~10m21s and 24 turns (`a273eefa`) · ~5m30s plus one orphaned public recording (`af23ab55`) |
| **Verdict** | confirmed; `SKILL.md:401` byte-identical across 0.24.0 → 0.28.0 |
| **Fix target** | `### Bring the environment up`, base-sync paragraph (`SKILL.md:401`); `skills/pw-prove/scripts/preflight.mjs`; `## Step 8: Deliver` |
| **Fix cost** | one new reported field in preflight's summary plus its CI case; two body beats; a version bump |

**More prose will not fix this.** The instruction is explicit, unconditional, and was byte-identical
in every version all four sessions ran. Four runs skipped it anyway and each reached the same
recognition, in almost the same words, after everything downstream had been paid for. `af23ab55` is
the sharpest: `git fetch origin main` at line 65 for the **diff**, no merge, a complete proof page
published at 15:45:40, and `BASE AHEAD — merge needed` at 15:46:22.

**Make it observable, then make two beats depend on the observation.**

1. **`preflight.mjs` reports it.** Emit `BASE=merged | ahead | unknown` in the summary, from
   `git merge-base --is-ancestor origin/<default> HEAD`. `git` is already a permitted subprocess and
   preflight already shells out to it. Reporting, not refusing: preflight's job is to say what is
   true about the environment, and a non-PR-mode run has no base to be ahead of.
2. **Two beats read it.** The filming run and the publish each require `BASE=merged`. Both are
   points where the money has not yet been spent — the recurring cost of this finding is a full
   rebuild, a re-film, a re-inspection of every frame and a second publish, and every one of those
   comes after the last point where the check is free.
3. **The orphaned recording gets a retirement path.** Two sessions left a public recording of code
   that will not ship, minted, never posted, never superseded — because Step 8's supersede rule
   retires a proof *per PR comment* and these were never commented. Add: a publish that is never
   commented is superseded by the next publish of the same run, and the report names it.

### 4 — FR20: the hygiene sweep deletes the only evidence the run produced

| | |
|---|---|
| **Answers** | [FR20](../studies/friction-findings.md#fr20--the-step-8-hygiene-sweep-deletes-the-only-evidence-the-run-produced) · rank 4, lifted from frequency rank 20 |
| **Measured** | 3 of 26 · S2 — unrecoverable evidence loss, two of three drew the operator in · a 367.9s forced rebuild plus a re-film 2h41m after the sweep (`d32c2495`); a 7-minute filming pass to recreate footage that had existed (`fe171475`); a rebuild, a relaunch and a re-film (`a273eefa`) |
| **Verdict** | confirmed; both guards were present when both sessions slipped past them |
| **Fix target** | `## Step 8: Deliver`, hygiene beat 2 (`SKILL.md:1157`–`1158`); `### The handover stop` (`SKILL.md:957`); `skills/pw-prove/scripts/publish-proof.mjs` |
| **Fix cost** | two body edits and one line of script output; a version bump |

Deleted footage is the one cost in this corpus that cannot be re-derived from the transcript, and the
failure mode is worst exactly when the run has least to show.

**Three changes.**

1. **The handover stop must not sweep.** `SKILL.md:957` tells a stop to *"sweep `test-results/`, and
   nothing else from Step 8"* — with no publish-first guard, because on a stop there is nothing to
   publish. But the proof config writes video on **every** run, so the sweep destroys the only visual
   artifact a non-delivering run produced. `fe171475`'s operator found the report, found no video,
   and asked; the run answered *"there is no recorded video — I deleted it, and I should have flagged
   that"*. Change: a stop stops the dev server and sweeps **nothing**, and names the film's path in
   the required PR comment. Disk is not the scarce resource at a handover; the footage is.
2. **The undelivered publish keeps its per-clip files.** `d32c2495`'s publish exited 0 with an empty
   page and a kept concatenated file; the sweep then removed the per-clip webms, so the surviving
   artifact would have published as one chapter instead of two. Extend the beat: delete
   `test-results/` only after the publish reports a page. On `undelivered`, keep the kept file **and**
   the per-clip webms and say where they are.
3. **The script states its own keep-list.** `publish-proof.mjs` already knows delivered from
   undelivered — it prints `PWPROVE_PROOF_FILE` on the undelivered path. Have it print the paths that
   must survive the sweep, so the sweep has an explicit list rather than a remembered rule.

**Restructuring note.** The sweep is written twice, in Step 8 and in the handover stop, and only one
copy carries guards. That is the shape that produced case 1. Give the sweep one home and reference it
from both. This is a body reorganisation, not a rule change, and it is the smallest instance of the
pattern [the restructuring section](#restructuring-skillmd-what-the-evidence-supports) generalises.

### 5 — FR24: the mutation rebuild — no fix to the price, one fix to the race

| | |
|---|---|
| **Answers** | [FR24](../studies/friction-findings.md#fr24--the-mutation-checks-forced-rebuild-is-the-largest-instruction-driven-time-cost-in-the-corpus) · rank 5, frequency rank 1 |
| **Measured** | 22 of 26 · S3, by design · 20m50s of a 71-minute run, 29% (`a7cdcd1c`) · 12m41s of 85 min (`3072aa9b`) · 343s of 27 min, 21% (`f28c3493`) |
| **Verdict** | confirmed as by-design cost; `SKILL.md:1048` unchanged |
| **Fix target** | `### Mutation check (PR-mode: REQUIRED — hard-bounded)` — the rebuild beat only |
| **Fix cost** | one sentence; a version bump |

**No fix is proposed to the price, and this entry exists to stop one being argued for.** The skill
already states and defends it at `SKILL.md:1048`: *"`BUILD_REUSE=never` is not optional here … this
is the step the built target made expensive (~635s against ~40s under hot reload), and it is the
accepted price of a mutation verdict that still names a *source* behaviour."* The reuse machinery at
`SKILL.md:439` is what keeps the other builds cheap. This is the largest number in the corpus and it
is the number the ranking rule deliberately places fifth.

**What the evidence does support is narrower and worth taking.** The single most expensive friction
instance measured anywhere in the corpus was not the price — it was a race. `a7cdcd1c`'s 396s rebuild
was SIGTERMed by memory pressure while a preview server was live, and re-ran at 405s: 13m21s for one
verdict. Add one sentence to the rebuild beat: **stop the preview server before the
`BUILD_REUSE=never` rebuild, and restart it after** — the section already has the stop-and-restart
recipe at `SKILL.md:1040` for a different purpose, so this is a reordering of steps the section
already contains.

The third and fourth builds some runs paid belong to [FR3](#3--fr3-the-base-merge-is-skipped-and-nothing-downstream-notices),
not here.

### 6 — FR4: a script is re-run only to re-read its own output

| | |
|---|---|
| **Answers** | [FR4](../studies/friction-findings.md#fr4--a-script-is-re-run-only-to-re-read-its-own-output-through-a-different-filter) · rank 6, frequency rank 2 |
| **Measured** | 15 of 26 — the most frequent finding in the corpus · S4 · 7–25 seconds and one turn per instance; `b6dbd8be` ran `hermetic.mjs` six times, three for the filter alone |
| **Verdict** | confirmed; the row's account of `hermetic.mjs`'s output order was **inverted** and is corrected — the verdict is printed **last** (`hermetic.mjs:182`–`183`), the LIVE list first (`:147`) |
| **Fix target** | `skills/pw-prove/scripts/hermetic.mjs`; `skills/e2e-reviewer/scripts/scan.mjs`; `### e2e-reviewer skill` and `### Hermetic audit` |
| **Fix cost** | hermetic: one output line, no golden. `scan.mjs`: a **new flag only** — its whole-directory output is frozen by `tests/pattern-corpus/` and `scripts/ci/test-corpus.sh`, so changing the default output means regenerating the golden and reading the diff, which this entry does not ask for. Both skills owe a version bump; `scan.mjs` touches no pattern ID, so no parity surface moves |

Both scripts emit more than a turn can hold, so a run pipes them, discovers the pipe cut off the
load-bearing half, and re-runs the identical command with a different pipe. Because hermetic prints
its verdict last and its LIVE list first, a `tail` keeps the verdict and loses the list the audit
exists to check — which is `67b624f4:381` exactly: *"Need the LIVE section — it scrolled off."*

**Three changes, and the third is the one that matters most.**

1. **`hermetic.mjs` prints its verdict twice** — once as a one-line header before the LIVE list
   (`HERMETIC: PASS|FAIL — n LIVE, m MOCKED`) and once, unchanged, at the end. Then `head` and `tail`
   both keep the load-bearing half, and nothing that reads the current output breaks.
2. **`scan.mjs` gains a summary flag.** Today it takes one positional root (`scan.mjs:23`,
   `process.argv[2] ?? '.'`) and prints its tally last (`scan.mjs:904`). A `--summary` flag that
   prints the tally alone, and the path scoping in
   [FR5](#7--fr5-the-reports-e2e-reviewer-line-is-unsupported-by-anything-the-run-saw), are the same
   change and should ship together.
3. **Stop piping into `head`.** Several runs did, which closes the pipe and makes the script exit
   non-zero on `SIGPIPE` — so the ledger records a gate failure that never happened (`67b624f4`,
   `a7cdcd1c`, `d3c037d9`), and in `d3c037d9` the run declared a hermetic audit passing without ever
   having seen a zero exit code for it. State this in both sections: read `hermetic.mjs`'s output
   whole — change 1 makes its verdict survive a `tail`, and it gains no flag here — and `scan.mjs`'s
   through `--summary`; never pipe either through `head`, because a truncated read of a gate is a
   gate whose exit code you have not seen.

**Boundary, kept as one.** The invocations are pw-prove's, the output shapes are the two scripts',
and the filters are the agent's. Half of the instances are downstream of
[FR25](../studies/friction-findings.md#fr25--a-large-pre-existing-scanner-backlog-makes-the-step-6-gate-unreadable),
which is the target repository's backlog and belongs to the setup studies.

### 7 — FR5: the report's `e2e-reviewer:` line is unsupported by anything the run saw

| | |
|---|---|
| **Answers** | [FR5](../studies/friction-findings.md#fr5--the-reports-e2e-reviewer-line-is-unsupported-by-anything-the-run-could-see) · rank 7, frequency rank 3 |
| **Measured** | 12 of 26 · S2 · ~0 to the run — this costs the reader |
| **Verdict** | confirmed; the template line (`SKILL.md:1192`) and Step 6's rule (`SKILL.md:753`) both unchanged, and `8eb0585c`'s `scan.mjs … exit=1` re-read from the ledger |
| **Fix target** | `skills/e2e-reviewer/scripts/scan.mjs`; `### e2e-reviewer skill` (Step 6); `## pw-prove — Complete` |
| **Fix cost** | as FR4 — a new flag and a path argument, default output unchanged so the corpus golden holds; two body edits; version bumps on both skills |

Twelve of 26 completion reports state a P0/P1 count the transcript cannot support. The mechanism is
consistent: the run pipes `scan.mjs` through a filter that keeps the per-hit rows and drops the
severity banner and the summary, then writes a tally from memory or a partial read. `cbe2813b` is the
clean case — the ledger records `exit=1`, the filtered output carries no severity data at all, and
the report says `0 P0, 0 P1`. Three sessions state a count arithmetically wrong on its own evidence;
two ran the gate with a tier switched off and did not say so, while `fa0cc83b` did the same thing and
**did** disclose it (`Tier coverage: 3 only`) — so the corpus carries both shapes.

**Make the tally machine-produced and scoped, and make the report paste it.**

1. **`scan.mjs` accepts the run's own paths.** It takes one root today. Accept a path set (or an
   `--only <paths>` filter) so a run can get a verdict about the two files it wrote. This is the
   direct answer to FR25's backlog problem without touching the backlog: both target repositories
   carry hundreds of findings, so the whole-directory exit code and summary say nothing about the
   run's own work.
2. **`--summary` prints exactly the report line's inputs** — total, P0, P1/P2, and the tier coverage
   actually run. Tier coverage in the output is what would have made `3072aa9b`'s and `af23ab55`'s
   silent Tier-1 skip visible without either run having to remember to mention it.
3. **The report line is pasted, not recalled.** Change the template's contract at `SKILL.md:1192` to
   require the counts to come from a `--summary` invocation in this run, and require the tier
   coverage line beside it. A number written from memory is the finding.

### 8 — FR6: the mandated dwell shape defeats the scanner's suppression

| | |
|---|---|
| **Answers** | [FR6](../studies/friction-findings.md#fr6--pw-prove-mandates-a-dwell-shape-that-e2e-reviewers-suppression-cannot-see) · rank 8, frequency rank 4 |
| **Measured** | 11 of 26 · S3 — no false proof, but the direct cause of most of FR5 · seconds per run; the real cost is an unreadable gate verdict |
| **Verdict** | confirmed; `lineIsJustified` (`scan.mjs:129`–`145`) walks up at most five lines and breaks at the first non-`//` line, and `scan.mjs:700` records the gap as known |
| **Fix target** | `## Step 5: Generate` template (`SKILL.md:690`–`693`) — and, optionally and separately, `scan.mjs`'s `lineIsJustified` |
| **Fix cost** | body half: one paragraph and a version bump. Script half: an `e2e-reviewer` change that owes a hit fixture **and** a `// JUSTIFIED:` twin in `tests/pattern-corpus/`, a `test-corpus.sh --update` with the diff read, and a version bump — a separate ticket, not this one |

Two shipped scripts read the same code and disagree about it. Step 5's template writes the guard and
the wait on **one** line, which the suppression does honour; several runs split it across two, putting
the `// JUSTIFIED:` comment above the `if (process.env.PW_PROVE_CLIP)` guard rather than above the
`waitForTimeout`. The walk hits the `if`, stops, and never reaches the comment. `clip-fidelity.mjs`,
reading the enclosing block, is satisfied. `998dd2c1` is the clearest pair in the corpus: one script
printing `9/9 … carry a JUSTIFIED … wait` and the other printing the same nine lines as findings,
three minutes apart.

**Take pw-prove's half now.** Make the one-line dwell shape mandatory rather than exemplary, and say
*why* in one sentence: a two-line split defeats `scan.mjs`'s suppression lookback and produces P1
`#9` hits on exactly the lines this skill told the run to write. A rule whose reason is stated is a
rule a run can apply to a shape the template does not show.

**The deeper fix is e2e-reviewer's and is priced, not proposed here.** Extending `lineIsJustified` to
walk past a single-line block opener would close it from the other side and benefit every user of the
scanner. It moves a suppression contract, so it owes both corpus fixtures and a golden refresh. It is
named here so the operator can see the choice; it is not this spec's entry to file.

**Boundary, kept as one.** The construct is pw-prove's, the suppression gap is e2e-reviewer's, and
neither skill is wrong on its own terms.

### 9 — FR9: no way to wait on a background task

| | |
|---|---|
| **Answers** | [FR9](../studies/friction-findings.md#fr9--no-way-to-watch-a-long-running-script-so-the-run-circles-on-is-it-done-yet) · rank 9, frequency rank 6 |
| **Measured** | 8 of 26 · S3 · **46m11s** of dead session — the largest single loss in the corpus (`3deeddd7`) · ~11 min over eight tool calls (`3072aa9b`) · 2m33s and eight calls (`8eb0585c`) |
| **Verdict** | confirmed; the two foreground-probe instances are **confirmed-fixed at 0.22.0**, when `probe.mjs start` began detaching itself |
| **Fix target** | `### Bring the environment up`, item 3 (`SKILL.md:444`); `## Step 4: Plan` |
| **Fix cost** | two paragraphs; a version bump. No script change |

The section tells the run to put the build and the proof run in a harness-tracked background task with
a readable log, and says nothing about how to **wait** on one. The corpus contains six different
improvisations for the same question: `tail` polls, `sleep` chains the host refuses, an `until grep`
watcher that exits with nothing, a `ToolSearch` for a monitor tool that is then not used, and a
`TaskOutput` poll that finally works.

**Two additions.**

1. **Name the wait shape.** State the one to use where the harness provides it (a task-output poll),
   the fallback where it does not (poll the log file on a bounded loop), and the two that do not work:
   a `sleep` chain, which the host refuses, and `| tail` on a live process, which buffers until exit —
   `6f307a2f:188` is the run diagnosing that itself.
2. **Do not end the turn while a background task is running.** `3deeddd7` started the build, posted
   its Step-4 plan, and ended its turn, which the harness treats as the end of its background tasks.
   Step 4's own instruction is to post the plan and continue *immediately*, so the body is implicated
   in the turn-end even though the kill is the host's. Say it in both places: at Step 3 where the task
   is started, and at Step 4 where the turn is at risk.

**Boundary, kept as one.** The harness owns the turn boundary and the shell timeout; pw-prove owns the
instruction to background the work and gives no way to observe it. Note the pattern the corpus
records: the *self-inflicted* half of this finding was fixed by moving the rule **into the script**
(`SKILL.md:521` — *"the three minutes a traced run lost to a blocking `start` are impossible now,
which is why the rule moved into the script"*). That is the clearest case in the corpus of a fix made
from one of these very sessions, and it is the shape several entries here imitate.

### 10 — FR7: Step 8 says "no questions" and eight runs asked one at the push

| | |
|---|---|
| **Answers** | [FR7](../studies/friction-findings.md#fr7--step-8-says-no-questions-and-eight-runs-asked-one-at-the-push) · rank 10, frequency rank 7 |
| **Measured** | 8 of 26 · S3 · **26m35s** (`10748ea5`) and **8m38s** (`0259fd57`) — the two largest idle blocks measured anywhere in this corpus · 3m16s (`f28c3493`) · 1m47s (`8eb0585c`) |
| **Verdict** | confirmed; the dangling `no-skip-form stop` pointer is **confirmed-fixed at 0.27.1** — and the removal **widened** the finding |
| **Fix target** | `### Environment facts` (Step 1); `## Step 8: Deliver`, item 4 |
| **Fix cost** | one Step-1 fact, one Step-8 rule, one report line; a version bump |

The trigger is consistent and is **not** agent invention: the pre-push read shows the push would carry
a foreign or pre-existing commit, and the target repository's own `CONTRIBUTING.md` or `AGENTS.md`
says the push is the operator's to authorise. Two instructions genuinely disagree.

**And pw-prove's side of the disagreement is now silent.** At 0.27.0 the push item carried a bullet
ending *"this is the no-skip-form stop below"*, pointing at a subsection the body did not contain —
so a run had a rule and no form to follow it with. Commit `24dc9bf` (0.27.1) deleted the whole bullet
and replaced it with an observation-only paragraph. The broken pointer is closed and the pre-push stop
went with it: at 0.27.0 a run that found a foreign commit had an instruction telling it not to push;
at HEAD there is none. **A fix spec should read the 0.27.1 change as part of the problem**, which is
why this entry restores a rule rather than only adding one.

**Resolve the conflict at Step 1, deterministically, so Step 8 never has to ask.**

1. **The push policy is an environment fact.** Add it to `### Environment facts`: read the target
   repository's contribution rules and record whether the push is the run's to make. It is exactly the
   kind of repository fact Step 1 exists to establish, and reading it at Step 1 costs nothing, where
   discovering it at Step 8 cost 26m35s.
2. **Step 8 acts on the recorded policy and never asks.** Where the policy withholds the push, deliver
   through the PR comment and report `Pushed: withheld (repository requires operator authorisation)`.
   That converts the corpus's two largest idle blocks into a report line.
3. **Restore the foreign-commit rule 0.27.1 removed.** A push that would carry a commit this run did
   not make is not pushed: name the commit, deliver by comment, and say so. The observation-only
   paragraph tells the run what it is seeing and not what to do about it.

The repository side is [FR27](../studies/friction-findings.md#fr27--the-target-repositories-require-operator-authorisation-to-push)
and belongs to the setup studies. The fix spec owns what Step 8 should do when the rule binds; the
setup studies own whether these repositories want it to bind an automated proof run.

### 11 — FR8: recon is skipped, or arrives after the spec is written

| | |
|---|---|
| **Answers** | [FR8](../studies/friction-findings.md#fr8--recon-is-skipped-or-run-after-the-spec-was-written-and-the-test-runner-discovers-what-the-probe-exists-to-answer) · rank 11, frequency rank 8 |
| **Measured** | 8 of 26 · S3 · ~25m24s to a from-scratch rewrite (`1927b90c`) · ~13 min circling on a tab parameter (`a7cdcd1c`) · ~10 min diagnosing a 114.5s `page.goto` (`3deeddd7`) · ~7m30s across three red runs (`d32c2495`) |
| **Verdict** | confirmed; `### Recon` unchanged in heading and rule at `SKILL.md:510`, and the fourth shape is still unwarned-about |
| **Fix target** | `### Recon — the probe is the question channel, the test run is the validator`; `## Step 4: Plan` |
| **Fix cost** | one required plan line and two paragraphs; a version bump |

The section's own heading states the rule the corpus keeps inverting. Eight sessions asked the runner
instead, at two to three minutes a question, in three shapes: recon that never opened a browser
(`3deeddd7` did Step-3 recon with `curl`, `sed` and `grep`, then died on a 114.5s navigation); a spec
written before the probe was asked (`10748ea5` wrote a POM and a whole spec during a 241-second build,
and the probe then contradicted an assertion the spec already carried — after a Step-4 plan claim had
been published to the operator); and recon answered and ignored (`0259fd57`'s probe reported
`boxes:0, imgs:0` on a *logo* proof, four minutes before that same emptiness would have caught FR2's
landed false proof).

**Two changes.**

1. **The plan carries a `Recon:` line, and the spec is not written before it.** Step 4 already requires
   observed locators in its Locator Mapping Table; add a `Recon:` line naming the probe session and
   what it answered, and state that writing spec text before the probe returns is the inversion this
   section names. Dead time during a build is real; using it to write assertions the probe has not yet
   supported is what `10748ea5` paid for.
2. **Warn about the fourth shape, which the section does not mention at all.** The probe drives one
   long-lived context whose lazily-resolved state — a translation catalog, a feature-flag fetch — has
   settled, while every Playwright test opens a cold one. `af23ab55`'s recon returned German control
   labels, the spec asserted them, and the first audit run got English. `SKILL.md:512` sells the
   persistent context as the feature (*"One persistent browser, batched questions"*) and nothing
   anywhere says what it therefore cannot tell you.

### 12 — FR10: `Clips: N inspected` counts frames from a film that was thrown away

| | |
|---|---|
| **Answers** | [FR10](../studies/friction-findings.md#fr10--clips-n-inspected-counts-frames-from-a-film-that-was-thrown-away) · rank 12, frequency rank 9 |
| **Measured** | 7 of 26 · S2 · ~0 to the run — this costs the reader. `3072aa9b` reported `Clips: 14 inspected` with three post-final-film frame reads; the other eleven describe a film `rm -rf test-results` had already deleted |
| **Verdict** | confirmed; both rules that would have caught every instance are present in the words the runs were following (`SKILL.md:997`, `:1214`) and nothing enforces either |
| **Fix target** | `skills/pw-prove/scripts/clip-fidelity.mjs` (`frames`); `## pw-prove — Complete`, the `Clips:` line |
| **Fix cost** | one script change plus its case in `scripts/ci/test-clip-fidelity.sh`; one report-template line; a version bump |

**This is the clearest case in the list where the body already says the right thing and nothing makes
it true.** The mechanism is the re-film: the first film is inspected in full, the spec is fixed, the
re-film changes every clip's duration and therefore its sampled frame, and only the clips that were
*broken* are re-read.

**Make the frames carry their generation.** `clip-fidelity.mjs frames` should stamp each extraction
with a film generation (an incrementing index, or the source webm's identity) and remove or supersede
the prior generation's frames. Then a description written against a stale frame has no file behind it
to describe, and the honest verdict the body already prescribes — `uninspected` — becomes the
path of least resistance rather than a rule to remember.

Two sessions also dropped the required re-film marker entirely (`9899ba51`, `a7cdcd1c`), so a reader
cannot tell the delivered film from the first one. The generation stamp gives that marker a source.

### 13 — FR12: one bounded mutation, many shipped scenarios

| | |
|---|---|
| **Answers** | [FR12](../studies/friction-findings.md#fr12--one-bounded-mutation-leaves-shipped-scenarios-with-no-guard-and-the-report-does-not-always-say-so) · rank 13, frequency rank 10 |
| **Measured** | 6 of 26 · **S1** in `6f307a2f` (a non-guarding test shipped inside a green 13/13), S2 elsewhere · ~7 min against the wrong component (`8eb0585c`); ~8 min and three forced rebuilds on an undetectable target (`d3c037d9`) |
| **Verdict** | confirmed; `SKILL.md:1020` (scope, plural) and `:1018` (one mutation) still cannot both be satisfied, and the report line at `:1194` still has no place to name a scenario |
| **Fix target** | `### Mutation check (PR-mode: REQUIRED — hard-bounded)`, its scope line and its verdict ladder; `## pw-prove — Complete`, the `Mutation:` line |
| **Fix cost** | two body edits; a version bump. **No** additional rebuild — that is the point |

The headline scopes the check to the scenarios the run wrote, plural; the budget is one mutation,
`-g`-scoped to one test. In a run that wrote two or three scenarios those sentences cannot both be
satisfied, and four sessions delivered a flat `Mutation: RED` over partial coverage.

**Do not buy coverage with rebuilds.** Per-scenario mutation would multiply
[FR24](#5--fr24-the-mutation-rebuild--no-fix-to-the-price-one-fix-to-the-race)'s ~635s by the scenario
count, which the evidence does not support. Fix the reporting instead.

1. **The verdict names its scope.** `Mutation: RED (scenario "<title>")` ·
   `unguardable at <layer> (scenario "<title>")` · and a required `not checked: <the other scenarios>`
   clause. Partial coverage becomes visible at no cost.
2. **An `unguardable` scenario leaves the headline count.** `6f307a2f` is the S1 case and the reason
   this row is not merely S3: scenario 2 passed under mutation because a `<Teleport to="body">` makes
   the body observer fire regardless, the run declared it *"unguardable at that layer"* on the
   **first** green — skipping the ladder's mandated strengthen-and-repeat-once — and the test shipped
   inside a headline "13/13" its own report calls green. The section never says to delete an
   unguardable test and should not start; it says to state it in the report, which the run did. What
   is missing is that the green count must not absorb it. Change: an unguardable scenario is named
   separately and excluded from the pass headline.
3. **A spec rewritten after the check invalidates the verdict.** `18697484` took a genuine verdict,
   then materially rewrote the spec after a base merge, and no second check ran. The verdict is very
   probably still true and the report does not say it was not re-derived. Require the report to say
   which it is. The plain reason it was not repeated is FR24, and that is a legitimate answer — an
   undisclosed one is not.

### 14 — FR14: the report's AC arithmetic does not reconcile with its own tables

| | |
|---|---|
| **Answers** | [FR14](../studies/friction-findings.md#fr14--the-reports-ac-arithmetic-does-not-reconcile-with-its-own-tables) · rank 14, frequency rank 11 |
| **Measured** | 6 of 26 · S2 · ~0 to the run |
| **Verdict** | confirmed; the template line (`SKILL.md:1189`) and its invariant (`:1210`) are byte-identical 0.23.1 → 0.28.0, and no shipped script reads the completion report |
| **Fix target** | `## pw-prove — Complete`, the `ACs:` line |
| **Fix cost** | one template change; a version bump. The stronger option is priced below and is **not** recommended |

In five of the six the arithmetic is visibly wrong inside the report itself, and in three the same
report discloses the shortfall in prose two paragraphs later — so the number misleads while the
message does not. `cbe2813b:669` reports `8 proven of 9 total` with a parenthetical summing to 10,
against ten-row tables in the same report.

**Change the line's required form, so the shortfall lands in the number.** `ACs: N proven, K
unproven, of M` — with the invariant unchanged (*M = the Step-2 AC table's row count*) and a stated
refusal of the bare `N of M` form the invariant already rejects. Three of six reports carried the
truth in prose; forcing the unproven count into the line is the cheapest way to make the number agree
with the prose.

**The honest limit.** Nothing enforces this and this change does not enforce it either. A script that
validated the completion report against the Step-2 AC table would, and it is the only thing that
would — but it needs a machine-readable AC table, which means Step 4's plan becomes an artifact. That
is [FR15](#17--fr15-step-4s-plan-is-skipped-or-posted-without-the-blocks-that-make-it-checkable) and
[ADR 0021](#adrs-owed). Take this entry as the cheap half and read that one for the structural half.

`a7cdcd1c` is a different case and is not fixed by either: no Step-2 AC table was ever produced, so
the third number is self-referential and cannot be checked at all. That is FR15.

### 15 — FR11: the failure bound is announced and walked past, and the handover is taken 0 of 6

| | |
|---|---|
| **Answers** | [FR11](../studies/friction-findings.md#fr11--the-failure-handling-bound-is-announced-and-then-walked-past-and-playwright-debugger-is-invoked-in-zero-of-26-sessions) · rank 15, frequency rank 12 |
| **Measured** | 6 of 26 for the bound · **0 of 6** for the prescribed handover — measured, not inferred: all 26 transcripts were scanned for a `playwright-debugger` invocation and there are none, and all six trigger sessions carry `e2e:playwright-debugger` in the runtime's own available-skills listing · 9m47s of operator idle (`1927b90c`) · ~53 min across five concurrent regression batches against a bound of three (`240d63c1`) · 16 Playwright runs over 72 minutes with the bound never applied (`fe171475`) |
| **Verdict** | confirmed; the rule, the checkpoint table and the handover stop are all unchanged at HEAD (`SKILL.md:923`, `:927`, `:936`, `:938`) |
| **Fix target** | `### Failure handling (max 3 auto-fix attempts…)` and `### The handover stop` |
| **Fix cost** | a body change that alters what the skill **promises** — see [ADR 0023](#adrs-owed) |

**This is the strongest single number in the corpus and the hardest entry to write.** In five of the
six the checkpoint was recognised **by name**, quoted back from the body in the run's own words, and
then not executed. Two runs continued to green and delivered; the operator sanctioned one of them
explicitly. A rule whose breach reliably produces a good outcome is the hardest kind to keep, and the
one route that would have made this a packaging finding was tried and closed — the skill was on offer
in every session that needed it.

**Three options, and only one is honest about that.**

- **Keep the rule and enforce it.** Nothing can. No script sees the heal loop.
- **Delete the rule.** It would remove the only stated exit from an unbounded loop, and `fe171475`
  is what an unbounded loop looks like: 16 runs, a pass count that went 6 → 6 → 5 → 6 and stopped,
  ending in a published diagnostic film of a 6/13 suite.
- **Change what the invocation is for.** Recommended. Make `playwright-debugger` the prescribed
  **fourth attempt** rather than the terminal exit: attempts 1–3 are pw-prove's, attempt 4 is the
  debugger's diagnosis followed by one fix, and the handover stop follows only if that fails. 0 of 6
  says the rule as written is rejected at exactly the moment the run believes it is close to green;
  an invocation that advances the run is one a run in that position will take.

**Say plainly what this changes.** It moves a documented gate from "stop and hand over" to "get a
diagnosis, then one more fix, then stop", which lengthens the worst case by one cycle. That is a
change to a promise, not a repair of a defect, and it is the one entry in this spec that is a
behaviour change rather than a correction. It is why [ADR 0023](#adrs-owed) is reserved.

Whatever is chosen, one smaller change stands on its own: `240d63c1` ran five concurrent regression
batches against a bound of three, which the bound does not address at all. State whether the bound
counts attempts or batches.

### 16 — FR13: Step 6's gate runs after Step 7, and covers the wrong spec set

| | |
|---|---|
| **Answers** | [FR13](../studies/friction-findings.md#fr13--step-6s-quality-gate-runs-after-step-7-and-in-one-session-after-the-publish) · rank 16, frequency rank 13 |
| **Measured** | 6 of 26 · S3 — nothing false shipped, but three sessions were one P0 away from an invalidated proof page · ~6m08s of full-suite runs against specs the audit would have blocked (`b6dbd8be`) · ~11 min and 21 frame reads before the gate that would have prevented them (`240d63c1`) |
| **Verdict** | confirmed, both halves; `8eb0585c`'s ledger re-read directly — `publish-proof.mjs exit=0` at `17:03:06.795Z`, `scan.mjs exit=1` at `17:04:18.577Z` |
| **Fix target** | `## Step 6: e2e-reviewer (quality gate)`, the clip-fidelity audit's scope (`SKILL.md:730`); `## Step 7: Verify`, the filming beat; `skills/pw-prove/scripts/clip-fidelity.mjs` |
| **Fix cost** | one script receipt plus its CI case; two body edits; a version bump |

**The structural half is the one worth the fix spec's attention.** Step 6's clip-fidelity audit says
*"Run it on every **generated** spec"* while Step 7 says *"both runs execute the PR spec set — every
spec that proves this PR, not only the one this run wrote."* Carried specs are inside the filming set
and outside the gate. `240d63c1` learned that nine of seventeen carried scenarios had been filmed with
`PW_PROVE_CLIP` inert — after a full filming pass and 21 frame reads.

1. **Scope Step 6 to the PR spec set**, using the same derivation Step 7 uses. One sentence; it is
   the whole of the `240d63c1` cost.
2. **Make the ordering a gate instead of advice.** Nothing in Step 7 checks that Step 6 passed, which
   is why six sessions ran it late and one ran it 72 seconds after publishing. `clip-fidelity.mjs
   spec` already runs at Step 6 and exits 0; have it write a receipt naming the spec set it passed,
   and have the filming beat require a receipt matching the set it is about to film. Then a late Step
   6 is impossible rather than discouraged, and a spec set that changed after the gate is caught too.

This receipt is one of four in [ADR 0021](#adrs-owed) and should be decided with them, not alone.

### 17 — FR15: Step 4's plan is skipped, or posted without the blocks that make it checkable

| | |
|---|---|
| **Answers** | [FR15](../studies/friction-findings.md#fr15--step-4s-plan-is-skipped-or-posted-without-the-blocks-that-make-it-checkable) · rank 17, frequency rank 14 |
| **Measured** | 5 of 26 · S3 · indirect — `befb0456` then spent 6m00s on an operator question the plan exists to make unnecessary |
| **Verdict** | confirmed; all three blocks still required (`SKILL.md:596`, `:613`, `:624`) and the step still produces no artifact any script reads |
| **Fix target** | `## Step 4: Plan`; `skills/pw-prove/scripts/clip-fidelity.mjs spec` (its `--verdict` input) |
| **Fix cost** | a new written artifact and a changed script contract — **structural**, see [ADR 0021](#adrs-owed) |

Step 4's own text names the mechanism that makes a mid-run question unnecessary: *"Every side-question
resolves from the contract as a stated Assumptions line — asking any of them is a bug."* `befb0456`
skipped the plan and asked the question six minutes later. `18697484` posted its plan *before* Step
3's bring-up, so no locator in it could have been observed.

**Make the plan an artifact.** Write it to `.pw-prove/plan.md` — a directory the run already excludes
from git at Step 7 — carrying the three required blocks. A step whose output exists only in a chat
message is a step nothing downstream can check, and that is exactly what the corpus shows: a plan
skipped and a plan posted without its blocks are indistinguishable to everything after it.

**Then let the gate read it instead of being told.** `cbe2813b` shows the failure from the other
direction: its Assumptions block declared `deliberate: 1600x900 (already pinned in the spec)` — two
mutually exclusive terms in the skill's own vocabulary — and the run passed the audit
`--verdict "pinned:1600x900"` rather than the Assumptions line verbatim as Step 6 requires. The gate
agreed with the substituted verdict. **A self-check whose input the run may correct on the way in
cannot catch the plan that was wrong.** Have `clip-fidelity.mjs spec` read the viewport verdict from
the plan artifact rather than from an argument.

**This artifact is also where three other entries land**: the `ACs:` invariant that
[FR14](#14--fr14-the-reports-ac-arithmetic-does-not-reconcile-with-its-own-tables) cannot enforce
without a machine-readable AC table, the `Recon:` line from
[FR8](#11--fr8-recon-is-skipped-or-arrives-after-the-spec-is-written), and the `Profile:` read
receipt from [FR18](#19--fr18-the-profile-is-written-back-with-values-that-are-wrong-unusable-or-in-the-wrong-place).
That is why it is one ADR and not four changes.

### 18 — FR16: the `.git/info/exclude` snippet fails in a worktree

| | |
|---|---|
| **Answers** | [FR16](../studies/friction-findings.md#fr16--the-gitinfoexclude-snippet-fails-in-a-git-worktree) · rank 18, frequency rank 15 |
| **Measured** | 5 of 26 · S4 · one to two turns each, ~35s |
| **Verdict** | confirmed; `SKILL.md:770` unchanged, and the idempotence guard in front of it does not help — in a worktree `.git` is a *file*, so both the `grep` and the append resolve through a non-directory |
| **Fix target** | `## Step 7: Verify`, item **1b. Bind the HAR to this run** |
| **Fix cost** | one line; a version bump |

Cheap, unmissable, unfixed across at least six versions, and every session recovered unaided. Replace
the literal path with the resolved one:

```
GIT_DIR=$(git rev-parse --git-dir)
grep -qxF '.pw-prove/' "$GIT_DIR/info/exclude" || printf '.pw-prove/\n' >> "$GIT_DIR/info/exclude"
```

**`--git-dir`, not `--git-common-dir`, and the difference is the finding's tail.** In a worktree
`--git-dir` gives that worktree's own directory and the exclusion stays this run's private state;
`--git-common-dir` gives the shared one and writes the exclusion into every worktree of the
repository. `af23ab55` recovered in a way that put it in the **main** checkout, which the study calls
*"a different and quieter wrong answer"* — the fix should not prescribe it.

### 19 — FR18: the profile is written back with values that are wrong, unusable, or in the wrong place

| | |
|---|---|
| **Answers** | [FR18](../studies/friction-findings.md#fr18--the-runtime-profile-is-written-back-with-values-that-are-wrong-unusable-or-in-the-wrong-place) · rank 19, frequency rank 17 |
| **Measured** | 4 of 26 · S3 · one to two turns each. And, from the [profile audit](../studies/profile-audit.md): **4 of 56** entries scored as applied, **7** entries a later run re-paid, **45** with no evidence either way |
| **Verdict** | confirmed for three sessions; `d3c037d9`'s half **confirmed-fixed at 0.21.0**, when `#### The run writes the profile back` first appeared |
| **Fix target** | `### Runtime profile — what an earlier run already paid for` (`SKILL.md:150`); `#### The run writes the profile back` (`:177`); `## Step 4: Plan`'s Assumptions block |
| **Fix cost** | three body changes; a version bump. Two of the three are structural — see [ADR 0021](#adrs-owed) and [ADR 0022](#adrs-owed) |

The profile is read and trusted at Step 1 and contradicted later in the same run, with nothing that
reconciles the two. The profile audit measured what that costs and found three defects that outrank
every entry-level verdict.

**1 — The write-back validates nothing, not even against the run's own observations.** `6f307a2f`
wrote `ENV_CONTRACT=none` into the profile header at transcript line 233 — the exact value that had
failed 20 minutes earlier in the same run at line 103 — caught it one turn later and called it *"a
self-inflicted trap"*. Only the agent's second look saved it. Add one check to the write-back: **does
any value being written contradict something this run observed?** The header is the part of the
profile most likely to be used, because `SKILL.md` makes it *pasted* rather than read — which makes it
the part most likely to cost when wrong.

**2 — The reading half leaves no receipt.** The `Profile:` Assumptions line is required, has no skip
form, and appears in **none** of the 26 distillations. Its absence is why the audit could score only
four of 56 entries and had to leave 45 unresolved. It costs nothing to produce and it is the
instrument the next audit needs. It lands in the plan artifact from
[FR15](#17--fr15-step-4s-plan-is-skipped-or-posted-without-the-blocks-that-make-it-checkable), which
is why the two are one decision.

**3 — A fact about the host or a shipped script has nowhere to go but the profile.** Six chrysus
entries describe the machine or `preflight.mjs` rather than the repository and fail the admission
test's first question openly. The reason is structural, not careless: a run that learns something
about a shipped script has exactly one write surface, and `SKILL.md` gives it no other.
`hyrd-widget`'s own preamble names the missing one and that file is visibly cleaner for it. Add the
rule and the destination: **a skill or host fact is not a repository fact — it goes in the run's
completion report as a named skill defect, never into the profile.** That is [ADR 0022](#adrs-owed),
and fixing [FR1](#1--fr1-preflightmjs-certifies-a-restart-that-died) in the script is what makes the
two entries it would evict (C5, C29, ~25 lines) evictable.

**Two further audit findings, recorded here and not fixed here.** The 20-entry cap is a sentence with
no instrument behind it — chrysus holds 30 entries in 321 lines, widget 26 in 217. And the delivery is
branch-local: a fact reaches the next run only after its PR merges and the reader's checkout syncs, so
`hyrd-widget`'s live file is missing ten entries written by corpus sessions. The first is a cap this
spec declines to enforce mechanically without evidence that the cap is the binding constraint; the
second is largely the repositories' and belongs to the setup studies. pw-prove's half of the second is
one report line: say where the write-back landed and that it is branch-local until merge.

### 20 — FR17: confirmed-fixed at 0.24.0 — a regression guard is owed

| | |
|---|---|
| **Answers** | [FR17](../studies/friction-findings.md#fr17--env_contractnone-is-documented-as-a-sentinel-and-the-shipped-script-reads-it-as-a-path) · rank 20, frequency rank 18 |
| **Measured** | 4 of 26 · S4 · 6–29 seconds and one turn each |
| **Verdict** | **confirmed-fixed at 0.24.0** by commit `cb8aecb`; `ENV_CONTRACT` appears on 6 lines of the body and 6 of `preflight.mjs` at 0.23.1, and **0 times in either** at 0.24.0 and every version since |
| **Fix target** | none — and one new CI check |
| **Fix cost** | one check in `scripts/ci/review.sh` |

**No fix.** The defect is gone and so is the documented feature.

**A guard is worth it, and it is cheap.** The defect's shape was a **body-versus-script disagreement
inside one install**: the body documented a value the shipped script of the same version did not
implement, and two runs pasted it verbatim exactly as the body instructs. Nothing in CI would catch
that recurring. Add a parity check: **every environment key named in the body's profile-header
template is a key `preflight.mjs` actually reads.** It is a grep against a grep, it belongs beside the
existing parity checks in `review.sh`, and it generalises beyond this one key — the profile audit found
that both live profile headers still carry `ENV_CONTRACT`, six lines of the most load-bearing surface
in the file, inert, with nothing in the loop that would ever notice.

### 21 — FR21: the one-re-film budget is a spend cap on a loop with no diagnosis

| | |
|---|---|
| **Answers** | [FR21](../studies/friction-findings.md#fr21--the-one-re-film-budget-is-exceeded-and-the-run-says-so) · rank 21, frequency rank 21 |
| **Measured** | 3 of 26 · S3 · ~40 min across four filming runs (`18697484`) · ~9 min and two extra films (`3072aa9b`) |
| **Verdict** | confirmed; *"Exactly one re-film."* unchanged at `SKILL.md:1014` |
| **Fix target** | `### Clip inspection — look at the frame before anyone else does` |
| **Fix cost** | one paragraph; a version bump. It depends on [FR2](#2--fr2-the-clip-gates-certify-filmability-never-subject)'s new diagnosis rows |

In all three the overrun is stated plainly in the run's own text. What the corpus shows is that **the
budget does not converge**: `18697484` spent four films and ended with the same four toast chapters
sampling after dismissal; `3072aa9b` spent three and ended with three payoffs missing. The budget is a
spend cap on a loop that had not found its diagnosis — the same shape as FR11.

**Tie the re-film to a diagnosis instead of to a count.** A re-film is sanctioned when the inspection
names a diagnosis row and the fix addresses it; where the diagnosis is *payoff expired* — the
application's own toast lifetime, which is
[FR26](../studies/friction-findings.md#fr26--the-applications-payoff-self-dismisses-before-the-sampled-frame)
and the repositories' half — the answer is never a re-film. It is a spec change that holds the payoff,
or an honest degraded report. A budget with no convergence requirement spends the film and keeps the
defect.

### 22 — FR19: the whole spec is re-run during the heal loop

| | |
|---|---|
| **Answers** | [FR19](../studies/friction-findings.md#fr19--the-whole-spec-is-re-run-during-the-heal-loop-where-the-body-says-to-rerun-only-what-failed) · rank 22, frequency rank 22 |
| **Measured** | 3 of 26 · S3 · ~6.3 min for two identical full runs (`1927b90c`) · ~10m34s across five full-spec runs against a live staging tenant (`af23ab55`) |
| **Verdict** | confirmed; the rule is unchanged and **bolded** at `SKILL.md:923`, and three other sessions kept it exactly as written |
| **Fix target** | `### Failure handling`, the copyable snippet |
| **Fix cost** | one snippet; a version bump |

**Nothing is wrong with the wording, and the counter-examples prove it.** `d3c037d9`, `fa0cc83b` and
`f28c3493` all ran `-g`-scoped reruns during the loop and one full-spec gate after the last fix,
exactly as written. The rule is keepable.

So the only change the evidence supports is mechanical: **put `-g "<title>"` in the snippet a run
copies.** The three sessions that got it wrong ran a bare full-spec command, and runs copy snippets.
Where the body shows a command, show the scoped one.

### 23 — FR22: the hygiene sweep's pathspec half-matches and exits 0

| | |
|---|---|
| **Answers** | [FR22](../studies/friction-findings.md#fr22--step-8s-hygiene-git-checkout-----silently-skips-the-repository-root-file) · rank 23, frequency rank 23 |
| **Measured** | 2 of 26 · S4 · ~0 in both, because the sweep happened to have nothing to do |
| **Verdict** | confirmed **and worse than first stated**; the original mechanism (*"`**/` is literal"*) is **refuted** |
| **Fix target** | `## Step 8: Deliver`, the codegen-revert bullet (`SKILL.md:1160`) |
| **Fix cost** | one line; a version bump |

**Act on the corrected mechanism.** Git's default pathspec is wildmatch **without** pathname mode, so
`**/x` is neither literal nor `x`: it matches any path containing a `/` and misses the repository-root
file. The sweep therefore *partially* matches — it reverts nested codegen, leaves root-level codegen
dirty, and **exits 0 while doing so**. That half is
[#137's measurement](../studies/friction-findings.md#fr22-verification), not this spec's, and is not
re-derived here.

What this spec adds is the confirmation a prescription owes: the prescribed form was run against the
same fixture (git 2.43.0, one modified `auto-imports.d.ts` at the root and one under `app/`) and
reverts **both**, so the fix needs no companion top-level pathspec:

```
git checkout -- ':(glob)**/auto-imports.d.ts' ':(glob)**/components.d.ts'
```

The two observed `did not match any file(s)` errors were the case where the only such file was at the
root, or where there was nothing to revert at all. A sweep that half-matches and reports success will
silently fail to revert codegen churn on the run where it matters.

`3072aa9b`'s distillation notes the irony worth keeping in the body: this is the same `**/` trap the
body already warns about at length in Step 7's spec-set derivation (`SKILL.md:791`–`794`, *"git's
default pathspec is not glob mode"*). One warning exists, in the right words, seven hundred lines from
the bullet that needed it — which is
[the restructuring section](#restructuring-skillmd-what-the-evidence-supports)'s case in miniature.

### 24 — FR32: confirmed-fixed at 0.22.0 — the ordering is load-bearing

| | |
|---|---|
| **Answers** | [FR32](../studies/friction-findings.md#fr32--the-hermetic-audit-ran-after-filming-and-after-clip-inspection) · rank 24, frequency rank 24 |
| **Measured** | 1 of 26 · S3 · ~3 minutes and two extra filming runs, one of which introduced a regression |
| **Verdict** | **confirmed-fixed at 0.22.0**; at 0.21.0 `### Clip inspection` was at line 784 and the hermetic audit at 819, and from 0.22.0 the audit is renamed and moved ahead of inspection — at HEAD `SKILL.md:963` and `:980` |
| **Fix target** | none |
| **Fix cost** | a guard is one grep, and this entry recommends it |

**No fix.** The two extra films this session paid for are not reachable at HEAD, and
[ADR 0020](../adr/0020-audit-before-filming-rebuild-when-needed.md) records the decision that moved it.

**One cheap guard is worth taking, and it should be taken with FR17's.** The ordering is load-bearing
— it cost `fa0cc83b` two films and one of the two lost a payoff frame the first film had held — and
nothing asserts it. A single ordering assertion in `scripts/ci/review.sh` (`### Hermetic audit`
precedes `### Clip inspection` in `SKILL.md`) makes a re-reordering visible. On its own it is a
one-line check for a defect that has not recurred; bundled with FR17's body-versus-script parity check
it is one small addition to `review.sh` covering two ways the body silently drifts.

### 25 — FR23: `publish-proof.mjs` prints `publish failed` over a successful HTTP 200

| | |
|---|---|
| **Answers** | [FR23](../studies/friction-findings.md#fr23--publish-proofmjs-printed-publish-failed-over-a-successful-http-200) · rank 25, frequency rank 25 |
| **Measured** | 1 of 26 · S3 · one turn; the run verified the response by hand and continued |
| **Verdict** | confirmed the strongest way available — `publish-proof.mjs` has not changed since `3292ad9`, which predates the whole corpus, so the file at HEAD is byte-identical to the one that produced the message |
| **Fix target** | `skills/pw-prove/scripts/clips.mjs` (`classifyClipsResponse`, `:266`–`:302`); `skills/pw-prove/scripts/publish-proof.mjs` (`:130`, `:434`–`435`) |
| **Fix cost** | one classifier branch and one headline; a case in `scripts/ci/test-publish-proof.sh`; a version bump |

Recorded at n=1 because it is a shipped script telling a run its work **failed when it succeeded** —
the same class of instrument defect as [FR1](#1--fr1-preflightmjs-certifies-a-restart-that-died) with
the sign reversed, which is why n=1 is not an argument against it.

**The defect is a fall-through.** `classifyClipsResponse` returns `unexpected` whenever a 200's body
will not `JSON.parse` or is not a JSON-RPC object, and `publish-proof.mjs`'s `default` branch renders
that as `rejected the publish — HTTP 200:` under the `publish failed` headline set at `:130`. So a 200
carrying a live share link in a shape the parser does not recognise reports the publish as failed and
tells the run to attach the video by hand.

**Two changes, and the first is the load-bearing one.**

1. **A 2xx is never `publish failed`.** Give it its own headline — `publish status unknown — HTTP
   200` — and its own remedy: verify the link before attaching anything by hand. The `undelivered()`
   helper already takes a `headline` argument for exactly this distinction, and its own comment
   explains why: *"calling that a failure sends an operator looking for an outage."*
2. **Look for the link before declaring nothing came back.** Where a 200's body carries a share URL in
   an unrecognised envelope, extract it and report `published (unrecognised response shape)` with the
   body's shape printed for diagnosis. That is what the run did by hand at `3deeddd7:568`.

Deliberately **not** recorded as confirmed-fixed by the three later successful publishes in the same
session: they differ in response size and clip count too, so the range does not isolate the variable —
and the code cannot have changed, because it did not.

---

## Restructuring `SKILL.md`: what the evidence supports

**No line-count target, and no section is cut for length.** What follows is drawn from three things
the corpus can actually show: a rule that was **never reached**, a rule that was **re-read
repeatedly**, and a rule that was **misread**. Where the evidence says a long section is load-bearing,
this section says so and leaves it.

### What the evidence shows was *not* the problem

**Length is not the failure mode this corpus recorded.** In the four findings with the highest measured
cost, the instruction was present, correct, unambiguous and — in three of the four — *quoted back by
the run in its own words* before being walked past. FR11's checkpoint was recognised by name in five
of six sessions. FR3's base-merge sentence is byte-identical across five versions and was skipped by
four runs that each reached the same recognition later. FR19's rule is bolded and three sessions kept
it exactly. **Cutting any of those sections would remove a rule that was read.** A shorter body would
not have changed a single one of the four top-ranked outcomes.

That is the strongest argument in this document against treating the line count as the lever, and it
is why the ranking, not the file size, drives what follows.

### Three structural changes the evidence does support

**1 — A rule that guards a step lives at that step, not seven hundred lines away.** FR22 is the clean
case: Step 7 warns at length that git's default pathspec is not glob mode (`SKILL.md:791`–`794`),
Step 8's codegen bullet falls into exactly that trap at `:1160`, and the two are 370 lines apart.
FR20 is the same shape inverted — the hygiene sweep is written **twice**, and the copy in the handover
stop carries neither of Step 8's guards. Give each such rule one home and reference it. This is
reorganisation, not deletion: nothing is removed and nothing new is asserted.

**2 — Reference material that a step consults moves to an on-demand sibling; material a step must
*obey* stays inline.** The repository already does this — `best-practices.md` and `code-rules.md` sit
beside `SKILL.md` and are read on demand. Two candidates, and the test is whether the corpus shows
runs *consulting* or *following*:
  - **Move:** `### Bring the environment up`'s `SERVE_CAUSE` taxonomy (`SKILL.md:474`) — six failure
    causes, each with its own remedy, read only when a bring-up fails. Nothing in the corpus turns on
    having it in front of the run at Step 3.
  - **Keep, despite its length:** `### Clip inspection`'s diagnosis table. It is 36 lines, it is the
    highest-severity confirmed finding's fix target, 8 of 26 sessions hit the gap in it, and
    [FR2](#2--fr2-the-clip-gates-certify-filmability-never-subject) makes it **longer** by two rows.
    A run consults it at the moment it is deciding whether a proof is real. It stays inline and it
    grows.

**3 — Where a rule has been walked past by runs that quoted it, the answer is a receipt, not more
prose.** Six findings — FR3, FR10, FR13, FR14, FR15, FR18 — share one shape: the body states the rule
correctly, nothing downstream can tell whether it was followed, and the cost lands later. Every one of
their fixes above is a small artifact that a later step reads. Taken together they are one decision
about how this pipeline holds together, which is why they are [ADR 0021](#adrs-owed) rather than six
independent edits.

### What this section deliberately does not propose

A reorganisation of the eight-step pipeline itself. The pipeline's ordering is the subject of
[ADR 0020](../adr/0020-audit-before-filming-rebuild-when-needed.md) and
[ADR 0017](../adr/0017-proof-run-is-concurrent.md), the corpus records one ordering defect (FR32) and
it is already fixed, and FR13's ordering problem is a missing gate rather than a wrong order. There is
no evidence here for moving the steps.

---

## ADRs owed

**Numbers 0021, 0022 and 0023 are reserved by this spec.** `docs/adr/` holds decisions already taken
— twenty files, narrative, past tense, no status field — so no ADR file is written here: the operator
has not decided, and an ADR recording an undecided decision would be the first artifact in that
directory a reader has to check the status of before trusting. Each ADR below is written, in past
tense like the other twenty, **when its entry is accepted**. The numbers are reserved so a parallel
ticket does not collide.

**ADR 0021 — a pw-prove step that a later step depends on leaves a receipt on disk.**
Owed by [FR15](#17--fr15-step-4s-plan-is-skipped-or-posted-without-the-blocks-that-make-it-checkable),
and joined by [FR13](#16--fr13-step-6s-gate-runs-after-step-7-and-covers-the-wrong-spec-set),
[FR14](#14--fr14-the-reports-ac-arithmetic-does-not-reconcile-with-its-own-tables),
[FR10](#12--fr10-clips-n-inspected-counts-frames-from-a-film-that-was-thrown-away) and
[FR18](#19--fr18-the-profile-is-written-back-with-values-that-are-wrong-unusable-or-in-the-wrong-place).
Why it is structural: it changes Step 4 from a chat message into an artifact (`.pw-prove/plan.md`),
changes `clip-fidelity.mjs spec`'s input contract from an argument the run types to a file the plan
holds, and adds a Step-6 pass receipt the filming beat requires. It is expensive to reverse because
downstream steps come to depend on the artifacts. What it decides: which steps owe a receipt, where
receipts live, and that a receipt is written by the step that earns it and read by the step that
depends on it — never retyped in between.

**ADR 0022 — the runtime profile holds repository facts only; a skill or host fact goes to the
report.** Owed by [FR18](#19--fr18-the-profile-is-written-back-with-values-that-are-wrong-unusable-or-in-the-wrong-place),
enabled by [FR1](#1--fr1-preflightmjs-certifies-a-restart-that-died). Why it is structural: it adds a
destination the skill does not currently have, and it makes the profile's first admission test
enforceable rather than aspirational. The [profile audit](../studies/profile-audit.md#verdict-on-the-admission-test)
measured the cost of not having it — six chrysus entries describing a host machine or a shipped
script, two of them (~25 lines) duplicating one `preflight.mjs` hazard, in the file a run reads at
every Step 1.

**ADR 0023 — what `playwright-debugger` is for when the heal loop stalls.** Owed by
[FR11](#15--fr11-the-failure-bound-is-announced-and-walked-past-and-the-handover-is-taken-0-of-6).
Why it is a decision and not a repair: 0 of 6 is the measured record of a rule that was recognised by
name and declined, and every available response — keep it, delete it, or change what the invocation is
for — changes what the skill promises about its own exit. This is the only entry in the spec that is a
promise change, and it should not be made without the record of why.

---

## Out of Scope

**Repository-fault findings.** FR25, FR26, FR27, FR28, FR29, FR30 and FR31 belong to the two
target-repository setup studies. Where pw-prove owns half of one, that half is inside the entry it is
twinned with: FR25 inside [FR4](#6--fr4-a-script-is-re-run-only-to-re-read-its-own-output) and
[FR5](#7--fr5-the-reports-e2e-reviewer-line-is-unsupported-by-anything-the-run-saw), FR26 inside
[FR21](#21--fr21-the-one-re-film-budget-is-a-spend-cap-on-a-loop-with-no-diagnosis), FR27 inside
[FR7](#10--fr7-step-8-says-no-questions-and-eight-runs-asked-one-at-the-push).

**The 23 `unattributed` items.** Fourteen of the 26 distillations carry items no `SKILL.md` section
could be found for — a shell working-directory retry, an import-order convention, an exit-code
masking, a bounded diff read, a post-delivery bug hunt. They became no `FR` row because a finding needs
an editable target and these have none. They are **gaps in the instructions rather than defects in
them**, which is a different kind of change from every entry above, and
[the friction findings](../studies/friction-findings.md#what-the-instrument-could-not-see) says a spec
that wants to close gaps should start there. This one does not.

**Anything the instrument could not see.** Three blind spots are inherited by every entry above and
bound its confidence: the terminal-state triple has no word for a run that stopped in a shape it did
not intend; a record shape that looks like an operator turn is an Orca notification; and roughly a
third of the corpus serialises every `thinking` block empty, so **every attribution of intent here is
inferred from commands, outputs and visible text** — never from what the agent was reasoning.

**The unevenness of the verification.** #137 states it plainly and it carries into this spec. Five
verdicts went back to primary evidence and could have come back negative — FR11, FR13, FR5, FR22 and
FR1. The other twenty tested whether the instruction is still there, at the version that ran and at
HEAD, and took the behavioural half from the distillation. **FR8, FR10, FR12, FR15, FR19 and FR21 are
behavioural claims confirmed from prose that has not changed**; their frequency counts are #134's and
are inherited, not re-measured. A reader who wants to argue with one of those should argue with the
distillation, and the
[citation index](../studies/friction-findings.md#citation-index) says which transcript to open.

**No tickets.** Deliberately, and by the parent's decision: the operator reads the ranked list and
chooses what is worth doing, because filing forty tickets from an unread audit is how the audit gets
abandoned.
