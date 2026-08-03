# Merge origin/main into the PR branch before proving it

A PR proven against a stale base can go green on code that will never ship that way — observed in the field as a stale-base false-green. Proving the PR head alone answers "did this branch work when it forked?", not "will main work after merge?", and the second question is the one a proof exists to answer.

Decision: Step 3 merges `origin/<default>` into the PR branch in the worktree before bring-up. A clean merge means the run proves the merged result, and the merge commit deliberately lands on the PR branch with the Step 9 push — a visible artifact of what was actually proven, not an accident to apologize for. A conflict is the one sanctioned PR-mode stop: the PR author must resolve it before any proof means anything.

Rejected alternative: proving the PR head as-is and noting staleness in the report — that keeps the run "clean" but certifies a state that cannot ship, which is worse than stopping.
