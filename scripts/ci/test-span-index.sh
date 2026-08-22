#!/usr/bin/env bash
# Process-boundary suite for the span index (issue #132): synthesise a run ledger and a transcript
# tree in a temp directory, run the script, and assert on the exit code and the emitted JSON.
#
# This is the one seam in the run-forensics exercise whose failure is SILENT — a mis-sliced span
# yields a confident distillation of the wrong turns, with nothing anywhere reporting an error. So
# the cases here are the ways it can lie:
#
#   - a session whose ledger records bracket a known transcript region yields exactly that region
#   - a session the ledger knows but no transcript exists for is emitted with an explicit marker
#   - an e2e-skills worktree is `control`, chrysus/widget is `corpus`, anything else is `excluded`
#     with a stated reason
#   - a record carrying an unknown `schema` is REFUSED with a named reason, never read as nulls
#   - a window holding no records exits non-zero with a named reason, never an empty corpus that
#     reads as "nothing went wrong"
#
# Shaped on scripts/ci/test-run-ledger.sh: fixture in, exit code and stdout out, nothing reaching
# into the script's internals.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1
IDX="scripts/forensics/span-index.py"

pass=0; fail=0
ok()  { echo "  [PASS] $1"; pass=$((pass + 1)); }
bad() { echo "  [FAIL] $1"; fail=$((fail + 1)); }

if ! command -v python3 >/dev/null 2>&1; then
  # An instrument that skips proves nothing — refuse with a named reason instead.
  echo "  [FAIL] python3 is not installed; the span index cannot be exercised"
  exit 1
fi

W=$(mktemp -d); trap 'rm -rf "$W"' EXIT

# --- fixture builders --------------------------------------------------------------------------

# ledger_line <session> <ts> <exit> [version] [schema] [script]
ledger_line() {
  python3 -c '
import json, sys
s, ts, ex, ver, schema, script = sys.argv[1:7]
rec = {"script": script, "phase": "readiness", "skill": "pw-prove", "version": ver,
       "commit": "deadbee", "session": s, "session_src": "host", "ts": ts,
       "duration_ms": 12, "exit": int(ex)}
out = {"schema": int(schema)}
out.update(rec)
print("PWPROVE_RUN " + json.dumps(out))
' "$1" "$2" "$3" "${4:-0.27.1}" "${5:-2}" "${6:-preflight.mjs}"
}

# transcript <slug> <uuid> <cwd> <ts...>  — one JSONL line per timestamp, plus two untimestamped
# header lines up front (real transcripts open with `mode`/`permission-mode` records that carry no
# timestamp, and those must never be counted into a span).
transcript() {
  local slug="$1" uuid="$2" cwd="$3"; shift 3
  mkdir -p "$W/projects/$slug"
  python3 -c '
import json, sys
path, uuid, cwd = sys.argv[1:4]
with open(path, "w", encoding="utf-8") as fh:
    fh.write(json.dumps({"type": "mode", "mode": "normal", "sessionId": uuid}) + "\n")
    fh.write(json.dumps({"type": "permission-mode", "permissionMode": "auto", "sessionId": uuid}) + "\n")
    for i, ts in enumerate(sys.argv[4:]):
        fh.write(json.dumps({"type": "assistant", "cwd": cwd, "uuid": "u%d" % i,
                             "timestamp": ts, "message": {"role": "assistant"}}) + "\n")
' "$W/projects/$slug/$uuid.jsonl" "$uuid" "$cwd" "$@"
}

# run_index <outfile> <errfile> <ledger> [extra args...] -> exit code in $rc
run_index() {
  local out="$1" err="$2" ledger="$3"; shift 3
  python3 "$IDX" --ledger "$ledger" --transcripts "$W/projects" "$@" >"$out" 2>"$err"
  rc=$?
}

# jq_like <json-file> <python-expression over `d`>
q() { python3 -c '
import json, sys
d = json.load(open(sys.argv[1]))
def session(sid):
    for s in d["sessions"]:
        if s["session"] == sid:
            return s
    raise SystemExit("no session " + sid)
print(eval(sys.argv[2]))
' "$1" "$2"; }

expect() {
  local name="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then ok "$name"; else bad "$name — got '$got', wanted '$want'"; fi
}

# Synthetic roots: classification keys on the repository NAME, not on any operator's home, and a
# fixture that hardcoded a real home would hide a regression that started keying on one.
WS="$W/fake/orca/workspaces"
WORK="$W/fake/work"

# --- case 1: the bracket ------------------------------------------------------------------------
echo "-- a session's ledger timestamps bracket exactly the transcript region they span --"
S1=11111111-1111-1111-1111-111111111111
L="$W/l1.jsonl"
{
  ledger_line "$S1" 2026-08-16T10:00:00.000Z 0 0.26.0
  ledger_line "$S1" 2026-08-16T10:05:00.000Z 3 0.27.1
} > "$L"
# Lines 3..7 are the timestamped entries; the ledger brackets 10:00..10:05, so lines 4..6.
transcript proj-widget-krill "$S1" "$WS/hyrd-widget/krill" \
  2026-08-16T09:59:00.000Z 2026-08-16T10:00:00.000Z 2026-08-16T10:02:00.000Z \
  2026-08-16T10:05:00.000Z 2026-08-16T10:06:00.000Z
run_index "$W/o1" "$W/e1" "$L"
if [ "$rc" != "0" ]; then
  bad "bracketing run exited $rc, wanted 0"; sed 's/^/         /' "$W/e1" | head -3
else
  ok "bracketing run exited 0"
  expect "span starts at the first entry at or after the first ledger ts" \
    "$(q "$W/o1" 'session("'"$S1"'")["span"]["line_start"]')" 4
  expect "span ends at the last entry at or before the last ledger ts" \
    "$(q "$W/o1" 'session("'"$S1"'")["span"]["line_end"]')" 6
  expect "span counts only the entries inside the window" \
    "$(q "$W/o1" 'session("'"$S1"'")["span"]["entries"]')" 3
  # The byte range must be seekable: reading [byte_start, byte_end) yields exactly those lines.
  sliced=$(python3 -c '
import json, sys
d = json.load(open(sys.argv[1])); s = d["sessions"][0]["span"]
with open(d["sessions"][0]["transcript"], "rb") as fh:
    fh.seek(s["byte_start"]); buf = fh.read(s["byte_end"] - s["byte_start"])
print(len([l for l in buf.decode().splitlines() if l]))
' "$W/o1")
  expect "byte range is seekable and holds exactly the spanned lines" "$sliced" 3
  expect "record count is the ledger's" "$(q "$W/o1" 'session("'"$S1"'")["records"]')" 2
  expect "non-zero exits are counted" "$(q "$W/o1" 'session("'"$S1"'")["nonzero_exits"]')" 1
  expect "first ledger timestamp is carried" \
    "$(q "$W/o1" 'session("'"$S1"'")["first_ts"]')" 2026-08-16T10:00:00.000Z
  expect "last ledger timestamp is carried" \
    "$(q "$W/o1" 'session("'"$S1"'")["last_ts"]')" 2026-08-16T10:05:00.000Z
  expect "every skill version seen in the session is carried" \
    "$(q "$W/o1" '",".join(session("'"$S1"'")["versions"]["pw-prove"])')" 0.26.0,0.27.1
  expect "repository is resolved from the transcript's cwd" \
    "$(q "$W/o1" 'session("'"$S1"'")["repository"]')" hyrd-widget
  expect "worktree is resolved from the transcript's cwd" \
    "$(q "$W/o1" 'session("'"$S1"'")["worktree"]')" krill
fi

# --- case 2: no transcript ----------------------------------------------------------------------
echo ""
echo "-- a session the ledger knows but no transcript exists for is marked, never dropped --"
S2=22222222-2222-2222-2222-222222222222
L="$W/l2.jsonl"
{
  ledger_line "$S1" 2026-08-16T10:00:00.000Z 0
  ledger_line "$S2" 2026-08-16T11:00:00.000Z 1
} > "$L"
run_index "$W/o2" "$W/e2" "$L"
if [ "$rc" != "0" ]; then
  bad "no-transcript run exited $rc, wanted 0"; sed 's/^/         /' "$W/e2" | head -3
else
  expect "the transcript-less session is still emitted" \
    "$(q "$W/o2" 'len([s for s in d["sessions"] if s["session"] == "'"$S2"'"])')" 1
  expect "it carries the explicit no-transcript marker" \
    "$(q "$W/o2" 'session("'"$S2"'")["no_transcript"]')" True
  expect "its transcript path is null, not a guess" \
    "$(q "$W/o2" 'session("'"$S2"'")["transcript"] is None')" True
  expect "its span is null, not a fabricated range" \
    "$(q "$W/o2" 'session("'"$S2"'")["span"] is None')" True
  expect "the gap is counted in the totals" "$(q "$W/o2" 'd["totals"]["no_transcript"]')" 1
  expect "its ledger record count survives the gap" \
    "$(q "$W/o2" 'session("'"$S2"'")["records"]')" 1
fi

# --- case 3: classification ---------------------------------------------------------------------
echo ""
echo "-- corpus, control and excluded are decided by the repository the session ran in --"
SC=33333333-3333-3333-3333-333333333333
SW=44444444-4444-4444-4444-444444444444
SE=55555555-5555-5555-5555-555555555555
SX=66666666-6666-6666-6666-666666666666
L="$W/l3.jsonl"
{
  ledger_line "$SC" 2026-08-16T10:00:00.000Z 0
  ledger_line "$SW" 2026-08-16T10:00:00.000Z 0
  ledger_line "$SE" 2026-08-16T10:00:00.000Z 1
  ledger_line "$SX" 2026-08-16T10:00:00.000Z 0
} > "$L"
transcript proj-chrysus-beluga "$SC" "$WS/nuxt-hyrd-chrysus/beluga" 2026-08-16T10:00:00.000Z
transcript proj-widget-main "$SW" "$WORK/hyrd-widget" 2026-08-16T10:00:00.000Z
transcript proj-e2e-skills-loggerhead "$SE" "$WS/e2e-skills/loggerhead" 2026-08-16T10:00:00.000Z
transcript proj-ui-library "$SX" "$WORK/hyrd-ui-library" 2026-08-16T10:00:00.000Z
run_index "$W/o3" "$W/e3" "$L"
if [ "$rc" != "0" ]; then
  bad "classification run exited $rc, wanted 0"; sed 's/^/         /' "$W/e3" | head -3
else
  expect "a chrysus worktree is corpus"        "$(q "$W/o3" 'session("'"$SC"'")["class"]')" corpus
  expect "a widget checkout is corpus"         "$(q "$W/o3" 'session("'"$SW"'")["class"]')" corpus
  expect "a primary checkout has no worktree"  "$(q "$W/o3" 'session("'"$SW"'")["worktree"] is None')" True
  expect "an e2e-skills worktree is control"   "$(q "$W/o3" 'session("'"$SE"'")["class"]')" control
  expect "control says why it is not corpus"   \
    "$(q "$W/o3" '"deliberate" in session("'"$SE"'")["reason"]')" True
  expect "any other repository is excluded"    "$(q "$W/o3" 'session("'"$SX"'")["class"]')" excluded
  expect "exclusion names the repository"      \
    "$(q "$W/o3" '"hyrd-ui-library" in session("'"$SX"'")["reason"]')" True
  expect "totals count each class"             \
    "$(q "$W/o3" '"%d/%d/%d" % (d["totals"]["corpus"], d["totals"]["control"], d["totals"]["excluded"])')" 2/1/1
fi

# --- case 4: unknown schema ---------------------------------------------------------------------
echo ""
echo "-- a record whose schema the index does not know is refused, with the schema named --"
S7=77777777-7777-7777-7777-777777777777
L="$W/l4.jsonl"
{
  ledger_line "$S1" 2026-08-16T10:00:00.000Z 0
  ledger_line "$S7" 2026-08-16T10:01:00.000Z 0 0.27.1 99
} > "$L"
run_index "$W/o4" "$W/e4" "$L"
if [ "$rc" != "0" ]; then
  bad "unknown-schema run exited $rc, wanted 0"; sed 's/^/         /' "$W/e4" | head -3
else
  expect "the refused record produces no session" \
    "$(q "$W/o4" 'len([s for s in d["sessions"] if s["session"] == "'"$S7"'"])')" 0
  expect "the refusal is counted"        "$(q "$W/o4" 'd["totals"]["refused_records"]')" 1
  expect "the refusal names the schema"  "$(q "$W/o4" '"99" in d["refusals"][0]["reason"]')" True
  expect "the refusal names the line"    "$(q "$W/o4" 'd["refusals"][0]["line"]')" 2
  if grep -q 'schema' "$W/e4"; then
    ok "the refusal is announced on stderr, not only buried in the JSON"
  else
    bad "nothing on stderr named the refused schema"
  fi
fi

# A schema the index knows but which predates the session field cannot be attributed to a session;
# that is a refusal with its own reason, not a record read as a null session.
echo ""
echo "-- a known schema that carries no session is refused for that reason, not read as null --"
L="$W/l5.jsonl"
{
  ledger_line "$S1" 2026-08-16T10:00:00.000Z 0
  python3 -c '
import json
print("PWPROVE_RUN " + json.dumps({"schema": 1, "script": "preflight.mjs", "phase": "readiness",
      "skill": "pw-prove", "version": "0.1.0", "commit": "8fab8c3",
      "ts": "2026-08-16T10:01:00.000Z", "duration_ms": 88, "exit": 3}))'
} > "$L"
run_index "$W/o5" "$W/e5" "$L"
if [ "$rc" != "0" ]; then
  bad "sessionless-schema run exited $rc, wanted 0"; sed 's/^/         /' "$W/e5" | head -3
else
  expect "only the attributable session is indexed" "$(q "$W/o5" 'len(d["sessions"])')" 1
  expect "the sessionless record is refused"        "$(q "$W/o5" 'd["totals"]["refused_records"]')" 1
  expect "the refusal names the session field"      \
    "$(q "$W/o5" '"session" in d["refusals"][0]["reason"]')" True
fi

# --- case 5: empty window -----------------------------------------------------------------------
echo ""
echo "-- an empty window exits non-zero with a named reason, never a clean empty corpus --"
L="$W/l6.jsonl"
ledger_line "$S1" 2026-08-01T10:00:00.000Z 0 > "$L"
run_index "$W/o6" "$W/e6" "$L" --since 2026-08-15
if [ "$rc" = "0" ]; then
  bad "empty window exited 0 — a clean empty corpus reads as 'nothing went wrong'"
else
  ok "empty window exited non-zero ($rc)"
  if grep -qi 'no ledger record' "$W/e6" && grep -q '2026-08-15' "$W/e6"; then
    ok "the reason names the empty window and its bound"
  else
    bad "stderr did not name the reason: $(head -1 "$W/e6")"
  fi
  if [ -s "$W/o6" ]; then
    bad "an empty-window run still wrote an index to stdout"
  else
    ok "no index was written"
  fi
fi

# --- case 6: window bounds ----------------------------------------------------------------------
echo ""
echo "-- --since is inclusive and --until exclusive, so a window is a half-open interval --"
L="$W/l7.jsonl"
{
  ledger_line "$S1" 2026-08-16T00:00:00.000Z 0
  ledger_line "$S2" 2026-08-17T00:00:00.000Z 0
} > "$L"
run_index "$W/o7" "$W/e7" "$L" --since 2026-08-16 --until 2026-08-17
if [ "$rc" != "0" ]; then
  bad "bounded-window run exited $rc, wanted 0"; sed 's/^/         /' "$W/e7" | head -3
else
  expect "the record at --since is in"      "$(q "$W/o7" 'len(d["sessions"])')" 1
  expect "the record at --until is out"     "$(q "$W/o7" 'd["sessions"][0]["session"]')" "$S1"
fi

# --- case 7: input errors -----------------------------------------------------------------------
echo ""
echo "-- a missing input is a usage error, not an empty index --"
run_index "$W/o8" "$W/e8" "$W/nope.jsonl"
if [ "$rc" = "1" ] && grep -qi 'ledger' "$W/e8"; then
  ok "a missing ledger exits 1 and names the ledger"
else
  bad "missing ledger — exit $rc, stderr: $(head -1 "$W/e8")"
fi
python3 "$IDX" --ledger "$L" --transcripts "$W/no-such-dir" >"$W/o9" 2>"$W/e9"; rc=$?
if [ "$rc" = "1" ] && grep -qi 'transcript' "$W/e9"; then
  ok "a missing transcript tree exits 1 and names it"
else
  bad "missing transcript tree — exit $rc, stderr: $(head -1 "$W/e9")"
fi

echo ""
echo "  span index: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
