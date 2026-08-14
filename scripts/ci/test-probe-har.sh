#!/usr/bin/env bash
# Regression guard for pw-prove's RECORD_HAR contract (ADR 0011).
#
# pw-prove sells HAR-first mocking: the recon pass records an API-scoped HAR and the deliverable
# spec replays it via routeFromHAR. That whole rule was unreachable for every run — probe.mjs's
# shutdown closed the browser without closing the CONTEXT, and Playwright flushes a recordHar on
# context close, so the probe reported a clean recon and wrote no file. The agent then hand-wrote
# the mocks the HAR was supposed to eliminate. A silent no-op behind a documented flag.
#
# Proving the real flush needs a browser this repo does not carry, so the CI-provable half is
# structural: the ordering inside shutdown(), and the warning that fires when no HAR lands. The
# live half is verified against a real app in testbed/ (see ADR 0011 for the recorded run).
#
# probe.mjs is duplicated per skill; only pw-prove's copy supports RECORD_HAR. PTG's copy is
# deliberately out of scope here — asserting the contract on a script that never claimed it would
# be a test that passes for the wrong reason.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1
P="skills/pw-prove/scripts/probe.mjs"

pass=0; fail=0
ok()  { echo "  [PASS] $1"; pass=$((pass + 1)); }
bad() { echo "  [FAIL] $1"; fail=$((fail + 1)); }

W=$(mktemp -d); trap 'rm -rf "$W"' EXIT

echo "-- probe RECORD_HAR: the flush ordering --"

# Everything between `const shutdown = async` and the line that closes the arrow function.
# Comment lines are stripped first: the fix carries a `// ... browser.close() alone ...` rationale
# comment, and matching it would compare prose against code.
awk '/const shutdown = async/{f=1} f && !/^ *\/\//{print} f && /^    };$/{exit}' "$P" > "$W/shutdown.txt"
if [ ! -s "$W/shutdown.txt" ]; then
  bad "could not locate shutdown() in $P — the guard cannot run (did the function get renamed?)"
else
  c_line=$(grep -n 'context\.close()' "$W/shutdown.txt" | head -1 | cut -d: -f1)
  b_line=$(grep -n 'browser\.close()' "$W/shutdown.txt" | head -1 | cut -d: -f1)
  if [ -n "$c_line" ] && [ -n "$b_line" ] && [ "$c_line" -lt "$b_line" ]; then
    ok "shutdown awaits context.close() BEFORE browser.close() (recordHar flushes on context close)"
  else
    bad "shutdown must await context.close() before browser.close() — RECORD_HAR writes nothing otherwise (context:${c_line:-missing} browser:${b_line:-missing})"
  fi
fi

echo ""
echo "-- probe RECORD_HAR: a missing HAR is loud, never a clean recon --"

if grep -q 'RECORD_HAR was set but no HAR landed' "$P"; then
  ok "close warns when RECORD_HAR was set but no file landed"
else
  bad "close must warn when RECORD_HAR was set but no file landed — a silent miss reads as success"
fi
if grep -q 'Do NOT' "$P" && grep -q 'routeFromHAR spec against a HAR that does not exist' "$P"; then
  ok "the warning names the consequence (do not commit routeFromHAR against a missing HAR)"
else
  bad "the warning must name the consequence, not just report a missing file"
fi
if grep -q 'HAR written' "$P"; then
  ok "the success path prints the byte count, so 'recorded' is falsifiable"
else
  bad "a successful HAR write must report its size — an empty HAR is not a recorded HAR"
fi

echo ""
echo "-- probe RECORD_HAR: the scrub happens AT CAPTURE, not at commit (issue #41) --"
#
# The scrub used to be bound to the wrong step: the recording was made during recon, the scrub
# checklist lived next to commit, and between them sat six steps of an unscrubbed authenticated
# capture sitting in a working tree. This half of the guard is FUNCTIONAL, not structural: the
# daemon is driven end to end against a stub Playwright that writes a dirty HAR at context close —
# exactly what the real one does — and the assertions read the file the operator is left holding.
#
# The stub is the seam that makes this provable without a browser. It is a `playwright` package with
# one `chromium.launch()`, resolvable by the same createRequire walk the real gate uses.

STUB="$W/app"
mkdir -p "$STUB/node_modules/playwright"
echo '{"name":"capture-scrub-guard","private":true}' > "$STUB/package.json"
echo '{"name":"playwright","version":"0.0.0-stub","main":"index.mjs"}' \
  > "$STUB/node_modules/playwright/package.json"
cat > "$STUB/node_modules/playwright/index.mjs" <<'STUBJS'
// Minimal stand-in for the target project's pinned Playwright. It does exactly one thing the real
// one does and this guard depends on: on context.close() it flushes the recorded HAR to
// recordHar.path. The fixture it copies is deliberately DIRTY.
import fs from 'node:fs';
export const chromium = {
  async launch() {
    return {
      async newContext(opts) {
        const harPath = opts?.recordHar?.path;
        return {
          on() {},
          async newPage() {
            return { on() {}, url: () => 'about:blank', async goto() { return null; } };
          },
          async storageState() { return {}; },
          async close() {
            if (harPath) {
              fs.appendFileSync(process.env.STUB_LOG, `${harPath}\n`);
              fs.copyFileSync(process.env.STUB_HAR_FIXTURE, harPath);
            }
          },
        };
      },
      async close() {},
    };
  },
};
STUBJS

# The dirty capture: a bearer in Authorization, in a Referer's query string, and in a `token=`
# parameter — the exact under-scrub observed in the field. Synthetic by construction; the payload
# names the fixture and the signature spells out that it is not a credential.
CAP_JWT=$(node -e '
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  process.stdout.write(
    b({ alg: "HS256", typ: "JWT" }) + "." + b({ fixture: "probe-capture", exp: 9999999999 }) + "." +
    Buffer.from("not-a-real-credential-probe-capture").toString("base64url"),
  );
')
node -e '
  const [out, jwt] = process.argv.slice(1);
  require("fs").writeFileSync(out, JSON.stringify({
    log: { version: "1.2", creator: { name: "playwright", version: "1.61.0" }, entries: [{
      startedDateTime: "2026-01-01T00:00:00.000Z", time: 3,
      request: { method: "GET", url: `http://localhost:5173/api/me?token=${jwt}&page=2`,
                 headers: [
                   { name: "Authorization", value: `Bearer ${jwt}` },
                   { name: "Referer", value: `http://localhost:5173/app?token=${jwt}` },
                 ],
                 cookies: [], queryString: [{ name: "token", value: jwt }, { name: "page", value: "2" }] },
      response: { status: 200, headers: [], cookies: [],
                  content: { mimeType: "application/json", text: JSON.stringify({ ok: true }) },
                  redirectURL: "" },
      cache: {}, timings: { send: 0, wait: 2, receive: 1 },
    }] },
  }, null, 2) + "\n");
' "$W/capture-dirty.har" "$CAP_JWT"

TARGET_HAR="$STUB/e2e/feature.api.har"
mkdir -p "$STUB/e2e"
SOCK="$W/capture.sock"
: > "$W/stub.log"
(
  cd "$STUB" &&
  env PROBE_SOCK="$SOCK" PWPROVE_LEDGER="$W/ledger.jsonl" PROBE_IDLE=30 \
      RECORD_HAR="$TARGET_HAR" HAR_URL_FILTER='**/api/**' \
      STUB_HAR_FIXTURE="$W/capture-dirty.har" STUB_LOG="$W/stub.log" \
      node "$REPO_ROOT/$P" start >"$W/daemon.out" 2>&1
) &
DAEMON_PID=$!

for _ in $(seq 1 100); do [ -S "$SOCK" ] && break; sleep 0.1; done
if [ ! -S "$SOCK" ]; then
  bad "the stub-backed daemon never came up — the capture-time guard cannot run"
  sed 's/^/         /' "$W/daemon.out" | head -10
else
  # One real batch, then the close that flushes and scrubs.
  (cd "$STUB" && env PROBE_SOCK="$SOCK" PWPROVE_LEDGER="$W/ledger.jsonl" \
     node "$REPO_ROOT/$P" close >"$W/close.out" 2>&1)
  for _ in $(seq 1 100); do kill -0 "$DAEMON_PID" 2>/dev/null || break; sleep 0.1; done
  wait "$DAEMON_PID" 2>/dev/null

  if [ -s "$TARGET_HAR" ]; then
    ok "RECORD_HAR still lands a HAR at the path the operator asked for"
  else
    bad "no HAR at $TARGET_HAR after close"
    sed 's/^/         /' "$W/daemon.out" | head -10
  fi
  if [ -s "$TARGET_HAR" ] && ! grep -qF "$CAP_JWT" "$TARGET_HAR"; then
    ok "the HAR is already scrubbed when the context closes — no bearer survives capture"
  else
    bad "the bearer survived into $TARGET_HAR — the capture is still unscrubbed on disk"
  fi

  # The file at the operator's path must never have HELD the raw capture. Playwright can only write
  # to a path, so the raw flush goes to a private staging file that is destroyed in the same
  # shutdown; what the working tree ever sees is the scrubbed result and nothing else.
  STAGED=$(head -1 "$W/stub.log" 2>/dev/null)
  if [ -n "$STAGED" ] && [ "$STAGED" != "$TARGET_HAR" ]; then
    ok "the raw flush went to a staging path, never to $TARGET_HAR"
  else
    bad "Playwright wrote the RAW capture straight to the operator's path ('$STAGED')"
  fi
  if [ -n "$STAGED" ] && [ ! -e "$STAGED" ]; then
    ok "the raw staging file is gone after close — the unscrubbed bytes outlive nothing"
  else
    bad "the raw staging file survives at '$STAGED' — an unscrubbed capture is still on disk"
  fi
  case "$STAGED" in
    "$STUB"/*) bad "staging sat inside the working tree ('$STAGED') — it must never be committable" ;;
    *) ok "staging sat outside the working tree, so a stray raw capture can never be staged" ;;
  esac

  # The scrubber's own residue check is the same one the pre-commit refusal runs. If the two ever
  # disagree, the capture-time scrub is theatre.
  if [ -s "$TARGET_HAR" ]; then
    node "skills/pw-prove/scripts/har-scrub.mjs" "$TARGET_HAR" --verify >"$W/cap-v.out" 2>"$W/cap-v.err"
    if [ $? -eq 0 ]; then
      ok "the captured HAR passes --verify — capture-time scrub and pre-commit refusal agree"
    else
      bad "the captured HAR fails --verify — the scrub at capture is not the scrub at commit"
      sed 's/^/         /' "$W/cap-v.err" | head -6
    fi
  fi
  if grep -q 'scrubbed at capture' "$W/daemon.out"; then
    ok "close reports the scrub, so 'it was scrubbed' is falsifiable from the log"
  else
    bad "close never reports the capture-time scrub"
    sed 's/^/         /' "$W/daemon.out" | head -10
  fi
  if grep -qF "$CAP_JWT" "$W/daemon.out" "$W/close.out"; then
    bad "the probe echoed the captured bearer into its own output"
  else
    ok "the probe never prints the credential it just scrubbed"
  fi
fi

echo ""
echo "-- probe RECORD_HAR: the scrubber is the shipped one, not a second implementation --"
if grep -q "from './har-scrub.mjs'" "$P"; then
  ok "probe imports the shipped scrubber (one transform, not a hand-rolled twin)"
else
  bad "probe must import scrubHar from ./har-scrub.mjs — eight sessions hand-rolled this once already"
fi

echo ""
echo "  probe HAR: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
