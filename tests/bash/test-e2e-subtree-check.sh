#!/usr/bin/env bash
#
# Tests for scripts/check-e2e-subtree.sh.
#
# The check is a guard, and a guard that has never been observed failing is not
# known to work. So every case here follows the fork's own test-parity.sh shape:
# take the known-good tree, mutate exactly one marketplace-only decision back to
# what a naive `git subtree pull` would have left, and assert the check both
# fails and names that decision.
#
# Mutations are committed in a throwaway git worktree so the caller's working
# tree is never touched. The check reads a commit, not the filesystem, so a
# mutation has to be committed to be visible to it.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHECK="${REPO_ROOT}/scripts/check-e2e-subtree.sh"
PREFIX="plugins/e2e-skills"

PASS=0
FAIL=0
WORKTREE=""
FORK_WORKTREE=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

cleanup() {
    local wt
    for wt in "$WORKTREE" "$FORK_WORKTREE"; do
        if [ -n "$wt" ] && [ -d "$wt" ]; then
            git -C "$REPO_ROOT" worktree remove --force "$wt" >/dev/null 2>&1 || true
        fi
    done
}
trap cleanup EXIT

ok() {
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} $1"
}

nope() {
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} $1"
    if [ -n "${2:-}" ]; then
        printf "      %s\n" "$2"
    fi
}

# Commit a mutation in a scratch worktree and echo the resulting commit sha.
# $1 = shell snippet, run with the worktree as CWD.
mutate_and_commit() {
    local snippet="$1"

    git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
    WORKTREE="$(mktemp -d "${TMPDIR:-/tmp}/e2e-subtree-check.XXXXXX")"
    rmdir "$WORKTREE"
    git -C "$REPO_ROOT" worktree add --detach --quiet "$WORKTREE" HEAD

    (
        cd "$WORKTREE"
        eval "$snippet"
        git add -A
        git -c user.name=test -c user.email=test@example.com \
            commit --quiet --no-verify -m "test mutation"
    ) >/dev/null

    git -C "$WORKTREE" rev-parse HEAD
}

# Run the check against a commit. Echoes output; returns the check's exit code.
run_check() {
    local commit="$1"
    shift
    E2E_SUBTREE_COMMIT="$commit" "$CHECK" --no-fetch "$@" 2>&1
}

# Assert that a mutation is reported as drift (exit 1) and that the report names
# the decision that was undone -- a check that only says "drift" does not tell an
# operator which one. Every pattern must match, so a label claiming two things
# ("reported as an unexpected divergence, and names the file") is asserted as two
# things rather than passing on whichever half is easier to match.
# $1 = mutation snippet, $2 = label, $3.. = patterns the output must all contain.
expect_drift() {
    local snippet="$1" label="$2"
    shift 2
    local sha out rc pattern

    sha="$(mutate_and_commit "$snippet")"
    out="$(run_check "$sha")" && rc=0 || rc=$?

    if [ "$rc" -ne 1 ]; then
        nope "$label" "rc=$rc: $out"
        return
    fi
    for pattern in "$@"; do
        if ! grep -qi -- "$pattern" <<<"$out"; then
            nope "$label" "no match for '${pattern}': $out"
            return
        fi
    done
    ok "$label"
}

echo ""
echo -e "${YELLOW}Running check-e2e-subtree.sh tests...${NC}"
echo ""

# --- Preconditions ------------------------------------------------------------

if [ ! -x "$CHECK" ]; then
    echo -e "${RED}FATAL:${NC} $CHECK is missing or not executable"
    exit 1
fi

if ! git -C "$REPO_ROOT" rev-parse --verify --quiet e2e-fork/main >/dev/null; then
    echo -e "${RED}FATAL:${NC} e2e-fork/main is not fetched; run 'git fetch e2e-fork' first"
    exit 1
fi

# --- The pass case ------------------------------------------------------------

echo -e "${YELLOW}The correct sync passes${NC}"

if out="$(run_check HEAD)"; then
    ok "a correctly synced prefix exits 0"
else
    nope "a correctly synced prefix exits 0" "$out"
fi

# --- Each divergence reverted individually ------------------------------------

echo -e "${YELLOW}Each reverted decision is caught and named${NC}"

# 1. The Claude plugin manifest deleted.
expect_drift \
    "rm '${PREFIX}/.claude-plugin/plugin.json'" \
    "deleting .claude-plugin/plugin.json fails and names it" \
    "reverted" "\.claude-plugin/plugin\.json"

# 2. The Codex plugin manifest deleted.
expect_drift \
    "rm '${PREFIX}/.codex-plugin/plugin.json'" \
    "deleting .codex-plugin/plugin.json fails and names it" \
    "reverted" "\.codex-plugin/plugin\.json"

# --- The pin, in the direction it can now come back ---------------------------

echo -e "${YELLOW}A returning pw-prove pin is caught${NC}"

# `disable-model-invocation: true` used to be an EXPECTED entry, and the check
# fired when it vanished. It was removed and pushed to the fork (docs/adr/0005),
# so pw-prove's SKILL.md is now byte-identical on both sides and the alarm
# inverted: the pin coming back -- by hand, or carried in by a subtree pull --
# makes the file diverge, which is an UNEXPECTED divergence. Nothing else now
# asserts that the pin is gone, so this case is the whole mechanical guard.
#
# The report must also name the pin, not just the file: an operator who reads
# "skills/pw-prove/SKILL.md differs" still has to go diff it, and naming the
# decision that was undone is the entire point of this guard.
expect_drift \
    "printf 'disable-model-invocation: true\n' >> '${PREFIX}/skills/pw-prove/SKILL.md'" \
    "a returning pin is unexpected divergence, and is named with its ADR" \
    "unexpected divergence" "skills/pw-prove/SKILL\.md" \
    "disable-model-invocation: true" "docs/adr/0005"

# 3. Any other prefix-only edit to that file is ordinary drift -- the pin note is
#    additive, never a substitute for the unexpected-divergence report.
expect_drift \
    "printf '\n<!-- overwritten -->\n' >> '${PREFIX}/skills/pw-prove/SKILL.md'" \
    "an unrelated pw-prove edit is reported as an unexpected divergence" \
    "unexpected divergence" "skills/pw-prove/SKILL\.md"

# --- Ordinary incoming work must not trip the guard ---------------------------

echo -e "${YELLOW}Ordinary incoming work does not trip the guard${NC}"

# The case that matters: the fork lands a change, the pull brings it in, and
# both sides now carry it. The guard must stay quiet, or it fires on every
# future pull and gets ignored.
FORK_WORKTREE="$(mktemp -d "${TMPDIR:-/tmp}/e2e-subtree-fork.XXXXXX")"
rmdir "$FORK_WORKTREE"
git -C "$REPO_ROOT" worktree add --detach --quiet "$FORK_WORKTREE" e2e-fork/main
(
    cd "$FORK_WORKTREE"
    printf 'incoming fork work\n' > skills/pw-prove/NOTES.md
    git add -A
    git -c user.name=test -c user.email=test@example.com \
        commit --quiet --no-verify -m "fork-side change"
) >/dev/null
fork_sha="$(git -C "$FORK_WORKTREE" rev-parse HEAD)"
git -C "$REPO_ROOT" worktree remove --force "$FORK_WORKTREE" >/dev/null 2>&1 || true

sha="$(mutate_and_commit "printf 'incoming fork work\n' > '${PREFIX}/skills/pw-prove/NOTES.md'")"
if out="$(export E2E_SUBTREE_FORK_REF="$fork_sha"; run_check "$sha")"; then
    ok "an unrelated fork-side change carried into the prefix does not fail"
else
    nope "an unrelated fork-side change carried into the prefix does not fail" "$out"
fi

# The same file changed on the marketplace side only -- i.e. work authored here
# and never pushed back -- is drift, and must be named.
expect_drift \
    "printf '\n<!-- authored here, never pushed -->\n' >> '${PREFIX}/README.md'" \
    "a prefix-only edit to a fork-owned file is reported as drift" \
    "unexpected divergence" "README\.md"

# A change outside the prefix is invisible to the check.
sha="$(mutate_and_commit "printf '\n<!-- unrelated -->\n' >> README.md")"
if out="$(run_check "$sha")"; then
    ok "a change outside the prefix does not fail the check"
else
    nope "a change outside the prefix does not fail the check" "$out"
fi

# --- The prose cannot quietly disagree with the script ------------------------

echo -e "${YELLOW}CLAUDE.md matches the script's expected set${NC}"

# CLAUDE.md records the residual set for a human, and the script asserts it.
# Two statements of one contract is the disease this whole check exists to
# cure, so the duplication is only tolerable if drift between them fails here.
# `--explain` is the script's own rendering of the set, so this compares against
# the single owner rather than against a second hardcoded list.
explained="$("$CHECK" --explain)"
missing=""
while IFS= read -r path; do
    [ -n "$path" ] || continue
    grep -qF -- "$path" "${REPO_ROOT}/CLAUDE.md" || missing="${missing} ${path}"
done <<<"$(grep -oE '(\.[a-z-]+-plugin/plugin\.json|skills/[A-Za-z0-9./-]+)' <<<"$explained" | sort -u)"

if [ -z "$missing" ]; then
    ok "every path in the expected set is named in CLAUDE.md"
else
    nope "every path in the expected set is named in CLAUDE.md" "not mentioned:${missing}"
fi

# --- Setup errors are distinct from drift -------------------------------------

echo -e "${YELLOW}A missing fork remote is a setup error, not drift${NC}"

out="$(E2E_SUBTREE_REMOTE=definitely-not-a-remote "$CHECK" --no-fetch 2>&1)" && rc=0 || rc=$?
if [ "$rc" -eq 2 ] && grep -q "definitely-not-a-remote" <<<"$out" && grep -q "git remote add" <<<"$out"; then
    ok "a missing fork remote exits 2 and names the remote plus the fix"
else
    nope "a missing fork remote exits 2 and names the remote plus the fix" "rc=$rc: $out"
fi

# --- Summary ------------------------------------------------------------------

echo ""
echo -e "${YELLOW}Results:${NC} ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo ""

[ "$FAIL" -eq 0 ]
