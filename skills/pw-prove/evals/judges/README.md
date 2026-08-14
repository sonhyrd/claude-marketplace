# Judges

One script per active case. `evals/cases/<id>.yaml` names it as `judge.script_path`, and
`scripts/ci/test-eval-judges.sh` covers it with a fixture pair in `fixtures/<judge>/`.

**These are not shipped.** `evals/` is eval-engine material — it is excluded from the skill's
`include:` list and does not trigger the `Skill version bump` check. It is still zero-dependency ESM
Node, for the same reason everything else here is: no build step, no install, `node <path>.mjs`.

## Why every judge is a script

Until #59 every active case used `failure: output_contains` with a bare substring. That rule fires
when the model names the forbidden thing **in order to reject it**, and it produced seven of the nine
failures in the 2026-08-13 run — `b32` failed on the phrase "nothing to reformat", `b49` failed while
correctly refusing a prompt injection, because the refusal quoted the injection.

A negative assertion over discursive output is therefore **positional, not lexical**, and there is no
rule_based form of that. Two shapes carry it:

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

## Fixtures

Every judge needs both halves, and the harness fails a judge that carries only one:

```
fixtures/<judge>/pass--<slug>.txt      must exit 0     (or .jsonl, fed as $EVAL_TRANSCRIPT_PATH)
fixtures/<judge>/fail--<slug>.txt      must exit non-zero
fixtures/<judge>/<slug>.expect         optional: substrings the verdict must name
```

The must-PASS fixture is the load-bearing one: it has to be **a correct answer that names the
forbidden thing in order to reject it**. That is the one-hit-one-JUSTIFIED-twin rule from
`tests/pattern-corpus/` applied to judges, and it is the only fixture that can see the defect this
whole directory was rewritten for. Prefer a real answer from a retained run transcript where one
exists; the fixtures added in #59 are hand-authored against the phrasings the 2026-08-13 run
recorded, because that run's workspace was not retained.

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
