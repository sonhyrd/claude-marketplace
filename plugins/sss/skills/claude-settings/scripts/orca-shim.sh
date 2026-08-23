#!/usr/bin/env bash
# Orca dispatcher for machines where the AppImage owns the name `orca`.
#
# The AppImage install puts its desktop launcher on PATH as `orca` and the CLI
# beside it as `orca-ide`. The launcher accepts every subcommand, prints Electron
# startup noise and answers nothing, so `orca worktree current --json` returns no
# JSON and every skill that shells `orca` concludes Orca is unavailable on a
# machine where Orca is running fine. `orca-ide --help` prints its own usage as
# `orca <command>`: the CLI already believes it owns this name.
#
# Deployed as ~/.local/bin/orca, this routes subcommands to the CLI and keeps a
# bare `orca` launching the desktop app.
#
# Resolution happens at run time, not install time, so an Orca upgrade that moves
# the AppImage cannot leave a dangling exec behind. Subcommands are not
# enumerated: a hardcoded list goes stale on the first release that adds one, so
# anything that is not a bare launch or an AppImage flag is the CLI's.
set -euo pipefail

resolve() {
  local name="$1" self candidate
  self="$(command -v -- "$0" 2>/dev/null || true)"
  for candidate in \
    "/opt/orca/squashfs-root/resources/bin/$name" \
    "$HOME/.local/share/orca/squashfs-root/resources/bin/$name" \
    "/opt/orca/squashfs-root/$name" \
    "$HOME/.local/share/orca/squashfs-root/$name" \
    "/Applications/Orca.app/Contents/Resources/bin/$name" \
    "$(command -v -- "$name" 2>/dev/null || true)"; do
    [ -n "$candidate" ] && [ -x "$candidate" ] || continue
    # Never re-exec this shim: that is an infinite loop, not a fallback.
    [ "$candidate" = "$self" ] && continue
    printf '%s\n' "$candidate"
    return 0
  done
  return 1
}

cli="${ORCA_CLI_BIN:-$(resolve orca-ide || true)}"
app="${ORCA_APPRUN_BIN:-$(resolve AppRun || true)}"

# A bare `orca`, or an AppImage's own flag, is a request for the desktop app.
case "${1-}" in
  "" | --appimage-*) [ -n "$app" ] && exec "$app" "$@" ;;
esac

[ -n "$cli" ] && exec "$cli" "$@"

# No CLI on this machine: hand the arguments to the launcher rather than swallow
# them, so the failure is the one the user would have seen without this shim.
[ -n "$app" ] && exec "$app" "$@"

echo "orca: no Orca CLI or launcher found. Reinstall Orca, or set ORCA_CLI_BIN." >&2
exit 127
