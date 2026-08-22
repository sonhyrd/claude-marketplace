#!/usr/bin/env bash
#
# Tests for scripts/check-delegate-cli.sh.
#
# The check asks a live Orca binary whether every command delegate-tickets names
# actually exists. So the thing under test is a conversation with a binary, and
# the seam is the check's own CLI: a stub `orca`/`orca-ide` on PATH plus a
# fixture skill directory in, an exit code and a named finding out.
#
# Stubs rather than the real binary on purpose. A guard that has only ever been
# run against a host where it happens to pass is not known to catch anything, and
# the real CLI cannot be made to forget a verb on demand.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHECK="${REPO_ROOT}/scripts/check-delegate-cli.sh"

PASS=0
FAIL=0
TMPROOT=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

cleanup() {
    if [ -n "$TMPROOT" ] && [ -d "$TMPROOT" ]; then
        rm -rf "$TMPROOT"
    fi
}
trap cleanup EXIT

TMPROOT="$(mktemp -d "${TMPDIR:-/tmp}/delegate-cli-check.XXXXXX")"

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

# --- Stub binaries ------------------------------------------------------------
#
# The stub answers the same three questions the real CLI does -- does this group
# exist, does this verb exist, does this verb take this flag -- from a tiny
# table, and in the same shape: a `Commands:` list for a group, a `Usage:` line
# and an `Options:` list for a verb. Anything not in the table is unknown, which
# is how a planted defect is planted.

# $1 = directory to write into, $2 = binary name.
write_stub_cli() {
    local dir="$1" name="$2"
    mkdir -p "$dir"
    cat > "${dir}/${name}" <<'STUB'
#!/usr/bin/env bash
set -u

group="${1:-}"
verb="${2:-}"

emit_group() {
    printf 'orca %s\n\nUsage: orca %s <command> [options]\n\nCommands:\n' "$group" "$group"
    printf '  %s\n' $1
    exit 0
}

emit_verb() {
    printf 'orca %s %s\n\nUsage: orca %s %s %s\n\nOptions:\n  --help  Show this help message\n' \
        "$group" "$verb" "$group" "$verb" "$1"
    printf '  %s\n' $1
    printf '\nNotes:\n  See also --notes-only-flag, which lives here and nowhere else.\n'
    exit 0
}

case "${group}:${verb}" in
    orchestration:--help)  emit_group "run-create check send task-create task-update worker-start worker-read worker-release" ;;
    orchestration:check)   emit_verb "--ack --wait --types --timeout-ms --json" ;;
    orchestration:task-create) emit_verb "--spec --json" ;;
    orchestration:task-update) emit_verb "--status --json" ;;
    orchestration:worker-start) emit_verb "--base-branch --json" ;;
    terminal:--help)       emit_group "list read send wait create close" ;;
    terminal:create)       emit_verb "--command --worktree --json" ;;
    terminal:wait)         emit_verb "--for --timeout-ms --json" ;;
    terminal:read)         emit_verb "--json" ;;
    terminal:send)         emit_verb "--text --enter --json" ;;
    worktree:--help)       emit_group "list create rm" ;;
    worktree:create)       emit_verb "--base-branch --name --json" ;;
esac

printf 'orca: unknown command: %s %s\n' "$group" "$verb" >&2
exit 1
STUB
    chmod +x "${dir}/${name}"
}

# The Electron launcher: prints a single-instance notice and exits 0, whatever
# it is asked. This is the whole bare-`orca` defect, reproduced.
write_stub_launcher() {
    local dir="$1" name="$2"
    mkdir -p "$dir"
    cat > "${dir}/${name}" <<'STUB'
#!/usr/bin/env bash
echo "[single-instance] Another Orca instance is already running; exiting this launch."
exit 0
STUB
    chmod +x "${dir}/${name}"
}

# $1 = skill dir to create, $2 = SKILL.md body.
write_skill() {
    local dir="$1" body="$2"
    mkdir -p "${dir}/references"
    printf '%s\n' "$body" > "${dir}/SKILL.md"
}

# Run the check with a controlled PATH and skill dir.
# $1 = bin dir (may be empty for "no binary at all"), $2 = skill dir.
run_check() {
    local bindir="$1" skilldir="$2"
    shift 2
    env -u ORCA_PANE_KEY -u ORCA_TERMINAL_HANDLE -u TERM_PROGRAM \
        PATH="${bindir}:/usr/bin:/bin" \
        DELEGATE_CLI_SKILL_DIR="$skilldir" \
        "$CHECK" "$@" 2>&1
}

echo ""
echo -e "${YELLOW}Running check-delegate-cli.sh tests...${NC}"
echo ""

if [ ! -x "$CHECK" ]; then
    echo -e "${RED}FATAL:${NC} $CHECK is missing or not executable"
    exit 1
fi

# --- No binary: skip, don't fail ----------------------------------------------

echo -e "${YELLOW}With no Orca binary present the check skips${NC}"

EMPTY_BIN="${TMPROOT}/empty-bin"
mkdir -p "$EMPTY_BIN"
SKILL_OK="${TMPROOT}/skill-ok"
write_skill "$SKILL_OK" 'Probe with `orca orchestration task-create --spec "PROBE" --json`.'

out="$(run_check "$EMPTY_BIN" "$SKILL_OK")" && rc=0 || rc=$?
if [ "$rc" -eq 0 ] && grep -qi "skip" <<<"$out"; then
    ok "no Orca binary on PATH exits 0 and says it skipped"
else
    nope "no Orca binary on PATH exits 0 and says it skipped" "rc=$rc: $out"
fi

# --- The happy path: every command the skill names exists ----------------------

echo -e "${YELLOW}A skill whose commands all exist passes${NC}"

CLI_BIN="${TMPROOT}/cli-bin"
write_stub_cli "$CLI_BIN" orca-ide

SKILL_GOOD="${TMPROOT}/skill-good"
write_skill "$SKILL_GOOD" 'Probe with `orca orchestration task-create --spec "PROBE" --json`,
then rest in

```bash
orca orchestration check --ack <delivery_id> --wait \
  --types worker_done --timeout-ms 900000 --json
```

and cut the worktree with `orca worktree create --base-branch <ref> --json`.'

out="$(run_check "$CLI_BIN" "$SKILL_GOOD")" && rc=0 || rc=$?
if [ "$rc" -eq 0 ]; then
    ok "a skill naming only live verbs and flags exits 0"
else
    nope "a skill naming only live verbs and flags exits 0" "rc=$rc: $out"
fi

if grep -q "orchestration task-create" <<<"$out" && grep -q "worktree create" <<<"$out"; then
    ok "the report names the commands it verified"
else
    nope "the report names the commands it verified" "$out"
fi

# --- A planted bad verb --------------------------------------------------------

echo -e "${YELLOW}A verb the binary does not have is caught and named${NC}"

SKILL_BAD_VERB="${TMPROOT}/skill-bad-verb"
write_skill "$SKILL_BAD_VERB" 'Retire the probe with `orca orchestration task-delete --json`.'

out="$(run_check "$CLI_BIN" "$SKILL_BAD_VERB")" && rc=0 || rc=$?
if [ "$rc" -eq 1 ] \
    && grep -qi "MISSING VERB" <<<"$out" \
    && grep -q "task-delete" <<<"$out"; then
    ok "a verb the CLI does not have exits 1 and is reported as a missing verb"
else
    nope "a verb the CLI does not have exits 1 and is reported as a missing verb" "rc=$rc: $out"
fi

# The live verb list belongs in the report: an operator who is told `task-delete`
# does not exist still has to go find what does.
if grep -q "task-update" <<<"$out"; then
    ok "the missing-verb report lists the verbs the group does have"
else
    nope "the missing-verb report lists the verbs the group does have" "$out"
fi

# --- A planted bad flag --------------------------------------------------------

echo -e "${YELLOW}A flag the binary does not have is caught, and told apart from a verb${NC}"

SKILL_BAD_FLAG="${TMPROOT}/skill-bad-flag"
write_skill "$SKILL_BAD_FLAG" 'Rest in `orca orchestration check --nack <delivery_id> --wait`.'

out="$(run_check "$CLI_BIN" "$SKILL_BAD_FLAG")" && rc=0 || rc=$?
if [ "$rc" -eq 1 ] \
    && grep -qi "MISSING FLAG" <<<"$out" \
    && grep -q -- "--nack" <<<"$out"; then
    ok "a flag on a live verb exits 1 and is reported as a missing flag"
else
    nope "a flag on a live verb exits 1 and is reported as a missing flag" "rc=$rc: $out"
fi

# The two failures are different repairs -- rename the verb, or drop the flag --
# so a report that cannot tell them apart makes the operator diff the help
# themselves.
if ! grep -qi "MISSING VERB" <<<"$out"; then
    ok "a missing flag is not also reported as a missing verb"
else
    nope "a missing flag is not also reported as a missing verb" "$out"
fi

# A flag quoted in another command's Notes is not evidence this verb takes it.
SKILL_NOTES_FLAG="${TMPROOT}/skill-notes-flag"
write_skill "$SKILL_NOTES_FLAG" 'Run `orca orchestration check --notes-only-flag`.'
out="$(run_check "$CLI_BIN" "$SKILL_NOTES_FLAG")" && rc=0 || rc=$?
if [ "$rc" -eq 1 ] && grep -q -- "--notes-only-flag" <<<"$out"; then
    ok "a flag that appears only in the help's Notes is not accepted"
else
    nope "a flag that appears only in the help's Notes is not accepted" "rc=$rc: $out"
fi

# --- The bare-`orca`-exits-0 host ----------------------------------------------

echo -e "${YELLOW}Bare \`orca\` that exits 0 without orchestrating is caught${NC}"

# The defect this whole check exists for: both names are on PATH, `orca` is the
# Electron launcher, and every `orca ...` line in the skill is a silent no-op
# that returns a clean exit code.
BOTH_BIN="${TMPROOT}/both-bin"
write_stub_cli "$BOTH_BIN" orca-ide
write_stub_launcher "$BOTH_BIN" orca

out="$(run_check "$BOTH_BIN" "$SKILL_GOOD")" && rc=0 || rc=$?
if [ "$rc" -eq 1 ] && grep -qi "BARE BINARY" <<<"$out"; then
    ok "a launcher \`orca\` alongside a working \`orca-ide\` exits 1"
else
    nope "a launcher \`orca\` alongside a working \`orca-ide\` exits 1" "rc=$rc: $out"
fi

if grep -q "orca-ide" <<<"$out" && grep -qi "exits 0" <<<"$out"; then
    ok "the bare-binary report names the working binary and why the other one lies"
else
    nope "the bare-binary report names the working binary and why the other one lies" "$out"
fi

# Same skill, a host with only the working CLI: `orca` cannot silently no-op
# where it does not exist, so the finding must not fire.
out="$(run_check "$CLI_BIN" "$SKILL_GOOD")" && rc=0 || rc=$?
if [ "$rc" -eq 0 ]; then
    ok "the bare-binary finding does not fire where no launcher \`orca\` exists"
else
    nope "the bare-binary finding does not fire where no launcher \`orca\` exists" "rc=$rc: $out"
fi

# --- A superseded path ---------------------------------------------------------

echo -e "${YELLOW}An obsolete dispatch path is caught while every token still resolves${NC}"

# The skill spells this one without its binary prefix, exactly as SKILL.md does.
# Groups are learned from the prefixed invocations and then looked for
# everywhere, so an unprefixed line is still a command.
SKILL_OBSOLETE="${TMPROOT}/skill-obsolete"
write_skill "$SKILL_OBSOLETE" 'A wide fan-out makes `orca terminal create` block.
Launch it with `terminal create --command "<engine argv>"`.'

out="$(run_check "$CLI_BIN" "$SKILL_OBSOLETE")" && rc=0 || rc=$?
if [ "$rc" -eq 1 ] && grep -qi "SUPERSEDED" <<<"$out" && grep -q "worker-start" <<<"$out"; then
    ok "terminal create --command is reported as superseded, naming worker-start"
else
    nope "terminal create --command is reported as superseded, naming worker-start" "rc=$rc: $out"
fi

# It is not a missing verb or a missing flag: every token in it exists.
if ! grep -qiE "MISSING (VERB|FLAG)" <<<"$out"; then
    ok "a superseded path is not misreported as something missing"
else
    nope "a superseded path is not misreported as something missing" "$out"
fi

# --- A doc that names no command at all is a setup error, not a pass -----------

echo -e "${YELLOW}A skill with nothing to check fails loudly${NC}"

# Groups are learned from prefixed invocations, so a scan that finds none has
# learned nothing and verified nothing. Exiting 0 there would report an
# unscanned skill as a clean one.
SKILL_EMPTY="${TMPROOT}/skill-empty"
write_skill "$SKILL_EMPTY" 'Read the profile, then `git merge-base main HEAD`.'

out="$(run_check "$CLI_BIN" "$SKILL_EMPTY")" && rc=0 || rc=$?
if [ "$rc" -eq 2 ]; then
    ok "a skill naming no orca command exits 2 rather than passing silently"
else
    nope "a skill naming no orca command exits 2 rather than passing silently" "rc=$rc: $out"
fi

# A group named with no verb after it is the same nothing: `orca orchestration
# --help` tells the reader to go read the help, and names no command to check.
# It clears the group gate, so without its own guard the scan reaches the verdict
# loop with an empty command list.
SKILL_GROUP_ONLY="${TMPROOT}/skill-group-only"
write_skill "$SKILL_GROUP_ONLY" 'Read `orca orchestration --help` and use what it prints.'

out="$(run_check "$CLI_BIN" "$SKILL_GROUP_ONLY")" && rc=0 || rc=$?
if [ "$rc" -eq 2 ] && grep -qi "no .orca <group> <verb>. invocation" <<<"$out"; then
    ok "a skill naming a group but no verb exits 2 and says so"
else
    nope "a skill naming a group but no verb exits 2 and says so" "rc=$rc: $out"
fi

# And a skill directory that does not exist is a setup error even where there is
# no binary to ask -- otherwise a typo'd path reads as a clean skip.
out="$(run_check "$EMPTY_BIN" "${TMPROOT}/no-such-skill")" && rc=0 || rc=$?
if [ "$rc" -eq 2 ] && grep -qi "skill directory not found" <<<"$out"; then
    ok "a missing skill directory exits 2 rather than skipping"
else
    nope "a missing skill directory exits 2 rather than skipping" "rc=$rc: $out"
fi

# --- Commands written with neither binary nor group ----------------------------

echo -e "${YELLOW}A command written with no binary and no group is still checked${NC}"

SKILL_UNPREFIXED="${TMPROOT}/skill-unprefixed"
write_skill "$SKILL_UNPREFIXED" 'Probe with `orca orchestration task-create --json`.
Retire it by completing it: `task-update --state completed`.'

out="$(run_check "$CLI_BIN" "$SKILL_UNPREFIXED")" && rc=0 || rc=$?
if [ "$rc" -eq 1 ] && grep -qi "MISSING FLAG" <<<"$out" && grep -q -- "--state" <<<"$out"; then
    ok "a bare \`task-update --state\` is resolved to its group and its flag checked"
else
    nope "a bare \`task-update --state\` is resolved to its group and its flag checked" "rc=$rc: $out"
fi

# A verb more than one group owns cannot be resolved without guessing, and a
# guess would check its flags against the wrong help -- so it is left alone.
SKILL_AMBIGUOUS="${TMPROOT}/skill-ambiguous"
write_skill "$SKILL_AMBIGUOUS" 'Probe with `orca orchestration task-create --json`.
Then `create --no-such-flag`, which could be a terminal or a worktree.'

out="$(run_check "$CLI_BIN" "$SKILL_AMBIGUOUS")" && rc=0 || rc=$?
if [ "$rc" -eq 0 ]; then
    ok "a verb owned by more than one group is not resolved by guessing"
else
    nope "a verb owned by more than one group is not resolved by guessing" "rc=$rc: $out"
fi

# --- Summary ------------------------------------------------------------------

echo ""
echo -e "${YELLOW}Results:${NC} ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo ""

[ "$FAIL" -eq 0 ]
