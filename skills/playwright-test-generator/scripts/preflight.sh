#!/usr/bin/env sh
# preflight.sh - confirm the app is READY before the pipeline drives it (SKILL Step 3).
# One job: a warmup-aware readiness poll. A dead or still-booting origin STOPs here (exit 3) so it fails fast
# instead of throwing opaque errors three steps later.
#
# This script does NOT start a server, mint auth, or recon the DOM. The AGENT owns the server lifecycle (pick
# the port, start THIS worktree dev server in a background shell) - a script-started `dev` can bind a sibling
# worktree WRONG branch. Auth + selector recon happen in the spec/first-run (SKILL Step 3: drive the app OWN
# auth entry; the test run + heal loop validate selectors) - not here.
#
#   BASE_URL=http://localhost:4000 sh preflight.sh
#
#   BASE_URL        required - the server you already started on this worktree resolved port.
#   READY_TIMEOUT   optional - seconds to wait (default 90; a cold dev server first heavy route can compile ~1min).
#   PROBE_HOSTING   optional - set to 1 in PR-mode: also probe the Step-8 watch-link prerequisites (wrangler
#                   auth, Chrome, ffmpeg) NOW, when there is still time to fix them - not after filming.
#                   WARN-only: hosting never blocks readiness; the summary reports HOSTING_READY=yes|no.
set -eu

: "${BASE_URL:?set BASE_URL to the server you already started on this worktree resolved port (see SKILL Step 3)}"
READY_TIMEOUT="${READY_TIMEOUT:-90}"

# --- readiness: poll until the server RESPONDS (warmup-aware) ----------------------------------------------
# A dev server answers 000/connection-refused while booting and 502/503/504 while Nitro/Vite warm the route; ANY
# other code (2xx/3xx/401/403/404) means "up and serving". curl -s, never -f (a 404 still means the server is
# up). macOS has no GNU `timeout` - loop with a counter, never wrap curl in `timeout`.
echo "preflight: waiting for $BASE_URL (up to ${READY_TIMEOUT}s)..." >&2
i=0
while :; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE_URL" 2>/dev/null) || true
  code=${code:-000}   # curl prints 000 on connection-refused; ${:-000} covers curl-not-found (empty)
  case "$code" in
    000|502|503|504) : ;;                                    # booting / warming - keep polling
    *) echo "preflight: ready - HTTP $code after ${i}s" >&2; break ;;
  esac
  i=$((i + 2))
  if [ "$i" -ge "$READY_TIMEOUT" ]; then
    echo "preflight: STOP - $BASE_URL not ready after ${READY_TIMEOUT}s (last HTTP $code). Did the server start on this port?" >&2
    exit 3
  fi
  sleep 2
done

# --- hosting probe (PR-mode: PROBE_HOSTING=1) - WARN-only, never blocks ------------------------------------
# Probe by RUNNING the tool, never by `command -v` alone: npx-provisioned tools (wrangler) are invisible to
# PATH in a non-interactive shell, so `command -v wrangler` false-negatives. The failing probe output printed
# here is the evidence a later `Watch link: skipped - <gate>` report line must paste (SKILL Step 9).
HOSTING_READY=yes
if [ "${PROBE_HOSTING:-0}" = "1" ]; then
  who=$(npx wrangler whoami 2>&1) || true
  if printf '%s' "$who" | grep -qi 'logged in'; then
    echo "preflight: wrangler authenticated" >&2
  else
    HOSTING_READY=no
    echo "preflight: WARN - wrangler not authenticated; the watch link will be skipped unless you \`wrangler login\` now. Probe output:" >&2
    printf '%s\n' "$who" | tail -3 | sed 's/^/preflight:   /' >&2
  fi
  if ! command -v ffmpeg >/dev/null 2>&1; then
    HOSTING_READY=no
    echo "preflight: WARN - ffmpeg not found. record.sh hard-stops without it (poster + contact sheet are the film-QA evidence)." >&2
  fi
  # Chrome is a real binary on PATH or in /Applications - command -v is honest for it (unlike wrangler above).
  if [ ! -d "/Applications/Google Chrome.app" ] && ! command -v google-chrome >/dev/null 2>&1 && ! command -v google-chrome-stable >/dev/null 2>&1; then
    HOSTING_READY=no
    echo "preflight: WARN - Chrome not found; the film falls back to bundled Chromium (no PDF viewer, fewer codecs - inline-PDF/media features film blank)." >&2
  fi
fi

# --- summary (machine-readable) ---------------------------------------------------------------------------
echo "---preflight---"
echo "BASE_URL=$BASE_URL"
echo "READY=yes"
if [ "${PROBE_HOSTING:-0}" = "1" ]; then
  echo "HOSTING_READY=$HOSTING_READY"
fi
