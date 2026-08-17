# pw-prove refuses a heavy session rather than degrading in one

pw-prove used to *recommend* a fresh session when it was invoked deep into a long-running one, and
continue inline when the user declined or said nothing. It now **refuses** above 100k tokens of
context, names the number it measured, and says how to restart. A skill that declines work is a
posture change, so the reasoning is worth keeping.

## What the recommendation was worth

Session `fa0cc83b-9828-4d06-aa09-fa6e82853dcc` (2026-08-17) is the first pw-prove run traced end to
end with timestamps. It was chained in by `sss:pr-review`, so it opened at **196k tokens** carrying
`matt:code-review`, `sss:translation-sync`, `paul-api-types` and three subagent reports, and it
finished at **394k**. It delivered a correct proof — four scenarios green, strictly hermetic, mutation
RED, published, pushed. Nothing in the outcome says anything went wrong.

The timestamps do. Two of the run's six defects are **failures to follow instructions that were
present**:

- At 13:00:20 it started the recon probe in the foreground and lost 180s to its harness's 3-minute
  cap. `SKILL.md` said, in bold, three lines above the command it copied: start it in the background,
  never a trailing `&`.
- At 12:56:20 it passed `ENV_CONTRACT=.env.example` to preflight and was stopped on all eleven keys.
  The repository's own [runtime profile](../../CONTEXT.md#runtime-profile) said, in plain English,
  not to. The run had read that profile and cited its other facts one turn later.

Both landed in the 200–250k band. Neither is a documentation defect — writing either rule more loudly
is writing it a fourth time.

The run's shape says the same thing from the other side. Of 144 session minutes, only **25** were
spent inside tools; a 75-minute idle gap accounts for most of the rest, and pw-prove's own segment
was 33 minutes, of which roughly 12 were work and 21 were the model thinking and typing at a context
between 196k and 394k. The dominant cost of that run was not what it did. It was where it ran.

## The decision

Above **100k tokens of context**, pw-prove stops before Step 1 and reports where to run instead.

- **A refusal, not a question.** The gate exists because a calling skill can front-run a
  recommendation: `sss:pr-review` spent pw-prove's one confirmation gate asking whether to *proceed*,
  which is not the same question as *where*. A gate a caller can answer is a gate the caller owns.
- **The threshold is written down.** "Heavy" is not assessable from inside a heavy session, which is
  the whole failure mode. 100k is a measured guess, not a derived constant: the traced run opened at
  196k and lost both instructions above 200k, and no run has yet been traced between 100k and 196k.
  It is stated in the body precisely so a future reader can move it on evidence.
- **The one override is the user's own words.** Told explicitly to run in this session anyway, the
  run continues and records an Assumptions line. A caller's prior confirmation does not carry.

## What was given up

pw-prove can no longer be chained blindly. A skill that invokes it from a long session now gets a
refusal where it used to get a proof, and the fix is in the *caller* — hand off to a fresh session
rather than invoke inline. That fix was available and out of scope: `sss:pr-review` lives in another
repository. This gate is the backstop pw-prove can enforce alone, and it is weaker than the change it
substitutes for, because a refusal costs the operator a round trip that a hand-off would not.

The cost is bounded and the failure is loud, which is the trade: a refusal that names its number is
recoverable in one action, and a silent degradation is discovered by reading timestamps a month
later.

## Open

Whether the other changes shipped alongside this one — a self-daemonizing probe, a stop-by-PID, a
machine-readable profile header — remain necessary once runs start in a light context. Some of them
may turn out to have been treating a symptom. That would be a good outcome, and it is worth measuring
rather than assuming.
