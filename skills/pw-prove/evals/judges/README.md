# Judges

One script per **triaged** case, active or quarantined. `evals/cases/<id>.yaml` names it as
`judge.script_path`, and `scripts/ci/test-eval-judges.sh` covers it with a fixture pair in
`fixtures/<judge>/`.

There are more judges here than there are active cases, and that is deliberate. A case cannot be
characterized without a judge, and a quarantined case keeps the judge it was measured on — its
pass rate in `REGISTRY.md` is only re-readable if the instrument that produced it still exists.
Batch 3 (#65) wrote twenty-one judges for twenty-one cases and eleven of those cases were admitted;
the other ten keep theirs against the ticket that will decide them.

**These are not shipped.** `evals/` is eval-engine material — it is excluded from the skill's
`include:` list and does not trigger the `Skill version bump` check. It is still zero-dependency ESM
Node, for the same reason everything else here is: no build step, no install, `node <path>.mjs`.

## Why every judge is a script

Until #59 every active case used `failure: output_contains` with a bare substring. That rule fires
when the model names the forbidden thing **in order to reject it**, and it produced seven of the nine
failures in the 2026-08-13 run — `b32` failed on the phrase "nothing to reformat", `b49` failed while
correctly refusing a prompt injection, because the refusal quoted the injection.

A negative assertion over discursive output is therefore **positional, not lexical**, and there is no
rule_based form of that. Three shapes carry it:

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
