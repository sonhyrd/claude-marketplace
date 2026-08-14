#!/usr/bin/env bash
# Process-boundary suite for the eval suite's JUDGE scripts (issue #57).
#
# Seven of the nine failures in the only recorded eval run (2026-08-13) were judge defects, not
# skill defects, and they were invisible until someone read the transcripts. Every one had the same
# shape: a bare-substring rule that fires when the model names the forbidden thing IN ORDER TO
# REJECT IT. `b32` failed on the phrase "nothing to reformat"; `b49` failed while correctly refusing
# a prompt injection, because the refusal quoted the injection.
#
# This harness makes that class of defect catchable BEFORE a run. A judge is a process: a captured
# response in, an exit code and a printed verdict out. So it is tested the way the repo tests every
# other script boundary — `test-hermetic.sh`, `test-har-scrub.sh`, `test-clip-fidelity.sh`,
# `test-publish-proof.sh` — by invoking it and reading what came back. Nothing here reaches inside a
# judge; how it reached its verdict is not the contract.
#
# Fixture layout, per judge:
#
#   skills/pw-prove/evals/judges/<judge>.mjs
#   skills/pw-prove/evals/judges/fixtures/<judge>/pass--<slug>.txt   must exit 0
#   skills/pw-prove/evals/judges/fixtures/<judge>/fail--<slug>.txt   must exit non-zero
#   skills/pw-prove/evals/judges/fixtures/<judge>/<slug>.expect      optional: substring the
#                                                                    verdict must name
#
# Every judge needs BOTH halves, and the must-PASS half is specifically *a correct answer that
# names the forbidden thing in order to reject it* — mirroring the one-hit-one-JUSTIFIED-twin rule
# in `tests/pattern-corpus/`. A fixture set with no such twin cannot see the defect this whole
# harness exists for, so a judge carrying only must-FAIL fixtures is itself a failure here.
#
# This suite is deliberately NOT wired into `ci-local.sh`. CI is the contract for the shipped
# surface; the eval suite is an instrument operated by hand. Run it by name:
#
#   bash scripts/ci/test-eval-judges.sh
#
# The last section runs the harness against deliberately broken judges and requires it to go RED.
# A harness that cannot go red tests nothing.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
SELF="$REPO_ROOT/scripts/ci/test-eval-judges.sh"
cd "$REPO_ROOT" || exit 1

EVALS_ROOT="$REPO_ROOT/skills/pw-prove/evals"
SELF_TEST=1
while [ $# -gt 0 ]; do
  case "$1" in
    --evals-root) EVALS_ROOT="$2"; shift 2 ;;
    --no-self-test) SELF_TEST=0; shift ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "test-eval-judges.sh: unknown argument '$1'" >&2; exit 1 ;;
  esac
done

JUDGES="$EVALS_ROOT/judges"
FIXTURES="$JUDGES/fixtures"
CASES="$EVALS_ROOT/cases"

pass=0; fail=0
ok()  { echo "  [PASS] $1"; pass=$((pass + 1)); }
bad() { echo "  [FAIL] $1"; fail=$((fail + 1)); }

W=$(mktemp -d) || exit 1
trap 'rm -rf "$W"' EXIT
# A judge is not a shipped script and emits no run record, but a fixture invocation must never be
# able to reach the operator's real ledger even by accident.
export PWPROVE_LEDGER="$W/ledger.jsonl"

if [ ! -d "$JUDGES" ]; then
  echo "  [FAIL] no judges directory at $JUDGES"
  exit 1
fi

judge_names=()
while IFS= read -r f; do
  [ -z "$f" ] && continue
  n="$(basename "$f" .mjs)"
  judge_names+=("$n")
done < <(find "$JUDGES" -maxdepth 1 -name '*.mjs' -type f 2>/dev/null | sort)

if [ "${#judge_names[@]}" -eq 0 ]; then
  echo "  [FAIL] no judge scripts under $JUDGES"
  exit 1
fi

# --- every judge script has both halves of a fixture set ------------------------------------------
echo "-- every judge carries a must-PASS twin and a must-FAIL fixture --"
for n in "${judge_names[@]}"; do
  d="$FIXTURES/$n"
  if [ ! -d "$d" ]; then
    bad "$n: no fixture directory at ${d#"$REPO_ROOT/"} — an untested judge is an unverified verdict"
    continue
  fi
  npass=$(find "$d" -maxdepth 1 -name 'pass--*.txt' -type f 2>/dev/null | wc -l | tr -d ' ')
  nfail=$(find "$d" -maxdepth 1 -name 'fail--*.txt' -type f 2>/dev/null | wc -l | tr -d ' ')
  if [ "$npass" -ge 1 ] && [ "$nfail" -ge 1 ]; then
    ok "$n: $npass must-PASS, $nfail must-FAIL"
  else
    bad "$n: needs at least one pass--*.txt and one fail--*.txt (has $npass / $nfail)"
  fi
done

# --- no fixture directory without a judge ---------------------------------------------------------
if [ -d "$FIXTURES" ]; then
  while IFS= read -r d; do
    [ -z "$d" ] && continue
    n="$(basename "$d")"
    if [ ! -f "$JUDGES/$n.mjs" ]; then
      bad "fixtures/$n has no judge at judges/$n.mjs — a renamed judge left its fixtures behind"
    fi
  done < <(find "$FIXTURES" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)
fi

# --- every script judge a case actually uses is covered -------------------------------------------
# The case files are what a run executes. A judge that exists but no case references is dead
# weight; a judge a case references but this harness does not cover is the gap that produced the
# 2026-08-13 false failures.
echo ""
echo "-- every script judge referenced by a case is covered here --"
if [ -d "$CASES" ]; then
  refs=$(grep -rhoE 'script_path:[[:space:]]*\S+' "$CASES" 2>/dev/null | awk '{print $2}' | tr -d '"'"'" | sort -u)
  if [ -z "$refs" ]; then
    echo "  [SKIP] no case declares a script judge"
  else
    while IFS= read -r rel; do
      [ -z "$rel" ] && continue
      abs="$EVALS_ROOT/${rel#evals/}"
      n="$(basename "$abs" .mjs)"
      if [ ! -f "$abs" ]; then
        bad "a case references $rel, which does not exist"
      elif [ -d "$FIXTURES/$n" ]; then
        ok "$rel is covered by fixtures/$n"
      else
        bad "$rel is referenced by a case and has no fixtures"
      fi
    done <<< "$refs"
  fi
else
  echo "  [SKIP] no cases directory"
fi

# --- the fixtures themselves ----------------------------------------------------------------------
# usage: run_judge <judge.mjs> <fixture.txt>  -> sets RC, writes $W/out and $W/err
run_judge() {
  local judge="$1" fixture="$2" body
  body=$(cat "$fixture")
  EVAL_FINAL_MESSAGE="$body" node "$judge" >"$W/out" 2>"$W/err"
  RC=$?
}

echo ""
echo "-- fixtures in, exit codes out --"
for n in "${judge_names[@]}"; do
  judge="$JUDGES/$n.mjs"
  d="$FIXTURES/$n"
  [ -d "$d" ] || continue

  while IFS= read -r fixture; do
    [ -z "$fixture" ] && continue
    base="$(basename "$fixture" .txt)"
    want_zero=0
    case "$base" in pass--*) want_zero=1 ;; esac

    run_judge "$judge" "$fixture"
    if [ "$want_zero" = "1" ]; then
      if [ "$RC" = "0" ]; then
        ok "$n/$base — exit 0"
      else
        bad "$n/$base — exit $RC, wanted 0; this input is a CORRECT answer and the judge red-flagged it"
        sed 's/^/         /' "$W/err" | head -4
      fi
      # The verdict is read by a human triaging a run, so a pass must say so on stdout.
      if [ "$RC" = "0" ] && ! grep -q '^PASS' "$W/out"; then
        bad "$n/$base — exit 0 with no 'PASS' line on stdout"
      fi
    else
      if [ "$RC" != "0" ]; then
        ok "$n/$base — exit $RC (non-zero)"
      else
        bad "$n/$base — exit 0, wanted non-zero; the judge cannot see the defect it exists to catch"
      fi
      if [ "$RC" != "0" ] && ! grep -q 'FAIL' "$W/err"; then
        bad "$n/$base — refused with no 'FAIL' line on stderr; a run reports this as an empty verdict"
      fi
    fi

    # Optional: the reason must be the one the fixture was built to provoke. Without this, a judge
    # that refuses everything for one wrong reason passes every must-FAIL fixture.
    expect="$d/$base.expect"
    if [ -f "$expect" ]; then
      while IFS= read -r want; do
        [ -z "$want" ] && continue
        if grep -qF -- "$want" "$W/out" "$W/err"; then
          ok "$n/$base — verdict names '$want'"
        else
          bad "$n/$base — verdict never names '$want'"
          sed 's/^/         /' "$W/err" | head -4
        fi
      done < "$expect"
    fi
  done < <(find "$d" -maxdepth 1 -name '*.txt' -type f 2>/dev/null | sort)
done

# --- a judge with no input must never report a pass -----------------------------------------------
# skill-up hands a script judge the model's final message in $EVAL_FINAL_MESSAGE. A judge that does
# not read it, or that treats an absent message as "nothing objectionable found", reports a vacuous
# pass on every case forever — which is exactly what the eval.yaml comment wrongly believed an
# unrepaired case did.
echo ""
echo "-- an absent \$EVAL_FINAL_MESSAGE is never a pass --"
for n in "${judge_names[@]}"; do
  ( unset EVAL_FINAL_MESSAGE; node "$JUDGES/$n.mjs" >"$W/out" 2>"$W/err" )
  if [ "$?" != "0" ]; then
    ok "$n refuses an empty input"
  else
    bad "$n exits 0 on no input — it would pass every case without reading one"
  fi
done

# --- the harness must be able to go red -----------------------------------------------------------
if [ "$SELF_TEST" = "1" ]; then
  echo ""
  echo "-- the seam is real: broken judges make THIS harness fail --"

  # The bare-substring judge, reconstructed. This is the defect verbatim: it refuses any answer
  # containing the string `--workers` anywhere, so it passes every must-FAIL fixture and red-flags
  # the correct answer that names the flag in order to explain its absence. It is the exact shape
  # that produced seven false failures, and the must-PASS twin is what catches it.
  mk_root() {
    local root="$1"
    mkdir -p "$root/judges/fixtures" "$root/cases"
    cp -R "$FIXTURES/no-workers-in-command" "$root/judges/fixtures/broken" 2>/dev/null
  }

  SUBSTR="$W/substring"
  mk_root "$SUBSTR"
  cat > "$SUBSTR/judges/broken.mjs" <<'JUDGE'
const text = process.env.EVAL_FINAL_MESSAGE ?? '';
if (text.includes('--workers')) { console.error('FAIL: output_contains --workers'); process.exit(1); }
console.log('PASS');
JUDGE
  if bash "$SELF" --evals-root "$SUBSTR" --no-self-test >"$W/st1.out" 2>&1; then
    bad "a bare-substring judge passed the harness — the must-PASS twin is not load-bearing"
  else
    ok "a bare-substring judge is caught (it red-flags a correct answer that names the flag)"
  fi
  if grep -q 'CORRECT answer and the judge red-flagged it' "$W/st1.out"; then
    ok "the failure names the false-positive twin as the reason"
  else
    bad "the harness failed for some other reason than the false-positive twin"
    sed 's/^/         /' "$W/st1.out" | tail -12
  fi

  # The opposite defect: a judge that cannot go red. It passes every must-PASS fixture, so only the
  # must-FAIL half sees it.
  ALWAYS="$W/always-pass"
  mk_root "$ALWAYS"
  cat > "$ALWAYS/judges/broken.mjs" <<'JUDGE'
console.log('PASS: looks fine to me');
JUDGE
  if bash "$SELF" --evals-root "$ALWAYS" --no-self-test >"$W/st2.out" 2>&1; then
    bad "an always-pass judge passed the harness — the must-FAIL half is not load-bearing"
  else
    ok "an always-pass judge is caught by the must-FAIL half"
  fi
  if grep -q 'cannot see the defect it exists to catch' "$W/st2.out"; then
    ok "the failure names the must-FAIL fixture the judge could not refuse"
  else
    bad "the always-pass failure did not name a must-FAIL fixture"
    sed 's/^/         /' "$W/st2.out" | tail -12
  fi

  # And a judge with no fixtures at all must not be silently skipped.
  BARE="$W/bare"
  mkdir -p "$BARE/judges" "$BARE/cases"
  cp "$JUDGES/no-workers-in-command.mjs" "$BARE/judges/"
  if bash "$SELF" --evals-root "$BARE" --no-self-test >"$W/st3.out" 2>&1; then
    bad "a judge with no fixtures passed the harness"
  else
    ok "a judge with no fixture set is a failure, not a skip"
  fi
fi

echo ""
echo "  eval judges: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
