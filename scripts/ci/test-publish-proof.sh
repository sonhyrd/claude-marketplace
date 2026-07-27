#!/usr/bin/env bash
# Process-boundary tests for publish-proof.mjs — the ONE Clips recording a pw-prove run publishes.
# Same shape as test-proof-page.sh: spawn the real script, assert its exit code, its marker line and
# the bytes it sent.
#
# ONE seam, and it is configuration the design already required: CLIPS_ORIGIN points at a throwaway
# local HTTP server (scripts/ci/fixtures/clips-stub-server.mjs) that captures the request. Everything
# else is real — real ffmpeg/ffprobe over real synthetic videos, so the measured durations,
# dimensions and the stream-copy claim are proven against actual files rather than fabricated probe
# output. No network leaves the machine.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1
S="skills/pw-prove/scripts"
STUB="scripts/ci/fixtures/clips-stub-server.mjs"

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

mkdir -p "$W/cap"

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
}

# The concatenated proof lands in the OS temp dir; pointing TMPDIR at the workspace both isolates the
# run from a developer's real temp dir and tells the test exactly where to look.
publish() { # usage: publish <manifest> [extra env...]
  local manifest="$1"; shift
  ( cd "$W" && env TMPDIR="$W" CLIPS_ORIGIN="$ORIGIN" CLIPS_A2A_SECRET="stub-signing-secret" \
      CLIPS_ORG="acme-org" CLIPS_SUBJECT="proof@acme.test" PWPROVE_LEDGER="$W/ledger.jsonl" "$@" \
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

echo "-- happy path: N clips in, ONE request out --"
start_stub ok
publish m.json
rc=$?
[ "$rc" = 0 ] && ok "exit 0" || { bad "exit $rc, wanted 0"; sed 's/^/         /' "$W/err" | tail -5; }

reqs=$(wc -l < "$W/cap/requests.jsonl" | tr -d ' ')
[ "$reqs" = 1 ] && ok "exactly one outbound request" || bad "expected 1 request, got $reqs"

SHARE="$ORIGIN/share/rec_stub_1"
marker=$(sed -n 's/^PWPROVE_URL //p' "$W/out" | head -n1)
[ "$marker" = "$SHARE" ] && ok "the share URL is on the PWPROVE_URL marker line" \
  || bad "marker line: '$marker' != '$SHARE'"

# The request as the destination saw it — every assertion below reads this file.
REQ="$W/cap/requests.jsonl"
# usage: jassert <name> <JS expression over `r` (the captured request) and `b` (its body)>
jassert() {
  if EXPR="$2" node -e '
    const fs = require("fs");
    const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean)[0]);
    const b = r.body;
    const held = eval(process.env.EXPR);
    if (!held) { console.error("expression is false: " + process.env.EXPR); process.exit(1); }
  ' "$REQ" 2>"$W/jerr"; then ok "$1"; else bad "$1"; sed 's/^/         /' "$W/jerr" | head -2; fi
}

jassert "the request is a POST to the import action" \
  'r.method === "POST" && r.url === "/_agent-native/actions/import-recording-from-url"'
jassert "the video travels as a base64 data URL" \
  'typeof b.data === "string" && b.data.startsWith("data:video/webm;base64,") && b.data.length > 1000'
jassert "chapters are in manifest order, each titled with its AC verbatim" \
  'b.chapters.length === 2 && b.chapters[0].title === "Per-locale EN/DE/ID authoring" && b.chapters[1].title === "Every locale empty removes the key"'
jassert "the first chapter starts at zero and the second after the first clip" \
  'b.chapters[0].startMs === 0 && b.chapters[1].startMs >= 1900 && b.chapters[1].startMs <= 2100'
jassert "the description carries the PR URL" 'b.description.includes("https://github.com/org/repo/pull/2974")'
jassert "the description carries the spec path" 'b.description.includes("tests/e2e/cookie-consent.spec.ts")'
jassert "the description carries the mutation verdict" 'b.description.includes("RED — dropping the .trim()")'
jassert "the recording is titled from the manifest" 'b.title === "PR #2974 — cookie consent text authoring"'

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
  const dur = Number(process.argv[2]) * 1000;
  if (Math.abs(b.durationMs - dur) > 150) { console.error(`durationMs ${b.durationMs} vs file ${dur}`); process.exit(1); }
  if (b.width !== 320 || b.height !== 180) { console.error(`dimensions ${b.width}x${b.height}`); process.exit(1); }
  if (b.hasAudio !== false) { console.error("hasAudio should be false for a silent proof"); process.exit(1); }
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
echo "-- the bearer: short-lived, scoped to the import, minted with the Node standard library --"
if node -e '
  const crypto = require("crypto");
  const fs = require("fs");
  const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean)[0]);
  const [origin, secret] = process.argv.slice(2);
  const auth = r.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) throw new Error("no bearer header");
  const [h, p, s] = auth.slice(7).split(".");
  const expect = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  if (s !== expect) throw new Error("signature does not verify against the configured secret");
  if (JSON.parse(Buffer.from(h, "base64url")).alg !== "HS256") throw new Error("not HS256");
  const c = JSON.parse(Buffer.from(p, "base64url"));
  if (c.scope !== "recordings:import") throw new Error(`scope ${c.scope}`);
  if (c.aud !== origin) throw new Error(`aud ${c.aud}`);
  if (c.org_id !== "acme-org") throw new Error(`org_id ${c.org_id}`);
  if (!c.jti) throw new Error("no jti");
  const life = c.exp - c.iat;
  if (!(life > 0 && life <= 900)) throw new Error(`lifetime ${life}s is not short-lived`);
' "$REQ" "$ORIGIN" "stub-signing-secret" 2>"$W/jerr"; then
  ok "an HS256 bearer verifies against the secret and carries scope, audience, org and a short life"
else
  bad "bearer claims violate the contract"; sed 's/^/         /' "$W/jerr" | tail -2
fi

echo ""
echo "-- run ledger --"
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
( cd "$W" && env TMPDIR="$W" CLIPS_ORIGIN="$ORIGIN" CLIPS_A2A_SECRET="stub-signing-secret" \
    CLIPS_ORG="acme-org" PWPROVE_LEDGER="$W/ledger.jsonl" \
    node "$REPO_ROOT/$S/publish-proof.mjs" m.json >"$W/merged" 2>&1 )
merged=$(sed -n 's/^PWPROVE_URL //p' "$W/merged" | head -n1)
[ "$merged" = "$ORIGIN/share/rec_stub_1" ] \
  && ok "the share URL is still recoverable from merged stdout+stderr" \
  || bad "merged streams lost the URL: '$merged'"

echo ""
echo "-- configuration and manifest refusals --"
start_stub ok
( cd "$W" && env -u CLIPS_ORIGIN -u CLIPS_A2A_SECRET TMPDIR="$W" PWPROVE_LEDGER="$W/ledger.jsonl" \
    node "$REPO_ROOT/$S/publish-proof.mjs" m.json >"$W/out" 2>"$W/err" )
rc=$?
[ "$rc" = 1 ] && ok "unconfigured origin/secret refuses to publish (exit 1)" \
  || { bad "missing config: exit $rc, wanted 1"; sed 's/^/         /' "$W/err" | tail -2; }
[ "$(wc -l < "$W/cap/requests.jsonl" | tr -d ' ')" = 0 ] \
  && ok "nothing is sent when the configuration is missing" \
  || bad "a request went out without configuration"
cat > "$W/empty.json" <<'JSON'
{ "title": "nothing to see", "clips": [] }
JSON
publish empty.json
[ "$?" = 1 ] && ok "a manifest with no clips is refused (exit 1)" || bad "empty clips list should exit 1"
publish does-not-exist.json
[ "$?" = 1 ] && ok "an unreadable manifest is refused (exit 1)" || bad "missing manifest should exit 1"

echo ""
echo "-- preflight: the credential round-trip, warn-only in every outcome --"
# BASE_URL points at the stub too: readiness only asks whether SOMETHING answers, and any code that
# is not 000/502/503/504 is a live server.
#
# PROBE_HOSTING also runs the pre-existing `npx wrangler whoami` probe, which would reach the
# network. It is shimmed to a fast failure here: this check is about the publish probes, and the
# wrangler probe's own contract is warn-only either way.
mkdir -p "$W/bin"
printf '#!/bin/sh\necho "not logged in" >&2\nexit 1\n' > "$W/bin/npx"
chmod +x "$W/bin/npx"

preflight() { # usage: preflight <extra env...>
  ( cd "$W" && env PROBE_HOSTING=1 BASE_URL="$ORIGIN" READY_TIMEOUT=10 PWPROVE_LEDGER="$W/ledger.jsonl" \
      PATH="$W/bin:$PATH" CLIPS_A2A_SECRET="stub-signing-secret" CLIPS_ORG="acme-org" "$@" \
      node "$REPO_ROOT/$S/preflight.mjs" >"$W/pf.out" 2>"$W/pf.err" )
}
pf_says() { # usage: pf_says <name> <expected summary line> <expected rc>
  if [ "$pfrc" != "$3" ]; then bad "$1 — exit $pfrc, wanted $3 (the publish probe must never block)"; return; fi
  grep -qx "$2" "$W/pf.out" && ok "$1" || { bad "$1 — no '$2' in the summary"; sed 's/^/         /' "$W/pf.out" | tail -4; }
}

start_stub validation
preflight CLIPS_ORIGIN="$ORIGIN"; pfrc=$?
pf_says "a schema-validation rejection reports the credential as usable" "PUBLISH_READY=yes" 0
grep -q '"url":"/_agent-native/actions/import-recording-from-url"' "$W/cap/requests.jsonl" \
  && ok "the probe POSTs the import action itself (a bare GET would answer before auth)" \
  || bad "the probe did not POST the import action: $(head -c 200 "$W/cap/requests.jsonl")"
pf_says "the video tooling probe reports what it found" "VIDEO_TOOLING=yes" 0

start_stub unauthorized
preflight CLIPS_ORIGIN="$ORIGIN"; pfrc=$?
pf_says "a 401 warns without blocking" "PUBLISH_READY=no" 0
grep -q 'WARN - publish credential unusable' "$W/pf.err" \
  && ok "the 401 warning pastes the probe output" \
  || bad "no credential warning on 401"

start_stub ok
preflight CLIPS_ORIGIN="http://127.0.0.1:1"; pfrc=$?
pf_says "an unreachable origin warns without blocking" "PUBLISH_READY=no" 0

preflight; pfrc=$?
pf_says "an unconfigured credential warns without blocking" "PUBLISH_READY=no" 0
grep -q 'publish credential not configured' "$W/pf.err" \
  && ok "the unconfigured warning names what is missing" \
  || bad "no 'not configured' warning"

# Missing video tooling: a PATH carrying only what readiness itself needs, so no ffmpeg on this
# machine can satisfy the probe. node is invoked by absolute path because env would otherwise have to
# find it on that stripped PATH.
mkdir -p "$W/nofffbin"
ln -sf "$(command -v curl)" "$W/nofffbin/curl"
NODE_BIN=$(command -v node)
( cd "$W" && env PROBE_HOSTING=1 BASE_URL="$ORIGIN" READY_TIMEOUT=10 PWPROVE_LEDGER="$W/ledger.jsonl" \
    PATH="$W/nofffbin" CLIPS_ORIGIN="$ORIGIN" CLIPS_A2A_SECRET="stub-signing-secret" \
    "$NODE_BIN" "$REPO_ROOT/$S/preflight.mjs" >"$W/pf.out" 2>"$W/pf.err" )
pfrc=$?
pf_says "missing video tooling warns without blocking" "VIDEO_TOOLING=no" 0
grep -q 'publish-proof.mjs cannot concatenate' "$W/pf.err" \
  && ok "the tooling warning says what will break" \
  || bad "no video-tooling warning"

echo ""
echo "-- the old path is untouched: both host scripts still ship --"
[ -f "$S/host-proof.mjs" ] && [ -f "$S/host-video.mjs" ] \
  && ok "host-proof.mjs and host-video.mjs still exist" \
  || bad "the R2 path was removed — that belongs to the cutover ticket, not this one"

echo ""
echo "  publish-proof: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
