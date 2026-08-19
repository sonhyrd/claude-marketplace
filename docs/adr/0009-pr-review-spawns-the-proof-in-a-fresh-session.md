# 9. `pr-review` spawns a fresh session for the proof, and stops asking

- **Status:** Accepted
- **Date:** 2026-08-19
- **Issue:** [#49](https://github.com/sonhyrd/claude-marketplace/issues/49)
- **Supersedes:** [ADR-0005](./0005-pw-prove-unpinned-behind-a-confirmation-gate.md), the
  *One human checkpoint in a long chain* consequence only. Everything else in 0005 stands.

## Context

`sss:pr-review` Step 6 handed into `e2e:pw-prove` by invoking the Skill tool, in this context.

`pw-prove`'s Step 1 opens with a context gate: above 100k tokens it refuses and names where to run
instead, its sixth beat being the exact `/e2e:pw-prove <arg>` line to paste into a fresh session. By
Step 6 `pr-review` has run three tracks, printed an aggregate report and applied a fix stage — it is
reliably well past 100k. So the last stage of a long, expensive review reached its consumer and was
turned away, and the user paid a full review to be handed a paste line and told to finish by hand.

The artifact survived on disk, which is why the standalone path worked at all. The proof did not
happen.

## Decision

**Step 6c spawns a fresh session instead of invoking the skill**, automating the remedy `pw-prove`'s
own gate prescribes:

```
orca terminal create --worktree active --command "claude '/e2e:pw-prove <NUM>'" --json
```

- **`--worktree active`.** The same checkout, because Step 1's three guards exist to guarantee the
  tree is the PR head and Step 4 committed into it. A child worktree was rejected: `pw-prove`
  commits, pushes and comments on the PR, so a child becomes a merge-back this skill would own.
- **One argument.** The PR number, or the branch name in branch mode. `BASE` and the findings live
  in `.pw-prove/handoff.json`, which is the handoff's single source of truth — and which makes the
  spawned line byte-identical to the paste line.
- **The prompt rides on `--command`**, not a `terminal send` after boot, which is three calls with a
  race in the middle.
- **Step 6 ends at the handoff.** It does not wait, supervise, or report the proof's outcome.
- **Orca cannot spawn here, so the stage prints the artifact path, the paste line and the working
  directory, and stops.** There is no inline fallback on any branch: inline is the refusal being
  routed around.
- **Step 1 gains an eighth finding** — whether Orca can spawn a terminal in this checkout, resolved
  by one `orca worktree current --json`, whose non-zero exit covers a missing binary and whose
  worktree-less success covers an unmanaged checkout. Reported, never repaired: `orca repo add`
  would make a review write to the user's tool configuration.

## Consequences

**`pr-review` now has zero human checkpoints, and that is the cost.** ADR-0005 traded `pw-prove`'s
pin for a confirmation gate and named that gate as the one place this chain stopped for a person.
The spawned session arrives on the *user-invoked* path, so the gate does not fire, and nothing
replaces it. One invocation now runs three tracks, a fix commit, a conditional translation-server
write, and an agent that will bring up a browser, commit, push and comment on the PR.

That is deliberate. The alternative is a checkpoint on the path the user already consented to by
typing `/sss:pr-review <PR#>`, guarding a stage they asked for — and the gate it replaces was, on
this path, never a checkpoint anyway: it was a refusal.

**0005's reasoning still holds everywhere else.** A direct `/e2e:pw-prove` is unchanged, and a
*different* skill chaining into `pw-prove` still meets the confirmation gate. Only the `pr-review`
path is superseded, and only its checkpoint half. The pin stays off.

**The proof's outcome leaves this run's report.** `pr-review` closes with a terminal handle and an
explicit line that the proof is running elsewhere and is not verified here. A reader who takes the
close for a passed proof would be reading exactly the silent always-pass `pw-prove` exists to
prevent, so that line is load-bearing, not a courtesy.

**Nothing under `plugins/e2e-skills/` changed.** No new handoff field, no change to either gate. The
whole change sits in `plugins/sss/`, so it ships without a targeted push to the fork.

## Alternatives considered

- **Lower or waive `pw-prove`'s 100k gate for the chained path.** Rejected: the gate is measuring a
  real thing — a session that heavy generates worse specs and loses instructions — and the change
  would be two plugins, a parity test and a push to the fork.
- **Spawn into a child worktree.** Rejected: `pw-prove` pushes and comments, so the proof must land
  on the branch that was reviewed, not a copy of it needing a merge-back.
- **Keep a confirmation before the spawn.** Rejected as the run's only remaining ask, re-stating a
  policy the invocation already carried; Step 3's boundary and Step 4c make the same argument for
  the fix stage.
- **Wait on the terminal and report the proof.** Rejected: it holds a ~150k-token session alive
  through a bring-up and verify loop, and being too heavy to be useful is the reason for the fresh
  session in the first place.
