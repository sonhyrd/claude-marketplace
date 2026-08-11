#!/usr/bin/env bash
# Chromium shim for machines with no system browser.
#
# web-search resolves a browser by name on PATH and has no Linux default-path
# tier, so a box with only Playwright's cached Chrome fails with "No supported
# browser binary found". Deployed as ~/.local/bin/chromium, this satisfies that
# lookup without touching the vendored skill or setting a machine-local env var.
#
# A real system browser always wins, so this cannot shadow a later apt/brew/snap
# install. Resolution happens at run time, not install time, so a Playwright
# upgrade (chromium-1234 -> chromium-1250) can't leave a dangling exec behind.
set -euo pipefail

for real in \
  /usr/bin/chromium /usr/bin/chromium-browser \
  /usr/bin/google-chrome /usr/bin/google-chrome-stable \
  /opt/google/chrome/chrome /snap/bin/chromium \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"; do
  [ -x "$real" ] && exec "$real" "$@"
done

cache="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
[ -d "$cache" ] || cache="$HOME/Library/Caches/ms-playwright"

# Highest chromium-<rev> wins. chromium_headless_shell-* is deliberately not
# matched: it speaks CDP but cannot run headed, and web-search's daemon may.
newest=$(ls -d "$cache"/chromium-[0-9]* 2>/dev/null | sort -t- -k2 -n | tail -1 || true)
if [ -n "$newest" ]; then
  for bin in \
    "$newest/chrome-linux64/chrome" \
    "$newest/chrome-linux/chrome" \
    "$newest"/chrome-mac*/*.app/Contents/MacOS/*; do
    [ -x "$bin" ] && exec "$bin" "$@"
  done
fi

echo "chromium shim: no system browser, and no Playwright Chrome under $cache" >&2
echo "Install one with: npx playwright install chromium" >&2
exit 127
