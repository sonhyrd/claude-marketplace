# Run forensics — the plan and index for what pw-prove cost across 26 real sessions

This is the index for the [run forensics](../../CONTEXT.md#run-forensics) exercise: the entry point a
reader starts from, and the place every later part of the exercise writes into. Until those parts
land it is a charter and nothing else — it states the method and what it will produce, and holds none
of it yet.

Nothing here is a decision. `docs/adr/` holds decisions and `docs/specs/` holds specs; this file, and
everything filed beneath it, holds **evidence** — what 26 already-finished pw-prove sessions cost the
operator, with the citation that lets a reader confirm each item without being asked to take it on
trust. A [friction finding](../../CONTEXT.md#friction-finding) recorded here is something a reader may act
on. It is not a commitment that anything will change, and a ticket exists only once the operator has
read the ranked list.

The vocabulary is fixed before the work starts, in `CONTEXT.md` under *Run forensics vocabulary* —
**run forensics**, **session distillation**, **friction finding**. Use those words for those things,
and read the entries rather than re-deriving them here; in particular the entry for run forensics is
where this exercise is held apart from the two per-run gates whose names sound like it.

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
  range those timestamps bracket, the bounded [reaction tail](../../CONTEXT.md#reaction-tail) that
  follows it, and the corpus/control/excluded classification. Sessions the ledger
  knows but no transcript exists for are marked `no-transcript` rather than dropped, so a gap in the
  corpus is stated rather than silently shrinking it. Built by `scripts/forensics/span-index.py`;
  over the corpus it reports **632 shipped-script records and 57 non-zero exits across the 26
  sessions**, which supersedes the 656/60 quoted while designing the exercise — that figure was taken
  one repository too wide, before `hyrd-ui-library` was excluded.
- One **session distillation** per session — **all twenty-six now exist**, none refused, none
  silently dropped, and the one session whose lead could not be anchored (`7cc7e6bc`) records Steps 1
  and 2 as missing from its range rather than as not performed. Its schema is fixed here, not in the glossary: identity
  (session, repository, worktree, skill versions, commit, transcript path, span bounds); shape (steps
  entered, steps reached, terminal state); cost (turns and wall-clock per step, tool calls per step,
  ledger scripts and exits); friction (human interventions with turn and trigger, same-script
  retries, no-progress loops); mistakes, each with a turn citation; the `SKILL.md` section or named
  script every friction and mistake item is attributed to; and three to five verbatim lines. Raw
  distillations
  stay in the scratchpad and are never committed: 226 MB of real work transcripts do not get
  partially reproduced in a git history. Sub-agents redact at source — no values from `.env`, request
  or response headers, cookies or HAR bodies, and nothing key-shaped — so an unredacted quote is
  never written and then trimmed. The schema, the prompt that produces it and the reach of the read
  are fixed in [session distillation](session-distillation.md), which also records the one session
  the instrument was proven on before the rest were run.
- The **ranked friction findings**. Frequency orders the list, severity overrides it, and measured
  time cost is reported as a third column rather than folded into a composite score, so the ranking
  can be argued with. Every finding above the cut is re-checked against HEAD, and that re-check
  doubles as an adversarial verification: a sub-agent that read a normal step as thrashing is caught
  before the finding reaches a spec.
- A **profile audit** of the two target repositories' `.pw-prove/profile.md` files, judged entry by
  entry: whether any run applied the entry, whether any run contradicted it, and whether a
  contradicting run declared the contradiction. The live profile files are read and never written —
  the artefact under audit is not mutated mid-audit.

The two deliverables the evidence feeds — a fix spec for pw-prove's prompt and scripts, and a
per-repository setup recommendation for each target repository — are **not** filed here. They are
decisions and they live under `docs/specs/`.

## Scope boundaries

Stated so that an absence of findings in these areas is not misread as evidence that the area was
fine. Nothing in the following is examined:

- The wrapper skills that spawned pw-prove. The exercise is about pw-prove.
- Orca and terminal problems. Infrastructure noise does not become skill findings.
- Genuine application bugs in the target repositories. pw-prove is not blamed for finding what it was
  asked to find.
- A `pw-prove-forensics` skill. Deliberately deferred: writing it before the exercise has been done
  once would encode a guess at the method. It is written afterwards, from a method that worked.

Stable identifiers for friction categories are assigned only after the evidence is in, so the
taxonomy fits what was observed rather than what was imagined.
