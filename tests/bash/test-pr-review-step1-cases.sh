#!/usr/bin/env bash
#
# Tests that sss:pr-review's Step 1 still resolves refs the way it was decided
# to, in issue #22 off the friction log in #19.
#
# Step 1 used to run `git checkout <headRefName>`, which fails outright when the
# PR branch is live in another worktree — the normal Orca case, and 3 of the 8
# logged runs. The fix was to stop naming branches at all: resolve two SHAs off
# remote refs, diff between them, and never mutate git state. Everything the old
# recipe used a checkout for is now either unnecessary (the read stage works from
# any tree) or a declared degrade (the write stages are absent when the tree is
# not at the PR head).
#
# That decision lives as prose in a SKILL.md — there is no script to exercise, so
# this test asserts the prose still says it. Deliberately: the alternative was
# shipping an executable resolver, and item 3 of the same friction log is a skill
# failing to locate its own shipped file under the plugin-cache layout. A grep is
# a weaker assertion than a run, but it cannot be defeated by a path resolver.
#
# What it guards is regression by helpfulness: a later edit "simplifying" Step 1
# back to a checkout, or dropping the provenance line as noise, reintroduces a
# failure that cost a recovery detour in three separate runs.

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

# --- the mechanism: SHAs off remote refs, no git state mutated ---------------

must_not_match "Step 1 does not check out a branch" '^[^#]*git checkout'
must_not_match "Step 1 does not pull" 'git pull'
must_match "resolves HEAD_SHA from the remote head ref" 'HEAD_SHA=.*rev-parse.*origin/'
must_match "BASE is a merge-base against the remote base ref" 'BASE=.*merge-base.*origin/'
must_match "the diff runs between the two resolved SHAs" 'git diff .*BASE.*\.\.\..*HEAD_SHA'
must_match "says the tree is left alone" 'tree is left where it stands'

# --- the three cases the ticket requires it to name -------------------------

must_match "names the other-worktree failure it is answering" 'already used by worktree'
must_match "names stacked PRs" '[Ss]tacked'
must_match "detects a stacked base with gh" 'gh pr list --head'
must_match "names the tree-at-PR-head check" 'rev-parse HEAD'
must_match "the write stages are what the tree check gates" 'write stages'

# --- the provenance line ----------------------------------------------------

must_match "specifies a provenance line" '[Pp]rovenance line'
must_match "the line is printed before the fan-out" 'before any track is spawned'
must_match "the line carries BASE and the ref it came from" 'BASE=<sha> \(merge-base of origin/'
must_match "the line carries the resolved HEAD" 'HEAD=<sha>'
must_match "the line carries the tree verdict" 'tree at PR head'
must_match "branch mode fills the same line" "user-named fixed point"

# --- the finding count stayed in step with the findings ---------------------

must_match "the closing tally counts seven findings" 'seven findings'

echo
if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}${PASS} passed${NC}"
    exit 0
fi
echo -e "${RED}${FAIL} failed${NC}, ${PASS} passed"
exit 1
