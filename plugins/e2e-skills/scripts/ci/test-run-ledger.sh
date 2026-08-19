#!/usr/bin/env bash
# Smoke for the PWPROVE_RUN run-ledger contract (issue #5): spawn each shipped script on a cheap
# fixture invocation (usage-error paths — no network, no browser, milliseconds each) and assert the
# contract on the bytes it wrote:
#
#   - every shipped script emits exactly ONE `PWPROVE_RUN {json}` stdout line, via the shared helper
#   - the JSON carries schema, script, phase, skill, version (== SKILL.md frontmatter), commit,
#     session/session_src, duration_ms, and an exit field matching the actual exit code
#   - session resolution order holds: $PWPROVE_SESSION > $CLAUDE_CODE_SESSION_ID > cwd-keyed nonce,
#     the nonce is shared by consecutive runs in one cwd and differs across cwds
#   - the same line is appended to the ledger; $PWPROVE_LEDGER override honored; default path is
#     $HOME/.ptg/ledger.jsonl; appends accumulate
#   - a ledger WRITE FAILURE never changes the exit code and never suppresses the stdout line
#   - preflight prints the version banner as its FIRST output line
#
# Only shipped scripts are proven here: pw-prove's six executables plus e2e-reviewer's scanner,
# which imports the same helper across the skill boundary. clips.mjs is a library, not an entry
# point, and leaves no record by design.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1
PW="skills/pw-prove/scripts"
SCAN="skills/e2e-reviewer/scripts/scan.mjs"

pass=0; fail=0
ok()   { echo "  [PASS] $1"; pass=$((pass + 1)); }
bad()  { echo "  [FAIL] $1"; fail=$((fail + 1)); }

W=$(mktemp -d); trap 'rm -rf "$W"' EXIT

frontmatter_version() {
  sed -n 's/^[[:space:]]*version:[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$1" | head -1
}
PW_VERSION=$(frontmatter_version skills/pw-prove/SKILL.md)
REV_VERSION=$(frontmatter_version skills/e2e-reviewer/SKILL.md)
[ -n "$PW_VERSION" ] || { bad "cannot read version from pw-prove SKILL.md"; }

# Assert the PWPROVE_RUN line contract: exactly one line on stdout, JSON parses, fields present and
# typed, script/version/exit match.
# usage: assert_line <name> <stdout-file> <script> <exit> <version> [session_src] [session]
# session_src empty = any non-empty source; session empty = any non-empty id.
assert_line() {
  local name="$1" file="$2" script="$3" want_exit="$4" version="$5" want_src="${6:-}" want_sess="${7:-}"
  local n
  n=$(grep -c '^PWPROVE_RUN ' "$file")
  if [ "$n" != "1" ]; then bad "$name — $n PWPROVE_RUN lines on stdout, wanted exactly 1"; return 1; fi
  if node -e '
    const fs = require("fs");
    const line = fs.readFileSync(process.argv[1], "utf8").split("\n").find(l => l.startsWith("PWPROVE_RUN "));
    const j = JSON.parse(line.slice("PWPROVE_RUN ".length));
    const [script, wantExit, version, wantSrc, wantSess] =
      [process.argv[2], Number(process.argv[3]), process.argv[4], process.argv[5], process.argv[6]];
    const ok =
      j.schema === 2 &&
      j.script === script &&
      typeof j.phase === "string" && j.phase.length > 0 &&
      typeof j.skill === "string" && j.skill.length > 0 &&
      j.version === version &&
      typeof j.commit === "string" && j.commit.length > 0 &&
      typeof j.session === "string" && j.session.length > 0 &&
      ["env", "host", "nonce", "none"].includes(j.session_src) &&
      (!wantSrc || j.session_src === wantSrc) &&
      (!wantSess || j.session === wantSess) &&
      Number.isInteger(j.duration_ms) && j.duration_ms >= 0 &&
      j.exit === wantExit;
    if (!ok) { console.error("bad PWPROVE_RUN payload: " + line.trim()); process.exit(1); }
  ' "$file" "$script" "$want_exit" "$version" "$want_src" "$want_sess" 2>"$W/jsonerr"; then
    ok "$name — one PWPROVE_RUN line, contract fields hold"
  else
    bad "$name — PWPROVE_RUN payload violates the contract"; sed 's/^/         /' "$W/jsonerr" | head -2; return 1
  fi
}

echo "-- every shipped script emits PWPROVE_RUN (usage-error fixtures, ledger overridden) --"
# Pin the session for these cases so the assertion is deterministic wherever CI runs — a GitHub
# runner has no $CLAUDE_CODE_SESSION_ID and would silently fall through to the nonce. Exported, so
# the `env ...` invocations below inherit it. The resolution ORDER gets its own block further down.
export PWPROVE_SESSION="fixture-session"
# usage: run_case <name> <want-rc> <script-basename> <version> -- <cmd...>
run_case() {
  local name="$1" want="$2" script="$3" version="$4"; shift 5
  ( cd "$W" && "$@" >"$W/out" 2>"$W/err" ); local rc=$?
  if [ "$rc" != "$want" ]; then
    bad "$name — exit $rc, wanted $want"; sed 's/^/         /' "$W/err" | head -2; return
  fi
  assert_line "$name" "$W/out" "$script" "$rc" "$version" env "$PWPROVE_SESSION" || return
}

L="$W/ledger.jsonl"
run_case "preflight.mjs (no BASE_URL)" 1 preflight.mjs "$PW_VERSION" -- \
  env -u BASE_URL PWPROVE_LEDGER="$L" node "$REPO_ROOT/$PW/preflight.mjs"
run_case "probe.mjs (no subcommand)" 1 probe.mjs "$PW_VERSION" -- \
  env PWPROVE_LEDGER="$L" node "$REPO_ROOT/$PW/probe.mjs"
run_case "hermetic.mjs (no args)" 2 hermetic.mjs "$PW_VERSION" -- \
  env PWPROVE_LEDGER="$L" node "$REPO_ROOT/$PW/hermetic.mjs"
run_case "publish-proof.mjs (no args)" 1 publish-proof.mjs "$PW_VERSION" -- \
  env PWPROVE_LEDGER="$L" node "$REPO_ROOT/$PW/publish-proof.mjs"
run_case "clip-fidelity.mjs (no subcommand)" 1 clip-fidelity.mjs "$PW_VERSION" -- \
  env PWPROVE_LEDGER="$L" node "$REPO_ROOT/$PW/clip-fidelity.mjs"
run_case "har-scrub.mjs (no HAR file)" 1 har-scrub.mjs "$PW_VERSION" -- \
  env PWPROVE_LEDGER="$L" node "$REPO_ROOT/$PW/har-scrub.mjs"
run_case "scan.mjs (nonexistent path)" 2 scan.mjs "$REV_VERSION" -- \
  env PWPROVE_LEDGER="$L" node "$REPO_ROOT/$SCAN" "$W/does-not-exist"

echo ""
echo "-- ledger file: override honored, appends accumulate, line matches stdout --"
if [ "$(wc -l < "$L" | tr -d ' ')" = "7" ]; then
  ok "\$PWPROVE_LEDGER honored — 7 invocations appended 7 lines"
else
  bad "\$PWPROVE_LEDGER — expected 7 accumulated lines, got: $(wc -l < "$L" | tr -d ' ')"
fi
# The last case's stdout line and the last ledger line must be the SAME record.
if [ "$(grep '^PWPROVE_RUN ' "$W/out")" = "$(tail -1 "$L")" ]; then
  ok "ledger line is byte-identical to the stdout line"
else
  bad "ledger line differs from the stdout line"
fi

echo ""
echo "-- default ledger path: \$HOME/.ptg/ledger.jsonl --"
( cd "$W" && env -u BASE_URL -u PWPROVE_LEDGER HOME="$W/fakehome" node "$REPO_ROOT/$PW/preflight.mjs" >"$W/out" 2>"$W/err" )
if [ -s "$W/fakehome/.ptg/ledger.jsonl" ] && [ "$(grep '^PWPROVE_RUN ' "$W/out")" = "$(tail -1 "$W/fakehome/.ptg/ledger.jsonl")" ]; then
  ok "no override — line landed in \$HOME/.ptg/ledger.jsonl"
else
  bad "no override — \$HOME/.ptg/ledger.jsonl missing or wrong"
fi

echo ""
echo "-- ledger write failure is tolerated silently --"
( cd "$W" && env -u BASE_URL PWPROVE_LEDGER=/dev/null/nope/ledger.jsonl node "$REPO_ROOT/$PW/preflight.mjs" >"$W/out" 2>"$W/err" )
rc=$?
if [ "$rc" = "1" ]; then
  ok "unwritable ledger — exit code unchanged ($rc)"
else
  bad "unwritable ledger — exit $rc, wanted 1 (a ledger write failure must never fail a run)"
fi
assert_line "unwritable ledger — stdout line still emitted" "$W/out" preflight.mjs 1 "$PW_VERSION"

echo ""
echo "-- session id: resolution order, and the nonce's cwd scope --"
# One proof is many processes; the ledger can only answer "how many proofs" if they agree on a
# session. preflight is the fixture (cheapest failing script), run with the environment varied.
# usage: sess_run <outfile> <cwd> <env-assignments...>
sess_run() {
  local out="$1" dir="$2"; shift 2
  mkdir -p "$dir"
  # "$@" goes BEFORE the assignments: env stops reading -u options at the first NAME=VALUE, so a
  # `-u` placed after one is parsed as the command to run (exit 127, no record, silent pass).
  ( cd "$dir" && env -u BASE_URL "$@" PWPROVE_LEDGER="$W/sess-ledger.jsonl" \
      node "$REPO_ROOT/$PW/preflight.mjs" >"$out" 2>/dev/null )
}
sess_of() {
  node -e '
    const fs = require("fs");
    const line = fs.readFileSync(process.argv[1], "utf8").split("\n").find(l => l.startsWith("PWPROVE_RUN "));
    const j = JSON.parse(line.slice("PWPROVE_RUN ".length));
    process.stdout.write(j.session + " " + j.session_src);
  ' "$1"
}

sess_run "$W/s-env" "$W/cwdA" PWPROVE_SESSION=explicit-id CLAUDE_CODE_SESSION_ID=host-id
assert_line "\$PWPROVE_SESSION wins over the host id" "$W/s-env" preflight.mjs 1 "$PW_VERSION" env explicit-id

sess_run "$W/s-host" "$W/cwdA" -u PWPROVE_SESSION CLAUDE_CODE_SESSION_ID=host-id
assert_line "host \$CLAUDE_CODE_SESSION_ID used when unoverridden" "$W/s-host" preflight.mjs 1 "$PW_VERSION" host host-id

# No override and no host id: the cwd-keyed nonce. Consecutive runs in one cwd share a session
# (that is the whole point — preflight and probe are one proof); a different cwd does not.
sess_run "$W/s-n1" "$W/cwdA" -u PWPROVE_SESSION -u CLAUDE_CODE_SESSION_ID TMPDIR="$W/tmp"
sess_run "$W/s-n2" "$W/cwdA" -u PWPROVE_SESSION -u CLAUDE_CODE_SESSION_ID TMPDIR="$W/tmp"
sess_run "$W/s-n3" "$W/cwdB" -u PWPROVE_SESSION -u CLAUDE_CODE_SESSION_ID TMPDIR="$W/tmp"
n1=$(sess_of "$W/s-n1"); n2=$(sess_of "$W/s-n2"); n3=$(sess_of "$W/s-n3")
assert_line "nonce fallback when neither env nor host is set" "$W/s-n1" preflight.mjs 1 "$PW_VERSION" nonce
if [ "$n1" = "$n2" ]; then
  ok "nonce — consecutive runs in one cwd share a session (${n1%% *})"
else
  bad "nonce — same cwd produced two sessions: '$n1' vs '$n2'"
fi
if [ "${n1%% *}" != "${n3%% *}" ]; then
  ok "nonce — a different cwd gets a different session"
else
  bad "nonce — different cwds collapsed into one session (${n1%% *})"
fi

# An unwritable $TMPDIR must not fail the run, and must not emit a half-populated record.
sess_run "$W/s-none" "$W/cwdA" -u PWPROVE_SESSION -u CLAUDE_CODE_SESSION_ID TMPDIR=/dev/null/nope
rc=$?
if [ "$rc" = "1" ]; then
  ok "unwritable \$TMPDIR — exit code unchanged ($rc)"
else
  bad "unwritable \$TMPDIR — exit $rc, wanted 1 (session resolution must never fail a run)"
fi
assert_line "unwritable \$TMPDIR — record still emitted, session 'unknown'" \
  "$W/s-none" preflight.mjs 1 "$PW_VERSION" none unknown

echo ""
echo "-- preflight version banner is the FIRST output line --"
banner=$(head -1 "$W/out")
case "$banner" in
  "preflight: pw-prove v$PW_VERSION ("*")")
    ok "banner first: '$banner'" ;;
  *)
    bad "first stdout line is not the version banner: '$banner'" ;;
esac

echo ""
echo "  run-ledger smoke: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
