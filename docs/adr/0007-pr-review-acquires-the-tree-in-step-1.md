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
