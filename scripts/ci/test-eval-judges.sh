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
# The self-test re-invokes THIS file, not the committed path of the same name — so an edit under
# review is what goes red, rather than whatever happens to be checked in beside it.
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")" || exit 1
cd "$REPO_ROOT" || exit 1

EVALS_ROOT="$REPO_ROOT/skills/pw-prove/evals"
SELF_TEST=1
while [ $# -gt 0 ]; do
  case "$1" in
    --evals-root) EVALS_ROOT="$2"; shift 2 ;;
    --no-self-test) SELF_TEST=0; shift ;;
    # Print the header block, however long it grows. A hard line range drifts into live code.
    -h|--help) awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"; exit 0 ;;
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
      wanted=0
      # `|| [ -n "$want" ]` so a final line with no trailing newline is still read. Without it a
      # one-line .expect asserts nothing and still prints green — a check that cannot fail.
      while IFS= read -r want || [ -n "$want" ]; do
        [ -z "$want" ] && continue
        wanted=$((wanted + 1))
        if grep -qF -- "$want" "$W/out" "$W/err"; then
          ok "$n/$base — verdict names '$want'"
        else
          bad "$n/$base — verdict never names '$want'"
          sed 's/^/         /' "$W/err" | head -4
        fi
      done < "$expect"
      if [ "$wanted" -eq 0 ]; then
        bad "$n/$base.expect is empty — an .expect that asserts nothing reads as a passing check"
      fi
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

  # A scratch evals root holding one deliberately broken judge, under the real fixture set. The copy
  # is not allowed to fail quietly: if it did, every case below would degrade into the weaker
  # "judge with no fixtures" case and still look green.
  st_n=0
  broken_root() {
    local root="$W/self-$1" fixtures="${2:-$FIXTURES/no-workers-in-command}"
    mkdir -p "$root/judges/fixtures" "$root/cases" || return 1
    if [ -d "$fixtures" ]; then
      cp -R "$fixtures" "$root/judges/fixtures/broken" || return 1
    fi
    cat > "$root/judges/broken.mjs" || return 1
    printf '%s' "$root"
  }

  # usage: expect_red <label> <root> <reason-substring>
  # The reason matters as much as the exit code: a self-test that only asserts "it went red" is
  # satisfied by a harness that is broken in some entirely different way.
  expect_red() {
    local label="$1" root="$2" reason="$3" log
    st_n=$((st_n + 1)); log="$W/self-$st_n.log"
    if bash "$SELF" --evals-root "$root" --no-self-test >"$log" 2>&1; then
      bad "$label — the harness stayed GREEN against a broken judge"
      return
    fi
    ok "$label — the harness goes red"
    if grep -q "$reason" "$log"; then
      ok "$label — and it fails for the right reason ('$reason')"
    else
      bad "$label — it failed, but never for '$reason'"
      sed 's/^/         /' "$log" | tail -12
    fi
  }

  # 1. The bare-substring judge, reconstructed — the defect verbatim. It refuses any answer
  #    containing `--workers` anywhere, so it passes every must-FAIL fixture and red-flags the
  #    correct answer that names the flag in order to explain its absence. Only the must-PASS twin
  #    can see it, which is why every fixture set is required to carry one.
  R=$(broken_root substring <<'JUDGE'
const text = process.env.EVAL_FINAL_MESSAGE ?? '';
if (!text.trim()) { console.error('FAIL: no input'); process.exit(1); }
if (text.includes('--workers')) { console.error('FAIL: output_contains --workers'); process.exit(1); }
console.log('PASS');
JUDGE
  ) && expect_red "bare-substring judge" "$R" 'CORRECT answer and the judge red-flagged it' \
    || bad "could not build the bare-substring self-test root"

  # 2. The opposite defect: a judge that cannot go red at all. Every must-PASS fixture is happy with
  #    it, so only the must-FAIL half sees it.
  R=$(broken_root always-pass <<'JUDGE'
console.log('PASS: looks fine to me');
JUDGE
  ) && expect_red "always-pass judge" "$R" 'cannot see the defect it exists to catch' \
    || bad "could not build the always-pass self-test root"

  # 3. A judge with no fixture set at all must be a failure, not a silent skip — otherwise #59 can
  #    add a judge and this harness will say nothing about it.
  R=$(broken_root no-fixtures /nonexistent <<'JUDGE'
console.log('PASS');
JUDGE
  ) && expect_red "judge with no fixtures" "$R" 'no fixture directory at' \
    || bad "could not build the no-fixtures self-test root"
fi

echo ""
echo "  eval judges: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
