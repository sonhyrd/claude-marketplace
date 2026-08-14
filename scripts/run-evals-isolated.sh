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
# THE FILESYSTEM IS THE THIRD ROUTE (issue #75). A fresh $HOME and a scrubbed PATH close the two
# routes #58 was written against and neither touches the disk. Every checkout, worktree, clone and
# plugin cache of this repository on the machine is a copy of the body under test that a case can
# `find` and `cat`, and `environment.type: none` has no sandbox to stop it (docs/adr/0018). In the
# 2026-08-14 uplift run three of ten `without_skill` arms did exactly that — so the baseline that
# uplift is measured against was not skill-free, and two cases were about to be retired for zero
# uplift on a baseline that still had the skill.
#
# This script answers that in three places, none of which is a promise:
#
#   1. CENSUS + DENY. Before the run it enumerates every copy of the body reachable on the host
#      (`--census` prints the same list), and writes ONE deny rule per copy into the isolated home's
#      settings.json. Deny rules hold under `--permission-mode=bypassPermissions`, which is what
#      makes this worth doing at all; they close the Read/Grep/Glob route and they do NOT close
#      Bash, so this is a reduction, not a seal. It refuses rather than proceeds when the census
#      cannot find even this repository's own copy — a census that finds nothing is a broken
#      instrument, not a clean machine.
#   2. THE WORKSPACE LEAVES THE REPO. The run's working directory used to sit three levels under
#      `skills/pw-prove/`, so the ambient tree an agent walks WAS a checkout of the skill. It now
#      defaults outside every checkout, and the script refuses to run with a workspace inside one.
#   3. THE SWEEP IS ARM-AWARE. A `without_skill` transcript is judged with the load question
#      INVERTED: the body reaching that arm is a BASELINE DIRTY verdict and fails the run. That is
#      the binding assertion, because it is the one that covers the route deny rules do not.
#
# Usage:
#   bash scripts/run-evals-isolated.sh [skill-up run args...]   # e.g. --include-case-name 'b01-*'
#   bash scripts/run-evals-isolated.sh --baseline               # uplift: both arms, baseline judged
#   bash scripts/run-evals-isolated.sh --census                 # list the host copies, judge nothing
#   bash scripts/run-evals-isolated.sh --sweep-only <dir>       # judge an existing run's workspace
#   bash scripts/run-evals-isolated.sh --self-test              # no API calls, no skill-up
#
# Environment:
#   PWPROVE_EVAL_WORKSPACE  where the run's artifacts land. Default: outside every checkout.
#   PWPROVE_EVAL_YAML       the suite to run. Default: skills/pw-prove/evals/eval.yaml. Set this to
#                           a staged copy to characterize a quarantined case without editing the
#                           active list.
#   PWPROVE_EVAL_HOME       keep the isolated home around after the run, for debugging the runtime.
#
# Exit: 0 when the run passed AND no case was contaminated AND no baseline arm carried the body;
# non-zero otherwise. NOT LOADED is reported per case and does not by itself fail the sweep — the
# case's own judge owns that verdict, and non-invocation stays that judge's FAIL.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1

SKILL_DIR="$REPO_ROOT/skills/pw-prove"
EVAL_YAML="${PWPROVE_EVAL_YAML:-$SKILL_DIR/evals/eval.yaml}"
GATE="$SKILL_DIR/evals/judges/skill-loaded.mjs"
# Deliberately NOT under $SKILL_DIR any more (#75). The run's working directory is the case
# workspace, so leaving it there put a checkout of the body three `cd ..`s from the agent's own cwd
# — and made a deny rule over `skills/pw-prove/**` impossible, because it would have covered the
# workspace too. Keyed by the checkout's directory name so two worktrees do not share one.
WORKSPACE="${PWPROVE_EVAL_WORKSPACE:-${TMPDIR:-/tmp}/pw-prove-workspace/$(basename "$REPO_ROOT")}"
# Both guards that keep the workspace out of a checkout — the census exclusion and
# assert_workspace_outside — are prefix matches, so a relative path or a trailing slash would walk
# straight past them. Normalise once, here, rather than at each comparison.
case "$WORKSPACE" in /*) ;; *) WORKSPACE="$PWD/$WORKSPACE" ;; esac
while [ "$WORKSPACE" != "/" ] && [ "${WORKSPACE%/}" != "$WORKSPACE" ]; do WORKSPACE="${WORKSPACE%/}"; done

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
elif [ "${1:-}" = "--census" ]; then
  MODE=census
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

# --- the census: every copy of the body that is reachable on this host -----------------------------
# The frontmatter is what makes a SKILL.md the pw-prove body rather than some other skill's, so the
# census reads it rather than trusting the path. A file named SKILL.md under a `pw-prove/` directory
# that names a different skill is not a copy of the body under test and must not be denied.
is_pw_prove_body() {
  [ -f "$1" ] || return 1
  # Process substitution rather than a pipe: `grep -q` exits at the matching line, `head` takes
  # SIGPIPE, and under `set -o pipefail` the pipeline returns non-zero — dropping a real copy out of
  # the census for succeeding too early.
  grep -qE '^name:[[:space:]]*pw-prove[[:space:]]*$' < <(head -20 "$1")
}

# usage: bundle_of <path to a .../skills/pw-prove/SKILL.md> — the bundle root that carries it.
bundle_of() {
  dirname "$(dirname "$(dirname "$1")")"
}

# usage: skill_copies <exclude-prefix> <root>...
# One path per line, deduplicated. <exclude-prefix> drops the run's own workspace: skill-up installs
# the version under test into each case directory, and THAT copy is the measurement, not a leak.
#
# The depth limit is load-bearing and was WRONG at 9 (#78). A sibling agent's scratchpad under
# $TMPDIR holds whole checkouts ELEVEN components down — runner, project, session, scratchpad, the
# clone, its plugins directory, the bundle, skills, pw-prove, SKILL.md — and every one of those is a
# body a baseline arm can read. Two of #78's baseline arms did exactly that, twice, against a census
# that reported itself complete. At 14 the same sweep of $HOME and $TMPDIR takes under a second, so
# the limit was not buying anything it was costing correctness for. Raise it rather than trim it if a
# deeper copy ever appears.
skill_copies() {
  local exclude="$1"; shift
  local root f
  for root in "$@"; do
    [ -d "$root" ] || continue
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      case "$f" in
        "$exclude"/*) continue ;;
        # A deny rule is a JSON string. Refusing to quote a pathological path is safer than
        # emitting a rule that silently does not parse.
        *'"'*|*'\'*) echo "run-evals-isolated.sh: census skipping an unquotable path: $f" >&2; continue ;;
      esac
      is_pw_prove_body "$f" && printf '%s\n' "$f"
    done < <(find "$root" -maxdepth 14 \
               \( -name node_modules -o -name .git -o -name .cache -o -name .venv \) -prune -o \
               -type f -name 'SKILL.md' -path '*/pw-prove/SKILL.md' -print 2>/dev/null)
  done | sort -u
}

# usage: census_roots — the places a copy realistically lives: this repo's other worktrees, the
# operator's home (clones, marketplace checkouts, the plugin cache) and $TMPDIR.
#
# $TMPDIR is not an afterthought. skill-up installs each `with_skill` case's skill into
# $TMPDIR/skill-up-<n>/.claude/skills/pw-prove/ and does NOT always remove it, so yesterday's run leaves
# today's baseline a copy to read. That is where `case-48`'s baseline finally got the body on
# 2026-08-14, after the deny rules had refused it the plugin cache and every checkout. Anything under
# $TMPDIR at census time is by definition older than this run, so denying all of it cannot deny the
# run its own install — which is created afterwards.
census_roots() {
  git -C "$REPO_ROOT" worktree list --porcelain 2>/dev/null | awk '$1 == "worktree" { print $2 }'
  printf '%s\n' "$HOME"
  printf '%s\n' "${TMPDIR:-/tmp}"
}

# --- the census, second half: installed plugins BY ID ----------------------------------------------
# The fifth route (#83) uses no path at all. A baseline arm invoked the marketplace plugin through
# the host's own skill mechanism, as `e2e:pw-prove` — the plugin's ID, not a file. Every defence
# above is keyed on a path, so none of them can see it, and the census that feeds them was likewise
# an inventory of bodies-by-path. This is the same inventory taken in the unit the route actually
# uses.
#
# The id is the plugin's own name, the half of `<plugin>@<marketplace>` before the `@`: an install
# recorded as `e2e@sss-marketplace` serves its skills as `e2e:<skill>`.
installed_plugin_ids() {
  local reg="$HOME/.claude/plugins/installed_plugins.json"
  [ -f "$reg" ] || return 0
  node -e '
    const fs = require("fs");
    let j;
    try { j = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch { process.exit(0); }
    const ids = new Set();
    for (const key of Object.keys(j?.plugins ?? {})) {
      const id = String(key).split("@")[0];
      // A rule is a JSON string in a settings file; anything exotic is skipped rather than emitted
      // as a rule that silently does not parse. Same reasoning as the unquotable-path skip above.
      if (/^[A-Za-z0-9_-]+$/.test(id)) ids.add(id);
    }
    for (const id of [...ids].sort()) console.log(id);
  ' "$reg" 2>/dev/null
  return 0
}

# usage: skill_deny_rules <plugin-id>...
# One rule per installed plugin, denying its ENTIRE skill namespace. Two things make this the right
# shape, and both were measured against the host runtime rather than read off the docs (#83):
#
#   * A `Skill(<id>:*)` deny rule IS enforced, and it holds under `--permission-mode
#     bypassPermissions` — a Skill call it covers comes back `Skill execution blocked by permission
#     rules`. Deny rules can cover the Skill tool. The open question this ticket carried is settled
#     yes, so the residual does not have to be written down as one.
#   * It costs the measurement nothing. The version under test is installed UNNAMESPACED, as
#     `pw-prove`, and `Skill(e2e:pw-prove)` does not touch it — the bare id still launches. So the
#     namespace can be denied whole rather than skill by skill, which is the stronger rule: no plugin
#     skill has any business reaching an isolated run, and denying only `<id>:pw-prove` would leave
#     the next bundle that vendors this body one rename away.
skill_deny_rules() {
  local id
  for id in "$@"; do printf 'Skill(%s:*)\n' "$id"; done | sort -u
  return 0
}

# usage: deny_rules <repo-root> <copy>...
# One Claude Code permission rule per line. `Read(//abs/path)` — the doubled slash is the absolute
# form — is enforced under `--permission-mode=bypassPermissions`; a `Bash(...)` rule is not a
# substitute, because a body can be read by `cat`, `sed`, `head` or python and no prefix list
# catches all of them. That gap is what the arm-aware sweep exists to cover.
deny_rules() {
  local repo="$1"; shift
  local copy bundle
  for copy in "$@"; do
    case "$copy" in
      "$repo"/*)
        # This checkout is the one skill-up reads FROM, as a separate process the deny rules do not
        # touch. Only the agent is denied, and only the instruction surface — the fixtures under
        # evals/files/ stay readable, because a wet case is pointed at them on purpose.
        printf 'Read(/%s/skills/pw-prove/*.md)\n' "$repo"
        printf 'Read(/%s/skills/pw-prove/scripts/**)\n' "$repo"
        ;;
      *)
        # Any other copy is a whole bundle nobody in this run has business reading — not its body,
        # not its scripts, not the eval fixtures beside it. `<bundle>/skills/pw-prove/SKILL.md`.
        bundle="$(bundle_of "$copy")"
        printf 'Read(/%s/**)\n' "$bundle"
        ;;
    esac
  done | sort -u
  [ -d "$HOME/.claude/plugins" ] && printf 'Read(/%s/.claude/plugins/**)\n' "$HOME"
  return 0
}

# usage: write_deny_settings <settings.json path>  — rules on stdin, one per line.
write_deny_settings() {
  local out="$1" rule first=1
  {
    printf '{\n  "permissions": {\n    "deny": [\n'
    while IFS= read -r rule; do
      [ -z "$rule" ] && continue
      [ "$first" = 1 ] || printf ',\n'
      first=0
      printf '      "%s"' "$rule"
    done
    printf '\n    ]\n  }\n}\n'
  } > "$out"
}

# usage: assert_workspace_outside <workspace> <copy>...
# A workspace inside a checkout of the body is two failures at once: the agent's own cwd is a route
# to the skill, and the deny rule over that checkout would blind the agent to its own artifacts.
assert_workspace_outside() {
  local ws="$1"; shift
  local copy bundle
  for copy in "$@"; do
    bundle="$(bundle_of "$copy")"
    case "$ws/" in
      "$bundle"/*)
        echo "run-evals-isolated.sh: the workspace $ws is inside $bundle, which holds a copy of the body under test" >&2
        echo "  set \$PWPROVE_EVAL_WORKSPACE to a directory outside every checkout of this repository" >&2
        return 1 ;;
    esac
  done
  return 0
}

# usage: assert_no_stale_tmp_installs <copy>...
# A copy under $TMPDIR at census time is a PREVIOUS run's per-case install that skill-up did not
# remove. The deny rules cover it on the Read route and cannot cover it on the Bash route, and a
# baseline arm that `cat`s one voids the uplift the run was taken for — which is what happened to
# `case-23`'s baseline in the #76 re-characterization run. Deleting it here would be a `rm -rf` this
# script has no business performing unasked, so it refuses and names the trees instead.
assert_no_stale_tmp_installs() {
  local tmp="${TMPDIR:-/tmp}" copy stale=()
  for copy in "$@"; do
    case "$copy" in "$tmp"/*) stale+=("$(bundle_of "$copy")") ;; esac
  done
  [ "${#stale[@]}" -eq 0 ] && return 0
  echo "run-evals-isolated.sh: a previous run left ${#stale[@]} install(s) of the body under \$TMPDIR:" >&2
  printf '  %s\n' "${stale[@]}" >&2
  echo "  A baseline arm can read these with Bash, which no deny rule closes, so the uplift would be void (#75)." >&2
  echo "  Remove them and re-run:  rm -rf $tmp/skill-up-*" >&2
  return 1
}

# --- the sweep ------------------------------------------------------------------------------------
# One gate invocation per case ARM. `--baseline` writes a `with_skill/` and a `without_skill/`
# directory per case, and the two arms ask opposite questions of the same judge: the version under
# test must reach the model in one and must not reach it in the other. Judging one transcript per
# case — which is what this did until #75 — silently judged whichever arm sorted first and never
# looked at the baseline at all.
#
# The gate's exit code is four-valued: 0 LOADED (or SKILL-FREE in a baseline arm), 1 NOT LOADED or
# unjudgeable, 2 CONTAMINATED, 3 BASELINE DIRTY.
sweep() {
  local root="$1" iter case_dir case_id transcript rc verdict arm arm_dir label
  local loaded=0 notloaded=0 dirty=0 unseen=0 seen=0 skillfree=0 dirtybase=0 baseline_arms=0
  local arms=()

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
    # An uplift run splits each case into arms; a plain run leaves the transcript in the case
    # directory itself, which reads here as the single unnamed arm.
    arms=()
    for arm in with_skill without_skill; do
      [ -d "$case_dir/$arm" ] && arms+=("$arm")
    done
    [ "${#arms[@]}" -gt 0 ] || arms=("")

    for arm in "${arms[@]}"; do
      arm_dir="$case_dir${arm:+/$arm}"
      label="$case_id${arm:+ [$arm]}"
      transcript="$(find "$arm_dir" -name '*.jsonl' -type f -size +0 2>/dev/null | sort | head -1)"
      seen=$((seen + 1))
      # An arm the gate could not see is its own outcome. Tallying it as NOT LOADED would read as a
      # finding about the skill when it is a finding about the instrument.
      if [ -z "$transcript" ]; then
        printf '  %-40s %s\n' "$label" "NO TRANSCRIPT — the gate cannot see this arm"
        unseen=$((unseen + 1))
        continue
      fi

      if [ "$arm" = "without_skill" ]; then
        # The arm uplift is measured against. Here the body reaching the model is the defect, so the
        # gate is run with the question inverted.
        baseline_arms=$((baseline_arms + 1))
        verdict="$(EVAL_TRANSCRIPT_PATH="$transcript" PWPROVE_EXPECT_SKILL_FREE=1 node "$GATE" 2>&1)"
        rc=$?
        case "$rc" in
          0) skillfree=$((skillfree + 1)); printf '  %-40s %s\n' "$label" "SKILL-FREE"
             printf '%s\n' "$verdict" | head -1 | sed 's/^/      /' ;;
          2) dirty=$((dirty + 1)); printf '  %-40s %s\n' "$label" "CONTAMINATED"
             printf '%s\n' "$verdict" | sed 's/^/      /' ;;
          3) dirtybase=$((dirtybase + 1)); printf '  %-40s %s\n' "$label" "BASELINE DIRTY"
             printf '%s\n' "$verdict" | sed 's/^/      /' ;;
          *) unseen=$((unseen + 1)); printf '  %-40s %s\n' "$label" "UNJUDGEABLE"
             printf '%s\n' "$verdict" | sed 's/^/      /' | head -3 ;;
        esac
        continue
      fi

      verdict="$(EVAL_TRANSCRIPT_PATH="$transcript" node "$GATE" 2>&1)"
      rc=$?
      case "$rc" in
        0) loaded=$((loaded + 1)); printf '  %-40s %s\n' "$label" "LOADED"
           printf '%s\n' "$verdict" | head -1 | sed 's/^/      /' ;;
        2) dirty=$((dirty + 1)); printf '  %-40s %s\n' "$label" "CONTAMINATED"
           printf '%s\n' "$verdict" | sed 's/^/      /' ;;
        *) notloaded=$((notloaded + 1)); printf '  %-40s %s\n' "$label" "NOT LOADED"
           printf '%s\n' "$verdict" | sed 's/^/      /' | head -3 ;;
      esac
    done
  done < <(find "$iter" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)

  echo ""
  echo "  skill-loaded gate: $loaded loaded, $notloaded not loaded, $dirty contaminated, $unseen unjudgeable (of $seen arm(s))"
  if [ "$baseline_arms" -gt 0 ]; then
    echo "  baseline arms: $skillfree skill-free, $dirtybase dirty (of $baseline_arms)"
  fi
  if [ "$seen" -eq 0 ]; then
    echo "  no case directories under $iter — the sweep proved nothing" >&2
    return 1
  fi
  if [ "$dirtybase" -gt 0 ]; then
    echo "  a baseline arm carried the body under test — every uplift figure from this run is void (#75)" >&2
  fi
  # Contamination is a verdict; an unjudgeable arm is a broken instrument; a dirty baseline voids the
  # measurement the run was taken for. All three fail the sweep, because each one means this run does
  # not prove the thing the sweep exists to prove.
  [ "$dirty" -eq 0 ] && [ "$unseen" -eq 0 ] && [ "$dirtybase" -eq 0 ]
}

# --- the staging gate -------------------------------------------------------------------------------
# `context.files` is {workspace_path: INLINE CONTENT}: skill-up writes the right-hand string verbatim
# as the file's body, so a case migrated in the shape `p: p` stages a 40-byte file whose content is
# its own path (#76). The agent then answers a different question and PASSES — `case-23` was 3/3 on a
# premise it never read. Nothing in the run reports that: the staged workspace is not among the
# artifacts skill-up retains, so no post-run sweep can see it. The check is therefore static, and it
# runs before the run rather than only when someone remembers the script's name, because the run that
# pays for the defect is this one. `scripts/ci/test-case-shapes.sh` holds the checks themselves.
# usage: run_staging_gate <eval.yaml>
run_staging_gate() {
  local suite="$1" shapes="$REPO_ROOT/scripts/ci/test-case-shapes.sh" out
  [ -f "$shapes" ] || { echo "run-evals-isolated.sh: $shapes is missing — refusing to run an unchecked suite" >&2; return 1; }
  out="$(PWPROVE_EVALS_ROOT="$(dirname "$suite")" PWPROVE_CASE_SHAPES_SELFTEST=0 bash "$shapes" 2>&1)" && return 0
  printf '%s\n' "$out" | sed 's/^/  /'
  echo "run-evals-isolated.sh: the case suite does not pass its shape and staging checks — refusing to spend a run on it" >&2
  return 1
}

# --- a baseline run is serial -----------------------------------------------------------------------
# The census cannot see a copy that does not exist yet, and skill-up materializes one per case: the
# `with_skill` arm's skill is installed into that case's own $TMPDIR/skill-up-<n>/.claude/skills/. Run
# two arms at once and the baseline arm can read the other arm's install — which is exactly what
# `case-48` did on 2026-08-14, after the deny rules had refused it the plugin cache and every
# checkout on the host. Denying that path is not available: it is the with-skill agent's own working
# directory. Serialising is, and it is the only reason this run is slower than the others.
args_have_baseline() {
  local a
  for a in "$@"; do [ "$a" = "--baseline" ] && return 0; done
  return 1
}

# Prints the parallelism the caller asked for, if any. `--parallelism N` and `--parallelism=N` both.
requested_parallelism() {
  local want=0 a
  for a in "$@"; do
    if [ "$want" = 1 ]; then printf '%s' "$a"; return 0; fi
    case "$a" in
      --parallelism) want=1 ;;
      --parallelism=*) printf '%s' "${a#--parallelism=}"; return 0 ;;
    esac
  done
  return 0
}

# --- census + refusals ------------------------------------------------------------------------------
# Populates COPIES (every reachable copy of the body) and RULES (the deny rules that cover them), and
# refuses when the census itself cannot be believed.
run_census() {
  local r c
  ROOTS=(); COPIES=(); RULES=(); PLUGIN_IDS=()
  while IFS= read -r r; do [ -n "$r" ] && ROOTS+=("$r"); done < <(census_roots | sort -u)
  while IFS= read -r c; do [ -n "$c" ] && COPIES+=("$c"); done < <(skill_copies "$WORKSPACE" ${ROOTS[@]+"${ROOTS[@]}"})
  # A census that finds nothing is not a clean machine — this repository's own copy is right there,
  # by definition. It is a census that stopped working, and proceeding on one would report an
  # isolated run that nothing checked.
  local mine="$REPO_ROOT/skills/pw-prove/SKILL.md"
  local found=0 c2
  for c2 in ${COPIES[@]+"${COPIES[@]}"}; do [ "$c2" = "$mine" ] && found=1; done
  if [ "$found" -ne 1 ]; then
    echo "run-evals-isolated.sh: the census did not find $mine — it cannot see copies of the body, refusing to run" >&2
    return 1
  fi
  while IFS= read -r r; do [ -n "$r" ] && RULES+=("$r"); done < <(deny_rules "$REPO_ROOT" ${COPIES[@]+"${COPIES[@]}"})
  # The id half of the census. Unlike the path half this one does NOT refuse when it finds nothing:
  # a host with no plugins installed is an ordinary state, not a broken instrument.
  while IFS= read -r r; do [ -n "$r" ] && PLUGIN_IDS+=("$r"); done < <(installed_plugin_ids)
  while IFS= read -r r; do [ -n "$r" ] && RULES+=("$r"); done < <(skill_deny_rules ${PLUGIN_IDS[@]+"${PLUGIN_IDS[@]}"})
  assert_workspace_outside "$WORKSPACE" ${COPIES[@]+"${COPIES[@]}"} || return 1
  return 0
}

if [ "$MODE" = "census" ]; then
  run_census || exit 1
  echo "-- copies of the pw-prove body reachable on this host --"
  for c in ${COPIES[@]+"${COPIES[@]}"}; do echo "  $c"; done
  echo ""
  echo "-- installed plugins, by the id the Skill tool uses (#83) --"
  for c in ${PLUGIN_IDS[@]+"${PLUGIN_IDS[@]}"}; do echo "  $c:*"; done
  [ "${#PLUGIN_IDS[@]}" -eq 0 ] && echo "  (none installed)"
  echo ""
  echo "-- the deny rules a run would carry --"
  for r in ${RULES[@]+"${RULES[@]}"}; do echo "  $r"; done
  echo ""
  echo "  ${#COPIES[@]} copy(ies), ${#PLUGIN_IDS[@]} plugin id(s), ${#RULES[@]} deny rule(s)."
  echo "  Deny closes Read/Grep/Glob and the Skill tool, and NOT Bash; the arm-aware sweep covers the rest."
  exit 0
fi

# --- self-test ------------------------------------------------------------------------------------
# The sweep is what turns "isolated" from a claim into a result, so it gets its own seam: a
# synthetic workspace built from the gate's committed fixtures. No API key, no skill-up, no spend.
if [ "$MODE" = "self-test" ]; then
  F="$SKILL_DIR/evals/judges/fixtures/skill-loaded"
  T=$(mktemp -d) || exit 1
  trap 'rm -rf "$T"' EXIT
  export PWPROVE_SKILL_MD="$F/skill-under-test.md"
  # One case directory per verdict the sweep can reach, arm by arm. `with_skill` asks whether the
  # body arrived; `without_skill` asks whether it stayed away.
  for c in with_skill/loaded-case:pass--explicit-skill-tool \
           with_skill/blind-case:fail--no-contact-with-the-skill \
           with_skill/dirty-case:fail--body-served-from-the-plugin-cache \
           with_skill/searched-case:fail--plugin-path-found-by-filesystem-search \
           without_skill/baseline-clean-case:pass--baseline-arm-never-saw-the-body \
           without_skill/baseline-refusing-case:pass--baseline-names-a-host-checkout-to-refuse-it \
           without_skill/baseline-dirty-case:fail--baseline-read-a-host-checkout; do
    arm="${c%%/*}"; rest="${c#*/}"
    mkdir -p "$T/iteration-1/${rest%%:*}/$arm"
    cp "$F/${rest##*:}.jsonl" "$T/iteration-1/${rest%%:*}/$arm/session.jsonl" || exit 1
  done
  out="$(sweep "$T" 2>&1)"; rc=$?
  fail=0
  check() { if printf '%s' "$out" | grep -q "$1"; then echo "  [PASS] $2"; else echo "  [FAIL] $2"; fail=1; fi; }
  echo "-- the sweep reports one verdict per case arm --"
  check 'loaded-case .*LOADED' 'a case that loaded the skill reads LOADED'
  check 'blind-case .*NOT LOADED' 'a case that never touched the skill reads NOT LOADED'
  check 'dirty-case \[with_skill\] *CONTAMINATED' 'a case served the body from the plugin cache reads CONTAMINATED'
  # The other half of the contamination question (#75): the plugin copy reached by `find` and read,
  # with no injected body anywhere. That is the shape 1 of 39 with-skill runs actually took.
  check 'searched-case .*CONTAMINATED' 'a plugin path reached by filesystem search reads CONTAMINATED'
  check 'baseline-clean-case .*SKILL-FREE' 'a baseline arm that never saw the body reads SKILL-FREE'
  check 'baseline-refusing-case .*SKILL-FREE' 'a baseline arm that NAMES a host checkout in order to refuse it still reads SKILL-FREE'
  check 'baseline-dirty-case .*BASELINE DIRTY' 'a baseline arm that read the body off the host reads BASELINE DIRTY'
  check '1 loaded, 1 not loaded, 2 contaminated, 0 unjudgeable' 'the tally counts each verdict once'
  check 'baseline arms: 2 skill-free, 1 dirty' 'the baseline arms are tallied separately from the with-skill arms'
  if [ "$rc" -ne 0 ]; then echo "  [PASS] a contaminated case fails the sweep"; else echo "  [FAIL] the sweep stayed green with a contaminated case"; fail=1; fi
  # The binding assertion of #75, on its own: a run whose ONLY defect is a baseline arm carrying the
  # body must fail. Judged apart from the workspace above, where contamination would fail it anyway.
  mkdir -p "$T/only-dirty-baseline/iteration-1/c/with_skill" "$T/only-dirty-baseline/iteration-1/c/without_skill"
  cp "$F/pass--explicit-skill-tool.jsonl" "$T/only-dirty-baseline/iteration-1/c/with_skill/session.jsonl"
  cp "$F/fail--baseline-read-a-host-checkout.jsonl" "$T/only-dirty-baseline/iteration-1/c/without_skill/session.jsonl"
  out3="$(sweep "$T/only-dirty-baseline" 2>&1)"; rc3=$?
  if [ "$rc3" -ne 0 ] && printf '%s' "$out3" | grep -q 'baseline arms: 0 skill-free, 1 dirty'; then
    echo "  [PASS] a without_skill arm carrying the body fails the run on its own"
  else
    echo "  [FAIL] a without_skill arm carrying the body did not fail the run"; fail=1
  fi
  # And the twin: an otherwise identical run whose baseline IS skill-free must pass. Without this,
  # a sweep that failed every uplift run would look exactly as green as one that works.
  mkdir -p "$T/clean-baseline/iteration-1/c/with_skill" "$T/clean-baseline/iteration-1/c/without_skill"
  cp "$F/pass--explicit-skill-tool.jsonl" "$T/clean-baseline/iteration-1/c/with_skill/session.jsonl"
  cp "$F/pass--baseline-arm-never-saw-the-body.jsonl" "$T/clean-baseline/iteration-1/c/without_skill/session.jsonl"
  if sweep "$T/clean-baseline" >/dev/null 2>&1; then
    echo "  [PASS] an uplift run with a skill-free baseline passes"
  else
    echo "  [FAIL] a clean uplift run failed the sweep — the gate cannot go green"; fail=1
  fi
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
  echo "-- a previous run's install left under \$TMPDIR is refused, not merely denied --"
  # The Bash route no deny rule closes. The fixture stands in for $TMPDIR by setting it.
  st="$T/stale-tmp"
  mk_stale() { mkdir -p "$(dirname "$1")"; printf -- '---\nname: pw-prove\ndescription: fixture\n---\n\nbody\n' > "$1"; }
  mk_stale "$st/skill-up-99/.claude/skills/pw-prove/SKILL.md"
  if TMPDIR="$st" assert_no_stale_tmp_installs "$st/skill-up-99/.claude/skills/pw-prove/SKILL.md" 2>/dev/null; then
    echo "  [FAIL] a stale \$TMPDIR install was accepted"; fail=1
  else
    echo "  [PASS] a stale \$TMPDIR install is refused, and named"
  fi
  if TMPDIR="$st" assert_no_stale_tmp_installs "$T/host/checkout-a/skills/pw-prove/SKILL.md" 2>/dev/null; then
    echo "  [PASS] a copy outside \$TMPDIR is left to the deny rules"
  else
    echo "  [FAIL] a copy outside \$TMPDIR was refused as a stale install"; fail=1
  fi

  echo ""
  echo "-- a suite that stages a fixture as its own path is refused before the spend (#76) --"
  # The real suite must pass its own gate, and a suite carrying the #76 defect must not — otherwise
  # the gate is a line that runs rather than a check that reads.
  if run_staging_gate "$SKILL_DIR/evals/eval.yaml" >/dev/null 2>&1; then
    echo "  [PASS] the committed suite passes the staging gate"
  else
    echo "  [FAIL] the committed suite does not pass its own staging gate"; fail=1
  fi
  mkdir -p "$T/bad-suite/cases"
  cat > "$T/bad-suite/eval.yaml" <<'YAML'
cases:
    files:
        - evals/cases/only.yaml
YAML
  cat > "$T/bad-suite/cases/only.yaml" <<'YAML'
id: only
title: only
shape: behavior
input:
    prompt: >-
      Load the `pw-prove` skill with the Skill tool and follow it. Step 3.
context:
    files:
        src/routes.ts: src/routes.ts
judge:
    type: rule_based
YAML
  if run_staging_gate "$T/bad-suite/eval.yaml" >/dev/null 2>&1; then
    echo "  [FAIL] a suite staging a fixture as its own path was accepted"; fail=1
  else
    echo "  [PASS] a suite staging a fixture as its own path is refused"
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
  echo "-- a baseline run is serial, because a concurrent arm installs a copy mid-run --"
  if args_have_baseline --include-case-name x --baseline; then
    echo "  [PASS] --baseline is recognised wherever it appears in the arguments"
  else
    echo "  [FAIL] --baseline was not recognised"; fail=1
  fi
  if args_have_baseline --include-case-name x; then
    echo "  [FAIL] a run with no --baseline was treated as one"; fail=1
  else
    echo "  [PASS] a run with no --baseline is left alone"
  fi
  got="$(requested_parallelism --baseline --parallelism 3)$(requested_parallelism --parallelism=4)"
  if [ "$got" = "34" ]; then
    echo "  [PASS] both spellings of --parallelism are read back"
  else
    echo "  [FAIL] requested_parallelism returned '$got', wanted '34'"; fail=1
  fi
  if [ -z "$(requested_parallelism --baseline)" ]; then
    echo "  [PASS] no --parallelism reads as unset, so the run can supply its own"
  else
    echo "  [FAIL] an absent --parallelism did not read as unset"; fail=1
  fi

  echo ""
  echo "-- the census finds the copies on disk, and only the copies --"
  # A synthetic host: two bundles that carry the pw-prove body, one that carries a DIFFERENT skill
  # under the same filename and path shape, and one inside the run's own workspace. Only the first
  # two are copies of the body under test; a census that cannot tell them apart would deny the wrong
  # trees and blind the agent to its own artifacts.
  fh="$T/host"
  mk_body() { mkdir -p "$(dirname "$1")"; printf -- '---\nname: %s\ndescription: fixture\n---\n\nbody\n' "$2" > "$1"; }
  mk_body "$fh/checkout-a/skills/pw-prove/SKILL.md" pw-prove
  mk_body "$fh/checkout-b/skills/pw-prove/SKILL.md" pw-prove
  mk_body "$fh/decoy/skills/pw-prove/SKILL.md" playwright-debugger
  mk_body "$fh/ws/iteration-1/case/with_skill/.claude/skills/pw-prove/SKILL.md" pw-prove
  found="$(skill_copies "$fh/ws" "$fh")"
  if [ "$found" = "$fh/checkout-a/skills/pw-prove/SKILL.md
$fh/checkout-b/skills/pw-prove/SKILL.md" ]; then
    echo "  [PASS] both host copies found; the decoy skill and the run's own installed copy are not"
  else
    echo "  [FAIL] the census returned:"; printf '%s\n' "$found" | sed 's/^/         /'; fail=1
  fi
  # A sibling agent's scratchpad nests a checkout eleven components down (#78). The census missed it
  # at the old maxdepth of 9 and two baseline arms read the body out of one, so the depth is pinned
  # here rather than left to the next person to rediscover from a dirty run.
  deep="$fh/runner/project/session/scratchpad/clone/plugins/bundle/skills/pw-prove/SKILL.md"
  mk_body "$deep" pw-prove
  if printf '%s\n' "$(skill_copies "$fh/ws" "$fh")" | grep -qF "$deep"; then
    echo "  [PASS] a copy nested deeper than a sibling scratchpad's checkout is still censused"
  else
    echo "  [FAIL] the census cannot see $deep"; fail=1
  fi

  echo ""
  echo "-- every copy gets a deny rule, and the rule set is valid JSON --"
  rules="$(deny_rules "$fh/checkout-a" "$fh/checkout-a/skills/pw-prove/SKILL.md" "$fh/checkout-b/skills/pw-prove/SKILL.md")"
  # The checkout the run is invoked FROM is denied at its instruction surface only — skill-up reads
  # it as a separate process, and a wet case's fixtures under evals/files/ must stay readable.
  if printf '%s' "$rules" | grep -qF "Read(/$fh/checkout-a/skills/pw-prove/*.md)" \
     && ! printf '%s' "$rules" | grep -qF "Read(/$fh/checkout-a/**)"; then
    echo "  [PASS] this checkout is denied at its body and scripts, not wholesale"
  else
    echo "  [FAIL] the rule for this checkout is wrong:"; printf '%s\n' "$rules" | sed 's/^/         /'; fail=1
  fi
  if printf '%s' "$rules" | grep -qF "Read(/$fh/checkout-b/**)"; then
    echo "  [PASS] every other checkout is denied whole — body, scripts and the fixtures beside them"
  else
    echo "  [FAIL] another checkout was not denied wholesale"; fail=1
  fi
  printf '%s\n' "$rules" | write_deny_settings "$T/settings.json"
  if node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).permissions.deny; if(!Array.isArray(r)||r.length<2)process.exit(1)' "$T/settings.json"; then
    echo "  [PASS] the generated settings.json parses and carries the rules"
  else
    echo "  [FAIL] the generated settings.json is not usable:"; sed 's/^/         /' "$T/settings.json"; fail=1
  fi

  echo ""
  echo "-- the census also inventories installed plugins BY ID, and denies the Skill route (#83) --"
  # The fifth route uses an id, not a path, so it gets a fixture in that unit. `Skill(<id>:*)` was
  # measured against the host runtime: it blocks under bypassPermissions, and it leaves the
  # unnamespaced `pw-prove` skill-up installs for the run alone.
  ph="$T/plugin-home"
  mkdir -p "$ph/.claude/plugins"
  cat > "$ph/.claude/plugins/installed_plugins.json" <<'JSON'
{"version":2,"plugins":{
  "e2e@sss-marketplace":[{"scope":"user","installPath":"/nowhere/e2e/1.2.1","version":"1.2.1"}],
  "matt@sss-marketplace":[{"scope":"user","installPath":"/nowhere/matt/1.0.0","version":"1.0.0"}],
  "bad id@m":[{"scope":"user","installPath":"/nowhere/bad","version":"1.0.0"}]
}}
JSON
  ids="$(HOME="$ph" installed_plugin_ids)"
  if [ "$ids" = "e2e
matt" ]; then
    echo "  [PASS] every installed plugin is inventoried by the id the Skill tool uses"
  else
    echo "  [FAIL] installed_plugin_ids returned:"; printf '%s\n' "$ids" | sed 's/^/         /'; fail=1
  fi
  if printf '%s\n' "$ids" | grep -q 'bad'; then
    echo "  [FAIL] an id that cannot be written as a rule was emitted anyway"; fail=1
  else
    echo "  [PASS] an id that is not rule-safe is skipped rather than emitted as a rule that will not parse"
  fi
  # A host with no plugins is an ordinary state. Unlike the path census, this half must not refuse.
  mkdir -p "$T/bare-home/.claude"
  if [ -z "$(HOME="$T/bare-home" installed_plugin_ids)" ]; then
    echo "  [PASS] a host with no plugins installed yields no ids and no refusal"
  else
    echo "  [FAIL] a host with no plugins did not yield an empty inventory"; fail=1
  fi
  srules="$(skill_deny_rules e2e matt)"
  if [ "$srules" = "Skill(e2e:*)
Skill(matt:*)" ]; then
    echo "  [PASS] one Skill deny rule per installed plugin, over its whole namespace"
  else
    echo "  [FAIL] skill_deny_rules returned:"; printf '%s\n' "$srules" | sed 's/^/         /'; fail=1
  fi
  # The rule that must NOT be written. The version under test is installed unnamespaced, so a rule
  # naming the bare skill would deny every with_skill arm the thing the run exists to measure.
  if printf '%s\n' "$srules" | grep -qE '^Skill\(pw-prove'; then
    echo "  [FAIL] a rule denies the unnamespaced skill under test"; fail=1
  else
    echo "  [PASS] no rule touches the unnamespaced 'pw-prove' the run installs"
  fi
  printf '%s\n' "$srules" | write_deny_settings "$T/skill-settings.json"
  if node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).permissions.deny; if(!r.includes("Skill(e2e:*)"))process.exit(1)' "$T/skill-settings.json"; then
    echo "  [PASS] the Skill rules survive into a settings.json that parses"
  else
    echo "  [FAIL] the Skill rules did not reach a usable settings.json"; fail=1
  fi

  echo ""
  echo "-- a workspace inside a checkout of the body is refused, not silently denied --"
  if assert_workspace_outside "$fh/checkout-b/skills/pw-prove/pw-prove-workspace" "$fh/checkout-b/skills/pw-prove/SKILL.md" 2>/dev/null; then
    echo "  [FAIL] a workspace inside a checkout was accepted"; fail=1
  else
    echo "  [PASS] a workspace inside a checkout is refused"
  fi
  if assert_workspace_outside "$T/outside" "$fh/checkout-b/skills/pw-prove/SKILL.md" 2>/dev/null; then
    echo "  [PASS] a workspace outside every checkout is accepted"
  else
    echo "  [FAIL] a workspace outside every checkout was refused"; fail=1
  fi
  echo ""
  [ "$fail" -eq 0 ] && echo "  run-evals-isolated self-test: green" || echo "  run-evals-isolated self-test: RED"
  exit "$fail"
fi

if [ "$MODE" = "sweep" ]; then
  sweep "$SWEEP_DIR"
  exit $?
fi

# --- the staging gate, before a token is spent ------------------------------------------------------
if [ "${PWPROVE_SKIP_STAGING_GATE:-0}" = "1" ]; then
  echo "-- staging gate: SKIPPED by \$PWPROVE_SKIP_STAGING_GATE — a fixture staged as its own path will not be reported --"
else
  run_staging_gate "$EVAL_YAML" || exit 1
  echo "-- staging gate: every case stages the fixture it names (#76) --"
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

# The census runs AFTER that check and writes the settings.json the check just proved absent. The
# order is the point: what must not be here is the operator's file; what must be here is ours.
run_census || exit 1
# Not part of run_census, so `--census` still prints its inventory instead of refusing to.
assert_no_stale_tmp_installs ${COPIES[@]+"${COPIES[@]}"} || exit 1
printf '%s\n' ${RULES[@]+"${RULES[@]}"} | write_deny_settings "$ISO/.claude/settings.json"
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$ISO/.claude/settings.json" || {
  echo "run-evals-isolated.sh: the generated settings.json does not parse — refusing to run behind a rule set the agent would ignore" >&2
  exit 1
}

ISO_PATH="$(scrub_path "$PATH")"
dropped=$(( $(printf '%s' "$PATH" | tr ':' '\n' | wc -l) - $(printf '%s' "$ISO_PATH" | tr ':' '\n' | wc -l) ))
echo "-- isolated home: $ISO (no plugins, no user skills, no host settings) --"
echo "-- PATH: $dropped marketplace plugin entr(ies) dropped --"
echo "-- host copies of the body: ${#COPIES[@]} found; installed plugin ids: ${#PLUGIN_IDS[@]} --"
echo "-- ${#RULES[@]} deny rule(s) written, covering Read/Grep/Glob and the Skill tool; Bash is covered by the sweep --"
echo "-- workspace: $WORKSPACE (outside every checkout) --"
echo "-- suite: $EVAL_YAML --"

# --config and --output-dir are passed explicitly: skill-up discovers .skill-up.yaml from $PWD only
# (it carries the reasoning effort the model under test is meant to run at), and the default
# workspace location is derived, which the sweep below must not have to guess at.
# CLAUDE_CONFIG_DIR is UNSET rather than emptied: Claude Code reads it as set-but-empty and then
# looks for credentials in a directory that is not $ISO/.claude, which surfaces as "Not logged in ·
# Please run /login" on every case.
EXTRA=()
if args_have_baseline "$@"; then
  p="$(requested_parallelism "$@")"
  if [ -n "$p" ]; then
    # A value this cannot read is refused rather than ignored: falling through would leave the run
    # concurrent AND unflagged, which is the failure this check exists to prevent.
    case "$p" in
      1) ;;
      *[!0-9]*|'')
        echo "run-evals-isolated.sh: --baseline with --parallelism '$p' — not a number, refusing rather than guessing" >&2
        exit 1 ;;
      *)
        echo "run-evals-isolated.sh: --baseline with --parallelism $p — a concurrent with_skill arm installs the body where the baseline arm can read it, refusing" >&2
        exit 1 ;;
    esac
  fi
  # The suite's own `cases.parallelism` is 2, so serialising has to be said out loud rather than
  # left to the default.
  [ -n "$p" ] || EXTRA+=(--parallelism 1)
  echo "-- baseline run: serialised, so no case's with_skill install is on disk while another case's baseline is looking --"
fi

env -u CLAUDE_CONFIG_DIR HOME="$ISO" PATH="$ISO_PATH" skill-up run "$EVAL_YAML" \
  --config "$SKILL_DIR/.skill-up.yaml" --output-dir "$WORKSPACE" ${EXTRA[@]+"${EXTRA[@]}"} "$@"
run_rc=$?
echo ""
echo "  skill-up run exited $run_rc"

sweep "$WORKSPACE"
sweep_rc=$?

[ "$run_rc" -eq 0 ] && [ "$sweep_rc" -eq 0 ]
