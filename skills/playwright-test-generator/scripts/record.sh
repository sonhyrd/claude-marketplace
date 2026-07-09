#!/usr/bin/env sh
# record.sh - film ONE generated spec as a watch-link proof: run it through the PROJECT Playwright, locate the
# per-spec video, and extract a poster thumbnail of the final frame (SKILL Step 8).
#
# The video comes from a PER-SPEC `test.use({ video: 'on' })` in the spec itself - NEVER a global
# playwright.config edit (that would film the WHOLE suite on every run). This script does not add that line;
# SKILL Step 8 does, and only for a spec being generated for a watch link.
#
# The AGENT owns the server. record.sh NEVER starts one: an auto-started `dev` can bind a sibling worktree
# WRONG branch (the same lesson baked into preflight.sh). Point BASE_URL at a server you already started.
#
#   BASE_URL=http://localhost:4000 [PROOF_SHA=<commit>] \
#     sh record.sh <spec-file.spec.ts> [out-name]
#
#   BASE_URL   required - the server you already started on this worktree free port.
#   PROOF_SHA  optional - the commit under proof. For a localhost target record.sh STOPs unless PROOF_SHA is an
#              ancestor of HEAD: the worktree must actually be serving the code you claim to prove.
#   <spec>     the ONE spec to film (it must carry `test.use({ video: 'on' })`).
#   [out-name] label only - echoed in the summary so a caller can tell runs apart (default: the spec basename).
#
# Exit 0 ONLY when the spec PASSED and a video exists. Run from the app repo root (project-local Playwright).
set -eu

SPEC="${1:?usage: BASE_URL=<url> record.sh <spec-file.spec.ts> [out-name]}"
OUT="${2:-$(basename "${SPEC%.*}")}"
: "${BASE_URL:?set BASE_URL to the server you already started on this worktree free port (see SKILL Step 3)}"
export PLAYWRIGHT_BASE_URL="$BASE_URL"   # project configs that read process.env.PLAYWRIGHT_BASE_URL pick this up

# --- provenance: for a localhost target, prove the worktree actually serves the code under proof -----------
case "$BASE_URL" in
  *://localhost*|*://127.0.0.1*|*://0.0.0.0*|*://\[::1\]*)
    if [ -n "${PROOF_SHA:-}" ] && ! git merge-base --is-ancestor "$PROOF_SHA" HEAD 2>/dev/null; then
      echo "record: STOP - the change under proof ($PROOF_SHA) is NOT an ancestor of HEAD ($(git rev-parse --short HEAD 2>/dev/null))." >&2
      echo "        The worktree lacks the code, so the server you own cannot be serving it. Check out the branch, then re-run." >&2
      exit 4
    fi ;;
esac

# --- run the ONE spec through the PROJECT Playwright (never auto-install; per-spec video does the filming) --
# Marker (not spec mtime) is the "newer than" reference: robust if the spec was written seconds before the run.
# Browser + channel for the film come from the spec's own test.use({ channel: 'chrome' }) (SKILL Step 8) - do
# NOT force --project here (it can pin the bundled browser and blank an inline-PDF frame). Pass PROJECT=<name>
# only to scope a config that defines several projects.
# D4: clear a stale test-results/ so the webm THIS run produces is the only candidate. Without it a retry
# (`--trace on-first-retry` leaves the failed attempt's video too) makes the "newest webm" pick below ambiguous
# and it could grab the wrong attempt - the fix the old "delete stale test-results/" comment only advised.
rm -rf test-results 2>/dev/null || true

MARKER=$(mktemp)
RC=0
npx --no-install playwright test "$SPEC" ${PROJECT:+--project="$PROJECT"} --reporter=html --trace on-first-retry || RC=$?

# --- locate the per-spec video (+ optional chapters sidecar) produced by THIS run --------------------------
# newest webm created after MARKER; sub-second fs mtime (APFS/ext4) keeps -newer honest. chapters.json is the
# film spec's optional cue sidecar (SKILL Step 8) - absent is fine, the watch page just omits the chapter list.
WEBM=$(find test-results -name '*.webm' -newer "$MARKER" 2>/dev/null | head -1 || true)
CH=$(find test-results -name 'chapters.json' -newer "$MARKER" 2>/dev/null | head -1 || true)
rm -f "$MARKER"

if [ "$RC" -eq 0 ] && [ -n "$WEBM" ] && [ -s "$WEBM" ]; then
  # Poster thumbnail from the held final frame (a proof still for the watch link).
  POSTER="${WEBM%.webm}.png"
  if command -v ffmpeg >/dev/null 2>&1; then
    ffmpeg -y -sseof -0.3 -i "$WEBM" -frames:v 1 -update 1 "$POSTER" >/dev/null 2>&1 \
      && echo "record: poster -> $POSTER (thumbnail of the final proven frame)" >&2 \
      || { POSTER=""; echo "record: NOTE - could not extract a poster from $WEBM" >&2; }
  else
    POSTER=""
    echo "record: NOTE - ffmpeg not found; no poster thumbnail." >&2
  fi

  # D2: assemble ONE self-contained watch page - webm + poster inline as data URIs, so the watch link is a
  # single HTML object (title + poster + clickable chapters), not a bare .webm a reviewer opens with no context.
  # ponytail: base64-inlining is fine for a seconds-long proof clip; if clips ever run to many MB, switch to
  # sibling files + a directory upload. The empty/broken-webm guard lives above ([ -s "$WEBM" ] && RC=0), so a
  # page is only ever built around a real, passing video.
  WATCH="${WEBM%.webm}.watch.html"
  TITLE="${TITLE:-$OUT}"
  SHA="$(git rev-parse --short HEAD 2>/dev/null || echo '')"
  CHAPTERS_JSON='[]'
  [ -n "$CH" ] && [ -s "$CH" ] && CHAPTERS_JSON="$(cat "$CH")"
  {
    printf '%s' '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'
    printf '%s' "$TITLE"
    printf '%s' '</title><style>:root{color-scheme:dark light}body{margin:0;font:15px/1.5 system-ui,sans-serif;background:#0b0d10;color:#e6e8eb;display:flex;justify-content:center}main{width:100%;max-width:920px;padding:24px}h1{font-size:20px;margin:0 0 4px}.meta{color:#9aa4af;margin:0 0 16px;font-size:13px}.ok{color:#2ec26b;font-weight:600}video{width:100%;border-radius:10px;background:#000}ol{list-style:none;padding:0;margin:16px 0 0}li{padding:8px 12px;border-radius:8px;cursor:pointer;display:flex;gap:12px}li:hover{background:#151a1f}li .t{color:#7d8894;font-variant-numeric:tabular-nums;min-width:44px}</style></head><body><main><h1>'
    printf '%s' "$TITLE"
    printf '%s' '</h1><p class="meta">'
    [ -n "$SHA" ] && printf 'SHA %s &middot; ' "$SHA"
    printf '%s' '<span class="ok">passed &check;</span></p><video id="v" controls playsinline'
    if [ -n "$POSTER" ] && [ -s "$POSTER" ]; then
      printf '%s' ' poster="data:image/png;base64,'
      base64 < "$POSTER" | tr -d '\n'
      printf '%s' '"'
    fi
    printf '%s' ' src="data:video/webm;base64,'
    base64 < "$WEBM" | tr -d '\n'
    printf '%s' '"></video><ol id="ch"></ol><script>const C='
    printf '%s' "$CHAPTERS_JSON"
    printf '%s' ';const v=document.getElementById("v"),ol=document.getElementById("ch");const mmss=s=>Math.floor(s/60)+":"+String(Math.floor(s%60)).padStart(2,"0");C.forEach(c=>{const li=document.createElement("li");li.innerHTML=`<span class="t">${mmss(c.t)}</span><span>${c.name}</span>`;li.onclick=()=>{v.currentTime=c.t;v.play()};ol.appendChild(li)});</script></main></body></html>'
  } > "$WATCH"
  [ "$CHAPTERS_JSON" = '[]' ] && CHNOTE='no chapters' || CHNOTE='with chapters'
  echo "record: watch page -> $WATCH ($CHNOTE)" >&2

  echo "---record---"
  echo "SPEC=$SPEC"
  echo "OUT=$OUT"
  echo "RESULT=passed"
  echo "WEBM=$WEBM"
  echo "POSTER=${POSTER:-none}"
  echo "WATCH=$WATCH"
  exit 0
fi

if [ "$RC" -ne 0 ]; then
  echo "record: the proof FAILED - the spec did not pass (see the test output above). No watch link." >&2
  [ -n "$WEBM" ] && [ -s "$WEBM" ] && echo "record: a failure video is at $WEBM - it shows what broke." >&2
else
  echo "record: the spec passed but no video was produced. Does it carry \`test.use({ video: 'on' })\` at the top?" >&2
fi
exit 3
