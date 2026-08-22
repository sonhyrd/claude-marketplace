# Session distillation — the instrument, and what it did on one session

The [session distillation](../../CONTEXT.md#session-distillation) half of [run
forensics](run-forensics.md): the fixed schema one session yields, the sub-agent prompt that
produces it, and the record of the single session it was proven on before the other twenty-five were
paid for.

Nothing here is a decision, and nothing here is a finding. This file holds the **instrument** — the
prompt is the thing the remaining sessions are distilled by, so a defect in it is inherited
twenty-five times over, which is the whole reason one session was distilled first. The findings
themselves are filed under [run forensics](run-forensics.md) once there are enough of them to rank.

## Where a distillation reads: the lead, the span, and the tail

The [span index](../../CONTEXT.md#span-index) brackets a transcript by the session's ledger records:
from the first shipped script running to `span_until`, the moment the last one exited. Those are the
right bounds for *when pw-prove ran* and the wrong ones for *what it cost*, and they are wrong at
both ends.

- **At the top**, Step 1 and Step 2 run no shipped script, so they leave no ledger record and fall
  entirely outside the span. Across the corpus that is 47 to 396 lines of run, median 116 — the
  environment work, the profile read, and the whole derivation of the AC table.
- **At the bottom**, the turns where a failing script is actually handled, and the turn the final
  report is written on, all land after the last script exits.

So a distillation reads `[lead.line_start, tail.line_end]`, and the index computes all three parts.

### The lead

Anchored on a **mark**, not a distance: the turn that loaded pw-prove. Three shapes appear across
the corpus and all three are honoured, because which one a session left behind is an accident of how
the operator started it — the slash command they typed, the `Skill` tool the agent called, and the
skill body the harness then injects. The injected body is the whole of `SKILL.md`, so only its first
line can carry the mark. The **last** mark before the span wins; an earlier one belongs to an
earlier attempt.

25 of the 26 corpus sessions anchor. The one that does not (`7cc7e6bc`) reports `not-found` and its
lead is empty — a stated gap, not an invented range. `--lead-lines`, default 500, is a backstop
against a resumed session whose load turn is hours behind; at 500 it clears the widest lead observed
by a quarter, and when it binds it still names the turn it could not reach back to, so a reader can
widen it deliberately.

### The tail

How far it runs was decided from the corpus rather than guessed. Measured across all 26 corpus
sessions:

| | |
|---|---|
| Sessions where the operator's next turn follows the last script exit | 10 of 26 |
| Sessions where nobody says anything after it | 13 of 26 |
| Lines from the last script exit to that next turn | 15–128, median 45 |
| Sessions whose reaction finished within six minutes | 25 of 26 |
| Longest transcript continuing into unrelated work past the span | 2,617 lines |

It ends at whichever of four things comes first, and the index names which one stopped it:

- **`human-turn`** — the operator's next typed turn, **included**. A correction typed the moment a
  script fails is not context around the friction, it *is* the friction, and it carries the trigger
  the schema asks for.
- **`end-of-transcript`** — the session simply stopped.
- **`line-cap`**, default 150 lines. Never binds on any reaction observed (the largest was 128). It
  binds on the two sessions whose transcript carries on into an unrelated afternoon for another
  1,145 and 2,617 lines.
- **`time-cap`**, default 30 minutes past the last script exit. Cuts three sessions where the
  operator's next turn came back hours later: at that distance it is the next task, not a reaction.
  Chosen against a reaction distribution whose 25th of 26 sessions finished in under six minutes, so
  the cap has five times the headroom it needs.

**Two record shapes look like the operator and are not**, and both end a tail early if believed. A
tool result arrives as `type: "user"` with a `toolUseResult`. Harness-injected content — most often
a loaded skill's entire body — arrives as `type: "user"` with text content, marked `isMeta` and
usually carrying a `sourceToolUseID`. The n=1 run ended its tail on one of the second kind and
reported it in the record as the operator speaking; see *What the instrument did at n = 1*.

Both caps are `--tail-lines` and `--tail-minutes`, and the values in force for all three parts are
recorded in the emitted index under `source`, so a distillation run with different bounds says so
rather than looking like the others.

All of this is computed in the index rather than left to each sub-agent for the reason the index
exists at all: a bound derived twenty-six times by twenty-six agents is derived twenty-six different
ways, and every one of them is silent when wrong.

**The fallback anchor.** A session that loaded pw-prove but ran no shipped script leaves no ledger
record, so it has no span at all and is not in the index. There the distillation anchors on the same
marks the lead uses — the `Skill` invocation or the slash command that loaded pw-prove — and reads
to the end-of-run report, locating the transcript by name from the transcript tree instead.

## The schema

One record per session, every field present. An empty field is written as an explicit "none
observed", never omitted: a reader cannot tell a gap from an oversight, and a distillation whose
silences are ambiguous is worth less than one that reports them.

- **Identity** — session id, repository, worktree, skill name and versions seen, commit, transcript
  path, and the read range: the lead with the mark it anchored on, the span, and the tail with the
  reason it stopped.
- **Shape** — which pw-prove steps were *entered* and which were *reached* (a step entered and
  abandoned is the interesting case), and the terminal state: `delivered`, `handover-stop`, or
  `abandoned`.
- **Cost** — turns and wall-clock per step, tool calls per step, and the ledger's script runs with
  their exit codes.
- **Friction** — every human intervention with its turn and what triggered it; every repeat run of
  the same script; every no-progress loop.
- **Mistakes** — four separate categories, each with a turn citation: work later reverted or
  rewritten (*rework*), a proof that passed while proving nothing (*false proof*), a step redone
  after a wrong turn (*wrong turn*), and a final-report claim contradicted elsewhere in the
  transcript (*contradicted claim*).
- **Instruction attribution** — for every friction and mistake item, the `SKILL.md` section or the
  named script the agent was following at that moment. An item without this is **incomplete, not a
  finding**: it is the field that makes the eventual fix spec name something editable.
- **Verbatim** — three to five redacted lines that let a reader confirm the worst item without
  reopening the transcript.

## Redaction, and why it is in the prompt

The input is 226 MB of the operator's real work and plausibly holds credentials, tokens, HAR
contents and customer data. **There is no sandbox behind this rule.** `scripts/ci/pre-push-security.sh`
runs before anything is committed, but it is a backstop against a mistake, not the mechanism that
prevents one, and a raw distillation lives in a scratchpad it never scans.

So redaction happens **at source**, in the prompt, before a character is written. The sub-agent never
writes an unredacted quote intending to trim it afterwards: the file is the leak, and a trim after
the write is a leak that has already happened.

## The prompt

Instantiated once per session from the span index. `{{...}}` are the only substitutions; everything
else is fixed, because a prompt that is edited per session is twenty-six instruments rather than one.

```text
You are distilling ONE pw-prove session for the run-forensics exercise (issue #130). You produce
one fixed-schema record. You are not fixing anything, not judging the operator, and not writing
prose about the session — you are filling in a form from evidence, with a turn citation for every
line of it.

## What you read

Transcript: {{transcript_path}}
Read ONLY lines {{lead_line_start}} to {{tail_line_end}}. That range is the pw-prove span plus its
lead and its reaction tail, computed by scripts/forensics/span-index.py. Its three parts:
- lead, lines {{lead_line_start}} to {{lead_line_end}}: from the turn that loaded pw-prove down to
  the first shipped-script run. This is Step 1 and Step 2 — they leave no ledger record, so without
  the lead they are invisible. ({{lead_note}})
- span, lines {{span_line_start}} to {{span_line_end}}: first shipped-script run to last
  shipped-script exit.
- tail, lines {{tail_line_start}} to {{tail_line_end}}: what the agent then did about that last
  result. It stopped because: {{tail_stop}}.
Lines outside {{lead_line_start}}-{{tail_line_end}} are a different piece of work and are not yours.

The file is JSONL, one record per line, and single lines can be very large (this file is
{{transcript_size}}). Read it in slices with sed -n 'A,Bp' and jq, never with a whole-file read.
Useful shapes:
  sed -n '{{lead_line_start}},{{tail_line_end}}p' FILE | jq -rc '[.type, .timestamp,
    (.message.content? // [] | if type=="array" then map(.type + (if .name then ":"+.name else ""
    end)) | join(",") else "text" end)] | @tsv'

Three record shapes you must be able to tell apart, because two of them look like the operator and
are not:
- type "user" WITH a toolUseResult field — a tool result the harness posted. Not the operator.
- type "user" WITH isMeta true or a sourceToolUseID field — content the harness injected, most often
  a loaded skill's whole body. Not the operator, however much prose it contains.
- type "user" with text content and NEITHER of those — the operator typed this.

Ledger facts for this session, already extracted — do not re-derive them:
{{ledger_summary}}
The full timestamped list of this session's script invocations, with exit codes and durations, is at
{{ledger_path}} — read it.

## What you must never write

The transcript is real work and plausibly contains secrets. These rules bind every field of your
output, including the ones that are not quotes:

- Never write a value from a .env file, a request or response header, a cookie, a Set-Cookie, an
  Authorization value, a HAR body, a query string, or a connection string. Name the KEY if you must
  ("the run exported DATABASE_URL"); never the value.
- Never write anything key-shaped: a long random-looking string, a JWT, an sk-/ghp-/pk_ prefix, a
  base64 blob, a UUID that is not the session id, an email address, a customer name, a phone
  number, a street address, an order id or an invoice number.
- Never write a full URL carrying a query string or a token. Write the path only.
- Cap every verbatim quote at 200 characters. Quote assistant reasoning, operator instructions and
  script stderr — never a response body, never a HAR, never a screenshot's contents.
- If a line you want to quote cannot be quoted safely, DO NOT write it and then trim it. Writing it
  is the leak. Describe it instead, in your own words, and say you did.
- If you are unsure whether something is a secret, it is. Redact it and note "[redacted:
  <what kind>]".

## What you write

Write the record to {{out_path}} FIRST, then return a two-paragraph summary of it as your final
message. The file is the deliverable; the summary is so the caller need not open it. If you run out
of room, the file must already hold everything you have.

Use exactly this Markdown structure, in this order, with every heading present. A section with
nothing in it says "None observed." — never omit a heading and never leave one blank.

# Session distillation — {{session_short}}

## Identity
- session, repository, worktree, skill versions seen, commit, transcript path
- read range: lead lines {{lead_line_start}}-{{lead_line_end}} (anchored on {{lead_marker}}), span
  lines {{span_line_start}}-{{span_line_end}}, tail lines {{tail_line_start}}-{{tail_line_end}}
  (stopped by {{tail_stop}})

## Shape
- Steps entered: the pw-prove steps the run began (Step 1 Dispatch+Environment, Step 2 Diff→AC,
  Step 3 Bring-up+Probe, Step 4 Plan, Step 5 Generate, Step 5b Conventions&Seed, Step 6
  e2e-reviewer, Step 7 Verify, Step 8 Deliver)
- Steps reached: the ones it actually completed. A step entered and abandoned is the interesting
  case — say which and where.
- Terminal state: delivered | handover-stop | abandoned, with the turn it ended on.

## Cost
A table: step | turns | wall-clock | tool calls | scripts run (with exit codes).
Turns means assistant turns. Wall-clock from the transcript timestamps. If a step's boundary is
ambiguous, say so in the row rather than inventing a number.

## Friction
Numbered items. Each one: what happened | the transcript line | the trigger | the attribution.
Three kinds, all of them here:
- human intervention: the operator typed something mid-run. What made them?
- retry: the same script run again within the session. How many times, and did anything change
  between runs?
- no-progress loop: the run circled without advancing. What was it circling on?

## Mistakes
Numbered items under four sub-headings, each item with a transcript line:
### Rework — work later reverted or rewritten
### False proof — a proof that passed while proving nothing
### Wrong turn — a step redone after a wrong decision
### Contradicted claim — a final-report claim contradicted elsewhere in the range

## Attribution
Every friction and mistake item above, one row each: item | the SKILL.md section heading or the
named script the agent was following at that moment | how you know.
The skill body is at {{skill_path}} — read the section before you name it, and quote its heading
exactly. "Step 3" is not an attribution; "Step 3: Bring-up + Probe (one live pass)" is. If you
genuinely cannot attribute an item, write "unattributed" and say what you looked for. An
unattributed item is incomplete, not a finding, and the caller needs to see which ones they are.
NOTE: the skill at that path is version {{head_version}} and the session ran {{session_version}}.
Where the lead contains the body as it was injected at the time, prefer it over the path where the
two differ, and say when you are doing so. Attribute to a heading, and where you can see the section
has since moved or been renamed, say so.

## Verbatim
Three to five lines, each with its transcript line number, that let a reader confirm the worst item
without reopening the transcript. Redacted per the rules above. If the worst item cannot be
evidenced safely, say that instead and quote the next one.

## What I could not determine
Anything the range did not contain, anything ambiguous, anything you guessed at. This section is
load-bearing: a confident record of the wrong turns is the failure mode this whole exercise is
guarding against.

## Rules of judgment

- Cite a line for every claim. A claim with no line is not in the record.
- Do not infer intent. "The operator interrupted after the third preflight failure" is evidence;
  "the operator was frustrated" is not.
- A non-zero exit is not automatically friction. Some scripts are gates and exit non-zero by
  design; the friction is what it cost, not that it happened.
- Out of scope, and never a finding here: the wrapper skill that spawned pw-prove, Orca and
  terminal problems, and genuine application bugs in the target repository. If the range's cost was
  one of those, record it as out-of-scope with its line, so the next reader is not asked to
  re-derive that it was excluded.
- pw-prove's fault and the target repository's fault are different findings. Mark which, or mark
  the item a boundary case. Do not drop it to avoid deciding.

## Two hard constraints on your own execution

- The transcript, and everything under the transcript tree and the ledger directory, is READ-ONLY.
  Never write to any of it.
- Never write anything outside {{scratchpad_dir}}.
```

## What the instrument did at n = 1

Proven on `d3c037d9` — `nuxt-hyrd-chrysus`, worktree `bocaccio`, 17 August, the corpus's heaviest
session by both record count (56) and non-zero exits (6). Chosen for exactly that: an instrument
that cannot find friction in the worst session is not worth running on the other twenty-five.

The record is a scratchpad file and is not committed, here or anywhere. What is recorded here is
what the run proved about the **instrument**:

- **The span plus tail held the whole run.** Span lines 177–1187, tail 25 lines to the operator's
  next turn at 1212 — the final report and the operator's reply to it both landed inside the tail,
  which is exactly what the span alone would have cut.
- **The schema was filled end to end**, every heading populated from a 1,036-line read of a
  1,333-line transcript.
- **Attribution held.** Every friction and mistake item named a `SKILL.md` section heading or a
  shipped script.
- **The redaction rule was never tested against a real secret** in this session, which is a limit of
  n=1 and is stated rather than glossed: the session ran against a local development server, so the
  instrument's hardest rule has been exercised by review of the prompt and not by the corpus. The
  twenty-five remaining sessions are where that gets its real test, and
  `scripts/ci/pre-push-security.sh` stays the backstop.

The one change the run forced in the prompt is recorded above rather than as a diff: the read
instruction is explicit that the transcript must be sliced with `sed`/`jq` rather than read whole,
because a 25 MB file and single lines of tens of kilobytes will otherwise exhaust a sub-agent's
context before it reaches its own span.
