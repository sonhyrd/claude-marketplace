#!/usr/bin/env bash
# Process-boundary suite for the shipped HAR scrubber (issue #36).
#
# The defect this script exists to close is a LEAKED CREDENTIAL: eight sessions committed a HAR
# recorded against a live authenticated tenant, and the documented "remove Authorization and cookie
# headers" approach under-scrubs — a bearer survives in `Referer` values and in `token=` query
# parameters. So the positive fixture below carries a bearer in exactly those two places, and the
# residue check is required to trip on it. A residue check with no fixture proving it catches
# residue is decoration.
#
# Everything is asserted at the process boundary: invoke `node har-scrub.mjs` on a fixture, read
# the exit code and the `PWPROVE_SCRUB` marker line. No internal function is touched — the exit code
# is the contract the pre-commit refusal in the SKILL is written against.
#
# Every "secret" here is synthesised by this script from a payload that says so. Nothing in this
# file is, or ever was, a real credential.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1
S="skills/pw-prove/scripts/har-scrub.mjs"

pass=0; fail=0
ok()  { echo "  [PASS] $1"; pass=$((pass + 1)); }
bad() { echo "  [FAIL] $1"; fail=$((fail + 1)); }

W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
# Fixture invocations must never touch the operator's real ledger.
export PWPROVE_LEDGER="$W/ledger.jsonl"

# Two distinct JWT-shaped strings and one opaque session value. Synthetic by construction: the
# payload names the fixture, the signature segment spells out that it is not a credential.
mkjwt() {
  node -e '
    const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    process.stdout.write(
      b({ alg: "HS256", typ: "JWT" }) + "." +
      b({ fixture: process.argv[1], exp: 9999999999 }) + "." +
      Buffer.from("not-a-real-credential-" + process.argv[1]).toString("base64url"),
    );
  ' "$1"
}
RECORDED_JWT=$(mkjwt har-scrub-recorded)
LIVE_JWT=$(mkjwt har-scrub-replayed)
OPAQUE='s3ss10n-0pAque-Fixture-Value-0123456789'

# The dirty fixture. The same recorded bearer appears FOUR times — Authorization, the request URL's
# `token=`, the Referer's `token=`, and the JSON body — because "each distinct secret maps to a
# stable placeholder" is only observable when one secret occurs more than once.
DIRTY="$W/dirty.har"
node -e '
  const [out, jwt, opaque] = process.argv.slice(1);
  const har = {
    log: {
      version: "1.2",
      creator: { name: "playwright", version: "1.61.0" },
      entries: [
        {
          startedDateTime: "2026-01-01T00:00:00.000Z",
          time: 12,
          request: {
            method: "GET",
            url: `http://localhost:3000/api/me?token=${jwt}&page=2`,
            httpVersion: "HTTP/1.1",
            headers: [
              { name: "Authorization", value: `Bearer ${jwt}` },
              { name: "Cookie", value: `session=${opaque}; theme=dark` },
              { name: "Referer", value: `http://localhost:3000/app/dashboard?token=${jwt}&tab=1` },
              { name: "X-Debug-Trace", value: `issued ${jwt} at boot` },
              { name: "Accept", value: "application/json" },
            ],
            cookies: [{ name: "session", value: opaque }],
            queryString: [
              { name: "token", value: jwt },
              { name: "page", value: "2" },
            ],
            postData: {
              mimeType: "application/json",
              text: JSON.stringify({ refresh_token: jwt, locale: "en" }),
            },
            headersSize: -1,
            bodySize: -1,
          },
          response: {
            status: 200,
            statusText: "OK",
            httpVersion: "HTTP/1.1",
            headers: [
              { name: "Set-Cookie", value: `sid=${opaque}; Path=/; HttpOnly; SameSite=Lax` },
              { name: "Content-Type", value: "application/json" },
            ],
            cookies: [{ name: "sid", value: opaque }],
            content: {
              size: 64,
              mimeType: "application/json",
              text: JSON.stringify({ access_token: jwt, user: "fixture" }),
            },
            redirectURL: "",
            headersSize: -1,
            bodySize: -1,
          },
          cache: {},
          timings: { send: 0, wait: 10, receive: 2 },
          _rawTag: `internal ${jwt}`,
        },
        {
          startedDateTime: "2026-01-01T00:00:01.000Z",
          time: 5,
          request: {
            method: "POST",
            url: "http://127.0.0.1:4000/api/items",
            httpVersion: "HTTP/1.1",
            headers: [{ name: "Content-Type", value: "application/json" }],
            cookies: [],
            queryString: [],
            postData: { mimeType: "application/json", text: "{\"name\":\"widget\"}" },
            headersSize: -1,
            bodySize: -1,
          },
          response: {
            status: 201,
            statusText: "Created",
            httpVersion: "HTTP/1.1",
            headers: [{ name: "Content-Type", value: "application/json" }],
            cookies: [],
            content: {
              size: 40,
              mimeType: "application/json",
              encoding: "base64",
              text: Buffer.from(JSON.stringify({ id: 1, echo_token: jwt })).toString("base64"),
            },
            redirectURL: "",
            headersSize: -1,
            bodySize: -1,
          },
          cache: {},
          timings: { send: 0, wait: 4, receive: 1 },
        },
      ],
    },
  };
  require("fs").writeFileSync(out, JSON.stringify(har, null, 2) + "\n");
' "$DIRTY" "$RECORDED_JWT" "$OPAQUE" || { echo "  [FAIL] could not write the fixture"; exit 1; }

# usage: run <outfile> <errfile> <args...>  -> sets RC
run() {
  local o="$1" e="$2"; shift 2
  node "$S" "$@" >"$o" 2>"$e"
  RC=$?
}
marker() { grep -m1 '^PWPROVE_SCRUB ' "$1" 2>/dev/null; }

echo "-- the residue check catches the observed under-scrub (positive fixture) --"

run "$W/v1.out" "$W/v1.err" "$DIRTY" --verify
if [ "$RC" = "3" ]; then
  ok "--verify on a dirty HAR exits 3 (non-zero on residue)"
else
  bad "--verify on a dirty HAR exited $RC, wanted 3"
fi
case "$(marker "$W/v1.out")" in
  "PWPROVE_SCRUB residue file=$DIRTY hits="*) ok "marker line reports residue and its count" ;;
  *) bad "no 'PWPROVE_SCRUB residue' marker line: '$(marker "$W/v1.out")'" ;;
esac
# The two places a header-only scrub leaves a bearer. Both must be named by location.
if grep -q 'headers\[Referer\]' "$W/v1.err"; then
  ok "residue report names the bearer surviving in a Referer value"
else
  bad "residue report never mentions the Referer — this is the exact observed under-scrub"
  sed 's/^/         /' "$W/v1.err" | head -6
fi
if grep -q 'credential in query parameter' "$W/v1.err"; then
  ok "residue report names the bearer in a token= query parameter"
else
  bad "residue report never mentions the query parameter"
  sed 's/^/         /' "$W/v1.err" | head -6
fi
for f in Authorization Cookie Set-Cookie; do
  if grep -q "headers\[$f\]" "$W/v1.err"; then
    ok "residue report covers the $f header"
  else
    bad "residue report misses the $f header"
  fi
done
if grep -q 'request.postData' "$W/v1.err" || grep -q 'postData' "$W/v1.err"; then
  ok "residue report covers post data"
else
  bad "residue report misses post data"
fi
if grep -q 'cookies\[' "$W/v1.err"; then
  ok "residue report covers the cookie arrays"
else
  bad "residue report misses the cookie arrays"
fi
if grep -q 'content.text' "$W/v1.err"; then
  ok "residue report covers a JWT in a response body (base64 and plain)"
else
  bad "residue report misses a JWT in a response body"
fi

echo ""
echo "-- the report never prints a credential --"
if grep -qF "$RECORDED_JWT" "$W/v1.out" "$W/v1.err"; then
  bad "the residue report echoed the token itself — never print a credential"
elif grep -qF "$OPAQUE" "$W/v1.out" "$W/v1.err"; then
  bad "the residue report echoed the opaque session value"
else
  ok "residue is reported by location, kind and length only"
fi

echo ""
echo "-- scrubbing: every secret placeheld, then the file verifies clean --"
CLEAN="$W/clean.har"
run "$W/s1.out" "$W/s1.err" "$DIRTY" --out "$CLEAN"
if [ "$RC" = "0" ]; then
  ok "scrub exits 0"
else
  bad "scrub exited $RC, wanted 0"; sed 's/^/         /' "$W/s1.err" | head -4
fi
case "$(marker "$W/s1.out")" in
  "PWPROVE_SCRUB ok file=$CLEAN secrets="*) ok "marker line reports the scrubbed file and its secret count" ;;
  *) bad "no 'PWPROVE_SCRUB ok' marker line: '$(marker "$W/s1.out")'" ;;
esac
if grep -qF "$RECORDED_JWT" "$CLEAN"; then
  bad "the bearer survives in the scrubbed HAR"
  grep -oF "$RECORDED_JWT" "$CLEAN" | wc -l | sed 's/^/         occurrences: /'
else
  ok "no occurrence of the bearer remains anywhere in the scrubbed HAR"
fi
if grep -qF "$OPAQUE" "$CLEAN"; then
  bad "the opaque session value survives in the scrubbed HAR"
else
  ok "no occurrence of the opaque session value remains"
fi
run "$W/v2.out" "$W/v2.err" "$CLEAN" --verify
if [ "$RC" = "0" ]; then
  ok "--verify on the scrubbed HAR exits 0 (zero on a clean file)"
else
  bad "--verify on the scrubbed HAR exited $RC, wanted 0"; sed 's/^/         /' "$W/v2.err" | head -6
fi
case "$(marker "$W/v2.out")" in
  "PWPROVE_SCRUB clean file=$CLEAN entries="*) ok "clean marker line names the file and its entry count" ;;
  *) bad "no 'PWPROVE_SCRUB clean' marker line: '$(marker "$W/v2.out")'" ;;
esac

echo ""
echo "-- removal is not blind: stable placeholders, preserved structure --"
# The recorded bearer occurred in the Authorization header and in the JSON body. One secret, one
# placeholder — that is what lets a reader still see the two are the same credential.
AUTH=$(node -e '
  const har = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const h = har.log.entries[0].request.headers.find((x) => x.name === "Authorization");
  process.stdout.write(h.value);
' "$CLEAN")
BODY_PH=$(node -e '
  const har = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  process.stdout.write(JSON.parse(har.log.entries[0].request.postData.text).refresh_token);
' "$CLEAN")
case "$AUTH" in
  "Bearer __PWPROVE_SECRET_"*) ok "Authorization keeps its scheme and gains a placeholder ($AUTH)" ;;
  *) bad "Authorization value is not a placeheld bearer: '$AUTH'" ;;
esac
if [ "$AUTH" = "Bearer $BODY_PH" ]; then
  ok "the same secret in a header and a body produced the SAME placeholder ($BODY_PH)"
else
  bad "one secret produced two placeholders: header '$AUTH' vs body '$BODY_PH'"
fi
# Different secrets must stay distinguishable.
NPH=$(grep -o '__PWPROVE_SECRET_[0-9]*__' "$CLEAN" | sort -u | wc -l | tr -d ' ')
if [ "$NPH" -ge 2 ]; then
  ok "distinct secrets got distinct placeholders ($NPH in the file)"
else
  bad "expected at least 2 distinct placeholders (bearer + opaque session), got $NPH"
fi
# Non-secret material must survive: a scrubbed HAR that lost its shape is a different recording.
if grep -q '"page"' "$CLEAN" && grep -q 'page=2' "$CLEAN"; then
  ok "a non-secret query parameter is untouched"
else
  bad "the non-secret query parameter did not survive the scrub"
fi
# A cookie the scrubber cannot classify is treated as a credential, so every VALUE in the jar is
# placeheld — but the names stay, or the recording loses its shape.
if grep -q 'session=__PWPROVE_SECRET_' "$CLEAN" && grep -q 'theme=__PWPROVE_SECRET_' "$CLEAN"; then
  ok "every cookie value in the jar is placeheld, and the cookie names survive"
else
  bad "the cookie jar was not placeheld name-for-name"
  grep -o '"value": "[^"]*"' "$CLEAN" | head -6 | sed 's/^/         /'
fi
if grep -q 'Path=/' "$CLEAN" && grep -q 'HttpOnly' "$CLEAN"; then
  ok "Set-Cookie attributes survive (only the value is replaced)"
else
  bad "Set-Cookie attributes were destroyed along with the value"
fi
# Idempotence: the transform is deterministic, so a second pass is a no-op and a diff is reviewable.
cp "$CLEAN" "$W/again.har"
run "$W/s2.out" "$W/s2.err" "$W/again.har"
if [ "$RC" = "0" ] && cmp -s "$CLEAN" "$W/again.har"; then
  ok "scrubbing an already-scrubbed HAR is a byte-identical no-op"
else
  bad "the scrub is not idempotent (exit $RC)"
fi

echo ""
echo "-- replay survives: recorded entry and replayed request normalise to the same URL --"
# The committed HAR is canonical (no port). Before replay it is re-pointed at whatever origin THIS
# run got; the live request URL carries a DIFFERENT live bearer and goes through the same
# normaliser. The two must land on the same string, or routeFromHAR aborts on a call it recorded.
RECORDED=$(node -e '
  const har = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  process.stdout.write(har.log.entries[0].request.url);
' "$CLEAN")
case "$RECORDED" in
  "http://localhost/api/me?token=__PWPROVE_SCRUBBED__&page=2")
    ok "the canonical recorded URL is port-free and credential-free ($RECORDED)" ;;
  *)
    bad "unexpected canonical recorded URL: '$RECORDED'" ;;
esac
run "$W/rp.out" "$W/rp.err" "$CLEAN" --origin http://localhost:5173 --out "$W/repointed.har"
REPOINTED=$(node -e '
  const har = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  process.stdout.write(har.log.entries[0].request.url);
' "$W/repointed.har")
# head -1: stdout also carries this invocation's PWPROVE_RUN ledger record.
LIVE=$(node "$S" normalize "http://localhost:5173/api/me?token=$LIVE_JWT&page=2" --origin http://localhost:5173 | head -1)
if [ "$REPOINTED" = "$LIVE" ]; then
  ok "recorded entry == replayed request after normalisation ($REPOINTED)"
else
  bad "recorded '$REPOINTED' != replayed '$LIVE' — replay would abort on a call it recorded"
fi

echo ""
echo "-- origins are normalised, so replay is not bound to the recording's port --"
A=$(node "$S" normalize 'http://localhost:3000/api/items' | head -1)
B=$(node "$S" normalize 'http://127.0.0.1:4000/api/items' | head -1)
if [ "$A" = "$B" ] && [ "$A" = "http://localhost/api/items" ]; then
  ok "two loopback origins on different ports canonicalise identically ($A)"
else
  bad "loopback origins did not canonicalise: '$A' vs '$B'"
fi
C=$(node "$S" normalize 'https://api.stripe.com/v1/charges' | head -1)
if [ "$C" = "https://api.stripe.com/v1/charges" ]; then
  ok "a third-party origin is left alone (only loopback is canonicalised)"
else
  bad "a third-party origin was rewritten: '$C'"
fi
SECOND=$(node -e '
  const har = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  process.stdout.write(har.log.entries[1].request.url);
' "$CLEAN")
if [ "$SECOND" = "http://localhost/api/items" ]; then
  ok "a 127.0.0.1 entry in the HAR canonicalises to the same origin as a localhost one"
else
  bad "second entry did not canonicalise: '$SECOND'"
fi

echo ""
echo "-- exit codes: the contract the pre-commit refusal is written against --"
# usage: code_case <name> <want-rc> <args...>
code_case() {
  local name="$1" want="$2"; shift 2
  node "$S" "$@" >"$W/c.out" 2>"$W/c.err"
  local rc=$?
  if [ "$rc" = "$want" ]; then ok "$name — exit $rc"; else bad "$name — exit $rc, wanted $want"; fi
}
code_case "no arguments" 1
code_case "unknown flag" 1 "$DIRTY" --nope
code_case "normalize with no url" 1 normalize
code_case "--origin that is not a URL" 1 "$DIRTY" --origin not-a-url
code_case "missing file" 2 "$W/does-not-exist.har"
printf 'not json' > "$W/bad.json"
code_case "not JSON" 2 "$W/bad.json"
printf '{"log":{"version":"1.2"}}' > "$W/nolog.har"
code_case "JSON without log.entries" 2 "$W/nolog.har"
code_case "clean file verifies" 0 "$CLEAN" --verify
code_case "dirty file refuses" 3 "$DIRTY" --verify

echo ""
echo "-- the leaks a shape-only reading misses (regression fixtures) --"
# Each of these three was a real defect found in review, and each is invisible to a scrubber that
# only looks for JWT and `Bearer` shapes.

# 1. URL userinfo. Not a header, not a cookie, not a query parameter — every targeted pass misses
#    it, and an opaque password has no shape for the generic sweep to catch.
node -e '
  require("fs").writeFileSync(process.argv[1], JSON.stringify({
    log: { version: "1.2", entries: [{
      request: { method: "GET", url: "http://svcuser:pa55word-in-the-url@localhost:5173/api/me",
                 headers: [], cookies: [], queryString: [] },
      response: { status: 200, headers: [], cookies: [], content: {}, redirectURL: "" },
    }] },
  }, null, 2));
' "$W/userinfo.har"
run "$W/u1.out" "$W/u1.err" "$W/userinfo.har" --verify
if [ "$RC" = "3" ] && grep -q 'userinfo' "$W/u1.err"; then
  ok "a credential in URL userinfo is residue, not a clean file"
else
  bad "URL userinfo passed --verify (exit $RC) — a credential survived undetected"
fi
run "$W/u2.out" "$W/u2.err" "$W/userinfo.har"
if [ "$RC" = "0" ] && ! grep -q 'pa55word-in-the-url' "$W/userinfo.har"; then
  ok "the scrub replaces URL userinfo"
else
  bad "the scrub left the userinfo credential in place (exit $RC)"
fi

# 2. An opaque secret under a credential-named body key, in a request body AND a response body.
#    `sk_live_…` is just a string; only the KEY says it is a credential.
OPAQUE_KEY_SECRET='sk_live_51H8xQwErTyUiOpAsDfGhJkL'
node -e '
  const [out, secret] = process.argv.slice(1);
  require("fs").writeFileSync(out, JSON.stringify({
    log: { version: "1.2", entries: [{
      request: { method: "POST", url: "http://localhost:3000/api/keys", headers: [], cookies: [],
                 queryString: [],
                 postData: { mimeType: "application/json",
                             text: JSON.stringify({ apiKey: secret, label: "ci" }) } },
      response: { status: 200, headers: [], cookies: [],
                  content: { mimeType: "application/json",
                             text: JSON.stringify({ access_token: secret, ok: true }) },
                  redirectURL: "" },
    }] },
  }, null, 2));
' "$W/bodykey.har" "$OPAQUE_KEY_SECRET"
run "$W/b1.out" "$W/b1.err" "$W/bodykey.har" --verify
if [ "$RC" = "3" ] && grep -q 'secret-named body key' "$W/b1.err"; then
  ok "an opaque secret under a credential-named body key is residue"
else
  bad "an opaque body secret passed --verify (exit $RC) — the header-only reading all over again"
fi
run "$W/b2.out" "$W/b2.err" "$W/bodykey.har"
if [ "$RC" = "0" ] && ! grep -qF "$OPAQUE_KEY_SECRET" "$W/bodykey.har"; then
  ok "the scrub reaches opaque secrets in request AND response bodies"
else
  bad "an opaque body secret survived the scrub (exit $RC)"
fi
# camelCase and snake_case name the same key, and one secret in two bodies is one placeholder.
NPH2=$(grep -o '__PWPROVE_SECRET_[0-9]*__' "$W/bodykey.har" | sort -u | wc -l | tr -d ' ')
if [ "$NPH2" = "1" ]; then
  ok "the same secret under apiKey and access_token got ONE placeholder"
else
  bad "one secret in two bodies produced $NPH2 placeholders"
fi

# 3. A long framework cookie NAME must not be read as residue. `__Secure-next-auth.session-token`
#    is 31 characters; testing the whole header string wedges a correctly scrubbed jar on exit 3
#    with a "re-run the scrubber" message that can never clear it.
node -e '
  require("fs").writeFileSync(process.argv[1], JSON.stringify({
    log: { version: "1.2", entries: [{
      request: { method: "GET", url: "http://localhost:3000/api/me", cookies: [], queryString: [],
                 headers: [{ name: "Cookie", value: "__Secure-next-auth.session-token=__PWPROVE_SECRET_1__" }] },
      response: { status: 200, headers: [], cookies: [], content: {}, redirectURL: "" },
    }] },
  }, null, 2));
' "$W/longname.har"
run "$W/n1.out" "$W/n1.err" "$W/longname.har" --verify
if [ "$RC" = "0" ]; then
  ok "a long cookie NAME over a placeheld value still verifies clean"
else
  bad "a correctly scrubbed jar was refused (exit $RC) — the operator cannot clear this"
  sed 's/^/         /' "$W/n1.err" | head -4
fi

echo ""
echo "-- the round trip: scrubbed at capture, committed, re-pointed, REPLAYED (issue #41) --"
#
# This is the assertion the whole placeholder design exists to make true, and it is deliberately
# stated as the equality PLAYWRIGHT actually performs. `HarBackend._harFindResponse` matches with
# `candidate.request.url !== url` — exact string equality on the full URL, with no port, query or
# origin tolerance anywhere (verified in playwright-core 1.58.2 and 1.62.1). So a canonical committed
# HAR cannot replay against a live run on its own: it must be BOUND to this run's origin and this
# run's credential first, into a gitignored working copy. Asserting that `bind` produced a
# nice-looking string would prove nothing; the assertion is that the bound string is byte-identical
# to the URL the live app requests.
PROJ="$W/proj"
mkdir -p "$PROJ/.pw-prove"
git init -q "$PROJ" 2>/dev/null
printf '.pw-prove/\n' > "$PROJ/.gitignore"
BOUND="$PROJ/.pw-prove/feature.api.har"
printf '{"__PWPROVE_SCRUBBED__":"%s"}\n' "$LIVE_JWT" > "$PROJ/.pw-prove/bindings.json"

# Every bind runs from inside the project: `git check-ignore` answers about the repo it is run in,
# which is exactly the app root the pipeline binds from.
run_in_proj() {
  local o="$1" e="$2"; shift 2
  (cd "$PROJ" && node "$REPO_ROOT/$S" "$@") >"$o" 2>"$e"
  RC=$?
}
run_in_proj "$W/bd.out" "$W/bd.err" bind "$CLEAN" --out .pw-prove/feature.api.har \
  --origin http://localhost:5173 --bindings .pw-prove/bindings.json
if [ "$RC" = "0" ]; then
  ok "bind exits 0 on a committed HAR it can bind"
else
  bad "bind exited $RC, wanted 0"; sed 's/^/         /' "$W/bd.err" | head -6
fi
BOUND_URL=$(node -e '
  const har = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  process.stdout.write(har.log.entries[0].request.url);
' "$BOUND" 2>/dev/null)
LIVE_URL="http://localhost:5173/api/me?token=$LIVE_JWT&page=2"
if [ "$BOUND_URL" = "$LIVE_URL" ]; then
  ok "the bound entry is byte-identical to the live request URL — replay matches (exact-URL rule)"
else
  bad "bound '$BOUND_URL' != live request — routeFromHAR would abort on a call it recorded"
fi
SECOND_BOUND=$(node -e '
  const har = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  process.stdout.write(har.log.entries[1].request.url);
' "$BOUND" 2>/dev/null)
if [ "$SECOND_BOUND" = "http://localhost:5173/api/items" ]; then
  ok "an entry with no placeholder is re-pointed at this run's port too"
else
  bad "second entry did not bind to this run's origin: '$SECOND_BOUND'"
fi
# Header, cookie and body placeholders play no part in Playwright's match (url + method + postData),
# so they are deliberately NOT rebound — a working copy carries the live credential only where
# replay cannot match without it.
if grep -q '__PWPROVE_SECRET_' "$BOUND"; then
  ok "placeholders outside the match key stay placeheld — no credential is re-injected for show"
else
  bad "bind re-injected credentials into headers/cookies, which matching never reads"
fi
# The committed file is an input to bind, never its victim.
if grep -qF "$LIVE_JWT" "$CLEAN"; then
  bad "bind wrote a live credential back into the COMMITTED HAR"
else
  ok "the committed HAR is untouched: still canonical, still secret-free"
fi
if grep -q 'could not say whether' "$W/bd.err"; then
  bad "git could not answer the ignore question — the refusal is inert in this environment"
else
  ok "the ignore question is answered by git, not assumed"
fi
if grep -qF "$LIVE_JWT" "$W/bd.out" "$W/bd.err"; then
  bad "bind echoed the live credential it substituted"
else
  ok "bind never prints the credential it binds"
fi

echo ""
echo "-- bind refuses rather than handing replay a HAR it cannot match --"
# An unbindable placeholder in the match key must be loud AND named. Falling through to
# notFound:'abort' would read as a broken application instead of an unbindable recording.
run_in_proj "$W/ub.out" "$W/ub.err" bind "$CLEAN" --out .pw-prove/feature.api.har --origin http://localhost:5173
if [ "$RC" = "4" ]; then
  ok "a placeholder with no run-time value exits 4 — never a silent fall-through to abort"
else
  bad "unbindable placeholder exited $RC, wanted 4"; sed 's/^/         /' "$W/ub.err" | head -6
fi
if grep -q 'entries\[0\].request.url' "$W/ub.err" && grep -q '__PWPROVE_SCRUBBED__' "$W/ub.err"; then
  ok "the refusal names the entry and the placeholder that cannot be bound"
else
  bad "the refusal does not name the unbindable entry"; sed 's/^/         /' "$W/ub.err" | head -6
fi
# The working copy carries a live credential. A path git would commit is the wrong place for it.
run_in_proj "$W/gi.out" "$W/gi.err" bind "$CLEAN" --out feature.api.har --origin http://localhost:5173 \
  --bindings .pw-prove/bindings.json
if [ "$RC" = "5" ] && [ ! -e "$PROJ/feature.api.har" ]; then
  ok "bind refuses (exit 5) to write a live-credential working copy to a committable path"
else
  bad "bind wrote the bound HAR to a non-gitignored path (exit $RC)"
fi
run_in_proj "$W/bm.out" "$W/bm.err" bind "$CLEAN" --origin http://localhost:5173
if [ "$RC" = "1" ]; then
  ok "bind with no --out is a usage error, never an in-place rewrite of the committed HAR"
else
  bad "bind without --out exited $RC, wanted 1"
fi

echo ""
echo "-- imported, it is a module: no argument parsing, no exit, no ledger record --"
# The capture-time caller (probe.mjs, issue #41) reaches scrubHar/findResidue by import. If the CLI
# below the main-guard still runs on import, the importer inherits har-scrub's argument parsing and
# dies of "no HAR file given" before it can scrub anything.
IMPORT_LEDGER="$W/import-ledger.jsonl"
PWPROVE_LEDGER="$IMPORT_LEDGER" node -e '
  import("./skills/pw-prove/scripts/har-scrub.mjs").then((m) => {
    const missing = ["scrubHar", "findResidue", "normalizeUrl"].filter((k) => typeof m[k] !== "function");
    if (missing.length) { console.error("missing exports: " + missing.join(",")); process.exit(9); }
    process.stdout.write("IMPORT_OK\n");
  });
' >"$W/imp.out" 2>"$W/imp.err"
RC=$?
if [ "$RC" = "0" ] && grep -q IMPORT_OK "$W/imp.out"; then
  ok "importing har-scrub.mjs exports the transform and the residue check without running the CLI"
else
  bad "importing har-scrub.mjs ran its CLI (exit $RC) — no caller can reach scrubHar this way"
  sed 's/^/         /' "$W/imp.err" | head -4
fi
if [ -s "$IMPORT_LEDGER" ]; then
  bad "an import wrote a run-ledger record — only a process gets a record"
else
  ok "an import writes no run-ledger record (a module is not a run)"
fi

echo ""
echo "  har-scrub: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
