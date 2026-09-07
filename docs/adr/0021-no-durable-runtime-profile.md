# pw-prove keeps no durable runtime profile; findings go to the completion report

`pw-prove` used to read a per-repository **runtime profile** at `.pw-prove/profile.md` in the target
repo, append to it at Step 3 and Step 8, and force-add it into that repository's history. It exists
no longer. A reader who finds 538 audited lines of analysis about the file — or a target repository
still carrying one — should find out why it went, and what going cost.

## The mechanism never held its own bound

Measured 2026-09-07, across the only two repositories that ever carried one:

| repo | entries | lines | vs. the 20-entry cap the skill stated |
|---|---|---|---|
| `nuxt-hyrd-chrysus` | 112 | 1,738 | 5.6x |
| `hyrd-widget` | 121 | 1,533 | 6.1x |

Chrysus's profile grew from **106 to 112 entries in a single day** — six entries appended by the proof
runs behind eight PRs merged that day, while the question of what to do about the file was being
decided. Append-only growth, observed live rather than inferred.

## Why no cap could have fixed it

The reason is on the record, written by a proof run that reached the cap and declined to enforce it:

> Pruning 80 entries written by other runs is not a proof run's call and would destroy knowledge no
> one else holds, so successive runs keep appending and each pays the reading cost the cap exists to
> prevent.

That run was right, and the refusal is not a bug to be worded around. **Every** formulation of the cap
asks a proof run — mid-task, seeing one slice of the repository, with no way to know what another
run paid to learn — to delete a stranger's finding on its own authority. The correct response to that
request is to refuse it, so the file grows without bound by construction.

An earlier answer, PR #190, replaced the cap with a 300-line budget a run **reports** and never
enforces by deletion. That was a sound answer to the question as it then stood, and it is closed
because the question was retired rather than because it was wrong. It is not re-derived here.

Two findings from [the profile audit](../studies/profile-audit.md) outrank every individual entry
and are what actually settled this:

- **The file a run reads is not the file the last run wrote.**
- **The `CONTRADICTED` line the skill required — the single signal that the profile had rotted, and
  the only thing that would have made anyone go and fix it — appears in none of the 26 audited
  sessions.** The correction half of the loop never fired once in production.

So the file was unbounded, unpruned, uncorrected, and charged every run the reading time it existed
to save.

## Decision

**Retire it.** No step reads a runtime profile, writes one, force-adds one, or reports a verdict on
one. The concept leaves the skill's vocabulary and `CONTEXT.md`'s glossary.

**Durable findings go to the completion report**, carrying the one part of the mechanism that was
working — the **admission test**. A finding is reported as learned only if it is about the
*repository* rather than the change under proof, *cost a live pass* to learn, and will *still be true
next month*. The `Profile:` line is **renamed to `Learned:` at both of its report sites** — the Step-8
completion report and the six-beat stop report — and keeps its no-skip discipline, so
`Learned: nothing durable` remains a real reported outcome rather than an omission.

The stop report keeps the line for the reason it always had it: a stopped run is the one that learned
the most expensive thing in the repository. The context-gate refusal remains the single exception, as
it fires before any environment work and has nothing to report.

## What this costs

Stated plainly, because the write-back existed for a reason that is still true — what a proof run
learns is worth nothing to the next run unless it is written down:

> **A report is read once, by one human, at merge time. The file was read by every later run,
> automatically.**

Concretely: the next proof run against `nuxt-hyrd-chrysus` will re-pay a live pass to rediscover that
the tenant resolves by subdomain, because nothing on disk will tell it. That is a real regression in
machine-readable memory and it is accepted deliberately.

It is accepted because the alternative was not "a file the next run reads" but "a file nobody read".
Nobody was reading 1,738 lines; the run that would have corrected it never did, in 26 sessions; and
the file a run opened was not the one the last run closed. A mechanism that is unread, uncorrected
and unbounded delivers less than a report a human reads once.

## Consequences

- Deleting `.pw-prove/profile.md` from a target repository is now a real deletion. While the writer
  existed, Step 8's `git add -f` meant the next proof run recreated the file, forced-added, past
  `.gitignore` — so **retiring the writer had to land before** `hyrdrocks/nuxt-hyrd-chrysus#3700` and
  `hyrdrocks/hyrd-widget#1356`, and did.
- If durable machine-readable memory is ever wanted again, this is the cost to re-argue from: it must
  answer who prunes, and how the reader learns the record has rotted. Neither question had an answer
  here.
- The eval case that asserted the write-back (`b06`) is retired with the behaviour it guarded.
- The studies this decision rests on are left exactly as they were. A study is a dated record of what
  was true when it was taken; editing one to reflect a later decision destroys its value as evidence.
