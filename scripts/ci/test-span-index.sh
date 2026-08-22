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

# turns <slug> <uuid> <cwd> <spec...>  — a transcript with turn KINDS, for the reaction tail.
# Each spec is `<kind>@<ts>`: `a` an assistant turn, `t` a tool result (a `user` record carrying
# toolUseResult — the bulk of any real transcript and never a human turn), `h` a human turn (a
# `user` record with prose and no toolUseResult), `x` a record with no timestamp at all.
turns() {
  local slug="$1" uuid="$2" cwd="$3"; shift 3
  mkdir -p "$W/projects/$slug"
  python3 -c '
import json, sys
path, uuid, cwd = sys.argv[1:4]
with open(path, "w", encoding="utf-8") as fh:
    fh.write(json.dumps({"type": "mode", "mode": "normal", "sessionId": uuid}) + "\n")
    for i, spec in enumerate(sys.argv[4:]):
        kind, _, ts = spec.partition("@")
        rec = {"cwd": cwd, "uuid": "u%d" % i}
        if ts:
            rec["timestamp"] = ts
        if kind == "a":
            rec["type"] = "assistant"
            rec["message"] = {"role": "assistant", "content": [{"type": "text", "text": "..."}]}
        elif kind == "t":
            rec["type"] = "user"
            rec["toolUseResult"] = {"stdout": "..."}
            rec["message"] = {"role": "user",
                              "content": [{"type": "tool_result", "tool_use_id": "t%d" % i}]}
        elif kind == "h":
            rec["type"] = "user"
            rec["message"] = {"role": "user", "content": [{"type": "text", "text": "no, redo it"}]}
        else:
            rec["type"] = "attachment"
        fh.write(json.dumps(rec) + "\n")
' "$W/projects/$slug/$uuid.jsonl" "$uuid" "$cwd" "$@"
}

# run_index <outfile> <errfile> <ledger> [extra args...] -> exit code in $rc
run_index() {
  local out="$1" err="$2" ledger="$3"; shift 3
  python3 "$IDX" --ledger "$ledger" --transcripts "$W/projects" "$@" >"$out" 2>"$err"
  rc=$?
}

# field <json-file> <python expression over the loaded index `d`, with a session(id) helper>
# The eval() is deliberate: this is a fixture harness reading expressions written literally a few
# lines below, which keeps an assertion readable as one line instead of a bespoke accessor each.
field() { python3 -c '
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
    "$(field "$W/o1" 'session("'"$S1"'")["span"]["line_start"]')" 4
  expect "span ends at the last entry at or before the last ledger ts" \
    "$(field "$W/o1" 'session("'"$S1"'")["span"]["line_end"]')" 6
  expect "span counts only the entries inside the window" \
    "$(field "$W/o1" 'session("'"$S1"'")["span"]["entries"]')" 3
  # The byte range must be seekable: reading [byte_start, byte_end) yields exactly those lines.
  sliced=$(python3 -c '
import json, sys
d = json.load(open(sys.argv[1])); s = d["sessions"][0]["span"]
with open(d["sessions"][0]["transcript"], "rb") as fh:
    fh.seek(s["byte_start"]); buf = fh.read(s["byte_end"] - s["byte_start"])
print(len([l for l in buf.decode().splitlines() if l]))
' "$W/o1")
  expect "byte range is seekable and holds exactly the spanned lines" "$sliced" 3
  expect "record count is the ledger's" "$(field "$W/o1" 'session("'"$S1"'")["records"]')" 2
  expect "non-zero exits are counted" "$(field "$W/o1" 'session("'"$S1"'")["nonzero_exits"]')" 1
  expect "first ledger timestamp is carried" \
    "$(field "$W/o1" 'session("'"$S1"'")["first_ts"]')" 2026-08-16T10:00:00.000Z
  expect "last ledger timestamp is carried" \
    "$(field "$W/o1" 'session("'"$S1"'")["last_ts"]')" 2026-08-16T10:05:00.000Z
  expect "every skill version seen in the session is carried" \
    "$(field "$W/o1" '",".join(session("'"$S1"'")["versions"]["pw-prove"])')" 0.26.0,0.27.1
  expect "repository is resolved from the transcript's cwd" \
    "$(field "$W/o1" 'session("'"$S1"'")["repository"]')" hyrd-widget
  expect "worktree is resolved from the transcript's cwd" \
    "$(field "$W/o1" 'session("'"$S1"'")["worktree"]')" krill
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
    "$(field "$W/o2" 'len([s for s in d["sessions"] if s["session"] == "'"$S2"'"])')" 1
  expect "it carries the explicit no-transcript marker" \
    "$(field "$W/o2" 'session("'"$S2"'")["no_transcript"]')" True
  expect "its transcript path is null, not a guess" \
    "$(field "$W/o2" 'session("'"$S2"'")["transcript"] is None')" True
  expect "its span is null, not a fabricated range" \
    "$(field "$W/o2" 'session("'"$S2"'")["span"] is None')" True
  expect "the gap is counted in the totals" "$(field "$W/o2" 'd["totals"]["no_transcript"]')" 1
  expect "its ledger record count survives the gap" \
    "$(field "$W/o2" 'session("'"$S2"'")["records"]')" 1
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
  expect "a chrysus worktree is corpus"        "$(field "$W/o3" 'session("'"$SC"'")["class"]')" corpus
  expect "a widget checkout is corpus"         "$(field "$W/o3" 'session("'"$SW"'")["class"]')" corpus
  expect "a primary checkout has no worktree"  "$(field "$W/o3" 'session("'"$SW"'")["worktree"] is None')" True
  expect "an e2e-skills worktree is control"   "$(field "$W/o3" 'session("'"$SE"'")["class"]')" control
  expect "control says why it is not corpus"   \
    "$(field "$W/o3" '"deliberate" in session("'"$SE"'")["reason"]')" True
  expect "any other repository is excluded"    "$(field "$W/o3" 'session("'"$SX"'")["class"]')" excluded
  expect "exclusion names the repository"      \
    "$(field "$W/o3" '"hyrd-ui-library" in session("'"$SX"'")["reason"]')" True
  expect "totals count each class"             \
    "$(field "$W/o3" '"%d/%d/%d" % (d["totals"]["corpus"], d["totals"]["control"], d["totals"]["excluded"])')" 2/1/1
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
    "$(field "$W/o4" 'len([s for s in d["sessions"] if s["session"] == "'"$S7"'"])')" 0
  expect "the refusal is counted"        "$(field "$W/o4" 'd["totals"]["refused_records"]')" 1
  expect "the refusal names the schema"  "$(field "$W/o4" '"99" in d["refusals"][0]["reason"]')" True
  expect "the refusal names the line"    "$(field "$W/o4" 'd["refusals"][0]["line"]')" 2
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
  expect "only the attributable session is indexed" "$(field "$W/o5" 'len(d["sessions"])')" 1
  expect "the sessionless record is refused"        "$(field "$W/o5" 'd["totals"]["refused_records"]')" 1
  expect "the refusal names the session field"      \
    "$(field "$W/o5" '"session" in d["refusals"][0]["reason"]')" True
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
  expect "the record at --since is in"      "$(field "$W/o7" 'len(d["sessions"])')" 1
  expect "the record at --until is out"     "$(field "$W/o7" 'd["sessions"][0]["session"]')" "$S1"
fi

# --- case 7: a cwd below the repository root -----------------------------------------------------
echo ""
echo "-- a session entered at a subdirectory is still attributed to its repository --"
S8=88888888-8888-8888-8888-888888888888
L="$W/l8.jsonl"
ledger_line "$S8" 2026-08-16T10:00:00.000Z 0 > "$L"
transcript proj-chrysus-subdir "$S8" "$WORK/nuxt-hyrd-chrysus/apps/web" 2026-08-16T10:00:00.000Z
run_index "$W/o10" "$W/e10" "$L"
if [ "$rc" != "0" ]; then
  bad "subdirectory run exited $rc, wanted 0"; sed 's/^/         /' "$W/e10" | head -3
else
  # Reading the last path segment would name the repository `web` and exclude it with a reason
  # that reads perfectly right — a wrong verdict wearing a right one's clothes.
  expect "the repository is the checkout, not the subdirectory" \
    "$(field "$W/o10" 'session("'"$S8"'")["repository"]')" nuxt-hyrd-chrysus
  expect "and it is still corpus" "$(field "$W/o10" 'session("'"$S8"'")["class"]')" corpus
fi

# --- case 8: the last record's duration ----------------------------------------------------------
echo ""
echo "-- the span covers the last invocation's OUTPUT, not just the moment it started --"
S9=99999999-9999-9999-9999-999999999999
L="$W/l9.jsonl"
# One record starting at 10:00:00 and running 90s. Its result lands at 10:01:00, after the only
# ledger timestamp there is; a span ending at the start would cut the last run's outcome off.
python3 -c '
import json
print("PWPROVE_RUN " + json.dumps({"schema": 2, "script": "probe.mjs", "phase": "recon",
      "skill": "pw-prove", "version": "0.27.1", "commit": "deadbee",
      "session": "'"$S9"'", "session_src": "host", "ts": "2026-08-16T10:00:00.000Z",
      "duration_ms": 90000, "exit": 1}))' > "$L"
transcript proj-widget-duration "$S9" "$WS/hyrd-widget/krill" \
  2026-08-16T10:00:00.000Z 2026-08-16T10:01:00.000Z 2026-08-16T10:02:00.000Z
run_index "$W/o11" "$W/e11" "$L"
if [ "$rc" != "0" ]; then
  bad "duration run exited $rc, wanted 0"; sed 's/^/         /' "$W/e11" | head -3
else
  expect "the span reaches the entry inside the last run's duration" \
    "$(field "$W/o11" 'session("'"$S9"'")["span"]["entries"]')" 2
  expect "the span's upper bound is the run's end, not its start" \
    "$(field "$W/o11" 'session("'"$S9"'")["span_until"]')" 2026-08-16T10:01:30.000Z
  expect "the last ledger timestamp is reported unchanged" \
    "$(field "$W/o11" 'session("'"$S9"'")["last_ts"]')" 2026-08-16T10:00:00.000Z
fi

# --- case 9: two transcripts for one session id --------------------------------------------------
echo ""
echo "-- one session id under two project directories is reported, not resolved by walk order --"
L="$W/l10.jsonl"
ledger_line "$S9" 2026-08-16T10:00:00.000Z 0 > "$L"
transcript proj-alpha-copy "$S9" "$WS/hyrd-widget/krill" 2026-08-16T10:00:00.000Z
run_index "$W/o12" "$W/e12" "$L"
if [ "$rc" != "0" ]; then
  bad "ambiguous-transcript run exited $rc, wanted 0"; sed 's/^/         /' "$W/e12" | head -3
else
  expect "the collision is counted"        "$(field "$W/o12" 'd["totals"]["ambiguous_transcripts"]')" 1
  expect "the unread transcript is named"  \
    "$(field "$W/o12" 'len(session("'"$S9"'")["transcript_also_at"])')" 1
  expect "the one that was read is chosen by sort order, not walk order" \
    "$(field "$W/o12" 'session("'"$S9"'")["transcript"] < session("'"$S9"'")["transcript_also_at"][0]')" True
  if grep -q 'transcripts on disk' "$W/e12"; then
    ok "the collision is announced on stderr"
  else
    bad "nothing on stderr named the transcript collision"
  fi
fi

# --- case 10: --out ------------------------------------------------------------------------------
echo ""
echo "-- --out writes the index to a file and leaves stdout clean --"
L="$W/l11.jsonl"
ledger_line "$S1" 2026-08-16T10:00:00.000Z 0 > "$L"
run_index "$W/o13" "$W/e13" "$L" --out "$W/index.json"
if [ "$rc" != "0" ]; then
  bad "--out run exited $rc, wanted 0"; sed 's/^/         /' "$W/e13" | head -3
elif [ -s "$W/o13" ]; then
  bad "--out still wrote the index to stdout"
else
  expect "the file holds the index" "$(field "$W/index.json" 'd["totals"]["sessions"]')" 1
fi

# --- case 11: a transcript-less session is announced, not only tallied ---------------------------
echo ""
echo "-- a gap in the corpus is stated on stderr, where a reader will meet it --"
L="$W/l12.jsonl"
{
  ledger_line "$S1" 2026-08-16T10:00:00.000Z 0
  ledger_line "$S2" 2026-08-16T11:00:00.000Z 1
} > "$L"
run_index "$W/o14" "$W/e14" "$L"
if grep -q "$S2" "$W/e14" && grep -qi 'no transcript' "$W/e14"; then
  ok "the transcript-less session is named on stderr"
else
  bad "stderr did not name the transcript-less session: $(head -1 "$W/e14")"
fi

# --- case 12: input errors -----------------------------------------------------------------------
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

# --- case 13: the reaction tail ------------------------------------------------------------------
# The span ends when the last script EXITS. What the agent then did about that result — the turns
# where a failure is actually handled — falls outside it, so the index also emits a bounded tail.
echo ""
echo "-- the reaction tail runs past the last script exit to the moment control returns --"
ST=77777777-7777-7777-7777-777777777777
L="$W/l13.jsonl"
ledger_line "$ST" 2026-08-16T10:00:00.000Z 1 > "$L"
# line 1 header; 2 pre-span; 3 the spanned entry; 4-6 the reaction; 7 the human turn; 8 beyond.
turns proj-widget-tail "$ST" "$WS/hyrd-widget/krill" \
  a@2026-08-16T09:59:00.000Z a@2026-08-16T10:00:00.000Z \
  t@2026-08-16T10:00:10.000Z a@2026-08-16T10:00:20.000Z t@2026-08-16T10:00:30.000Z \
  h@2026-08-16T10:01:00.000Z a@2026-08-16T10:02:00.000Z
run_index "$W/o15" "$W/e15" "$L"
if [ "$rc" != "0" ]; then
  bad "tail run exited $rc, wanted 0"; sed 's/^/         /' "$W/e15" | head -3
else
  expect "the span itself still ends at the last script exit" \
    "$(field "$W/o15" 'session("'"$ST"'")["span"]["line_end"]')" 3
  expect "the tail starts on the line after the span" \
    "$(field "$W/o15" 'session("'"$ST"'")["tail"]["line_start"]')" 4
  expect "a tool result is not a human turn, so the tail reads past three of them" \
    "$(field "$W/o15" 'session("'"$ST"'")["tail"]["line_end"]')" 7
  expect "the human turn that ends the tail is included, not cut before" \
    "$(field "$W/o15" 'session("'"$ST"'")["tail"]["human_turn_line"]')" 7
  expect "the tail says why it stopped" \
    "$(field "$W/o15" 'session("'"$ST"'")["tail"]["stop"]')" human-turn
  expect "the tail counts its lines" \
    "$(field "$W/o15" 'session("'"$ST"'")["tail"]["lines"]')" 4
  sliced=$(python3 -c '
import json, sys
d = json.load(open(sys.argv[1])); s = d["sessions"][0]; t = s["tail"]
with open(s["transcript"], "rb") as fh:
    fh.seek(t["byte_start"]); buf = fh.read(t["byte_end"] - t["byte_start"])
print(len([l for l in buf.decode().splitlines() if l]))
' "$W/o15")
  expect "the tail's byte range is seekable and holds exactly its lines" "$sliced" 4
fi

# --- case 14: a tail nobody closed ----------------------------------------------------------------
echo ""
echo "-- a run that ends without the human saying anything tails to the end of the transcript --"
L="$W/l14.jsonl"
ledger_line "$ST" 2026-08-16T10:00:00.000Z 0 > "$L"
turns proj-widget-tail "$ST" "$WS/hyrd-widget/krill" \
  a@2026-08-16T10:00:00.000Z a@2026-08-16T10:00:10.000Z a@2026-08-16T10:00:20.000Z
run_index "$W/o16" "$W/e16" "$L"
if [ "$rc" != "0" ]; then
  bad "open-tail run exited $rc, wanted 0"; sed 's/^/         /' "$W/e16" | head -3
else
  expect "it reads to the last line" "$(field "$W/o16" 'session("'"$ST"'")["tail"]["line_end"]')" 4
  expect "and says so"  "$(field "$W/o16" 'session("'"$ST"'")["tail"]["stop"]')" end-of-transcript
  expect "no human turn is claimed" \
    "$(field "$W/o16" 'session("'"$ST"'")["tail"]["human_turn_line"] is None')" True
fi

# --- case 15: the two caps ------------------------------------------------------------------------
# 14 of the 26 corpus sessions have no human turn after their last script exit, and two of those
# transcripts continue into unrelated work for another 1,145 and 2,617 lines. Without a cap the
# tail swallows the rest of the working day.
echo ""
echo "-- a transcript that runs on into unrelated work is cut by the line cap, and says so --"
L="$W/l15.jsonl"
ledger_line "$ST" 2026-08-16T10:00:00.000Z 0 > "$L"
turns proj-widget-tail "$ST" "$WS/hyrd-widget/krill" \
  a@2026-08-16T10:00:00.000Z a@2026-08-16T10:00:10.000Z a@2026-08-16T10:00:20.000Z \
  a@2026-08-16T10:00:30.000Z a@2026-08-16T10:00:40.000Z
run_index "$W/o17" "$W/e17" "$L" --tail-lines 2
if [ "$rc" != "0" ]; then
  bad "line-cap run exited $rc, wanted 0"; sed 's/^/         /' "$W/e17" | head -3
else
  expect "the tail stops at the cap" "$(field "$W/o17" 'session("'"$ST"'")["tail"]["lines"]')" 2
  expect "and names the cap as the reason" \
    "$(field "$W/o17" 'session("'"$ST"'")["tail"]["stop"]')" line-cap
  expect "the caps in force are recorded with the index" \
    "$(field "$W/o17" 'd["source"]["tail"]["lines"]')" 2
fi

echo ""
echo "-- a human turn hours later is a new task, not a reaction: the time cap cuts it off --"
L="$W/l16.jsonl"
ledger_line "$ST" 2026-08-16T10:00:00.000Z 0 > "$L"
turns proj-widget-tail "$ST" "$WS/hyrd-widget/krill" \
  a@2026-08-16T10:00:00.000Z a@2026-08-16T10:00:30.000Z h@2026-08-16T13:00:00.000Z
run_index "$W/o18" "$W/e18" "$L" --tail-minutes 30
if [ "$rc" != "0" ]; then
  bad "time-cap run exited $rc, wanted 0"; sed 's/^/         /' "$W/e18" | head -3
else
  expect "the late turn is left out of the tail" \
    "$(field "$W/o18" 'session("'"$ST"'")["tail"]["lines"]')" 1
  expect "the reason is the time cap, not the human turn" \
    "$(field "$W/o18" 'session("'"$ST"'")["tail"]["stop"]')" time-cap
  expect "no human turn is claimed for a turn outside the window" \
    "$(field "$W/o18" 'session("'"$ST"'")["tail"]["human_turn_line"] is None')" True
fi

# --- case 16: nothing to tail ---------------------------------------------------------------------
echo ""
echo "-- a session with no transcript, and a span at the very end of one, get no invented tail --"
L="$W/l17.jsonl"
{
  ledger_line "$ST" 2026-08-16T10:00:00.000Z 0
  ledger_line "$S2" 2026-08-16T11:00:00.000Z 0
} > "$L"
turns proj-widget-tail "$ST" "$WS/hyrd-widget/krill" a@2026-08-16T10:00:00.000Z
run_index "$W/o19" "$W/e19" "$L"
if [ "$rc" != "0" ]; then
  bad "empty-tail run exited $rc, wanted 0"; sed 's/^/         /' "$W/e19" | head -3
else
  expect "a span ending on the last line tails nothing and says so" \
    "$(field "$W/o19" 'session("'"$ST"'")["tail"]["lines"]')" 0
  expect "and still names its stop reason" \
    "$(field "$W/o19" 'session("'"$ST"'")["tail"]["stop"]')" end-of-transcript
  expect "a session with no transcript has no tail, not an empty one" \
    "$(field "$W/o19" 'session("'"$S2"'")["tail"] is None')" True
fi


echo ""
echo "  span index: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
