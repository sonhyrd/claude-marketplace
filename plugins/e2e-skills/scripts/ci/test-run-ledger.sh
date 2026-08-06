#!/usr/bin/env bash
# Smoke for the PWPROVE_RUN run-ledger contract (issue #5): spawn each shipped script on a cheap
# fixture invocation (usage-error paths — no network, no browser, milliseconds each) and assert the
# contract on the bytes it wrote:
#
#   - every shipped script emits exactly ONE `PWPROVE_RUN {json}` stdout line, via the shared helper
#   - the JSON carries schema, script, phase, skill, version (== SKILL.md frontmatter), commit,
#     duration_ms, and an exit field matching the actual exit code
#   - the same line is appended to the ledger; $PWPROVE_LEDGER override honored; default path is
#     $HOME/.ptg/ledger.jsonl; appends accumulate
#   - a ledger WRITE FAILURE never changes the exit code and never suppresses the stdout line
#   - preflight prints the version banner as its FIRST output line
#
# Only shipped scripts are proven here: pw-prove's four executables plus e2e-reviewer's scanner,
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
# typed, script/version/exit match. usage: assert_line <name> <stdout-file> <script> <exit> <version>
assert_line() {
  local name="$1" file="$2" script="$3" want_exit="$4" version="$5"
  local n
  n=$(grep -c '^PWPROVE_RUN ' "$file")
  if [ "$n" != "1" ]; then bad "$name — $n PWPROVE_RUN lines on stdout, wanted exactly 1"; return 1; fi
  if node -e '
    const fs = require("fs");
    const line = fs.readFileSync(process.argv[1], "utf8").split("\n").find(l => l.startsWith("PWPROVE_RUN "));
    const j = JSON.parse(line.slice("PWPROVE_RUN ".length));
    const [script, wantExit, version] = [process.argv[2], Number(process.argv[3]), process.argv[4]];
    const ok =
      j.schema === 1 &&
      j.script === script &&
      typeof j.phase === "string" && j.phase.length > 0 &&
      typeof j.skill === "string" && j.skill.length > 0 &&
      j.version === version &&
      typeof j.commit === "string" && j.commit.length > 0 &&
      Number.isInteger(j.duration_ms) && j.duration_ms >= 0 &&
      j.exit === wantExit;
    if (!ok) { console.error("bad PWPROVE_RUN payload: " + line.trim()); process.exit(1); }
  ' "$file" "$script" "$want_exit" "$version" 2>"$W/jsonerr"; then
    ok "$name — one PWPROVE_RUN line, contract fields hold"
  else
    bad "$name — PWPROVE_RUN payload violates the contract"; sed 's/^/         /' "$W/jsonerr" | head -2; return 1
  fi
}

echo "-- every shipped script emits PWPROVE_RUN (usage-error fixtures, ledger overridden) --"
# usage: run_case <name> <want-rc> <script-basename> <version> -- <cmd...>
run_case() {
  local name="$1" want="$2" script="$3" version="$4"; shift 5
  ( cd "$W" && "$@" >"$W/out" 2>"$W/err" ); local rc=$?
  if [ "$rc" != "$want" ]; then
    bad "$name — exit $rc, wanted $want"; sed 's/^/         /' "$W/err" | head -2; return
  fi
  assert_line "$name" "$W/out" "$script" "$rc" "$version" || return
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
run_case "scan.mjs (nonexistent path)" 2 scan.mjs "$REV_VERSION" -- \
  env PWPROVE_LEDGER="$L" node "$REPO_ROOT/$SCAN" "$W/does-not-exist"

echo ""
echo "-- ledger file: override honored, appends accumulate, line matches stdout --"
if [ "$(wc -l < "$L" | tr -d ' ')" = "5" ]; then
  ok "\$PWPROVE_LEDGER honored — 5 invocations appended 5 lines"
else
  bad "\$PWPROVE_LEDGER — expected 5 accumulated lines, got: $(wc -l < "$L" | tr -d ' ')"
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
