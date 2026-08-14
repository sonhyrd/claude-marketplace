#!/usr/bin/env bash
# Run the pw-prove eval suite against ONLY the version under test, then report per case whether
# that version actually reached the model.
#
# Why this exists (issue #58). skill-up installs the skill under test and then launches Claude Code
# with the operator's own home directory, so every case also sees whatever the marketplace has
# installed at ~/.claude/plugins/. In the 2026-08-13 run two cases were graded against the stale
# plugin copy of pw-prove rather than the working tree. Deleting the stale copy fixed that run; it
# does not fix the next one, because the next reinstall puts a plugin copy back. Isolation is a
# property of the runtime, not of the current contents of a cache.
#
# So: a fresh HOME per run, carrying the credentials and skill-up's own user config, and no agent
# state at all. No plugins directory, no user-level skills, no host settings.json, and no plugin
# `bin` left on PATH. Claude Code and skill-up agree on where the session transcript lives because
# they read the same HOME, which is why this isolates by HOME rather than by CLAUDE_CONFIG_DIR —
# the latter moves the transcript out from under skill-up's feet.
#
# Isolation is then PROVEN rather than assumed: after the run, every retained transcript goes
# through skills/pw-prove/evals/judges/skill-loaded.mjs, which fails the sweep if any transcript
# references a marketplace plugin path, and reports LOADED / NOT LOADED per case either way.
#
# Usage:
#   bash scripts/run-evals-isolated.sh [skill-up run args...]   # e.g. --include-case-name 'b01-*'
#   bash scripts/run-evals-isolated.sh --sweep-only <dir>       # judge an existing run's workspace
#   bash scripts/run-evals-isolated.sh --self-test              # no API calls, no skill-up
#
# Exit: 0 when the run passed AND no case was contaminated; non-zero otherwise. NOT LOADED is
# reported per case and does not by itself fail the sweep — the case's own judge owns that verdict,
# and non-invocation stays that judge's FAIL.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1

SKILL_DIR="$REPO_ROOT/skills/pw-prove"
EVAL_YAML="$SKILL_DIR/evals/eval.yaml"
GATE="$SKILL_DIR/evals/judges/skill-loaded.mjs"
WORKSPACE="${PWPROVE_EVAL_WORKSPACE:-$SKILL_DIR/pw-prove-workspace}"

MODE=run
SWEEP_DIR=""
if [ "${1:-}" = "--sweep-only" ]; then
  MODE=sweep
  SWEEP_DIR="${2:-}"
  [ -n "$SWEEP_DIR" ] || { echo "run-evals-isolated.sh: --sweep-only needs a directory" >&2; exit 1; }
  shift 2
elif [ "${1:-}" = "--self-test" ]; then
  MODE=self-test
  shift
elif [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"
  exit 0
fi

# --- PATH ------------------------------------------------------------------------------------------
# A fresh HOME is not the only way a plugin reaches the run. Every installed plugin puts its `bin`
# on PATH, and the agent inherits it: the first full run flagged a case whose transcript carried the
# operator's PATH verbatim, marketplace entries and all. Isolation that stops at $HOME leaves the
# plugin one `command -v` away.
scrub_path() {
  printf '%s' "$1" | tr ':' '\n' | grep -vE '/\.claude/plugins/|claude-marketplace/plugins/' | paste -sd: -
}

# --- the sweep ------------------------------------------------------------------------------------
# One gate invocation per case transcript. The gate's exit code is three-valued: 0 LOADED,
# 1 NOT LOADED (or no readable transcript), 2 CONTAMINATED.
sweep() {
  local root="$1" iter case_dir case_id transcript rc verdict
  local loaded=0 notloaded=0 dirty=0 unseen=0 seen=0

  if [ ! -d "$root" ]; then
    echo "  no run workspace at $root — nothing to judge" >&2
    return 1
  fi
  # Newest iteration, or the directory itself when it already is one.
  iter="$(find "$root" -maxdepth 1 -type d -name 'iteration-*' 2>/dev/null | sort -V | tail -1)"
  [ -n "$iter" ] || iter="$root"

  echo ""
  echo "-- did the version under test reach the model? ($iter) --"
  while IFS= read -r case_dir; do
    [ -z "$case_dir" ] && continue
    case_id="$(basename "$case_dir")"
    transcript="$(find "$case_dir" -name '*.jsonl' -type f -size +0 2>/dev/null | sort | head -1)"
    seen=$((seen + 1))
    # A case the gate could not see is its own outcome. Tallying it as NOT LOADED would read as a
    # finding about the skill when it is a finding about the instrument.
    if [ -z "$transcript" ]; then
      printf '  %-34s %s\n' "$case_id" "NO TRANSCRIPT — the gate cannot see this case"
      unseen=$((unseen + 1))
      continue
    fi
    verdict="$(EVAL_TRANSCRIPT_PATH="$transcript" node "$GATE" 2>&1)"
    rc=$?
    case "$rc" in
      0) loaded=$((loaded + 1)); printf '  %-34s %s\n' "$case_id" "LOADED"
         printf '%s\n' "$verdict" | head -1 | sed 's/^/      /' ;;
      2) dirty=$((dirty + 1)); printf '  %-34s %s\n' "$case_id" "CONTAMINATED"
         printf '%s\n' "$verdict" | sed 's/^/      /' ;;
      *) notloaded=$((notloaded + 1)); printf '  %-34s %s\n' "$case_id" "NOT LOADED"
         printf '%s\n' "$verdict" | sed 's/^/      /' | head -3 ;;
    esac
  done < <(find "$iter" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)

  echo ""
  echo "  skill-loaded gate: $loaded loaded, $notloaded not loaded, $dirty contaminated, $unseen unjudgeable (of $seen case(s))"
  if [ "$seen" -eq 0 ]; then
    echo "  no case directories under $iter — the sweep proved nothing" >&2
    return 1
  fi
  # Contamination is a verdict; an unjudgeable case is a broken instrument. Both fail the sweep,
  # because either one means this run does not prove the thing the sweep exists to prove.
  [ "$dirty" -eq 0 ] && [ "$unseen" -eq 0 ]
}

# --- self-test ------------------------------------------------------------------------------------
# The sweep is what turns "isolated" from a claim into a result, so it gets its own seam: a
# synthetic workspace built from the gate's committed fixtures. No API key, no skill-up, no spend.
if [ "$MODE" = "self-test" ]; then
  F="$SKILL_DIR/evals/judges/fixtures/skill-loaded"
  T=$(mktemp -d) || exit 1
  trap 'rm -rf "$T"' EXIT
  export PWPROVE_SKILL_MD="$F/skill-under-test.md"
  for c in loaded-case:pass--explicit-skill-tool \
           blind-case:fail--no-contact-with-the-skill \
           dirty-case:fail--body-served-from-the-plugin-cache; do
    mkdir -p "$T/iteration-1/${c%%:*}/with_skill"
    cp "$F/${c##*:}.jsonl" "$T/iteration-1/${c%%:*}/with_skill/session.jsonl" || exit 1
  done
  out="$(sweep "$T" 2>&1)"; rc=$?
  fail=0
  check() { if printf '%s' "$out" | grep -q "$1"; then echo "  [PASS] $2"; else echo "  [FAIL] $2"; fail=1; fi; }
  echo "-- the sweep reports one verdict per case --"
  check 'loaded-case .*LOADED' 'a case that loaded the skill reads LOADED'
  check 'blind-case .*NOT LOADED' 'a case that never touched the skill reads NOT LOADED'
  check 'dirty-case .*CONTAMINATED' 'a case that reached the plugin cache reads CONTAMINATED'
  check '1 loaded, 1 not loaded, 1 contaminated, 0 unjudgeable' 'the tally counts each verdict once'
  if [ "$rc" -ne 0 ]; then echo "  [PASS] a contaminated case fails the sweep"; else echo "  [FAIL] the sweep stayed green with a contaminated case"; fail=1; fi
  # A sweep with nothing to judge must never read as success — neither an empty workspace nor a
  # case directory that retained no transcript.
  mkdir -p "$T/empty"
  if sweep "$T/empty" >/dev/null 2>&1; then echo "  [FAIL] an empty workspace passed the sweep"; fail=1; else echo "  [PASS] an empty workspace fails rather than passes vacuously"; fi
  mkdir -p "$T/no-transcript/iteration-1/silent-case/with_skill"
  out2="$(sweep "$T/no-transcript" 2>&1)"; rc2=$?
  if [ "$rc2" -ne 0 ] && printf '%s' "$out2" | grep -q '0 loaded, 0 not loaded, 0 contaminated, 1 unjudgeable'; then
    echo "  [PASS] a case with no transcript is unjudgeable, not 'not loaded'"
  else
    echo "  [FAIL] a case with no transcript did not read as unjudgeable"; fail=1
  fi
  echo ""
  echo "-- PATH carries no marketplace plugin into the run --"
  # Built rather than written out: a literal home path here is a security-gate blocker.
  h="$T/fake-home"
  scrubbed="$(scrub_path "/usr/bin:$h/.claude/plugins/cache/m/p/1.0.0/bin:$h/work/claude-marketplace/plugins/e2e-skills/bin:/usr/local/bin")"
  if [ "$scrubbed" = "/usr/bin:/usr/local/bin" ]; then
    echo "  [PASS] plugin bin directories are dropped, everything else survives"
  else
    echo "  [FAIL] scrub_path returned '$scrubbed'"; fail=1
  fi
  echo ""
  [ "$fail" -eq 0 ] && echo "  run-evals-isolated self-test: green" || echo "  run-evals-isolated self-test: RED"
  exit "$fail"
fi

if [ "$MODE" = "sweep" ]; then
  sweep "$SWEEP_DIR"
  exit $?
fi

# --- the isolated home ----------------------------------------------------------------------------
command -v skill-up >/dev/null 2>&1 || { echo "run-evals-isolated.sh: skill-up is not on PATH" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "run-evals-isolated.sh: node is not on PATH" >&2; exit 1; }

ISO="${PWPROVE_EVAL_HOME:-}"
if [ -z "$ISO" ]; then
  ISO="$(mktemp -d -t pwprove-eval-home-XXXXXX)" || exit 1
  # A copy of the operator's credentials lives in here for the length of the run and must not
  # outlive it. Set $PWPROVE_EVAL_HOME to keep one around while debugging the runtime itself.
  trap 'rm -rf "$ISO"' EXIT
fi
mkdir -p "$ISO/.claude" || exit 1

# Credentials, and nothing else, cross the boundary. Never printed, never logged.
if [ -f "$HOME/.claude/.credentials.json" ]; then
  cp "$HOME/.claude/.credentials.json" "$ISO/.claude/.credentials.json" || exit 1
  chmod 600 "$ISO/.claude/.credentials.json"
elif [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "run-evals-isolated.sh: no ~/.claude/.credentials.json and no \$ANTHROPIC_API_KEY — the isolated run has no way to authenticate" >&2
  exit 1
fi

# Onboarding state only; the host's own ~/.claude.json carries project history, MCP servers and
# trust decisions that have no business in a graded run.
printf '{"hasCompletedOnboarding":true,"bypassPermissionsModeAccepted":true}' > "$ISO/.claude.json" || exit 1

# skill-up reads its user config from the home it is given. Carry it if present; it holds no
# marketplace state.
if [ -f "$HOME/.config/skill-up/config.yaml" ]; then
  mkdir -p "$ISO/.config/skill-up"
  cp "$HOME/.config/skill-up/config.yaml" "$ISO/.config/skill-up/config.yaml"
fi

# Refuse to run if the thing we just built is not actually isolated. A leftover $PWPROVE_EVAL_HOME
# from an earlier experiment is the realistic way this goes wrong.
for leak in .claude/plugins .claude/skills .claude/settings.json; do
  if [ -e "$ISO/$leak" ]; then
    echo "run-evals-isolated.sh: $ISO/$leak exists — this home is not isolated, refusing to run" >&2
    exit 1
  fi
done

ISO_PATH="$(scrub_path "$PATH")"
dropped=$(( $(printf '%s' "$PATH" | tr ':' '\n' | wc -l) - $(printf '%s' "$ISO_PATH" | tr ':' '\n' | wc -l) ))
echo "-- isolated home: $ISO (no plugins, no user skills, no host settings) --"
echo "-- PATH: $dropped marketplace plugin entr(ies) dropped --"

# --config and --output-dir are passed explicitly: skill-up discovers .skill-up.yaml from $PWD only
# (it carries the reasoning effort the model under test is meant to run at), and the default
# workspace location is derived, which the sweep below must not have to guess at.
# CLAUDE_CONFIG_DIR is UNSET rather than emptied: Claude Code reads it as set-but-empty and then
# looks for credentials in a directory that is not $ISO/.claude, which surfaces as "Not logged in ·
# Please run /login" on every case.
env -u CLAUDE_CONFIG_DIR HOME="$ISO" PATH="$ISO_PATH" skill-up run "$EVAL_YAML" \
  --config "$SKILL_DIR/.skill-up.yaml" --output-dir "$WORKSPACE" "$@"
run_rc=$?
echo ""
echo "  skill-up run exited $run_rc"

sweep "$WORKSPACE"
sweep_rc=$?

[ "$run_rc" -eq 0 ] && [ "$sweep_rc" -eq 0 ]
