#!/usr/bin/env bash
# Process-boundary tests for the four shipped generator scripts: preflight.mjs, host-on-r2.mjs,
# record.mjs and probe.mjs. The seam is the highest one available — spawn the script, assert on the
# exit code and the bytes it wrote. That is the whole of its contract, and it is the boundary the
# shell-to-Node port promised to preserve.
#
# These deliberately do NOT reach the network. Every gate under test trips BEFORE the script would
# call wrangler or Playwright: record.mjs shells out to `npx playwright test`, so we shim npx on PATH
# and hand it a pre-generated film. ffmpeg/ffprobe stay REAL — the duration parse and the contact
# sheet are things under test, not things to fake.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1
S="skills/playwright-test-generator/scripts"

pass=0; fail=0
ok()   { echo "  [PASS] $1"; pass=$((pass + 1)); }
bad()  { echo "  [FAIL] $1"; fail=$((fail + 1)); }

W=$(mktemp -d); trap 'rm -rf "$W"' EXIT

# Run a script and assert its exit code (the contract), plus optionally that stderr names its gate.
# usage: expect_exit <want-rc> <name> -- <cmd...>
expect_exit() {
  local want="$1" name="$2"; shift 3
  ( cd "$W" && "$@" >"$W/out" 2>"$W/err" ); local rc=$?
  if [ "$rc" != "$want" ]; then
    bad "$name — exit $rc, wanted $want"; sed 's/^/         /' "$W/err" | head -2; return
  fi
  ok "$name — exit $rc"
}
stderr_has() {
  if grep -qF -- "$2" "$W/err"; then ok "$1"; else bad "$1 — stderr lacks '$2'"; fi
}

echo "-- host-on-r2: the three STOP gates --"
# These run in gate order. Each trips before any upload is attempted, so none of them need wrangler.
expect_exit 2 "degenerate key: dangling '-' (pr42-.webm from an unset SHA)" -- \
  node "$REPO_ROOT/$S/host-on-r2.mjs" f.webm proj 'pr42-.webm'
expect_exit 2 "degenerate key: empty segment" -- \
  node "$REPO_ROOT/$S/host-on-r2.mjs" f.webm proj 'a//b.webm'

: > "$W/empty.webm"
expect_exit 3 "empty file: 0B is not a proof" -- \
  node "$REPO_ROOT/$S/host-on-r2.mjs" empty.webm proj
head -c 500 /dev/zero > "$W/tiny.webm"
expect_exit 3 "truncated file: 500B < 1KB" -- \
  node "$REPO_ROOT/$S/host-on-r2.mjs" tiny.webm proj

# Token gate: the payload is BINARY, so the scan must be byte-literal, not UTF-8 decoded.
head -c 4096 /dev/urandom > "$W/leaky.webm"
printf 'tok-abc123' >> "$W/leaky.webm"
( cd "$W" && BEARER='tok-abc123' node "$REPO_ROOT/$S/host-on-r2.mjs" leaky.webm proj >"$W/out" 2>"$W/err" )
[ "$?" -eq 6 ] && ok "token gate: \$BEARER found in the payload — exit 6" \
                || bad "token gate: \$BEARER in the payload should exit 6"

head -c 4096 /dev/urandom > "$W/clean.webm"
printf 'const t = "tok-abc123";\n' > "$W/spec.ts"
( cd "$W" && BEARER='tok-abc123' SCAN='spec.ts' node "$REPO_ROOT/$S/host-on-r2.mjs" clean.webm proj >"$W/out" 2>"$W/err" )
[ "$?" -eq 6 ] && ok "token gate: \$BEARER found in a \$SCAN artifact — exit 6" \
                || bad "token gate: \$BEARER in a \$SCAN artifact should exit 6"

echo ""
echo "-- preflight: dead origin and ready origin --"
# Port 1 is reserved and never listens: a guaranteed dead origin, no network egress.
expect_exit 3 "dead origin STOPs after READY_TIMEOUT" -- \
  env BASE_URL=http://127.0.0.1:1 READY_TIMEOUT=2 node "$REPO_ROOT/$S/preflight.mjs"
# A non-numeric timeout used to spin forever (`waited >= NaN` is never true). It must refuse instead.
expect_exit 1 "non-numeric READY_TIMEOUT is refused, not looped on" -- \
  env BASE_URL=http://127.0.0.1:1 READY_TIMEOUT=abc node "$REPO_ROOT/$S/preflight.mjs"

# A real loopback server, so the "up and serving" branch is genuinely taken.
node -e 'require("http").createServer((q,s)=>{s.writeHead(200);s.end("ok")}).listen(8739,"127.0.0.1")' &
SRV=$!
for _ in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:8739 && break; sleep 0.1; done
( cd "$W" && BASE_URL=http://127.0.0.1:8739 READY_TIMEOUT=10 node "$REPO_ROOT/$S/preflight.mjs" >"$W/out" 2>"$W/err" )
rc=$?
{ kill $SRV && wait $SRV; } 2>/dev/null   # wait, else the shell prints its own "Terminated" line
if [ "$rc" -eq 0 ] && grep -q '^READY=yes$' "$W/out"; then
  ok "ready origin — exit 0 and READY=yes on stdout"
else
  bad "ready origin — exit $rc, stdout: $(head -c 120 "$W/out")"
fi

echo ""
echo "-- record: the film-QA gate --"
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "  [SKIP] ffmpeg/ffprobe not on PATH — the film-QA gate cannot be exercised"
else
  mkdir -p "$W/bin" "$W/fix"
  # Films are generated ONCE and copied in by the shim, so every case sees identical bytes.
  ffmpeg -y -f lavfi -i testsrc=size=1600x900:rate=10:duration=14 -c:v libvpx-vp9 -b:v 200k \
    "$W/fix/long.webm" >/dev/null 2>&1
  ffmpeg -y -f lavfi -i testsrc=size=1600x900:rate=10:duration=5 -c:v libvpx-vp9 -b:v 200k \
    "$W/fix/short.webm" >/dev/null 2>&1
  # -live 1 stops the muxer seeking back to write duration+cues, so ffprobe reports N/A. This is what
  # a real page.video() recording looks like, and the ONLY way to reach the null-decode fallback.
  ffmpeg -y -i "$W/fix/long.webm" -c copy -live 1 -f webm "$W/fix/nodur.webm" >/dev/null 2>&1
  printf 'not a video, just bytes' > "$W/fix/corrupt.webm"
  printf '[{"t":0,"name":"one"},{"t":5,"name":"two"},{"t":10,"name":"three"}]' > "$W/fix/ch3.json"
  printf '[{"t":0,"name":"only one"}]' > "$W/fix/ch1.json"
  printf '[{"t":9,"name":"late"},{"t":2,"name":"back"}]' > "$W/fix/chbad.json"
  # The :0:11 incident class: non-decreasing, right count — but every offset within a second, so the
  # chapter rail seeks to one frame. Must trip the bunched-chapters gate, not the floor.
  printf '[{"t":11,"name":"one"},{"t":11,"name":"two"},{"t":11.4,"name":"three"}]' > "$W/fix/chbunched.json"

  cat > "$W/bin/npx" <<'SHIM'
#!/usr/bin/env bash
# Stand in for `npx playwright test`: drop the pre-generated film where Playwright would have, and
# exit with $FAKE_RC. Anything that is not the playwright run is not part of these tests.
case " $* " in *" playwright "*) ;; *) exit 0 ;; esac
if [ -n "${FAKE_WEBM:-}" ]; then
  mkdir -p test-results/film-chromium
  cp "$FAKE_WEBM" test-results/film-chromium/video.webm
  [ -n "${FAKE_CH:-}" ] && cp "$FAKE_CH" test-results/film-chromium/chapters.json
fi
exit "${FAKE_RC:-0}"
SHIM
  # `gh pr view` must not reach the network; a failing gh is the no-PR_URL path.
  printf '#!/usr/bin/env bash\nexit 1\n' > "$W/bin/gh"
  chmod +x "$W/bin/npx" "$W/bin/gh"

  # usage: film <want-rc> <name> [env assignments...]
  film() {
    local want="$1" name="$2"; shift 2
    rm -rf "$W/run"; mkdir -p "$W/run"
    ( cd "$W/run" && env PATH="$W/bin:$PATH" BASE_URL=http://localhost:4000 TITLE='Proof film' "$@" \
        node "$REPO_ROOT/$S/record.mjs" spec.spec.ts film >"$W/out" 2>"$W/err" )
    local rc=$?
    [ "$rc" = "$want" ] && ok "$name — exit $rc" || {
      bad "$name — exit $rc, wanted $want"; sed 's/^/         /' "$W/err" | head -2; }
  }

  film 0 "happy path: 14s film, 3 chapters, 3 scenarios" \
    FAKE_WEBM="$W/fix/long.webm" FAKE_CH="$W/fix/ch3.json" SCENARIOS=3 PR_URL=https://x/pull/42
  # The watch page is the artifact. Its base64 payload depends on the local ffmpeg build, so assert
  # on STRUCTURE, not bytes — the byte-for-byte equivalence to the shell version was proven at port
  # time, against the same film.
  WATCH="$W/run/test-results/film-chromium/video.watch.html"
  if [ -s "$WATCH" ]; then
    grep -q 'src="data:video/webm;base64,' "$WATCH" && ok "watch page inlines the film as a data URI" \
      || bad "watch page has no inlined video"
    grep -q '<title>Proof film</title>' "$WATCH" && ok "watch page carries TITLE" \
      || bad "watch page lost TITLE"
    grep -q 'https://x/pull/42' "$WATCH" && ok "watch page links PR_URL" || bad "watch page lost PR_URL"
    grep -q '3 chapters' "$WATCH" && ok "watch page states the chapter count" \
      || bad "watch page lost the chapter count"
    grep -q '"name":"three"' "$WATCH" && ok "watch page embeds the chapter cues" \
      || bad "watch page lost the chapter cues"
  else
    bad "happy path produced no watch page"
  fi
  grep -q '^DURATION=14s$'  "$W/out" && ok "---record--- reports DURATION" || bad "DURATION wrong"
  grep -q '^CHAPTERS=3$'    "$W/out" && ok "---record--- reports CHAPTERS" || bad "CHAPTERS wrong"
  grep -q '^RESULT=passed$' "$W/out" && ok "---record--- reports RESULT"   || bad "RESULT wrong"

  film 0 "no duration metadata: ffprobe N/A falls back to a null decode" \
    FAKE_WEBM="$W/fix/nodur.webm" FAKE_CH="$W/fix/ch3.json" SCENARIOS=3
  grep -q '^DURATION=14s$' "$W/out" \
    && ok "  null-decode fallback recovered the real duration (not 0s)" \
    || bad "  null-decode fallback did not recover the duration"

  film 5 "STOP: duration floor (5s film < 4 + 3x3 = 13s)" \
    FAKE_WEBM="$W/fix/short.webm" FAKE_CH="$W/fix/ch3.json" SCENARIOS=3
  stderr_has "  names the duration-floor gate" "film-QA gate (duration floor)"

  film 5 "STOP: chapter floor (1 chapter < 3 scenarios)" \
    FAKE_WEBM="$W/fix/long.webm" FAKE_CH="$W/fix/ch1.json" SCENARIOS=3
  stderr_has "  names the chapter-floor gate" "film-QA gate (chapter floor)"

  film 5 "STOP: contact sheet (ffmpeg cannot decode the webm)" \
    FAKE_WEBM="$W/fix/corrupt.webm" FAKE_CH="$W/fix/ch3.json" SCENARIOS=3
  stderr_has "  names the contact-sheet gate" "film-QA gate (contact sheet)"

  film 5 "STOP: chapters malformed (timestamps go backwards)" \
    FAKE_WEBM="$W/fix/long.webm" FAKE_CH="$W/fix/chbad.json" SCENARIOS=1
  stderr_has "  names the chapters gate" "film-QA gate (chapters)"

  # The healthy twin is the happy path above: ch3.json spans 0..10s over the same 14s film and exits 0.
  film 5 "STOP: bunched chapters (3 offsets collapse at ~11s — the :0:11 class)" \
    FAKE_WEBM="$W/fix/long.webm" FAKE_CH="$W/fix/chbunched.json" SCENARIOS=3
  stderr_has "  names the bunched-chapters gate" "film-QA gate (bunched chapters)"

  film 3 "STOP: the spec failed — no watch link" FAKE_WEBM="$W/fix/long.webm" FAKE_RC=1
  film 3 "STOP: passed but produced no video" FAKE_RC=0
  film 4 "STOP: provenance — PROOF_SHA is not an ancestor of HEAD" \
    FAKE_WEBM="$W/fix/long.webm" PROOF_SHA=0000000000000000000000000000000000000000
fi

echo ""
echo "-- probe: browserless refusal + client contract (issue #7 — NO browser in CI) --"
# The refusal is the CI-provable half of the probe contract: $W has no node_modules anywhere up its
# tree, so `start` must refuse cleanly (exit 2) BEFORE any launch attempt — never boot a browser,
# never hang. The batched-command happy path needs a real app + browser and is verified manually in
# testbed/ per the spec's testing decisions (issue #4).
expect_exit 1 "no subcommand is a usage error" -- \
  node "$REPO_ROOT/$S/probe.mjs"
expect_exit 2 "browserless env: start refuses cleanly (no pinned Playwright from cwd)" -- \
  node "$REPO_ROOT/$S/probe.mjs" start
stderr_has "  refusal names the pinned-Playwright requirement" "pinned Playwright"
expect_exit 3 "send with no daemon listening at the socket" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" send '[{"cmd":"snapshot"}]'
expect_exit 3 "close with no daemon listening at the socket" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" close
expect_exit 1 "unparsable batch is a usage error (checked before connecting)" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" send 'not json'
expect_exit 1 "batch must be a JSON ARRAY of {cmd} objects" -- \
  env PROBE_SOCK="$W/no-daemon.sock" node "$REPO_ROOT/$S/probe.mjs" send '{"cmd":"snapshot"}'

echo ""
echo "  generator scripts: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
