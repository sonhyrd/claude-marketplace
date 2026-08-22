#!/usr/bin/env bash
#
# check-delegate-cli.sh -- ask the live Orca binary whether every command the
# delegate-tickets skill names actually exists.
#
# Why this exists: the defect class behind the skill's rewrite is "the skill
# documents a CLI the binary does not have" -- a bare `orca` that exits 0
# without orchestrating anything, a verb that was renamed, a flag that never
# existed. Text review cannot catch any of it, and `make validate` is static and
# offline by design.
#
# Deliberately NOT part of `make validate`, for the same reason
# check-e2e-subtree.sh is not: that suite is static and offline, and this one
# only means anything when it can talk to a running binary.
#
# Exit codes:
#   0  every command the skill names exists in the live CLI (or no binary: skip)
#   1  findings -- a missing group, verb or flag, a bare-`orca` invocation that
#      this host answers with exit 0, or a path the live CLI has superseded
#   2  setup error -- skill directory missing, a binary that answers nothing, or
#      a skill directory in which no orca command was found to check
#
# Overrides (used by tests/bash/test-delegate-cli.sh):
#   DELEGATE_CLI_SKILL_DIR  skill to scan (default: the delegate-tickets skill)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_DIR="${DELEGATE_CLI_SKILL_DIR:-${REPO_ROOT}/plugins/sss/skills/delegate-tickets}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

usage() {
    cat <<EOF
Usage: $(basename "$0") [--help]

Ask the live Orca CLI whether every command the delegate-tickets skill names
actually exists: the group, the verb, and each flag the skill passes to it.

Scans every *.md under:
  ${SKILL_DIR}
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help) usage; exit 0 ;;
        *) echo -e "${RED}error:${NC} unknown argument: $1" >&2; usage >&2; exit 2 ;;
    esac
    shift
done

setup_error() {
    echo -e "${RED}✗ setup error:${NC} $1" >&2
    exit 2
}

# A skill directory that is not there is a setup error wherever it is noticed,
# and noticing it before the binary keeps it from hiding behind the no-binary
# skip on a host that has no Orca at all.
[ -d "$SKILL_DIR" ] || setup_error "skill directory not found: ${SKILL_DIR}"

# --- Resolve the binary the way the skill has to ------------------------------
#
# `orca` inside an Orca-managed pane, `orca-ide` outside one -- but preference is
# not proof. Both names exist on a Linux host and one of them is the Electron
# launcher, which answers every question with a single-instance notice and exit
# 0. So the preference only orders the candidates; what selects one is whether it
# answers `orchestration --help`.
answers_orchestration() {
    # Materialize the help before matching it. Under `pipefail`, `grep -q`
    # exiting on the first match can SIGPIPE the binary and turn a match into a
    # non-zero pipeline -- which here reads as "this CLI answers nothing" about
    # the one that does.
    local help
    help="$("$1" orchestration --help 2>/dev/null || true)"
    grep -q '^Usage: orca orchestration' <<<"$help"
}

in_orca_pane() {
    [ -n "${ORCA_PANE_KEY:-}" ] || [ "${TERM_PROGRAM:-}" = "Orca" ]
}

if in_orca_pane; then
    CANDIDATES=(orca orca-ide)
else
    CANDIDATES=(orca-ide orca)
fi

BIN=""
PRESENT=()
for candidate in "${CANDIDATES[@]}"; do
    command -v "$candidate" >/dev/null 2>&1 || continue
    PRESENT+=("$candidate")
    if [ -z "$BIN" ] && answers_orchestration "$candidate"; then
        BIN="$candidate"
    fi
done

if [ "${#PRESENT[@]}" -eq 0 ]; then
    echo -e "${YELLOW}⊘ skipped:${NC} no Orca binary on PATH (looked for: ${CANDIDATES[*]})."
    printf "  This check only means something against a running Orca CLI, so it\n"
    printf "  skips rather than failing where there is nothing to ask.\n"
    exit 0
fi

if [ -z "$BIN" ]; then
    setup_error "$(printf 'found %s on PATH, but none of them answers `orchestration --help`.\n  That is not a skill defect -- it is a host with no working Orca CLI.\n' "${PRESENT[*]}")"
fi

if [ "$BIN" != "${CANDIDATES[0]}" ]; then
    echo -e "${GREEN}✓${NC} resolved Orca CLI: ${BIN} (${CANDIDATES[0]} is present but answers nothing)"
else
    echo -e "${GREEN}✓${NC} resolved Orca CLI: ${BIN}"
fi

# --- Ask the binary -----------------------------------------------------------

declare -A GROUP_VERBS=()
declare -A GROUP_OK=()

load_group() {
    local grp="$1" help
    [ -z "${GROUP_OK[$grp]+set}" ] || return 0
    help="$("$BIN" "$grp" --help 2>/dev/null || true)"
    if ! grep -q "^Usage: orca ${grp}" <<<"$help"; then
        GROUP_OK["$grp"]=0
        GROUP_VERBS["$grp"]=""
        return 0
    fi
    GROUP_OK["$grp"]=1
    GROUP_VERBS["$grp"]=" $(awk '
        /^Commands:/ { inlist = 1; next }
        inlist && /^[[:space:]]+[a-z][a-z0-9-]*/ { print $1 }
        inlist && /^[^[:space:]]/ { inlist = 0 }
    ' <<<"$help" | tr '\n' ' ')"
}

declare -A VERB_HELP=()

load_verb_help() {
    local grp="$1" verb="$2" key="$1 $2"
    [ -z "${VERB_HELP[$key]+set}" ] || return 0
    # Truncate at Notes/Examples: those sections quote *other* commands' flags
    # (`worktree create`'s notes recommend `terminal create --command`), so a
    # flag found there is not evidence that this verb takes it.
    VERB_HELP["$key"]="$("$BIN" "$grp" "$verb" --help 2>/dev/null \
        | awk '/^(Notes|Examples):/ { exit } { print }' || true)"
}

has_flag() {
    local help="$1" flag="$2"
    grep -qE -e "(^|[^A-Za-z0-9_-])${flag}([^A-Za-z0-9_-]|$)" <<<"$help"
}

# --- Extract every command the skill names ------------------------------------
#
# Two shapes carry a command in these docs and both are scanned: fenced code
# blocks (where a command can wrap across lines with a trailing backslash) and
# inline code spans (where it can wrap across lines with no marker at all --
# `orca worktree\ncreate` is one span, and a line-by-line scan would miss it).
# Prose outside a code span is deliberately not scanned: a sentence mentioning a
# verb is not an instruction to run it.

# One fence walker, asked twice: `--inside` joins each fenced block's
# backslash-continued lines into whole commands, `--outside` hands back the
# prose for the span scan below.
fence_scan() {
    awk -v want="$2" '
        BEGIN { fence = 0; buf = "" }
        /^[[:space:]]*```/ { fence = !fence; next }
        (fence ? 1 : 0) != want { next }
        want == 0 { print; next }
        {
            line = $0
            if (buf != "") { line = buf " " line }
            if (line ~ /\\$/) { sub(/\\$/, "", line); buf = line }
            else { print line; buf = "" }
        }
    ' "$1"
}

fenced_commands() {
    fence_scan "$1" 1
}

inline_spans() {
    fence_scan "$1" 0 | tr '\n' ' ' | grep -o '`[^`]*`' || true
}

CAND_FILE=()
CAND_TEXT=()

while IFS= read -r doc; do
    rel="${doc#"${SKILL_DIR}"/}"
    while IFS= read -r line; do
        [ -n "${line// /}" ] || continue
        CAND_FILE+=("$rel")
        CAND_TEXT+=(" ${line//\`/ } ")
    done < <(fenced_commands "$doc"; inline_spans "$doc")
done < <(find "$SKILL_DIR" -type f -name '*.md' | LC_ALL=C sort)

[ "${#CAND_TEXT[@]}" -gt 0 ] || setup_error "no code spans or code blocks found under ${SKILL_DIR}"

# Pass 1: the command groups are whatever the docs put directly after the binary
# name. Deriving them rather than hardcoding them is what lets pass 2 catch a
# command written without its `orca ` prefix -- `terminal send --text "a"` is an
# instruction to run a command whether or not the sentence spelled the binary.
declare -A GROUP_SEEN=()
for text in "${CAND_TEXT[@]}"; do
    while read -r _ grp; do
        [ -n "${grp:-}" ] || continue
        case "$grp" in -*) continue ;; esac
        GROUP_SEEN["$grp"]=1
    done < <(grep -oE '(^|[[:space:]])(orca|orca-ide)[[:space:]]+[a-z][a-z0-9-]*' <<<"$text" || true)
done

[ "${#GROUP_SEEN[@]}" -gt 0 ] || setup_error "no 'orca <group> <verb>' invocation found under ${SKILL_DIR}"

DOC_GROUPS=()
while IFS= read -r g; do DOC_GROUPS+=("$g"); done < <(printf '%s\n' "${!GROUP_SEEN[@]}" | LC_ALL=C sort)

# Pass 2: every `<group> <verb>` occurrence, with the flags that follow it.
declare -A CMD_FLAGS=()
declare -A CMD_SRC=()
declare -A CMD_BARE=()
CMDS=()

# The flags of one invocation are the `--x` tokens that follow it, up to
# whatever starts the next one.
flags_after() {
    local seg="$1" sep
    for sep in ' orca ' ' orca-ide ' ' && ' ' ; ' ' | '; do
        seg="${seg%%"$sep"*}"
    done
    grep -oE -e '--[a-z][a-z0-9-]*' <<<"$seg" | LC_ALL=C sort -u | tr '\n' ' ' || true
}

record() {
    local key="$1" flags="$2" src="$3" bare="$4"
    if [ -z "${CMD_FLAGS[$key]+set}" ]; then
        CMDS+=("$key")
        CMD_FLAGS["$key"]=" "
        CMD_SRC["$key"]=""
    fi
    local flag
    # shellcheck disable=SC2086  # $flags is a space-separated list, split on purpose
    for flag in $flags; do
        case "${CMD_FLAGS[$key]}" in *" ${flag} "*) ;; *) CMD_FLAGS["$key"]+="${flag} " ;; esac
    done
    case " ${CMD_SRC[$key]} " in *" ${src} "*) ;; *) CMD_SRC["$key"]+="${src} " ;; esac
    [ "$bare" = "bare" ] && CMD_BARE["$key"]=1
    return 0
}

for i in "${!CAND_TEXT[@]}"; do
    text="${CAND_TEXT[$i]}"
    src="${CAND_FILE[$i]}"
    for grp in "${DOC_GROUPS[@]}"; do
        rest="$text"
        while [[ "$rest" =~ (^|[[:space:]])((orca|orca-ide)[[:space:]]+)?"${grp}"[[:space:]]+([a-z][a-z0-9-]*) ]]; do
            prefix="${BASH_REMATCH[3]:-}"
            verb="${BASH_REMATCH[4]}"
            tail="${rest#*"${BASH_REMATCH[0]}"}"
            # Flags belong to the invocation they follow, so stop at anything
            # that starts a new one.
            flags="$(flags_after "$tail")"
            if [ "$prefix" = "orca" ]; then
                record "${grp} ${verb}" "$flags" "$src" bare
            else
                record "${grp} ${verb}" "$flags" "$src" ""
            fi
            rest="$tail"
        done
    done
done

# Pass 3: a command can be written with neither its binary nor its group --
# `task-update --status completed` is an instruction to run one. Matching those
# needs the live verb lists, and it is only safe where a verb belongs to exactly
# one of the groups the docs use: `create` alone could be a terminal or a
# worktree, and guessing would check its flags against the wrong help. A flag is
# required too, so an English sentence that happens to contain a verb is not
# mistaken for an invocation.
declare -A VERB_OWNER=()
for grp in "${DOC_GROUPS[@]}"; do
    load_group "$grp"
    # shellcheck disable=SC2086  # the verb list is space-separated, split on purpose
    for verb in ${GROUP_VERBS[$grp]}; do
        if [ -n "${VERB_OWNER[$verb]+set}" ]; then
            VERB_OWNER["$verb"]="ambiguous"
        else
            VERB_OWNER["$verb"]="$grp"
        fi
    done
done

for i in "${!CAND_TEXT[@]}"; do
    text="${CAND_TEXT[$i]}"
    src="${CAND_FILE[$i]}"
    for verb in "${!VERB_OWNER[@]}"; do
        grp="${VERB_OWNER[$verb]}"
        [ "$grp" != "ambiguous" ] || continue
        rest="$text"
        while [[ "$rest" =~ (^|[[:space:]])"${verb}"[[:space:]]+-- ]]; do
            tail="${rest#*"${BASH_REMATCH[0]}"}"
            flags="$(flags_after "--${tail}")"
            record "${grp} ${verb}" "$flags" "$src" ""
            rest="$tail"
        done
    done
done

# A group with no verb after it satisfies the pass-1 gate and leaves nothing to
# check -- `orca orchestration --help` is a doc telling you to read the help, not
# an invocation. Nothing was scanned, so this is the same setup error as finding
# no command at all rather than a clean run.
[ "${#CMDS[@]}" -gt 0 ] || setup_error "found no 'orca <group> <verb>' invocation under ${SKILL_DIR} -- only bare groups (${DOC_GROUPS[*]}), which name no command to check"

# --- Verdict ------------------------------------------------------------------

FINDINGS=()
VERIFIED=0

while IFS= read -r key; do
    grp="${key%% *}"
    verb="${key##* }"
    load_group "$grp"
    src="${CMD_SRC[$key]% }"

    if [ "${GROUP_OK[$grp]}" -eq 0 ]; then
        FINDINGS+=("MISSING GROUP|orca ${key}|${src}|\`${grp}\` is not a command group in ${BIN}.")
        echo -e "  ${RED}✗${NC} ${key} — no such group"
        continue
    fi

    case "${GROUP_VERBS[$grp]}" in
        *" ${verb} "*) ;;
        *)
            FINDINGS+=("MISSING VERB|orca ${key}|${src}|\`${grp}\` has no verb \`${verb}\`. It has:${GROUP_VERBS[$grp]}")
            echo -e "  ${RED}✗${NC} ${key} — no such verb"
            continue
            ;;
    esac

    load_verb_help "$grp" "$verb"
    bad=""
    # shellcheck disable=SC2086  # the flag list is space-separated, split on purpose
    for flag in ${CMD_FLAGS[$key]}; do
        has_flag "${VERB_HELP[$key]}" "$flag" || bad+="${flag} "
    done

    if [ -n "$bad" ]; then
        FINDINGS+=("MISSING FLAG|orca ${key} ${bad% }|${src}|\`${grp} ${verb}\` exists, but takes no ${bad% }.")
        echo -e "  ${RED}✗${NC} ${key} — unknown flag(s): ${bad% }"
    else
        VERIFIED=$((VERIFIED + 1))
        echo -e "  ${GREEN}✓${NC} ${key}${CMD_FLAGS[$key]% }"
    fi
done < <(printf '%s\n' "${CMDS[@]}" | LC_ALL=C sort)

# The bare-`orca` trap. This fires on evidence, not on spelling: it needs an
# `orca` on PATH that does NOT answer `orchestration --help`, which is the
# Electron launcher -- it prints a single-instance notice and exits 0 for every
# argument list it is given. A skill that spells its commands `orca ...` on such
# a host orchestrates nothing and reads as a clean run.
if [ "${#CMD_BARE[@]}" -gt 0 ] \
    && command -v orca >/dev/null 2>&1 && ! answers_orchestration orca; then
    bare_list=""
    while IFS= read -r key; do
        bare_list+="orca ${key} (${CMD_SRC[$key]% }); "
    done < <(printf '%s\n' "${!CMD_BARE[@]}" | LC_ALL=C sort)
    FINDINGS+=("BARE BINARY|orca <group> <verb>|${bare_list%; }|\`orca\` on this host does not answer \`orchestration --help\` -- it exits 0 without running anything. These invocations are silent no-ops; resolve the binary (${BIN}) instead of spelling \`orca\`.")
fi

# Superseded paths. A path is not missing -- every token in it still resolves --
# so nothing above can see it. Each entry fires only when its replacement verb
# exists in the live binary, so the finding is evidence from this CLI rather than
# an opinion held in this script.
SUPERSEDED=(
    "terminal create|--command|orchestration worker-start|A worker launched with \`terminal create --command\` and dispatched into is UNSUPERVISED: no worker Dispatch row, and \`worker-stop\`/\`worker-release\` take no action on it. \`orchestration worker-start\` exists in this binary and composes the worktree, the terminal, readiness and the dispatch in one supervised call."
)

for entry in "${SUPERSEDED[@]}"; do
    old="${entry%%|*}"; rem="${entry#*|}"
    flag="${rem%%|*}"; rem="${rem#*|}"
    repl="${rem%%|*}"; reason="${rem#*|}"
    [ -n "${CMD_FLAGS[$old]+set}" ] || continue
    case "${CMD_FLAGS[$old]}" in *" ${flag} "*) ;; *) continue ;; esac
    load_group "${repl%% *}"
    case "${GROUP_VERBS[${repl%% *}]}" in
        *" ${repl##* } "*)
            FINDINGS+=("SUPERSEDED PATH|orca ${old} ${flag}|${CMD_SRC[$old]% }|${reason}")
            ;;
    esac
done

echo ""
if [ "${#FINDINGS[@]}" -eq 0 ]; then
    echo -e "${GREEN}✓${NC} ${VERIFIED} commands from ${SKILL_DIR#"${REPO_ROOT}"/} all exist in ${BIN}"
    exit 0
fi

echo -e "${RED}✗ ${#FINDINGS[@]} finding(s)${NC} — the skill names commands this binary does not have:"
echo ""
for finding in "${FINDINGS[@]}"; do
    kind="${finding%%|*}"; rem="${finding#*|}"
    cmd="${rem%%|*}"; rem="${rem#*|}"
    where="${rem%%|*}"; why="${rem#*|}"
    printf "  %b%s%b  %s\n" "$RED" "$kind" "$NC" "$cmd"
    printf "      in: %s\n" "$where"
    printf "      %s\n\n" "$why"
done
printf "%b%d of %d commands verified against %s.%b\n" \
    "$YELLOW" "$VERIFIED" "${#CMDS[@]}" "$BIN" "$NC"

exit 1
