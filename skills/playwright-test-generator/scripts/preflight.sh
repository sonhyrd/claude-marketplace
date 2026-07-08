#!/usr/bin/env sh
# preflight.sh - Step-3 bring-up in one call: confirm the app is READY, mint AUTH, and RECON the target surface.
# Owns the deterministic mechanics the generator otherwise re-derives (and gets wrong) EVERY run: a warmup-aware
# readiness poll, running the project OWN dev-login, and an auth-seeded ARIA snapshot so selectors come from the
# LIVE DOM - never guessed from source (SKILL Step 3). This is what makes Step 3 full-auto instead of "stop and
# ask the user for a URL / credentials".
#
# The AGENT owns the server LIFECYCLE - pick a free port, start THIS worktree dev server in a background shell,
# stop it after. This script NEVER starts or kills a server: a script-started `dev` collides with real dev scripts
# and can bind a sibling worktree WRONG branch (a lesson from spec-proof/record.sh). Point it at a server you
# already started.
#
#   BASE_URL=http://localhost:4000 \
#     [AUTH_CMD="HYRD_DEV_PORT=4000 bash .agents/skills/dev-login/dev-login.sh"] \
#     [BEARER=<token> STORAGE_KEY=<app localStorage key>] \
#     sh preflight.sh [<target-route>]
#
#   BASE_URL            required - the server you already started on this worktree free port.
#   AUTH_CMD            optional - the project login (dev-login, a `setup` script). Run once ready; its stdout is
#                       surfaced with anything token-shaped REDACTED. Use it to mint a token / write .auth/ .
#   BEARER+STORAGE_KEY  optional - seed localStorage[STORAGE_KEY]=BEARER before the snapshot, so a GATED route
#                       renders authed instead of blank (the SAME seed the spec uses - SKILL Auth).
#   <target-route>      optional - path to snapshot (e.g. /en/person/<id>). Omit to just wait + auth.
#
# Run from the app repo root (the recon step resolves `@playwright/test` from the project node_modules). Prints
# a machine-readable summary block, then the ARIA snapshot (roles + accessible names) on stdout.
set -eu

: "${BASE_URL:?set BASE_URL to the server you already started on this worktree free port (see SKILL Step 3)}"
ROUTE="${1:-}"
READY_TIMEOUT="${READY_TIMEOUT:-90}"        # seconds; a cold dev server first heavy route can compile for ~1min
RECON_SETTLE_MS="${RECON_SETTLE_MS:-1500}"  # ponytail: fixed settle before snapshot - a gated SPA needs a beat to
                                            # mount its authed shell; raise it for a heavy route, no concrete
                                            # element to wait on generically.

# --- 1. readiness: poll until the server RESPONDS (warmup-aware) -------------------------------------------
# A dev server answers 000/connection-refused while booting and 502/503/504 while Nitro/Vite warm the route; ANY
# other code (2xx/3xx/401/403/404) means "up and serving" - ready enough to auth + recon. curl -s, never -f (a 404
# still means the server is up). macOS has no GNU `timeout` - loop with a counter, never wrap curl in `timeout`.
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

# --- 2. auth: run the project OWN login, out-of-band (never echo the token) --------------------------------
# dev-login / a setup script mints a fresh token from the admin API and writes .auth/ - the RECREATABLE-from-code
# path the spec depends on (SKILL Auth). Redact anything token-shaped from its stdout before surfacing.
if [ -n "${AUTH_CMD:-}" ]; then
  echo "preflight: minting auth via the project login..." >&2
  auth_out=$(sh -c "$AUTH_CMD" 2>&1) || { echo "preflight: STOP - AUTH_CMD failed:" >&2; echo "$auth_out" >&2; exit 4; }
  echo "$auth_out" | sed -E 's/((token|access_token|Bearer)[=: ]+)[A-Za-z0-9._-]+/\1REDACTED/g' >&2
fi

# --- 3. recon: auth-seeded ARIA snapshot of the target - selectors from the LIVE DOM, not source ----------
if [ -n "$ROUTE" ]; then
  case "$ROUTE" in
    http://*|https://*) URL="$ROUTE" ;;
    /*)                 URL="$BASE_URL$ROUTE" ;;
    *)                  URL="$BASE_URL/$ROUTE" ;;
  esac
  echo "preflight: recon $URL - auth-seeded ARIA snapshot (use these roles/names as selectors; do NOT source-guess)" >&2
  URL="$URL" BEARER="${BEARER:-}" STORAGE_KEY="${STORAGE_KEY:-}" SETTLE="$RECON_SETTLE_MS" node -e '
    const { chromium } = require("@playwright/test");
    (async () => {
      const { BEARER, STORAGE_KEY, URL, SETTLE } = process.env;
      const b = await chromium.launch();
      const p = await b.newPage();
      if (BEARER && STORAGE_KEY) await p.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, BEARER]);
      await p.goto(URL, { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(Number(SETTLE) || 1500);       // let a gated SPA mount its authed shell
      console.log(await p.locator("body").ariaSnapshot());  // roles + accessible names - the selector source
      await b.close();
    })().catch(e => { console.error("preflight: recon failed -", String(e)); process.exit(1); });
  '
fi

# --- 4. summary (machine-readable) -------------------------------------------------------------------------
echo "---preflight---"
echo "BASE_URL=$BASE_URL"
if [ -n "${AUTH_CMD:-}" ]; then echo "AUTH=minted"; else echo "AUTH=none"; fi
if [ -n "$ROUTE" ]; then echo "RECON=$ROUTE"; else echo "RECON=skipped"; fi
