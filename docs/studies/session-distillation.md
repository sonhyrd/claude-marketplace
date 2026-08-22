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

The mark is matched on the skill's **name**, not by looking for `pw-prove` anywhere in the record.
Both forms were tried: the substring version anchored a control session's lead on a
`/matt:grill-with-docs` invocation whose *arguments* happened to mention a profile path, 500 lines
from where the run began. A neighbour whose name merely starts with the same word — `pw-prove-lite`,
a future `pw-prove-forensics` — is a different skill, and the suite carries that near twin next to
the real hit.

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
| Sessions where the next turn is hours later, past the time cap | 3 of 26 |
| Lines of reaction, all 26 sessions | 10–128, median 45 |
| Lines to the operator's next turn, the 10 sessions that have one | 19–128, median 46 |
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

**`unattributed` is an outcome, not a blank.** The rule is that an item without an attribution is
incomplete rather than a finding — not that the sub-agent must produce one. Where no instruction
covers the behaviour at all, the honest answer is the word `unattributed` plus what was searched
for, and that answer is itself evidence: it says the fix is a gap in the instructions rather than a
departure from them, which is a different ticket. A record that instead invented a plausible section
heading would be worse than one that says it looked and found nothing. Three of the n=1 record's
items came back this way.

## Redaction, and why it is in the prompt

The input is 226 MB of the operator's real work and plausibly holds credentials, tokens, HAR
contents and customer data. **There is no sandbox behind this rule.** `scripts/ci/pre-push-security.sh`
runs before anything is committed, but it is a backstop against a mistake, not the mechanism that
prevents one, and a raw distillation lives in a scratchpad it never scans.

So redaction happens **at source**, in the prompt, before a character is written. The sub-agent never
writes an unredacted quote intending to trim it afterwards: the file is the leak, and a trim after
the write is a leak that has already happened.

## The prompt

`{{...}}` are the only substitutions; everything else is fixed, because a prompt edited per session
is twenty-six instruments rather than one. Where each substitution comes from — the index entry is
the session's object in `span-index.py`'s output:

| Substitution | Source |
|---|---|
| `transcript_path`, `transcript_size` | index entry's `transcript`; size from the file |
| `lead_line_start`, `lead_line_end`, `lead_marker` | `lead.line_start`, `lead.line_end`, `lead.marker` |
| `lead_note` | `lead.stop` in words — anchored on the load turn, capped, or not found at all |
| `span_line_start`, `span_line_end` | `span.line_start`, `span.line_end` |
| `tail_line_start`, `tail_line_end`, `tail_stop` | `tail.line_start`, `tail.line_end`, and `tail.stop` in words |
| `session_short` | first eight characters of `session` |
| `session_version` | `versions["pw-prove"]` from the index entry |
| `head_version` | `metadata.version` in the working tree's `skills/pw-prove/SKILL.md` |
| `ledger_summary` | `records`, `nonzero_exits`, `first_ts`, `span_until`, `repository`, `worktree`, `commit` from the entry, plus the per-script exit tally |
| `ledger_path` | a per-session file the caller writes from the ledger: one line per invocation, with timestamp, script, phase, version, exit and duration |
| `skill_path` | the working tree's `skills/pw-prove/SKILL.md` |
| `out_path`, `scratchpad_dir` | the caller's scratchpad — never a path inside any repository |

A session with no lead (`lead.stop` is `not-found`) is instantiated with the span's own start as
`lead_line_start` and a `lead_note` saying the load turn could not be located, so the sub-agent knows
Steps 1 and 2 are missing rather than assuming they were empty.

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

Proven on `d3c037d9` — `nuxt-hyrd-chrysus`, worktree `bocaccio`, 17 August, pw-prove 0.20.0. Chosen
as the corpus's heaviest session by both record count (56) and non-zero exits (6): an instrument that
cannot find friction in the worst session is not worth running on the other twenty-five.

The record itself is a scratchpad file and is not committed, here or anywhere. What belongs here is
what the run proved about the **instrument**, and it took two passes to get there — which is the
result, not a delay before it.

### It found two defects in its own reach, and both are now fixed

**A loaded skill's body was read as the operator speaking.** Pass 1's tail ended on line 1212 and
reported it as the operator's next turn. It is the injected body of a *different* skill the agent
called — `type: "user"`, prose content, nobody typed it. The record said so in its own Identity
section, which is how it was caught. `isMeta` and `sourceToolUseID` now disqualify a record from
ending a tail; with the fix the tail runs to line 1315, where the operator actually types.

**Steps 1 and 2 were outside the span entirely.** Pass 1's own *What I could not determine* section
opened with them: they run no shipped script, so the ledger cannot see them, so the span could not
either. That is 172 lines in this session and 47–396 across the corpus — including the turn where
the run checks for `.pw-prove/profile.md`, which four of the exercise's own questions are about.

### The lead changed a finding, not just its coverage

Pass 1 attributed a false-proof item to `SKILL.md`'s rule that "a scope qualifier rides on every row
it weakens". Pass 2 read the 0.20.0 body **out of the lead** — the harness injects it verbatim at the
load turn — and found the rule does not exist in 0.20.0. The run had followed the body it actually
had; the finding is that the body of the day let a weakened row read unweakened, which is a different
fix in a different place from "the agent broke a rule". Version churn was already named as this
exercise's confounder, and the lead is what turns the contemporaneous instruction into evidence
instead of an assumption. Pass 2 also recovered a second such item in the opposite direction: 0.20.0
has no profile-writeback instruction at all, so a run that never wrote one broke nothing.

### The schema held

Every heading was filled from a 1,311-line read of a 1,333-line transcript. Three items came back
marked **unattributed** with a note on what was searched for — the mark of the rule working, not
failing: each is a gap in the instructions rather than a departure from them, which is exactly the
distinction the attribution field exists to force. The wrapper skill's own work inside the range was
recorded as out-of-scope with line numbers rather than silently dropped.

### What n=1 could not prove

**The redaction rule never met a real secret.** The session ran against a local development server;
the sub-agent reported the redactions it did apply — a share id, a comment id, a tenant-named auth
file, and a description-instead-of-quote for API paths carrying person identifiers — but nothing
key-shaped was in its path. The hardest rule in the prompt has been exercised by review and not by
the corpus. The remaining twenty-five sessions are where it gets its test, and
`scripts/ci/pre-push-security.sh` stays the backstop rather than the mechanism.

**One session is not a distribution.** Cost, for planning the rest: roughly seven to nine minutes and 140k
to 160k tokens of sub-agent context per session, over a 5.4 MB transcript and a 1,311-line read.

### What the prompt inherited from the run

Three changes, all of them in the version recorded above:

- The read range is the **lead, span and tail**, with each part's bounds and the mark or reason that
  set them, rather than the span alone.
- The three record shapes are spelled out, because two of them look like the operator and are not.
- The transcript is sliced with `sed`/`jq` and never read whole: single lines run to tens of
  kilobytes and a whole-file read exhausts a sub-agent before it reaches its own span.

## What the instrument did over the corpus (n = 26)

The other twenty-five sessions were distilled by the prompt above, instantiated from
`scripts/forensics/span-index.py`'s own output rather than by hand: the `{{...}}` table is filled
programmatically from each session's index entry, and the prompt body is extracted from the fenced
block in *this file*, so all twenty-six records are provably the same instrument. The n=1 record was
carried over unchanged. Sub-agents ran in four batches — six, six, six, seven — and each wrote its
file before returning.

Still no findings here. What follows is what running the instrument twenty-six times said about the
instrument; the findings are ranked under [run forensics](run-forensics.md).

### Coverage: twenty-six of twenty-six, and no silent shrink

| | |
|---|---|
| Corpus sessions in the index | 26 |
| Records on disk | 26 |
| Sessions that could not be distilled | 0 |
| Transcript lines read | 20,164, out of 214 MB on disk |
| Lines read per session | 327–1,539, median 715 |
| Sub-agent cost per session | ~107k–176k tokens, 5–11 minutes |

Every heading is present in every record, and no heading is blank — an empty one reads "None
observed." as the schema requires. `7cc7e6bc`, the one session whose lead reports `not-found`, was
distilled from the span alone and records Steps 1 and 2 as **missing from the range** rather than as
not performed. That is the stated gap the exercise owes, and it is the only one.

### The redaction rule finally met something

n=1 could not test it: that session ran against a local development server and nothing key-shaped was
in its path. The corpus was different. Records describe rather than quote a bearer token appearing as
a shell literal in at least eight commands, credential material on two turns of another session, and
a credential vault path in a third — in each case the record says it declined to quote and why, which
is the rule working as written rather than being lucky. A scan of all twenty-six records for JWTs,
`sk-`/`ghp_`/`pk_` prefixes, AWS keys, private-key blocks, bearer and `Set-Cookie` values, connection
strings, email addresses, query-string URLs, base64 blobs and non-session UUIDs returns nothing.
`scripts/ci/pre-push-security.sh` remains the backstop for what is committed, and no raw distillation
is committed at all.

### Three things the corpus taught the instrument, for the next run and not this one

None of these were applied mid-run. Editing the prompt after batch one would have made the corpus two
instruments measured as though it were one, which is the defect the n=1 proof exists to prevent — so
they are recorded here for whoever runs it next.

- **The schema's terminal triple does not cover everything that happens.** `delivered |
  handover-stop | abandoned` fitted twenty-four sessions. One (`6f307a2f`) ended in a handover stop
  the body does not sanction — a green result and an improvised three-way question — and one
  (`befb0456`) is neither: it is still mid-delivery, blocked at a self-imposed push gate, when the
  tail's time cap cuts. Both records said so in the field instead of forcing a fit, which is the
  behaviour to keep; the vocabulary is what needs a fourth term.
- **There is a third record shape that looks like the operator.** The prompt names two — a tool
  result, and harness-injected content. `7cc7e6bc` found a third: an Orca task-notification arriving
  as `type: "user"` with `origin.kind: "task-notification"` and `promptSource: "system"`. It reads
  exactly like a mid-run correction and is not one. The record caught it; a future prompt should name
  it alongside the other two.
- **Some transcripts serialise every `thinking` block empty.** Roughly a third of the corpus is
  affected, and in those the agent's *reasoning* is unquotable — only its actions and its prose
  survive. Those records say so under *What I could not determine* rather than inferring intent from
  behaviour, which is the rule holding; but it bounds what any distillation of those sessions can
  claim, and the bound is a property of the transcript, not of the reader.

### The attribution field did what it was built to do

Twelve of the twenty-six records attribute every friction and mistake item to an exactly quoted
`SKILL.md` heading. The other fourteen carry twenty-two items marked **`unattributed`** together with
what was searched for — a shell working-directory rule, a section governing a model-API outage, a
mid-run operator amendment, working-tree hygiene beyond Step 8's item 2. Those are not failures of
the record. Each says the behaviour is a gap in the instructions rather than a departure from them,
which is a different ticket from the ones the attributed items will produce.

Eleven skill versions ran across the window and eight appear in the corpus (0.20.0 through 0.27.1)
against a working tree at 0.28.0. Records name the version they read and, where a heading has since
moved or been renamed, say so — one session's finding turns on a rule that did not exist in the body
it ran, and would have been filed against the wrong place without the lead.
