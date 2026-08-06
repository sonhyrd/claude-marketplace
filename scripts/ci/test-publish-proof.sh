#!/usr/bin/env bash
# Process-boundary tests for publish-proof.mjs — the ONE Clips recording a pw-prove run publishes.
# Same shape as the proof-page check it replaced: spawn the real script, assert its exit code, its
# marker line and the bytes it sent — never an internal call.
#
# ONE seam, and it is configuration the design already required: PW_PROVE_CLIPS_ENDPOINT points at a
# throwaway local HTTP server (scripts/ci/fixtures/clips-stub-server.mjs) that captures the request.
# Everything else is real — real ffmpeg/ffprobe over real synthetic videos, so the measured
# durations, dimensions and the stream-copy claim are proven against actual files rather than
# fabricated probe output. No network leaves the machine.
#
# HOME IS ISOLATED IN EVERY CASE. An earlier version of this file unset the credential variables and
# assumed the scripts were then unconfigured; they were not — a credential file under $HOME resolved
# a real configuration, and one refusal case published to production Clips and created a public
# recording. The file mechanism is deleted, so nothing reads $HOME any more; the isolation stays
# because "the test believes it is unconfigured" must be a fact, not a hope.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1
S="skills/pw-prove/scripts"
STUB="scripts/ci/fixtures/clips-stub-server.mjs"

# Nothing in this file may reach a real deployment. Every case sets the credential and the endpoint
# explicitly, so an operator's own exported values could only ever leak in through a case that
# forgot to — and one that forgot to is exactly how a refusal case published a public recording to
# production. Clearing them here makes that class of mistake impossible rather than unlikely.
unset CLIPS_MCP_TOKEN PW_PROVE_CLIPS_ENDPOINT

pass=0; fail=0
ok()  { echo "  [PASS] $1"; pass=$((pass + 1)); }
bad() { echo "  [FAIL] $1"; fail=$((fail + 1)); }

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "  [SKIP] ffmpeg/ffprobe not on PATH — concatenation cannot be exercised against real files"
  exit 0
fi

W=$(mktemp -d)
STUB_PID=""
stop_stub() {
  [ -n "$STUB_PID" ] || return 0
  kill "$STUB_PID" 2>/dev/null
  wait "$STUB_PID" 2>/dev/null # reap it, so bash prints no `Terminated` job notice
  STUB_PID=""
}
cleanup() { stop_stub; rm -rf "$W"; }
trap cleanup EXIT

mkdir -p "$W/cap" "$W/isolated-home"

# A stand-in bearer. Unsigned on purpose: this client never verifies a token and holds no material
# to verify one with — it reads `aud` for ROUTING and forwards the rest opaquely. Building the
# fixture the same way is what proves the client is not secretly doing cryptography.
fake_token() { # usage: fake_token [audience]
  AUD="${1-}" node -e '
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const claims = { iss: "clips-stub", sub: "proof@acme.test", org_id: "0000acme", jti: "stub-jti" };
    if (process.env.AUD) claims.aud = process.env.AUD;
    process.stdout.write(`${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.c3R1Yg`);
  '
}

# --- fixtures: two homogeneous clips, 2s and 3s, silent -----------------------------------------
ffmpeg -y -f lavfi -i testsrc=size=320x180:rate=10:duration=2 -c:v libvpx-vp9 -b:v 200k \
  "$W/a.webm" >/dev/null 2>&1
ffmpeg -y -f lavfi -i testsrc=size=320x180:rate=10:duration=3 -c:v libvpx-vp9 -b:v 200k \
  "$W/b.webm" >/dev/null 2>&1
if [ ! -s "$W/a.webm" ] || [ ! -s "$W/b.webm" ]; then
  echo "  [SKIP] this ffmpeg build cannot write libvpx-vp9 webm — no fixtures to concatenate"
  exit 0
fi

# --- the stub destination -----------------------------------------------------------------------
start_stub() { # usage: start_stub <mode>
  stop_stub
  : > "$W/cap/requests.jsonl"
  CAP="$W/cap" STUB_MODE="$1" node "$REPO_ROOT/$STUB" > "$W/stub.out" 2>"$W/stub.err" &
  STUB_PID=$!
  PORT=""
  for _ in $(seq 1 50); do
    PORT=$(sed -n 's/^PORT //p' "$W/stub.out" | head -n1)
    [ -n "$PORT" ] && break
    sleep 0.1
  done
  [ -n "$PORT" ] || { echo "  [FAIL] stub server never reported a port"; cat "$W/stub.err"; exit 1; }
  ORIGIN="http://127.0.0.1:$PORT"
  ENDPOINT="$ORIGIN/mcp"
  TOKEN=$(fake_token "$ENDPOINT")
}

# The concatenated proof lands in the OS temp dir; pointing TMPDIR at the workspace both isolates the
# run from a developer's real temp dir and tells the test exactly where to look. HOME is isolated
# too — see the header.
publish() { # usage: publish <manifest> [extra env...]
  local manifest="$1"; shift
  ( cd "$W" && env TMPDIR="$W" HOME="$W/isolated-home" CLIPS_MCP_TOKEN="$TOKEN" \
      PW_PROVE_CLIPS_ENDPOINT="$ENDPOINT" PWPROVE_LEDGER="$W/ledger.jsonl" "$@" \
      node "$REPO_ROOT/$S/publish-proof.mjs" "$manifest" >"$W/out" 2>"$W/err" )
}

cat > "$W/m.json" <<'JSON'
{
  "title": "PR #2974 — cookie consent text authoring",
  "prUrl": "https://github.com/org/repo/pull/2974",
  "spec": "tests/e2e/cookie-consent.spec.ts",
  "mutation": "RED — dropping the .trim() fails the wire-contract scenario",
  "clips": [
    { "ac": "Per-locale EN/DE/ID authoring", "scenario": "each tab holds its own text", "file": "a.webm" },
    { "ac": "Every locale empty removes the key", "scenario": "clearing removes the key", "file": "b.webm" }
  ]
}
JSON

echo "-- happy path: N clips in, ONE import call plus one comment per chapter --"
start_stub ok
publish m.json
rc=$?
[ "$rc" = 0 ] && ok "exit 0" || { bad "exit $rc, wanted 0"; sed 's/^/         /' "$W/err" | tail -5; }

reqs=$(wc -l < "$W/cap/requests.jsonl" | tr -d ' ')
[ "$reqs" = 3 ] && ok "one import call plus one comment per chapter (3 calls for 2 chapters)" \
  || bad "expected 3 requests (1 import + 2 comments), got $reqs"

SHARE="$ORIGIN/share/rec_stub_1"
marker=$(sed -n 's/^PWPROVE_URL //p' "$W/out" | head -n1)
[ "$marker" = "$SHARE" ] && ok "the share URL is on the PWPROVE_URL marker line" \
  || bad "marker line: '$marker' != '$SHARE'"

# The requests as the destination saw them — every assertion below reads this file.
REQ="$W/cap/requests.jsonl"
# usage: jassert <name> <JS expression over `r` (the first captured request), `b` (its body),
#                        `args` (its tool arguments) and `all` (every captured request)>
jassert() {
  if EXPR="$2" node -e '
    const fs = require("fs");
    const all = fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean).map(JSON.parse);
    const r = all[0];
    const b = r.body;
    const args = b?.params?.arguments ?? {};
    const held = eval(process.env.EXPR);
    if (!held) { console.error("expression is false: " + process.env.EXPR); process.exit(1); }
  ' "$REQ" 2>"$W/jerr"; then ok "$1"; else bad "$1"; sed 's/^/         /' "$W/jerr" | head -2; fi
}

jassert "the publish is a JSON-RPC tools/call POSTed to the MCP endpoint" \
  'r.method === "POST" && r.url === "/mcp" && b.jsonrpc === "2.0" && b.method === "tools/call" && typeof b.id !== "undefined"'
jassert "the call names the import action and wraps the payload in params.arguments" \
  'b.params.name === "import-recording-from-url" && b.params.arguments && typeof b.params.arguments === "object"'
# Verified against the live deployment: a bare tools/call works and responses are plain JSON. A
# handshake this transport does not need would be an extra round trip on every publish.
# The length is part of the assertion, not decoration: `every` over an empty capture is true, so a
# regression that sent nothing at all would pass this as written without it.
jassert "no initialize handshake precedes the call" \
  'all.length === 3 && all.every((x) => x.body?.method === "tools/call")'
jassert "the request declares JSON, and accepts the event-stream framing it never receives" \
  'r.headers["content-type"] === "application/json" && String(r.headers.accept).includes("application/json")'
jassert "the video travels as a base64 data URL" \
  'typeof args.data === "string" && args.data.startsWith("data:video/webm;base64,") && args.data.length > 1000'
jassert "chapters are in manifest order, each labelled with its scenario" \
  'args.chapters.length === 2 && args.chapters[0].title === "each tab holds its own text" && args.chapters[1].title === "clearing removes the key"'
jassert "the first chapter starts at zero and the second after the first clip" \
  'args.chapters[0].startMs === 0 && args.chapters[1].startMs >= 1900 && args.chapters[1].startMs <= 2100'
jassert "the description carries the PR URL" 'args.description.includes("https://github.com/org/repo/pull/2974")'
jassert "the description carries the spec path" 'args.description.includes("tests/e2e/cookie-consent.spec.ts")'
jassert "the description carries the mutation verdict" 'args.description.includes("RED — dropping the .trim()")'
jassert "the recording is titled from the manifest" 'args.title === "PR #2974 — cookie consent text authoring"'

# The acceptance criteria travel as timestamped comments, verbatim, at their chapter's offset — a
# scrubber tooltip is label-sized and a criterion is a sentence.
jassert "each chapter's criterion is posted verbatim as a comment at that chapter's offset" \
  'all.slice(1).length === 2
   && all.slice(1).every((x) => x.body.params.name === "add-comment")
   && all[1].body.params.arguments.content === "Per-locale EN/DE/ID authoring"
   && all[1].body.params.arguments.videoTimestampMs === 0
   && all[2].body.params.arguments.content === "Every locale empty removes the key"
   && all[2].body.params.arguments.videoTimestampMs >= 1900'

echo ""
echo "-- the recording identifier is PARSED out of the success envelope, not assumed --"
# The identifier arrives inside a JSON-RPC result, as the text of a content block. A parser that
# reads the envelope as the action's own JSON gets `undefined` — which then reads as a plausible id
# everywhere it is interpolated, so this asserts the real value on the wire and in the report.
# The count is load-bearing: `every` over nothing is true, so without it a publish that parsed no id
# and therefore posted no comment would read as a pass on the very claim being made.
jassert "the comments are addressed to the recording id the destination actually returned" \
  'all.slice(1).length === 2
   && all.slice(1).every((x) => x.body.params.arguments.recordingId === "rec_stub_1")'
if grep -q 'publish-proof: 2 timestamped comment(s) attached' "$W/err"; then
  ok "both comments are reported as attached"
else
  bad "the comment outcome was not reported"; sed 's/^/         /' "$W/err" | tail -3
fi
grep -q 'undefined' "$W/out" && bad "an undefined leaked into the printed output" \
  || ok "nothing in the printed output reads as an undefined identifier"

echo ""
echo "-- reported metadata matches the file that was actually sent --"
PROOF="$W/pw-prove-proof.webm"
if [ -s "$PROOF" ]; then
  ok "the concatenated proof is on disk at a stable path"
else
  bad "no concatenated proof at $PROOF"
fi
probe_dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1" | head -n1; }
probe_codec() { ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$1" | head -n1; }
CONCAT_DUR=$(probe_dur "$PROOF")
A_DUR=$(probe_dur "$W/a.webm"); B_DUR=$(probe_dur "$W/b.webm")

if node -e '
  const fs = require("fs");
  const b = JSON.parse(fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean)[0]).body;
  const a = b.params.arguments;
  const dur = Number(process.argv[2]) * 1000;
  if (Math.abs(a.durationMs - dur) > 150) { console.error(`durationMs ${a.durationMs} vs file ${dur}`); process.exit(1); }
  if (a.width !== 320 || a.height !== 180) { console.error(`dimensions ${a.width}x${a.height}`); process.exit(1); }
  if (a.hasAudio !== false) { console.error("hasAudio should be false for a silent proof"); process.exit(1); }
' "$REQ" "$CONCAT_DUR" 2>"$W/jerr"; then
  ok "reported duration, dimensions and the silent-audio declaration match the concatenated file"
else
  bad "reported metadata does not match the file"; sed 's/^/         /' "$W/jerr" | head -2
fi

echo ""
echo "-- concatenation is a stream copy, not a processing pass --"
IN_CODEC=$(probe_codec "$W/a.webm"); OUT_CODEC=$(probe_codec "$PROOF")
[ -n "$OUT_CODEC" ] && [ "$IN_CODEC" = "$OUT_CODEC" ] \
  && ok "the concatenated video keeps its inputs' codec ($OUT_CODEC) — no re-encode" \
  || bad "codec changed: inputs '$IN_CODEC' -> output '$OUT_CODEC'"
if node -e '
  const [c, a, b] = process.argv.slice(1).map(Number);
  if (Math.abs(c - (a + b)) > 0.2) { console.error(`concat ${c}s != ${a}s + ${b}s`); process.exit(1); }
' "$CONCAT_DUR" "$A_DUR" "$B_DUR" 2>"$W/jerr"; then
  ok "the concatenated duration equals the sum of its inputs (${A_DUR}s + ${B_DUR}s = ${CONCAT_DUR}s)"
else
  bad "duration is not the sum of the inputs"; sed 's/^/         /' "$W/jerr" | head -2
fi

echo ""
echo "-- the bearer travels OPAQUELY: forwarded verbatim, never signed and never re-shaped --"
# The client performs no cryptography at all now. Every call in the run must carry the exact bytes
# it was handed — a token this script rebuilt would be a token it could get wrong, and a second
# credential shape reachable from here is the fallback this cutover deleted.
if TOKEN="$TOKEN" node -e '
  const fs = require("fs");
  const all = fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean).map(JSON.parse);
  const want = `Bearer ${process.env.TOKEN}`;
  for (const [i, r] of all.entries()) {
    const auth = r.headers.authorization || "";
    if (auth !== want) throw new Error(`request ${i + 1} carries a different bearer than it was given`);
  }
' "$REQ" 2>"$W/jerr"; then
  ok "every call forwards the configured bearer verbatim"
else
  bad "the bearer was re-shaped in flight"; sed 's/^/         /' "$W/jerr" | tail -2
fi

echo ""
echo "-- the endpoint comes from the token itself when nothing overrides it --"
# The token carries its own destination, which is why one variable replaced five. The override
# exists for testing and self-hosting; without it the audience claim must be what is dialled.
start_stub ok
( cd "$W" && env TMPDIR="$W" HOME="$W/isolated-home" CLIPS_MCP_TOKEN="$TOKEN" PWPROVE_LEDGER="$W/ledger.jsonl" \
    node "$REPO_ROOT/$S/publish-proof.mjs" m.json >"$W/aud.out" 2>"$W/aud.err" )
audrc=$?
audmarker=$(sed -n 's/^PWPROVE_URL //p' "$W/aud.out" | head -n1)
if [ "$audrc" = 0 ] && [ "$audmarker" = "$ORIGIN/share/rec_stub_1" ]; then
  ok "with no endpoint override, the publish dials the token's own audience"
else
  bad "audience-derived endpoint: exit $audrc, marker '$audmarker'"; sed 's/^/         /' "$W/aud.err" | tail -3
fi
[ "$(sed -n '1p' "$W/cap/requests.jsonl" | grep -c '"url":"/mcp"')" = 1 ] \
  && ok "the audience-derived endpoint is the MCP path, not the retired action route" \
  || bad "the audience-derived call did not land on /mcp"

echo ""
echo "-- per-chapter deep links point at the route whose ?t= is a timestamp --"
# On /share/<id> the `t` parameter is the agent-access token, NOT a timestamp: a deep link built
# there opens the recording from the top and silently drops the offset, so a reviewer sent to a
# criterion watches the run from the beginning and reads it as the wrong evidence. /embed/<id>
# is the route that parses `t` as seconds.
deep=$(sed -n 's/^publish-proof: chapter 2 .* -> //p' "$W/aud.err" | head -n1)
case "$deep" in
  */embed/rec_stub_1\?t=*) ok "chapter deep links use /embed/<id>?t=<seconds> ($deep)" ;;
  */share/*) bad "chapter deep link uses /share/<id>?t=, where t is the access token: '$deep'" ;;
  *) bad "no chapter deep link was reported: '$deep'" ;;
esac
# The offset is the chapter's own start, in seconds — clip a.webm is 2s, so chapter 2 opens at 2.
[ "${deep##*t=}" = 2 ] && ok "the offset is the chapter's measured start in seconds" \
  || bad "chapter 2 should open at t=2, got t=${deep##*t=}"
# The deep link is built on the deployment ORIGIN, not on the MCP endpoint the call was posted to.
case "$deep" in
  "$ORIGIN"/embed/*) ok "the deep link is built on the deployment origin, not on the /mcp endpoint" ;;
  *) bad "the deep link is not on the deployment origin: '$deep'" ;;
esac

echo ""
echo "-- run ledger --"
start_stub ok
publish m.json
if grep -q '^PWPROVE_RUN ' "$W/out" && node -e '
  const fs = require("fs");
  const line = fs.readFileSync(process.argv[1], "utf8").split("\n").find(l => l.startsWith("PWPROVE_RUN "));
  const j = JSON.parse(line.slice("PWPROVE_RUN ".length));
  if (j.script !== "publish-proof.mjs" || j.phase !== "publish" || j.exit !== 0) {
    console.error("bad ledger record: " + line.trim()); process.exit(1);
  }
' "$W/out" 2>"$W/jerr"; then
  ok "a PWPROVE_RUN publish entry is recorded"
else
  bad "no valid PWPROVE_RUN publish entry"; sed 's/^/         /' "$W/jerr" | head -2
fi
grep -q '"script":"publish-proof.mjs"' "$W/ledger.jsonl" 2>/dev/null \
  && ok "the same record is appended to the ledger file" \
  || bad "the ledger file has no publish-proof record"

echo ""
echo "-- marker survives merged streams (a caller's \`2>&1\` reflex) --"
start_stub ok
( cd "$W" && env TMPDIR="$W" HOME="$W/isolated-home" CLIPS_MCP_TOKEN="$TOKEN" \
    PW_PROVE_CLIPS_ENDPOINT="$ENDPOINT" PWPROVE_LEDGER="$W/ledger.jsonl" \
    node "$REPO_ROOT/$S/publish-proof.mjs" m.json >"$W/merged" 2>&1 )
merged=$(sed -n 's/^PWPROVE_URL //p' "$W/merged" | head -n1)
[ "$merged" = "$ORIGIN/share/rec_stub_1" ] \
  && ok "the share URL is still recoverable from merged stdout+stderr" \
  || bad "merged streams lost the URL: '$merged'"

echo ""
echo "-- configuration and manifest refusals --"
# Every case below runs with an isolated HOME. The scripts read the credential from their own
# environment and from nowhere else — no file, no dotfile, no opt-in fallback — and this is where
# that is proven rather than assumed.
start_stub ok
( cd "$W" && env -u CLIPS_MCP_TOKEN TMPDIR="$W" HOME="$W/isolated-home" PW_PROVE_CLIPS_ENDPOINT="$ENDPOINT" \
    PWPROVE_LEDGER="$W/ledger.jsonl" \
    node "$REPO_ROOT/$S/publish-proof.mjs" m.json >"$W/out" 2>"$W/err" )
rc=$?
if [ "$rc" = 1 ] && grep -q 'CLIPS_MCP_TOKEN' "$W/err"; then
  ok "a missing CLIPS_MCP_TOKEN refuses to publish (exit 1) and names the variable"
else
  bad "missing credential: exit $rc, wanted 1 with the name in the report"
  sed 's/^/         /' "$W/err" | tail -2
fi
[ "$(wc -l < "$W/cap/requests.jsonl" | tr -d ' ')" = 0 ] \
  && ok "nothing is sent when the credential is missing" \
  || bad "a request went out without a credential"

# The credential FILE is gone, and this is the case that proves it: a file at the retired path,
# holding a complete configuration, must change nothing. The refusal that used to be silently
# overturned here published a public recording to a real account.
start_stub ok
mkdir -p "$W/isolated-home/.config"
{ echo "CLIPS_MCP_TOKEN=$TOKEN"; echo "CLIPS_ORIGIN=$ORIGIN"; echo "CLIPS_A2A_SECRET=stub-signing-secret"; } \
  > "$W/isolated-home/.config/pw-prove-clips.env"
( cd "$W" && env -u CLIPS_MCP_TOKEN TMPDIR="$W" HOME="$W/isolated-home" PW_PROVE_CLIPS_ENDPOINT="$ENDPOINT" \
    PWPROVE_LEDGER="$W/ledger.jsonl" \
    node "$REPO_ROOT/$S/publish-proof.mjs" m.json >"$W/out" 2>"$W/err" )
rc=$?
if [ "$rc" = 1 ] && [ "$(wc -l < "$W/cap/requests.jsonl" | tr -d ' ')" = 0 ]; then
  ok "a credential file at the retired path is not read: the refusal stands and nothing is sent"
else
  bad "the retired credential file still resolves a configuration: exit $rc"
  sed 's/^/         /' "$W/err" | tail -2
fi
rm -f "$W/isolated-home/.config/pw-prove-clips.env"

# A token that addresses nothing, with no override to supply the endpoint: there is no destination
# to guess at. Guessing one sends a real credential to a host nobody chose.
start_stub ok
NOAUD=$(fake_token)
( cd "$W" && env TMPDIR="$W" HOME="$W/isolated-home" CLIPS_MCP_TOKEN="$NOAUD" PWPROVE_LEDGER="$W/ledger.jsonl" \
    node "$REPO_ROOT/$S/publish-proof.mjs" m.json >"$W/out" 2>"$W/err" )
rc=$?
if [ "$rc" = 1 ] && grep -q 'aud' "$W/err"; then
  ok "a token carrying no audience refuses to publish and says the endpoint is underivable"
else
  bad "no-audience token: exit $rc, wanted 1 naming the missing audience"
  sed 's/^/         /' "$W/err" | tail -2
fi

cat > "$W/empty.json" <<'JSON'
{ "title": "nothing to see", "clips": [] }
JSON
publish empty.json
[ "$?" = 1 ] && ok "a manifest with no clips is refused (exit 1)" || bad "empty clips list should exit 1"
publish does-not-exist.json
[ "$?" = 1 ] && ok "an unreadable manifest is refused (exit 1)" || bad "missing manifest should exit 1"

echo ""
echo "-- the four gates: nothing sent, and NO local fallback file offered --"
# A gate means the artifact is WRONG, not undelivered — so every case below asserts three things:
# a non-zero exit that names the gate, an empty capture, and no file at the stable proof path.
#
# The stable path is SEEDED with a good file before each gate case. A gate that merely declined to
# write would still leave the previous run's proof sitting there to be attached by hand, which is the
# defect this triple assertion exists to catch.
gate_case() { # usage: gate_case <name> <expected rc> <expected GATE token> <manifest> [extra env...]
  local name="$1" want_rc="$2" token="$3" manifest="$4"; shift 4
  start_stub ok
  cp "$W/a.webm" "$PROOF" #                        seeded: a gate must actively withhold, not abstain
  publish "$manifest" "$@"
  local rc=$?
  if [ "$rc" = "$want_rc" ]; then ok "$name — exit $want_rc"; else
    bad "$name — exit $rc, wanted $want_rc"; sed 's/^/         /' "$W/err" | tail -4
  fi
  grep -q "GATE $token" "$W/err" \
    && ok "$name — the report names the $token gate" \
    || { bad "$name — the gate is not named"; sed 's/^/         /' "$W/err" | tail -3; }
  [ "$(wc -l < "$W/cap/requests.jsonl" | tr -d ' ')" = 0 ] \
    && ok "$name — nothing was sent" \
    || bad "$name — a request went out past the gate"
  [ ! -e "$PROOF" ] \
    && ok "$name — no local fallback file is offered" \
    || bad "$name — the wrong artifact was left at $PROOF for someone to attach by hand"
}

# A pre-concat gate has to be observably pre-concat: the script announces its concatenation on stderr,
# so the ABSENCE of that line is what proves nothing was muxed. Withholding the file cannot prove it —
# a gate that concatenated and then deleted the output looks identical from the path alone.
refused_before_concat() { # usage: refused_before_concat <name>
  grep -q 'publish-proof: concatenated' "$W/err" \
    && bad "$1 — concatenation ran anyway; the gate must refuse before muxing" \
    || ok "$1 — nothing was concatenated: the gate refused first"
}

# EMPTY-RECORDING: a sub-threshold clip. 3 bytes is a real dead screencast, not a fabricated probe.
printf 'x' > "$W/tiny.webm"
cat > "$W/tiny.json" <<'JSON'
{
  "title": "dead screencast",
  "clips": [
    { "ac": "Per-locale EN/DE/ID authoring", "file": "a.webm" },
    { "ac": "Every locale empty removes the key", "file": "tiny.webm" }
  ]
}
JSON
gate_case "empty recording" 3 EMPTY-RECORDING tiny.json
refused_before_concat "empty recording"

# A recording that is BROKEN rather than empty: 4KB of noise clears the size floor, so only ffprobe
# failing to open it can catch this. It must still name the recording gate — reporting it as a video
# TOOLING error (exit 4) would blame the machine for what is squarely a defective screencast.
head -c 4096 /dev/urandom > "$W/corrupt.webm"
cat > "$W/corrupt.json" <<'JSON'
{
  "title": "broken screencast",
  "clips": [
    { "ac": "Per-locale EN/DE/ID authoring", "file": "a.webm" },
    { "ac": "Every locale empty removes the key", "file": "corrupt.webm" }
  ]
}
JSON
gate_case "an unprobeable clip above the size floor" 3 EMPTY-RECORDING corrupt.json
refused_before_concat "an unprobeable clip above the size floor"

# TOKEN-LEAK, byte half: the token is written into a real webm's container tags by ffmpeg itself, so
# the gate is proven against bytes a recording tool actually produced.
LEAK_TOKEN="tok_LEAKED_SECRET_abc123"
ffmpeg -y -f lavfi -i testsrc=size=320x180:rate=10:duration=2 -c:v libvpx-vp9 -b:v 200k \
  -metadata title="$LEAK_TOKEN" "$W/leak.webm" >/dev/null 2>&1
if node -e '
  const fs = require("fs");
  if (!fs.readFileSync(process.argv[1]).includes(Buffer.from(process.argv[2]))) process.exit(1);
' "$W/leak.webm" "$LEAK_TOKEN"; then
  cat > "$W/leakbytes.json" <<'JSON'
{
  "title": "PR #2974 — cookie consent text authoring",
  "clips": [
    { "ac": "Per-locale EN/DE/ID authoring", "file": "a.webm" },
    { "ac": "Every locale empty removes the key", "file": "leak.webm" }
  ]
}
JSON
  gate_case "token in the video bytes" 6 TOKEN-LEAK leakbytes.json BEARER="$LEAK_TOKEN"
else
  # NOT a skip. This ffmpeg already proved it writes vp9 webm, so a fixture that comes out without the
  # token in its bytes is a broken fixture — and letting it pass quietly would leave one of the four
  # gates unexercised in a suite reporting green, which is the silent-always-pass this repo calls P0.
  bad "the byte-leak fixture carries no token — the byte half of the leak gate went unexercised"
fi

# TOKEN-LEAK, text half: the SAME gate, reached by a credential pasted into an AC. The ACs travel as
# JSON to a public-by-default recording, so this path is a live leak a byte scan alone would miss.
cat > "$W/leakac.json" <<'JSON'
{
  "title": "PR #2974 — cookie consent text authoring",
  "clips": [
    { "ac": "Admin API accepts Bearer tok_LEAKED_SECRET_abc123", "file": "a.webm" },
    { "ac": "Every locale empty removes the key", "file": "b.webm" }
  ]
}
JSON
gate_case "token in an AC title" 6 TOKEN-LEAK leakac.json BEARER="$LEAK_TOKEN"
grep -q "chapter 1's criterion" "$W/err" \
  && ok "the AC leak report names which chapter's criterion carries the token" \
  || { bad "the AC leak report does not say where the token is"; sed 's/^/         /' "$W/err" | tail -3; }

# HOMOGENEITY: a real 640x360 clip beside the 320x180 pair. Nothing is fabricated — ffmpeg would
# stream-copy these into a corrupt video and still exit 0, which is why the gate exists.
ffmpeg -y -f lavfi -i testsrc=size=640x360:rate=10:duration=2 -c:v libvpx-vp9 -b:v 200k \
  "$W/wide.webm" >/dev/null 2>&1
cat > "$W/mixed.json" <<'JSON'
{
  "title": "mismatched viewports",
  "clips": [
    { "ac": "Per-locale EN/DE/ID authoring", "file": "a.webm" },
    { "ac": "Every locale empty removes the key", "file": "wide.webm" }
  ]
}
JSON
gate_case "mismatched dimensions" 8 HOMOGENEITY mixed.json
refused_before_concat "mismatched dimensions"
grep -q '320x180' "$W/err" && grep -q '640x360' "$W/err" \
  && ok "the homogeneity report names both shapes it could not reconcile" \
  || bad "the homogeneity report does not name the shapes"

# DURATION RECONCILIATION: a truncated webm still declares its original duration in the Segment Info
# at the head of the file, so ffprobe reports 3s while only ~1.7s of packets survive. Stream-copy
# concatenation swallows that silently and exits 0 — measured, not fabricated: the output reports
# ~3.7s against inputs summing to 5.0s, and every chapter after clip 1 would point at wrong footage.
SZ=$(wc -c < "$W/b.webm" | tr -d ' ')
head -c $((SZ / 2)) "$W/b.webm" > "$W/short.webm"
cat > "$W/drift.json" <<'JSON'
{
  "title": "truncated recording",
  "clips": [
    { "ac": "Per-locale EN/DE/ID authoring", "file": "a.webm" },
    { "ac": "Every locale empty removes the key", "file": "short.webm" }
  ]
}
JSON
DECLARED=$(probe_dur "$W/short.webm")
if node -e 'if (!(Number(process.argv[1]) > 2.5)) process.exit(1)' "$DECLARED"; then
  gate_case "concatenated duration diverging from its inputs" 9 DURATION-RECONCILIATION drift.json
else
  # NOT a skip, for the same reason: the truncated fixture declaring its original duration is HOW this
  # divergence is manufactured from real files. If it stops declaring one, the gate is untested and the
  # suite must say so rather than report green over a hole.
  bad "the truncated fixture declares no duration ($DECLARED) — the duration gate went unexercised"
fi

echo ""
echo "-- a refusal keeps the run ALIVE and hands back the file, WHATEVER status it arrives at --"
# The opposite posture to a gate: undelivered evidence never fails a run, because the proof is the
# passing test plus the mutation verdict. Exit 0, the path on a marker line, and the file really
# there. The four cases below are the four ways delivery fails, and three of them are HTTP 200 or a
# 401 whose body is not JSON-RPC — so a caller reading the status code alone gets two of them wrong.
alive_case() { # usage: alive_case <name> [extra env...]
  local name="$1"; shift
  publish m.json "$@"
  local rc=$?
  [ "$rc" = 0 ] && ok "$name — exit 0, the run is still passing" \
    || { bad "$name — exit $rc: a run must never fail over undelivered evidence"
         sed 's/^/         /' "$W/err" | tail -3; }
  local kept
  kept=$(sed -n 's/^PWPROVE_PROOF_FILE //p' "$W/out" | head -n1)
  [ -n "$kept" ] && ok "$name — the fallback path is on a PWPROVE_PROOF_FILE marker line" \
    || bad "$name — no fallback path was printed"
  [ -n "$kept" ] && [ -s "$kept" ] && ok "$name — the concatenated proof exists at that exact path" \
    || bad "$name — nothing at '$kept'"
  [ -z "$(sed -n 's/^PWPROVE_URL //p' "$W/out")" ] \
    && ok "$name — no share URL is claimed" \
    || bad "$name — a share URL was printed although nothing was delivered"
}
start_stub error
alive_case "a 500 from the destination"
# This stub echoes the bearer back in its error body, which real deployments do. The failure report
# quotes that body, so a client that repeats it verbatim writes the credential into a run log.
if grep -qF "$TOKEN" "$W/err" "$W/out"; then
  bad "the bearer was echoed into the failure report"
else
  ok "a destination that echoes the bearer back does not get it repeated into the report"
fi
grep -q '<redacted bearer>' "$W/err" \
  && ok "the redaction is visible in the report, so nothing looks silently dropped" \
  || { bad "the echoed bearer was neither printed nor visibly redacted"; sed 's/^/         /' "$W/err" | tail -3; }

# A refused credential: HTTP 401, and the body is NOT JSON-RPC. A parser that reaches for
# `result.content[0].text` throws here, and the run dies over a credential problem.
start_stub unauthorized
alive_case "a 401 whose body is not JSON-RPC"
grep -q 'refused the credential' "$W/err" \
  && ok "a 401 is reported as a refused credential, not as a generic transport failure" \
  || { bad "the 401 was not named as a credential refusal"; sed 's/^/         /' "$W/err" | tail -3; }

# The trap this transport is built around: an HTTP 200 that is a flat refusal. `res.ok` is true, the
# status is 200, and nothing was published.
start_stub unknown-tool
alive_case "an HTTP 200 saying the action is not in this token's catalog"
grep -q 'callable catalog' "$W/err" \
  && ok "a non-delegable action names the catalog as the cause, not the credential" \
  || { bad "the not-delegable refusal was not named"; sed 's/^/         /' "$W/err" | tail -3; }

start_stub validation
alive_case "an HTTP 200 rejecting the arguments"
grep -q 'rejected the publish' "$W/err" \
  && ok "an HTTP 200 carrying an error is a failed publish, not a success" \
  || { bad "an HTTP 200 error was not reported as a failure"; sed 's/^/         /' "$W/err" | tail -3; }

# A refused connection, not a slow one: port 1 on loopback answers with ECONNREFUSED immediately.
start_stub ok
ENDPOINT="http://127.0.0.1:1/mcp"
alive_case "a refused connection"

echo ""
echo "-- a film over the destination's inline ceiling is refused BEFORE the request is built --"
# The same Undelivered posture as the four cases above, reached without a destination being asked.
# The import action caps inline video at 67108864 decoded bytes, and base64 decodes to exactly the
# bytes on disk — so `stat` answers the question before the encode. Encoding first would spend the
# base64 pass and the upload to learn what the filesystem already knew.
#
# This is emphatically NOT a gate: the film is fine, it is simply too big for this door. Withholding
# it the way a gate does would destroy the only copy of good evidence at the moment the operator
# needs it, so the kept file is asserted here exactly as it is for a 500.
CEILING=67108864
ffmpeg -y -f lavfi -i testsrc2=size=1280x720:rate=30:duration=8 -c:v libvpx-vp9 \
  -b:v 80M -minrate 80M -maxrate 80M -cpu-used 8 -row-mt 1 -deadline realtime \
  "$W/fat.webm" >/dev/null 2>&1
FAT=$(wc -c < "$W/fat.webm" 2>/dev/null | tr -d ' ')
if [ "${FAT:-0}" -lt 1048576 ]; then
  # NOT a skip, for the reason the other fixture guards give: a suite that reports green over an
  # unexercised refusal is the silent-always-pass this repo calls P0.
  bad "the oversized fixture came out at ${FAT:-0}B — the ceiling refusal went unexercised"
else
  # The clip is listed however many times it takes to clear the ceiling, computed from the fixture's
  # real size rather than assumed: a different ffmpeg build hits a different bitrate, and a hard-coded
  # repeat count would quietly stop clearing the ceiling on someone else's machine.
  COPIES=$(( CEILING / FAT + 2 ))
  COPIES="$COPIES" node -e '
    const n = Number(process.env.COPIES);
    const clips = Array.from({ length: n }, (_, i) => ({
      ac: `Criterion ${i + 1} holds`, scenario: `scenario ${i + 1}`, file: "fat.webm",
    }));
    process.stdout.write(JSON.stringify({ title: "oversized proof", clips }));
  ' > "$W/fat.json"
  start_stub ok
  rm -f "$PROOF"
  publish fat.json
  rc=$?
  [ "$rc" = 0 ] && ok "an oversized film — exit 0, the run is still passing" \
    || { bad "an oversized film — exit $rc: a run must never fail over undelivered evidence"
         sed 's/^/         /' "$W/err" | tail -4; }
  [ "$(wc -l < "$W/cap/requests.jsonl" | tr -d ' ')" = 0 ] \
    && ok "an oversized film — no request was built and nothing was sent" \
    || bad "an oversized film — a request went out over the ceiling"
  kept=$(sed -n 's/^PWPROVE_PROOF_FILE //p' "$W/out" | head -n1)
  [ -n "$kept" ] && [ -s "$kept" ] \
    && ok "an oversized film — the kept film's path is on a PWPROVE_PROOF_FILE marker line ($kept)" \
    || { bad "an oversized film — no kept film at '$kept'"; sed 's/^/         /' "$W/err" | tail -3; }
  [ -z "$(sed -n 's/^PWPROVE_URL //p' "$W/out")" ] \
    && ok "an oversized film — no share URL is claimed" \
    || bad "an oversized film — a share URL was printed although nothing was delivered"
  grep -q 'GATE' "$W/err" \
    && bad "an oversized film — reported as a gate; the artifact is fine, it is merely undeliverable" \
    || ok "an oversized film — no gate is named: the artifact is good, just too big for this door"
  # Both numbers, exact: an operator who is told only "too large" cannot tell whether to trim one
  # scenario or to stop trying. The actual size is read off the film that was actually kept.
  ACTUAL=$(wc -c < "${kept:-/dev/null}" 2>/dev/null | tr -d ' ')
  if grep -qF "$CEILING" "$W/err" && grep -qF "$ACTUAL" "$W/err"; then
    ok "an oversized film — the refusal names the ceiling ($CEILING) and the actual size ($ACTUAL)"
  else
    bad "an oversized film — the refusal does not name both the ceiling and the actual size"
    sed 's/^/         /' "$W/err" | tail -3
  fi
  rm -f "$W/fat.webm" "$PROOF"
fi

echo ""
echo "-- the retired fifth gate leaves no object-name vocabulary behind --"
# Clips assigns the recording identifier, so there is nothing for this script to name or to refuse.
if grep -niE 'keyname|key-prefix|key_prefix|KEY_PREFIX|object key|degenerate|slugify|\bkeys?\b' \
     "$S/publish-proof.mjs" > "$W/keyhits" 2>&1; then
  bad "object-name vocabulary survives in publish-proof.mjs"; sed 's/^/         /' "$W/keyhits" | head -4
else
  ok "no key/slug/degenerate vocabulary remains in publish-proof.mjs"
fi
[ "$(grep -cF 'process.exit(2)' "$S/publish-proof.mjs")" = 0 ] \
  && ok "exit 2 is retired with the gate that used it" \
  || bad "publish-proof.mjs can still exit 2"

echo ""
echo "-- the HMAC path is DELETED, not dormant: an unrevocable credential cannot come back --"
# A fallback is worse than an absence here. The organization signing secret cannot be revoked
# without rotating it under every other caller in the org, so a code path that still accepts one is
# a path that can quietly become the one that runs.
if grep -nE 'CLIPS_A2A_SECRET|CLIPS_ORG_ID|CLIPS_ORG_DOMAIN|CLIPS_SUBJECT|CLIPS_ORIGIN|PW_PROVE_CLIPS_ENV|createHmac|mintToken|mintImportToken|mintCommentToken|_agent-native/actions|pw-prove-clips\.env' \
     "$S"/*.mjs > "$W/hmachits" 2>&1; then
  bad "the retired credential path survives in the shipped scripts"; sed 's/^/         /' "$W/hmachits" | head -6
else
  ok "no signing secret, no identity triple, no credential file and no HMAC remain in the scripts"
fi
grep -q 'node:crypto' "$S/clips.mjs" \
  && bad "clips.mjs still imports node:crypto — the client should sign nothing" \
  || ok "clips.mjs performs no cryptography: the bearer is opaque to it"

echo ""
echo "-- preflight: the credential round-trip, warn-only in every outcome --"
# BASE_URL points at the stub too: readiness only asks whether SOMETHING answers, and any code that
# is not 000/502/503/504 is a live server.
preflight() { # usage: preflight <extra env...>
  ( cd "$W" && env PROBE_HOSTING=1 BASE_URL="$ORIGIN" READY_TIMEOUT=10 HOME="$W/isolated-home" \
      PWPROVE_LEDGER="$W/ledger.jsonl" "$@" \
      node "$REPO_ROOT/$S/preflight.mjs" >"$W/pf.out" 2>"$W/pf.err" )
}
pf_says() { # usage: pf_says <name> <expected summary line> <expected rc>
  if [ "$pfrc" != "$3" ]; then bad "$1 — exit $pfrc, wanted $3 (the publish probe must never block)"; return; fi
  grep -qx "$2" "$W/pf.out" && ok "$1" || { bad "$1 — no '$2' in the summary"; sed 's/^/         /' "$W/pf.out" | tail -4; }
}

start_stub validation
preflight CLIPS_MCP_TOKEN="$TOKEN" PW_PROVE_CLIPS_ENDPOINT="$ENDPOINT"; pfrc=$?
pf_says "an argument rejection reports the credential as usable" "PUBLISH_READY=yes" 0
pf_says "delivery-readiness is the conjunction of the credential and the tooling" "HOSTING_READY=yes" 0
# The pass is defined BY EXCLUSION — the scripts must not match the server's wording, because the
# wording is the server's to change. Echoing the accepted sentence is what keeps a wrong verdict
# legible in the log instead of hidden behind a boolean.
grep -q 'Supply exactly one of' "$W/pf.err" \
  && ok "the usable verdict echoes the rejection sentence it accepted" \
  || { bad "the accepted sentence is not echoed"; sed 's/^/         /' "$W/pf.err" | tail -3; }
if grep -rnF 'Supply exactly one of' "$S"/*.mjs > "$W/pinned" 2>&1; then
  bad "a script matches the server's rejection wording — the pass must be by exclusion"
  sed 's/^/         /' "$W/pinned" | head -3
else
  ok "no script pins its pass condition to the server's wording"
fi
grep -qi 'wrangler' "$W/pf.out" "$W/pf.err" \
  && { bad "preflight still speaks of wrangler — the bucket left this path"; } \
  || ok "preflight never mentions wrangler: no bucket session is probed for"
if node -e '
  const fs = require("fs");
  const all = fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean).map(JSON.parse);
  if (all.length !== 1) throw new Error(`the probe made ${all.length} calls, wanted exactly 1`);
  const b = all[0].body;
  if (all[0].url !== "/mcp") throw new Error(`probe url ${all[0].url}`);
  if (b.method !== "tools/call") throw new Error(`probe method ${b.method} — no handshake is needed`);
  if (b.params.name !== "import-recording-from-url") throw new Error(`probe action ${b.params.name}`);
  if (Object.keys(b.params.arguments ?? {}).length !== 0) throw new Error("the probe sent arguments — it must create nothing");
' "$W/cap/requests.jsonl" 2>"$W/jerr"; then
  ok "the probe RUNS the real import action with arguments it must reject, and creates nothing"
else
  bad "the probe is not the real call"; sed 's/^/         /' "$W/jerr" | tail -2
fi
pf_says "the video tooling probe reports what it found" "VIDEO_TOOLING=yes" 0

start_stub unauthorized
preflight CLIPS_MCP_TOKEN="$TOKEN" PW_PROVE_CLIPS_ENDPOINT="$ENDPOINT"; pfrc=$?
pf_says "a refused credential warns without blocking" "PUBLISH_READY=no" 0
pf_says "a refused credential makes the run's delivery not ready" "HOSTING_READY=no" 0
grep -q 'rejected:' "$W/pf.err" \
  && ok "the 401 is reported as a rejected credential" \
  || { bad "no rejected-credential warning on 401"; sed 's/^/         /' "$W/pf.err" | tail -3; }

# The verdict that a status-code check cannot see: HTTP 200, and the action is simply not in this
# token's callable catalog. The credential is fine; re-minting it is the fix, and saying "refused"
# would send an operator to rotate a credential that was never the problem.
start_stub unknown-tool
preflight CLIPS_MCP_TOKEN="$TOKEN" PW_PROVE_CLIPS_ENDPOINT="$ENDPOINT"; pfrc=$?
pf_says "a non-delegable action warns without blocking" "PUBLISH_READY=no" 0
if grep -q 'not-delegable:' "$W/pf.err" && grep -q 'callable catalog' "$W/pf.err" \
   && grep -q 're-mint the token' "$W/pf.err"; then
  ok "the non-delegable verdict names the cause and the fix, not a generic refusal"
else
  bad "the non-delegable verdict is reported generically"; sed 's/^/         /' "$W/pf.err" | tail -3
fi

# The same refusal, wearing the "Error: " prefix the wrapper puts on its other tool errors. A client
# that recognises only the bare form falls through to the reached-and-rejected branch and reports
# PUBLISH_READY=yes over an action it cannot call — a green preflight about nothing.
start_stub unknown-tool-prefixed
preflight CLIPS_MCP_TOKEN="$TOKEN" PW_PROVE_CLIPS_ENDPOINT="$ENDPOINT"; pfrc=$?
pf_says "a prefixed non-delegable refusal is still not-delegable" "PUBLISH_READY=no" 0
grep -q 'not-delegable:' "$W/pf.err" \
  && ok "the catalog refusal is recognised whether or not it carries the wrapper's error prefix" \
  || { bad "a prefixed 'Unknown tool' was misread as a usable credential"; sed 's/^/         /' "$W/pf.err" | tail -3; }

start_stub ok
preflight CLIPS_MCP_TOKEN="$TOKEN" PW_PROVE_CLIPS_ENDPOINT="http://127.0.0.1:1/mcp"; pfrc=$?
pf_says "an unreachable endpoint warns without blocking" "PUBLISH_READY=no" 0

# An empty-argument probe that SUCCEEDS is not good news: the import action must reject it, so
# either something other than that action answered, or the probe just created a recording.
start_stub ok
preflight CLIPS_MCP_TOKEN="$TOKEN" PW_PROVE_CLIPS_ENDPOINT="$ENDPOINT"; pfrc=$?
pf_says "an empty-argument probe that succeeds is NOT reported as ready" "PUBLISH_READY=no" 0
grep -q 'unexpected:' "$W/pf.err" \
  && ok "a probe that should have been rejected and was not is shouted about" \
  || { bad "an unexpected probe success was not reported"; sed 's/^/         /' "$W/pf.err" | tail -3; }

start_stub ok
preflight; pfrc=$?
pf_says "an unconfigured credential warns without blocking" "PUBLISH_READY=no" 0
grep -q 'publish credential not configured' "$W/pf.err" && grep -q 'CLIPS_MCP_TOKEN' "$W/pf.err" \
  && ok "the unconfigured warning names the one variable that is missing" \
  || { bad "no 'not configured' warning naming the variable"; sed 's/^/         /' "$W/pf.err" | tail -3; }
# Naming the variable is not enough: an operator who reads "CLIPS_MCP_TOKEN is not set" still has to
# go find which vault app holds it and how a lease is spelled. The warning must print the command
# they can PASTE — app name, key name, and the invocation it wraps — or the fix costs a skill-file
# read at exactly the moment the run is cheapest to restart.
if grep -qF 'agent-native vault exec --app dispatch-paulsjob --key CLIPS_MCP_TOKEN --' "$W/pf.err"; then
  ok "the unconfigured warning prints the literal lease command, with the vault app and key named"
else
  bad "the unconfigured warning makes the operator reconstruct the lease command"
  sed 's/^/         /' "$W/pf.err" | tail -4
fi
# Runnable means runnable: the pasted line must re-run THIS preflight, with the probe still switched
# on and the same origin, not a prose stand-in an operator has to finish themselves.
if grep -F 'agent-native vault exec' "$W/pf.err" | grep -qF "PROBE_HOSTING=1" \
   && grep -F 'agent-native vault exec' "$W/pf.err" | grep -qF "$REPO_ROOT/$S/preflight.mjs"; then
  ok "the printed lease command re-runs this preflight verbatim"
else
  bad "the printed lease command is not the invocation it is standing in for"
  sed 's/^/         /' "$W/pf.err" | tail -4
fi
# First machine, no stored key: `vault exec` would fail on a key that was never added, so the one
# command that precedes it is named too.
grep -qF 'agent-native vault add CLIPS_MCP_TOKEN' "$W/pf.err" \
  && ok "the warning names how to store the credential the first time" \
  || { bad "an operator with no stored key is told to lease one that does not exist"; sed 's/^/         /' "$W/pf.err" | tail -4; }
[ "$(wc -l < "$W/cap/requests.jsonl" | tr -d ' ')" = 0 ] \
  && ok "an unconfigured preflight sends nothing" \
  || bad "the preflight called out without a credential"

# Missing video tooling: a PATH carrying only what readiness itself needs, so no ffmpeg on this
# machine can satisfy the probe. node is invoked by absolute path because env would otherwise have to
# find it on that stripped PATH.
mkdir -p "$W/nofffbin"
ln -sf "$(command -v curl)" "$W/nofffbin/curl"
NODE_BIN=$(command -v node)
( cd "$W" && env PROBE_HOSTING=1 BASE_URL="$ORIGIN" READY_TIMEOUT=10 HOME="$W/isolated-home" \
    PWPROVE_LEDGER="$W/ledger.jsonl" PATH="$W/nofffbin" CLIPS_MCP_TOKEN="$TOKEN" \
    PW_PROVE_CLIPS_ENDPOINT="$ENDPOINT" \
    "$NODE_BIN" "$REPO_ROOT/$S/preflight.mjs" >"$W/pf.out" 2>"$W/pf.err" )
pfrc=$?
pf_says "missing video tooling warns without blocking" "VIDEO_TOOLING=no" 0
grep -q 'publish-proof.mjs cannot concatenate' "$W/pf.err" \
  && ok "the tooling warning says what will break" \
  || bad "no video-tooling warning"

echo ""
echo "-- the R2 path is gone, not dormant: two publish shapes cannot both be emitted --"
if [ -e "$S/host-proof.mjs" ] || [ -e "$S/host-video.mjs" ]; then
  bad "host-proof.mjs / host-video.mjs still ship — a second publish shape is still reachable"
else
  ok "host-proof.mjs and host-video.mjs are deleted"
fi
# The whole pw-prove surface, not just its scripts: a SKILL step or an eval that still names a
# deleted script points an agent at a file that is not there.
if grep -rlE 'host-proof|host-video|wrangler' skills/pw-prove > "$W/stale" 2>/dev/null; then
  bad "the pw-prove surface still names the retired path"; sed 's/^/         /' "$W/stale"
else
  ok "nothing under skills/pw-prove names host-proof, host-video or wrangler"
fi

echo ""
echo "  publish-proof: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
