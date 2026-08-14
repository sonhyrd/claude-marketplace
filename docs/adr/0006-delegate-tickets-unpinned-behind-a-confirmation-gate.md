# 6. `delegate-tickets` is unpinned, behind a confirmation gate

- **Status:** Accepted
- **Date:** 2026-08-14
- **Follows:** [ADR-0005](./0005-pw-prove-unpinned-behind-a-confirmation-gate.md)

## Context

`sss:delegate-tickets` shipped with `disable-model-invocation: true` in its frontmatter. Nothing
recorded why, but the reason is the same one ADR-0005 gives for `pw-prove`'s pin, job 2: **keeping
an expensive, irreversible run human-triggered.** A delegation cuts a git worktree per ticket, fires
each one's repo setup hook (`pnpm install` and friends), launches an autonomous agent per worktree
with `--dangerously-skip-permissions`, and merges the resulting branches back into the user's
current branch. A user who never asked for that cannot take it back.

The pin also has a cost this repo has already measured twice. `disable-model-invocation` does not
distinguish "a model started this unprompted" from "a skill the user invoked handed off to it" — it
blocks **chained** Skill-tool launches too. `e2e-reviewer` briefly carried the flag and killed
`pw-prove`'s own Step 6 quality gate with `Skill e2e:e2e-reviewer cannot be used with Skill tool due
to disable-model-invocation`, inside a run the user had started by name. And `delegate-tickets`
itself documents a live instance of the same constraint in step 5: because `implement` is pinned, a
dispatched worker cannot Skill-invoke it and must be told to read
`~/.claude/skills/implement/SKILL.md` by absolute path instead.

`autoship` is the coordinator that wants to chain here — an idea or Issue through spec → Issues →
Frontier drain. With the pin in place, the hand-off into a parallel delegation cannot exist as a
Skill call at all; the run stops and prints an instruction for the user to retype.

## Decision

**Remove `disable-model-invocation: true` from `delegate-tickets`, and replace its job with a
confirmation gate that fires on the model-invoked path only.**

- The gate is the first thing step 1 does. Nothing above it reads the profile, creates a worktree,
  or starts a terminal.
- A run the user started by name — `/sss:delegate-tickets …`, or a message naming the skill — asks
  nothing. The request is the consent, and the common path costs nothing.
- A run another skill or agent launched through the Skill tool stops once, names what is about to
  happen, and waits. Declined or unanswered means nothing was run — never a partial run, never
  "just the DAG then dispatch".
- The `description` gains trigger phrasing. Under the pin that was dead text: a pinned skill is
  removed from the model-facing listing entirely, so nothing was ever matching on it.

## Rationale

**Why a gate and not a narrower pin.** There is no narrower pin. `disable-model-invocation` is the
only mechanism that pins a plugin skill to user-invocable-only — `skillOverrides` in
`~/.claude/settings.json` is inert for plugin-sourced skills, and the `claude-settings` skill says
so where it documents capture — and it is all-or-nothing across the unprompted and the chained path
alike.

**Why the gate is in the skill body and not in tooling.** The property being protected is "the user
consented to *this* run", which only the run itself knows. Nothing outside the skill can see who
invoked it.

**Why above the profile read rather than after the DAG.** Steps 1–3 look read-only, but step 1's
absent-profile branch writes `docs/agents/delegate-profile.md` and a pointer line into the repo's
`CLAUDE.md`. A gate placed after them would let an unprompted run leave two committed files behind
before anyone was asked. The cost is that the prompt cannot name a ticket count — the tree resolves
in step 2 — so it asks on the run's shape instead. That is the right way round: the number of
tickets is not what makes the run irreversible.

**Why now, and not when `pw-prove` was unpinned.** ADR-0005's first job — anti-shadowing — was
specific to `e2e-skills` and a retired rival skill. `delegate-tickets` never had a shadow; it only
ever had job 2, so it is a strictly simpler case of the same decision and inherits its reasoning.

## Consequences

**Nothing tests the gate.** This marketplace has no eval harness for skill behaviour, so "a
model-invoked run stops and a user-invoked run does not" is an instruction, not an assertion. Same
limitation ADR-0005 records.

**No subtree guard applies here.** `plugins/sss/` is locally authored, so unlike `pw-prove` there is
no fork to push to and no `check-e2e-subtree.sh` expected-divergence set to update. The flip side is
that there is no mechanical alarm at all if the pin is re-added — for `pw-prove` a returning pin at
least shows up as an unexpected divergence. Here this ADR is the only record.

**One human checkpoint in the autoship chain.** After this, `autoship` can drive spec → Issues →
delegation without a retype, and this gate is the only place that chain stops for a person on the
delegation half. That is the trade: chainability bought with one prompt on a path that did not exist
before.

## Alternatives considered

- **Leave the pin and have `autoship` print "now run `/sss:delegate-tickets`".** Rejected for the
  reason ADR-0005 rejected the equivalent: the seam it asks the user to cross by hand is the thing
  being removed, and it loses the hand-off context — a cold run re-resolves a ticket tree the
  coordinator has already read and approved.
- **Gate on every run, user-invoked included.** Rejected: it taxes the common path to protect
  against a case that path does not have. A user who typed the command has already consented, and
  step 3 already prints the DAG before anything is dispatched.
- **Add `"delegate-tickets": "user-invocable-only"` to the `claude-settings` baseline instead.**
  Rejected as inert — it is a plugin-sourced skill, and the baseline's own documentation says to
  reach for the frontmatter flag rather than an override for exactly this case. Writing the key
  would have looked like a control while doing nothing.
