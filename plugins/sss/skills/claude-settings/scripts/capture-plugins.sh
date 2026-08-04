#!/usr/bin/env bash
# Capture the portable plugin roster from this machine into baseline/plugins.json.
#
# Portable = every marketplace whose source is NOT a directory, plus every enabled plugin
# belonging to one of those marketplaces. A directory source carries an absolute path that is
# wrong on every other machine, so it and its plugins stay machine-local.
#
# claude-plugins-official ships with Claude Code and never appears in extraKnownMarketplaces,
# so its plugins have no marketplace entry to filter on. They are portable by definition:
# any name not present in extraKnownMarketplaces is a built-in.
set -euo pipefail

settings="${CLAUDE_SETTINGS:-$HOME/.claude/settings.json}"
out="${1:?usage: capture-plugins.sh <path/to/baseline/plugins.json>}"

[ -r "$settings" ] || { echo "no readable settings at $settings" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

jq '
  (.extraKnownMarketplaces // {}) as $mk
  # names that are machine-local: directory sources only
  | [ $mk | to_entries[] | select(.value.source.source == "directory") | .key ] as $local
  | {
      marketplaces: ( $mk | with_entries(select(.value.source.source != "directory")) ),
      enabledPlugins: (
        (.enabledPlugins // {})
        | with_entries(
            select(
              .value == true
              and ( ((.key | split("@") | last) as $m | $local | index($m)) | not )
            )
          )
      )
    }
' "$settings" > "$out.tmp"

jq -e '.marketplaces and .enabledPlugins' "$out.tmp" > /dev/null
mv "$out.tmp" "$out"

echo "captured $(jq '.marketplaces | length' "$out") marketplaces, $(jq '.enabledPlugins | length' "$out") plugins -> $out"
jq -r '.enabledPlugins | keys[] | "  " + .' "$out"
