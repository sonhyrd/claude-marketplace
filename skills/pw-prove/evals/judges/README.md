# Judges

One script per **triaged** case, active or quarantined. `evals/cases/<id>.yaml` names it as
`judge.script_path`, and `scripts/ci/test-eval-judges.sh` covers it with a fixture pair in
`fixtures/<judge>/`.

There are more judges here than there are active cases, and that is deliberate. A case cannot be
characterized without a judge, and a quarantined case keeps the judge it was measured on — its
pass rate in `REGISTRY.md` is only re-readable if the instrument that produced it still exists.
Batch 3 (#65) wrote twenty-one judges for twenty-one cases and eleven of those cases were admitted;
the other ten keep theirs against the ticket that will decide them.

**A judge is copied to a temp directory alone, so it cannot import a sibling.** skill-up copies the
single `.mjs` and runs it from `/tmp/skill-up-judge-*/`; a relative import of `./lib/x.mjs` resolves
to nothing and every case in the run dies with `ERR_MODULE_NOT_FOUND` — a red that says nothing about
the skill, and one #81 paid six agent runs to rediscover. Shared code is therefore **duplicated
verbatim** and the copies are compared by `scripts/ci/test-eval-judges.sh`: `commitments()`/
`offenders()` across the judgment-call judges, the workspace preamble across the wet judges, and the
routing core (between the `// >>> routing core` markers) across `routes-to-pw-prove.mjs` and
`routes-to-e2e-reviewer.mjs`. Edit one copy and the suite names the other.

**These are not shipped.** `evals/` is eval-engine material — it is excluded from the skill's
`include:` list and does not trigger the `Skill version bump` check. It is still zero-dependency ESM
Node, for the same reason everything else here is: no build step, no install, `node <path>.mjs`.

## Why every judge is a script

Until #59 every active case used `failure: output_contains` with a bare substring. That rule fires
when the model names the forbidden thing **in order to reject it**, and it produced seven of the nine
failures in the 2026-08-13 run — `b32` failed on the phrase "nothing to reformat", `b49` failed while
correctly refusing a prompt injection, because the refusal quoted the injection.

A negative assertion over discursive output is therefore **positional, not lexical**, and there is no
rule_based form of that. Four shapes carry it:

**Artifact-shaped** — the case is answered with a command or a config block, so the judge extracts
the fenced block and asserts on that block alone. Prose is out of scope by construction. The fenced
block's language tag matters: a ```` ```bash ```` block is the answer *running* something, a
```` ```ts ```` block quoting the suggestion it refuses is not. `no-workers-in-command.mjs` is the
original of this shape; `no-throwaway-recon-spec`, `hermetic-audit-not-hand-parsed`,
`publish-url-from-marker`, `har-bound-not-rerecorded` and `dev-guarded-rung-skipped` follow it.

**Judgment-call** — the case is answered in prose, so the judge anchors on the decision sentence.
Three filters do that work, and all three appear verbatim in each such judge:

- `commitments()` drops fenced blocks, block quotes, inline code and quoted spans. What is left is
  what the answer commits to, rather than what it was handed or what it is quoting back.
- `NEGATED` skips any sentence carrying a negation. A forbidden option named inside "I do not fold
  its findings" is the answer rejecting it.
- `offenders()` carries a rejecting **header** onto the list beneath it. "What I explicitly do
  **not** do:" over bare items ("Re-allocate a fresh free port and restart.") keeps the negation in
  the header alone, so judging each item on its own is the same defect one layer down — it failed a
  recorded 2026-08-14 `case-50` answer that was right in every particular (#66). A non-item line
  re-decides the scope; a blank line does not end a list. `REJECTION_HEADER` is **narrower** than
  `NEGATED` and inverts its bias on purpose: `NEGATED` excuses one sentence, a header excuses every
  item under it, so an incidental negation ("Nothing answers on 3000, so here is the plan:") must not
  open the scope.

**Table-shaped** — the rule the case guards is settled by a **table** the answer emits, so the judge
parses that table and decides on a row. `unit-proven-acs-folded.mjs` is the only one, and *A fold is
a table fact, not a sentence fact* below says what it reads and why it asserts nothing about the
prose around it. It carries neither `commitments()`/`offenders()` nor the workspace preamble: those
filters exist to find the decision sentence, and this shape has no decision sentence to find.

**Workspace-shaped** — the case is [wet](../../../../CONTEXT.md#wet-case), so the answer is not the
evidence: the run's own artifacts are. A workspace judge reads files out of the case workspace and
asserts on them. `served-on-allocated-port.mjs` reads the `serve.log` a real preview server wrote and
the summary `preflight.mjs serve` printed; `auth-code-drives-app-entry.mjs` reads the
`tests/e2e/auth.setup.ts` the run left on disk. Three rules keep them honest:

- **The workspace root is the judge's cwd** — skill-up runs a `script` judge in the case workspace —
  and `$PWPROVE_JUDGE_ROOT` overrides it. That override is how the fixtures work: a `<slug>.env`
  points the judge at a recorded workspace under `fixtures/<judge>/ws-<slug>/`, since the harness
  runs from the repo root.
- **An absent input is still never a pass.** The artifacts are the evidence, but `$EVAL_FINAL_MESSAGE`
  or `$EVAL_TRANSCRIPT_PATH` is the proof there was a run at all, so a workspace judge refuses when
  it has neither.
- **Every must-FAIL workspace holds one defect and nothing else.** The `assumptions.md` in the
  `auth-code-drives-app-entry` fixtures is byte-identical across four `ws-*` directories on purpose:
  only the emitted code differs, so a red verdict names the code rather than whichever of two files
  the judge happened to read first. `ws-token-rung-attempted` therefore carries a correct
  `assumptions.md` beside code that contradicts it, which is the point.
- **The negative checks read code with its comments stripped.** The #59 defect arrives in a source
  file as a comment: a correct `auth.setup.ts` names `?token=` and `localStorage.setItem` to say why
  it took neither. Its must-PASS fixture is exactly that file.

The bias is deliberate and one-directional: `NEGATED` is broad (it includes a bare `no`), so a
borderline sentence is read as a rejection. A judge that lets one sloppy wrong answer through costs a
missed finding; a judge that red-flags correct answers costs the suite its credibility, which is what
this repair is paying back. Write must-FAIL fixtures as plain affirmative commitments.

The code is duplicated across judges rather than shared through an import, and must stay that way:
skill-up copies a judge to a temp directory before running it in band, so a relative import of a
sibling module resolves to nothing. The harness therefore compares the copies to each other — the
`commitments()`/`offenders()` **code** must be one text across every judgment-call judge, so a rule
repaired in one is repaired in all. Comments are excluded, and so is `NEGATED`: its tail is per-case
vocabulary (`irrelevant` in the exit-4 judge, `already` in the dwell judge), and one text there would
force a judge to carry words its case never uses.

The **workspace preamble** — the refusal on an absent input, `$PWPROVE_JUDGE_ROOT` or cwd, the
`read()` helper — is duplicated across the wet judges for the same reason and held to the same rule:
`test-eval-judges.sh` compares those copies too. Unpoliced duplication is how one copy quietly keeps
an older rule.

## Fixtures

Every judge needs both halves, and the harness fails a judge that carries only one:

```
fixtures/<judge>/pass--<slug>.txt      must exit 0     (or .jsonl, fed as $EVAL_TRANSCRIPT_PATH)
fixtures/<judge>/fail--<slug>.txt      must exit non-zero
fixtures/<judge>/<slug>.expect         optional: substrings the verdict must name
fixtures/<judge>/<slug>.env            optional: env for this fixture only ($EVAL_FIXTURE_DIR is set)
fixtures/<judge>/ws-<slug>/            a workspace judge's recorded artifacts, reached via that .env
```

The must-PASS fixture is the load-bearing one: it has to be **a correct answer that names the
forbidden thing in order to reject it**. That is the one-hit-one-JUSTIFIED-twin rule from
`tests/pattern-corpus/` applied to judges, and it is the only fixture that can see the defect this
whole directory was rewritten for. Prefer a real answer from a retained run transcript where one
exists; the fixtures added in #59 are hand-authored against the phrasings the 2026-08-13 run
recorded, because that run's workspace was not retained.

**Hand-authored fixtures are tidier than real data, and that tidiness hides defects.** Every
`skill-loaded` transcript fixture was written with `t1`-shaped tool ids; a real one is 30 characters
(`toolu_01EngPMVf8ECsBeRkp4DaUD3`), which was long enough to defeat that judge's refusal discount and
fail a whole baseline run (#69). A real Claude Code record also mirrors its tool result at the record
level in `toolUseResult`, which no hand-authored fixture had. When you copy a shape from a run, copy
its scaffolding too.

Run the harness by name — it is deliberately **not** in `ci-local.sh`:

```bash
bash scripts/ci/test-eval-judges.sh
```

## Two inputs

skill-up hands a script judge the model's final message in `$EVAL_FINAL_MESSAGE` and, under
`environment.type: none`, the serialized session transcript in `$EVAL_TRANSCRIPT_PATH`. A `.txt`
fixture is fed as the former and a `.jsonl` fixture as the latter, with the other unset, so a judge
cannot coast on the input it was not given. `skill-loaded.mjs` and `dwell-inline-per-test.mjs` read
the transcript — the latter because its case has two turns and the final message carries only the
last one.

An absent input is never a pass. skill-up only *warns* when it has no transcript to hand over, so a
judge that shrugged there would report a vacuous pass on every case in the run.

### A turn is a conversation turn, never an assistant block

A judge that numbers turns must group **every assistant block between two user prompts** and judge
the joined text — by the `turn` field where skill-up's serialization carries one, otherwise by the
count of user prompts seen. A record with `role: "user"` whose content is a `tool_result` is not a
user prompt and must not open a turn.

The reason is #60: every behavior case now opens with a placement line, so the agent's first
assistant block is routinely a one-line preamble ("I'll load the skill first.") emitted before it
calls the Skill tool, with the substantive answer in a later block of the *same* turn. Indexing
blocks reads that preamble as turn 1. That is what made `b32-dwell-inline` score 0/3 in the
2026-08-14 run on three answers that were correct in every particular (#71) — the sixth appearance
of one defect, a judge matching on the wrong unit: lexical (#59), positional (#63), under a list
header (#66), across a hard line wrap (#64), title-versus-body (#77), block-versus-turn (#71).

Audited at #71, and the standing inventory — every judge that touches `$EVAL_TRANSCRIPT_PATH`:

| Judge | What it treats as its unit | Verdict |
|---|---|---|
| `dwell-inline-per-test.mjs` | turn 1 and the last turn, grouped by `turn` field / user-prompt count | fixed at #71; was `turns[0]`/`turns[n-1]` over assistant blocks |
| `skill-loaded.mjs` | the whole transcript — every string and tool record, no index | not affected |
| `routes-to-pw-prove.mjs` | the whole transcript, per skill: served Skill calls and body fingerprints | not affected |
| `routes-to-e2e-reviewer.mjs` | the same, with owner and neighbour swapped | not affected |
| `auth-code-drives-app-entry.mjs` | workspace artifacts; the transcript is only proof a run happened | not affected |
| `served-on-allocated-port.mjs` | workspace artifacts; same existence check | not affected |

Every other judge reads `$EVAL_FINAL_MESSAGE` alone, which is one turn by construction and cannot
carry this defect. A judge that grows a second turn joins the table above — and a judge whose unit is
smaller than its whole input joins one of the two inventories: this one for transcript judges, the
one under *A fold is a table fact* for the judge that decides on a table row.

### A fold is a table fact, not a sentence fact

Some rules are settled by a **table**, and for those the unit is a row — the seventh appearance of
the same family, and the one where the forbidden string is the correct answer's own subject rather
than a rejection of it (#77). SKILL.md Step 2 item 6 says a folded AC "keeps its row with `already
covered: <test file>` in the Proven-by column". A folded answer and an unfolded one are therefore the
same English: both name trimming, dropping empty locales and key removal. They differ only in what
each AC's row carries in **Proven-by**. `unit-proven-acs-folded.mjs` used to fire on scenario
**titles** (`/\bscenario\b[^\n]{0,60}\btrim\w*/i` and friends) and so red-flagged `case-29` three
times out of three in the 2026-08-14 run: the surviving wiring scenario is *supposed* to name the
behaviour, because "the UI reaches the function and its output leaves on the wire" is trimming,
observed at the browser layer. A heading states the subject; the table two lines below settles it.

The repair was not a wider phrase list — two rounds of that had already landed on this judge in #64,
and a third against the same three transcripts fits a judge to its fixtures instead of to its rule.
It parses the pipe table, finds the Proven-by column by its header, looks each unit-proven behaviour
up in the AC column, and reads the verdict out of that row. Three rules keep the reader honest:

- **A continuation row is the same AC.** SKILL.md's own worked example wraps a Proven-by cell across
  two table lines — `already covered:` on one, the test file on the next, every other cell blank.
  A row with a single non-empty cell merges upward, or the file name reads as an AC with no
  Proven-by, which is the #64 line-wrap defect one layer down.
- **The reader is anchored on the separator row, not on a leading pipe.** Leading and trailing pipes
  are optional in GFM, so demanding them would red-flag a correct answer for its markdown style.
- **A blank Proven-by cell is not a continuation.** A row with one non-empty cell merges upward only
  when that cell is not the AC column; a lone AC cell is an AC whose Proven-by is empty, which is a
  fold left silent — merging it would hide the very thing "Folding is never silent" is about.
- **Count behaviours, not rows.** An answer may fold the three bullets into three rows or into one
  row naming the whole matrix. Both are folds, so the assertion is per behaviour — "is there an AC
  row for it, and does that row say `already covered:`" — never "are there three such rows".
- **A silent deletion is not a fold, and a total fold is not one either.** A behaviour with no row
  at all fails, and so does a table where no row is left proven by a browser scenario: the fold
  exists to keep the ONE scenario that proves the wiring.

It asserts nothing about the prose. The checks that used to sit below the table logic — the answer
must say "fold", must say "wiring", must name `buildUpsert`, must name the test file — were
vocabulary tolls, and an answer whose table is a perfect fold went red for a word it never wrote.
That is the same wrong-unit family one layer down, and the must-PASS fixtures all happened to
satisfy them, which is the fixture-fitting this whole directory exists to avoid. Every fact worth
asserting is already a table fact.

The must-FAIL twin this shape needs is the mirror of the standard one: an answer whose **prose**
says every right word — it names the test file, says "fold", writes `already covered:
tests/unit/customScripts.test.ts` in a sentence — over a table that gives each pure-function AC its
own browser scenario. The pre-#77 judge passed exactly that input.

| Judge | What it treats as its unit | Verdict |
|---|---|---|
| `unit-proven-acs-folded.mjs` | one AC table row, decided on its Proven-by cell | fixed at #77; was a phrase match over scenario titles |

### There is no shared matching primitive, and the reason is recorded here

#82 asked the question this family had earned after ten-plus instances: **is a shared matching
primitive worth building for the judges that carry `offenders()`/`commitments()` verbatim, or is
per-judge repair still cheaper?** The answer is **no primitive**, and the evidence is below so
nobody re-proposes it from the instance count alone.

**The family is three families, and only one of them lives in a shared surface.**

| Sub-family | Instances | Where it lives | Already shared? |
|---|---|---|---|
| **Negation scope** — a forbidden thing named in order to reject it | #59, #63, #66, #71 (provenance) | `commitments()` / `NEGATED` / `offenders()` | **Yes.** One text across 39 judges, held verbatim by `test-eval-judges.sh`. #66 repaired eight copies at once. |
| **Wrong unit** — the judge reads the wrong span | #64 (line wrap), #71 (block vs turn), #77 (title vs table row) | each judge's reader | **No, and it should not be.** The right unit is a property of the case's answer shape. #77's repair was to *stop* widening phrases and parse the table; three instances, three different units, no common one. |
| **Wrong spelling of the right value** — the value is correct and the characters are not | #72 (×3), #82 (×5) | each judge's `checks[]` | **No — see below.** |

The first sub-family is the one a primitive would have served, and **the primitive already exists**.
Counting all ten-plus instances as one missing abstraction reads the shared surface's own successes
as failures: `offenders()` is the abstraction, and its repairs propagated exactly as an abstraction's
should.

**Why the third sub-family does not extract.** Judges cannot import — skill-up copies a judge to a
temp directory before running it, so a relative import of a sibling resolves to nothing. "Shared"
here can only mean *duplicated verbatim into every judge and policed by the drift check*. So the
cost of a primitive is not one function; it is a mandatory preamble every judge carries whether or
not its case needs it. This repo has already decided that question once, in the other direction:
`NEGATED` is **deliberately excluded** from the drift check because its tail is per-case vocabulary,
and one text there "would force a judge to carry words its case never uses". The 231 entries across
the judges' `checks[]` arrays are *entirely* per-case vocabulary. A shared matcher over them is
`NEGATED` one layer up, and it fails for the same recorded reason.

Auditing #82's own five repairs against the proposal is the sharpest version of the argument. Only
one of them — the optional-chaining one — is a fact about JavaScript rather than a fact about a
case. Two are one case's vocabulary for one case's idea ("the autostart was fine", "the command line
is the wrong place"). One is a co-occurrence with a scope, whose *shape* generalises but whose two
terms do not. And one is not a matching defect at all: a stale assertion, which no matcher can see.
**A primitive built for this family would have prevented one of the five.**

And it could not have been shown to be right. A widening matcher is verdict-neutral on every
retained fixture by construction — every must-PASS already passes, and the must-FAILs are caught by
`offenders()` before `checks[]` runs. So "prove verdict-for-verdict equality on the retained
fixtures", the safety condition such a change would have to meet, is satisfied *trivially* and
proves nothing. Evidence that a widening is correct only ever arrives as the next transcript, which
is the same place per-judge repair gets it, at eight times the blast radius.

**What actually finds this family, measured.** 26 of 47 judges carry a must-PASS fixture taken from
a recorded answer rather than hand-authored. For **25 of those 26**, the commit that added the
recorded fixture also edited the judge — adding a real answer forced a repair, first time, almost
every time. That is not a coincidence to note; it is the mechanism. #82's five defects were all
invisible to a fixture set that had been green for weeks and all five went red the moment three
recorded answers were dropped in.

So the cheap lever is not a matcher. **It is the recorded must-PASS fixture, and 21 of 47 judges do
not have one yet** — that is the population where the next instance of this family is, and it is
findable today, offline, without a run. Prefer a real answer from a retained transcript whenever one
exists (as *Fixtures* above already says), and when you take a measurement, keep the workspace: its
`with_skill` responses are next quarter's fixtures.

### An assertion is re-derived from the prompt it is about, never inherited across a repair

The third #82 defect is not a matching bug and belongs in its own entry. `case-61`'s judge asserted
that the answer "rules out browser-context leakage". That was a real assertion under the **old**
prompt, which named no cause: ruling out the wrong one was evidence the model had diagnosed rather
than guessed. #80 then repaired the premise to state the cause outright — two scenarios over one
pre-existing record under a declared carve-out — and the assertion became **unreachable by
construction**: the answer has nothing left to rule out. It scored the case 0/3 across three answers
that were right in every particular.

A prompt repair is therefore not a local change. **When a case's `prompt` moves, every assertion in
its judge is re-derived from the new prompt, not inherited** — some become unreachable, some become
free, and a judge that keeps asking the old question measures the old case.

`scripts/ci/test-case-shapes.sh` now checks the *occasion* for that re-derivation, though it cannot
check the derivation itself. Each case records a `judge.derived_from_prompt` digest of the prompt its
judge's assertions were written against; the check recomputes it and goes red when the prompt has
moved and the digest has not. It would have caught #80. What it cannot do is tell a re-derived
assertion from an inherited one — only that somebody was made to look. That limit is the check, not
a gap in it; a stronger version would have to read the judge's intent, and nothing here can.

### A mark the prompt supplied is not contact with the body

`skill-loaded.mjs` fingerprints long lines of the SKILL.md under test and looks for them in the
transcript. A case prompt that quotes one of those lines hands the model the mark, and counting it
reports LOADED for an arm that loaded nothing — or, in a `--baseline` run, BASELINE DIRTY for an arm
that read nothing. `b32-dwell-inline`'s prompt quotes `if (process.env.PW_PROVE_CLIP) await
page.waitForTimeout(2500);` to set the scene, which is exactly that (#71). The gate now discounts
fingerprints that appear in the case's own prompt and reports the count it discounted.

The discount is **prompt prose only**. A skill injection arrives as a `role: user` record too —
`isMeta`, opening `Base directory for this skill: …` and carrying the whole body — and exempting
that would blind the gate to the route contamination actually takes.
