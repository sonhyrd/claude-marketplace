# 7. `pr-review` acquires the tree in Step 1, behind guards and a fallback

- **Status:** Accepted
- **Date:** 2026-08-14
- **Supersedes:** the decision in `8209aab` (issue #22), which removed the Step 1 checkout outright

## Context

This is the **third** revision of one decision — how `sss:pr-review` Step 1 treats the working tree
— and the first two are legible only from commit messages. That is the reason this ADR exists: a
fourth revision needs to know that the first two happened and what each of them bought.

**Revision 1 (shipped in `0fe15dc`).** Step 1 ran `git fetch origin && git checkout <headRefName> &&
git pull`. It fails outright when the PR branch is live in another worktree — `fatal: '…' is already
used by worktree at '…'` — which is the *ordinary* Orca case, a review running in a fresh worktree
while the branch is checked out in the main clone. 3 of the 8 runs logged in #19 hit it, and each
improvised past it differently: one `&&` chain aborted at the checkout and carried on with a `BASE`
that was right only by luck, one needed a hand-written brief saying to skip the checkout, one spun a
copy branch to dodge git's refusal.

**Revision 2 (`8209aab`, issue #22).** Stop naming branches at all. Both ends of the diff resolve to
SHAs off remote refs, the tree is left where it stands, and git reads between two SHAs from any
working tree — so the failure had nothing left to fire on. The SHA comparison survived as a seventh
finding whose job was to *gate* the write stages: `HEAD` unequal to `HEAD_SHA` meant Steps 4, 5 and 6
were absent and the run ended after Step 3.

Which was correct, and incomplete in a way that only shows up in use. **Nothing in the skill ever
moved the tree to the PR head.** The tree finding could switch the write half off; it could never
switch it on. And the tree a review runs in is usually a fresh worktree cut from the default branch,
so the gate fired on the common path, not the rare one — a full three-track review would produce its
report and then decline to fix anything, every time.

Session `7be1f48f` is the measurement. Step 1 behaved exactly as written (`HEAD_SHA=13d29cf3`, tree
at `667ddc28`, `write stages off`), the user said *"fix it"*, and the model improvised the missing
acquisition by hand: it ran `git worktree list`, checked the branch held no unique commits, and then
`git checkout -B alfred/mamas-9435-3b72-r8ty 13d29cf3`. It worked — and it worked unguarded, on an
unwritten path, at the one moment in the run where a wrong move overwrites the user's work.

## Decision

**Step 1 acquires the tree at the PR head: resolve both SHAs first, then three guards, then
`git switch -C <headRefName> "$HEAD_SHA"`. Any guard failing is a fallback to revision 2's
behaviour, not an abort.**

- **Resolve before moving.** A bad ref still stops the run, and it must stop with the tree where the
  user left it.
- **A branch, not a detached HEAD.** Step 4e commits and Step 6c hands `head_sha` to `pw-prove`,
  which pushes. A commit on a detached HEAD is on no branch, so detaching leaves the write stages
  unable to finish their own job — the failure this whole revision exists to fix.
- **Three guards**, each answering one way the move destroys something: a clean tree
  (`git status --porcelain` empty), the branch not checked out in *another* worktree
  (`git worktree list --porcelain`), and — because `-C` resets an existing local branch — that
  branch's tip already present on `origin/<headRefName>`.
- **A dirty tree is refused, never stashed and never carried across.**
- **A failed guard is a read-only run**, a term now in `CONTEXT.md`: the report is complete and
  valid, Steps 4, 5 and 6 are absent, and the reason is named in the provenance line and again at
  the end.
- **Every track prompt states which tree it is reading**, and on the fallback path instructs paths to
  be read as `git show $HEAD_SHA:<path>`.
- Branch mode is unchanged. `HEAD_SHA` is `HEAD`, so there is nothing to acquire.

## Rationale

Revisions 2 and 3 optimise for different things, and the fallback is what stops this being a straight
swap of one for the other:

| | Revision 1 | Revision 2 | Revision 3 |
|---|---|---|---|
| Branch live elsewhere | run dies | report, no fixes | report, no fixes |
| Fresh worktree, clean | works | **report, no fixes** | **report and fixes** |
| Dirty tree | git may refuse mid-recipe | report, no fixes | report, no fixes |

Revision 2's win is the whole first column: the report is the expensive half, it is valid from any
tree, and a worktree collision must never cost it. Revision 3 keeps that column intact and fixes the
middle row, which is the common one. The guards are what make the difference from revision 1 — the
collision is now *detected* instead of *encountered*, so it produces a named degrade rather than a
`fatal:` in the middle of a recipe.

The alternative shapes were considered and rejected:

- **Acquire at the top of Step 4 instead**, leaving the read stage tree-agnostic. Structurally
  tidier, and it keeps revision 2 fully intact. Rejected because the tracks do not only read the
  diff — a sub-agent that opens a tree path reads whatever the tree holds, and in session `7be1f48f`
  that was one commit off the PR head. Moving the tree before the fan-out makes tree reads correct
  rather than merely discouraged. The cost is that the collision is now discovered before the report
  rather than after it, which the fallback pays for.
- **Detached HEAD at `$HEAD_SHA`.** Immune to the collision by construction, and unable to be pushed.
- **A copy branch** — rejected in revision 2 for a reason that still holds: it strands the fixes on a
  branch no PR points at.
- **Prompting the user before moving the tree.** Rejected: under the stated guards the move is
  reversible with one `git switch -`, and the run already has one human checkpoint in `pw-prove`'s
  own confirmation gate. A second prompt on nearly every review is friction, not safety.

## Consequences

- `tests/bash/test-pr-review-step1-cases.sh` **inverts.** It used to assert Step 1 contained no
  `git checkout` and said *"tree is left where it stands"*; it now asserts the checkout is guarded
  and the fallback is present. Its header comment carries all three revisions, and the file stays in
  place rather than being replaced, because it is the only written record of why revisions 1 and 2
  happened.
- **The fallback is the fragile half.** On any machine where the checkout always works it reads like
  dead prose, and a future edit will be tempted to delete it as unreachable. Two `must_match`
  assertions and the Step 1 gotcha are what notice; this ADR is why.
- The `git pull` assertion had to be **anchored** to line starts. Unanchored, it forbade the word,
  which the new prose explaining that Step 1 does not pull immediately tripped.
- Nothing mechanical catches a fourth revision being made by hand. That is what this file is for.

## Amendment (2026-08-17) — revision 4: a failed guard stops the run

**This amendment overturns one bullet of the decision above:** *"Any guard failing is a fallback to
revision 2's behaviour, not an abort."* It is no longer a fallback. A failed guard prints the
provenance line, then stops the run, naming the guard and the corrective action. Nothing spawns, and
the term **read-only run** is removed from the skill and from `CONTEXT.md` along with it. Everything
else in the decision stands: resolve before moving, a branch and not a detached HEAD, the same three
guards, a dirty tree refused rather than stashed, branch mode unchanged.

### Why

**The fallback was exercised by 0 of 12 runs** mined 2026-08-07 → 08-17. Not a single logged run hit
a failing guard, so the behaviour existed only as prose held up by two `must_match` assertions — the
exact fate the Consequences above predicted: *"On any machine where the checkout always works it
reads like dead prose."* The prediction was written as a warning against deletion. It turned out to
be a description of a path nobody travels.

**Both measurements, kept together, because neither settles it alone:**

| | Measurement | What it argues |
|---|---|---|
| For removal | fallback reached in **0 of 12** runs (2026-08-07 → 08-17) | the behaviour is unexercised prose |
| For keeping | worktree collision hit in **3 of 8** runs under revision 1 (#19) | the failure it answers is common |

**0 of 12 is not proof the path cannot fire**, and this amendment does not claim it is. The collision
the fallback answered is real and was measured at 3 of 8. What makes the trade defensible is
structural rather than statistical: under revision 3 the guards already moved the collision from
*encountered* to *detected*, and they run **before** the Step 2 fan-out. So an abort now costs a
message and nothing else — no track has spawned, no report has been paid for — where revision 1's
collision surfaced as a `fatal:` in the middle of a recipe. A clean early stop with a named fix is a
different object from a mid-run failure, and it is the only reason the fallback is safe to drop.

**The accepted cost, stated so it can be reversed knowingly:** on a guard failure there is now **no
report at all** until the user re-runs from a usable tree. Under revision 3 they got the complete
report and lost only the fixes. The user chose this on the grounds that a review that cannot fix
anything is not worth having — the report's value was never independent of the run continuing.

| | Revision 1 | Revision 2 | Revision 3 | Revision 4 |
|---|---|---|---|---|
| Branch live elsewhere | run dies | report, no fixes | report, no fixes | **named stop, no report** |
| Fresh worktree, clean | works | report, no fixes | report and fixes | report and fixes |
| Dirty tree | git may refuse mid-recipe | report, no fixes | report, no fixes | **named stop, no report** |

### The rationale Step 1 no longer carries

Step 1 was rewritten into a literal recipe in the same change, on the rule that it keeps only what
changes what an operator types. Roughly half of it was explaining what earlier revisions of this
decision did, and a section that is half commentary gets executed selectively — guards skipped or
partially run in 3 of 7 logged PR-mode runs. What moved here:

- **Why three guards.** Each names one thing `git switch -C` would destroy, and `-C` is why there are
  three: it resets an existing local branch of that name. Guard 1's full argument — falling back
  costs this review its fixes; stashing costs state this skill would then own restoring across four
  stages and `pw-prove`'s push; carrying the changes across would put files the PR does not contain
  into all three tracks' reports. Guard 2 catches `fatal: '…' is already used by worktree at '…'`
  before it fires, and only *another* worktree counts — the branch already being current here is the
  success path. Guard 3's command failing means no such branch, which has nothing to lose.
- **The detached-HEAD paragraph.** Step 4e commits and Step 6c hands `head_sha` to `pw-prove`, which
  pushes; a commit on a detached HEAD is on no branch to push. Step 1 keeps this as a one-line
  comment on the `switch -C` line, because it changes what the operator types.
- **Why the stack is declared at all.** The merge-base formula always handled a stacked base — against
  the parent branch it yields this PR's own commits rather than the parent's, which is what keeps a
  stacked review off the parent's 86 unrelated files. What was missing was any *statement* of it, so
  a run holding `baseRefName` was not trusted to use it. Revision 4 adds the probe's missing
  condition rather than changing that arithmetic: run it only when `baseRefName` differs from the
  repository's default branch, looked up rather than assumed to be `main`. Aimed at the default
  branch it returned nothing and read as *not stacked* by accident, in 4 of 7 runs.
- **The `translation-sync` divergence note.** A config present but naming no resolvable locale
  directory is simply the second sync finding false here, where `translation-sync` stops with a named
  error in the same case. It gets to: it was invoked on purpose. Here the two findings only decide
  whether it is invoked at all.

### Consequences of revision 4

- `tests/bash/test-pr-review-step1-cases.sh` **inverts a second time.** The three fallback assertions
  are deleted rather than left passing on stale prose, and full-SHA, post-move-verdict and
  conditional-probe assertions replace them. Its header carries all four revisions.
- **The two Step 1 eval cases are rewritten, not deleted.** Deleting them would leave the guards
  themselves with no behavioural coverage, which is precisely how the fix stage got broken — see
  `0008-pr-review-trusts-its-tracks.md`. `readonly-run-worktree-collision` becomes
  `worktree-collision-stops-the-run`; `dirty-tree-keeps-user-work` keeps its job and changes its
  expected outcome from degrade to stop.
- **The provenance line proves the tree verdict rather than asserting it**, carrying a fourth field
  `TREE` — the SHA `git rev-parse HEAD` returned after the move — and every SHA at full 40
  characters. One run asserted `tree at PR head` from a read taken before any move; another sent a
  track a transposed 9-character `BASE`. Both are visible on the line's face now.
- **Nothing mechanical catches revision 4 being reverted by hand either.** Re-adding the fallback
  would pass every assertion in the file that is not about it. This section is the record.
