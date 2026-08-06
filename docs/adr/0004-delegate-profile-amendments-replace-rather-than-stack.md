# 4. Delegation-profile amendments replace rather than stack

- **Status:** Accepted
- **Date:** 2026-08-06

## Context

`/delegate-tickets` step 6 tells the coordinator to amend `docs/agents/delegate-profile.md` when a
merge-back reveals a baseline, known-noise test, or environment trap the profile doesn't record.
That instruction was one word wide — "amend" — and said nothing about what happens to the fact being
superseded.

Read as *append*, which is the obvious default, it produced this in
`hyrdrocks/nuxt-hyrd-chrysus`'s profile (merged as PR #3116):

> - **`npx vitest run` is a hard gate with a CLEAN baseline… There is no known noise — any failure
>   is a real regression.**
> - **The clean baseline above is itself now STALE.** … The one failure is
>   `tests/unit/hyrdWidgetRail.test.ts` … **Known noise: do not re-triage it.**
> - **`AGENTS.md`'s claim of "4 known pre-existing failures on main" is STALE**…

Three layers of "the thing above is wrong", and the superseded claim is the one in bold that comes
first. The profile held two live baselines and asked the reader to reconcile them. A worker that
stops after the first bullet — the one the formatting shouts loudest — concludes the exact opposite
of the truth and re-triages a known-noise failure as a regression.

The same amendment filed a *dispatch* trap (`orca worktree create` bases worktrees on the repo
default, not the integration branch) under **Post-merge check**, because that is where it was
discovered rather than where it belongs.

## Decision

**A delegation profile is a snapshot, not a ledger.** It states what is true now; `git log` keeps
what was true before. Amending it means rewriting the superseded line — one baseline per check, each
fact in the field that owns it — and when the stale line lives in another doc, that doc gets the
fix.

`/delegate-tickets` step 6 carries the operative wording. This ADR records why, not how.

## Consequences

We give up the audit trail that append gives you for free: reading the profile no longer tells you
what the baseline *was*, only what it is. That is the trade — and it is the right one, because the
profile's readers are workers acting on it, not historians. `git log docs/agents/delegate-profile.md`
recovers everything replacement discards, and it recovers it with dates and the commits that
measured it, which the stacked version only approximated in prose.

The owning-file rule shifts work outward: a merge-back that finds `AGENTS.md` wrong now edits
`AGENTS.md`, a file the delegation run does not otherwise touch. That is deliberate. The alternative
concentrates every repo's accumulated errata in one file that only `/delegate-tickets` reads, so the
wrong doc stays wrong for everyone who isn't running a delegation.

This is hard to reverse. Eight repos carry profiles, and once they have accreted in one style,
switching means hand-editing all of them — which is the "measured facts, versioned elsewhere"
mistake [ADR-less PR #3](https://github.com/sonhyrd/claude-marketplace/pull/3) already deleted once.
So the rule lands in the skill now and the existing profiles are fixed forward, one merge-back at a
time, rather than retrofitted.

## Alternatives considered

- **Append with a dated log section, plus one canonical "current" line at the top.** Keeps history
  in-file, and the top line is always overwritten so there is still one answer. Rejected: it is the
  replace rule plus a second thing to maintain, and the log section is exactly where a tired
  coordinator files the next correction instead of fixing the top line.
- **Leave step 6 as-is and rely on review.** Rejected: this profile *was* reviewed. The
  contradiction survived because appending a correction reads as diligence.
