# Run forensics — what pw-prove cost across 26 real sessions

This is the index for the [run forensics](../../CONTEXT.md) exercise: the entry point a reader starts
from, and the place every later part of the exercise writes into.

Nothing here is a decision. `docs/adr/` holds decisions and `docs/specs/` holds specs; this file, and
everything filed beneath it, holds **evidence** — what 26 already-finished pw-prove sessions cost the
operator, with the citation that lets a reader confirm each item without being asked to take it on
trust. A [friction finding](../../CONTEXT.md) recorded here is something a reader may act on. It is
not a commitment that anything will change, and a ticket exists only once the operator has read the
ranked list.

The vocabulary is fixed before the work starts, in `CONTEXT.md` under *Run forensics vocabulary* —
**run forensics**, **session distillation**, **friction finding**. Use those words for those things.
In particular, run forensics is not an audit in the sense this repository already uses that word: the
hermetic audit and the clip fidelity contract each pass or fail one run against a rule, and this
exercise is neither a gate nor about one run.

## What the exercise covers

The corpus is 26 pw-prove sessions run against real work over five days, across two repositories
(`nuxt-hyrd-chrysus` and `hyrd-widget`), spanning eleven skill versions.

The run ledger (`~/.ptg/ledger.jsonl`) is the spine. It already carries `session`, `script`, `phase`,
`version`, `commit`, `duration_ms`, `exit` and `ts` for every shipped-script invocation, so the run
inventory, the exit codes and the durations come for free, and the timestamps bracket the pw-prove
**span** inside an otherwise unrelated work session. A transcript is therefore sliced, never read end
to end.

Three groups come out of that corpus, and the distinction is load-bearing:

- **corpus** — sessions against the two repositories above. These produce the findings.
- **control** — the `e2e-skills` dev sessions, retained rather than deleted. They deliberately
  exercise failure paths, so they must not masquerade as real struggle; a taxonomy that cannot tell
  one of them from a genuine failure is thereby exposed as defective.
- **excluded** — everything else, each with its reason stated. `hyrd-ui-library` is excluded because
  the question asked was about two repositories.

## What it will produce

Filed here as it is produced:

- A **span index** — one entry per session with repository, worktree, transcript path, skill versions
  seen, ledger record count, non-zero-exit count, first and last ledger timestamp, the transcript
  range those timestamps bracket, and the corpus/control/excluded classification. Sessions the ledger
  knows but no transcript exists for are marked `no-transcript` rather than dropped, so a gap in the
  corpus is stated rather than silently shrinking it.
- One **session distillation** per session, to the fixed schema `CONTEXT.md` names. Raw distillations
  stay in the scratchpad and are never committed: 226 MB of real work transcripts do not get
  partially reproduced in a git history. Sub-agents redact at source — no values from `.env`, request
  or response headers, cookies or HAR bodies, and nothing key-shaped — so an unredacted quote is
  never written and then trimmed.
- The **ranked friction findings**, frequency first, severity overriding it, measured time cost
  reported as a third column and never folded into a composite score. Every finding above the cut is
  re-checked against HEAD; one already fixed is recorded as confirmed-fixed.
- A **profile audit** of the two target repositories' `.pw-prove/profile.md` files, judged entry by
  entry: whether any run applied the entry, whether any run contradicted it, and whether a
  contradicting run declared the contradiction. The live profile files are read and never written —
  the artefact under audit is not mutated mid-audit.

The two deliverables the evidence feeds — a fix spec for pw-prove's prompt and scripts, and a
per-repository setup recommendation for each target repository — are **not** filed here. They are
decisions and they live under `docs/specs/`.

## Scope boundaries

Stated so that an absence of findings in these areas is not misread as evidence that the area was
fine. Nothing in the following was examined:

- The wrapper skills that spawned pw-prove. The exercise is about pw-prove.
- Orca and terminal problems. Infrastructure noise does not become skill findings.
- Genuine application bugs in the target repositories. pw-prove is not blamed for finding what it was
  asked to find.
- A `pw-prove-forensics` skill. Deliberately deferred: writing it before the exercise has been done
  once would encode a guess at the method.

Stable identifiers for friction categories are assigned only after the evidence is in, so the
taxonomy fits what was observed rather than what was imagined.
