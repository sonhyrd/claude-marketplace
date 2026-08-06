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
    printf "  ${GREEN}✓${NC} %s\n" "$1"
}

nope() {
    FAIL=$((FAIL + 1))
    printf "  ${RED}✗${NC} %s\n" "$1"
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

echo ""
printf "${YELLOW}Running check-e2e-subtree.sh tests...${NC}\n"
echo ""

# --- Preconditions ------------------------------------------------------------

if [ ! -x "$CHECK" ]; then
    printf "${RED}FATAL:${NC} %s is missing or not executable\n" "$CHECK"
    exit 1
fi

if ! git -C "$REPO_ROOT" rev-parse --verify --quiet e2e-fork/main >/dev/null; then
    printf "${RED}FATAL:${NC} e2e-fork/main is not fetched; run 'git fetch e2e-fork' first\n"
    exit 1
fi

# --- The pass case ------------------------------------------------------------

printf "${YELLOW}The correct sync passes${NC}\n"

if out="$(run_check HEAD)"; then
    ok "a correctly synced prefix exits 0"
else
    nope "a correctly synced prefix exits 0" "$out"
fi

# --- Each divergence reverted individually ------------------------------------

printf "${YELLOW}Each reverted decision is caught and named${NC}\n"

# 1. playwright-test-generator re-enabled: the rename undone.
sha="$(mutate_and_commit "git mv '${PREFIX}/skills/playwright-test-generator/SKILL.md.disabled' '${PREFIX}/skills/playwright-test-generator/SKILL.md'")"
out="$(run_check "$sha")" && rc=0 || rc=$?
if [ "$rc" -eq 1 ] && grep -q "playwright-test-generator/SKILL.md.disabled" <<<"$out"; then
    ok "re-enabling playwright-test-generator fails and names the rename"
else
    nope "re-enabling playwright-test-generator fails and names the rename" "rc=$rc: $out"
fi

# 2. pw-prove un-pinned: the disable-model-invocation line removed.
sha="$(mutate_and_commit "grep -v '^disable-model-invocation: true$' '${PREFIX}/skills/pw-prove/SKILL.md' > /tmp/pwprove.\$\$ && mv /tmp/pwprove.\$\$ '${PREFIX}/skills/pw-prove/SKILL.md'")"
out="$(run_check "$sha")" && rc=0 || rc=$?
if [ "$rc" -eq 1 ] && grep -q "skills/pw-prove/SKILL.md" <<<"$out"; then
    ok "un-pinning pw-prove fails and names the SKILL.md"
else
    nope "un-pinning pw-prove fails and names the SKILL.md" "rc=$rc: $out"
fi

# 3. The Claude plugin manifest deleted.
sha="$(mutate_and_commit "rm '${PREFIX}/.claude-plugin/plugin.json'")"
out="$(run_check "$sha")" && rc=0 || rc=$?
if [ "$rc" -eq 1 ] && grep -q "\.claude-plugin/plugin\.json" <<<"$out"; then
    ok "deleting .claude-plugin/plugin.json fails and names it"
else
    nope "deleting .claude-plugin/plugin.json fails and names it" "rc=$rc: $out"
fi

# 4. The Codex plugin manifest deleted.
sha="$(mutate_and_commit "rm '${PREFIX}/.codex-plugin/plugin.json'")"
out="$(run_check "$sha")" && rc=0 || rc=$?
if [ "$rc" -eq 1 ] && grep -q "\.codex-plugin/plugin\.json" <<<"$out"; then
    ok "deleting .codex-plugin/plugin.json fails and names it"
else
    nope "deleting .codex-plugin/plugin.json fails and names it" "rc=$rc: $out"
fi

# 5. pw-prove pinned but otherwise overwritten: the entry set still matches, so
#    only the one-added-line assertion can catch this.
sha="$(mutate_and_commit "printf '\n<!-- overwritten -->\n' >> '${PREFIX}/skills/pw-prove/SKILL.md'")"
out="$(run_check "$sha")" && rc=0 || rc=$?
if [ "$rc" -eq 1 ] && grep -qi "one added line" <<<"$out"; then
    ok "a pw-prove edit beyond the pin fails the one-added-line assertion"
else
    nope "a pw-prove edit beyond the pin fails the one-added-line assertion" "rc=$rc: $out"
fi

# --- Ordinary incoming work must not trip the guard ---------------------------

printf "${YELLOW}Ordinary incoming work does not trip the guard${NC}\n"

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
sha="$(mutate_and_commit "printf '\n<!-- authored here, never pushed -->\n' >> '${PREFIX}/README.md'")"
out="$(run_check "$sha")" && rc=0 || rc=$?
if [ "$rc" -eq 1 ] && grep -q "README.md" <<<"$out"; then
    ok "a prefix-only edit to a fork-owned file is reported as drift"
else
    nope "a prefix-only edit to a fork-owned file is reported as drift" "rc=$rc: $out"
fi

# A change outside the prefix is invisible to the check.
sha="$(mutate_and_commit "printf '\n<!-- unrelated -->\n' >> README.md")"
if out="$(run_check "$sha")"; then
    ok "a change outside the prefix does not fail the check"
else
    nope "a change outside the prefix does not fail the check" "$out"
fi

# --- Setup errors are distinct from drift -------------------------------------

printf "${YELLOW}A missing fork remote is a setup error, not drift${NC}\n"

out="$(E2E_SUBTREE_REMOTE=definitely-not-a-remote "$CHECK" --no-fetch 2>&1)" && rc=0 || rc=$?
if [ "$rc" -eq 2 ] && grep -q "definitely-not-a-remote" <<<"$out" && grep -q "git remote add" <<<"$out"; then
    ok "a missing fork remote exits 2 and names the remote plus the fix"
else
    nope "a missing fork remote exits 2 and names the remote plus the fix" "rc=$rc: $out"
fi

# --- Summary ------------------------------------------------------------------

echo ""
printf "${YELLOW}Results:${NC} ${GREEN}%d passed${NC}, ${RED}%d failed${NC}\n" "$PASS" "$FAIL"
echo ""

[ "$FAIL" -eq 0 ]
