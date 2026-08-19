#!/usr/bin/env bash
#
# Tests that sss:pr-review's Step 1 still handles refs and the working tree the
# way it was decided to. Revision FOUR of one decision; all four, and why each
# replaced the last, are in
# docs/adr/0007-pr-review-acquires-the-tree-in-step-1.md.
#
# What this file guards has now INVERTED TWICE. At revision 3 it stopped
# asserting Step 1 held no `git checkout` and started asserting the checkout was
# guarded and the fallback present. At revision 4 the fallback itself goes: 0 of
# 12 logged runs ever reached it, and the guards now stop the run before the
# fan-out instead of degrading past it. So the three fallback assertions are
# deleted rather than left passing on stale prose, and what replaces them is the
# half that measurably failed instead — full 40-character SHAs, a tree verdict
# read after the acquisition, and a stacked probe conditional on the default
# branch.
#
# That decision lives as prose in a SKILL.md — there is no script to exercise, so
# this test asserts the prose still says it. Deliberately: the alternative was
# shipping an executable resolver, and item 3 of the same friction log is a skill
# failing to locate its own shipped file under the plugin-cache layout. A grep is
# a weaker assertion than a run, but it cannot be defeated by a path resolver.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILL="${REPO_ROOT}/plugins/sss/skills/pr-review/SKILL.md"

PASS=0
FAIL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

ok() {
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} $1"
}

nope() {
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} $1"
    if [ -n "${2:-}" ]; then
        echo -e "      $2"
    fi
}

# The Step 1 section only, so a stray match in Gotchas cannot pass a test about
# what Step 1 says. Extracted once into a variable rather than re-piped per
# assertion: `awk ... | grep -q` is a race under `set -o pipefail`, because grep
# exits at the first match and SIGPIPEs the awk still writing behind it, so the
# pipeline reports 141 and a match reads as a miss — intermittently, and only for
# patterns that hit early in the section.
STEP1="$(awk '/^## Step 1 /{s=1; next} /^## Step 2 /{s=0} s' "$SKILL")"

must_match() {
    local label="$1" pattern="$2"
    if grep -qE "$pattern" <<<"$STEP1"; then
        ok "$label"
    else
        nope "$label" "no line in Step 1 matches /$pattern/"
    fi
}

must_not_match() {
    local label="$1" pattern="$2"
    if grep -qE "$pattern" <<<"$STEP1"; then
        nope "$label" "Step 1 still matches /$pattern/"
    else
        ok "$label"
    fi
}

echo "Running pr-review Step 1 ref-resolution tests..."
echo

if [ ! -f "$SKILL" ]; then
    nope "missing file: ${SKILL#"$REPO_ROOT"/}"
    echo
    echo -e "${RED}${FAIL} failed${NC}"
    exit 1
fi

if [ -z "$STEP1" ]; then
    nope "no '## Step 1 ' section found" "the section heading was renamed"
    echo
    echo -e "${RED}${FAIL} failed${NC}"
    exit 1
fi

# --- the mechanism: SHAs off remote refs, then a guarded checkout ------------

# Anchored at the start of a line, so it forbids `git pull` as a command in the
# recipe rather than the prose that says the recipe has no pull in it. The old
# unanchored pattern forbade the word, which the explanation itself now trips.
must_not_match "Step 1 runs no pull" '^[[:space:]]*git pull'
# shellcheck disable=SC2016  # a grep pattern: expansion is exactly what must not happen
must_match "and says it does not pull" 'no `git pull`'
must_match "resolves HEAD_SHA from the remote head ref" 'HEAD_SHA=.*rev-parse.*origin/'
must_match "BASE is a merge-base against the remote base ref" 'BASE=.*merge-base.*origin/'
must_match "the diff runs between the two resolved SHAs" 'git diff .*BASE.*\.\.\..*HEAD_SHA'
must_match "resolves both SHAs before the tree moves" 'resolve to SHAs before the tree moves|before the tree moves'

# --- the acquisition, and the three guards that make it safe -----------------
#
# The checkout is a branch and not a detached HEAD because Steps 4e/6c commit and
# push; each guard answers one way the move can destroy something.

# shellcheck disable=SC2016  # a grep pattern: expansion is exactly what must not happen
must_match "acquires the tree with switch -C at the resolved SHA" 'git switch -C <headRefName> "\$HEAD_SHA"'
must_match "guard 1: refuses a dirty tree" 'git status --porcelain'
must_match "guard 2: checks no other worktree holds the branch" 'git worktree list --porcelain'
must_match "guard 3: local branch tip must already be on the remote" 'git rev-list --count origin/'
must_match "says why a branch and not a detached HEAD" '[Dd]etach'
must_match "refuses to stash rather than owning the state" '[Ss]tash'

# --- a failed guard stops the run -------------------------------------------
#
# Revision 4's inversion. The fallback these three replace is deleted, so a
# guard failure must read as a stop that names its own corrective action.

must_match "a failed guard stops the run" 'stops the run'
must_match "the stop names the guard and what to do next" 're-run from'
must_match "nothing is spawned on the way out" '[Nn]o track spawns'

# --- the three cases the ticket requires it to name -------------------------

must_match "names the other-worktree failure it is answering" 'already used by worktree'
must_match "names stacked PRs" '[Ss]tacked'
must_match "detects a stacked base with gh" 'gh pr list --head'
must_match "names the tree-at-PR-head check" 'rev-parse HEAD'
must_match "the write stages are what a failed guard costs" 'write stages'

# The probe aimed at the default branch returns nothing and reads as "not
# stacked" by accident — 4 of 7 logged runs. It is conditional, and the default
# branch is looked up rather than assumed to be `main`.
must_match "the stacked probe is conditional on the default branch" '[Dd]efault branch'
must_match "the default branch is looked up, not assumed" 'defaultBranchRef'

# --- the provenance line ----------------------------------------------------

must_match "specifies a provenance line" '[Pp]rovenance line'
must_match "the line is printed before the fan-out" 'before any track is spawned'
must_match "the line carries BASE and the ref it came from" 'BASE=<40-char> \(merge-base of origin/'
must_match "the line carries the resolved HEAD" 'HEAD=<40-char>'
must_match "the line carries the tree verdict" 'tree at PR head'
must_match "branch mode fills the same line" "user-named fixed point"

# Every SHA at full length, and the verdict traceable to a read taken after the
# move: a transposed 9-character BASE reached a track prompt in 4 of 7 runs, and
# one run asserted `tree at PR head` from a rev-parse taken before any move.
must_match "the line carries the SHA the post-move read produced" 'TREE=<40-char>'
must_match "states the full-SHA rule" 'full 40 characters'
must_match "and forbids abbreviating them" 'never abbreviated'
must_match "the verdict comes from a read after the acquisition" 'after the acquisition'

# --- the eighth finding: can Orca spawn the proof's session? ----------------
#
# Step 6 spawns a fresh session because pw-prove's context gate refuses this one
# (docs/adr/0009). Whether that spawn is possible is resolved HERE, before three
# tracks are spent getting to a stage that cannot finish — the same reason the
# `ocr` finding sits in Step 1. One call covers both halves, and the finding is
# reported rather than repaired.

must_match "resolves whether Orca can spawn a terminal here" 'orca worktree current'
must_match "and asks it as one call covering both halves" '(not manage|does not manage|unmanaged)'
must_match "a missing binary is the same finding" 'PATH'
# Anchored at the start of a line, for the reason the `git pull` test above is:
# the prose that rules the command out has to say its name.
must_not_match "runs no repo registration" '^[[:space:]]*orca repo add'
# shellcheck disable=SC2016  # a grep pattern: expansion is exactly what must not happen
must_match "and says the finding is reported, never repaired" '`orca repo add`'
must_match "names repair as the thing it is not doing" '[Rr]epair'

# --- the finding count stayed in step with the findings ---------------------

must_match "the closing tally counts eight findings" 'eight findings'

echo
if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}${PASS} passed${NC}"
    exit 0
fi
echo -e "${RED}${FAIL} failed${NC}, ${PASS} passed"
exit 1
