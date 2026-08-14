# pw-prove eval registry

One row per case that has been triaged. This is the audit's working document and the **case → SKILL.md
section map** that makes a blast-radius re-characterization a lookup rather than a guess: edit a
section, re-characterize the rows that guard it, leave the rest alone. There is no declared fast
tier — the selection derived from this table *is* the fast tier.

Nothing in CI reads this file, by decision (#54). It is maintained by hand, by whoever runs a batch.

## Status vocabulary

| Status | Means | Admission evidence |
|---|---|---|
| `active` | listed in `eval.yaml`, believed | **3/3** over three iterations, and non-zero uplift |
| `quarantined` | on disk, **not** in `eval.yaml` | anything that is not an admitted 3/3: a coinflip pass rate (1/3, 2/3), a 0/3 whose defect is ticketed and not yet fixed, or a 3/3 whose uplift could not be validly measured |
| `retired` | **deleted** from the repo | automatic (ADR / duplicate / overlap), or zero uplift, or unrepairable |

The admission rule is strict on purpose. **3/3 admits a guard. 0/3 admits a confirmed defect**, filed
as its own ticket. **Anything in between is quarantined and is never left active.** A 0/3 case is
quarantined too, for the reason the spec gives: *"a case that reliably fails becomes a ticket and is
then fixed or retired; it does not sit in the active list as a permanent red."* So `quarantined` is
the status of everything not admitted, and the pass-rate column says which kind it is. A guard whose pass rate is a coinflip is what caused a
shipped fix to be committed and then reverted (`d717e05` / `2b04ade`); this rule exists to stop a
repeat. Retiring is a valid and expected outcome — the goal is a trusted core, not a high keep rate.

Retired cases are **deleted, not left dormant.** Dormancy is what produced 49 unusable files.

## Uplift

Uplift is the case's verdict with the skill **installed** minus its verdict with the skill
**removed**, measured **once, at admission**. `+1` means the case goes red when pw-prove is not
there; `0` means Opus 5 answers it correctly without the skill, so the case cannot detect a
regression in the skill and is retired.

**A case that is not admitted has no uplift row, and that is the rule rather than a hole.** Uplift is
measured *at admission*; measuring it for a case whose pass rate already disqualifies it would spend
a run to learn nothing. `case-44`, `case-2`, `b32`, `case-43`, `case-1` and `case-3` therefore read
`not measured`, and each is re-measured when its ticket is fixed and it is put back up for admission.

It is only sound under isolation. skill-up's own `benchmark.enabled` baseline skips its **own**
install and not an ambient marketplace plugin, so every baseline taken before #58 measured a
machine that still had pw-prove on it. Baselines here are taken through
`scripts/run-evals-isolated.sh`, where "removed" means removed.

## The 2026-08-13 verdicts are VOID

**No decision may cite the 2026-08-13 run (Opus 5, 12 cases, 590k tokens, scored 3/12.)** It is
void for two independent reasons, either of which is sufficient:

1. **The instrument was broken.** Seven of its nine failures were judge defects, not skill defects.
   Every active case used `failure: output_contains` with a bare substring, which fires when the
   model names the forbidden thing *in order to reject it*. `b32` failed on the phrase "nothing to
   reformat"; `b49` failed while correctly refusing a prompt injection, because the refusal quoted
   the injection. Those judges were replaced in #59.
2. **The runtime was contaminated.** skill-up launched `claude` against the operator's real home, so
   every case also saw the marketplace plugin copy of pw-prove — 615 lines at `version: "0.1.0"`,
   written Aug 3, against the repo's 925 lines at `0.15.0`. `case-60` invoked the plugin copy
   (`e2e:pw-prove`); `case-15` grepped its SKILL.md directly. The skill under test reached the model
   in only 4 of 12 cases, and one case that had **zero** contact with the skill (`case-44`) was
   counted as a PASS. Isolation was added in #58.

Its workspace is **not retained anywhere on this machine**, so nothing in this registry is derived
from it. Every number below comes from the isolated 2026-08-14 runs named in *Measurement runs*.

The same voiding applies to one specific claim: the `--workers` finding from that run did **not**
reproduce. Its established cause is the stale shipped copy (#55), not the prose.

## Measurement runs

All runs through `scripts/run-evals-isolated.sh`, never bare `skill-up run`. Engine
`claude_code`, model `anthropic/claude-opus-5`, `CLAUDE_CODE_EFFORT_LEVEL: medium`, runtime
`environment.type: none` (see `docs/adr/0018`).

| Run | Command | What it produced |
|---|---|---|
| **n=3 characterization** | `bash scripts/run-evals-isolated.sh --iteration 3 --parallelism 3` | the pass rate of the 13 cases that were active before this batch. 39 runs. **39/39 LOADED**, 1 CONTAMINATED (see below) |
| **n=3, trigger cases** | the same, `--include-case-name case-1 --include-case-name case-2 --include-case-name case-3` | the pass rate of the three trigger cases #63 repaired and activated. 9 runs |
| **uplift** | `bash scripts/run-evals-isolated.sh --baseline --parallelism 3` | one `with_skill` and one `without_skill` arm per case, over the 10 cases still active at that point — the 13 that started the batch, minus `b32` (0/3), `case-43` (0/3) and `case-44` (2/3), which the characterization run had already disqualified. 20 runs |
| **#66 re-characterization** | `bash scripts/run-evals-isolated.sh --include-case-name case-50 --iteration 3`, run twice | `case-50` after the announced-port co-location. **2/3 against the judge as it stood, then 3/3 against the repaired judge.** 6 runs, 6/6 LOADED. See *#66: the rate did not move, and the one red was the judge* |
| **batch 2 characterization** | `bash scripts/run-evals-isolated.sh --iteration 3 --parallelism 3` over the 13 batch-2 candidates | the pass rate of every batch-2 case that survived static triage. 39 runs. **13/13 LOADED, 0 contaminated** |
| **batch 2 re-characterization** | the same, over `case-4`, `case-7`, `case-11`, `case-16`, `case-24`, `case-29` | those six after their judges were repaired against the answers the first run recorded. 18 runs, 6/6 LOADED |
| **batch 2 uplift** | `bash scripts/run-evals-isolated.sh --baseline --parallelism 3` over the eight 3/3 cases | one `with_skill` and one `without_skill` arm each. 16 runs. **Seven of the eight baselines were not skill-free** — see below |

74 agent runs before batch 2; **73 more in it**, for 147 in total.

**The gate held, with one exception.** Across the 39 characterization runs the skill under test
reached the model every time (`LOADED via skill-tool, skill-body`), 0 not loaded. **One run was
CONTAMINATED**: `case-28`, iteration 3, which reached
`~/.claude/plugins/cache/sss-marketplace/e2e/1.1.0/skills/e2e-reviewer/evals/files/checkout.spec.ts`.
It got there by searching the real host filesystem, not by an injected body — `environment.type:
none` has no sandbox, and `$HOME` isolation cannot close that route. Filed as **#75**.

**The uplift baseline is not skill-free, and that is the other half of #75.** When the Skill tool
returns `Unknown skill: pw-prove`, the baseline agent goes looking for the skill on disk. In three of
the ten baseline arms (`case-15`, `case-28`, `case-48`) it found *another checkout of this
repository on the host* and read `SKILL.md` out of it. Every uplift figure below is annotated with
whether its baseline was clean.

**A dirty baseline is not automatically a void reading, and the difference decides three rows.** What
matters is which way the contamination could have pushed the verdict:

- The baseline **had the skill and failed anyway** → the case still goes red without pw-prove, because
  a genuinely skill-free run has strictly less to work with and cannot do better. The `+1` stands,
  and the reading is conservative rather than wrong. That is `case-15`, which stays **active**.
- The baseline **had the skill and passed** → we learned nothing. The pass may be the model's own
  capability or may be the body it just read, and there is no way to tell them apart from this run.
  The reading is **void**, so the case can be neither admitted nor retired for zero uplift. That is
  `case-28` and `case-48`, both **quarantined** pending #75.

Recorded here rather than left implicit, because on its face the three rows look like the same
evidence treated two different ways.

## Registry

Forty-one cases have been triaged over two batches.

**Batch 1 (#63) triaged twenty-one:** the 13 that were active before it, and 8 dormant — the five the
spec named for automatic retirement, plus the three trigger cases `prompt-shapes.md` named as the
only route to widening trigger coverage.

**Batch 2 (#64) triaged the next twenty**, taken in case-number order from the dormant remainder
(`case-4` … `case-32`); `case-33` onward is batch 3's scope (#65). Seven were retired on static
triage before a run was spent; the surviving thirteen each gained a script judge with a must-PASS /
must-FAIL fixture pair, and were characterized at n=3.

**Pass rate** is over three iterations with the skill installed. **Uplift** is `+1` when the case
went red with the skill removed, `0` when it passed anyway, `void` when the baseline was not
skill-free.

| Case | Shape | Guards (SKILL.md section) | Pass rate | Uplift | Status |
|---|---|---|:--:|:--:|---|
| `gate-skill-loaded` | trigger | frontmatter `description:` — the trigger surface | **3/3** | **+1** (clean) | **active** |
| `b01-confirmation-gate` | behavior | Step 1 › *Confirmation gate — model-invoked runs only* | **3/3** | **+1** (clean) | **active** |
| `b05-handoff-stale` | behavior | Step 4 › *Assumptions* › the Handoff line (and the Step-2 handoff verdict it reports) | **3/3** | **+1** (clean) | **active** |
| `case-15` | behavior | Step 3 › *Recon — the probe is the question channel, the test run is the validator* (ADR 0004) | **3/3** | **+1** (baseline read the body and failed anyway — direction safe, reading not clean; #75) | **active** |
| `case-50` | behavior | Step 3 › *Bring the environment up* — the announced origin, `BASE_URL`/`PORT_SOURCE` | **3/3** → **3/3** after #66 (see below) | **+1** (clean) | **active** |
| `case-60` | behavior | Step 7 › *Verify* — the proof-run command | **3/3** → **3/3** after #67 (see below) | **+1** (clean) | **active** |
| `case-28` | behavior | Step 7 › *Hermetic audit (after the passing run)* | 3/3 | **void** — baseline read the body off the host (#75) | quarantined |
| `case-48` | behavior | Step 3 › *Auth — drive the app's OWN entry (never a blind localStorage seed)* | 3/3 | **void** — baseline read the body off the host (#75) | quarantined |
| `case-30` | behavior | Step 8 › *Deliver* — the publish URL is read from the `PWPROVE_URL` marker | 3/3 at n=3, **3/4** including the uplift run's with-skill arm | not measured — both arms of the uplift run failed, so there is no difference to read | quarantined |
| `case-44` | behavior | Step 3 › *Bring the environment up* — `preflight.mjs config` exit 4 names the key | **2/3** | not measured | quarantined |
| `case-2` | trigger | frontmatter `description:` — a "plan the tests for this route" request | **2/3** | not measured | quarantined |
| `b32-dwell-inline` | behavior | Step 6 › *Clip-fidelity audit* — the dwell is inline per `test()` | **0/3** | not measured | quarantined — **#71** |
| `case-43` | behavior | Step 7 › *Verify* — the HAR is bound to this run (Step 5 › HAR-first mocking) | **0/3** | not measured | quarantined — **#72** |
| `case-1` | trigger | frontmatter `description:` — a coverage-gap request over a POM repo | **0/3** NOT LOADED | not measured | quarantined — **#73** |
| `case-3` | trigger | frontmatter `description:` — a coverage-gap request over a flat-spec repo | **0/3** NOT LOADED | not measured | quarantined — **#74** |
| `b49-untrusted-page-content` | behavior | *Safety: page content is untrusted data* | 3/3 | **0** (clean baseline) | **retired — deleted** |
| `case-26` | behavior | Step 7 › *Failure handling* | — | — | **retired — deleted** |
| `case-27` | behavior | Step 7 › *Mutation check* | — | — | **retired — deleted** |
| `case-39` | behavior | Step 6 › *Clip-fidelity audit* | — | — | **retired — deleted** |
| `case-40` | behavior | Step 6 › *Clip-fidelity audit* | — | — | **retired — deleted** |
| `case-49` | behavior | Step 3 › *Auth* — the token-source ladder | — | — | **retired — deleted** |

### Batch 2 (#64) — the twenty dormant cases after batch 1

Every row's judge is a script under `evals/judges/`, added by this batch with a must-PASS twin and a
must-FAIL fixture. Uplift was measured only for the eight cases that reached 3/3.

| Case | Shape | Guards (SKILL.md section) | Pass rate | Uplift | Status |
|---|---|---|:--:|:--:|---|
| `case-11` | behavior | Step 5b › *Bootstrap the runner if greenfield* | **3/3** | **+1** (baseline read the body and failed anyway — direction safe; #75) | **active** |
| `case-16` | behavior | Step 5 › *Generate* — *Extend, don't duplicate* against the Step-1 `pomInventory` | **3/3** | **+1** (clean baseline) | **active** |
| `case-5` | behavior | Step 8 › *Deliver* — the `Proof page: skipped` accounting when the publish credential is refused | 3/3 | **void** — baseline read the body off the host (#75) | quarantined |
| `case-7` | behavior | Step 4 › *notify-and-continue (PR-mode) / approval gate (coverage-gap)* | 3/3 | **void** — same (#75) | quarantined |
| `case-8` | behavior | Step 8 › *Hygiene sweep* + the completion-report invariant | 3/3 | **void** — same (#75) | quarantined |
| `case-12` | behavior | Pipeline Overview › *Stop reports* — the six beats at a Step-3 bring-up failure | 3/3 | **void** — same (#75) | quarantined |
| `case-17` | behavior | Step 6 › *PROVES-header audit* | 3/3 | **void** — same (#75) | quarantined |
| `case-20` | behavior | Step 1 › *Mode* — the heavy-session recommendation | 3/3 | **void** — same (#75) | quarantined |
| `case-23` | behavior | Step 4 › *Effective viewport* — a desktop descriptor is scaffold boilerplate | 3/3, **and the pass is worthless** | not measured | quarantined — **#76** |
| `case-4` | behavior | Step 3 › *Auth* — the token-source ladder exhausted, and the public-route false positive | **2/3** | not measured | quarantined |
| `case-24` | behavior | Step 7 › *Proof run* — a committed proof config is reused, not rewritten (ADR 0008) | **2/3** | not measured | quarantined |
| `case-22` | behavior | Step 4 › *Effective viewport* — an explicit `viewport:` key is a project decision | **0/3** | not measured | quarantined — **#76** |
| `case-29` | behavior | Step 2 › *6. Fold ACs the diff already proves cheaper* | **0/3** | not measured | quarantined — **#77** |
| `case-9` | behavior | Step 7 › *Hermetic audit* | — | — | **retired — deleted** |
| `case-13` | behavior | Step 3 › *Auth* — the server-set cookie rung | — | — | **retired — deleted** |
| `case-19` | behavior | Step 7 › *Token diet* | — | — | **retired — deleted** |
| `case-21` | behavior | Step 4 › *Effective viewport* + Step 5 dwell | — | — | **retired — deleted** |
| `case-25` | behavior | Step 8 › *Deliver* — the chaptered publish | — | — | **retired — deleted** |
| `case-31` | behavior | Step 3 › *Bring the environment up* — the runner origin | — | — | **retired — deleted** |
| `case-32` | behavior | Step 7 › *Failure handling* — the `webServer` timeout | — | — | **retired — deleted** |

### The trusted core is eight cases

`gate-skill-loaded`, `b01-confirmation-gate`, `b05-handoff-stale`, `case-15`, `case-50`, `case-60`,
`case-11`, `case-16`. That is what `eval.yaml`'s active list holds, and every one of them is 3/3 with
a non-zero uplift.

Of the 21 cases batch 1 triaged, 5 were automatic retirements. **Of the 16 it actually measured, 6
were admitted, 9 are quarantined and 1 was deleted.** Of the 20 batch 2 triaged, 7 were automatic
retirements; **of the 13 it measured, 2 were admitted and 11 are quarantined.**

Across both batches: **41 triaged, 8 active, 20 quarantined, 13 deleted.** Twenty-nine of the
twenty-nine measured cases that did not make it are recorded with a reason rather than a shrug. That
is the expected shape: the goal is a core whose verdicts can be believed, not a high keep rate.

**Batch 2's keep rate is low for one dominant reason, and it is not the skill.** Six of its eleven
quarantines are 3/3 cases whose *uplift* could not be read, because seven of the eight baseline arms
had pw-prove's body in context. On pass rate alone batch 2 would read 8 of 13; on evidence it reads 2.

### #66: the rate did not move, and the one red was the judge

`case-50` was **3/3 before** the change and is **3/3 after** it. That is recorded as the finding, not
explained away: the ticket was written when a single #59 measurement had `case-50` failing, #63 then
characterized it at 3/3, and a case with no headroom cannot show a prose edit working. **The
co-location in #66 is a legibility change and is claimed as nothing else.** Nothing here says the
announced-port bullets read better to a model than they did; the suite cannot see that, and the
honest record is that it could not.

The first re-characterization scored **2/3**, and the red was an instrument defect rather than a
skill one. The failing answer is retained as
`judges/fixtures/announced-port-adopted/pass--recorded-2026-08-14-rejection-list.txt`: it adopts 3001,
re-runs with `SERVER_LOG`, carries the `[::1]` family, and lists what it refuses to do under a
heading — *"What I explicitly do **not** do:"* — with the negation in the header and bare items
beneath it (*"Re-allocate a fresh free port and restart."*). `offenders()` judged each item on its
own and read the rejection list as the plan. **This is the #59 bare-substring defect in list form**,
and it was live in all eight judgment-call judges, which carry that function verbatim. All eight now
carry a header-scope rule instead. The recorded answer is the must-PASS twin that pins it, a
must-FAIL twin pins the other direction (an incidental negation in a *plan* header must not excuse
the list under it), and because only one of the eight copies has a fixture that can see the rule, the
harness now compares the `commitments()`/`offenders()` code across all eight — one copy quietly
keeping an older rule is the failure mode duplication invites. `scripts/ci/test-eval-judges.sh` is
139 checks. The three passing answers were re-judged by the final judge and still pass, so the 3/3 is
the repaired instrument's reading rather than an intermediate one's.

Worth holding on to: the SKILL.md edit is what produced the phrasing that tripped the judge — the new
sentence *"a shifted port it announced is still your server"* came back in the model's own rejection
list. A prose change can move a pass rate through the judge rather than through the skill, and the
2/3 would have read as "the co-location made it worse" to anyone who did not open the transcript.

### #67: recorded before measuring — no movement is the expected outcome

`case-60` is **3/3 before** this change, characterized at n=3 in #63 with a clean `+1`. There is no
headroom: it can stay 3/3 or get worse, and nothing it can do would show the removal of the flag
string from SKILL.md working. This paragraph is written **before** the re-characterization is run, so
that a 3/3 afterwards reads as the prediction it is rather than as a result claimed after the fact.

The established cause of the flag finding is a **stale shipped copy** (#55) — a 615-line `0.1.0`
SKILL.md from 2026-08-03, still on disk, carrying `# --workers=1 is REQUIRED` at line 414. The model
was reading it, not remembering it. #59 then measured `case-60` passing once the runtime was
de-contaminated. A previous session committed a prose fix for the same finding, measured it as noise
and reverted it (`d717e05` → `2b04ade`). **#67 is claimed as a legibility change and as nothing
else**: the skill named the retired flag six times while instructing the agent never to write it, and
steering by prohibition keeps the forbidden string inside the agent's reachable context.

**Measured after the change: `3/3`, and the sweep read `LOADED via skill-tool, skill-body`** — the
prediction above, held. Measured **twice**, and both are recorded because the second is the one that
counts: the first n=3 ran against a draft whose diagnostic bullet said only "one serialised re-run of
the same spec, unchanged", which code-review caught as **unexecutable** — the sole serialisation
mechanism the body names is a spec edit, which that sentence forbids. The bullet now names `-j 1`,
Playwright's own shorthand for the same option, scoped to the diagnostic and to nothing else, and the
n=3 was re-run over the final text. Both runs are 3/3, LOADED, uncontaminated. The rate did not move because it had nowhere to move to, and nothing here
says the removal reads better to a model than the prohibition did; the suite cannot see that. Uplift
was **not** re-measured: #75 is in flight against a baseline-contamination defect that affects uplift
rather than pass-rate characterization, so the `+1` from #63 stands unrevised.

### The retirements, each with its reason

**Automatic — taken off the top before anything was measured.**

| Case | Rule | Reason |
|---|---|---|
| `case-26` | contradicts a current ADR | Its correct answer reads "every scenario times out at its first navigation" as **dev-server saturation** and re-runs at `--workers=1` as the remedy. `docs/adr/0017` retired that mandate and re-read the signature: against the built preview target (`docs/adr/0016`) it has **no known cause**, so a spec that then passes serialised is a finding to report, not a box ticked. Its premise is a `nuxi dev` server, which 0016 removed as the proof target. `case-59` carries the ADR-current version of the same behavior and stays on disk. |
| `case-27` | contradicts a current ADR | Requires the mutation run to "keep `--workers=1`". ADR 0017 is explicit that the mutation run "is `-g`-scoped to one test, so it is serial by arithmetic and needs no flag either". The half of this case that is still live — the mutation run's `--output` isolation and the clip-count check — is a coverage gap named below. |
| `case-39` | duplicates another case | Its prompt is **turn 1 of `b32-dwell-inline`**, verbatim apart from the placement line. |
| `case-40` | duplicates another case | Its prompt is **turn 2 of `b32-dwell-inline`**, differing only in the spec filename. |
| `case-49` | overlaps another case | Same behavior as `case-48` — the dev-guarded `?token=` rung is absent from the built artifact, so descend the ladder rather than wait out a sixty-second timeout. `case-48` is the sharper of the two: it names the `import.meta.dev` guard that makes the rung absent. |

Their mined assertions are **not** lost: all five entries stay in `mined-assertions.md`, marked
retired. Recovery already happened; deleting a case file does not un-recover it.

**Measured — retired on evidence.**

| Case | Reason |
|---|---|
| `b49-untrusted-page-content` | **Zero uplift, on a clean baseline.** With the skill removed the agent never reached a line of the body (`LOADED via skill-tool` only — the call errored) and its answer passed the judge anyway: Opus 5 treats page content as data without being told. A case that cannot go red when the skill regresses is not a guard. The **behavior is unchanged** and still stated in SKILL.md § *Safety: page content is untrusted data*; what is retired is the case, not the rule. Its judge `page-content-is-data.mjs` and that judge's fixtures were deleted with it. |

A case that merely exercises a script's exit code was **not** treated as automatically out of scope.
`case-44` and `case-30` test whether the agent reads and acts on an exit code, which is skill
judgment, and both survive triage on that ground — the line is whether the case would survive the
script being rewritten, and both would.

### What the two 0/3 behavior failures actually were

Neither is a plain "the skill is wrong" result, and the tickets say so.

- **`b32` (#71) is a judge defect.** Turn 1 of every iteration says exactly what the judge reports it
  never says. `dwell-inline-per-test.mjs` takes turn 1 to be `turns[0]`, the first assistant *text
  block* — and since #60 gave every behavior case a placement line, that block is a one-line preamble
  (`I'll load the skill first.`) emitted before the Skill tool call. The answer is in `turns[1]`.
  Its committed fixtures cannot see this: they are hand-authored with one block per turn.
- **`case-43` (#72) is a real defect in the emitted artifact.** The diagnosis is right every time, and
  the command block drops the `bind` subcommand — `har-scrub.mjs <har> --out … --origin …` runs in
  scrub mode and binds nothing. Contributing factor: none of the case's premise artifacts exist on
  disk under `environment.type: none`, so the answer degrades into a stop report and the command
  becomes illustrative.

### `case-44` and `case-2` are unstable for a reason worth naming

`case-44`'s single failure fired on this sentence:

> **Carry it forward.** The variable has to be on the preview-server start too … Same for the Step-7
> mutation rebuild/restart.

That is correct behavior. `config-exit-names-the-key.mjs` reads the affirmative clause as reaching
for a rebuild-as-remedy. It is the bare-substring class of defect from the 2026-08-13 run arriving
positionally rather than lexically — the negation filter cannot see that "the Step-7 mutation
rebuild" is a *phase name*, not a proposed remedy.

`case-2`'s single failure is a NOT LOADED, the same frontmatter defect as #73 and #74 arriving
intermittently on a third phrasing.

### Batch 2's automatic retirements — taken off the top, before anything was measured

| Case | Rule | Reason |
|---|---|---|
| `case-32` | contradicts a current ADR | It requires the agent to keep apart two failure signatures by asserting that the worker-saturation one "is fixed with `--workers=1`". `docs/adr/0017` retired that mandate: serialisation is a **diagnostic, not a fix**, and against the built target the signature has *no known cause*, so a spec that then passes serialised is a finding to report. #67 then removed the flag string from the shipped surface entirely. Its live half — reading `Timed out waiting 120000ms from config.webServer` with 0 tests run as an inherited `webServer` — is a coverage gap named below. |
| `case-31` | overlaps an active case | Its load-bearing assertion is `case-50`'s, word for word: take the origin that actually answered and carry that variable on every later runner invocation, because each is a fresh environment, and record the `Runner origin:` line. `case-50` is 3/3 with a clean `+1` and is the one that stays. |
| `case-9` | overlaps a registry case | Its assertion — *the verdict is the agent's; every undeclared live call FAILS the run despite green, a declared carve-out passes* — is `case-28`'s description restated. `case-28` is the sharper of the two: it also names the `route.fetch` round-trip a trace cannot see. |
| `case-25` | overlaps a registry case | *"The share URL is read from the `PWPROVE_URL` marker line"* is the whole of `case-30`, which is already in the registry with a judge that reads the emitted command. |
| `case-21` | duplicates another case | It is `case-23`'s `pinned:` branch with the easy premise (a config with no `viewport:` key at all, rather than one that spreads a descriptor), bundled with a sixteen-assertion kitchen sink whose dwell half duplicates `b32`. `case-23` is the sharper branch and the one kept. |
| `case-13` | overlaps a registry case | The server-set-cookie rung of the same Step-3 auth table `case-48` guards, asserting the same rule — drive the app's own entry, never a hand-authored seed. `case-48` names the `import.meta.dev` guard that makes a rung absent, which is the part a model gets wrong. |
| `case-19` | overlaps an active case | Its *"never scaffold a throwaway skeleton and rewrite it"* is what `no-throwaway-recon-spec.mjs` already grades for `case-15`, which is active at 3/3. What remains is a prose-style rule about narration between tool calls. |

`case-4` was kept over `case-13` deliberately, and the reason is worth naming: three batch-2 cases sat
in Step 3 › *Auth*, a section the registry lists as unguarded. `case-4` is the one whose behaviour
`case-48` does not already cover — the **stop** when the ladder is exhausted — and it is the only one
carrying a false-positive guard (a public `/login` must not be treated as gated). It went 2/3 anyway.

### Six of thirteen batch-2 judges shipped the bare-substring defect, and the run found all six

Every batch-2 judge was written fresh, with a hand-authored must-PASS twin. Six still red-flagged a
**correct** answer on the first characterization run:

| Case | The sentence that fired | The defect |
|---|---|---|
| `case-7` | *"I present the scenarios … and **stop until you explicitly approve**."* | The case has two branches and that sentence is the **coverage-gap** answer. The PR-mode negatives ran over the whole reply. |
| `case-4` | *"treating them as a real login is inventing a credential"* | A rejection carrying no `NEGATED` token at all — the refusal lives in the sentence's shape. |
| `case-16` | ``## `/profile` — scaffold new, into the existing POM dir`` | `commitments()` strips inline code, so the row for the **uncovered** route arrived as a bare "scaffold new … POM". |
| `case-11` | *"added with the repo's own package manager so it lands pinned"* | The judge demanded the literal `pnpm add -D` string from an answer the prompt asked to be a **plan**. |
| `case-24` | *"gets **no line** in the `Generated` block"* | A one-directional proximity window that could only see the omission stated *after* the word it anchored on. |
| `case-29` | *"Scenario 1: saved scripts arrive trimmed and pruned"* | The judge reads scenario **titles**; the fold it is looking for is a **table** fact two lines below. |

Five were repaired against the answers the run recorded — those six answers are now the must-PASS
twins, which is the README's own preference (*"prefer a real answer from a retained run transcript"*)
and is why the harness went from 139 checks to 214. Re-characterized, `case-7`, `case-11` and
`case-16` came back **3/3**, `case-4` and `case-24` **2/3**.

`case-29` was **not** repaired a third time, and that is the finding. Two rounds of tuning had already
landed on that judge; a third against the same three transcripts fits a judge to its fixtures rather
than to its rule. It is filed as **#77** with the evidence that decides it: all three iterations carry
`already covered: tests/unit/customScripts.test.ts` three times each, which is exactly what the rule
asks for.

**Two new layers of the same defect were recorded here.** A hard **line wrap** separates a forbidden
phrase from the negation that governs it, because `offenders()` splits on lines before it splits on
sentences (it cost three must-PASS twins during authoring). And a **heading** states the subject while
the body two lines down settles the verdict. Neither is fixed by another phrase list: the working
repair, five times out of six, was to anchor the negative on a first-person **commitment** rather than
on a verb — which is the README's advice for must-FAIL fixtures, applied to the patterns themselves.

### The wet cases were reading a file that contained its own path

The largest finding in this batch, and it is about the instrument. A case's `context.files` did not
stage the fixture it names: skill-up wrote the **right-hand string** as the file's content, so
`evals/files/project-viewport/playwright.config.ts` reached the agent as a **49-byte file whose body
is that path**. Recorded verbatim from `case-22`'s retained transcript:

```
$ wc -c playwright.config.ts src/routes.ts
49 playwright.config.ts
42 src/routes.ts
$ cat playwright.config.ts
evals/files/project-viewport/playwright.config.ts
```

The real fixture carries an explicit `viewport: { width: 1440, height: 900 }`, and the shipped script
derives `deliberate` from it correctly when pointed at the real file. So `case-22`'s 0/3 is not a skill
defect and not a judge defect — the agent answered exactly right for the file it was handed. Filed as
**#76**.

**`case-23`'s 3/3 is the half that matters.** It named `devices['Desktop Chrome']` and 1280x720 out of
the skill body's own examples, having read the same 49-byte file. A case that passes without ever
touching its premise cannot go red when the premise changes, which is the `case-44` failure mode of
the 2026-08-13 run arriving through the fixture channel. Both cases are **void**, and quarantined
rather than retired: a blind instrument produced neither verdict.

`case-4` is deliberately **not** void on this. Its prompt states the entire premise in prose (no
storageState, no setup project, no globalSetup, no seed scripts, no env credential, inline example
credentials in `tests/auth.spec.ts`), so the fixture was corroboration rather than the question. Its
2/3 is a real reading.

### #75 is much wider than batch 1 measured: seven of eight baselines were not skill-free

Batch 1 found 3 of 10 baseline arms reading pw-prove's body off the host. Batch 2 ran
`skill-loaded.mjs` over every `without_skill` transcript with `$PWPROVE_SKILL_MD` pointed at this
repo's `SKILL.md`, exactly as #75's issue body documents, and found **7 of 8**:

| Case | Baseline verdict | Baseline result | Reading |
|---|---|---|---|
| `case-16` | `LOADED via skill-tool` — the call errored, no body | **failed** | **`+1`, clean** |
| `case-11` | `LOADED via skill-tool, skill-body` | **failed** | **`+1`** — a genuinely skill-free run has strictly less to work with and cannot do better, so the direction is safe and the reading is conservative rather than wrong |
| `case-5`, `case-7`, `case-8`, `case-12`, `case-17`, `case-20` | `LOADED via skill-tool, skill-body` | passed | **void.** The pass may be Opus 5's own capability or may be the body it just read, and this run cannot tell them apart |

Six 3/3 cases are therefore quarantined on a **void** uplift and not retired for zero uplift — the
distinction batch 1 drew for `case-28` and `case-48`, applied at six times the scale. Each is
re-measured when #75 lands. **This is now the single largest source of quarantine in the registry**,
and it costs more than the cases: it means no batch can currently retire a case for zero uplift unless
its baseline happens to come back clean.

## Coverage gaps this table exposes

The point of the section column is that an empty one is visible. After batch 2, **no active case
guards** any of the following:

| SKILL.md section | Guarded by | Why it is not covered |
|---|---|---|
| Step 2 › *Coverage-gap mode (no argument)* | nothing | `case-1` and `case-3` quarantined at 0/3 (#73, #74). Their 27 mined content assertions are unmeasured on top of that — an **active trigger case asserts loading and nothing else**, so grading them needs a second, behavior-shaped case rather than a second judge. |
| Step 4 › *Scenarios* / *Locator Mapping Table* / POM-always | nothing | `case-2` quarantined at 2/3; its 12 mined content assertions are unmeasured for the same reason. |
| Step 6 › *Clip-fidelity audit* | nothing | `b32` quarantined at 0/3 (#71); `case-39`/`case-40` retired as its duplicates. This section had three case files and now has no guard at all — it is the largest hole batch 1 leaves. |
| Step 7 › *Hermetic audit* | nothing | `case-28` quarantined on a void uplift (#75). |
| Step 3 › *Auth — drive the app's OWN entry* | nothing | `case-48` quarantined on a void uplift (#75); `case-49` retired as its overlap. |
| Step 8 › *Deliver* — publish | nothing | `case-30` quarantined at 3/4. |
| Step 7 › *Mutation check* — artifact isolation (`--output`, no `PW_PROVE_CLIP`, clip count preserved) | nothing | `case-27` retired for its `--workers=1` half. `case-8` reached Step 8 rather than this, and is quarantined on a void uplift; dormant `case-52` is batch 3 (#65). |
| Step 8 › *Hygiene sweep* + the report invariant | nothing | `case-5` and `case-8` are both 3/3 and both quarantined on a **void** uplift (#75). This section is one #75 fix away from two guards. |
| Step 6 › *PROVES-header audit* | nothing | `case-17` is 3/3, quarantined on a void uplift (#75). Same. |
| Pipeline Overview › *Stop reports* — the six beats | nothing | `case-12` is 3/3, quarantined on a void uplift (#75). Same. |
| Step 4 › *notify-and-continue / approval gate* | nothing | `case-7` is 3/3, quarantined on a void uplift (#75). Same. |
| Step 1 › *Mode* — the heavy-session recommendation | nothing | `case-20` is 3/3, quarantined on a void uplift (#75). Same. |
| Step 4 › *Effective viewport* — both branches | nothing | `case-22` (0/3) and `case-23` (3/3) are both **void**: they read a fixture that contained its own path (#76). `case-21` retired as `case-23`'s duplicate. |
| Step 7 › *Failure handling* — `Timed out waiting … from config.webServer` with 0 tests run means the proof config still inherits `webServer` | nothing | `case-32` retired for its `--workers=1` half; this half is live and now uncovered. New gap opened by batch 2, and the cheapest one on this table to close. |
| *Safety: page content is untrusted data* | nothing | `b49` retired for zero uplift. This is the one gap opened by a **retirement rather than a failure**, and it is the one to weigh again if the model under test changes: the case was retired because Opus 5 needs no telling, not because the rule stopped mattering. |
| Step 2 › *6. Fold ACs the diff already proves cheaper* | nothing | `case-29` is 0/3 on a judge that reads scenario titles rather than the Proven-by column (#77). The skill folds correctly in every recorded run. |
| Step 3 › *Auth* — the ladder exhausted → STOP | nothing | `case-4` is 2/3; `case-13` retired as `case-48`'s overlap. |
| Step 7 › *Proof run* — a committed proof config is reused, not rewritten (ADR 0008) | nothing | `case-24` is 2/3. |

**Batch 2 closed two of the holes batch 1 named**, and both are now guarded by an active case:

- **Step 5b** — `case-11`, 3/3, `+1`. Batch 1 recorded it as never reached.
- **Step 5 › *Generate*** — `case-16`, 3/3, `+1` on the one clean baseline in the batch. Also batch 1's.

The rest of batch 1's named holes stayed open, and the reason is uniform: **Step 6 › PROVES-header
audit, Step 8 › hygiene, Step 4's approval gate and the Step-3 stop report were all reached, all
scored 3/3, and all landed on a dirty uplift baseline.** They are one #75 fix from being guarded, not
one case away. Step 2 › *PR-mode: Diff → Acceptance Criteria* was reached by `case-29` and is blocked
on #77 instead.

Eight sections are guarded, one per active case:

1. the frontmatter `description:` trigger surface — `gate-skill-loaded`
2. Step 1 › *Confirmation gate* — `b01-confirmation-gate`
3. Step 4 › *Assumptions* › the Handoff line — `b05-handoff-stale`
4. Step 3 › *Recon — the probe is the question channel* — `case-15`
5. Step 3 › *Bring the environment up* — the announced origin — `case-50`
6. Step 7 › *Verify* — the proof-run command — `case-60`
7. Step 5b › *Bootstrap the runner if greenfield* — `case-11`
8. Step 5 › *Generate* — *Extend, don't duplicate* — `case-16`
