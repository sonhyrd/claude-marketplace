#!/usr/bin/env sh
# record.sh - film ONE generated spec as a watch-link proof: run it through the PROJECT Playwright, locate the
# per-spec video, and enforce the film-QA gate (contact sheet + duration/chapter floors) before any
# watch page exists to publish (SKILL Step 8).
#
# The video comes from a PER-SPEC `test.use({ video: ... })` in the spec itself - NEVER a global
# playwright.config edit (that would film the WHOLE suite on every run). This script does not add that line;
# SKILL Step 8 does, and only for a spec being generated for a watch link.
#
# The AGENT owns the server. record.sh NEVER starts one: an auto-started `dev` can bind a sibling worktree
# WRONG branch (the same lesson baked into preflight.sh). Point BASE_URL at a server you already started.
#
#   BASE_URL=http://localhost:4000 [PROOF_SHA=<commit>] [SCENARIOS=<n>] \
#     sh record.sh <spec-file.spec.ts> [out-name]
#
#   BASE_URL      required - the server you already started on this worktree free port. Exported as BOTH
#                 PLAYWRIGHT_BASE_URL and SPEC_BASE_URL so either repo convention picks it up.
#   PROOF_SHA     optional - the commit under proof. For a localhost target record.sh STOPs unless PROOF_SHA is
#                 an ancestor of HEAD: the worktree must actually be serving the code you claim to prove.
#   SCENARIOS     optional - the approved scenario count. Turns on the film floors: duration >= 4s + 3s/scenario
#                 and chapter count >= SCENARIOS (one titled chapter per scenario). Set it in PR-mode.
#   CONFIG        optional - passed to playwright as --config=<path> (multi-worktree repos whose default config
#                 hard-codes a sibling port/webServer).
#   PROJECT       optional - passed as --project=<name> to scope a config that defines several projects.
#   FILM_TIMEOUT  optional - per-test timeout ms for the film run. Floored at max(FILM_TIMEOUT, 60000 +
#                 60000*SCENARIOS): a film walks every scenario and holds each payoff, so a flat 60000 is far
#                 too tight for a multi-scenario live-backend film (a 5-chapter film needs ~300s; the floor
#                 gives 360s). Pass an explicit FILM_TIMEOUT only to raise it ABOVE the floor.
#   TITLE         optional - names the watch page.
#   PR_URL        optional - linked from the watch page's meta line. Defaults to the current branch's PR via
#                 `gh pr view`; set it explicitly on a detached HEAD or where gh is not authed.
#   <spec>        the ONE spec to film (it must carry the per-spec video use()).
#   [out-name]    label only - echoed in the summary so a caller can tell runs apart (default: spec basename).
#
# Exit 0 ONLY when the spec PASSED, a video exists, and the film-QA gate held. Run from the app repo root.
#   exit 3 = spec failed / no video      exit 4 = provenance STOP
#   exit 5 = film-QA gate (contact sheet / duration floor / chapter floor) - fix the film, re-run;
#            NEVER publish past a 5.
set -eu

SPEC="${1:?usage: BASE_URL=<url> record.sh <spec-file.spec.ts> [out-name]}"
OUT="${2:-$(basename "${SPEC%.*}")}"
: "${BASE_URL:?set BASE_URL to the server you already started on this worktree free port (see SKILL Step 3)}"
# Export both base-URL conventions: stock configs read PLAYWRIGHT_BASE_URL, some repos read SPEC_BASE_URL.
export PLAYWRIGHT_BASE_URL="$BASE_URL"
export SPEC_BASE_URL="$BASE_URL"

# ffmpeg is NOT optional: the contact sheet IS the film-QA evidence (SKILL Step 8 screens the film from it).
# Fail fast BEFORE the slow test run; preflight.sh PROBE_HOSTING=1 warns about this at Step 3.
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "record: STOP - ffmpeg not found. The contact sheet is the film-QA evidence; install ffmpeg and re-run." >&2
  exit 5
fi

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
# only to scope a config that defines several projects; CONFIG=<path> when the default config is wrong for
# this worktree. --timeout raises the per-test ceiling for the film run only (payoff holds + all-scenario walk).
# D4: clear a stale test-results/ so the webm THIS run produces is the only candidate.
rm -rf test-results 2>/dev/null || true

# --retries=0 overrides any project-config retries: a proof film must pass CLEAN on attempt 1 - a flaky film
# is a re-shoot, not a proof. Retries only multiply a failing film's cost by the retry count, and multiple
# attempts each leave a video, making the webm pick below ambiguous (a real run nearly published the FAILED
# attempt's video under RESULT=passed). One attempt = one video = no ambiguity.
# Timeout floor: a multi-scenario live-backend film outlasts the flat 60000 default (the SCENARIOS the caller
# already passes for the chapter floor sizes it). FLOOR = 60000 + 60000*SCENARIOS; an explicit FILM_TIMEOUT
# still wins if it asks for MORE. SCENARIOS defaults to 0, so a no-SCENARIOS run keeps the 60000 floor.
FLOOR=$((60000 + 60000 * ${SCENARIOS:-0}))
TIMEOUT=${FILM_TIMEOUT:-60000}
[ "$FLOOR" -gt "$TIMEOUT" ] && TIMEOUT=$FLOOR

MARKER=$(mktemp)
RC=0
npx --no-install playwright test "$SPEC" ${PROJECT:+--project="$PROJECT"} ${CONFIG:+--config="$CONFIG"} \
  --timeout="$TIMEOUT" --retries=0 --reporter=html --trace retain-on-failure || RC=$?

# --- locate the per-spec video (+ optional chapters sidecar) produced by THIS run --------------------------
# newest webm created after MARKER; sub-second fs mtime (APFS/ext4) keeps -newer honest. chapters.json is the
# film spec's cue sidecar (SKILL Step 8); the chapter floor below makes it mandatory when SCENARIOS is set.
WEBM=$(find test-results -name '*.webm' -newer "$MARKER" 2>/dev/null | head -1 || true)
CH=$(find test-results -name 'chapters.json' -newer "$MARKER" 2>/dev/null | head -1 || true)
rm -f "$MARKER"

if [ "$RC" -eq 0 ] && [ -n "$WEBM" ] && [ -s "$WEBM" ]; then
  # --- film-QA gate (all non-skippable; every failure is exit 5 and names its gate) ------------------------

  # Duration first (the contact sheet's sampling rate derives from it): ffprobe, falling back to a null decode
  # for live-recorded webms that carry no duration metadata (parse the last time= stamp, HH:MM:SS.xx).
  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$WEBM" 2>/dev/null || true)
  case "$DUR" in
    ''|N/A*)
      DUR=$(ffmpeg -nostats -i "$WEBM" -f null - 2>&1 | sed -n 's/.*time=\([0-9:][0-9:.]*\).*/\1/p' | tail -1 |
        awk -F: '{ if (NF==3) print $1*3600+$2*60+$3; else if (NF==2) print $1*60+$2; else print $1 }') ;;
  esac
  DUR_INT=$(awk -v d="${DUR:-0}" 'BEGIN{printf "%d", d+0.5}')

  # Contact sheet: 30 frames spanning the WHOLE film, tiled on one image - the film-QA evidence SKILL Step 8
  # LOOKs at before publishing (blank lead? chapters seekable? payoff on the final tile? feature shown?).
  # Sampling every duration/30s puts the last tile within ~d/30s of the end, so the >=3s payoff hold (SKILL
  # Step 8) guarantees the success frame survives into it. There is no separate poster: the final tile IS the
  # final-frame evidence, and the watch page opens on the video itself.
  CONTACT="${WEBM%.webm}.contact.png"
  SHEET_FPS=$(awk -v d="$DUR_INT" 'BEGIN{ if (d < 1) d = 1; printf "%.6f", 30 / d }')
  if ! ffmpeg -y -i "$WEBM" -vf "fps=${SHEET_FPS},scale=480:-2,tile=5x6" -frames:v 1 "$CONTACT" >/dev/null 2>&1 || [ ! -s "$CONTACT" ]; then
    echo "record: STOP - film-QA gate (contact sheet): could not extract the contact sheet from $WEBM. Re-film, then retry." >&2
    exit 5
  fi

  # Chapters: count + strictly non-decreasing timestamps (a bunched or out-of-order chapter list is unseekable).
  CH_COUNT=0
  if [ -n "$CH" ] && [ -s "$CH" ]; then
    CH_COUNT=$(node -e '
      const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      if (!Array.isArray(c)) process.exit(2);
      for (let i = 1; i < c.length; i++) if (c[i].t < c[i-1].t) process.exit(2);
      console.log(c.length);' "$CH") || {
      echo "record: STOP - film-QA gate (chapters): $CH is malformed or its timestamps go backwards. Fix the film spec's chapter() helper, re-run." >&2
      exit 5
    }
  fi

  # Floors. Absolute: a proof shorter than 4s shows nothing. With SCENARIOS: 4s + 3s per approved scenario,
  # and one titled chapter per scenario - a film that covers fewer scenarios than the spec is a defective proof.
  MIN=4
  if [ -n "${SCENARIOS:-}" ]; then
    MIN=$((4 + 3 * SCENARIOS))
    if [ "$CH_COUNT" -lt "$SCENARIOS" ]; then
      echo "record: STOP - film-QA gate (chapter floor): $CH_COUNT chapter(s) < $SCENARIOS approved scenario(s). One titled chapter per scenario; write the chapters.json sidecar." >&2
      exit 5
    fi
  fi
  if [ "$DUR_INT" -lt "$MIN" ]; then
    echo "record: STOP - film-QA gate (duration floor): ${DUR_INT}s < ${MIN}s (4s + 3s x ${SCENARIOS:-0} scenarios). The film is too short to show every scenario's payoff." >&2
    exit 5
  fi

  # D2: assemble ONE self-contained watch page - webm inlined as a data URI, so the watch link is a
  # single HTML object (title + clickable chapters), not a bare .webm a reviewer opens with no context.
  # ponytail: base64-inlining is fine for a seconds-long proof clip; if clips ever run to many MB, switch to
  # sibling files + a directory upload. The empty/broken-webm guard lives above ([ -s "$WEBM" ] && RC=0), so a
  # page is only ever built around a real, passing video.
  # The film is shot at 1600x900 (SKILL Step 8), so the page must let it PAINT at that size: a column capped
  # at a text-column width downscales the film ~2x and the app's own UI text goes unreadable - the proof stops
  # proving. Layout: 100svh flex column, header + chapter rail fixed, the video takes every remaining pixel
  # (height:100%, width:auto - the intrinsic 16:9 keeps it letterbox-free and scrolls nothing off-screen).
  WATCH="${WEBM%.webm}.watch.html"
  TITLE="${TITLE:-$OUT}"
  # Meta line = what a reviewer needs before hitting play: the PR, the runtime, the scenario count, the spec
  # that produced it. `gh pr view` resolves the current branch's PR; PR_URL overrides (detached HEAD / no gh).
  PR_URL="${PR_URL:-$(gh pr view --json url -q .url 2>/dev/null || true)}"
  DUR_MMSS=$(awk -v d="$DUR_INT" 'BEGIN{printf "%d:%02d", d/60, d%60}')
  CHAPTERS_JSON='[]'
  if [ -n "$CH" ] && [ -s "$CH" ]; then
    CHAPTERS_JSON="$(cat "$CH")"
  fi
  {
    printf '%s' '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'
    printf '%s' "$TITLE"
    printf '%s' '</title><style>:root{color-scheme:dark light}*{box-sizing:border-box}body{margin:0;height:100svh;display:flex;flex-direction:column;gap:14px;padding:18px 24px 20px;font:15px/1.5 system-ui,sans-serif;background:#0b0d10;color:#e6e8eb}header{flex:0 0 auto}h1{font-size:19px;font-weight:600;margin:0 0 2px}.meta{margin:0;font-size:13px;color:#9aa4af;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.meta a{color:#7cc4ff;text-decoration:none}.meta a:hover{text-decoration:underline}.meta code{font:12px/1.5 ui-monospace,monospace;color:#7d8894}.sep{color:#39414a}.stage{flex:1 1 auto;min-height:0;display:flex;justify-content:center}video{height:100%;width:auto;max-width:100%;border-radius:12px;background:#000;box-shadow:0 12px 40px rgba(0,0,0,.5)}ol{flex:0 0 auto;list-style:none;display:flex;gap:8px;overflow-x:auto;margin:0;padding:2px 0}li{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:7px 12px;font-size:13px;white-space:nowrap;border:1px solid #232a31;border-radius:999px;background:#151a1f;cursor:pointer}li:hover{background:#1c232a;border-color:#33404b}li.on{background:#16281d;border-color:#2ec26b;color:#eafff2}li .t{color:#7d8894;font-variant-numeric:tabular-nums}li.on .t{color:#2ec26b}</style></head><body><header><h1>'
    printf '%s' "$TITLE"
    printf '%s' '</h1><p class="meta">'
    if [ -n "$PR_URL" ]; then
      printf '<a href="%s" target="_blank" rel="noopener">View the PR &#8599;</a><span class="sep">&middot;</span>' "$PR_URL"
    fi
    printf '%s<span class="sep">&middot;</span>%s chapters<span class="sep">&middot;</span><code>%s</code>' "$DUR_MMSS" "$CH_COUNT" "$SPEC"
    printf '%s' '</p></header><div class="stage"><video id="v" controls playsinline preload="metadata" src="data:video/webm;base64,'
    base64 < "$WEBM" | tr -d '\n'
    printf '%s' '"></video></div><ol id="ch"></ol><script>const C='
    printf '%s' "$CHAPTERS_JSON"
    printf '%s' ';const v=document.getElementById("v"),ol=document.getElementById("ch");const mmss=s=>Math.floor(s/60)+":"+String(Math.floor(s%60)).padStart(2,"0");const items=C.map(c=>{const li=document.createElement("li");li.innerHTML=`<span class="t">${mmss(c.t)}</span><span>${c.name}</span>`;li.onclick=()=>{v.currentTime=c.t;v.play()};ol.appendChild(li);return li});v.ontimeupdate=()=>{let i=-1;C.forEach((c,n)=>{if(v.currentTime>=c.t-0.15)i=n});items.forEach((li,n)=>li.classList.toggle("on",n===i))};</script></body></html>'
  } > "$WATCH"
  if [ "$CHAPTERS_JSON" = '[]' ]; then CHNOTE='no chapters'; else CHNOTE='with chapters'; fi
  echo "record: watch page -> $WATCH ($CHNOTE)" >&2
  echo "record: LOOK at the contact sheet before publishing (SKILL Step 8): no blank lead, chapters seekable, payoff on the final tile, feature actually shown." >&2

  echo "---record---"
  echo "SPEC=$SPEC"
  echo "OUT=$OUT"
  echo "RESULT=passed"
  echo "WEBM=$WEBM"
  echo "CONTACT=$CONTACT"
  echo "DURATION=${DUR_INT}s"
  echo "CHAPTERS=$CH_COUNT"
  echo "WATCH=$WATCH"
  exit 0
fi

if [ "$RC" -ne 0 ]; then
  echo "record: the proof FAILED - the spec did not pass (see the test output above). No watch link." >&2
  if [ -n "$WEBM" ] && [ -s "$WEBM" ]; then
    echo "record: a failure video is at $WEBM - it shows what broke." >&2
  fi
else
  echo "record: the spec passed but no video was produced. Does it carry the per-spec test.use video block?" >&2
fi
exit 3
