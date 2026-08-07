#!/usr/bin/env bash
#
# Tests that sss:pr-review's handoff artifact matches the schema e2e:pw-prove
# defines for it.
#
# pw-prove owns the schema as its only reader; pr-review is the producer and
# carries a copy of the field list so its Step 6 is executable without a second
# file read. Two copies of a contract in two plugins is exactly the thing that
# drifts silently: the producer keeps writing a key the consumer stopped reading
# and nothing anywhere fails — an unparseable handoff is one pw-prove is told to
# ignore without complaint, so the run just quietly loses the review. This test
# is what fails instead.
#
# The consumer lives under plugins/e2e-skills/, which is a subtree of the fork
# and byte-identical to it. So a `git subtree pull` that renames that heading or
# edits the schema breaks this test — deliberately. That is the alarm working:
# `make check-e2e-subtree` sees an unchanged prefix and has nothing to say about
# a contract the marketplace side no longer meets.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONSUMER="${REPO_ROOT}/plugins/e2e-skills/skills/pw-prove/SKILL.md"
PRODUCER="${REPO_ROOT}/plugins/sss/skills/pr-review/SKILL.md"
CONSUMER_MARKER='Read the handoff artifact'
PRODUCER_MARKER='Write the handoff artifact'
ARTIFACT_PATH='.pw-prove/handoff.json'
MIN_KEYS=5

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
        printf "      %s\n" "$2"
    fi
}

# Every key of the first ```jsonc block at or after $2 in file $1 — the nested
# ones inside `findings` and `fixes_applied` as well as the top level, because
# `severity` and `commit` are exactly the names a drifting producer renames.
# Comments are stripped first so prose in a `//` can never be read as a key.
extract_keys() {
    awk -v marker="$2" '
        index($0, marker) { seen = 1 }
        seen && $0 == "```jsonc" { inblock = 1; next }
        inblock && $0 == "```" { exit }
        inblock {
            line = $0
            sub(/\/\/.*$/, "", line)
            while (match(line, /"[a-z_]+"[[:space:]]*:/)) {
                key = substr(line, RSTART, RLENGTH)
                gsub(/[":[:space:]]/, "", key)
                print key
                line = substr(line, RSTART + RLENGTH)
            }
        }
    ' "$1" | sort -u
}

# A schema that came back near-empty means the heading moved or the fence stopped
# saying `jsonc` — without this, the equality assertion below would compare two
# empty sets and report parity forever. Both sides get the same guard.
assert_schema_found() {
    local label="$1" keys="$2"
    local count=0
    [ -n "$keys" ] && count="$(echo "$keys" | wc -l | tr -d ' ')"

    if [ "$count" -ge "$MIN_KEYS" ]; then
        ok "$label carries the handoff schema (${count} keys)"
        return 0
    fi
    nope "$label: found ${count} schema keys, expected at least ${MIN_KEYS}" \
        "the extractor is looking for a \`\`\`jsonc block under '$3'"
    return 1
}

echo "Running pr-review ↔ pw-prove handoff parity tests..."
echo

for f in "$CONSUMER" "$PRODUCER"; do
    if [ ! -f "$f" ]; then
        nope "missing file: ${f#"$REPO_ROOT"/}"
        echo
        echo -e "${RED}${FAIL} failed${NC}"
        exit 1
    fi
done

consumer_keys="$(extract_keys "$CONSUMER" "$CONSUMER_MARKER")"
producer_keys="$(extract_keys "$PRODUCER" "$PRODUCER_MARKER")"

assert_schema_found "pw-prove (consumer, owns the schema)" "$consumer_keys" "$CONSUMER_MARKER" || true
assert_schema_found "pr-review (producer)" "$producer_keys" "$PRODUCER_MARKER" || true

if [ "$consumer_keys" = "$producer_keys" ]; then
    ok "producer and consumer agree on every key, nested ones included"
else
    nope "handoff schema drift between pr-review and pw-prove" \
        "$(diff <(echo "$consumer_keys") <(echo "$producer_keys") | tr '\n' ' ')"
fi

if echo "$consumer_keys" | grep -qx 'head_sha' && echo "$producer_keys" | grep -qx 'head_sha'; then
    ok "both name head_sha, the one required key"
else
    nope "head_sha missing from one side of the contract"
fi

for f in "$CONSUMER" "$PRODUCER"; do
    if grep -qF "$ARTIFACT_PATH" "$f"; then
        ok "${f#"$REPO_ROOT"/} names $ARTIFACT_PATH"
    else
        nope "${f#"$REPO_ROOT"/} does not name $ARTIFACT_PATH"
    fi
done

echo
if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}${PASS} passed${NC}"
    exit 0
fi
echo -e "${RED}${FAIL} failed${NC}, ${PASS} passed"
exit 1
