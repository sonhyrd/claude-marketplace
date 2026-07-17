#!/usr/bin/env bash
# Smoke for the PTG_RUN run-ledger contract (issue #5), in the style of the generator-scripts
# process-boundary tests: spawn each shipped script on a cheap fixture invocation (usage-error
# paths — no network, no browser, milliseconds each) and assert the contract on the bytes it wrote:
#
#   - every shipped script emits exactly ONE `PTG_RUN {json}` stdout line, via the shared helper
#   - the JSON carries schema, script, phase, skill, version (== SKILL.md frontmatter), commit,
#     duration_ms, and an exit field matching the actual exit code
#   - the same line is appended to the ledger; $PTG_LEDGER override honored; default path is
#     $HOME/.ptg/ledger.jsonl; appends accumulate
#   - a ledger WRITE FAILURE never changes the exit code and never suppresses the stdout line
#   - preflight prints the version banner as its FIRST output line
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1
PTG="skills/playwright-test-generator/scripts"
SCAN="skills/e2e-reviewer/scripts/scan.mjs"

pass=0; fail=0
ok()   { echo "  [PASS] $1"; pass=$((pass + 1)); }
bad()  { echo "  [FAIL] $1"; fail=$((fail + 1)); }

W=$(mktemp -d); trap 'rm -rf "$W"' EXIT

frontmatter_version() {
  sed -n 's/^[[:space:]]*version:[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$1" | head -1
}
PTG_VERSION=$(frontmatter_version skills/playwright-test-generator/SKILL.md)
REV_VERSION=$(frontmatter_version skills/e2e-reviewer/SKILL.md)
[ -n "$PTG_VERSION" ] || { bad "cannot read version from playwright-test-generator SKILL.md"; }

# Assert the PTG_RUN line contract: exactly one line on stdout, JSON parses, fields present and
# typed, script/version/exit match. usage: assert_line <name> <stdout-file> <script> <exit> <version>
assert_line() {
  local name="$1" file="$2" script="$3" want_exit="$4" version="$5"
  local n
  n=$(grep -c '^PTG_RUN ' "$file")
  if [ "$n" != "1" ]; then bad "$name — $n PTG_RUN lines on stdout, wanted exactly 1"; return 1; fi
  if node -e '
    const fs = require("fs");
    const line = fs.readFileSync(process.argv[1], "utf8").split("\n").find(l => l.startsWith("PTG_RUN "));
    const j = JSON.parse(line.slice("PTG_RUN ".length));
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
    if (!ok) { console.error("bad PTG_RUN payload: " + line.trim()); process.exit(1); }
  ' "$file" "$script" "$want_exit" "$version" 2>"$W/jsonerr"; then
    ok "$name — one PTG_RUN line, contract fields hold"
  else
    bad "$name — PTG_RUN payload violates the contract"; sed 's/^/         /' "$W/jsonerr" | head -2; return 1
  fi
}

echo "-- all four shipped scripts emit PTG_RUN (usage-error fixtures, ledger overridden) --"
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
run_case "preflight.mjs (no BASE_URL)" 1 preflight.mjs "$PTG_VERSION" -- \
  env -u BASE_URL PTG_LEDGER="$L" node "$REPO_ROOT/$PTG/preflight.mjs"
run_case "host-on-r2.mjs (no args)" 1 host-on-r2.mjs "$PTG_VERSION" -- \
  env PTG_LEDGER="$L" node "$REPO_ROOT/$PTG/host-on-r2.mjs"
run_case "record.mjs (no args)" 1 record.mjs "$PTG_VERSION" -- \
  env PTG_LEDGER="$L" node "$REPO_ROOT/$PTG/record.mjs"
run_case "scan.mjs (nonexistent path)" 2 scan.mjs "$REV_VERSION" -- \
  env PTG_LEDGER="$L" node "$REPO_ROOT/$SCAN" "$W/does-not-exist"

echo ""
echo "-- ledger file: override honored, appends accumulate, line matches stdout --"
if [ "$(wc -l < "$L" | tr -d ' ')" = "4" ]; then
  ok "\$PTG_LEDGER honored — 4 invocations appended 4 lines"
else
  bad "\$PTG_LEDGER — expected 4 accumulated lines, got: $(wc -l < "$L" | tr -d ' ')"
fi
# The last case's stdout line and the last ledger line must be the SAME record.
if [ "$(grep '^PTG_RUN ' "$W/out")" = "$(tail -1 "$L")" ]; then
  ok "ledger line is byte-identical to the stdout line"
else
  bad "ledger line differs from the stdout line"
fi

echo ""
echo "-- default ledger path: \$HOME/.ptg/ledger.jsonl --"
( cd "$W" && env -u BASE_URL -u PTG_LEDGER HOME="$W/fakehome" node "$REPO_ROOT/$PTG/preflight.mjs" >"$W/out" 2>"$W/err" )
if [ -s "$W/fakehome/.ptg/ledger.jsonl" ] && [ "$(grep '^PTG_RUN ' "$W/out")" = "$(tail -1 "$W/fakehome/.ptg/ledger.jsonl")" ]; then
  ok "no override — line landed in \$HOME/.ptg/ledger.jsonl"
else
  bad "no override — \$HOME/.ptg/ledger.jsonl missing or wrong"
fi

echo ""
echo "-- ledger write failure is tolerated silently --"
( cd "$W" && env -u BASE_URL PTG_LEDGER=/dev/null/nope/ledger.jsonl node "$REPO_ROOT/$PTG/preflight.mjs" >"$W/out" 2>"$W/err" )
rc=$?
if [ "$rc" = "1" ]; then
  ok "unwritable ledger — exit code unchanged ($rc)"
else
  bad "unwritable ledger — exit $rc, wanted 1 (a ledger write failure must never fail a run)"
fi
assert_line "unwritable ledger — stdout line still emitted" "$W/out" preflight.mjs 1 "$PTG_VERSION"

echo ""
echo "-- preflight version banner is the FIRST output line --"
banner=$(head -1 "$W/out")
case "$banner" in
  "preflight: playwright-test-generator v$PTG_VERSION ("*")")
    ok "banner first: '$banner'" ;;
  *)
    bad "first stdout line is not the version banner: '$banner'" ;;
esac

echo ""
echo "  run-ledger smoke: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
