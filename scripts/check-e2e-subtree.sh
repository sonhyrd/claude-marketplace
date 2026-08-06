#!/usr/bin/env bash
#
# check-e2e-subtree.sh -- assert that plugins/e2e-skills/ diverges from the fork
# sonhyrd/e2e-skills by exactly the marketplace-only decisions it is supposed
# to, and by nothing else.
#
# Why this exists: `git subtree pull` merges. A merge can silently revert a
# marketplace-only decision, and nothing in the repo could previously tell you
# that it had. This is the single owner of the expected divergence set --
# CLAUDE.md points at this script rather than restating its output, so the two
# cannot drift apart.
#
# Deliberately NOT part of `make validate`: that suite is static and offline,
# and this check fetches a remote.
#
# Exit codes:
#   0  the prefix diverges by exactly the expected set
#   1  drift -- something appeared, or a marketplace-only decision was reverted
#   2  setup error -- missing remote, missing ref, not a git repo
#
# Overrides (used by tests/bash/test-e2e-subtree-check.sh):
#   E2E_SUBTREE_REMOTE  git remote for the fork      (default: e2e-fork)
#   E2E_SUBTREE_REF     branch on that remote        (default: main)
#   E2E_SUBTREE_FORK_REF  fork-side ref to diff from (default: $REMOTE/$REF)
#   E2E_SUBTREE_PREFIX  subtree prefix               (default: plugins/e2e-skills)
#   E2E_SUBTREE_COMMIT  commit to inspect            (default: HEAD)

set -euo pipefail

REMOTE="${E2E_SUBTREE_REMOTE:-e2e-fork}"
REF="${E2E_SUBTREE_REF:-main}"
PREFIX="${E2E_SUBTREE_PREFIX:-plugins/e2e-skills}"
COMMIT="${E2E_SUBTREE_COMMIT:-HEAD}"
FORK_URL="git@github.com:sonhyrd/e2e-skills.git"

DO_FETCH=1
EXPLAIN=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

usage() {
    cat <<EOF
Usage: $(basename "$0") [--no-fetch] [--explain]

Assert that ${PREFIX} diverges from ${REMOTE}/${REF} by exactly the
marketplace-only decisions listed in this script, and by nothing else.

  --no-fetch   Use the already-fetched ${REMOTE}/${REF} instead of fetching.
  --explain    Print the expected divergence set and exit, without checking.
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        --no-fetch) DO_FETCH=0 ;;
        --explain) EXPLAIN=1 ;;
        -h|--help) usage; exit 0 ;;
        *) echo -e "${RED}error:${NC} unknown argument: $1" >&2; usage >&2; exit 2 ;;
    esac
    shift
done

setup_error() {
    echo -e "${RED}✗ setup error:${NC} $1" >&2
    exit 2
}

# --- The expected divergence set ----------------------------------------------
#
# Each entry is a `git diff --name-status` line (tab-separated, rename scores
# stripped) for the diff FROM the fork TO the prefix. "A" therefore means
# "exists only in the marketplace".
#
# This list, and the one-added-line assertion below it, are the whole contract.
# Each element is "<name-status line>|<why it is expected>". The two halves live
# together so a new divergence cannot be added without a stated reason, and so
# `--explain` and the comparison read from one list rather than two.
EXPECTED_WITH_REASON=(
    $'A\t.claude-plugin/plugin.json|The fork ships no plugin manifests at all; this exists only here.'
    $'A\t.codex-plugin/plugin.json|Same -- generated Codex manifest, marketplace-only.'
    $'M\tskills/pw-prove/SKILL.md|Exactly one added line, `disable-model-invocation: true` -- the only mechanism that pins a plugin skill to user-invocable-only.'
)

EXPECTED=()
for entry in "${EXPECTED_WITH_REASON[@]}"; do
    EXPECTED+=("${entry%%|*}")
done

PIN_FILE="skills/pw-prove/SKILL.md"
PIN_LINE="disable-model-invocation: true"

if [ "$EXPLAIN" -eq 1 ]; then
    echo -e "${YELLOW}${PREFIX} is expected to differ from the fork by exactly these ${#EXPECTED_WITH_REASON[@]} entries:${NC}\n"
    for entry in "${EXPECTED_WITH_REASON[@]}"; do
        printf "  %s\n      %s\n\n" "${entry%%|*}" "${entry#*|}"
    done
    printf "Run without --explain to assert it.\n"
    exit 0
fi

# --- Preconditions ------------------------------------------------------------

git rev-parse --git-dir >/dev/null 2>&1 || setup_error "not inside a git repository"

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
    setup_error "$(printf 'the fork remote %s is not configured.\n  This is a setup gap, not drift. Add it with:\n\n      git remote add %s %s\n' "$REMOTE" "$REMOTE" "$FORK_URL")"
fi

if [ "$DO_FETCH" -eq 1 ]; then
    echo -e "${YELLOW}Fetching ${REMOTE}...${NC}"
    git fetch --quiet "$REMOTE" "$REF" \
        || setup_error "could not fetch ${REMOTE}/${REF}"
fi

FORK_REF="${E2E_SUBTREE_FORK_REF:-${REMOTE}/${REF}}"
git rev-parse --verify --quiet "${FORK_REF}^{commit}" >/dev/null \
    || setup_error "${FORK_REF} is not available locally; re-run without --no-fetch"

git rev-parse --verify --quiet "${COMMIT}:${PREFIX}" >/dev/null \
    || setup_error "${PREFIX} does not exist at ${COMMIT}"

# --- The comparison -----------------------------------------------------------

# Rename similarity scores (R099) vary with unrelated edits; the contract is
# "it is a rename", not "it is 99% similar". `-l0` lifts diff.renameLimit: a big
# incoming pull can otherwise exhaust the rename budget and degrade the rename
# to an add+delete, which would read as drift.
#
# `git diff` failing here aborts the script under `set -e` with git's own exit
# code rather than 0/1/2 -- that is a broken invocation, not a verdict.
ACTUAL="$(git diff --name-status --find-renames -l0 "$FORK_REF" "${COMMIT}:${PREFIX}" \
    | sed -E 's/^R[0-9]+/R/; s/^C[0-9]+/C/' | LC_ALL=C sort)"

EXPECTED_SORTED="$(printf '%s\n' "${EXPECTED[@]}" | LC_ALL=C sort)"

# comm must collate the same way sort did, or it mis-pairs lines it considers
# out of order. GNU comm is locale-sensitive here even though BSD comm is not.
APPEARED="$(LC_ALL=C comm -13 <(printf '%s\n' "$EXPECTED_SORTED") <(printf '%s\n' "$ACTUAL"))"
VANISHED="$(LC_ALL=C comm -23 <(printf '%s\n' "$EXPECTED_SORTED") <(printf '%s\n' "$ACTUAL"))"

STATUS=0

if [ -n "$VANISHED" ]; then
    STATUS=1
    echo -e "${RED}✗ a marketplace-only decision was reverted${NC}"
    printf "  These entries are expected but no longer present. Each one is a\n"
    printf "  decision this repo made that the prefix no longer carries:\n\n"
    printf '%s\n' "$VANISHED" | sed 's/^/      - /'
    printf "\n"
fi

if [ -n "$APPEARED" ]; then
    STATUS=1
    echo -e "${RED}✗ unexpected divergence${NC}"
    printf "  These entries differ from the fork but are not in the expected set.\n"
    printf "  Either push them back to the fork, or add them to EXPECTED in\n"
    printf "  %s with a reason:\n\n" "$(basename "$0")"
    printf '%s\n' "$APPEARED" | sed 's/^/      + /'
    printf "\n"
fi

# The pin must be exactly one added line. If it is anything more, the pull
# overwrote something -- and the entry set alone cannot see that.
if grep -qx "M	${PIN_FILE}" <<<"$ACTUAL"; then
    NUMSTAT="$(git diff --numstat "${FORK_REF}:${PIN_FILE}" "${COMMIT}:${PREFIX}/${PIN_FILE}" | cut -f1,2)"
    ADDED_LINE="$(git diff "${FORK_REF}:${PIN_FILE}" "${COMMIT}:${PREFIX}/${PIN_FILE}" \
        | sed -n 's/^+\([^+].*\)$/\1/p')"
    if [ "$NUMSTAT" != "$(printf '1\t0')" ] || [ "$ADDED_LINE" != "$PIN_LINE" ]; then
        STATUS=1
        echo -e "${RED}✗ ${PIN_FILE} is not exactly one added line${NC}"
        printf "  Expected one added line and no deletions:\n\n"
        printf "      %s\n\n" "$PIN_LINE"
        printf "  Got %s added/deleted. Anything else means the pull overwrote\n" "${NUMSTAT//$'\t'/ added, }"
        printf "  something in this file.\n\n"
    fi
fi

if [ "$STATUS" -eq 0 ]; then
    echo -e "${GREEN}✓${NC} ${PREFIX} diverges from ${FORK_REF} by exactly the expected ${#EXPECTED[@]} entries"
fi

exit "$STATUS"
