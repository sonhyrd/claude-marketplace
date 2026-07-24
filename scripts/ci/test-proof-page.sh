#!/usr/bin/env bash
# Process-boundary tests for host-proof.mjs — the ONE proof page a pw-prove run publishes
# (docs/adr/0009). Same seam as test-generator-scripts.sh: spawn the script, assert the exit code
# and the bytes it wrote.
#
# No network. host-proof spawns host-video.mjs per object, which shells out to `npx -y wrangler r2
# object put` — so npx is shimmed on PATH and the shim CAPTURES what would have been uploaded (key,
# content type, payload). That makes the page itself testable: it is the artifact the shim catches.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
cd "$REPO_ROOT" || exit 1
S="skills/pw-prove/scripts"
PUB="https://pub-0e54d86b28da4e8f933f8eacd1a84c6c.r2.dev"

pass=0; fail=0
ok()  { echo "  [PASS] $1"; pass=$((pass + 1)); }
bad() { echo "  [FAIL] $1"; fail=$((fail + 1)); }

W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
mkdir -p "$W/bin" "$W/cap"

# --- npx shim: record the upload instead of performing it ----------------------------------------
cat > "$W/bin/npx" <<'SHIM'
#!/usr/bin/env bash
# Only `npx -y wrangler r2 object put <bucket/key> --file=<f> --content-type=<ct> --remote` is used.
key=""; file=""; ct=""
for a in "$@"; do
  case "$a" in
    --file=*) file="${a#--file=}" ;;
    --content-type=*) ct="${a#--content-type=}" ;;
    */*) [ -z "$key" ] && key="$a" ;;
  esac
done
printf '%s\t%s\n' "$key" "$ct" >> "$CAP/uploads.tsv"
# Flatten the key so a payload is retrievable by name: paul-rfp-public/proj/proof/x/a.webm -> a.webm
cp "$file" "$CAP/$(basename "$key")" 2>/dev/null
exit 0
SHIM
chmod +x "$W/bin/npx"

webm() { head -c 4096 /dev/urandom > "$1"; } # >1KB, so the empty-file gate does not trip

run_proof() { # usage: run_proof <manifest> <project> <prefix>
  : > "$W/cap/uploads.tsv"
  rm -f "$W/cap"/*.webm "$W/cap"/index.html
  ( cd "$W" && CAP="$W/cap" PATH="$W/bin:$PATH" PWPROVE_LEDGER="$W/ledger.jsonl" \
      node "$REPO_ROOT/$S/host-proof.mjs" "$1" "$2" "$3" >"$W/out" 2>"$W/err" )
}
page_html() { cat "$W/cap/index.html" 2>/dev/null; }
html_has() { if page_html | grep -qF -- "$2"; then ok "$1"; else bad "$1 — page lacks '$2'"; fi; }

echo "-- happy path: N clips + one page --"
webm "$W/a.webm"; webm "$W/b.webm"
cat > "$W/m.json" <<JSON
{
  "title": "PR #2974 — cookie consent text authoring",
  "prUrl": "https://github.com/org/repo/pull/2974",
  "spec": "tests/e2e/cookie-consent.spec.ts",
  "mutation": "RED",
  "clips": [
    { "ac": "Per-locale EN/DE/ID authoring", "scenario": "each tab holds its own text", "file": "a.webm" },
    { "ac": "Every locale empty removes the key", "scenario": "clearing removes the key", "file": "b.webm" }
  ]
}
JSON
run_proof m.json proj proof/pr2974-abc1234
rc=$?
[ "$rc" = 0 ] && ok "exit 0" || { bad "exit $rc, wanted 0"; sed 's/^/         /' "$W/err" | head -3; }

want="$PUB/proj/proof/pr2974-abc1234/index.html"
got=$(head -n1 "$W/out")
[ "$got" = "$want" ] && ok "stdout line 1 is the page URL" || bad "stdout line 1: '$got' != '$want'"

[ "$(wc -l < "$W/cap/uploads.tsv" | tr -d ' ')" = 3 ] \
  && ok "3 objects published (2 clips + the page)" \
  || bad "expected 3 uploads, got: $(cat "$W/cap/uploads.tsv")"
grep -q 'index.html	text/html;charset=utf-8' "$W/cap/uploads.tsv" \
  && ok "the page uploads as text/html (it must RENDER, not download)" \
  || bad "page content type wrong: $(grep index.html "$W/cap/uploads.tsv")"
grep -q 'per-locale-en-de-id-authoring.webm	video/webm' "$W/cap/uploads.tsv" \
  && ok "clip key is the AC slug, uploaded as video/webm" \
  || bad "clip key/type wrong: $(cat "$W/cap/uploads.tsv")"

html_has "page references its clips RELATIVELY (portable across buckets)" '"./"+c.slug+".webm"'
html_has "page carries every AC's slug" 'per-locale-en-de-id-authoring'
html_has "page carries the second AC's slug" 'every-locale-empty-removes-the-key'
html_has "page links the PR" 'https://github.com/org/repo/pull/2974'
html_has "page names the spec" 'tests/e2e/cookie-consent.spec.ts'
html_has "page states the scenario count" '2 scenarios'
html_has "page carries the mutation verdict" 'Mutation: RED'
html_has "clips auto-advance so the run watches as one pass" 'v.onended'
if page_html | grep -qF '<video id="v" controls'; then ok "page has one video stage"; else bad "no video stage"; fi

echo ""
echo "-- slugs: two ACs that slugify the same never overwrite each other --"
webm "$W/c.webm"; webm "$W/d.webm"
cat > "$W/dup.json" <<'JSON'
{ "clips": [ { "ac": "Saves the draft!", "file": "c.webm" }, { "ac": "saves the draft", "file": "d.webm" } ] }
JSON
run_proof dup.json proj proof/dup-1
grep -q 'saves-the-draft.webm' "$W/cap/uploads.tsv" && grep -q 'saves-the-draft-2.webm' "$W/cap/uploads.tsv" \
  && ok "colliding slugs get a numeric suffix" \
  || bad "slug collision not deduped: $(cat "$W/cap/uploads.tsv")"

echo ""
echo "-- HTML injection: an AC is untrusted text, not markup --"
webm "$W/e.webm"
cat > "$W/xss.json" <<'JSON'
{ "title": "a <b>bold</b> & risky title", "clips": [ { "ac": "shows <script>alert(1)</script> safely", "file": "e.webm" } ] }
JSON
run_proof xss.json proj proof/xss-1
if page_html | grep -qF '<script>alert(1)</script>'; then
  bad "an AC's markup reached the page unescaped"
else
  ok "AC markup is escaped"
fi
html_has "title is escaped" 'a &lt;b&gt;bold&lt;/b&gt; &amp; risky title'

echo ""
echo "-- gates: a bad clip aborts the whole page, it never ships with a hole --"
head -c 500 /dev/zero > "$W/tiny.webm"; webm "$W/good.webm"
cat > "$W/bad.json" <<'JSON'
{ "clips": [ { "ac": "fine", "file": "good.webm" }, { "ac": "broken recording", "file": "tiny.webm" } ] }
JSON
run_proof bad.json proj proof/gate-1
rc=$?
[ "$rc" = 3 ] && ok "empty-file gate propagates from host-video (exit 3)" || bad "exit $rc, wanted 3"
grep -q 'index.html' "$W/cap/uploads.tsv" && bad "a page was published despite a failed clip" \
  || ok "no page published when a clip fails its gate"

echo ""
echo "-- manifest validation --"
cat > "$W/empty.json" <<'JSON'
{ "title": "nothing to see", "clips": [] }
JSON
run_proof empty.json proj proof/none-1
[ "$?" = 1 ] && ok "a manifest with no clips is refused (exit 1)" || bad "empty clips list should exit 1"
run_proof does-not-exist.json proj proof/none-2
[ "$?" = 1 ] && ok "an unreadable manifest is refused (exit 1)" || bad "missing manifest should exit 1"
cat > "$W/noac.json" <<'JSON'
{ "clips": [ { "scenario": "no ac field", "file": "a.webm" } ] }
JSON
run_proof noac.json proj proof/none-3
[ "$?" = 1 ] && ok "a clip without an ac is refused (exit 1)" || bad "clip without ac should exit 1"

echo ""
echo "-- token gate reaches the page path too --"
webm "$W/leaky.webm"; printf 'tok-abc123' >> "$W/leaky.webm"
cat > "$W/leak.json" <<'JSON'
{ "clips": [ { "ac": "leaks a bearer", "file": "leaky.webm" } ] }
JSON
: > "$W/cap/uploads.tsv"
( cd "$W" && CAP="$W/cap" PATH="$W/bin:$PATH" PWPROVE_LEDGER="$W/ledger.jsonl" BEARER='tok-abc123' \
    node "$REPO_ROOT/$S/host-proof.mjs" leak.json proj proof/leak-1 >"$W/out" 2>"$W/err" )
[ "$?" = 6 ] && ok "a clip carrying \$BEARER stops the run (exit 6)" || bad "token gate should exit 6"

echo ""
echo "  proof-page: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
