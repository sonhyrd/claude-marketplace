#!/usr/bin/env bash
#
# Tests that sss:pr-review's fix stage still publishes what it produced —
# pushing the fix commit and posting the aggregated report to the PR — instead
# of leaving both in the invoking session. The decision, the rule it overturns
# and what that reversal cost are in
# docs/adr/0012-pr-review-publishes-its-own-review.md.
#
# This exists because the position it replaced was stated FIVE times across one
# SKILL.md — `Never push` in 4e with its third-pusher rationale, Step 3's
# "Posting to GitHub is a separate ask.", Step 4's opening "nothing is pushed",
# 4c's "a push this stage never makes", and 6a's "Still never push". A skill
# says a thing five times when it means it, and prose that emphatic grows back:
# any single one of those sentences re-added by a later edit would restore the
# old behaviour in the only place it lives, and pass every other test in this
# suite while doing it. So the absences are asserted as hard as the presences.
#
# A sibling of tests/bash/test-pr-review-step1-cases.sh, deliberately not a
# widening of it: that file is named and documented for ADR 0007's Step 1
# decision, and folding Step 4 assertions into it would blur what either test
# guards.
#
# The decision lives as prose in a SKILL.md — there is no script to exercise, so
# this test asserts the prose still says it. That is weaker than a run and it is
# the right trade here for the same reason it is in the Step 1 tests: a grep
# cannot be defeated by a path resolver, and the plugin-cache layout has broken
# every shipped-file lookup this skill has attempted.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILL="${REPO_ROOT}/plugins/sss/skills/pr-review/SKILL.md"
# Step 4's rationale moved to a reference the step names (#97); it is the same
# prose, read at the same step, so it is judged together with the section. The
# whole-file absences below read every reference too, so the deleted rule cannot
# grow back in a file the section extractor never sees.
STEP4_REF="${REPO_ROOT}/plugins/sss/skills/pr-review/references/step-4-fix.md"
REFS_DIR="${REPO_ROOT}/plugins/sss/skills/pr-review/references"
ADR='docs/adr/0012-pr-review-publishes-its-own-review.md'

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

# The fix stage only, so a match in Step 6 or the Notes cannot pass a test about
# what Step 4 says — and, more importantly, so an absence assertion is not
# satisfied by prose elsewhere that merely quotes the deleted rule. Extracted
# once into a variable rather than re-piped per assertion: `awk … | grep -q` is
# a race under `set -o pipefail`, because grep exits at the first match and
# SIGPIPEs the awk still writing behind it, so the pipeline reports 141 and a
# match reads as a miss.
STEP4="$(awk '/^## Step 4 /{s=1; next} /^## Step 5 /{s=0} s' "$SKILL"; cat "$STEP4_REF")"

# The 4f sub-step alone, for the assertions that are about the comment rather
# than about the stage around it.
SUB4F="$(awk '/^### 4f\./{s=1; next} /^## Step 5 /{s=0} s' "$SKILL" "$STEP4_REF")"

# Every file the skill reads, for the assertions that must hold anywhere in it.
WHOLE="$(cat "$SKILL" "$REFS_DIR"/*.md)"

must_match() {
    local label="$1" pattern="$2" hay="${3:-$STEP4}" where="${4:-Step 4}"
    if grep -qE "$pattern" <<<"$hay"; then
        ok "$label"
    else
        nope "$label" "no line in $where matches /$pattern/"
    fi
}

must_not_match() {
    local label="$1" pattern="$2" hay="${3:-$STEP4}" where="${4:-Step 4}"
    if grep -qE "$pattern" <<<"$hay"; then
        nope "$label" "$where still matches /$pattern/"
    else
        ok "$label"
    fi
}

echo "Running pr-review publish-the-review tests..."
echo

if [ ! -f "$SKILL" ]; then
    nope "missing file: ${SKILL#"$REPO_ROOT"/}"
    echo
    echo -e "${RED}${FAIL} failed${NC}"
    exit 1
fi

if [ ! -f "${REPO_ROOT}/${ADR}" ]; then
    nope "missing ADR: $ADR" "the decision this test pins has no record"
fi

if [ -z "$STEP4" ]; then
    nope "no '## Step 4 ' section found" "the section heading was renamed"
    echo
    echo -e "${RED}${FAIL} failed${NC}"
    exit 1
fi

if [ -z "$SUB4F" ]; then
    nope "no '### 4f.' sub-step found" "the sub-step ADR 0012 adds is gone or renamed"
    echo
    echo -e "${RED}${FAIL} failed${NC}"
    exit 1
fi

# --- the rule ADR 0012 overturns, in all five places it was stated -----------
#
# Whole-file for the two that never lived in Step 4: Step 3's policy line and
# 6a's repetition are outside the extracted section, and either one alone
# restores the old position.

must_not_match "the fix stage no longer forbids pushing" '[Nn]ever push'
# Unanchored on purpose: the deleted rule was bolded, but a re-addition that
# drops the asterisks restores it just as completely, and a pattern that only
# catches the bolded form would let it back in — which would make the header's
# claim that the absences are asserted as hard as the presences untrue.
must_not_match "and neither does anything else in the skill" \
    '(Still )?[Nn]ever push\b' "$WHOLE" "SKILL.md or references/"
# Step 4 only, not the whole file: the Notes section names the third-pusher rule
# on purpose, to say ADR 0012 overturned it. What must not come back is the rule
# stated as a live rationale in the stage it used to govern.
must_not_match "the third-pusher rationale is gone from the fix stage" 'third pusher'
must_not_match "Step 4 no longer opens on 'nothing is pushed'" 'nothing is pushed'
must_not_match "4c no longer rests on a push this stage does not make" \
    'push this stage never makes'
must_not_match "posting to GitHub is no longer 'a separate ask'" \
    'a separate ask' "$WHOLE" "SKILL.md or references/"

# --- 4e: commit AND push -----------------------------------------------------

must_match "4e is the commit-and-push sub-step" '^### 4e\. Commit and push'
must_match "it pushes the branch it committed to" 'then push that branch'
# With no force of any kind, a rejection here can only be a colleague's
# concurrent commit — which is the one thing the push must not overwrite.
must_match "the push is plain — no force of any kind" \
    'no force, no `--force-with-lease`'
must_match "a rejected push does not stop the run" 'rejected push does not stop the run'
must_match "4e cites the ADR that reversed its old rule" "$ADR"

# --- 4f: the stage that publishes -------------------------------------------

must_match "a 4f sub-step exists" '^### 4f\.'
must_match "4f is where the review is published on the PR" \
    '^### 4f\. Publish the review on the PR'
must_match "it posts with gh pr comment" 'gh pr comment <NUM> --body-file' "$SUB4F" "4f"
must_match "it runs only when Step 1 resolved a PR number" \
    'Runs when Step 1 resolved a PR number' "$SUB4F" "4f"
must_match "in branch mode the sub-step is absent, not skipped-with-a-note" \
    'sub-step is absent' "$SUB4F" "4f"
must_match "and absence is spelled out as neither a note nor a prompt" \
    'not skipped-with-a-note, not a prompt' "$SUB4F" "4f"

# --- what the comment carries ------------------------------------------------

must_match "the body is Step 3's report reproduced verbatim" \
    'reproduced verbatim' "$SUB4F" "4f"
must_match "reproduced, never regenerated" \
    '[Rr]eproduced, never regenerated' "$SUB4F" "4f"
must_match "4d's ## Fixes section is appended to it" \
    '## Fixes. section appended' "$SUB4F" "4f"
must_match "the hidden marker comment is written" \
    '<!-- sss:pr-review -->' "$SUB4F" "4f"
must_match "and the marker is justified as write-only for now" \
    'nothing reads it back today' "$SUB4F" "4f"
must_match "the header carries a push line" 'not yet pushed' "$SUB4F" "4f"
must_match "one new comment per run, never an edit" \
    'never an edit of an earlier one' "$SUB4F" "4f"
must_match "a run that applied nothing still posts" \
    'applied nothing still posts' "$SUB4F" "4f"
must_match "an issue comment, not a formal review or inline comments" \
    'not a formal review and not inline per-finding comments' "$SUB4F" "4f"

# --- the two failure paths, neither of which ends the run --------------------

must_match "the GitHub comment cap is named" '65,536' "$SUB4F" "4f"
must_match "an oversized body splits at ## boundaries, numbered" \
    'each numbered .1/n.' "$SUB4F" "4f"
must_match "a failed comment prints the body in chat" \
    'prints the body in chat' "$SUB4F" "4f"
must_match "and the run carries on to Steps 5 and 6" \
    'carries on\*\* to Steps 5 and 6' "$SUB4F" "4f"

# --- 4c's two rules, re-grounded rather than dropped -------------------------
#
# Both used to rest on the premise that this stage makes no outward-facing
# write. ADR 0012 falsifies that premise, and a rule left resting on it is the
# shape a future reader deletes wholesale.

must_match "the invented 'write you haven't authorized' excuse is still rejected" \
    "outward-facing write you haven't authorized"
must_match "rebutted now by the invocation authorizing 4e and 4f" \
    "authorizes 4e's push and 4f's comment"
must_match "reason 4 still keeps PR metadata out of the tree stage" \
    'targets PR metadata'
must_match "re-grounded on add-versus-overwrite, not on loudness" \
    'overwrites words the author wrote'
must_not_match "and no longer measures itself against a deferred push" \
    'defers to later stages'
must_match "the suggested rewrite reaches the author via 4f" \
    '4f carries that rewrite to the author'

echo
if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}${PASS} passed${NC}"
    exit 0
fi
echo -e "${RED}${FAIL} failed${NC}, ${PASS} passed"
exit 1
