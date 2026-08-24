#!/usr/bin/env bash
# Invocation parity — the body's commands against the module that has to accept them.
#
# Issue #149, the shape #122 asks for on the bring-up invocations. Step 7 no longer documents a raw
# runner fallback for the audit, filming or mutation runs: `proof-run.mjs` IS the invocation, so
# every verb and flag SKILL.md tells an agent to type is a claim about that module's interface. A
# claim nothing checks is the class of defect this whole module exists to end — both prose defects
# it was written for were WRONG ARGUMENTS — and with the fallback gone, a body invocation the module
# refuses does not degrade into a slower path: it stops the proof at Step 7 with a usage error.
#
# The module is the ORACLE, never a table copied out of it. Each invocation extracted from the body
# is handed to `proof-run.mjs` itself with dummy values, and the check reads what the module says
# about it. So there is no second copy of the verb list or the per-verb flag sets to drift from the
# one in `VERB_SPEC` — which is the same argument the body makes for having no second copy of the
# commands.
#
# Four parity claims, and they are exactly the four the module can refute:
#   unknown verb 'x'                     the body names a verb the module does not have
#   unknown flag '--x'                   the body passes a flag the module does not parse
#   '--x' belongs to 'v', not to 'w'     the body passes a real flag to the wrong verb
#   --x is required for 'v'              a fenced command is missing a flag the verb requires
# Everything else the module may say about the dummy values — a `--config` that does not exist, a
# `--verdict` that is not a viewport, a `--server-pid` that is not a pid — is about the PLACEHOLDER
# and not about parity, so it is ignored by name.
#
# Two kinds of invocation, checked differently on purpose:
#   FENCED  a command inside a ``` block — the whole command an agent copies, so a missing REQUIRED
#           flag is a finding.
#   PROSE   a `proof-run.mjs <verb>` mention in running text, usually naming one flag ("the same
#           audit invocation with `--grep` added"). Partial by nature, so the required-flag claim
#           does not apply; the module's own required list is discovered by asking it and filled in
#           with dummies, so a misplaced flag still surfaces rather than being masked.
#
# It runs the module in an EMPTY, NON-GIT temporary directory. Argument validation happens before
# `proof-run.mjs` resolves a repository, so every invocation here stops on a placeholder long before
# it could clear a results directory, write state, or start anything.
#
# Self-proof: the check runs green against the real SKILL.md and RED against four deliberately
# mutated copies of it, one per claim. A parity check that cannot be made to fail is not a check.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1

MODULE="skills/pw-prove/scripts/proof-run.mjs"
BODY="skills/pw-prove/SKILL.md"

pass=0; fail=0
ok()  { echo "  [PASS] $1"; pass=$((pass + 1)); }
bad() { echo "  [FAIL] $1"; fail=$((fail + 1)); }

W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
SANDBOX="$W/sandbox"; mkdir -p "$SANDBOX"

# ---------------------------------------------------------------- extraction
# One record per invocation on stdout: "<FENCED|PROSE>\t<verb>\t<flag> <flag> ...".
# Continuation lines (trailing `\`) are joined first, so a fenced command spanning six lines is one
# record. Markdown emphasis and backticks are stripped, because a prose mention wears them.
extract() {
  awk '
    /^[ \t]*```/ { fence = 1 - fence; next }
    {
      line = $0
      # A comment line inside a fenced block documents; it does not invoke.
      if (fence && buf == "" && line ~ /^[ \t]*#/) next
      if (line ~ /\\[ \t]*$/) { sub(/\\[ \t]*$/, "", line); buf = buf line " "; next }
      full = buf line; buf = ""
      if (index(full, "proof-run.mjs") == 0) next
      full = substr(full, index(full, "proof-run.mjs") + length("proof-run.mjs"))
      sub(/[ \t]#.*$/, "", full)          # a trailing shell comment on the joined command
      gsub(/[`*]/, " ", full)             # `code` spans and **bold**
      n = split(full, t, /[ \t]+/)
      verb = ""; flags = ""
      for (i = 1; i <= n; i++) {
        tok = t[i]
        if (tok == "") continue
        if (verb == "" && flags == "" && tok !~ /^-/) {
          if (tok ~ /^[a-z][a-z-]*$/) verb = tok
          else next                        # not a verb position at all — a path, a sentence
          continue
        }
        if (tok ~ /^--/) { sub(/[,.;:)]+$/, "", tok); flags = flags (flags == "" ? "" : " ") tok }
      }
      if (verb == "") next
      printf "%s\t%s\t%s\n", (fence ? "FENCED" : "PROSE"), verb, flags
    }
  ' "$1"
}

# ---------------------------------------------------------------- the oracle
# Ask the module. Prints whatever it said about parity, and nothing when it said nothing.
# usage: ask <kind> <verb> [flags...]
ask() {
  local kind="$1" verb="$2"; shift 2
  local -a args=("$verb")
  local f
  for f in "$@"; do args+=("$f" "X"); done

  local out rc
  if [ "$kind" = "PROSE" ]; then
    # Fill in whatever the module says it requires, discovering the list from the module itself
    # rather than restating it here. Bounded: each round adds one flag, and the module's longest
    # required list is far shorter than this.
    local i
    for i in $(seq 1 24); do
      out=$( cd "$SANDBOX" && PWPROVE_LEDGER=/dev/null node "$REPO_ROOT/$MODULE" "${args[@]}" 2>&1 )
      local missing
      missing=$(printf '%s\n' "$out" | sed -n "s/^proof-run\.mjs: \(--[a-z-]*\) is required for .*/\1/p" | head -1)
      [ -z "$missing" ] && break
      args+=("$missing" "X")
    done
  else
    out=$( cd "$SANDBOX" && PWPROVE_LEDGER=/dev/null node "$REPO_ROOT/$MODULE" "${args[@]}" 2>&1 )
  fi
  rc=$?
  : "$rc"

  printf '%s\n' "$out" | grep -E "unknown verb|unknown flag|belongs to '|is required for '" || true
}

# ---------------------------------------------------------------- the check
# Green (exit 0) when every invocation in <body> is one the module accepts. Prints each finding.
check_body() {
  local body="$1" found=0 kind verb flags
  local records
  records=$(extract "$body")
  if [ -z "$records" ]; then
    echo "    no proof-run.mjs invocation found in $body — the extractor or the body is wrong"
    return 1
  fi
  while IFS=$'\t' read -r kind verb flags; do
    [ -z "$verb" ] && continue
    local said
    # shellcheck disable=SC2086
    said=$(ask "$kind" "$verb" $flags)
    if [ -n "$said" ]; then
      found=1
      printf '    %s `proof-run.mjs %s %s`\n' "$kind" "$verb" "$flags"
      printf '%s\n' "$said" | sed 's/^/      /'
    fi
  done <<< "$records"
  return "$found"
}

# ---------------------------------------------------------------- 1. the real body is green
echo "-- invocation parity: the shipped body --"
inventory=$(extract "$BODY")
echo "  $(printf '%s\n' "$inventory" | grep -c FENCED) fenced, $(printf '%s\n' "$inventory" | grep -c PROSE) prose invocation(s) extracted"
if out=$(check_body "$BODY"); then
  ok "every verb and flag in $BODY is one $MODULE accepts"
else
  bad "$BODY invokes something $MODULE does not accept"
  printf '%s\n' "$out"
fi

# Extraction is load-bearing: a check that silently found nothing would be green forever. Every
# fenced command block for the three verbs must be reached.
for v in audit film mutate; do
  if printf '%s\n' "$inventory" | grep -q "^FENCED	$v	"; then
    ok "the $v command block is reached by the extractor"
  else
    bad "no FENCED invocation of '$v' extracted from $BODY"
  fi
done

# ---------------------------------------------------------------- 2. it goes red against a mutant
# One mutant per claim the module can refute. Each is a plausible edit — a worker override someone
# reaches for, a verb renamed, a flag moved to the neighbouring command, a required flag dropped.
echo "-- invocation parity: deliberately mutated bodies --"

# usage: mutant <name> <perl -0p expression applied to the copied body>
mutant() {
  local name="$1" expr="$2"
  local m="$W/mutant.md"
  cp "$BODY" "$m"
  perl -0pi -e "$expr" "$m" || { bad "$name — the mutation itself did not apply"; return; }
  if cmp -s "$BODY" "$m"; then bad "$name — the mutation changed nothing"; return; fi
  if check_body "$m" >/dev/null 2>&1; then
    bad "$name — the check stayed GREEN against a body it must refuse"
  else
    ok "$name — refused"
  fi
}

mutant "a worker override added to the audit command" \
  's/(proof-run\.mjs audit \\\n)/$1  --workers 4 \\\n/'
mutant "the film verb misspelled in its command block" \
  's/(node <skill-base>\/scripts\/proof-run\.mjs )film/${1}films/'
mutant "--har moved onto the film command" \
  's/(proof-run\.mjs film \\\n)/$1  --har rec.har \\\n/'
mutant "--verdict dropped from the film command" \
  's/  --verdict <the Step-4 Assumptions block.s Effective viewport line, verbatim>/  --project chromium/'

echo ""
echo "invocation parity: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
exit 0
