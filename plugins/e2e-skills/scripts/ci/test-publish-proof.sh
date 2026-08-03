#!/usr/bin/env bash
# Process-boundary tests for publish-proof.mjs — the ONE Clips recording a pw-prove run publishes.
# Same shape as the proof-page check it replaced: spawn the real script, assert its exit code, its
# marker line and the bytes it sent — never an internal call.
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

# The organization's id and its domain are DELIBERATELY different strings here, and nothing in the
# fixtures lets one stand in for the other. A deployment looks its signing key up by the domain and
# then checks that the domain owns the id, so a caller that collapses the two into one value mints a
# token that 401s with nothing in the response to say why. Keeping them distinct in the fixture is
# what makes that collapse a test failure rather than a live-run surprise.
STUB_ORG_ID="0000acme0000000000000000000000ff"
STUB_ORG_DOMAIN="acme.test"

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
      CLIPS_ORG_ID="$STUB_ORG_ID" CLIPS_ORG_DOMAIN="$STUB_ORG_DOMAIN" \
      CLIPS_SUBJECT="proof@acme.test" PWPROVE_LEDGER="$W/ledger.jsonl" "$@" \
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
  if (!c.jti) throw new Error("no jti");
  const life = c.exp - c.iat;
  if (!(life > 0 && life <= 900)) throw new Error(`lifetime ${life}s is not short-lived`);
' "$REQ" "$ORIGIN" "stub-signing-secret" 2>"$W/jerr"; then
  ok "an HS256 bearer verifies against the secret and carries scope, audience and a short life"
else
  bad "bearer claims violate the contract"; sed 's/^/         /' "$W/jerr" | tail -2
fi

# The identity claims, asserted separately because they are the ones a collapse silently corrupts.
# `org_id` and `org_domain` are two different lookups on the receiving side — the domain selects the
# signing key, the id is the organization the import runs under — and `sub` must be a member of it.
if ORG_ID="$STUB_ORG_ID" ORG_DOMAIN="$STUB_ORG_DOMAIN" node -e '
  const fs = require("fs");
  const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean)[0]);
  const c = JSON.parse(Buffer.from(r.headers.authorization.slice(7).split(".")[1], "base64url"));
  const { ORG_ID, ORG_DOMAIN } = process.env;
  if (c.org_id !== ORG_ID) throw new Error(`org_id is ${c.org_id}, wanted ${ORG_ID}`);
  if (c.org_domain !== ORG_DOMAIN) throw new Error(`org_domain is ${c.org_domain}, wanted ${ORG_DOMAIN}`);
  if (c.org_id === c.org_domain) throw new Error("org_id and org_domain carry the same value");
  if (c.sub !== "proof@acme.test") throw new Error(`sub is ${c.sub}`);
' "$REQ" 2>"$W/jerr"; then
  ok "org_id, org_domain and sub each carry their own configured value"
else
  bad "the token's identity claims are wrong"; sed 's/^/         /' "$W/jerr" | tail -2
fi

echo ""
echo "-- per-chapter deep links point at the route whose ?t= is a timestamp --"
# On /share/<id> the `t` parameter is the agent-access token, NOT a timestamp: a deep link built
# there opens the recording from the top and silently drops the offset, so a reviewer sent to a
# criterion watches the run from the beginning and reads it as the wrong evidence. /embed/<id>
# is the route that parses `t` as seconds.
deep=$(sed -n 's/^publish-proof: chapter 2 .* -> //p' "$W/err" | head -n1)
case "$deep" in
  */embed/rec_stub_1\?t=*) ok "chapter deep links use /embed/<id>?t=<seconds> ($deep)" ;;
  */share/*) bad "chapter deep link uses /share/<id>?t=, where t is the access token: '$deep'" ;;
  *) bad "no chapter deep link was reported: '$deep'" ;;
esac
# The offset is the chapter's own start, in seconds — clip a.webm is 2s, so chapter 2 opens at 2.
[ "${deep##*t=}" = 2 ] && ok "the offset is the chapter's measured start in seconds" \
  || bad "chapter 2 should open at t=2, got t=${deep##*t=}"

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
    CLIPS_ORG_ID="$STUB_ORG_ID" CLIPS_ORG_DOMAIN="$STUB_ORG_DOMAIN" CLIPS_SUBJECT="proof@acme.test" \
    PWPROVE_LEDGER="$W/ledger.jsonl" \
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

# The three identity variables are REQUIRED, not defaulted. A default that guesses is worse than a
# refusal here: an id derived from the origin's hostname, or a subject like pw-prove@<hostname>, mints
# a token that reaches the deployment and is refused there — a 401 or a 403 an operator then has to
# diagnose against someone else's server, when this script already knew the value was never supplied.
for missing in CLIPS_ORG_ID CLIPS_ORG_DOMAIN CLIPS_SUBJECT; do
  start_stub ok
  # Built by omission rather than `env -u`: env applies its unsets BEFORE its assignments, so
  # `env -u CLIPS_ORG_ID CLIPS_ORG_ID=…` would hand the variable straight back and the case would
  # prove nothing.
  set -- TMPDIR="$W" CLIPS_ORIGIN="$ORIGIN" CLIPS_A2A_SECRET="stub-signing-secret" \
    PWPROVE_LEDGER="$W/ledger.jsonl"
  [ "$missing" = CLIPS_ORG_ID ]     || set -- "$@" CLIPS_ORG_ID="$STUB_ORG_ID"
  [ "$missing" = CLIPS_ORG_DOMAIN ] || set -- "$@" CLIPS_ORG_DOMAIN="$STUB_ORG_DOMAIN"
  [ "$missing" = CLIPS_SUBJECT ]    || set -- "$@" CLIPS_SUBJECT="proof@acme.test"
  ( cd "$W" && env -u CLIPS_ORG_ID -u CLIPS_ORG_DOMAIN -u CLIPS_SUBJECT "$@" \
      node "$REPO_ROOT/$S/publish-proof.mjs" m.json >"$W/out" 2>"$W/err" )
  rc=$?
  if [ "$rc" = 1 ] && grep -q "$missing" "$W/err" \
     && [ "$(wc -l < "$W/cap/requests.jsonl" | tr -d ' ')" = 0 ]; then
    ok "a missing $missing refuses to publish and names the variable"
  else
    bad "missing $missing: exit $rc, wanted 1 with the name in the report"
    sed 's/^/         /' "$W/err" | tail -2
  fi
done

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
grep -q "chapter 1's title" "$W/err" \
  && ok "the AC leak report names which chapter title carries the token" \
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
echo "-- transport failure keeps the run ALIVE and hands back the file --"
# The opposite posture to a gate: undelivered evidence never fails a run, because the proof is the
# passing test plus the mutation verdict. Exit 0, the path on a marker line, and the file really there.
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
name="a 500 from the destination"; alive_case "$name"
# A refused connection, not a slow one: port 1 on loopback answers with ECONNREFUSED immediately.
name="a refused connection"; ORIGIN_OK="$ORIGIN"; ORIGIN="http://127.0.0.1:1"
alive_case "$name"
ORIGIN="$ORIGIN_OK"

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
echo "-- preflight: the credential round-trip, warn-only in every outcome --"
# BASE_URL points at the stub too: readiness only asks whether SOMETHING answers, and any code that
# is not 000/502/503/504 is a live server.
#
# Nothing on this path is shimmed any more: PROBE_HOSTING used to shell out to `npx wrangler whoami`,
# which reached the network and had to be intercepted on PATH. That probe is gone with the bucket, so
# the only outbound call preflight makes is the credential round-trip against the stub.
preflight() { # usage: preflight <extra env...>
  ( cd "$W" && env PROBE_HOSTING=1 BASE_URL="$ORIGIN" READY_TIMEOUT=10 PWPROVE_LEDGER="$W/ledger.jsonl" \
      CLIPS_A2A_SECRET="stub-signing-secret" CLIPS_ORG_ID="$STUB_ORG_ID" \
      CLIPS_ORG_DOMAIN="$STUB_ORG_DOMAIN" CLIPS_SUBJECT="proof@acme.test" "$@" \
      node "$REPO_ROOT/$S/preflight.mjs" >"$W/pf.out" 2>"$W/pf.err" )
}
pf_says() { # usage: pf_says <name> <expected summary line> <expected rc>
  if [ "$pfrc" != "$3" ]; then bad "$1 — exit $pfrc, wanted $3 (the publish probe must never block)"; return; fi
  grep -qx "$2" "$W/pf.out" && ok "$1" || { bad "$1 — no '$2' in the summary"; sed 's/^/         /' "$W/pf.out" | tail -4; }
}

start_stub validation
preflight CLIPS_ORIGIN="$ORIGIN"; pfrc=$?
pf_says "a schema-validation rejection reports the credential as usable" "PUBLISH_READY=yes" 0
pf_says "delivery-readiness is the conjunction of the credential and the tooling" "HOSTING_READY=yes" 0
grep -qi 'wrangler' "$W/pf.out" "$W/pf.err" \
  && { bad "preflight still speaks of wrangler — the bucket left this path"; } \
  || ok "preflight never mentions wrangler: no bucket session is probed for"
grep -q '"url":"/_agent-native/actions/import-recording-from-url"' "$W/cap/requests.jsonl" \
  && ok "the probe POSTs the import action itself (a bare GET would answer before auth)" \
  || bad "the probe did not POST the import action: $(head -c 200 "$W/cap/requests.jsonl")"
pf_says "the video tooling probe reports what it found" "VIDEO_TOOLING=yes" 0

start_stub unauthorized
preflight CLIPS_ORIGIN="$ORIGIN"; pfrc=$?
pf_says "a 401 warns without blocking" "PUBLISH_READY=no" 0
pf_says "a refused credential makes the run's delivery not ready" "HOSTING_READY=no" 0
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
# playwright-test-generator keeps its watch page and its bucket — this cutover moved ONE skill.
[ -f "skills/playwright-test-generator/scripts/host-on-r2.mjs" ] \
  && ok "playwright-test-generator's bucket path is untouched" \
  || bad "playwright-test-generator lost host-on-r2.mjs — it was explicitly out of scope"

echo ""
echo "  publish-proof: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
