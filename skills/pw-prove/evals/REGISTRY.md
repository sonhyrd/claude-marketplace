# pw-prove eval registry

One row per case that has been triaged. This is the audit's working document and the **case → SKILL.md
section map** that makes a blast-radius re-characterization a lookup rather than a guess: edit a
section, re-characterize the rows that guard it, leave the rest alone. There is no declared fast
tier — the selection derived from this table *is* the fast tier.

Nothing in CI reads this file, by decision (#54). It is maintained by hand, by whoever runs a batch.

**Case ids gained descriptive slugs on 2026-08-16.** `case-33` is now
`case-33-missing-har-declared`, and the file name matches the id as it always did. The numeric part
is unchanged and stays the shorthand this file's prose uses; row identifiers and every
`--include-case-name` command name the full id, because that is what the runner matches. Rows for
retired cases keep the bare numeric id they were retired under — those files are gone and there is
no slug to give them.

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
a run to learn nothing. `case-44` therefore reads `not measured`, and it is re-measured when its
ticket is fixed and it is put back up for admission. `b32` and `case-43` are the worked examples of
that clause: #71 fixed `b32`'s judge and #72 staged `case-43`'s premise, each re-characterized
0/3 → 3/3, each measuring the uplift it had never had. `case-1`, `case-2` and `case-3` read that way
until #73/#74 fixed their ticket, and were then re-characterized and measured at admission, exactly
as the rule says.

**A trigger case's uplift is a special shape, and the figure must be read as one.** A trigger case is
judged on whether the body reached the model. Remove the body and there is nothing to reach it, so
the `without_skill` arm cannot pass whatever the model answers — `skill-loaded.mjs` fails it with
*no SKILL.md to fingerprint*. Every trigger case is therefore `+1` **by construction**, and the
figure certifies the arm was skill-free rather than that the case discriminates. What discriminates a
trigger case is the **before/after on the `description:` itself**, measured at n=3 on the same
runner with nothing else moved. #73/#74 is the first time that was taken; the rows say both.

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
| **n=3, trigger cases** | the same, `--include-case-name case-1-coverage-request-triggers --include-case-name case-2-test-plan-request-triggers --include-case-name case-3-flat-spec-coverage-triggers` | the pass rate of the three trigger cases #63 repaired and activated. 9 runs |
| **uplift** | `bash scripts/run-evals-isolated.sh --baseline --parallelism 3` | one `with_skill` and one `without_skill` arm per case, over the 10 cases still active at that point — the 13 that started the batch, minus `b32` (0/3), `case-43` (0/3) and `case-44` (2/3), which the characterization run had already disqualified. 20 runs |
| **#66 re-characterization** | `bash scripts/run-evals-isolated.sh --include-case-name case-50-announced-port-adopted --iteration 3`, run twice | `case-50` after the announced-port co-location. **2/3 against the judge as it stood, then 3/3 against the repaired judge.** 6 runs, 6/6 LOADED. See *#66: the rate did not move, and the one red was the judge* |
| **uplift re-measurement (#75)** | `PWPROVE_EVAL_YAML=<staged> bash scripts/run-evals-isolated.sh --baseline --include-case-name case-28-hermetic-audit-not-hand-parsed --include-case-name case-48-dev-guarded-rung-skipped` | the two `void` rows, re-taken through the sealed runner. 8 runs over three attempts — see *What the sealed re-measurement cost* below |
| **`case-28` re-characterization (#75)** | `bash scripts/run-evals-isolated.sh --iteration 3 --include-case-name case-28-hermetic-audit-not-hand-parsed` | a clean pass rate to replace the 3/3 whose iteration 3 was CONTAMINATED. 3 runs, **3/3, all three iterations LOADED and clean** |
| **batch 2 characterization** | `bash scripts/run-evals-isolated.sh --iteration 3 --parallelism 3` over the 13 batch-2 candidates | the pass rate of every batch-2 case that survived static triage. 39 runs. **13/13 LOADED, 0 contaminated** |
| **batch 2 re-characterization** | the same, over `case-4`, `case-7`, `case-11`, `case-16`, `case-24`, `case-29` | those six after their judges were repaired against the answers the first run recorded. 18 runs, 6/6 LOADED |
| **batch 2 uplift** | `bash scripts/run-evals-isolated.sh --baseline --parallelism 3` over the eight 3/3 cases | one `with_skill` and one `without_skill` arm each. 16 runs. **Seven of the eight baselines were not skill-free** — see below |
| **batch 3 characterization** | `PWPROVE_EVAL_YAML=<staged> bash scripts/run-evals-isolated.sh --iteration 3 --parallelism 3` over all 21 remaining cases | the pass rate of everything left on disk from `case-33` on. 63 runs. **21/21 LOADED, 0 contaminated.** Scored 10 of 21 |
| **batch 3 re-characterization** | the same, over the eleven cases whose judges were repaired | those eleven after their judges were widened against the answers the first run recorded. 33 runs, 11/11 LOADED, 0 contaminated. Six moved to 3/3 |
| **batch 3 uplift** | `PWPROVE_EVAL_YAML=<staged> bash scripts/run-evals-isolated.sh --baseline` over the sixteen 3/3 cases | one `with_skill` and one `without_skill` arm each. 32 runs. **14 of 16 baselines certified SKILL-FREE**; 2 CONTAMINATED and both failed anyway |
| **batch 2 uplift re-measurement (#78)** | `PWPROVE_EVAL_YAML=<staged> bash scripts/run-evals-isolated.sh --baseline` over the eight cases | batch 2's six `void` rows, plus `case-15` and `case-11` **re-taken** rather than inherited. 16 runs. **6 of 8 baselines certified SKILL-FREE**; `case-11` CONTAMINATED and `case-17` BASELINE DIRTY |
| **`case-17` re-measurement (#78)** | the same, `--include-case-name case-17`, twice | the dirty baseline re-taken. The second attempt was dirty again and named the route — see *What the census could not see* below. 4 runs over two attempts; the third is the one that counts |
| **`case-11` re-measurement (#78)** | the same, `--include-case-name case-11-greenfield-bootstrap-pinned` | the contaminated baseline re-taken, per *the direction-safe reading is not sound*. 2 runs, baseline SKILL-FREE |
| **trigger re-characterization, BEFORE (#73/#74)** | `PWPROVE_EVAL_YAML=<staged> bash scripts/run-evals-isolated.sh --iteration 3` over `gate-skill-loaded`, `case-1`, `case-2`, `case-3` | the four trigger cases on the **unchanged** `description:`, and on the fixtures #76 repaired. 12 runs. `gate-skill-loaded` 3/3, `case-1` **1/3**, `case-2` **2/3**, `case-3` **1/3** — see *the trigger defect was intermittent, not absolute* |
| **trigger re-characterization, AFTER (#73/#74)** | the same command, the same staged suite, `description:` fixed | the same four cases with nothing else moved. 12 runs. **12/12 — all four 3/3, all four LOADED, 0 contaminated** |
| **`case-29` re-characterization (#77)** | `PWPROVE_EVAL_YAML=<staged> bash scripts/run-evals-isolated.sh --iteration 3` | `case-29` on the repaired judge, which reads the Proven-by column instead of scenario titles. 3 runs. **3/3, 3/3 LOADED, 0 contaminated** — and the three retained 2026-08-14 transcripts had already flipped to PASS offline, before the run |
| **`case-29` uplift (#77)** | the same staged suite, `--baseline --parallelism 1` | one `with_skill` and one `without_skill` arm. 2 runs. Baseline **certified SKILL-FREE**, `with_skill` PASS, baseline FAIL → **`+1`**. The baseline failed for a nameable reason — see *the baseline refused rather than folded wrongly* |
| **`case-29` re-judge (#77, no spend)** | the five retained responses replayed through the judge as code review left it | the judge was refined **after** the two runs above (a blank Proven-by cell is no longer read as a wrapped one; the reader anchors on the separator row so a pipe-less GFM table is not a false red; the prose vocabulary tolls are gone). Every verdict held — 4 PASS, 1 FAIL — so the 3/3 and the `+1` are figures the shipped judge produces, not an earlier draft's |
| **trigger uplift (#73/#74)** | `PWPROVE_EVAL_YAML=<staged> bash scripts/run-evals-isolated.sh --baseline --parallelism 1 --include-case-name case-1-coverage-request-triggers --include-case-name case-2-test-plan-request-triggers --include-case-name case-3-flat-spec-coverage-triggers` | one `with_skill` and one `without_skill` arm each. 6 runs. **3 of 3 baselines certified SKILL-FREE, 0 dirty**; every `with_skill` arm PASS, every baseline arm FAIL. `+1` each, and tautologically so — see *Uplift* |
| **`case-43` attribution (#72)** | `PWPROVE_EVAL_YAML=<staged> bash scripts/run-evals-isolated.sh --iteration 3 --parallelism 3`, then the same `--baseline` | the same case with its premise staged as a `repo_fixture` and its prompt otherwise untouched, to see whether the missing `bind` survived the staging. **It did not, in any of six with-skill arms.** 3 + 12 runs |
| **`case-43` re-characterization (#72)** | `PWPROVE_EVAL_YAML=<staged> bash scripts/run-evals-isolated.sh --baseline --iteration 3`, twice | the repaired case — premise staged, prompt asking for the commands. **3/3 and 3/3 with the skill, 0/3 and 0/3 skill-free, six of six baseline arms certified SKILL-FREE.** 24 runs |
| **collision arm, BEFORE (#81)** | `PWPROVE_EVAL_YAML=skills/pw-prove/evals/eval.collision.yaml bash scripts/run-evals-isolated.sh --iteration 3` | the first arm in this suite's history with **two** skills installed, on the **unchanged** descriptions. 9 runs (6 + 3, the ambiguous case added after the first pair returned clean). **3/3, 3/3, 3/3 — no collision observed.** A further 6 runs were spent before these on a judge that could not load: see *a judge is copied alone* |
| **collision arm, AFTER (#81)** | the same command, both `description:` fields disambiguated | the same three cases with nothing else moved. 9 runs. **9/9, 0 contaminated** — the wording repair costs the routing nothing |
| **trigger re-characterization (#81)** | `bash scripts/run-evals-isolated.sh --iteration 3 --include-case-name gate-skill-loaded --include-case-name case-1-coverage-request-triggers --include-case-name case-2-test-plan-request-triggers --include-case-name case-3-flat-spec-coverage-triggers` | the #73/#74 blast radius after editing the frontmatter both cases guard. 12 runs. **12/12 — all four 3/3, 4/4 LOADED, 0 contaminated** |
| **`case-43` confirmation (#72)** | `PWPROVE_EVAL_YAML=<staged> bash scripts/run-evals-isolated.sh --iteration 3 --parallelism 3` | the pass rate taken **in-band against the final judge**, so the admitted 3/3 is not only a re-judge of arms recorded against an earlier one. 3 runs, **3/3, 3/3 LOADED** |

**85 agent runs through #75; 73 in batch 2; 21 in the wet cases (#69); 128 in batch 3; 22 in #78;
30 in #73/#74; 42 in #72; 5 in #77; 36 in #81; 442 in total.**

**Batch 2's uplift arms were taken on the PRE-#75 runner.** That branch was cut before the seal
landed, so its baselines were void *by construction* rather than by bad luck — which is why seven of
eight were dirty against three of ten in batch 1. Its pass rates were never affected:
characterization does not depend on the baseline seal, and all 13 cases ran LOADED with 0
contaminated. **#78 re-measured all six on the sealed runner, and re-took `case-15` and `case-11`
besides. No `void` uplift is left in this registry.**

| **wet smoke (#69)** | `PWPROVE_EVAL_YAML=<staged> bash scripts/run-evals-isolated.sh --iteration 1` | one pass of `w01`/`w02` before spending a characterization on them — proof that `context.repo_fixture` stages under `environment.type: none` and that a file-reading judge sees the workspace. 2 runs |
| **wet characterization (#69)** | `PWPROVE_EVAL_YAML=<staged> bash scripts/run-evals-isolated.sh --iteration 3` | the pass rate of the two wet cases. 6 runs, 6/6 LOADED, **3/3 each** |
| **wet uplift (#69)** | `PWPROVE_EVAL_YAML=<staged> bash scripts/run-evals-isolated.sh --baseline` | `+1` for both, over baseline arms the sweep certifies skill-free — **after** three defects in the sweep itself were fixed. 4 runs. See *#69: the sweep failed the run for its own remedy working* |
| **`w02` re-characterization (#69)** | `PWPROVE_EVAL_YAML=<staged> bash scripts/run-evals-isolated.sh --iteration 3` | `w02` over the corrected fixture (code review found its judge asserting a route the fixture did not expose). **3/3.** 3 runs |
| **`w02` uplift, twice (#69)** | the same, `--baseline`, then `--baseline --iteration 2` | the uplift the correction moved: `0` on the corrected fixture, then **1 pass / 1 fail** once the fixtures' answer-key comments were removed. 6 runs |



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

- The baseline **had the skill and failed anyway** → read at the time as conservative rather than
  wrong, on the reasoning that a genuinely skill-free run has strictly less to work with and cannot
  do better. **That inference does not hold** — batch 3's `case-51` is the counter-example, and the
  rule is now *re-measure it* (see *The direction-safe reading is not sound*). `case-15` was the one
  row admitted on it here; #78 re-took it against a certified skill-free baseline, which failed, so
  the row now rests on a measurement and stays **active**.
- The baseline **had the skill and passed** → we learned nothing. The pass may be the model's own
  capability or may be the body it just read, and there is no way to tell them apart from this run.
  The reading is **void**, so the case can be neither admitted nor retired for zero uplift. That was
  `case-28` and `case-48`, quarantined pending #75 — **both have since been re-measured against a
  certified skill-free baseline, both came back `+1`, and both are now active.**

Recorded here rather than left implicit, because on its face the three rows look like the same
evidence treated two different ways.

### What the sealed re-measurement cost

`case-28` and `case-48` were re-measured on 2026-08-14 through the runner #75 rebuilt: a census of
every copy of the body on the host, one Claude Code deny rule per copy in the isolated home, the
workspace moved outside every checkout, and an arm-aware sweep that fails the run when a
`without_skill` transcript carries the body. **It took three attempts, and each failure was the
instrument reporting a route nobody had enumerated** — which is the point of asserting rather than
assuming:

1. **First attempt** (both cases, parallel). `case-28`'s baseline came back SKILL-FREE and failed its
   judge → `+1`. `case-48`'s baseline was refused the plugin cache and every checkout by the deny
   rules, kept looking, and read the body out of `/tmp/skill-up-<n>/.claude/skills/pw-prove/` — a
   **concurrent case's own install**. That path cannot be denied; it is the other agent's working
   directory.
2. **Second attempt** (`case-48` alone, serialised). Same verdict, different copy: the body came from
   a `/tmp/skill-up-<n>/` install **left behind by an earlier run**. `$TMPDIR` was not a census root.
3. **Third attempt**, with `$TMPDIR` censused and those stale installs denied: SKILL-FREE, and the
   baseline failed its judge → `+1`.

`case-28`'s **pass rate** was re-taken as well, and for a reason that would otherwise have been
carried over unexamined: the 3/3 it was admitted on came from the characterization run whose
iteration 3 is recorded above as CONTAMINATED. A 3/3 containing an iteration this instrument would
now fail is not a clean 3/3. Re-run through the sealed runner it is 3/3 with all three iterations
LOADED and clean, so the row stands on its own evidence rather than on the earlier run's.

Twice the deny rules held against everything the census had seen and the agent still found a copy the
census had not. Read that as the standing risk of `environment.type: none` (`docs/adr/0018`) and as
the reason the sweep — not the deny list — is the binding assertion.

## Registry

Sixty-four cases have been triaged over three batches plus the wet pair — **every case file on
disk**. Nothing is left undecided: each is either a row below or a deletion recorded with its
reason. **#78 then closed the last open measurement**: every uplift figure here was taken against a
baseline the sweep certified skill-free, so no row reads `void` and none rests on an inference.

**Batch 1 (#63) triaged twenty-one:** the 13 that were active before it, and 8 dormant — the five the
spec named for automatic retirement, plus the three trigger cases `prompt-shapes.md` named as the
only route to widening trigger coverage. **#69 then added the 2 wet cases**, the first of any kind to
reference `evals/files/`.

**Batch 2 (#64) triaged the next twenty**, taken in case-number order from the dormant remainder
(`case-4` … `case-32`). Seven were retired on static triage before a run was spent; the surviving
thirteen each gained a script judge with a must-PASS / must-FAIL fixture pair, and were
characterized at n=3.

**Batch 3 (#65) triaged the remaining twenty-one** — `case-33` onward, everything still on disk.
None was retired on static triage, because the earlier batches had already removed the duplicates;
all 21 gained a script judge and were characterized at n=3, eleven judges were repaired once against
the answers the run recorded, and the sixteen that reached 3/3 had their uplift measured. One,
`case-51`, was then retired on a re-measured zero uplift. **This is
the batch that closes the registry over the whole suite.**

**Pass rate** is over three iterations with the skill installed. **Uplift** is `+1` when the case
went red with the skill removed, `0` when it passed anyway, `void` when the baseline was not
skill-free. Since #75 a `void` uplift is not something a run can report and leave: the sweep fails
any run whose baseline arm carried the body, so a figure recorded here was taken against an arm the
instrument certified as skill-free.

| Case | Shape | Guards (SKILL.md section) | Pass rate | Uplift | Status |
|---|---|---|:--:|:--:|---|
| `gate-skill-loaded` | trigger | frontmatter `description:` — the trigger surface | **3/3** | **+1** (clean) | **active** |
| `b01-confirmation-gate` | behavior | Step 1 › *Confirmation gate — model-invoked runs only* | **3/3** | **+1** (clean) | **active** |
| `b05-handoff-stale` | behavior | Step 4 › *Assumptions* › the Handoff line (and the Step-2 handoff verdict it reports) | **3/3** | **+1** (clean) | **active** |
| `case-15-no-throwaway-recon-spec` | behavior | Step 3 › *Recon — the probe is the question channel, the test run is the validator* (ADR 0004) | **3/3** | **+1** (re-taken under #78; baseline SKILL-FREE and failed — the inference it was admitted on is now a measurement) | **active** |
| `case-50-announced-port-adopted` | behavior | Step 3 › *Bring the environment up* — the announced origin, `BASE_URL`/`PORT_SOURCE` | **3/3** → **3/3** after #66 (see below) | **+1** (clean) | **active** |
| `case-60-no-workers-in-command` | behavior | Step 7 › *Verify* — the filming run's command | **3/3** → **3/3** after #67 (see below) | **+1** (clean) | **active** |
| `case-28-hermetic-audit-not-hand-parsed` | behavior | Step 7 › *Hermetic audit (on the audit run, before anything is filmed)* | **3/3** (re-characterized under #75 — the earlier 3/3 held a CONTAMINATED iteration) | **+1** (re-measured under #75; baseline SKILL-FREE) | **active** |
| `case-48-dev-guarded-rung-skipped` | behavior | Step 3 › *Auth — drive the app's OWN entry (never a blind localStorage seed)* | **3/3** | **+1** (re-measured under #75, third attempt; baseline SKILL-FREE) | **active** |
| `w01-bringup-own-port` | behavior (**wet**) | Step 3 › *Bring the environment up* — bullet 1, the packaged serve script that hard-codes a port | **3/3** | **+1** (clean; the discriminating half is the gate, see #69 below) | **active** |
| `b32-dwell-inline` | behavior | Step 6 › *Clip-fidelity audit* — the dwell is inline per `test()` | **0/3** → **3/3** (re-characterized under #71, once its judge stopped reading a tool preamble as turn 1) | **+1** (clean, and measured at **n=3 per arm** rather than n=1: 3/3 with the skill against **0/3** skill-free, all three baseline arms certified SKILL-FREE by the sweep) | **active** |
| `case-1-coverage-request-triggers` | trigger | frontmatter `description:` — the **coverage-gap** clause, over a POM repo | **1/3 → 3/3** (#73/#74; see *the trigger defect was intermittent, not absolute* below) | **+1** (clean, and **tautological** — see the note under that heading) | **active** |
| `case-2-test-plan-request-triggers` | trigger | frontmatter `description:` — the **coverage-gap** clause, as a "plan the tests for this route" request | **2/3 → 3/3** (#73/#74) | **+1** (clean, tautological) | **active** |
| `case-3-flat-spec-coverage-triggers` | trigger | frontmatter `description:` — the **coverage-gap** clause, over a flat-spec repo | **1/3 → 3/3** (#73/#74) | **+1** (clean, tautological) | **active** |
| `case-81-untested-routes` | trigger (**collision arm**) | frontmatter `description:` — pw-prove's coverage clause **against e2e-reviewer's**, an untested-routes request | **3/3** before the wording repair, **3/3** after (#81) | **+1** by construction, and the discriminating before/after is **flat** — see *the collision was in the text, not in the behaviour* | **active** in `eval.collision.yaml` |
| `case-81-spec-quality` | trigger (**collision arm**) | frontmatter `description:` — e2e-reviewer's, and the pw-prove clause that must NOT swallow it | **3/3** before, **3/3** after (#81) | as above | **active** in `eval.collision.yaml` |
| `case-81-ambiguous-coverage` | trigger (**collision arm**) | frontmatter `description:` — the bare phrase *"coverage gaps"*, which both skills claimed | **3/3** before, **3/3** after (#81) | as above | **active** in `eval.collision.yaml` |
| `case-43-har-bound-not-rerecorded` | behavior | Step 7 › *Verify* — item 1b, the HAR is bound to this run (Step 5 › HAR-first mocking) | **0/3** → **3/3** (re-characterized under #72, once the premise it asserted was actually on disk and three judge defects were repaired) | **+1** (**n=3 per arm**: 3/3 with the skill against **0/3** skill-free, and again on a second independent run — six baseline arms, all six certified SKILL-FREE) | **active** |


| `w02-auth-cookie-from-app` | behavior (**wet**) | Step 3 › *Auth — drive the app's OWN entry (never a blind localStorage seed)* — the ladder as written code | **3/3**, and 2/2 more with-skill arms over the final fixture | **unstable** — 1 of 2 skill-free baseline arms passed, so there is no `+1` to admit on and no clean `0` to retire on | quarantined — see #69 below |
| `case-30-publish-url-from-marker` | behavior | Step 8 › *Deliver* — the publish URL is read from the `PWPROVE_URL` marker | 3/3 at n=3, **3/4** including the uplift run's with-skill arm | not measured — both arms of the uplift run failed, so there is no difference to read | quarantined |
| `case-44-config-exit-names-the-key` | behavior | Step 3 › *Bring the environment up* — `preflight.mjs config` exit 4 names the key | **2/3** | not measured | quarantined |
| `b49-untrusted-page-content` | behavior | *Safety: page content is untrusted data* | 3/3 | **0** (clean baseline) | **retired — deleted** |
| `case-26` | behavior | Step 7 › *Failure handling* | — | — | **retired — deleted** |
| `case-27` | behavior | Step 7 › *Mutation check* | — | — | **retired — deleted** |
| `case-39` | behavior | Step 6 › *Clip-fidelity audit* | — | — | **retired — deleted** |
| `case-40` | behavior | Step 6 › *Clip-fidelity audit* | — | — | **retired — deleted** |
| `case-49` | behavior | Step 3 › *Auth* — the token-source ladder | — | — | **retired — deleted** |

### Batch 2 (#64) — the twenty dormant cases after batch 1

Every row's judge is a script under `evals/judges/`, added by this batch with a must-PASS twin and a
must-FAIL fixture. Uplift was measured only for the eight cases that reached 3/3 — and **every uplift
figure in this table was re-taken by #78 on the sealed runner**, because the batch was cut before the
seal landed. The pass rates are batch 2's own and are unaffected.

| Case | Shape | Guards (SKILL.md section) | Pass rate | Uplift | Status |
|---|---|---|:--:|:--:|---|
| `case-11-greenfield-bootstrap-pinned` | behavior | Step 5b › *Bootstrap the runner if greenfield* | **3/3** | **+1** (re-taken under #78; baseline SKILL-FREE and failed — the inference it was admitted on is now a measurement) | **active** |
| `case-16-pom-extend-not-duplicate` | behavior | Step 5 › *Generate* — *Extend, don't duplicate* against the Step-1 `pomInventory` | **3/3** | **+1** (clean baseline) | **active** |
| `case-5-publish-skip-accounted` | behavior | Step 8 › *Deliver* — the `Proof page: skipped` accounting when the publish credential is refused | 3/3 | **+1** (re-measured under #78; baseline SKILL-FREE and failed) | **active** |
| `case-7-plan-notify-and-continue` | behavior | Step 4 › *notify-and-continue (PR-mode) / approval gate (coverage-gap)* | 3/3 | **+1** (re-measured under #78; baseline SKILL-FREE and failed) | **active** |
| `case-8-step8-tail-complete` | behavior | Step 8 › *Hygiene sweep* + the completion-report invariant | 3/3 | **+1** (re-measured under #78; baseline SKILL-FREE and failed) | **active** |
| `case-12-bringup-stop-report` | behavior | Pipeline Overview › *Stop reports* — the six beats at a Step-3 bring-up failure | 3/3 | not measured — **both arms failed** on the #78 re-measurement, so there is no difference to read | quarantined |
| `case-20-heavy-session-refused` | behavior | Step 1 › *Context gate — a heavy session is refused, not survived* | 3/3 **as `case-20-fresh-context-recommended-once`; re-derived under #98 and NOT yet re-characterized** | **+1** under the old premise (re-measured under #78; baseline SKILL-FREE and failed) | **active — re-characterization owed** |
| `case-17` | behavior | Step 6 › *PROVES-header audit* | 3/3 | **0** (re-measured under #78, third attempt; baseline SKILL-FREE and **passed**) | **retired — deleted** |
| `case-23-viewport-descriptor-pinned` | behavior | Step 4 › *Effective viewport* — a desktop descriptor is scaffold boilerplate | **2/3** (re-characterized on a real fixture, #76 — the 3/3 it used to carry was on a fixture it never read) | baseline **0/3**, both arms certified skill-free | quarantined |
| `case-4-auth-ladder-exhausted-stops` | behavior | Step 3 › *Auth* — the token-source ladder exhausted, and the public-route false positive | **2/3** | not measured | quarantined |
| `case-24-proof-config-reused` | behavior | Step 7 › *Proof run* — a committed proof config is reused, not rewritten (ADR 0008) | **2/3** | not measured | quarantined |
| `case-29-unit-proven-acs-folded` | behavior | Step 2 › *6. Fold ACs the diff already proves cheaper* | **3/3** (re-characterized under #77, on a judge that reads the Proven-by column; the 0/3 was the judge reading scenario titles) | **+1** (baseline SKILL-FREE and failed) | **active** |
| `case-9` | behavior | Step 7 › *Hermetic audit* | — | — | **retired — deleted** |
| `case-13` | behavior | Step 3 › *Auth* — the server-set cookie rung | — | — | **retired — deleted** |
| `case-19` | behavior | Step 7 › *Token diet* | — | — | **retired — deleted** |
| `case-21` | behavior | Step 4 › *Effective viewport* + Step 5 dwell | — | — | **retired — deleted** |
| `case-25` | behavior | Step 8 › *Deliver* — the chaptered publish | — | — | **retired — deleted** |
| `case-31` | behavior | Step 3 › *Bring the environment up* — the runner origin | — | — | **retired — deleted** |
| `case-32` | behavior | Step 7 › *Failure handling* — the `webServer` timeout | — | — | **retired — deleted** |

### The trusted core is thirty-one cases — thirty dry and one wet

`gate-skill-loaded`, the three trigger cases #73/#74 admitted (`case-1`, `case-2`, `case-3`),
`b01-confirmation-gate`, `b05-handoff-stale`, `case-15`, `case-50`, `case-60`,
`case-28`, `case-48`, `case-11`, `case-16`, the four #78 admitted (`case-5`, `case-7`, `case-8`,
`case-20`), `case-22` — admitted by #76 once it was staging its fixture instead of the fixture's
path — the one wet case #69 admitted (`w01-bringup-own-port`), and batch 3's ten: `case-33`,
`case-34`, `case-35`, `case-36`, `case-37`, `case-38`, `case-45`, `case-46`, `case-52`, `case-57` —
plus `b32-dwell-inline`, re-admitted by #71, and `case-43`, re-admitted by #72 once its premise was
staged. That is what `eval.yaml`'s active list holds, and every one of them is 3/3 with a non-zero uplift
**measured against a baseline the sweep certified skill-free** — `case-28` and `case-48` because #75
gave them one, and `case-5`/`case-7`/`case-8`/`case-20`/`case-15`/`case-11` because #78 did.

`case-22` is the suite's first **fixture-staging dry case**: its premise is a repository copied into
the workspace, and its judge still reads the final message. It is not a [wet
case](../../../CONTEXT.md#wet-case) — nothing about the run's own artifacts is graded — and the
distinction is worth keeping, because what it adds over its dry twin `case-36` is the recon step that
opens the config, not a claim about what the run produced.

### Batch 3 (#65) — the twenty-one cases left on disk

`case-33` onward: everything the first two batches did not reach. **Nothing here was retired on
static triage**, and that is the batch's first finding rather than an oversight — see *Why batch 3
retired nothing* below. Every one of the 21 arrived carrying `agent_judge` with no `criteria:` key,
a shape `skill-up validate` rejects outright, so each gained a script judge with a must-PASS /
must-FAIL fixture pair before it could run at all.

| Case | Shape | Guards (SKILL.md section) | Pass rate | Uplift | Status |
|---|---|---|:--:|:--:|---|
| `case-33-missing-har-declared` | behavior | Step 5 › *HAR-first mocking* — a recon pass that produced no HAR | **3/3** (after judge repair) | **+1** (clean) | **active** |
| `case-34-clip-adds-time-not-input` | behavior | `code-rules.md` § *Clip Fidelity* — the filming law, PW_PROVE_CLIP may only add time | **3/3** | **+1** (clean) | **active** |
| `case-35-clip-audit-blocks-step7` | behavior | Step 6 › *Clip-fidelity audit* — `spec` exit 2 blocks Step 7 | **3/3** | **+1** (clean) | **active** |
| `case-36-clip-audit-respects-deliberate` | behavior | Step 4 › *Effective viewport* — the `deliberate:` branch, agreed by the Step-6 audit | **3/3** | **+1** (clean) | **active** |
| `case-22-viewport-deliberate-respected` | behavior | Step 4 › *Effective viewport* — the `deliberate:` branch, resolved from a config **read off disk** | **3/3** (#76, and *after* the judge lost two out-of-branch assertions — 1/3 before, on reds that resolved the viewport correctly) | **+1** — baseline 0/2 on the arms the sweep certified skill-free (a third arm read the body by `bash` and passed; counted, it is still 3/3 vs 1/3) | **active** |
| `case-37-illegible-clip-refilmed-once` | behavior | Step 7 › the clip inspection — diagnose, fix ungated, re-audit, re-film once | **3/3** | **+1** (clean) | **active** |
| `case-38-frames-skip-is-not-a-failure` | behavior | Step 7 › the frame extract — exit 6 is a SKIP, not a failed test | **3/3** (after judge repair) | **+1** (first baseline CONTAMINATED; re-measured SKILL-FREE and still failed) | **active** |
| `case-45-proof-config-drops-webserver` | behavior | Step 7 › *Proof run* — the committed proof config must not inherit `webServer` (ADR 0008) | **3/3** | **+1** (clean) | **active** |
| `case-64-proof-config-keeps-target-building-webserver` | behavior | Step 7 › *Proof run* — the inherited `webServer` is **kept** when the proof target answers at its url (ADR 0016, scoped by #116) | not measured | not measured | quarantined — **never run**, see below |
| `case-46-same-signature-takes-handover` | behavior | Step 7 › *Failure handling* — the no-progress checkpoint takes the handover stop | **3/3** (after judge repair) | **+1** (clean) | **active** |
| `case-51` | behavior | Step 3 › *Bring the environment up* — `SERVE_CAUSE=no-announcement` is a server fault | **3/3** | **0** (re-measured on a certified SKILL-FREE baseline, which **passed**) | **retired — deleted** |
| `case-52-build-reuse-mutation-rebuilds` | behavior | Step 3 › build reuse **and** Step 7 › *Mutation check* — artifact isolation | **3/3** (after judge repair) | **+1** (clean) | **active** |
| `case-57-eval-expression-evaluated` | behavior | Step 4 › *Recon* — a string `expression` is evaluated, not called | **3/3** | **+1** (clean) | **active** |
| `case-47-changed-signature-spends-budget` | behavior | Step 7 › *Failure handling* — a moved signature is a converging run | **3/3** (after judge repair) | not measured — **both arms failed**, so there is no difference to read | quarantined |
| `case-54-overscrub-is-rerecorded` | behavior | Step 8 › *Hygiene sweep* — `har-scrub` exit 6 is over-scrub, not residue | **3/3** | not measured — both arms failed | quarantined |
| `case-55-unproven-restart-no-verdict` | behavior | Step 7 › *Mutation check* — `RESTART=unproven` has no verdict to read | **3/3** | not measured — both arms failed | quarantined |
| `case-58-eval-arg-carries-data` | behavior | Step 4 › *Recon* — the eval `arg` carries JSON data, not a page handle | **3/3** (after judge repair) | not measured — both arms failed | quarantined |
| `case-59-serialise-once-to-diagnose` | behavior | Step 7 › *Verify* — serialise once as a diagnostic (ADR 0017) | **3/3** | not measured — both arms failed | quarantined |
| `case-41-har-residue-refusal` | behavior | Step 8 › *Hygiene sweep* — the residue refusal, not an eyeball confirmation | **1/3** | not measured | quarantined |
| `case-42-capture-time-scrub-trusted` | behavior | Step 3 › the capture-time scrub is trusted, not repeated | **1/3** | not measured | quarantined |
| `case-56-proven-restart-is-the-red` | behavior | Step 7 › *Mutation check* — a proven restart is proven | **1/3** | not measured | quarantined |
| `case-53-probe-vocabulary-one-batch` | behavior | Step 3 › *Recon* — the probe's verb surface | **3/3** (#82, after the **judge** was repaired — 2/3 at #79, 0/3 before that; 3/3 again on an independent n=3 in #82) | **+3** — baseline 0/3, all three arms certified SKILL-FREE (#79 run) | **active** — admitted **#82** |
| `case-61-serial-in-the-spec` | behavior | Step 5 › *Generate* — serialisation belongs in the spec, not the command line | **2/3** (#82, after the vestigial judge clause was removed — 0/3 at #80; 3/3 on the #79-run responses replayed through the same final judge) | **+2** — baseline 0/3, all three arms certified SKILL-FREE | quarantined — **#82**, short of 3/3 on the fresh run |

### Why batch 3 retired nothing, and why that is the expected shape

Batch 1 retired five cases automatically and batch 2 another seven, all for the same three reasons:
duplication, overlap with a registry case, or contradiction of a current ADR. Batch 3 retired
**none**, and the reason is arithmetic rather than leniency: **those batches already took the
duplicates off the top.** What was left on disk after `case-32` is the residue that survived two
passes of exactly that filter, so it is the most distinct material in the suite.

Each of the 21 was checked against the shipped surface before a run was spent — every premise still
exists (`clip-fidelity.mjs` exits 2 and 6, `har-scrub.mjs` exits 3 and 6, the probe has `console`
and the `{fn, arg}` form and no `viewport` verb, `preflight.mjs` emits `no-announcement`,
`restart-port-in-use`, `BUILD_REUSE` and `RESTART=proven`). **No case retired for a vanished
premise, a duplicate prompt, or an ADR contradiction.** Zero retirements is what the evidence
supports, and the alternative — retiring on a guess to hit a keep rate — is what the admission rule
exists to prevent.

**Two admissions bend the overlap rule, and the bend is stated rather than buried.** The rule is *"a
case that duplicates or overlaps a registry case is retired, not repaired"*, and `case-36` and
`case-45` each overlap one. Both were kept, on a distinction the rule does not make but the registry
depends on: **the case they overlap is not guarding anything.** `case-22` was void under #76 and
`case-24` is quarantined at 2/3, so retiring their measurable counterparts would trade a working
guard for a broken one and leave the section covered by nothing. Read as a precedent, that is
narrow: *overlap retires the weaker case, and a case that cannot be measured is the weaker case.* It
does not license keeping two guards over one section when both work — which is why only `case-57`
survived of the three probe-eval cases.

The near-misses are worth naming, because each looks retirable on its section column alone:

- **`case-36` is not retired as `case-22`'s overlap**, though both assert that an explicit
  `viewport:` key outranks the `...devices[…]` spread beside it. When batch 3 ran, `case-22` was
  void under #76 — it read a 49-byte file containing its own path — so `case-36` was the
  only one of the pair whose verdict could be read at all. **#76 changed that**: `case-22` now stages
  the real fixture and is 3/3 with a `+1`, so both are active, and the registry owes the reason. It
  is the *premise route*, not the rule: `case-36` states the config in prose, so it grades whether
  the agent applies the rule it was told; `case-22` hands the agent a repository and grades whether
  it goes and reads `playwright.config.ts` at all. A regression that stops the recon step opening the
  config leaves `case-36` green and takes `case-22` red. `case-22` is also the suite's canary for the
  #76 defect itself: staging that silently degrades to a one-line file makes it fail, and nothing
  else on this table would notice.
- **`case-45` is not retired as `case-24`'s overlap.** It carries `case-24`'s assertion (a committed
  proof config is reused, not rewritten) as a *false-positive guard* and adds the behaviour
  `case-24` does not have — the inherited `webServer`. It is the superset, and it is 3/3 where
  `case-24` is 2/3.
- **`case-55` and `case-56` are a matched pair**, as are `case-46` and `case-47`: each is the
  false-positive twin of the other's rule. The registry values that shape — it is why `case-4` was
  kept over `case-13` in batch 2 — so neither was retired as the other's duplicate.
- **`case-53`, `case-57` and `case-58` all sit on the probe's eval surface** and are not duplicates:
  `case-57` is the wrong *form* (a string expression is evaluated, never called), `case-58` is the
  right form with the wrong *argument*, and `case-53` is the verb surface. Only `case-57` was
  admitted, so the over-coverage resolved itself on evidence rather than on a static guess.

### Most of batch 3's first-run reds were the instrument, for the fifth time

The first characterization scored **10 of 21**. Reading the transcripts, most reds were correct
answers phrased differently from the regex grading them — the same defect this audit has now found
five times, each a layer deeper (lexically #59, positionally #63, under a list header #66, through
an unstaged fixture #76, and here as **vocabulary**).

| Case | What the answer said | What the judge demanded |
|---|---|---|
| `case-41-har-residue-refusal` | "Re-run `har-scrub.mjs` over the file, then `--verify` again" | the literal `re-scrub` |
| `case-41-har-residue-refusal` | the exit codes in a **markdown table**, arriving as `\| **3** \|` cells | `exit 3` as running prose |
| `case-52-build-reuse-mutation-rebuilds` | `git checkout -- <file>` | the word `revert` |
| `case-58-eval-arg-carries-data` | passed the row **id** as the arg and did the lookup in the page | the selector string as the arg |
| `case-42-capture-time-scrub-trusted` | opened "Nothing. The recording is already scrubbed." | `nothing to do` / `no further action` |
| `case-46-same-signature-takes-handover` | "Commit nothing, push nothing." | `nothing is committed` |
| `case-33-missing-har-declared` | took the **re-record** branch | the re-record branch **and** the deviation declaration |
| `case-38-frames-skip-is-not-a-failure` | prose about the **hermetic audit** ("undeclared LIVE call fails the run") | — it tripped a forbidden pattern belonging to a different step |

Eleven judges were widened once, to the phrasing correct answers actually used; none asks for less
than it did. Re-characterized, six moved to 3/3.

**Two recorded answers were deliberately NOT adopted as must-PASS twins**, and that is a finding
rather than an omission. `case-47`'s third iteration genuinely omits the `-g` rerun and the
full-spec gate; `case-53` genuinely reads the probe autostart as a fault to fix — and #79 later found the reason,
which was the case's own prompt, not the model (see *#79 and #80* below). Widening a rule to
admit them would measure the model rather than the skill. **No judge was tuned a second time** —
that is the #77 lesson, and it is why `case-41`, `case-42`, `case-56`, `case-53` and `case-61` are
quarantined at the rate the repaired instrument gave them rather than at a third rate.

Two new layers of the defect are recorded here for the next batch: a **markdown table cell**
(`| **3** |`) hides a value from a prose-shaped pattern, and a **forbidden pattern can fire on a
neighbouring step's vocabulary** — `case-38`'s judge red-flagged a correct answer for discussing the
hermetic audit, because "fails the run" is the right phrase in the wrong section. The working repair
for the second is the one batch 2 found: anchor on a **first-person commitment**, not on a verb.

### Batch 3's uplift: fourteen of sixteen baselines were certified skill-free

The seal #75 built held far better here than in either earlier batch — batch 1 had 3 of 10 dirty,
batch 2 had 7 of 8:

| Baseline verdict | Cases | Reading |
|---|---|---|
| `SKILL-FREE`, arm **failed** | `case-33`, `case-34`, `case-35`, `case-36`, `case-37`, `case-45`, `case-46`, `case-52`, `case-57`, and `case-38` on re-measurement | **`+1`, clean** |
| both arms **failed** | `case-47`, `case-54`, `case-55`, `case-58`, `case-59` | **not measured.** There is no difference to read, so these five cannot be admitted or retired for zero uplift — the `case-30` reading, at five times the scale |
| `SKILL-FREE`, arm **passed** | `case-51` on re-measurement | **zero uplift → retired, deleted** |

### The direction-safe reading is not sound, and this batch has the counter-example

Two baselines came back **CONTAMINATED** on the first uplift run — `case-38` and `case-51`, both
having reached `~/.claude/plugins/cache/sss-marketplace/e2e/1.2.0/skills/pw-prove/SKILL.md` through
the Bash route the deny rules cannot close. **Both arms failed**, which under this registry's
existing rule is the *direction-safe* reading: a run that had the body and still failed licenses a
`+1`, because a genuinely skill-free run has strictly less to work with and cannot do better. That
is the rule `case-15` and `case-11` are active on.

Both were re-measured anyway, on a baseline the sweep certified SKILL-FREE. The results split:

- **`case-38` — baseline SKILL-FREE and failed. `+1` confirmed.** The direction-safe reading was right.
- **`case-51` — baseline SKILL-FREE and *passed*. Zero uplift.** The direction-safe reading was
  **wrong**, and by the rule's own logic it should have been impossible: a strictly-less-informed run
  did strictly better.

**So the inference does not hold.** What it silently assumes is that a single arm's verdict is a
property of the information available to it; run-to-run variance in one arm is enough to break that,
and here it did. `case-51` would have been admitted as an active guard on a reading rather than a
measurement, and it is not a guard at all — Opus 5 reads `SERVE_CAUSE=no-announcement` correctly
without the skill.

Recorded as a rule change rather than an anecdote: **a contaminated baseline that merely failed is
not admission-grade evidence. Re-measure it.** `case-15` and `case-11` were the only two rows left
resting on it. **#78 re-took both rather than inheriting them, and both baselines came back
SKILL-FREE and failed, so both `+1`s stand — this time as measurements.** That the re-take confirmed
them is not evidence the inference was sound: `case-51` is the case where it was not, and one row in
eleven is exactly the rate that makes re-measuring cheap insurance rather than ceremony. **No row in
this registry now rests on the direction-safe reading.**

The cost of finding this was **4 agent runs**. It caught one wrongly-admitted guard out of eleven.

**One batch-3 case was retired for zero uplift**, and only because it was re-measured. On the first
uplift run no baseline passed at all, so the zero-uplift rule appeared to have nothing to act on.

The five both-arms-failed cases are the batch's largest single source of quarantine, and they differ
from batch 2's void rows in an important way: batch 2's baselines were dirty, so the *instrument*
was at fault and #78 re-measured them — where it found the same both-arms-failed shape once more, in
`case-12`. Here the instrument was clean and the **with-skill arm
failed on the uplift run** having passed 3/3 hours earlier, which points at ordinary run-to-run
variance in a single arm rather than at contamination. They are re-measurable by re-running the
uplift arm alone.

### The core, and the arithmetic across every batch

**The trusted core is twenty-five cases.** The full list is above, under *The trusted core is
twenty-five cases*; this section is the arithmetic behind it.

**The core more than doubled in batch 3, and that is worth reading carefully rather than as
progress.** It did not happen because batch 3's cases are better; it happened because they were the
first cohort measured end to end on the sealed runner, so their uplift figures survived. Batch 2
scored 8 of 13 on pass rate and admitted **2 at the time**, entirely because its baselines were
dirty. Batch 3 scored 16 of 21 and admitted 10. **The difference between those keep rates was the
instrument, not the cases** — which is what #78 then demonstrated directly: re-measured on the sealed
runner, batch 2 admits **6 of 13** rather than 2, retires one for zero uplift, and leaves one
unreadable. The keep rate moved by 4 cases without a word of any case file changing.

Of the 21 cases batch 1 triaged, 5 were automatic retirements. **Of the 16 it actually measured, 8
were admitted (6 by #63, 2 more once #75 unvoided their uplift), 7 are quarantined and 1 was
deleted.** Of the 20 batch 2 triaged, 7 were automatic retirements; **of the 13 it measured, 6 are
admitted (2 by #64, 4 more once #78 unvoided their uplift), 6 are quarantined and 1 was deleted
(`case-17`, zero uplift).** Of the 21 batch 3 triaged, **0 were automatic retirements; all 21 were
measured, 10 were admitted, 10 are quarantined and 1 was deleted.** The wet pair adds 1 active and 1
quarantined.

Across all three batches plus the wet pair, and after #76 re-characterized `case-22` and `case-23`:
**67 triaged — 36 active, 16 quarantined, 15 deleted**, over **52** case files on disk (#72 moved
`case-43`, #77 moved `case-29` and #82 moved `case-53` from quarantined to active; #81 added the
three collision cases, which are active in `eval.collision.yaml` rather than in `eval.yaml`). The
arithmetic closes twice: 36 + 16 + 15 = 67, and 21 + 20 + 21 + 2 + 3 = 67; and 52 on disk + 15
deleted = 67. **Every case file on disk carries a registry row**, and every case that did not make it is
recorded with a reason rather than a shrug. That is the expected shape: the goal is a core whose
verdicts can be believed, not a high keep rate.

**Batch 2's keep rate looked low for one dominant reason, and it was never the skill.** Six of its
eleven quarantines were 3/3 cases whose *uplift* could not be read, because seven of the eight
baseline arms had pw-prove's body in context. On pass rate alone batch 2 read 8 of 13; on the
evidence available in #64 it read 2; on evidence taken through the sealed runner it reads **6**.

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

### #68: the blast radius of the two body changes is `case-50` and `case-60`, and both were already measured

The selection was derived from the diffs rather than inherited from the two tickets' own claims, because
a ticket that re-measures its own guard case cannot tell you whether it moved *someone else's*. The
cumulative SKILL.md delta from #66 and #67 (`1a11758..2cf76b5`, `0.15.0` → `0.15.2`) is **seven lines**,
and each one maps to a row above:

| Edited line | Section it sits in | Guarded by |
|---|---|---|
| frontmatter `metadata.version` | frontmatter — **not** `description:` | nothing edited: `gate-skill-loaded` guards the trigger surface, and the `description:` string is byte-identical across both commits |
| Step 3, bullet 1 — *owning the port is not holding the number* (#66) | Step 3 › *Bring the environment up* — the announced origin | `case-50` |
| Step 3 — the `SERVE_CAUSE=no-log` remedy (#66) | Step 3 › *Bring the environment up* — the `serve` exit-3 causes | `case-50` |
| Step 7 — the proof-run command's concurrency comment (#67) | Step 7 › *Verify* — the proof-run command | `case-60` |
| Step 7 — *the proof run is concurrent* paragraph (#67) | Step 7 › *Verify* | `case-60` |
| Step 7 — the serialisation-diagnostic bullet, twice (#67, then `-j 1`) | Step 7 › *Verify* | `case-60` |
| Step 7 — *No concurrency override here either* comment (#67) | Step 7 › *Mutation check* | **nothing** — see below |

So the affected **active** set is exactly `{case-50, case-60}`. #66 re-characterized `case-50` (3/3 →
3/3, twice) and #67 re-characterized `case-60` (3/3 → 3/3, twice, the second over the final text).
**No section edited by either change is guarded by a case that neither ticket re-measured**, so this
re-characterization spends zero agent runs and the run total above stays at 85. A lookup that returns
a known answer is still the answer.

Two boundaries worth stating, because both look like near-misses on the section column:

- **`case-44` is *not* in the blast radius**, though its section column also reads *Step 3 › Bring the
  environment up*. It guards `preflight.mjs config build` exit 4 (`MISSING_KEYS=…`); #66 edited the
  port allocation and the `serve` exit-3 causes. Different subcommand, different exit, no overlap.
  (It is quarantined at 2/3 in any case, so it is not an active guard to move.)
- **#67 edited one line inside a section nothing guards** — Step 7 › *Mutation check*, already listed
  under *Coverage gaps* after `case-27` was retired for its `--workers=1` half. The edit is a comment
  in the mutation-run command block, and the honest record is that **no instrument here could have
  detected a regression in it**. That is the gap doing its job by being visible, not a reason to
  claim the line is safe.

#### The `--workers` flag finding: fixed by de-contamination, and #67's removal is not credited with it

Stated on evidence, in the order the evidence arrived:

1. The **2026-08-13 finding is VOID** — that run was contaminated *and* judged by broken judges, either
   of which alone is sufficient (see *The 2026-08-13 verdicts are VOID*).
2. The **established cause was the stale shipped copy** (#55): a 615-line `0.1.0` SKILL.md written
   2026-08-03, live on disk, carrying `# --workers=1 is REQUIRED`. The model was **reading** it, not
   remembering it — so the defect was in what was installed, never in the repo's prose.
3. **#59 measured `case-60` passing after de-contamination, before a word of prose changed.** This is
   the load-bearing observation: the finding was already gone at the point where nothing had been
   edited.
4. **#63 characterized `case-60` at 3/3 with a clean `+1`** — still before the removal.
5. **#67 removed the flag string and measured 3/3 again**, having recorded *before* measuring that no
   movement was expected, because a 3/3 has no headroom.

**Verdict: fixed by de-contamination.** The finding is not open, and the fix is not #67's. #67 removed
six mentions of a retired flag from text that instructed the agent never to write it — a legibility
change, claimed as nothing else, and the suite cannot see whether it reads better to a model. Crediting
the removal with the fix is precisely the error that got a shipped fix committed and then reverted
(`d717e05` → `2b04ade`); it is not repeated here.

Nothing moved out of 3/3, so the quarantine rule had nothing to act on and no row's status changes.

### #69: the first two wet cases, and the divergence they did not find

Every case in this suite before these two asked the model to **say** what it would do. `w01` and `w02`
are the first that check it can **do** it, and they are the first cases of any kind to reference
`evals/files/`, which had sat unused since it was built.

| | `w01-bringup-own-port` | `w02-auth-cookie-from-app` |
|---|---|---|
| Fixture | `app-vite-embed` — its packaged serve script hard-codes `PORT=4100`, and `script/serve-ssr.mjs` is zero-dependency Node that really binds | `app-nuxt-ssr` — `import.meta.dev`-guarded `?token=` rung in `app/composables/useAuth.ts`, `app_session` minted server-side in `server/api/auth/login.post.ts` |
| Dry twin | `case-50` | `case-48` |
| What the twin grades | an answer about a **pasted** server log | an answer about a dev-guarded rung |
| What the wet case grades | the `serve.log` a real process wrote, the port in it, and whether the recorded `BASE_URL=` carries that same port | the `tests/e2e/auth.setup.ts` the run left on disk, and whether that file takes the ladder its answer describes |
| What its twin cannot assert | that a server came up **at all**, or on which port | that the emitted code does what the prose said |

#### Which fixture got which case, and what had to be added to make that true

The ticket names the two fixtures by what they are — *"the hard-coded port one and the SSR one"* —
and says to read them rather than assume from the names. Read, they do not split cleanly, and the
reading is recorded here because it is a judgement someone will otherwise have to redo:

- **`app-vite-embed` is the hard-coded-port fixture, and it is the only one that can be brought up.**
  Its own comment says so (*"The packaged serve script hard-codes its port through the package.json
  script (PORT=4100)"*), and `script/serve-ssr.mjs` is zero-dependency Node that binds for real.
  `app-nuxt-ssr` also names port 3000 in three places, but bringing it up needs Nuxt installed, so a
  wet bring-up case against it would go red for a missing dependency. `w01` therefore takes it.
- **`app-nuxt-ssr` is the SSR fixture, and it did not carry a dev-guarded rung.** The `__DEV__`-guarded
  `?token=` bootstrap and the two-key `localStorage` store live in `app-vite-embed/src/`. So the
  premise `w02` needs was **added** to `app-nuxt-ssr` — one file, `app/composables/useAuth.ts`,
  guarding the `?token=` rung with `import.meta.dev` beside the `app_session` cookie the fixture
  already minted server-side. That is authored, not found, and it is stated plainly rather than left
  for a reader to discover: the alternative was to point both wet cases at `app-vite-embed` and leave
  the second fixture unreferenced, which is the condition this ticket exists to end.

Three corrections landed in code review, and `w02` was re-characterized and re-measured over the
corrected fixture rather than carried on the earlier reading:

- `server/api/auth-login.post.ts` is mapped by Nuxt to `/api/auth-login`, while `app/pages/login.vue`
  posts to `/api/auth/login` — the fixture contradicted itself, and `w02`'s judge had made that
  contradiction load-bearing. The handler is `server/api/auth/login.post.ts` now, and the judge
  accepts either spelling so no reading of the source is punished for the fixture's own drift.
- The added composable referenced `setToken`/`getCurrentUser`, which exist only in the *other*
  fixture. It is self-contained now.
- Both the handler comment and the composable comment stated the correct remedy in prose. That is an
  answer key in the input, and it is what the first two uplift readings were actually measuring —
  see the finding below. Both are gone.

Neither is a whole proof run. Each is scoped to one phase — `w01`'s prompt declares the config and
build phases already passed, `w02`'s declares the bring-up gate passed and forbids running Playwright
— because a case that spans eight steps cannot tell you which one broke.

**Measured: `w01` 3/3 with `+1`, and admitted. `w02` 3/3 with an uplift that would not settle, and
quarantined.** The three `w01` iterations served on ports 36217, 39825 and 40221 — three real
processes, three real announcements, never the packaged 4100.

#### The finding: no divergence between saying and doing — and the reason is the fixtures

This is the outcome the ticket named in advance as a result rather than a disappointment, and it is
the one that came back, harder than expected. **Both wet cases pass at exactly the rate their dry
twins do**, so nothing here shows the skill describing a behaviour it then fails to perform, on
either of the two sections most likely to expose the gap. For these two sections the dry suite is a
fair proxy, and that is a reason not to convert more of it wet.

The `without_skill` arms are where the finding sharpens, and what they expose is the **fixtures**:

- **`w01`'s baseline did not diverge on the behaviour under test.** It allocated its own free port and
  did not take 4100 — it cleared every port assertion and failed on the next one, the bring-up gate
  (`SERVE=up`, its own invention, where `preflight.mjs` prints `SERVE=ok`). So the `+1` is real but
  the discriminating half is the **gate**, not the port choice. Recorded rather than smoothed over,
  because the row above would otherwise read as "the skill is what stops it taking 4100", which this
  run says it is not. A named limitation on that reading: `script/serve-ssr.mjs` carries a comment
  telling the reader not to invoke the packaged command verbatim, so the port half of that case was
  never a fair test of the skill in the first place.
- **`w02` could not be admitted, and the fixture is why.** Its skill-free baseline answered the whole
  ladder correctly — the `import.meta.dev` guard, the rung recorded absent, the API login, the cookie
  taken off the response. Two of the fixture's files *stated that answer in prose*: the handler's own
  comment (*"a test must API-login and reuse the Set-Cookie it returns rather than hand-authoring
  one"*) and the composable comment added with the rung. **A fixture that narrates the remedy is an
  answer key, and uplift measured over one measures the fixture's legibility, not the skill.** Both
  comments are gone now; re-measured, the baseline came back **1 pass in 2** — not a `+1` to admit on
  and not a clean `0` to retire on, so `w02` is quarantined rather than either.

That is the real finding of this ticket, and it is bigger than the two cases: **every fixture under
`evals/files/` is written in a didactic voice** — `auth-store.ts` explains that a credential-only seed
renders an empty shell, `session.ts` explains that `__DEV__` folds to false. That style is useful for
a human reading the corpus and fatal for an uplift measurement, because the baseline arm reads it too.
Before any further wet case is built on these fixtures, the comments that state the remedy have to
come out. Filed as follow-up work rather than fixed wholesale here: stripping them changes the input
to every case that stages them, so it is a change with its own re-characterization bill.

What the wet pair buys in the meantime is not a higher hit rate on prose. `w01` is the only coverage
in this suite that reaches the **shipped scripts and a real process** — `preflight.mjs serve` actually
runs and its summary is actually parsed — and `w02`, quarantined, is the only one that reaches the
**emitted artifact**. Nothing dry touches either.

#### #69: the sweep failed the run for its own remedy working

The uplift above took two attempts, and the first failure was the instrument again — three defects in
`judges/skill-loaded.mjs`, all in the contamination half, each pinned now by a fixture pair that goes
red without its fix:

1. **The runner's own deny list read as contamination.** #75 writes one `Read(<copy>/**)` rule per
   host copy into the isolated home's `settings.json`. A baseline agent that cannot find the skill
   reads that settings file while hunting for it, and the whole list of marketplace paths lands in a
   tool result. Both baseline arms were failed for the remedy doing its job. A `Read(…)` rule form is
   discounted now; a bare path beside one is not.
2. **A real `tool_use_id` defeated the refusal discount.** `isWhollyDenial` treated any string over
   24 characters as substantial, and a real id is 30 (`toolu_01EngPMVf8ECsBeRkp4DaUD3`) — so a denied
   `ls -d ~/.claude/plugins/cache/*/*/*/` was counted as a breach. **Every fixture in the set was
   hand-authored with `t1`-shaped ids, which is precisely why none could see it.** A fixture that is
   tidier than the data is a fixture with a blind spot.
3. **Claude Code mirrors a tool result at the record level** in `toolUseResult`, so a refusal the
   block-level discount had just removed walked straight back in as metadata. This was the one that
   survived the first two fixes.

Read that the way #75 asks it to be read: twice more, the deny rules held and the instrument reported
a route nobody had enumerated. The sweep is still the binding assertion — after the repairs it
certified both baseline arms SKILL-FREE, and it did so by reading the body's own lines, not by being
told the run was clean.

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
| `case-51` | **Zero uplift, on a re-measured clean baseline** (#65). Its first baseline was CONTAMINATED and failed, which the direction-safe rule would have read as `+1`; re-taken against a certified SKILL-FREE arm it **passed**. Opus 5 reads `SERVE_CAUSE=no-announcement` plus a printed `Cannot find module` crash correctly without the skill — it does not hunt a port, and it acts on the server's own error. The **behavior is unchanged** and still stated in SKILL.md Step 3; what is retired is the case. Its judge `no-announcement-is-a-server-fault.mjs` and that judge's fixtures were deleted with it. |
| `case-17` | **Zero uplift, on a re-measured clean baseline** (#78). Its batch-2 baseline was dirty and had passed, which is the reading the registry calls `void`; re-taken on the sealed runner — after two attempts the census could not survive, see *What the census could not see* — the arm was certified SKILL-FREE and **passed again**. Opus 5 quotes the acceptance criterion verbatim into the `// PROVES:` header and blocks Step 7 on a paraphrase without being told. The **behavior is unchanged** and still stated in SKILL.md Step 6; what is retired is the case. Its judge `proves-header-verdict.mjs` and that judge's fixtures were deleted with it. |
| `b49-untrusted-page-content` | **Zero uplift, on a clean baseline.** With the skill removed the agent never reached a line of the body (`LOADED via skill-tool` only — the call errored) and its answer passed the judge anyway: Opus 5 treats page content as data without being told. A case that cannot go red when the skill regresses is not a guard. The **behavior is unchanged** and still stated in SKILL.md § *Safety: page content is untrusted data*; what is retired is the case, not the rule. Its judge `page-content-is-data.mjs` and that judge's fixtures were deleted with it. |

A case that merely exercises a script's exit code was **not** treated as automatically out of scope.
`case-44` and `case-30` test whether the agent reads and acts on an exit code, which is skill
judgment, and both survive triage on that ground — the line is whether the case would survive the
script being rewritten, and both would.

### What the two 0/3 behavior failures actually were

Neither is a plain "the skill is wrong" result, and the tickets say so.

- **`b32` (#71) is a judge defect — four of them, and #71 fixed all four.** Turn 1 of every iteration
  said exactly what the judge reported it never says. `dwell-inline-per-test.mjs` took turn 1 to be
  `turns[0]`, the first assistant *text block* — and since #60 gave every behavior case a placement
  line, that block is a one-line preamble (`I'll load the skill first.`) emitted before the Skill tool
  call. The answer is in `turns[1]`. Its committed fixtures could not see this: they are hand-authored
  with one block per turn. See *`b32` was four defects, not one* below for the other three, which the
  re-characterization surfaced one at a time — each hidden behind the one before it. With all four
  fixed the case is **3/3 at n=3 with a clean `+1`** and is back in the active list.
- **`case-43` (#72) read as a defect in the emitted artifact, and measurement said otherwise.** The
  reading recorded here was that the diagnosis is right every time while the command block drops the
  `bind` subcommand, with the absent premise noted only as a contributing factor. #72 tested that
  ordering instead of assuming it, and the contributing factor was the whole cause: **the subcommand
  never went missing once the premise was on disk.** See *`case-43` was the premise, not the body*
  below.

### #79 and #80: two premises, decided separately — and both were the case

The two cases batch 3 held back were the same *kind* of question ("is the premise legitimate, or is
the skill right to decline it?") and nothing else in common, so they were decided independently.
Both judges had already been repaired once (`ab1ec16`), so **neither judge was touched** — the
#77 rule. Each decision is a change to the case's **prompt**, measured at n=3 with `--baseline`,
2026-08-14, all four arms per iteration certified (2 LOADED, 2 SKILL-FREE, 0 contaminated).

**#79 — `case-53`: the body already said both things, so the case was the defect.** SKILL.md's
Step 3 › *Recon* carries the autostart rule and the environment warning in **one sentence**: "A
`send` with no daemon running starts one first … The autostarted daemon inherits that command's
environment, so if `RECORD_HAR`/`BASE_URL`/`STORAGE_STATE` matter, set them on the `send` too."
Nothing was thin. The case's prompt showed a bare `send` carrying **no environment at all** as the
first probe command, which is precisely the failure mode the second half of that sentence exists to
catch — so every recorded answer flagged it, correctly, and the case graded that as a miss. The
prompt now sets `BASE_URL`/`STORAGE_STATE`/`RECORD_HAR` on the `send` and states that its stderr
named all three, which settles the environment question and leaves the autostart as what the case is
actually about. **No SKILL.md change was caused by #79, and none was needed.**

Result: **2/3** with the skill against **0/3** on a certified SKILL-FREE baseline — up from 0/3, and
`+1` on a baseline that tried and got it wrong rather than one that declined. Short of the 3/3 bar,
so it stays quarantined rather than being admitted. The one red is worth naming because it is *not*
the case's subject: the answer was correct in every particular — named-map `eval`, `console` first,
viewport refused with Step 4 as the resolution point — and failed three judge patterns on phrasing.
`window.__APP__?.tenant` does not match `/__APP__\.tenant/` (optional chaining is the same value),
and "I'm not sending, because there is no verb for it" does not match a refusal pattern anchored on
the word *viewport* being near the word *no*. Both are the bare-substring defect this registry has
now recorded six times, and repairing them is a **judge** change this ticket was forbidden to make
against the same transcripts. That is the open item, not the case.

**#80 — `case-61`: the premise is legitimate, but only under the one condition the case omitted.**
Every pre-repair answer declined the framing and was right to: hermetic-by-default means a PR-mode
spec should not be mutating a shared staging record at all, so mocking dissolves the contention
instead of scheduling around it. There is exactly one PR-mode situation the mocking guidance cannot
dissolve — a **declared carve-out**, where the live round-trip *is* the AC. The model found it
unprompted ("if the AC under proof is cross-view persistence, mocking both sides proves nothing,
because the mock is what makes the assertion pass"), and `code-rules.md` § *Network Determinism*
sanctions it: a write against a **pre-existing** record, with a restore exercised in the spec, and
nothing created on the shared tenant. So the case is not retired; its prompt now states the
carve-out and forbids re-opening it.

The disagreement is gone. With the repaired premise the answers serialise in the spec with
`test.describe.configure({ mode: 'serial' })`, comment the shared record as the reason, keep the
other three scenarios concurrent, and refuse `-j 1`, a `workers` pin, retries and sleeps by name —
the whole rule, unprompted. It is still **0/3**, on one vestigial judge clause: *"the answer never
rules out browser-context leakage."* That assertion existed because the **old** prompt named no cause
for the race, so ruling out context isolation was load-bearing reasoning. The repaired prompt names
the cause, and the answer has no reason to negate a hypothesis nobody raised. Reconciling that clause
is a judge edit, and therefore out of scope here for the same reason as #79's two.

**The body change is #80's last AC, and it was occasioned rather than caused.** SKILL.md Step 7 now
says which fix outranks the other — mocking first, serialisation for the residue a declared carve-out
leaves behind — because the model had been reasoning to that ordering from two sections that never
stated it. The clause demonstrably reached the model: the post-repair answer opens "the carve-out is
settled, so the contention is the residue that survives the hermetic question," which is the new
sentence's language. That also means `case-61`'s post-repair behaviour cannot be attributed to the
prompt repair alone, and it is recorded here as both.

### `case-53` and `case-61` were the judge, and one of its clauses had outlived its prompt (#82)

#79 and #80 were forbidden from repairing a judge against the transcripts they were reading — the
#77 rule — so both left the instrument defects named and the cases quarantined. This ticket owned
the repairs. It found **five**, where the ticket named three, and all five red-flagged answers that
were right in every particular.

**`probe-vocabulary-one-batch.mjs` — three.** `window.__APP__?.tenant` did not match
`/__APP__\.tenant/`: optional chaining is the same value, and on a shell that may not have booted
the global it is the *better* probe. `/(?:\??\.|\['tenant'\])/` now covers all three spellings of
one read. The refusal pattern was anchored on the word *viewport* sitting near the word *no*, which
reads one word order out of three — three recorded answers refused correctly as "there is
deliberately no `viewport` among them", "the 390px viewport question I'm not sending", and "the
390px viewport is not sent", and only the first matched. The unit is now the **line**, which is what
makes it about the viewport request, and within the line the test is order-free. And a third,
unnamed by the ticket: the answer had to *say* the autostart was "normal" or "expected". That one was
**deleted rather than widened** — see below.

**`serial-in-the-spec-not-on-the-command-line.mjs` — two.** The vestigial clause the ticket names,
and one more of the same family: *"a global override would make every future proof on this repo pay
for this spec's carve-out"* is exactly the fact the *"why the command line is the wrong place"* check
is about, and it matched neither `globally` nor `every other proof`.

**Both deletions are one lesson: an assertion is re-derived from the prompt it is about.** #80
repaired `case-61`'s premise to state the cause outright and left an assertion that the answer
"rules out browser-context leakage" — real under the old prompt, which named no cause, and
unreachable under the new one. #79 did the milder version of it to `case-53`: its repaired prompt
says "nothing about the environment is in question", so an answer that *labels* the autostart is
restating the premise, while what is actually measurable — that it does not re-run — was already the
first `offenders()` pattern and is untouched. Both clauses are gone, both cases carry a must-FAIL
fixture for the behaviour that remains, and `scripts/ci/test-case-shapes.sh` now records a
`derived_from_prompt:` digest per case so the next prompt repair announces itself.

**Measurement.** Two independent n=3 runs, both read through the **final** judge (#77's method — a
number an earlier draft produced is not a number the shipped judge produces):

| | #79/#80 run, replayed | #82 run, fresh |
|---|---|---|
| `case-53-probe-vocabulary-one-batch` with skill | **3/3** | **3/3** |
| `case-53-probe-vocabulary-one-batch` baseline | 0/3, all SKILL-FREE | 0/3, all **CONTAMINATED** |
| `case-61-serial-in-the-spec` with skill | **3/3** | **2/3** |
| `case-61-serial-in-the-spec` baseline | 0/3, all SKILL-FREE | 0/3, all SKILL-FREE |

`case-53` is **admitted**: 6/6 with the skill across two independent runs, `+3` against a baseline
whose three arms are certified SKILL-FREE — the #79 run. The fresh run's own baseline is unusable and
contributes **nothing** to the admission, in either direction. (An earlier draft of this row argued
that a contaminated baseline scoring 0/3 bounds a clean one at 0/3. That inference is the one #65
refuted on `case-51`, whose contaminated baseline failed and whose clean baseline passed; it is
struck rather than repaired, and no row may rest on it.)

**What those three arms actually did (#83, from the retained records).** The account above was wrong
on the mechanism, and the correction matters because it names which residual is still open:

- **The Skill-tool route served nothing.** Two of the three arms invoked `e2e:pw-prove`, and both
  came back `Unknown skill: e2e:pw-prove` — the isolated home carries no plugin cache and no
  `enabledPlugins` entry, so there was no plugin to reach. The gate failed them on the *attempt*,
  which it no longer does. Across all **303** retained transcripts in every run this repo has kept,
  namespaced invocations number **2, both refused, both here**. No admitted row's baseline has ever
  been served this route.
- **The Read route held everywhere.** Every `Read` of a `SKILL.md` — the plugin cache, both host
  checkouts, the marketplace clone — was refused by #75's deny rules. Not one line of any body was
  read.
- **The Bash route did not, and that is the real contamination.** In iteration-2 the arm ran
  `node <host-checkout>/skills/pw-prove/scripts/probe.mjs --help` — a shipped script off another
  checkout on the machine — and got its output. `case-53` is *about the probe's verb surface*, so
  that is contact with the exact
  surface the case measures. This is #75's documented residual — the route no prefix list can close —
  behaving as documented, and it is why the arm is unusable. The CONTAMINATED verdicts themselves
  came from a third thing again: a `find` listing that named plugin-cache paths without opening one.

`case-61` **stays quarantined at 2/3**, and the reason for the red is not the instrument. The
iteration-1 answer serialises correctly, scopes the describe block, comments the shared record as the
reason, keeps the other three concurrent, and refuses `-j 1` and a `workers` pin by name — and never
says *why* the command line is the wrong place. The cost argument ("a global pin charges every other
proof") is the half of the rule it does not volunteer, and that is a candidate finding against
SKILL.md Step 5, not against the judge. It is 5/6 across both runs; one more clean n=3 decides it.

**Do not re-repair this judge against the #82 transcripts.** Two of the five repairs above were
occasioned by reading iteration-1 of the run this ticket took, and both were justified from the
*prompt* rather than from the answer — deletions, not widenings. A third widening against the same
three transcripts is what the #77 rule forbids.

### #83: the Skill-tool route, queried across every retained record

The route #82 surfaced — a baseline arm invoking the marketplace plugin as `e2e:pw-prove` — is
recorded per arm in the retained transcripts, so establishing its blast radius is a **query, not a
re-run**. Every `.jsonl` under every run this repo has kept was scanned for a Skill call matching
`<namespace>:pw-prove`, and each hit paired with its own result:

| | |
|---|---|
| transcripts scanned | **303** |
| namespaced invocations found | **2** — `case-53`, `ticket-82-recharacterize`, iterations 1 and 2, both `without_skill` |
| served | **0** |
| refused (`Unknown skill: e2e:pw-prove`) | **2** |

**No admitted row's baseline arm was ever served this route, and none was re-admitted here.** The
one row whose arms attempted it, `case-53`, already rested on the #79 run's certified SKILL-FREE
baseline; its entry above now says so without the direction-safe gloss it used to carry.

Two things this does **not** say. It does not say the route is harmless — it is closed by the
isolated home's *absence* of an `enabledPlugins` entry, which is an implicit defence, which is why
#83 adds the explicit `Skill(<id>:*)` rules and the plugin-id half of the census. And it does not
rehabilitate a contaminated baseline: `case-53`'s fresh arms remain unusable, on the Bash route, for
the reasons recorded in its row.

### `case-43` was the premise, not the body (#72)

The ticket ordered the work: attribute the failure before repairing anything, because "a command
nobody can run is a command nobody proofreads" was a plausible enough explanation that it could not
be skipped. It was the right order — the explanation was correct.

**Staging the premise, and nothing else.** `environment.type: none` runs the agent against the real
host filesystem, and none of this case's premise was there: no `e2e/reports.api.har`, no spec, no
config, nothing on port 5199. #76 had just made staging possible, so the case gained
`context.repo_fixture: evals/files/project-har-replay` — a small reports console written in an
ordinary project voice, with a canonical two-entry HAR, a spec that reads
`process.env.PW_PROVE_HAR ?? "e2e/reports.api.har"`, and a `baseURL` on 5199. The prompt changed by
one clause, naming the working directory. Then six with-skill arms across two runs:

| | `har-scrub.mjs bind` named correctly |
|---|---|
| before, with nothing on disk (#63) | 0 of 3 |
| after, with the premise staged | **6 of 6** |

So the original 0/3 is a case-design defect, and the Step-7 bind instruction is not implicated. No
body change was made and **no version was bumped** — paying that toll would have recorded a repair
that measurement says did not happen, which is the failure #66 and #68 already recorded twice.

**A staged premise changes the question, though.** With a real repository in front of it the agent
*runs* the bind rather than emitting one, and two of the first three arms did exactly that — a
correct fix that this case, graded on the artifact, has to score as absent. That is the ticket's own
second repair: the prompt now asks for the commands and says the operator will run them. It is the
one change that had to come after the attribution, not with it, or a pass would attribute to nothing.

**Three judge defects surfaced behind each other, exactly as `b32`'s four did.** Each is the same
family — matching the wrong unit — and each now carries a fixture pair:

| # | The unit it got wrong | What it did to a correct answer |
|---|---|---|
| 1 | **fence vs. commitment** | the `PW_PROVE_HAR` export was required inside a fenced block, so an answer that emitted the bind and then wrote `PW_PROVE_HAR=$PWD/.pw-prove/reports.api.har` in the sentence beneath it failed for a line break |
| 2 | **this failure vs. another one** | "If a *particular* call aborts after this — as opposed to all of them — that one is a genuine recording miss and needs a re-record" is the skill's own rule about a different symptom; the judge read it as abandoning the recording |
| 3 | **shell quoting vs. the subcommand** | `node "$SB/scripts/har-scrub.mjs" bind …` — the correct invocation with the base in a variable — did not match `har-scrub\.mjs\s+bind`, because of the closing quote |

Defect 2 is the one to remember, because the obvious repair is wrong: excusing conditionals in
general (`if`) swallowed the committed must-FAIL fixture's own offender, "If that still aborts I will
remove notFound: 'abort'". The escape has to be as narrow as the rule it encodes — a **named single
entry**, not a conditional.

**Why the admitted 3/3 is not merely a re-judge.** Two runs of three with-skill arms were re-judged
against the final judge, which is legitimate and precedented (#66, #71) but is not the same evidence
as a run the judge scored as it went. So a third run was taken in-band against the final judge:
**3/3, both arms LOADED.** The `+1` rests on six skill-free baseline arms, all six certified by the
sweep, all six failing — the skill-free answers diagnose the origin mismatch correctly and then
hand-edit the HAR's origins, which is precisely the tool knowledge the case measures.

### `b32` was four defects, not one (#71)

Repairing the turn segmentation did not make the case green; it made the *next* wrong-unit defect
visible, and so on three more times. Each one was invisible while the one in front of it was firing,
which is why "fix the judge and re-run" had to be "fix, re-run, read the transcript, fix again". All
four are one family — a judge matching on the wrong unit — and all four now carry a fixture pair.

| # | The unit it got wrong | What it did to a correct answer |
|---|---|---|
| 1 | **block vs. turn** | `turns[0]` was the placement-line preamble, so turn 1 "never" said `inline` — 0/3 |
| 2 | **clause vs. actor** | the skill's own doc comment says "eleven sessions hit it and four agents worked around it by joining the two lines"; a correct answer quotes that history *to reject it*, and the judge read the citation as the plan — 2 of 3 iterations |
| 3 | **phrase vs. paraphrase** | `collapse (?:it )?onto one line` matched a one-word object only, so "either collapse each pair onto one line or brace the block" — verbatim the churn this case guards — scored the **skill-free** arm a PASS |
| 4 | **substring vs. verdict** | "If I ran something and told you it passed, I'd be inventing the result" matched on `passed`, so a baseline arm that explicitly *declined* to give a verdict was graded as reaching one |

Defects 3 and 4 are the ones worth remembering, because they ran the other way: they made the
BASELINE pass. Read literally, the admission rule would then have retired and deleted `b32` for zero
uplift — a case retired for a defect in its own judge. A near-zero uplift is now treated as a reason
to read the baseline transcript before acting on the number, not as a verdict on its own.

Two further scope errors were fixed inside the same judge, and both belong to the family: a refusal
binds its **clause**, not its sentence (`rather than guessing` was excusing a churn proposal three
clauses later), and a `would` that NEGATED excuses as rejection is a *commitment* when the subject is
the answerer (`I'd resolve that by … collapsing each pair onto one line`).

The sweep judge carried a fifth, of the same family and one level up — see
*A fingerprint the prompt supplied is not contact with the body* below.

### A fingerprint the prompt supplied is not contact with the body (#71)

`b32`'s first uplift run reported **BASELINE DIRTY** on an arm whose agent had said "there is no
`pw-prove` skill available", never opened a file, and reached nothing. The case prompt quotes
`if (process.env.PW_PROVE_CLIP) await page.waitForTimeout(2500);` verbatim to set the scene, and at
58 characters that is a fingerprint line of the body — so `skill-loaded.mjs` read the case handing
the model a line as the model having read the body. `skill-loaded.mjs`'s own comment had asserted the
opposite ("No case prompt does"), which had stopped being true.

It over-counts in both directions: the same line would have reported `skill-body` — LOADED — in an
arm that loaded nothing. The gate now discounts any fingerprint that appears in the case's own
prompt, and says how many it discounted. The discount is prompt prose only: a skill **injection**
also arrives as a `role: user` record (`isMeta`, `Base directory for this skill: …`, then the whole
body), and exempting that would blind the gate to the route contamination actually takes. The
existing `pass--body-injected-without-skill-tool` fixture went red the moment the first draft did
exempt it, which is the fixture set doing its job.

### `case-44` and `case-2` are unstable for a reason worth naming

`case-44`'s single failure fired on this sentence:

> **Carry it forward.** The variable has to be on the preview-server start too … Same for the Step-7
> mutation rebuild/restart.

That is correct behavior. `config-exit-names-the-key.mjs` reads the affirmative clause as reaching
for a rebuild-as-remedy. It is the bare-substring class of defect from the 2026-08-13 run arriving
positionally rather than lexically — the negation filter cannot see that "the Step-7 mutation
rebuild" is a *phase name*, not a proposed remedy.

`case-2`'s single failure is a NOT LOADED, the same frontmatter defect as #73 and #74 arriving
intermittently on a third phrasing. **Closed by #73/#74**: the same 2/3 reproduced on the repaired
fixtures, and the `description:` fix took it to 3/3. `case-44` is still open.

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
| `case-7-plan-notify-and-continue` | *"I present the scenarios … and **stop until you explicitly approve**."* | The case has two branches and that sentence is the **coverage-gap** answer. The PR-mode negatives ran over the whole reply. |
| `case-4-auth-ladder-exhausted-stops` | *"treating them as a real login is inventing a credential"* | A rejection carrying no `NEGATED` token at all — the refusal lives in the sentence's shape. |
| `case-16-pom-extend-not-duplicate` | ``## `/profile` — scaffold new, into the existing POM dir`` | `commitments()` strips inline code, so the row for the **uncovered** route arrived as a bare "scaffold new … POM". |
| `case-11-greenfield-bootstrap-pinned` | *"added with the repo's own package manager so it lands pinned"* | The judge demanded the literal `pnpm add -D` string from an answer the prompt asked to be a **plan**. |
| `case-24-proof-config-reused` | *"gets **no line** in the `Generated` block"* | A one-directional proximity window that could only see the omission stated *after* the word it anchored on. |
| `case-29-unit-proven-acs-folded` | *"Scenario 1: saved scripts arrive trimmed and pruned"* | The judge reads scenario **titles**; the fold it is looking for is a **table** fact two lines below. |

Five were repaired against the answers the run recorded — those six answers are now the must-PASS
twins, which is the README's own preference (*"prefer a real answer from a retained run transcript"*)
and is why the harness went from 139 checks to 214. Re-characterized, `case-7`, `case-11` and
`case-16` came back **3/3**, `case-4` and `case-24` **2/3**.

`case-29` was **not** repaired a third time, and that is the finding. Two rounds of tuning had already
landed on that judge; a third against the same three transcripts fits a judge to its fixtures rather
than to its rule. It is filed as **#77** with the evidence that decides it: all three iterations carry
`already covered: tests/unit/customScripts.test.ts` three times each, which is exactly what the rule
asks for.

**#77 decided it, and not with a phrase list.** The judge now parses the AC table: it finds the
Proven-by column by its header, looks each unit-proven behaviour up in the AC column, and reads the
verdict out of that row — a folded row says `already covered: <test file>`, an unfolded one names a
browser scenario. The three retained 2026-08-14 transcripts flip to PASS against it **offline**,
before any new run, and two of them are now must-PASS fixtures precisely because their wiring
scenario's title names the behaviour (*"saved scripts arrive trimmed and pruned"*, *"whitespace-padded
values save trimmed"*). Its must-FAIL twin is the mirror image: prose that says every right word —
names the test file, says "fold", writes `already covered: tests/unit/customScripts.test.ts` in a
sentence — over a table that buys one browser scenario per pure-function AC. The pre-#77 judge passed
that input, which is the measure of how little the titles were settling.

### #77: the baseline refused rather than folded wrongly

`case-29`'s `+1` is real — the arm was certified SKILL-FREE and it failed — but the reason it failed
is worth naming, because #71 found two defects that made a SKILL-FREE arm *pass* and a zero-uplift
reading is a claim about the instrument as much as about the case. The inverse holds too: an uplift
figure is only as good as the reason behind the red.

The baseline arm did not fold badly. It refused to answer at all:

> I'm deliberately not producing an AC table and scenario list from your prose description alone.
> That would be fabrication […] Inventing 23 assertions' worth of coverage findings from a summary
> would produce something that looks like verification but isn't.

`case-29` is a **behavior** case, so its prompt opens with the placement line and its premise is a
diff described in prose; strip the skill and the agent has neither the skill nor a repo, and it says
so. The judge's verdict — *"the answer produces no AC table with a Proven-by column"* — is therefore
accurate and not a phrase-matching artifact, but what it measures is that the arm produced no plan,
not that an unaided model folds the matrix wrongly. Read the `+1` as *this case goes red when the
skill is absent*, which is what the admission rule asks of it, and not as a claim about how a
skill-free Opus 5 handles unit-proven ACs. That claim would need a case whose premise survives the
skill being removed.

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

#### #76 resolved: what `context.files` actually is, and what the fix cost

**The contract, read out of skill-up's own source rather than inferred from the symptom.**
`internal/evaluator/fixtures.go`: `contextFilesUploader` iterates `caseCfg.Context.Files` as
`map[string]string` and calls `uploadContextFile(…, targetPath, content)` with the map's **value** as
`content`, which it writes to a temp file and uploads to `targetPath`. So `context.files` is
`{workspace_path: INLINE CONTENT}` **by design** — not a skill-up bug, and no amount of fixing the
right-hand side's spelling makes it read a file. `repoFixtureUploader` is the key that reads from
disk: `rt.UploadDir(fixtureSource, ".")` copies a directory's **contents** to the workspace **root**,
resolved against the skill directory. One `repo_fixture` per case; it runs before `context.files`, so
inline files stay available as per-case overrides on top of a staged repository.

**Six cases were staging their own paths, not two.** `case-1`, `case-2`, `case-3` and `case-4` carried
the same `p: p` shape as `case-22` and `case-23`. All six are migrated to `repo_fixture`, and the
prompts that said "the project in `evals/files/project-pom/`" now say the working directory, because
that is where `repo_fixture` puts it. Three of those are **trigger** cases whose prompts were edited:
the edit removes a path the run no longer creates and adds nothing that could trip the trigger, which
is the one kind of prompt edit the shape rule permits.

**The check is static, and it runs where the spend is.** `scripts/ci/test-case-shapes.sh` gained three
checks: a `context.files` value equal to its own key (or naming a file that exists on disk) is the
#76 defect; a `repo_fixture` must resolve to a directory; and a prompt may only name a fixture path
something actually stages there. `run-evals-isolated.sh` runs that script as a **pre-run gate** and
refuses rather than spend a run on a suite that would answer a different question. A runtime check
was considered and is not possible as things stand: skill-up retains transcripts and reports, not the
staged workspace, so no post-run sweep can see what the agent was handed.

**The re-characterization, n=3, both arms, every arm swept.**

| case | with skill | baseline | verdict |
|---|---|---|---|
| `case-22-viewport-deliberate-respected` | **3/3** | 0/2 certified skill-free (third arm BASELINE DIRTY, and it passed) | **admitted**, `+1` |
| `case-23-viewport-descriptor-pinned` | 2/3 | 0/3, all certified skill-free | **quarantined** |

`case-23`'s single miss is a real one: the answer resolved `pinned: 1600x900` and named the
descriptor, then never emitted the `test.use({ viewport })` line, so the pin lived nowhere. That is
the first reading this case has ever produced about the skill.

**`case-22` needed a judge repair before it could be read.** On the real fixture its first run came
back 1/3 — and the two reds resolved `deliberate: 1440x900` exactly right, failing on `PW_PROVE_CLIP=1`
and the proof config, which the case's own description calls "unchanged by this branch" and which its
dry twin `case-23`'s judge does not assert. Both checks are removed. A judge that grades three
behaviours makes a red verdict name none of them — the same lesson as `w01`'s single-phase scoping.

**The didactic-voice hazard (#69) was live before it was measured.**
`evals/files/project-viewport/playwright.config.ts` carried the comment *"pw-prove must respect this
and must NOT pin 1600x900 over it"* — the answer key, in the file, for the baseline arm to read. It is
the one fixture #76 made reachable, so it was rewritten to a comment a real project would carry (why
1440 is the supported breakpoint) before the measurement, and the two clean baseline arms failed. The
finding recorded under #69 stands for the rest of `evals/files/`: the comments come out before any
further wet case is built on them. The other two fixtures #76 made reachable were audited rather than
assumed — `project-pom` and `project-flat` carry no remedy-stating comment (`project-pom/src/routes.ts`
has one line about fake handler names, which states no answer), so nothing was changed there. The
`app-nuxt-ssr` and `app-vite-embed` comments #69 named are untouched: `w01` is admitted on a
measurement taken over them, and editing them re-opens that measurement.

**One route the deny rules cannot close showed up again.** `case-22`'s iteration-2 baseline read the
body by `bash` out of three host checkouts, and the previous run's baseline read it out of a
`$TMPDIR/skill-up-*` install a *previous* run had left behind. The runner now refuses to start while
such a leftover exists, naming the trees — deleting them is not a `rm -rf` it should perform unasked.
The checkout route stays open and stays the sweep's job.

### #75 is much wider than batch 1 measured: seven of eight baselines were not skill-free

Batch 1 found 3 of 10 baseline arms reading pw-prove's body off the host. Batch 2 ran
`skill-loaded.mjs` over every `without_skill` transcript with `$PWPROVE_SKILL_MD` pointed at this
repo's `SKILL.md`, exactly as #75's issue body documents, and found **7 of 8**:

| Case | Baseline verdict | Baseline result | Reading |
|---|---|---|---|
| `case-16-pom-extend-not-duplicate` | `LOADED via skill-tool` — the call errored, no body | **failed** | **`+1`, clean** |
| `case-11-greenfield-bootstrap-pinned` | `LOADED via skill-tool, skill-body` | **failed** | **`+1`** — a genuinely skill-free run has strictly less to work with and cannot do better, so the direction is safe and the reading is conservative rather than wrong |
| `case-5-publish-skip-accounted`, `case-7`, `case-8`, `case-12`, `case-17`, `case-20` | `LOADED via skill-tool, skill-body` | passed | **void.** The pass may be Opus 5's own capability or may be the body it just read, and this run cannot tell them apart |

Six 3/3 cases were therefore quarantined on a **void** uplift and not retired for zero uplift — the
distinction batch 1 drew for `case-28` and `case-48`, applied at six times the scale.

### #78: what the six void rows were actually worth

Re-measured on the sealed runner, the six split four ways, and the spread is the argument for having
quarantined rather than guessed:

| Case | Baseline verdict | Baseline result | Reading |
|---|---|---|---|
| `case-5-publish-skip-accounted`, `case-7`, `case-8`, `case-20` | `SKILL-FREE` | **failed** | **`+1`, clean → admitted** |
| `case-12-bringup-stop-report` | `SKILL-FREE` | failed, **and so did the with-skill arm** | **not measured** — no difference to read, the `case-30` reading |
| `case-17` | `SKILL-FREE` (third attempt) | **passed** | **zero uplift → retired, deleted** |

**Four of six admit, one retires, one cannot be read.** Had the batch-2 worker treated the dirty
baselines as direction-safe, `case-17` would have shipped as an active guard over Step 6's
PROVES-header audit and guarded nothing — the second time in two batches that rule would have
admitted a case Opus 5 answers unaided. Had they been retired for zero uplift instead, four working
guards would have gone.

`case-12`'s with-skill arm is the one result that moved against its own row: 3/3 at characterization,
failed here, on a verdict line that omitted the Step it stopped at. That is the batch-3 shape —
ordinary run-to-run variance in a single arm — and it leaves the case quarantined rather than
disqualified.

#### What the census could not see: a sibling agent's scratchpad

`case-17` took three attempts, and the first two are the fourth instance of the #75 pattern — the
deny rules held against everything the census had enumerated, and the agent found a copy the census
structurally *could not* enumerate:

1. **First attempt** (in the eight-case run). BASELINE DIRTY. The body came from two
   `/tmp/skill-up-<n>/` installs and from `~/work/e2e-skills/`, a checkout the census *had* found and
   denied — so that half arrived through Bash, which no deny rule closes.
2. **Second attempt**, with the stale `/tmp/skill-up-<n>/` installs removed first. Dirty again, and
   this time the paths named the defect: **another agent's scratchpad**
   (`/tmp/<runner>/<project>/<session>/scratchpad/<clone>/plugins/e2e-skills/skills/pw-prove/`).
   `$TMPDIR` was a census root and had been since #75, but `skill_copies()` searched it at
   `-maxdepth 9` and that path is **eleven** components deep. The census reported itself complete and
   was not.
3. **Third attempt**, at `-maxdepth 14`: SKILL-FREE, and the baseline **passed** → zero uplift.

The limit is now 14, and the self-test pins a copy nested at a sibling-scratchpad's depth so the
number cannot quietly go back down. The same sweep of `$HOME` and `$TMPDIR` takes under a second, so
9 was never buying anything it was costing correctness for. Read it the way #75 asks: **the census is
a reduction and the sweep is the assertion.** Every one of these three attempts was the sweep
refusing to certify a baseline the deny list believed was clean.

A standing consequence worth naming: this machine runs several agents against copies of this
repository at once, so **a concurrent worker's scratchpad is a live contamination source** that no
census run before the sibling's checkout exists can cover. `case-11`'s first baseline reached the
marketplace plugin cache the same way — through Bash, against a path that was denied.

### #73/#74: the trigger defect was intermittent, not absolute

Both tickets were filed on a **0/3 NOT LOADED**, and neither figure survived contact with a working
instrument. #76 established that `case-1`, `case-2` and `case-3` had been staging files whose entire
content was their own path, so the recorded 0/3 and 2/3 were measured through **two** defects at
once. Re-measured on the repaired fixtures and the **unchanged** `description:`, at n=3 on the
isolated runner:

| Case | Filed as | Re-measured, `description:` unchanged | After the fix |
|---|:--:|:--:|:--:|
| `gate-skill-loaded` | 3/3 | **3/3** | **3/3** |
| `case-1-coverage-request-triggers` | 0/3 | **1/3** | **3/3** |
| `case-2-test-plan-request-triggers` | 2/3 | **2/3** | **3/3** |
| `case-3-flat-spec-coverage-triggers` | 0/3 | **1/3** | **3/3** |

So the ticket's finding stands and its severity does not: a coverage-gap request *sometimes* loaded
pw-prove, which is worse to reason about than never loading it, and is exactly the shape a single
iteration cannot see. **Establish the current rate before acting on a recorded one** — a number in a
ticket is a measurement of the instrument that took it.

The fix is one clause appended to `description:`, naming coverage-gap mode in the words a user asks
for it in — coverage analysis, coverage gaps, untested pages and flows, a test plan for a page or
route — with the prove-a-change sentences left byte-identical. Both directions were measured in the
same run: the three coverage phrasings went to 3/3 **and** `gate-skill-loaded` stayed 3/3, so
nothing was traded. `metadata.version` moved `0.15.2` → `0.16.0`.

**What is now guarded, and what is not.** These three cases guard the **frontmatter's coverage-gap
clause** — the trigger surface, the same thing `gate-skill-loaded` guards for the prove-a-change
clause. They do **not** guard Step 2 › *Coverage-gap mode* itself: an active trigger case asserts
loading and nothing else, so the 27 mined content assertions `case-1`/`case-3` carry and the 12
`case-2` carries stay unmeasured. That is #74's fifth acceptance criterion, decided: grading them
needs a second, **behavior**-shaped case per section, not a second judge on a trigger case, and that
case does not exist yet. The gap table below still lists both sections as unguarded for that reason.

**One adjacent risk, since acted on by #81 — and the arm now exists.** `e2e-reviewer`'s own
`description:` also listed "coverage gaps" among its triggers and meant something different by it:
the quality of the specs that exist, not the routes that have none. Nothing here could measure that,
because every arm in `eval.yaml` installs pw-prove alone. #81 built the arm that can — a second suite,
`evals/eval.collision.yaml`, identical to this one except that its `skills:` list installs **both**
bodies — and settled the ownership: **an untested-routes request is pw-prove's, a spec-quality
request is e2e-reviewer's, and the bare phrase "coverage gaps" is pw-prove's.** Both descriptions now
say so and each names the other as the neighbour case (`pw-prove` 0.17.0 → 0.18.0, `e2e-reviewer`
1.9.0 → 1.10.0). What that arm measured is below, and the headline is that it did not find what it
was built to find.

### the collision was in the text, not in the behaviour

Three trigger prompts, none naming a skill, run with both skills installed, judged on **which** skill
the request reached: an untested-routes audit, a spec-quality review, and the bare unqualified phrase
*"find the coverage gaps in our E2E tests"* over a fixture where either reading is real work. On the
**unchanged** descriptions — the collided ones — all three came back 3/3, each request reaching
exactly one skill and the right one. On the repaired descriptions, 9/9. The before/after is flat.

So the honest statement of this ticket's result is: **the two `description:` fields did overlap in
their words, and the host did not route on the overlap.** The repair removes a claim `e2e-reviewer`
cannot honour and gives each skill a neighbour pointer; it is a durability change, and it was not
observed to fix a live misrouting. Anyone reading this later should not cite #81 as evidence that
description collisions do not matter — three phrasings at n=3 on one model is what was measured, and
the three that were measured are the three named above.

The instrument's red is real even though no run produced one. `routes-to-pw-prove.mjs` and
`routes-to-e2e-reviewer.mjs` each carry a must-FAIL fixture for **COLLISION** (both skills reached
the model, exit 4) and for **WRONG OWNER** (only the neighbour did, exit 3), checked at the process
boundary by `scripts/ci/test-eval-judges.sh`. A judge that cannot go red proves nothing; these can,
and the fixtures are where that is shown.

### the isolation seal denied the run its own second skill

The first attempt at the arm measured nothing, and the reason is worth keeping. `e2e-reviewer` was
invoked by the agent and came back `Skill execution blocked by permission rules` — from the runner's
**own** deny rules. #83 writes one `Skill(<plugin-id>:*)` rule per installed plugin, this host has a
marketplace plugin whose id is `e2e`, and that id is a **prefix** of the skill name `e2e-reviewer`.
Measured both ways in an isolated home against the live runtime: with `Skill(e2e:*)` present the bare
`e2e-reviewer` call is blocked; with it replaced by the enumerated `Skill(e2e:e2e-reviewer)`,
`Skill(e2e:pw-prove)`, `Skill(e2e:playwright-debugger)` the same call is served. Invisible for the
whole life of the single-skill suite, because nothing else this runner installs is named after a
plugin id.

`skill_deny_rules` now denies a colliding namespace **skill by skill**, enumerated from the plugin's
own install, and leaves every non-colliding namespace on the wide rule — so `eval.yaml`'s rule set is
byte-identical to what every earlier measurement carried. The suite says which skills it installs;
the runner reads that from the suite rather than being told.

### #98 re-derived `case-20`, and split `case-52` rather than widening it

The context gate (ADR 0019) retired `case-20`'s entire premise. The old case asserted the *opposite*
behaviour — recommend a fresh session once, then **continue inline** when the user declines or does
not answer — so it would have gone red against the new body for the right reason and been read as a
regression. Its id, title, prompt, judge and fixture pair were all re-derived
(`case-20-fresh-context-recommended-once` → `case-20-heavy-session-refused`,
`fresh-context-recommended-once.mjs` → `heavy-session-refused.mjs`), and its digest re-stamped after
the judge was re-read against the new prompt.

**Its row keeps its old numbers and is marked `re-characterization owed`.** A 3/3 measured against a
retired premise is not evidence about the new one, and the honest options were to quarantine it or to
say so out loud. It stays active and labelled, because the alternative leaves the gate — the change
with the widest blast radius in #98 — guarded by nothing at all while the label makes the debt
visible. Re-characterize before trusting the row.

Three other active cases were in the blast radius and needed less:

- `case-28` and `case-60` moved only their `step:` labels and one clause of prompt each, because Step
  7 now runs twice: the hermetic audit reads the **audit run**, and the `--workers` question is about
  the **filming run**. Neither judge lost or gained an assertion; both digests were re-stamped.
- `case-34` and `case-37` needed **nothing**. Both were checked assertion by assertion: the filming
  law is unchanged, and the clip-inspection diagnosis table only gained a row. A case that does not
  need editing is worth recording as checked, or the next reader re-derives the same conclusion.

### a judge is copied alone

Six agent runs were spent before any of the above on a judge that could not start: the routing core
lived in `judges/lib/skill-routing.mjs` and each judge imported it. skill-up copies **the judge file
and nothing else** to a temp directory before running it, so the import resolved to nothing and every
case failed with `ERR_MODULE_NOT_FOUND` — a red that says nothing about the skill. `judges/README.md`
already said this; the core is now duplicated verbatim into both judges, with
`scripts/ci/test-eval-judges.sh` comparing the copies, exactly as it does for `offenders()` and the
wet judges' workspace preamble.

## Authored, not yet characterized

A case authored alongside a body change, before any run has scored it. It is on disk with a judge and
a fixture pair, and it is **not** in `eval.yaml`: the admission rule is evidence, and this row has
none yet. Characterize it (3 iterations + an uplift measurement) before adding it to the active list,
and move the row into the batch table above with its numbers when you do.

| Case | Shape | Guards (SKILL.md section) | Pass rate | Uplift | Status |
|---|---|---|:--:|:--:|---|
| `b06-profile-contradicted-written-back` | behavior | Step 1 › *Runtime profile* › **the write-back** — a contradicted entry is rewritten in `.pw-prove/profile.md`, not merely reported | not run | not measured | quarantined — uncharacterized (authored with the write loop) |
| `case-62-mutation-revert-marks-stale` | behavior | Step 7 › *Mutation check* — step 4, the revert marks the artifact **stale** and the rebuild is lazy (ADR 0020) | not run | not measured | quarantined — uncharacterized (authored with #98's lazy rebuild) |

Why this rule and not another part of the write loop: the `CONTRADICTED` Assumptions line predates
the write half, so the report-only answer is the one that looks complete. That is where the loop
erodes back into a read-only feature, and it is judgeable from a final message — which is why no wet
case was authored for the write (`w02`'s unstable uplift is what a second wet case would cost).

`case-62` is the guard for the half of #98's change that `case-52` deliberately does **not** cover.
`case-52` keeps its scope — a legitimate reuse is accepted, and the mutation forces its own
`BUILD_REUSE=never` rebuild, both unchanged — and lost only the sentence asserting the *post-revert*
rebuild that #98 made lazy. Splitting rather than widening kept `case-52`'s recorded 2026-08-14
must-PASS fixture valid: that fixture is evidence of a real answer under the old body, and editing it
to match a new rule would be falsifying the record it exists to be.

## Coverage gaps this table exposes

The point of the section column is that an empty one is visible. After batch 1, #75, batch 2 and
batch 3, **no active case guards** any of the following.

**Batch 3 closed four of these holes**, and struck them from the table below rather than leaving
them with a footnote:

- **Step 6 › *Clip-fidelity audit*** — batch 1 called this "the largest hole batch 1 leaves": three
  case files and no guard at all. Now guarded by `case-34` (the filming law), `case-35` (exit 2
  blocks Step 7) and `case-37` (the illegible clip is diagnosed, fixed ungated, re-audited and
  re-filmed once), with `case-38` covering the frame extract's exit-6 skip. All 3/3, all `+1`.
- **Step 7 › *Mutation check* — artifact isolation** — the table named `case-52` as batch-3 material
  for exactly this, and it landed: 3/3, `+1`, covering `--output=/tmp/pw-prove-mutation`, the forced
  `BUILD_REUSE=never` rebuild and the revert. The `#67`-edited line in this section now has an
  instrument that could see a regression in it.
- **Step 7 › *Failure handling* — the inherited `webServer`** — opened by batch 2 retiring `case-32`,
  and called "the cheapest one on this table to close". `case-45` closes it at 3/3 with a clean `+1`.
- **Step 4 › *Effective viewport* — the `deliberate:` branch** — `case-36` is the **dry** twin of
  the rule and is 3/3 with a clean `+1`. `case-22` and `case-23` were void under #76 when batch 3
  ran; #76 has since landed and `case-22` joins `case-36` on the same branch — same rule, but its
  premise is a config read off disk rather than stated in the prompt (3/3, `+1`). The `pinned:` branch is still unguarded and stays on the table — `case-23` came back
  **2/3** on the real fixture, which quarantines it.

**Batch 3 opened one new gap**, and only at the very end: retiring `case-51` for a re-measured zero
uplift left Step 3 › `SERVE_CAUSE=no-announcement` unguarded. It is in the table below. Every other
section batch 3 touched gained a guard rather than losing one.

**#78 closed three more of these holes and opened one**, by doing nothing to the cases except
measuring them on an instrument that works:

- **Step 8 › *Hygiene sweep* + the report invariant** — batch 1 named it, batch 2 reached it and
  could not read it. Now guarded **twice**: `case-8` (the sweep and the completion-report invariant)
  and `case-5` (the `Proof page: skipped` accounting), both 3/3, both `+1` clean.
- **Step 4 › *notify-and-continue / approval gate*** — `case-7`, 3/3, `+1` clean.
- **Step 1 › *Mode* — the heavy-session recommendation** — `case-20`, 3/3, `+1` clean.
- **Step 6 › *PROVES-header audit* stays open, and is now open for the opposite reason.** It was
  blocked on an unreadable measurement; the measurement came back and `case-17` retired at zero
  uplift. That is the gap table working: a hole that a broken instrument was hiding turned out to be
  a hole a working guard could not have filled.

| SKILL.md section | Guarded by | Why it is not covered |
|---|---|---|
| Step 2 › *Coverage-gap mode (no argument)* | nothing (**the body**; its trigger is guarded) | `case-1` and `case-3` are active at 3/3 since #73/#74, but they are **trigger** cases: they prove a coverage request reaches this mode, not that the mode behaves. Their 27 mined content assertions stay unmeasured — an **active trigger case asserts loading and nothing else**, so grading them needs a second, behavior-shaped case rather than a second judge. That case is the concrete next step here. |
| Step 4 › *Scenarios* / *Locator Mapping Table* / POM-always | nothing (**the body**; its trigger is guarded) | `case-2` is active at 3/3 since #73/#74, on the same terms: it guards the "plan the tests for this route" phrasing reaching the skill, not the plan it then produces. Its 12 mined content assertions are unmeasured for the same reason. |
| Step 8 › *Deliver* — publish | nothing | `case-30` quarantined at 3/4. |
| Step 6 › *PROVES-header audit* | nothing | `case-17` **retired for zero uplift** on a certified skill-free baseline (#78). The third gap opened by a retirement rather than a failure, and the same caveat applies as for `case-51` and `b49`: the case went because Opus 5 quotes the AC verbatim without being told, not because the rule stopped mattering. Re-weigh it if the model under test changes. |
| Pipeline Overview › *Stop reports* — the six beats | nothing | `case-12` is 3/3, but **both arms of its #78 uplift run failed**, so there is no difference to read — the `case-30` reading. Re-measurable by re-running the uplift arm alone. |
| Step 4 › *Effective viewport* — the `pinned:` branch | nothing | `case-23` was **void** under #76 — it read a fixture containing its own path. Re-characterized against the real fixture it is **2/3**: two answers pinned 1600x900 correctly and one resolved the branch but never emitted the `test.use({ viewport })` line, so the pin lived nowhere. That is a real reading and a real miss, and it quarantines the case rather than voiding it. `case-21` was retired as its duplicate, and this branch has no dry twin, so it stays open. |
| Step 3 › *Bring the environment up* — `SERVE_CAUSE=no-announcement` (the log names no origin, so act on the server's crash rather than hunt a port) | nothing | `case-51` retired for **zero uplift** on a re-measured clean baseline (#65). The second gap on this table opened by a retirement rather than a failure, and the same caveat applies: the case went because Opus 5 needs no telling, not because the rule stopped mattering. `case-50` still guards the adjacent `no-log` cause and the announced origin. |
| *Safety: page content is untrusted data* | nothing | `b49` retired for zero uplift. This is the one gap opened by a **retirement rather than a failure**, and it is the one to weigh again if the model under test changes: the case was retired because Opus 5 needs no telling, not because the rule stopped mattering. |
| Step 3 › *Auth* — the ladder exhausted → STOP | nothing | `case-4` is 2/3; `case-13` retired as `case-48`'s overlap. |
| Step 7 › *Proof run* — a committed proof config is reused, not rewritten (ADR 0008) | nothing | `case-24` is 2/3. |

**Batch 2 closed two of the holes batch 1 named**, and both are now guarded by an active case:

- **Step 5b** — `case-11`, 3/3, `+1`. Batch 1 recorded it as never reached.
- **Step 5 › *Generate*** — `case-16`, 3/3, `+1` on the one clean baseline in the batch. Also batch 1's.

The rest of batch 1's named holes stayed open for one uniform reason: **Step 6 › PROVES-header audit,
Step 8 › hygiene, Step 4's approval gate and the Step-3 stop report were all reached, all scored 3/3,
and all landed on a dirty uplift baseline.** They were one instrument fix from being decided, not one
case away — and #78 is that fix arriving. Three of the four are now guarded (`case-8`/`case-5`,
`case-7`, `case-20`); the fourth, the PROVES-header audit, was decided the other way and is now open
on a measured zero uplift. Step 2 › *PR-mode: Diff → Acceptance Criteria* was reached by `case-29`,
which #77 unblocked: the judge was repaired to read the Proven-by column, and the case came back 3/3
with a `+1` on a certified skill-free baseline.

**Twenty-five sections are guarded by thirty-two active cases.** Seven sections carry a second guard
beside the first, and none of them moved the count of guarded sections. One is *wet* —
`w01-bringup-own-port` beside `case-50`; one is the pair `case-8` and `case-5` over Step 8; one is
`case-22` beside `case-36` over the `deliberate:` viewport branch, a fixture-staging case beside its
dry twin; one is `b32-dwell-inline` beside `case-35` over the Step-6 clip-fidelity audit (#71); and
three are `case-1`, `case-2` and `case-3` beside `gate-skill-loaded` on the frontmatter (#73/#74) — a
second, third and fourth request shape over one trigger surface. That is deliberate: a
second case on a section already covered is a second axis, not new
coverage, and reading it as new coverage would shrink the gap table without closing anything in it.
**The count did not move for #73/#74 for exactly that reason**, even though the suite grew by three.

1. the frontmatter `description:` trigger surface — `gate-skill-loaded` for the prove-a-change
   clause, and `case-1`, `case-2`, `case-3` for the coverage-gap clause it gained in #73/#74
2. Step 1 › *Confirmation gate* — `b01-confirmation-gate`
3. Step 4 › *Assumptions* › the Handoff line — `b05-handoff-stale`
4. Step 3 › *Recon — the probe is the question channel* — `case-15`
5. Step 3 › *Bring the environment up* — the announced origin — `case-50`, and bullet 1's hard-coded packaged port — `w01-bringup-own-port` (wet)
6. Step 7 › *Verify* — the proof-run command — `case-60`
7. Step 7 › *Hermetic audit* — `case-28`
8. Step 3 › *Auth — drive the app's OWN entry* — `case-48`. The wet second axis on this section, `w02-auth-cookie-from-app`, is quarantined, so the emitted auth artifact is guarded by nothing
9. Step 5b › *Bootstrap the runner if greenfield* — `case-11`
10. Step 5 › *Generate* — *Extend, don't duplicate* — `case-16`

Batch 3 added ten, and they cluster where the earlier batches were thinnest — Step 6 and Step 7:

11. Step 5 › *HAR-first mocking* — a recon pass that produced no HAR — `case-33`
12. `code-rules.md` § *Clip Fidelity* — the filming law — `case-34`
13. Step 6 › *Clip-fidelity audit* — `spec` exit 2 blocks Step 7 — `case-35`, with `b32-dwell-inline` (#71) as the second axis on the same section: `case-35` guards the gate's exit code, `b32` guards the authoring shape the gate checks for — the dwell inline in each `test()` body rather than hoisted into a helper
14. Step 4 › *Effective viewport* — the `deliberate:` branch — `case-36`, with `case-22` (#76) as the second axis on the same section: `case-36` states the premise in prose, `case-22` stages the config as a repo fixture and must read the `viewport:` key off disk
15. Step 7 › the clip inspection — diagnose, fix, re-film once — `case-37`
16. Step 7 › the frame extract — exit 6 is a skip — `case-38`
17. Step 7 › *Proof run* — the inherited `webServer` (ADR 0008) — `case-45`
18. Step 7 › *Failure handling* — the no-progress checkpoint — `case-46`
19. Step 3 › build reuse **and** Step 7 › *Mutation check* artifact isolation — `case-52`
20. Step 4 › *Recon* — a string `expression` is evaluated, not called — `case-57`

#78 added three more sections and a fourth guard, all from batch 2's re-measured rows:

21. Step 8 › *Hygiene sweep* + the completion-report invariant — `case-8`, with `case-5` as the second axis on the same section (the `Proof page: skipped` accounting when the publish credential is refused)
22. Step 4 › *notify-and-continue (PR-mode) / approval gate (coverage-gap)* — `case-7`
23. Step 1 › *Mode* — the heavy-session recommendation — `case-20`

#72 and #77 added two more, and neither was written as a new case — one staged a premise its case had
always asserted and never had, the other repaired an instrument. Both sections had been guarded by
the skill's behaviour all along; only the measurement was missing:

24. Step 7 › *Verify* — item 1b, the HAR is bound to this run (Step 5 › *HAR-first mocking*) — `case-43`
25. Step 2 › *6. Fold ACs the diff already proves cheaper* — `case-29`. It was 0/3 for three runs on
    a judge that matched scenario **titles**; the section was never unguarded by the skill's doing.

Two adjacencies worth stating, because both look like double coverage:

- **`case-15` and `case-57` both sit in Step 3/4 recon.** `case-15` guards the channel (the probe
  asks, the test run validates — never a throwaway spec); `case-57` guards the probe's `eval`
  grammar. `case-53` and `case-58` would have been the third and fourth here and are both
  quarantined, so the section is guarded twice rather than four times.

## `case-64` — the keep side of the `webServer` boundary, filed unmeasured

`case-64-proof-config-keeps-target-building-webserver` is the sibling of `case-45`, added by #116
when the "drop the inherited `webServer`" rule gained its boundary. `case-45` measures the drop side
and stays exactly as it was, at **3/3** with a clean `+1`; nothing about it was re-derived, and its
`derived_from_prompt` digest is unchanged. `case-64` measures the other side: an inherited entry that
builds and boots the [proof target](../../../CONTEXT.md#proof-target), answering at the origin the
proof runs against, is kept rather than suppressed.

**It is on disk and deliberately absent from `eval.yaml`.** Admission needs a characterization run —
three iterations plus an uplift measured with the skill installed and removed — and that is a paid
run this change did not buy. Adding it to the active list on the strength of `case-45`'s numbers is
exactly the move this registry exists to refuse: `case-45` measures a different branch of the rule
against a different fixture, so its pass rate says nothing about this one.

Its judge, `judges/proof-config-keeps-target-building-webserver.mjs`, is covered by
`scripts/ci/test-eval-judges.sh` today, with both fixture halves — a must-FAIL that adds
`webServer: undefined` anyway, and a must-PASS that names the suppression **in order to remove it**.
The judge scores the token on the verb that governs it rather than on sentence-level negation,
because the forbidden thing here is a token an answer writes inline and a sentence like *"a proof run
must not boot its own server, so I add `webServer: undefined`"* carries a negation that has nothing
to do with it. That is the bare-substring defect in its keep-side form, and both fixtures are what
catch it.
