# Friction findings — what pw-prove cost across 26 real sessions, ranked

This is the ranked list the [run forensics](run-forensics.md) exercise exists to produce: every
[friction finding](../../CONTEXT.md#friction-finding) drawn from the 26
[session distillations](session-distillation.md), ordered so the operator can see for the first time
which instruction cost the most across a real week.

Nothing here is a decision. A finding is evidence a reader may act on, never a commitment that
anything will change, and no ticket exists because a row appears below. The fix spec that consumes
this list is a separate document under `docs/specs/`, and it is written only after the operator has
read this one.

**This list is not verified against HEAD.** Every finding is ranked from what the transcripts
contain, at the version each session actually ran. Re-checking the surviving findings against the
current `SKILL.md` and shipped scripts — and adversarially re-reading them, so a distillation that
mistook a normal step for thrashing is caught — is a separate pass. Two findings below are already
recorded as **confirmed-fixed** because the evidence inside the corpus itself shows the cause gone;
every other row is an open question for that pass, not a conclusion.

## How this list is ordered

**Frequency first.** The primary order is how many of the 26 corpus sessions hit the finding. A thing
that cost ten sessions a minute each outranks a thing that cost one session an hour.

**Ties are broken by severity, then by time, then by identifier**, and the rule is stated because
half the list is a tie: four findings hit 8 sessions each, four hit 6, and four hit 3. Within one
frequency, the more severe finding ranks higher; where severity also ties, the finding with the
larger single measured time instance ranks higher; where both tie, the lower `FR` number wins, which
is arbitrary and is meant to be — an arbitrary tie-break that is stated can be argued with, and one
that is not stated cannot.

**Severity overrides frequency, and every lift is stated.** Four findings sit above the frequency
order. Each one names the frequency rank it was lifted from, so the ranking can be argued with rather
than taken on trust. Severity is one of four values:

| Severity | Meaning |
|---|---|
| **S1** | A proof that passed while proving nothing, or a gate whose green would license one. |
| **S2** | Evidence destroyed, or a delivered report a reader would act on wrongly. |
| **S3** | Time and rework, with no false claim reaching a reader. |
| **S4** | Turns spent, but not minutes. |

**Time is reported separately and never folded in.** The Time column carries the largest measured
instances, with their session. It is not summed into the rank and it is not averaged — a composite
score would hide which input drove the order, and this ranking is meant to be argued with.

**Every finding carries three mandatory fields**, and a row missing any of them would be incomplete
rather than a finding: the `SKILL.md` section or named script it is attributed to; a citation of the
form `session:line` that a reader can open a month from now (the transcript path for every session id
is in the [citation index](#citation-index) at the foot of this document); and the pw-prove
**version(s)** it was observed on. Eight versions ran inside this corpus — 0.20.0, 0.21.0, 0.22.0,
0.23.1, 0.24.0, 0.26.0, 0.27.0 and 0.27.1 — so a defect seen at 0.20.0 is not argued as if it
described 0.27.1. The Versions cell is always the deduped set of versions the ledger recorded for the
sessions the Frequency cell names, so a reader can check the two against each other.

A fourth field, **Status**, appears only where there is something to say: `confirmed-fixed`, on a
finding whose cause the corpus itself shows to be gone. Its absence means open, not unexamined.

**Fault side is a field, not a separate list.** Each finding is marked pw-prove's fault, the target
repository's, or a **boundary case**. A boundary case is kept as a boundary case: it is never forced
to one side to satisfy the classification, and it is never dropped. The repository-fault and
boundary-heavy findings are collected in [their own section](#repository-fault-and-boundary-findings)
so the per-repository setup studies can read them without re-deriving the split, but they share the
same ID namespace, so a later re-classification does not renumber anything.

### The identifiers

Friction categories are `FR1`–`FR32`, assigned **after** the evidence was in rather than reserved up
front — a taxonomy named before reading would have fitted nothing observed. They are stable in the
manner of this repository's 24 pattern IDs and its F1–F15 failure codes: an ID, once given, is
permanent, and a finding whose cause is gone keeps its ID and is marked confirmed-fixed rather than
deleted. The IDs are **not** ordered by rank — they were assigned in the order the categories fell
out of the corpus, and the rank column is what orders the list. Re-ranking is expected as later
evidence arrives; renumbering is not.

`FR` deliberately does not reuse `#N` (the reviewer's anti-pattern IDs) or `F1`–`F15` (the debugger's
failure categories). A reader who sees `FR11` should never have to work out which taxonomy it belongs
to.

## The corpus, in one paragraph

The corpus, the control list and the exclusion are defined once, in
[run forensics](run-forensics.md#what-the-exercise-covers), and are not restated here. Only the two
figures every count below is a fraction of are repeated: **26 sessions**, 14 against
`nuxt-hyrd-chrysus` and 12 against `hyrd-widget`, carrying **632 shipped-script records and 57
non-zero exits**. Every `n of 26` in this document is a count of those sessions. No finding is drawn
from the five control sessions.

---

## The ranked list

### Lifted above the frequency order by severity

#### FR1 — `preflight.mjs` reports `RESTART=proven` for a restart that died, and the body forbids checking

| | |
|---|---|
| **Rank** | 1 — **lifted from frequency rank 19** (n=3) |
| **Frequency** | 3 of 26 — `0259fd57`, `3072aa9b`, `c871a4f2` |
| **Severity** | **S1** |
| **Time** | ~2m40s of redone mutation work (`3072aa9b`); one killed listener and a re-staged restart (`c871a4f2`); three preview-server starts for one mutation check (`0259fd57`) |
| **Attribution** | `### Bring the environment up (autonomous — don't stop to ask)` (Step 3) and `### Mutation check (PR-mode: REQUIRED — hard-bounded)` (Step 7); shipped script `skills/pw-prove/scripts/preflight.mjs`, restart mode |
| **Citations** | `0259fd57:492` reported, `:511` refuted · `3072aa9b:1037` reported, `:1052` refuted · `c871a4f2:523` reported, `:531`/`:537` refuted |
| **Versions** | 0.24.0, 0.26.0 |
| **Fault** | **pw-prove** |

The restarted preview server prints its `serving …` banner **before** it binds. When the bind then
fails with `EADDRINUSE`, the banner has already landed past the restart log mark, `preflight.mjs`
declares `SERVE=ok` / `RESTART=proven`, and the **old** server — holding the pre-mutation artifact —
keeps answering the poll.

This is why it is lifted. The body makes `RESTART=proven` the licence to read the mutation verdict,
and in the same breath tells the run not to question it: *"`RESTART=proven` is proven — do not
re-litigate a fast one."* An agent that obeyed that sentence would have read its mutation run against
an artifact that never held the mutation, and reported a GREEN-is-unguarded verdict or a red for the
wrong reason. All three sessions caught it, and all three caught it by an **unrequested** cross-check
the body discourages — `pgrep` and `curl` in `0259fd57`, a pid/port check in `c871a4f2`, the server
log in `3072aa9b`. One run named it in its own completion report: *"A proof-tooling bug cost a cycle
and would have faked a verdict"* (`c871a4f2:696`).

n=3 is the count of sessions where the false positive **fired and was caught**. It is not a count of
sessions at risk: every PR-mode run against a built target executes this restart.

#### FR2 — the clip gates certify that a clip can be filmed, never what the frame shows

| | |
|---|---|
| **Rank** | 2 — **lifted from frequency rank 5** (n=8) |
| **Frequency** | 8 of 26 — `0259fd57`, `240d63c1`, `3072aa9b`, `7cc7e6bc`, `a7cdcd1c`, `bbae9aa2`, `c871a4f2`, `cbe2813b` |
| **Severity** | **S1** — carries the corpus's one **landed** false proof |
| **Time** | ~24 min of superseded work plus two published recordings (`0259fd57`); ~11 min and 21 frame reads (`240d63c1`); ~9 min and two extra films (`3072aa9b`) |
| **Attribution** | `### Clip-fidelity audit` (Step 6) and `### Clip inspection — look at the frame before anyone else does` (Step 7); shipped script `skills/pw-prove/scripts/clip-fidelity.mjs` |
| **Citations** | `0259fd57:334` (the claim), `:342` (the operator's rejection), `:347` (the concession) · `7cc7e6bc:340` gate green, `:592` three off-frame defects · `bbae9aa2:355` `verdict: clip fidelity contract satisfied`, `:406` three clips for four tests · `3072aa9b:541` audit 14/14, `:993`/`:1003` three payoffs missing · `a7cdcd1c:964` vacuous scenario caught only by the frame read · `cbe2813b:503` two chapters published off-payoff |
| **Versions** | 0.23.1, 0.24.0, 0.26.0, 0.27.0 |
| **Fault** | **pw-prove** |

`clip-fidelity.mjs spec` proves a `PW_PROVE_CLIP`-gated, `JUSTIFIED` dwell exists inline and that the
viewport is pinned, and its exit 0 is written as *"the only way to Step 7"*. It cannot see what is in
the frame. The corpus shows four distinct things it certified over:

- **The wrong subject.** `0259fd57` published a green, mutation-verified, frame-inspected proof of a
  synthetic fixture logo for a defect reported against a specific real customer's logo file. Every
  gate passed. The operator caught it in one typed question, and the agent conceded in one turn. That
  is the corpus's only false proof that reached a reader, and it is why this row is lifted.
- **An unpainted element.** `7cc7e6bc` passed the gate over three dwells framed on nodes the browser
  was not painting — a rail collapsed to zero width, a trigger at `display: none`, a card around the
  asserted control.
- **A test whose context records no video.** `bbae9aa2`'s no-JS scenario built its own
  `browser.newContext()`, which does not inherit `use.video`; the gate said 4/4 and the film produced
  3 clips.
- **A payoff that had already gone.** `3072aa9b`, `c871a4f2` and `cbe2813b` all sampled frames after
  a toast had self-dismissed, with the audit green.

The diagnosis table in `### Clip inspection` has rows for payoff-not-held, element-off-frame,
payoff-expired and never-settled. It has no row for a frame whose *subject* is not the subject of the
acceptance criterion, and no rule for a frame that is legible but off-payoff — which is what
`cbe2813b:503` reclassified rather than re-filmed.

#### FR3 — the Step-3 base merge is skipped, and the run gets as far as publishing before noticing

| | |
|---|---|
| **Rank** | 3 — **lifted from frequency rank 16** (n=4) |
| **Frequency** | 4 of 26 — `18697484`, `998dd2c1`, `a273eefa`, `af23ab55` |
| **Severity** | **S1** — three of the four published a proof page of a base that would not ship |
| **Time** | ~14 min and 36 turns (`18697484`) · ~9 min and 23 turns (`998dd2c1`) · ~10m21s and 24 turns (`a273eefa`) · ~5m30s plus one orphaned public recording (`af23ab55`) |
| **Attribution** | `### Bring the environment up (autonomous — don't stop to ask)` (Step 3), the base-sync paragraph |
| **Citations** | `18697484:733` · `998dd2c1:544` · `a273eefa:780`, `:793` · `af23ab55:65` (the fetch without the merge), `:778` `BASE AHEAD — merge needed`, 41 minutes and one published page later |
| **Versions** | 0.24.0, 0.26.0, 0.27.0 |
| **Fault** | **pw-prove** — the instruction is explicit and unconditional in the body each run was handed |

The paragraph's own stated reason is the failure: *a PR proven against a stale base can go green on
code that will never ship that way*. In all four sessions the run reached the same recognition, in
almost the same words, after everything downstream had been paid for. `af23ab55` is the sharpest: the
run executed `git fetch origin main` at line 65 for the **diff** and never merged, then published a
complete proof page at 15:45:40 and discovered the base was ahead at 15:46:22.

The recurring cost is a full rebuild, a re-film, a re-inspection of every frame, and a second
publish. Two sessions left an **orphaned public recording** — a film of code that will not ship,
minted, never posted anywhere, and never superseded, because Step 8's supersede rule retires a proof
*per PR comment* and these were never commented.

Lifted because the outcome is a published artifact that reads as a proof and is not one. It ranks
below FR2 because every instance was caught by the run itself before a reader was told, and below FR1
because the licence FR1 gives away is the mutation verdict.

#### FR20 — the Step-8 hygiene sweep deletes the only evidence the run produced

| | |
|---|---|
| **Rank** | 4 — **lifted from frequency rank 20** (n=3) |
| **Frequency** | 3 of 26 — `d32c2495`, `fe171475`, `a273eefa` |
| **Severity** | **S2** — unrecoverable evidence loss, and two of the three drew an operator in to recover from it |
| **Time** | a 367.9s forced rebuild plus a re-film and re-inspection, 2h41m after the sweep (`d32c2495`) · a 7-minute filming pass to recreate footage that had existed (`fe171475`) · a rebuild, a relaunch and a re-film (`a273eefa`) |
| **Attribution** | `## Step 8: Deliver (PR-mode tail — deterministic, no questions)`, hygiene beat 2; and `### The handover stop — PR-mode's exit when the loop is exhausted`, whose one-line version of the same sweep carries **neither** of Step 8's guards |
| **Citations** | `d32c2495:523` (the sweep), `:693` (the cost, recognised 2h41m later) · `fe171475:565` (the sweep), `:988` (the operator: `wher is the record video`), `:993` (`there is no recorded video — I deleted it, and I should have flagged that`) · `a273eefa:766` (teardown), `:805`–`:819` (the rebuild and relaunch it forced) |
| **Versions** | 0.22.0, 0.23.1, 0.27.0 |
| **Fault** | **pw-prove** |

Step 8's beat carries a guard — *"Publish before deleting `test-results/`: the clips live there"* —
and a further guard for the kept proof file. Two cases slip past both:

- **A publish that came back *undelivered*.** `d32c2495`'s publish exited 0 with an empty page and a
  kept concatenated file; the sweep then removed the per-clip files, so the surviving artifact would
  have published as one chapter instead of two. Recovering it cost a 367.9s rebuild and a re-film.
- **A handover stop.** `fe171475` reached a state with no green run. The handover stop's own text
  instructs the sweep — *"sweep `test-results/`, and nothing else from Step 8"* — with no
  publish-first guard, because on a stop there is nothing to publish. But the proof config writes
  video on every run, so the sweep destroyed the only visual artifact a non-delivering run had. The
  operator found the report, found no video, and asked.

Lifted because deleted footage is the one cost in this corpus that cannot be re-derived from the
transcript, and because the failure mode is worst exactly when the run has least to show.

### Then, in frequency order

#### FR24 — the mutation check's forced rebuild is the largest instruction-driven time cost in the corpus

| | |
|---|---|
| **Rank** | 5 — frequency rank 1 |
| **Frequency** | 22 of 26 — every session whose distillation records a forced `BUILD_REUSE=never` mutation rebuild: `0259fd57`, `10748ea5`, `18697484`, `1927b90c`, `240d63c1`, `3072aa9b`, `67b624f4`, `6f307a2f`, `8eb0585c`, `9899ba51`, `998dd2c1`, `a273eefa`, `a7cdcd1c`, `af23ab55`, `bbae9aa2`, `befb0456`, `c871a4f2`, `cbe2813b`, `d32c2495`, `d3c037d9`, `f28c3493`, `fa0cc83b` |
| **Severity** | **S3** — by design, priced by the skill itself; recorded as cost, not as a defect |
| **Time** | 20m50s of a 71-minute run, 29% (`a7cdcd1c`) · 12m41s of 85 min (`3072aa9b`) · 8m24s of 66 min (`0259fd57`) · 7m36s of 51 min (`1927b90c`) · 343s of 27 min, 21% (`f28c3493`) |
| **Attribution** | `### Mutation check (PR-mode: REQUIRED — hard-bounded)` — `BUILD_REUSE=never` is stated as not optional; and `### Bring the environment up (autonomous — don't stop to ask)` for the bring-up build |
| **Citations** | `a7cdcd1c:1086` (`BUILD=failed BUILD_EXIT=143` after 396s, then 405s again at `:1111`) · `3072aa9b:133`/`:691`/`:1008` (242s + 246s + 273s) · `1927b90c:665` (the run's own report: *"the proof run cost two full builds (241s + 215s for the mutation rebuild)"*) |
| **Versions** | 0.20.0, 0.21.0, 0.22.0, 0.23.1, 0.24.0, 0.26.0, 0.27.0, 0.27.1 — every version in the corpus |
| **Fault** | **pw-prove**, by design |

The four sessions that do not appear above are the two whose range holds no `preflight.mjs` build
at all, and the two whose mutation verdict was reported `carried` so nothing was rebuilt.

Two to four full production builds per run, at 100–450 seconds each. Two of them are mandated: the
Step-3 bring-up and the Step-7 `BUILD_REUSE=never` mutation rebuild. Runs that skipped the base merge
(FR3) pay a third; a run whose rebuild raced a live preview server paid a fourth (`a7cdcd1c`, where a
396s build was SIGTERMed by memory pressure and re-run at 405s — 13m21s for one verdict, the single
most expensive friction instance measured anywhere in the corpus).

This is the top of the frequency order and it is not a defect. It is here because it is the largest
number a fix spec has to argue with, and because the ranking rule that puts it fifth is the same rule
that puts FR1 first.

#### FR4 — a script is re-run only to re-read its own output through a different filter

| | |
|---|---|
| **Rank** | 6 — frequency rank 2 |
| **Frequency** | 15 of 26 — `10748ea5`, `18697484`, `1927b90c`, `3072aa9b`, `3deeddd7`, `67b624f4`, `998dd2c1`, `9899ba51`, `a7cdcd1c`, `b6dbd8be`, `befb0456`, `c871a4f2`, `cbe2813b`, `d32c2495`, `d3c037d9` |
| **Severity** | **S4** |
| **Time** | 7–25 seconds and one turn per instance; `18697484` ran `scan.mjs` three times in 49s and `hermetic.mjs` three times back to back; `b6dbd8be` ran `hermetic.mjs` six times, three of them for the filter alone |
| **Attribution** | `### e2e-reviewer skill` (Step 6) and `### Hermetic audit (on the audit run, before anything is filmed)` (Step 7); shipped scripts `skills/e2e-reviewer/scripts/scan.mjs` and `skills/pw-prove/scripts/hermetic.mjs` |
| **Citations** | `1927b90c:235`/`:240` (`tail -60`, then the same scan grepped) · `18697484:365`/`:372`/`:376` (`tail -30` → `grep -nE` → `sed -n '3,7p'`) · `67b624f4:381` (*"Need the LIVE section — it scrolled off."*) · `998dd2c1:303`/`:308` · `c871a4f2` two scans |
| **Versions** | 0.20.0, 0.21.0, 0.22.0, 0.23.1, 0.24.0, 0.26.0, 0.27.0, 0.27.1 |
| **Fault** | **boundary case** — the invocations are pw-prove's, the output shapes are the two scripts', and the filters are the agent's |

The most frequent finding in the corpus, and the cheapest per instance. Both scripts emit more output
than a turn can hold, so a run pipes them through `tail`, `head`, `grep` or `sed`, discovers the
pipe cut off the load-bearing half, and re-runs the identical command with a different pipe.
`hermetic.mjs`'s verdict is at the top and its LIVE list further down; `scan.mjs`'s summary and per-hit
rows are at opposite ends of a whole-directory report.

Two consequences make it more than an ergonomics complaint. First, in a repository with a large
pre-existing scanner backlog (FR25) the first `scan.mjs` run is unreadable by construction, so the
second run is not optional. Second, several runs piped the script into `head`, which closes the pipe
and makes the script exit non-zero on `SIGPIPE` — so the ledger records a gate failure that never
happened (`67b624f4`, `a7cdcd1c`, `d3c037d9`), and in `d3c037d9` the run declared a hermetic audit
passing without ever having seen a zero exit code for it.

#### FR5 — the report's `e2e-reviewer:` line is unsupported by anything the run could see

| | |
|---|---|
| **Rank** | 7 — frequency rank 3 |
| **Frequency** | 12 of 26 — `10748ea5`, `18697484`, `3072aa9b`, `3deeddd7`, `8eb0585c`, `9899ba51`, `998dd2c1`, `a273eefa`, `a7cdcd1c`, `af23ab55`, `bbae9aa2`, `cbe2813b` |
| **Severity** | **S2** |
| **Time** | ~0 — this costs the reader, not the run |
| **Attribution** | `### e2e-reviewer skill` (Step 6), whose rule is *"P1/P2 found: output in the final report"*; and `## pw-prove — Complete`, whose template line is `e2e-reviewer: N P0 (fixed), N P1 (listed below)` |
| **Citations** | `bbae9aa2:369` (`4 total hit(s), 0 P0, 4 P1/P2`) vs `:551` (`0 P0, 1 P1`) · `998dd2c1:304` (nine unsuppressed hits) vs `:719` (`0 P0, 0 P1`) · `cbe2813b:307` (the grep that stripped the severity banner), `:317` (`0 P0` asserted), ledger `scan.mjs exit=1` · `9899ba51:971` (a `[P0?]` row naming the run's own spec) vs `:1271` (`0 P0, 0 P1`) · `a7cdcd1c:900` (output with no tally at all) vs `:1193` (`0 P0, 1 P1`) · `18697484:927` (the required line simply absent) |
| **Versions** | 0.21.0, 0.23.1, 0.24.0, 0.26.0, 0.27.0, 0.27.1 |
| **Fault** | **pw-prove** for the report line; **boundary** where the tally was unreadable because of FR25 |

Twelve of 26 completion reports state a P0/P1 count the transcript cannot support. The mechanism is
consistent: the run pipes `scan.mjs` through a filter that keeps the per-hit rows and drops the
severity banner and the summary, then writes a tally into the report from memory or from a partial
read. `cbe2813b` is the clean case — the ledger records `exit=1`, the filtered output contains no
severity data at all, and the report says `0 P0, 0 P1`.

Three sessions state a count that is arithmetically wrong on its own evidence (`bbae9aa2` reports one
P1 where the scanner printed five; `8eb0585c` describes three hits as "both" over a scan listing
four; `10748ea5` presents an internal YAGNI judgement as a second reviewer finding). Two ran the gate
with a tier switched off and did not say so in the report (`3072aa9b`, `af23ab55` — Tier 1 ESLint
skipped by an env flag the run set itself); `fa0cc83b` did the same thing and **did** disclose it
(`Tier coverage: 3 only`), so the corpus carries both shapes and a reader can compare them.

#### FR6 — pw-prove mandates a dwell shape that e2e-reviewer's suppression cannot see

| | |
|---|---|
| **Rank** | 8 — frequency rank 4 |
| **Frequency** | 11 of 26 — `10748ea5`, `1927b90c`, `240d63c1`, `3deeddd7`, `9899ba51`, `998dd2c1`, `af23ab55`, `bbae9aa2`, `befb0456`, `c871a4f2`, `cbe2813b` |
| **Severity** | **S3** — no false proof, but it is the direct cause of most of FR5 |
| **Time** | seconds per run; its real cost is the unreadable gate verdict |
| **Attribution** | `## Step 5: Generate` (the dwell template) and `### Clip-fidelity audit` (which requires it) against `### e2e-reviewer skill`; shipped scripts `skills/pw-prove/scripts/clip-fidelity.mjs` and `skills/e2e-reviewer/scripts/scan.mjs` (`lineIsJustified`) |
| **Citations** | `998dd2c1:258` (`payoff dwell: 9/9 … carry a JUSTIFIED, PW_PROVE_CLIP-gated wait`, exit 0) against `:304` (the same nine lines listed as unsuppressed `#9` hits) · `af23ab55:410` vs `:440` (six lines, both ways) · `10748ea5:378` vs `:268` |
| **Versions** | 0.21.0, 0.23.1, 0.24.0, 0.26.0, 0.27.0, 0.27.1; `scan.mjs` 1.10.0 throughout |
| **Fault** | **boundary case** — the construct is pw-prove's, the suppression gap is e2e-reviewer's, and neither skill is wrong on its own terms |

Two shipped scripts read the same code and disagree about it. Step 5's template writes the guard and
the wait on one line, which `scan.mjs`'s suppression does honour; several runs split it across two,
putting the `// JUSTIFIED:` comment above the `if (process.env.PW_PROVE_CLIP)` guard rather than above
the `waitForTimeout` itself. `scan.mjs`'s `lineIsJustified` walks up from the hit line and stops at
the first non-comment line — the `if` — so it never reaches the comment. `clip-fidelity.mjs`, reading
the enclosing block, is satisfied.

The result is a standing population of P1 `#9` hits on exactly the lines pw-prove told the run to
write, in eleven of 26 sessions. `998dd2c1` is the clearest single pair of citations in the corpus:
one script printing `9/9 … carry a JUSTIFIED … wait` and the other printing the same nine lines as
findings, three minutes apart.

#### FR9 — no way to watch a long-running script, so the run circles on "is it done yet"

| | |
|---|---|
| **Rank** | 9 — frequency rank 6 |
| **Frequency** | 8 of 26 — `10748ea5`, `3072aa9b`, `3deeddd7`, `6f307a2f`, `8eb0585c`, `d3c037d9`, `fa0cc83b`, `fe171475` |
| **Severity** | **S3** |
| **Time** | **46m11s** of dead session, the largest single loss in the corpus (`3deeddd7`) · ~11 min over eight tool calls reading a truncated failure log (`3072aa9b`) · 3m00s on a foreground probe daemon (`fa0cc83b`) · 2m33s and eight calls (`8eb0585c`) · 2m20s (`6f307a2f`) · 2m08s (`d3c037d9`) |
| **Attribution** | `### Bring the environment up (autonomous — don't stop to ask)` (Step 3), item 3 — the harness-tracked background task with a readable log; `### Recon — the probe is the question channel, the test run is the validator` for the probe daemon; `### Failure handling (max 3 auto-fix attempts, fewer if the failure stops changing)` and its **Token diet** paragraph |
| **Citations** | `3deeddd7:106` (the plan posted, the turn ended, both background tasks killed), `:113`/`:115` (the kill notifications, 46 minutes later) · `fa0cc83b:824` (`Exit code 143 / Command timed out after 3m 0s`), `:828` (*"The probe `start` is a daemon — I ran it in the foreground"*) · `3072aa9b:666` (*"The log got truncated to its tail"*) · `8eb0585c:156` (a `ToolSearch` for `Monitor` mid-loop) · `6f307a2f:188` (the agent's own diagnosis: `| tail -25` buffers until exit) |
| **Versions** | 0.20.0, 0.21.0, 0.22.0, 0.23.1, 0.24.0, 0.27.0, 0.27.1 |
| **Fault** | **boundary case** — the harness owns the turn boundary and the shell timeout; pw-prove owns the instruction to background the work and gives no way to observe it |

The section tells the run to put the build and the proof run in a harness-tracked background task with
a readable log. It says nothing about how to *wait* on one, so the corpus contains six different
improvisations for the same question: `tail` polls, `sleep` chains that the host refuses, an `until
grep` watcher that exits with nothing, a `ToolSearch` for a `Monitor` tool that is then not used, and
a `TaskOutput` poll that finally works.

`3deeddd7` is the extreme and the most instructive: the run started the build in the background,
posted its Step-4 plan, and **ended its turn** — which the harness treats as the end of the
background tasks. Step 4's own instruction is to post the plan and continue *immediately*, so the
body is implicated in the turn-end even though the kill is the host's. The session woke 46 minutes
later on the kill notifications and redid the bring-up.

Two failures in this group are self-inflicted and worth separating: `fa0cc83b` and `d3c037d9` both ran
`probe.mjs start` in the foreground against an explicit bolded instruction to background it, and paid
the shell timeout — 3m00s and 2m08s respectively.

#### FR7 — Step 8 says "no questions" and eight runs asked one at the push

| | |
|---|---|
| **Rank** | 10 — frequency rank 7 |
| **Frequency** | 8 of 26 — `0259fd57`, `10748ea5`, `240d63c1`, `3deeddd7`, `6f307a2f`, `8eb0585c`, `befb0456`, `f28c3493` |
| **Severity** | **S3** |
| **Time** | **26m35s** (`10748ea5`) · **8m38s** (`0259fd57`) · 3m16s (`f28c3493`) · 1m47s (`8eb0585c`) · 39s (`3deeddd7`); `befb0456` never resumed inside its range, and `6f307a2f` ended on the question |
| **Attribution** | `## Step 8: Deliver (PR-mode tail — deterministic, no questions)`, item 4 (`Push`) and its `Before pushing, read what the push will carry` bullet |
| **Citations** | `10748ea5:525` (question 12:35:33Z, answer 13:02:08Z), `:63` records that the bullet's pointer to *"the no-skip-form stop below"* names a subsection absent from the 0.27.0 body · `0259fd57:319`–`:321` · `befb0456:540` (the range ends on the question) · `8eb0585c:561` · `f28c3493:486` |
| **Versions** | 0.22.0, 0.24.0, 0.26.0, 0.27.0, 0.27.1 |
| **Fault** | **boundary case** — see FR27 |

The two largest idle blocks measured anywhere in this corpus are both this finding. Step 8 declares
itself question-free and its item 4 is the bare instruction "Push"; eight runs stopped and asked
anyway. The trigger is consistent and is **not** agent invention: the pre-push read shows the push
would carry a foreign or pre-existing commit, and the target repository's own `CONTRIBUTING.md` or
`AGENTS.md` says the push is the operator's to authorise. Two instructions genuinely disagree, and
pw-prove's side of it has a dangling pointer: `10748ea5` establishes that the bullet's reference to a
"no-skip-form stop below" points at a subsection that does not exist in the body the run was handed,
so the run had a rule and no form to follow it with.

It is a boundary case and it is kept as one. The pw-prove side is unambiguous; the countervailing
rule is the target repository's and is out of pw-prove's scope. Recorded again from the repository
side as FR27.

#### FR8 — recon is skipped, or run after the spec was written, and the test runner discovers what the probe exists to answer

| | |
|---|---|
| **Rank** | 11 — frequency rank 8 |
| **Frequency** | 8 of 26 — `0259fd57`, `10748ea5`, `1927b90c`, `3deeddd7`, `9899ba51`, `a7cdcd1c`, `af23ab55`, `d32c2495` |
| **Severity** | **S3** |
| **Time** | ~25m24s to a from-scratch rewrite (`1927b90c`) · ~13 min circling on a tab parameter and a panel marker (`a7cdcd1c`) · ~10 min diagnosing a 114.5s `page.goto` (`3deeddd7`) · ~7m30s across three red runs (`d32c2495`) |
| **Attribution** | `### Recon — the probe is the question channel, the test run is the validator` (Step 3) |
| **Citations** | `3deeddd7:362` (*"Trace network data is too sparse. Using the probe — the sanctioned recon channel — to see what hangs"*, reached only in Step 7) · `1927b90c:203` (the wrong host chosen), `:434` (the right one, found after two 3-minute failing runs) · `a7cdcd1c:758` (`tab=application`, singular, read off the live DOM after the spec asserted the plural) · `10748ea5:268` (spec written 12:22:50Z), `:298` (probe started 12:23:26Z), `:324` (the patch) · `d32c2495:390` (*"I'll stop guessing and read the aria snapshot Playwright already captured"*) |
| **Versions** | 0.21.0, 0.22.0, 0.23.1, 0.24.0, 0.27.0, 0.27.1 |
| **Fault** | **pw-prove** — the section names the inversion it suffers from; **boundary** where the underlying fact is the application's |

The section's own heading states the rule the corpus keeps inverting: the probe is the question
channel and the test run is the validator. Eight sessions asked the runner instead, at two to three
minutes a question. Three distinct shapes:

- **Recon never opened a browser.** `3deeddd7` did Step-3 recon with `curl`, `sed` and `grep`; the
  first proof run then died on a 114.5s navigation, and the probe was finally reached for at the most
  expensive possible point.
- **The spec was written before the probe was asked.** `10748ea5` wrote a POM and a whole spec during
  the 241-second build, deliberately using dead time; the probe then contradicted an assertion the
  spec already carried, and a Step-4 plan claim had already been published to the operator before it
  was known to be false.
- **Recon answered, and the answer was ignored.** `0259fd57`'s probe reported `boxes:0, imgs:0` on a
  *logo* proof and the run proceeded to validate through the test run — which the section sanctions.
  Four minutes later that same emptiness was the signal that would have caught FR2's landed false
  proof.

`af23ab55` adds a fourth shape the section does not warn about at all: the probe drives one
long-lived context whose translation catalog has resolved, while every Playwright test opens a cold
one. The recon returned German control labels; the spec asserted them; the first audit run got
English.

#### FR10 — `Clips: N inspected` counts frames from a film that was thrown away

| | |
|---|---|
| **Rank** | 12 — frequency rank 9 |
| **Frequency** | 7 of 26 — `240d63c1`, `3072aa9b`, `3deeddd7`, `9899ba51`, `a7cdcd1c`, `af23ab55`, `c871a4f2` |
| **Severity** | **S2** |
| **Time** | ~0 to the run |
| **Attribution** | `### Clip inspection — look at the frame before anyone else does` — *"A clip you did not look at is reported as **uninspected**, which is the honest verdict"* and *"A clip that was re-filmed says so"*; `## pw-prove — Complete`, the `Clips:` line |
| **Citations** | `3072aa9b:1149` (`Clips: 14 inspected`) against `:982`/`:983`/`:994` — the only three frame reads after the final film at `:964`, the other eleven being of a film deleted before it · `c871a4f2:696` (`Clips: 9 inspected`) against four post-re-film reads at `:462`–`:479` · `240d63c1:756` (`21 inspected, all legible after one re-film`) against four image reads at `:671`–`:676` · `3deeddd7:751` (`6 of 11 frames inspected`) against five `Read` calls |
| **Versions** | 0.21.0, 0.23.1, 0.24.0, 0.26.0, 0.27.0, 0.27.1 |
| **Fault** | **pw-prove** |

Every one of these reports gives a per-clip description for clips whose delivered frame was never
opened. The mechanism is the re-film: the first film is inspected in full, the spec is fixed, the
re-film changes every clip's duration and therefore its sampled frame, and only the clips that were
*broken* are re-read. `3072aa9b` is the extreme — eleven of fourteen descriptions describe frames from
a film that `rm -rf test-results` had already deleted.

The rule that would have caught it is in the same section the runs were following, in those words.
Two sessions also dropped the required re-film marker entirely (`9899ba51`, `a7cdcd1c`), so a reader
cannot tell the delivered film from the first one.

#### FR12 — one bounded mutation leaves shipped scenarios with no guard, and the report does not always say so

| | |
|---|---|
| **Rank** | 13 — frequency rank 10 |
| **Frequency** | 6 of 26 — `18697484`, `3deeddd7`, `67b624f4`, `6f307a2f`, `8eb0585c`, `d3c037d9` |
| **Severity** | **S1** in `6f307a2f` (a non-guarding test shipped inside a green 13/13 count); **S2** elsewhere |
| **Time** | ~7 min redoing a mutate–rebuild–run cycle against the wrong component (`8eb0585c`); ~8 min and three forced rebuilds on an undetectable target (`d3c037d9`) |
| **Attribution** | `### Mutation check (PR-mode: REQUIRED — hard-bounded)` — its scope line (*"the scenarios this run wrote"*, plural) against its budget (*"ONE bounded source mutation"*), and its verdict ladder |
| **Citations** | `6f307a2f:396` (test 2 passes under mutation), `:402` (declared `unguardable at that layer` on the first green, skipping the ladder's mandated strengthen-and-repeat), `:489` (shipped in the 13/13 count) · `8eb0585c:426` (`1 failed … 2 passed` — two scenarios with no mutation evidence) · `67b624f4:543` (`-g` scoped to one of two new scenarios; the report's flat `Mutation: RED` is unqualified) · `18697484:922`/`:927` (`Mutation: RED` reported for a spec materially rewritten after the check ran) · `3deeddd7:485` (a mutation that moved the built artifact by 3 bytes and proved nothing — caught by the run at `:493`) |
| **Versions** | 0.20.0, 0.22.0, 0.24.0, 0.26.0, 0.27.0, 0.27.1 |
| **Fault** | **pw-prove** |

The section's headline scopes the check to the scenarios the run wrote, plural; its budget is one
mutation, `-g`-scoped to one test. In a run that wrote two or three scenarios those two sentences
cannot both be satisfied, and the report's `Mutation: RED` line has no place to say which scenario the
verdict covers. Four sessions delivered a flat `RED` over partial coverage.

`6f307a2f` is the S1 case and the reason this row is not merely S3: scenario 2 passed under mutation
because a `<Teleport to="body">` makes the body observer fire regardless, the run declared it
"unguardable at that layer" on the **first** green — skipping the ladder's mandated strengthen-and-
repeat-once — and the test shipped inside a headline "13/13" that its own report calls green. The
section never says to delete an unguardable test; it says to state it in the report, which the run
did.

`18697484` is the boundary case: the mutation verdict was genuine when taken, the spec was then
materially rewritten after a base merge, and no second check ran. The verdict is very probably still
true, and the report does not say it was not re-derived. The plain reason it was not repeated is
FR24 — a forced rebuild the section itself prices at ~635s.

#### FR14 — the report's AC arithmetic does not reconcile with its own tables

| | |
|---|---|
| **Rank** | 14 — frequency rank 11 |
| **Frequency** | 6 of 26 — `1927b90c`, `3deeddd7`, `a7cdcd1c`, `af23ab55`, `cbe2813b`, `f28c3493` |
| **Severity** | **S2** |
| **Time** | ~0 |
| **Attribution** | `## pw-prove — Complete`, the `ACs:` line and its invariant (*M = the Step-2 AC table's row count*); `## Step 4: Plan — notify-and-continue (PR-mode) / approval gate (coverage-gap)` |
| **Citations** | `cbe2813b:669` (`8 proven of 9 total`, with a parenthetical that sums to 10, against ten-row tables at `:259` and `:653`) · `f28c3493:513` (`8 proven of 8 total`, against `:283` where a spec carrying three of those ACs failed and `:323` where that file is absent from the verified set) · `3deeddd7:615` (`22 proven of 22`, against `:605`'s `2 failed … 20 passed`) · `1927b90c:665` (`8 proven of 9`, contradicted by the same report naming a second unproven item) · `a7cdcd1c:1193` (the third number counts the scenarios the run wrote, because no Step-2 AC table exists in range) |
| **Versions** | 0.23.1, 0.24.0, 0.26.0, 0.27.0, 0.27.1 |
| **Fault** | **pw-prove** |

The invariant exists precisely so a reader can check the report against something. In five of the six
the arithmetic is visibly wrong inside the report itself, and in three the same report discloses the
shortfall in prose two paragraphs later — so the number is misleading while the message is not. In
`a7cdcd1c` the invariant is unenforceable rather than broken: no Step-2 AC table was ever produced
(FR15), so the third number is self-referential and cannot be checked at all.

#### FR11 — the failure-handling bound is announced and then walked past, and `playwright-debugger` is invoked in **zero** of 26 sessions

| | |
|---|---|
| **Rank** | 15 — frequency rank 12 |
| **Frequency** | 6 of 26 for the bound — `1927b90c`, `240d63c1`, `9899ba51`, `a7cdcd1c`, `af23ab55`, `fe171475`. **0 of 26** for the prescribed handover |
| **Severity** | **S3** |
| **Time** | 9m47s of operator idle after the checkpoint was escalated instead of taken (`1927b90c`) · ~53 min across five concurrent regression batches against a bound of three (`240d63c1`) · 16 Playwright runs over 72 minutes with the bound never applied (`fe171475`) |
| **Attribution** | `### Failure handling (max 3 auto-fix attempts, fewer if the failure stops changing)` — its **No-progress checkpoint** table and its *"Do not attempt a 4th fix"* / *"invoke `playwright-debugger` (Skill tool)"* close; and `### The handover stop — PR-mode's exit when the loop is exhausted` |
| **Citations** | `1927b90c:308` (*"the no-progress checkpoint trips"*), `:349`/`:350` (the checkpoint put to the operator as a three-option form instead), `:351` (answered 9m47s later) · `a7cdcd1c:845` (*"the no-progress checkpoint trips, so the heal loop stops here"*), then `:852`/`:858`/`:866` continue to green · `af23ab55:587` (*"Final fix"*, the fourth) · `9899ba51:1011`/`:1026`/`:1039`/`:1049` (four edits against three) |
| **Versions** | 0.21.0, 0.23.1, 0.24.0, 0.26.0, 0.27.0 |
| **Fault** | **pw-prove** — the rule is unambiguous and was in the body every one of these runs was handed |

The strongest single number in this corpus: `playwright-debugger` is the prescribed next move when
the loop is exhausted, and it is invoked **nowhere in 26 sessions**. In five of the six, the
checkpoint was recognised by name — quoted back from the body in the run's own words — and then not
executed. Two runs continued to green and delivered; the operator sanctioned one of them explicitly.
A rule whose breach reliably produces a good outcome is the hardest kind to keep, and that is exactly
what the corpus records.

`fe171475` is the counter-shape: 16 Playwright runs, a pass count that went 6 → 6 → 5 → 6 and stopped,
and the bound never applied at all — the run was circling on which HAR entries to add, converged on
the network and never on the pass count, and ended by publishing a diagnostic film of a 6/13 suite.

#### FR13 — Step 6's quality gate runs after Step 7, and in one session after the publish

| | |
|---|---|
| **Rank** | 16 — frequency rank 13 |
| **Frequency** | 6 of 26 — `10748ea5`, `18697484`, `240d63c1`, `8eb0585c`, `b6dbd8be`, `befb0456` |
| **Severity** | **S3** — nothing false shipped, but three sessions were one P0 away from an invalidated proof page |
| **Time** | ~6m08s of full-suite runs executed against specs the audit would have blocked (`b6dbd8be`) · ~11 min and 21 frame reads spent before the gate that would have prevented them (`240d63c1`) · one extra audit run plus one extra hermetic audit (`10748ea5`) |
| **Attribution** | `## Step 6: e2e-reviewer (quality gate)`, `### YAGNI audit (immediately after writing code)`, and the `## Pipeline Overview`'s ordering; `### Clip-fidelity audit`'s *"Exit 0 is the only way to Step 7"* |
| **Citations** | `8eb0585c` — `publish-proof.mjs` at 17:03:06, `scan.mjs` at 17:04:18 (ledger); the gate ran after the recording was published · `befb0456:446`–`:470` (the gate at 18:12:41, the film at 18:04:44, the mutation at 18:09:18) · `b6dbd8be:468` (first Playwright run 17:52:31) vs `:534` (first clip-fidelity audit 18:00:04) · `240d63c1:312` (audit scoped to the new spec) vs `:584` (the same audit over the carried specs, exit 2, nine scenarios with no dwell at all) |
| **Versions** | 0.23.1, 0.24.0, 0.26.0, 0.27.0 |
| **Fault** | **pw-prove** — the ordering is stated in the Pipeline Overview and nothing in Step 7 refuses to film before Step 6 has passed |

Six sessions ran the gate late. Nothing in Step 7 checks that Step 6 passed, so the ordering is
advice rather than a gate, and the runs that got away with it did so because the scan came back
clean. `8eb0585c` is the sharp end: a P0 found at 17:04 would have invalidated a proof page published
at 17:03.

`240d63c1` exposes a second, structural half of the same finding, and it is the one worth a fix
spec's attention: Step 6's clip-fidelity audit says *"Run it on every **generated** spec"*, while Step
7 films the whole **PR spec set**, carried scenarios included. The carried specs were in the filming
set and outside the gate — so nine of seventeen carried scenarios had been filmed with
`PW_PROVE_CLIP` inert, and the run learned it only after a full filming pass and 21 frame reads.

#### FR15 — Step 4's plan is skipped, or posted without the blocks that make it checkable

| | |
|---|---|
| **Rank** | 17 — frequency rank 14 |
| **Frequency** | 5 of 26 — `0259fd57`, `18697484`, `67b624f4`, `a7cdcd1c`, `befb0456` |
| **Severity** | **S3** |
| **Time** | indirect — `befb0456` then spent 6m00s on an operator question the plan exists to make unnecessary |
| **Attribution** | `## Step 4: Plan — notify-and-continue (PR-mode) / approval gate (coverage-gap)` and its `### Scenarios`, `### Locator Mapping Table` and `### Assumptions (required block in the PR-mode plan)` |
| **Citations** | `67b624f4` — no plan block anywhere in lines 7–666; the Step-6 audit at `:353` was then passed a viewport verdict that had no Assumptions line to quote · `a7cdcd1c:623` (the whole of Step 4 is one sentence) · `befb0456:195` (likewise), then `:305` (the side-question, 6m00s) · `18697484:73` (plan posted before Step 3, missing the locator table, the `Effective viewport` line and the `Spec set` line) · `0259fd57` — never entered in either arm |
| **Versions** | 0.23.1, 0.24.0, 0.26.0 |
| **Fault** | **pw-prove** — a step with no artifact has nothing that can be checked, and no script or CI gate exists for it |

Step 4's own text names the mechanism that makes a mid-run question unnecessary: *"Every side-question
resolves from the contract as a stated Assumptions line — asking any of them is a bug."* `befb0456`
skipped the plan and asked the question six minutes later. `18697484` posted its plan *before*
Step 3's bring-up, so no locator in it could have been observed, and deferred the viewport with
"viewport resolved from config at Step 6" — which turned the Step-6 audit's verdict into an argument
rather than a claim it could check.

`cbe2813b` shows the same gate failing from the other direction: its Assumptions block declared
`deliberate: 1600x900 (already pinned in the spec)`, two mutually exclusive terms in the skill's own
vocabulary, and the run passed the audit `--verdict "pinned:1600x900"` rather than the Assumptions
line verbatim as Step 6 requires. The gate agreed with the substituted verdict. A self-check whose
input the run may correct on the way in cannot catch the plan that was wrong.

#### FR16 — the `.git/info/exclude` snippet fails in a git worktree

| | |
|---|---|
| **Rank** | 18 — frequency rank 15 |
| **Frequency** | 5 of 26 — `240d63c1`, `998dd2c1`, `af23ab55`, `c871a4f2`, `fa0cc83b` |
| **Severity** | **S4** |
| **Time** | one to two turns each, ~35s |
| **Attribution** | `## Step 7: Verify`, item **1b. Bind the HAR to this run** — the literal `printf '.pw-prove/\n' >> .git/info/exclude` |
| **Citations** | `240d63c1:222` (`/bin/bash: line 37: .git/info/exclude: Not a directory`) · `af23ab55:207` (identical) · `998dd2c1:509` (*"Worktree gotcha: `.git` is a file here, not a directory"*) · `c871a4f2:640`, repaired at `:649` with `git rev-parse --git-dir` |
| **Versions** | 0.21.0, 0.26.0, 0.27.0 |
| **Fault** | **pw-prove** — the snippet is written for a plain checkout; both target repositories are worked in Orca worktrees, where `.git` is a file |

Cheap, unmissable, and unfixed across at least six versions — `240d63c1`'s attribution records the
same snippet still present in the 0.28.0 body. Every session recovered unaided with
`git rev-parse --git-common-dir` or `--git-dir`, and one (`af23ab55`) recovered in a way that wrote
the exclude into the **main** checkout rather than the worktree's, which is a different and quieter
wrong answer.

#### FR18 — the runtime profile is written back with values that are wrong, unusable, or in the wrong place

| | |
|---|---|
| **Rank** | 19 — frequency rank 17 |
| **Frequency** | 4 of 26 — `0259fd57`, `6f307a2f`, `b6dbd8be`, `d3c037d9` |
| **Severity** | **S3** |
| **Time** | one to two turns each; `0259fd57`'s contradiction was found by a live probe mid-run |
| **Attribution** | `### Runtime profile — what an earlier run already paid for` (Step 1) and `#### The run writes the profile back` |
| **Citations** | `0259fd57:427` (a profile claim contradicted by the live probe), `:570` (rewritten) · `b6dbd8be:97` (*"Profile is rich … all recorded. Proceeding."*) against `:915` (*"The Clips token works now, contradicting the profile's own Gotcha"*) · `6f307a2f:233`→`:239` (see FR17) · `d3c037d9:883`/`:897` (the run's learnings written to a host memory file, and the report says "Saved to memory"; `.pw-prove/profile.md` was checked at `:19`, found absent, and never written) |
| **Versions** | 0.20.0, 0.22.0, 0.23.1, 0.24.0 |
| **Fault** | **pw-prove**; the profile file itself is repo-resident state, so a stale entry is a **boundary case** |
| **Status** | `d3c037d9`'s half is **confirmed-fixed** |

`d3c037d9` ran 0.20.0, whose Step 1 describes the profile only from the reader's side — there is no
write-back instruction in that version at all — so the run put what it had learned somewhere the next
run will not look. `#### The run writes the profile back` exists only from a later version, and
`### Environment profile` has since been renamed `### Environment facts`. That half is closed.

The other three are open, and they all show the same thing from different angles: the profile is
trusted at Step 1 and contradicted later in the same run. **This row's evidence overlaps the profile
audit** running in parallel, which judges both live `.pw-prove/profile.md` files entry by entry
against these same distillations. The two read different sources: that audit reads the profile files,
this study reads only what the sessions said about them. Where the two disagree, the disagreement is
stated here and adjudicated nowhere in this document.

#### FR17 — `ENV_CONTRACT=none` is documented as a sentinel and the shipped script reads it as a path

| | |
|---|---|
| **Rank** | 20 — frequency rank 18 |
| **Frequency** | 4 of 26 — `6f307a2f`, `a7cdcd1c`, `bbae9aa2`, `d32c2495` |
| **Severity** | **S4** |
| **Time** | 6–29 seconds and one turn each |
| **Attribution** | `#### The run writes the profile back` — its profile-header template contains the literal `ENV_CONTRACT=none` and its key table documents `none` as legal; invoked from `### Bring the environment up (autonomous — don't stop to ask)`; shipped script `skills/pw-prove/scripts/preflight.mjs` |
| **Citations** | `6f307a2f:103` (`preflight.mjs: ENV_CONTRACT names a file that does not exist: …/none`) · `a7cdcd1c:438` · `bbae9aa2:282` · `d32c2495:122` |
| **Versions** | 0.22.0, 0.23.1 |
| **Fault** | **pw-prove** — a body-versus-script disagreement inside one install |
| **Status** | **Confirmed-fixed** |

Recorded rather than deleted, because the week's churn is part of what this study measures. The
distillations for `6f307a2f`, `a7cdcd1c` and `d32c2495` each independently establish that
`ENV_CONTRACT` is absent from **both** the 0.28.0 `SKILL.md` and the 0.28.0 `preflight.mjs`; `d32c2495`
records the knob as having been renamed to `ENV_FILES`. The defect is gone and so is the documented
feature.

`6f307a2f:233` is worth keeping for a different reason: the run then wrote `ENV_CONTRACT=none` — the
value that had just failed — into the target repository's `.pw-prove/profile.md`, caught it one turn
later and called it *"a self-inflicted trap"*. That is the profile write-back admitting a value no run
can use, which is a question for the profile audit rather than for this list.

#### FR21 — the one-re-film budget is exceeded, and the run says so

| | |
|---|---|
| **Rank** | 21 — frequency rank 21 |
| **Frequency** | 3 of 26 — `18697484`, `3072aa9b`, `3deeddd7` |
| **Severity** | **S3** |
| **Time** | ~40 min across four filming runs (`18697484`) · ~9 min and two extra films (`3072aa9b`) |
| **Attribution** | `### Clip inspection — look at the frame before anyone else does` — *"Exactly one re-film."* |
| **Citations** | `18697484:518` (*"Re-filming once (the single sanctioned re-film)"*), `:568` (a second), `:606` (*"I've spent both re-films"* — a budget of two the body does not grant) · `3072aa9b:993` (*"I'm past the one-re-film budget, so these publish with an explicit warning"*) · `3deeddd7:433`/`:443` |
| **Versions** | 0.24.0, 0.27.0, 0.27.1 |
| **Fault** | **pw-prove**; **boundary** in `3deeddd7`, where the re-films were for *failing carried specs*, which the same step routes to `### Failure handling` rather than to the re-film budget |

In all three the overrun is stated plainly in the run's own text, and in two the report discloses it.
What the corpus shows is that the budget does not converge: `18697484` spent four films and ended with
the same four toast chapters sampling after dismissal, and `3072aa9b` spent three and ended with three
payoffs missing. The budget is a spend cap on a loop that had not found its diagnosis, which is the
same shape as FR11.

#### FR19 — the whole spec is re-run during the heal loop where the body says to rerun only what failed

| | |
|---|---|
| **Rank** | 22 — frequency rank 22 |
| **Frequency** | 3 of 26 — `1927b90c`, `af23ab55`, `fe171475` |
| **Severity** | **S3** |
| **Time** | ~6.3 min for two identical full runs (`1927b90c`) · ~10m34s across five full-spec runs against a live staging tenant (`af23ab55`) · 16 runs (`fe171475`) |
| **Attribution** | `### Failure handling (max 3 auto-fix attempts, fewer if the failure stops changing)` — *"**Rerun only what failed.** During the ≤3 attempts, run just the failing test(s) — `-g "<title>"`. The full spec runs **once** after the last fix, as the gate."* |
| **Citations** | `1927b90c:246`/`:319` (two full-spec runs, 3.2m and 3.1m, identical 4-failed/1-passed signatures, no `-g`) · `af23ab55:461`/`:517`/`:550`/`:573`/`:597` (five full-spec runs, none carrying `-g`) |
| **Versions** | 0.23.1, 0.24.0, 0.27.0 |
| **Fault** | **pw-prove** |

The rule is bolded in the body every one of these runs was handed. `1927b90c` paid 6.3 minutes
re-running a scenario that was already passing, twice.

Note the counter-examples, because they say the rule is keepable: `d3c037d9`, `fa0cc83b` and
`f28c3493` all ran `-g`-scoped reruns during the loop and one full-spec gate after the last fix,
exactly as written.

#### FR22 — Step 8's hygiene `git checkout -- '**/…'` silently matches nothing

| | |
|---|---|
| **Rank** | 23 — frequency rank 23 |
| **Frequency** | 2 of 26 — `3072aa9b`, `67b624f4` |
| **Severity** | **S4** |
| **Time** | ~0 |
| **Attribution** | `## Step 8: Deliver (PR-mode tail — deterministic, no questions)`, the hygiene-sweep bullet `git checkout -- '**/auto-imports.d.ts' '**/components.d.ts'` |
| **Citations** | `3072aa9b:1123` and `67b624f4:603`, both `error: pathspec '**/auto-imports.d.ts' did not match any file(s) known to git` |
| **Versions** | 0.24.0, 0.26.0 |
| **Fault** | **pw-prove** |

Git's default pathspec is not glob mode, so `**/` is literal. In both sessions the sweep happened to
have nothing to do, so the error was cosmetic — but a sweep that cannot match is a sweep that will
silently fail to revert codegen churn on the run where it matters. `3072aa9b`'s distillation notes the
irony: it is the same `**/` trap the body warns about at length in Step 7's spec-set derivation. The
bullet is unchanged at 0.28.0.

#### FR32 — the hermetic audit ran after filming and after clip inspection

| | |
|---|---|
| **Rank** | 24 — frequency rank 24 |
| **Frequency** | 1 of 26 — `fa0cc83b` |
| **Severity** | **S3** |
| **Time** | ~3 minutes and two extra filming runs, one of which introduced a regression |
| **Attribution** | `### Hermetic audit (after the passing run)` (Step 7), as named at 0.21.0 |
| **Citations** | `fa0cc83b:1123` (film 1), `:1130`–`:1168` (four frames inspected), `:1179`/`:1192` (the audit, three undeclared LIVE calls, invalidating the film just inspected), `:1202` (film 2, hermetically clean but with clip 4's payoff lost), `:1254` (film 3) |
| **Versions** | 0.21.0 |
| **Fault** | **pw-prove** |
| **Status** | **Confirmed-fixed** |

The 0.21.0 body placed `### Clip inspection` *before* `### Hermetic audit (after the passing run)`, so
a run that inspected its frames and then failed the audit had to re-film — and the second film lost a
payoff frame the first film had held, which cost the run its one sanctioned re-film. The section is
renamed and moved in the current body to `### Hermetic audit (on the audit run, before anything is
filmed)`, ahead of clip inspection. The defect this session paid two extra films for is repaired.

#### FR23 — `publish-proof.mjs` printed `publish failed` over a successful HTTP 200

| | |
|---|---|
| **Rank** | 25 — frequency rank 25 |
| **Frequency** | 1 of 26 — `3deeddd7` |
| **Severity** | **S3** |
| **Time** | one turn; the run verified the response by hand and continued |
| **Attribution** | shipped script `skills/pw-prove/scripts/publish-proof.mjs` |
| **Citations** | `3deeddd7:560` — the script printed `publish failed — … rejected the publish — HTTP 200:` and told the run to attach the video by hand, while the response it was quoting carried a live share link; verified at `:568` |
| **Versions** | 0.27.0, 0.27.1 |
| **Fault** | **pw-prove** — a response-parsing defect |

Recorded at n=1 because it is a shipped script telling a run its work failed when it succeeded, which
is the same class of instrument defect as FR1 with the sign reversed. It did not recur on the three
later publishes in the same session (0.27.1), but those differ in response size and clip count too, so
the range does not isolate the variable and this is **not** recorded as confirmed-fixed.

---

## Repository-fault and boundary findings

These belong to the per-repository setup studies rather than to a pw-prove fix spec. They are
**recorded, not ranked** — the Rank column above applies to the pw-prove-fault list, and putting a
repository fault into that order would compare two things a reader acts on in different places. They
share the `FR` namespace so a later re-classification renumbers nothing.

#### FR25 — a large pre-existing scanner backlog makes the Step-6 gate unreadable

| | |
|---|---|
| **Frequency** | 7 of 26 — `1927b90c`, `998dd2c1`, `a273eefa`, `af23ab55`, `befb0456`, `cbe2813b`, `d32c2495` |
| **Severity** | **S3** — it is the direct cause of half of FR4 and much of FR5 |
| **Time** | ~8s and one turn per extra scan; its real cost is that the gate's own verdict is unreadable, which is what FR4 and FR5 then pay for |
| **Attribution** | `### e2e-reviewer skill` (Step 6), which invokes a whole-directory scan with no per-run view; shipped script `skills/e2e-reviewer/scripts/scan.mjs` |
| **Citations** | `998dd2c1:304` (`223 total hit(s), 30 P0, 176 P1/P2 heuristic, 17 LLM-triage`) · `a273eefa:454` (`290 total hit(s), 13 P0`) · `af23ab55:440` (`267 total hit(s), 30 P0`) · `befb0456:460` (224 hits, 30 P0 repo-wide) · `1927b90c:235` (233 hits) |
| **Versions** | 0.22.0, 0.24.0, 0.26.0, 0.27.0; `scan.mjs` 1.10.0 throughout |
| **Fault** | **target repository** for the backlog; **boundary** for the gate's inability to scope its verdict to the files a run just wrote |

`scan.mjs` exits non-zero whenever the tree has findings, and both target repositories carry hundreds.
So the gate's exit code and summary say nothing about the run's own two files, and a run that wants
its own verdict must pay a second scan and construct a filter — which is FR4's most frequent instance
and FR5's most frequent excuse.

#### FR26 — the application's payoff self-dismisses before the sampled frame

| | |
|---|---|
| **Frequency** | 6 of 26 — `18697484`, `3072aa9b`, `67b624f4`, `c871a4f2`, `cbe2813b`, `fa0cc83b` |
| **Severity** | **S2** — it is what most published degraded chapters actually show |
| **Time** | ~40 min across four films (`18697484`) · ~9 min across three (`3072aa9b`) · ~2m10s for a re-film that bought nothing (`67b624f4`) |
| **Attribution** | `### Clip inspection — look at the frame before anyone else does` (the frame-sampling rule and the diagnosis table) against the applications' own toast lifetimes |
| **Citations** | `18697484:508`/`:847` (a `vue-sonner` default auto-dismiss against a sampler that takes `duration − 0.5s`) · `3072aa9b:993` · `c871a4f2:435` · `fa0cc83b:1234` (*"racing sonner's ~4s timer"*) · `67b624f4:510` |
| **Versions** | 0.21.0, 0.24.0, 0.26.0, 0.27.0 |
| **Fault** | **boundary case** — the toast lifetime is an application behaviour and not a bug; the frame-sampling rule and the one-re-film budget are pw-prove's, and the prescribed diagnosis path did not converge in four attempts in `18697484` or three in `3072aa9b` |

Kept as a boundary case deliberately. Neither side is wrong: an application may dismiss a toast, and a
sampler must take some frame. What the corpus shows is that the two together produce most of the
degraded chapters this week published, and that the re-film budget is the wrong instrument for it.

#### FR27 — the target repositories require operator authorisation to push

| | |
|---|---|
| **Frequency** | 4 of 26 — `0259fd57`, `8eb0585c`, `befb0456`, `f28c3493` |
| **Severity** | **S3** |
| **Time** | **26m35s** (`10748ea5`, via FR7) · **8m38s** (`0259fd57`) · 3m16s (`f28c3493`) · 1m47s (`8eb0585c`) — the same idle blocks FR7 reports, counted once |
| **Attribution** | the target repositories' `CONTRIBUTING.md` / `AGENTS.md`, against `## Step 8: Deliver (PR-mode tail — deterministic, no questions)` item 4 |
| **Citations** | `8eb0585c:561` (the run names `CONTRIBUTING.md`'s push rule) · `befb0456:529` (*"This repo requires operator confirmation before pushing"*) · `f28c3493:478` (the run cites the target repo's AGENTS.md) · `0259fd57:319` (*"this worktree's rules require it"*) |
| **Versions** | 0.24.0, 0.26.0 |
| **Fault** | **target repository** — the twin of FR7, recorded from the repository side so the setup studies see it |

The same four events as FR7, split so neither deliverable has to re-derive the other's half. The
setup studies own the question of whether these repositories want that rule to bind an automated proof
run; the fix spec owns the question of what Step 8 should do when it does.

#### FR28 — carried specs that had never passed, and fixtures that had rotted

| | |
|---|---|
| **Frequency** | 5 of 26 — `1927b90c`, `3deeddd7`, `b6dbd8be`, `f28c3493`, `fe171475` |
| **Severity** | **S2** — one plan counted never-run specs as proven coverage |
| **Time** | ~25m24s to a from-scratch rewrite (`1927b90c`) · ~52 min of operator-directed fixture repair that never reached green (`fe171475`) · one audit rerun after the `socket.io` finding (`b6dbd8be`) |
| **Attribution** | the target repositories' suites; surfaced against `### Assumptions (required block in the PR-mode plan)` and `## Step 7: Verify`'s carried-spec paragraph |
| **Citations** | `1927b90c:189` (the plan marks ACs `carried:` by specs never run this session), `:665` (*"Two of the three carried wizard scenarios had never passed"*) · `fe171475:824`/`:1078` (stale English copy in spec locators against an app rendering translated and German content; 7 of 13 carried scenarios failing) · `b6dbd8be:500` (`socket.io` reaching the live network in 71 requests across all 13 carried tests, undeclared) · `f28c3493:302` (a carried failure byte-identical at the merge base) · `3deeddd7:443` (two flaky carried specs) |
| **Versions** | 0.23.1, 0.24.0, 0.26.0, 0.27.0, 0.27.1 |
| **Fault** | **target repository**; **boundary** for the plan-time assumption that a carried spec passes |

The pw-prove half is small and real: Step 4 lets a plan mark an acceptance criterion "carried" on the
strength of a spec existing, before any run. `1927b90c` did exactly that and the first audit run showed
two of three carried scenarios failing — repaired before delivery, so nothing false shipped.

#### FR29 — `.env.example` over-declares the environment contract

| | |
|---|---|
| **Frequency** | 2 of 26 — `d3c037d9`, `fa0cc83b` |
| **Severity** | **S4** |
| **Time** | ~16–20s per instance — the gate refused in 10–16ms and the run declared the real contract in one turn |
| **Attribution** | the target repository's `.env.example`; surfaced by `### Bring the environment up (autonomous — don't stop to ask)` via `preflight.mjs config` |
| **Citations** | `d3c037d9:194` (`preflight: STOP - configuration incomplete: 11 required key(s) not set`, recovered in ~20s by declaring the real four) · `fa0cc83b:734` (same shape, same repository) |
| **Versions** | 0.20.0, 0.21.0 |
| **Fault** | **target repository** — the gate did its job in 10–16ms; the false requirement is in the repo's own file |

Both runs recovered by naming the real contract in `REQUIRED_ENV`, which is what the section tells
them to do. Recorded for the `nuxt-hyrd-chrysus` setup study.

#### FR30 — the base merge conflicts in a generated types file

| | |
|---|---|
| **Frequency** | 2 of 26 — `67b624f4`, `b6dbd8be` |
| **Severity** | **S3** |
| **Time** | 2m08s idle plus 6m30s and 13 turns of merge-and-regen (`67b624f4`) · 6m45s idle plus 15m24s under a different skill (`b6dbd8be`) |
| **Attribution** | `### Bring the environment up (autonomous — don't stop to ask)` — the conflict bullet, one of the two sanctioned PR-mode stops |
| **Citations** | `67b624f4:150` (the stop, 70 hunks in a generated types file because main and the branch each regenerated it), `:154` (the operator: `do the merge and regen, then re-run the proof`) · `b6dbd8be:134` (the stop, 5 files), `:138` (the operator restarts the work under `/matt:resolving-merge-conflicts`, 15m24s and 40 tool calls) |
| **Versions** | 0.23.1, 0.26.0 |
| **Fault** | **target repository** — pw-prove behaved exactly to contract in both |

Worth keeping because it is the corpus's cleanest example of the skill working and the cost landing
anyway. The stop is unconditional and correct; the conflict is a generated artifact both branches
regenerate; and in `b6dbd8be` the operator had to leave pw-prove entirely, resolve 16 hunks across
four components under another skill, and re-enter — 15 minutes the pipeline cannot see.

#### FR31 — specs read a port-pinned committed HAR, so a free port kills every scenario

| | |
|---|---|
| **Frequency** | 1 of 26 — `fe171475` |
| **Severity** | **S3** |
| **Time** | **22 minutes** and two full spec runs |
| **Attribution** | `### Bring the environment up (autonomous — don't stop to ask)` item 1 (allocate a free port) against `## Step 7: Verify` item **1b. Bind the HAR to this run** |
| **Citations** | `fe171475:68` (a free port allocated, per the section's own snippet), `:225` (the binding step declined: *"Specs read the committed HAR path directly (no `PW_PROVE_HAR` indirection) — and 7 prior runs passed that way"*), `:283` (all 13 scenarios dead on the mass-timeout signature), `:313`–`:334` (redone on port 4000; 6 pass) |
| **Versions** | 0.23.1 |
| **Fault** | **boundary case** — the port rule is right in general; the repo's specs read the committed HAR without the binding seam pw-prove provides, and the run declined the seam on evidence that was itself port-dependent |

Kept as a boundary case because it is the one place in the corpus where two correct pw-prove
instructions, one followed and one declined, combine into a 22-minute loss. The setup study for
`nuxt-hyrd-chrysus` owns the fix on the repository side.

---

## Scope boundaries

**An absence of findings below is not an all-clear.** Nothing in the following was examined, so no
conclusion of any kind should be drawn from its absence:

- **The wrapper skills that spawned pw-prove.** `sss:pr-review`, `/commit-commands:commit-push-pr`,
  `matt:resolving-merge-conflicts` and the Orca terminal dispatch appear throughout the corpus and are
  out of scope by decision. Several distillations record their costs with line numbers so a later
  reader does not re-derive the exclusion; none of it is ranked here.
- **Orca, the terminal and the machine.** Background-task `exit code 144` notifications, the Bash
  tool's 2- and 10-minute timeouts, its `sleep`-chain refusal, git `index.lock` contention, the
  worktree auto-sync that moved a remote branch under a run, and five consecutive API 529 stalls that
  cost `b6dbd8be` 35 minutes — all recorded in the distillations, none of it a finding. FR9 is the one
  place a harness behaviour is *implicated* in a finding, and it is marked a boundary case for exactly
  that reason.
- **Genuine application bugs in the two target repositories.** A `radix-vue` `SelectContent` `id`
  override, a `ScrollPicker.vue` centring defect, an eager-mounting widget screen, an unlabelled
  checkbox, a `UiDialogContent` prop-forwarding defect, a submit gate with no readable reason — the
  runs found these, which is what they were asked to do. pw-prove is not charged for finding them.
- **The five control sessions.** `d411a27c`, `4bcf393a`, `7c1f2e12`, `bb119765` and `8ab5f720` carry
  488 records and 268 non-zero exits and are deliberate CI failure-path work. No finding above is
  drawn from them. They remain available as a control, and **the check they exist for has not been
  run**: this study did not test the FR taxonomy against them. What can be said from the taxonomy's
  shape is that every FR row requires an attributed instruction being followed against a target
  repository, and a control session running the shipped scripts as CI fixtures has no such
  instruction — but that is an argument, not a measurement, and it is owed one.
- **`e2e-reviewer` and `playwright-debugger` as skills.** `scan.mjs` appears here only where a pw-prove
  run invoked it as its Step-6 gate. FR6 and FR25 name e2e-reviewer's side of a disagreement without
  auditing e2e-reviewer.
- **HEAD.** No finding above was re-checked against the current `SKILL.md` or the current shipped
  scripts. FR17 and FR32 are marked confirmed-fixed on evidence *inside the corpus* — a distillation
  that read both bodies — not on a HEAD re-check.
- **The two `.pw-prove/profile.md` files.** They are not read here. FR18 records what the sessions said
  about them and defers to the parallel profile audit.
- **Anything before 2026-08-15,** and every session outside `nuxt-hyrd-chrysus` and `hyrd-widget`.

### What the instrument could not see

Three blind spots recorded by the distillation exercise are inherited by every row above, and a reader
should hold them against the confidence of any finding:

- **The terminal-state triple has no word for a run that stopped in a shape it did not intend.**
  `6f307a2f` ended green at Step 8's threshold with an improvised three-way question; `befb0456` ended
  mid-item-4 at a push gate; `3deeddd7` emitted a completion-shaped report with no delivery lines and
  then resumed. All three are recorded as "delivered" or as prose, because *delivered / handover-stop /
  abandoned* has no third value.
- **A record shape that looks like an operator turn is an Orca notification.** Several distillations
  had to check `origin.kind` and `promptSource` to establish that an apparent mid-run intervention was
  a task notification. Any frequency count of human interventions in this study is a count of records
  that survived that check.
- **Transcripts serialise every `thinking` block empty.** In at least nine sessions the distillation
  states that no assistant reasoning survives. So every attribution of *intent* in this list is
  inferred from commands, outputs and visible text — never from what the agent was thinking. Where a
  run made a choice it did not narrate, the reason is simply absent, and the rows above say so rather
  than guessing.

Two further limits belong to this study specifically:

- **`7cc7e6bc` could not anchor its load turn**, so its Steps 1 and 2 are *missing* from the range
  rather than *not performed*. Nothing above reads that absence as a finding.
- **`unattributed` is a stated outcome, not a blank.** 14 sessions carry 23 items their distillations
  could not attribute to any `SKILL.md` section — a shell working-directory retry, an import-order
  convention, an exit-code masking, a bounded diff read, a post-delivery bug hunt. Those are evidence
  of a gap in the instructions rather than missing data, and none of them became an FR row, because a
  finding needs an editable target and these have none. A fix spec that wants to close gaps rather
  than fix defects should start there.

---

## Citation index

Every citation above is `<session>:<line>`. The transcript for each session is at
`/home/orca/.claude/projects/<path below>`, and the skill version is the one the ledger recorded for
that session's shipped-script runs.

| Session | Repository | pw-prove | Transcript (under `~/.claude/projects/`) |
|---|---|---|---|
| `0259fd57` | hyrd-widget | 0.24.0 | `-home-orca-orca-workspaces-hyrd-widget-shearwater/0259fd57-aa77-4450-a5f5-a876581799b9.jsonl` |
| `10748ea5` | hyrd-widget | 0.27.0 | `-home-orca-work-hyrd-widget/10748ea5-6038-407a-9310-caef0ece2dff.jsonl` |
| `18697484` | nuxt-hyrd-chrysus | 0.24.0 | `-home-orca-orca-workspaces-nuxt-hyrd-chrysus-aspidochelone/18697484-424f-4e92-8204-cc710cc82599.jsonl` |
| `1927b90c` | nuxt-hyrd-chrysus | 0.24.0 | `-home-orca-work-nuxt-hyrd-chrysus/1927b90c-b1d0-4697-bd8d-58f976cb27b3.jsonl` |
| `240d63c1` | hyrd-widget | 0.26.0 / 0.27.0 | `-home-orca-orca-workspaces-hyrd-widget-krill/240d63c1-848a-4551-8fb4-ec5bd44c2dcd.jsonl` |
| `3072aa9b` | nuxt-hyrd-chrysus | 0.24.0 | `-home-orca-orca-workspaces-nuxt-hyrd-chrysus-nixie/3072aa9b-26c9-460d-ba08-e7a9fda5f1ea.jsonl` |
| `3deeddd7` | hyrd-widget | 0.27.0 / 0.27.1 | `-home-orca-work-hyrd-widget/3deeddd7-2089-41f3-94bd-2b4216b823b1.jsonl` |
| `67b624f4` | nuxt-hyrd-chrysus | 0.26.0 | `-home-orca-orca-workspaces-nuxt-hyrd-chrysus-beluga/67b624f4-eddb-466d-bce7-ffa944508115.jsonl` |
| `6f307a2f` | hyrd-widget | 0.22.0 | `-home-orca-orca-workspaces-hyrd-widget-stickleback/6f307a2f-aa70-4aef-9c03-86f66b820107.jsonl` |
| `7cc7e6bc` | nuxt-hyrd-chrysus | 0.24.0 | `-home-orca-orca-workspaces-nuxt-hyrd-chrysus-3258-inline-proof-dwell/7cc7e6bc-31dc-48b1-9946-93cf42c55d9d.jsonl` |
| `8eb0585c` | hyrd-widget | 0.24.0 | `-home-orca-work-hyrd-widget/8eb0585c-e99c-45af-8200-48c5e446d60b.jsonl` |
| `9899ba51` | hyrd-widget | 0.21.0 | `-home-orca-orca-workspaces-hyrd-widget-razorbill/9899ba51-18c5-4135-bdf0-2cb090644120.jsonl` |
| `998dd2c1` | hyrd-widget | 0.26.0 | `-home-orca-orca-workspaces-hyrd-widget-sanddab/998dd2c1-fa88-4d80-9e7c-9b98fd73e150.jsonl` |
| `a273eefa` | nuxt-hyrd-chrysus | 0.27.0 | `-home-orca-work-nuxt-hyrd-chrysus/a273eefa-211b-4677-86e4-8b3f20ef80d1.jsonl` |
| `a7cdcd1c` | nuxt-hyrd-chrysus | 0.23.1 | `-home-orca-orca-workspaces-nuxt-hyrd-chrysus-wentletrap/a7cdcd1c-16c4-430e-863e-f7a761f235a7.jsonl` |
| `af23ab55` | hyrd-widget | 0.27.0 | `-home-orca-orca-workspaces-hyrd-widget-rainbowfish/af23ab55-22f2-491c-b2ba-f2ef0ce7913c.jsonl` |
| `b6dbd8be` | nuxt-hyrd-chrysus | 0.23.1 | `-home-orca-orca-workspaces-nuxt-hyrd-chrysus-snailfish/b6dbd8be-4e74-4f16-8856-f0d3a6571405.jsonl` |
| `bbae9aa2` | hyrd-widget | 0.23.1 | `-home-orca-orca-workspaces-hyrd-widget-hogfish/bbae9aa2-f50e-4c71-bbcf-5436397c21fd.jsonl` |
| `befb0456` | hyrd-widget | 0.24.0 | `-home-orca-orca-workspaces-hyrd-widget-krill/befb0456-87f0-4e0e-a04b-d7ecd6015e1e.jsonl` |
| `c871a4f2` | nuxt-hyrd-chrysus | 0.26.0 | `-home-orca-orca-workspaces-nuxt-hyrd-chrysus-beluga/c871a4f2-0243-4935-ac5b-2075adc23b71.jsonl` |
| `cbe2813b` | nuxt-hyrd-chrysus | 0.27.0 | `-home-orca-work-nuxt-hyrd-chrysus/cbe2813b-15ec-4f07-b54c-96aa6820547c.jsonl` |
| `d32c2495` | nuxt-hyrd-chrysus | 0.22.0 | `-home-orca-orca-workspaces-nuxt-hyrd-chrysus-snailfish/d32c2495-2f7f-48b2-9df0-51dbc468c4ca.jsonl` |
| `d3c037d9` | nuxt-hyrd-chrysus | 0.20.0 | `-home-orca-orca-workspaces-nuxt-hyrd-chrysus-bocaccio/d3c037d9-1de3-46f1-a2bb-84e9d1a9ee74.jsonl` |
| `f28c3493` | hyrd-widget | 0.26.0 | `-home-orca-work-hyrd-widget/f28c3493-cece-47a9-be42-b483a7adc06e.jsonl` |
| `fa0cc83b` | nuxt-hyrd-chrysus | 0.21.0 | `-home-orca-orca-workspaces-nuxt-hyrd-chrysus-whelk/fa0cc83b-9828-4d06-aa09-fa6e82853dcc.jsonl` |
| `fe171475` | nuxt-hyrd-chrysus | 0.23.1 | `-home-orca-orca-workspaces-nuxt-hyrd-chrysus-snailfish/fe171475-73d8-4c0d-b7ef-74c4bc23c32c.jsonl` |

Line numbers are 1-based lines of the `.jsonl` transcript, as the
[session distillations](session-distillation.md) recorded them. Regenerate the span index with
`python3 scripts/forensics/span-index.py` to recover repository, worktree, version, record and
exit counts and the span bounds for any of these sessions.

Quotations in this document inherit the corpus's redaction rule: no `.env` values, no header, cookie
or HAR body values, nothing key-shaped, and no share-link or vault-lease identifier. Where a citation
points at a line that carries any of those, the line is described rather than quoted.
