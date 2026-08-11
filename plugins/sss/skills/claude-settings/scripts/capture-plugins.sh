#!/usr/bin/env bash
# Capture the portable plugin roster from this machine into baseline/plugins.json.
#
# Portable = every marketplace whose source is NOT a directory, plus every enabled plugin
# belonging to one of those marketplaces. A directory source carries an absolute path that is
# wrong on every other machine, so the path stays machine-local.
#
# The PLUGIN NAMES behind a directory source are portable even though the path is not, so they
# are captured too, under localMarketplaces: {"<marketplace>": ["plugin", ...]}. Apply resolves
# the path once per machine and installs them. Without this the roster silently stopped at the
# marketplace boundary and a new machine came up missing sss, matt, e2e and web-search.
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
  | [ (.enabledPlugins // {}) | to_entries[] | select(.value == true) | .key ] as $on
  | {
      # Enabled-only, and that governs marketplaces too: a registered marketplace with nothing
      # enabled from it is an evaluation leftover, and carrying it would make every other
      # machine clone a third-party repo for no plugin.
      marketplaces: (
        $mk
        | with_entries(
            .key as $name
            | select(
                .value.source.source != "directory"
                and ( [ $on[] | select((split("@") | last) == $name) ] | length > 0 )
              )
          )
      ),
      enabledPlugins: (
        (.enabledPlugins // {})
        | with_entries(
            select(
              .value == true
              and ( ((.key | split("@") | last) as $m | $local | index($m)) | not )
            )
          )
      ),
      # Directory sources: names only, never the path. Apply resolves the path per machine.
      localMarketplaces: (
        reduce $local[] as $m ({};
          .[$m] = ([ $on[] | select((split("@") | last) == $m) | split("@") | first ] | sort)
        )
      )
    }
' "$settings" > "$out.tmp"

jq -e '.marketplaces and .enabledPlugins and .localMarketplaces' "$out.tmp" > /dev/null
mv "$out.tmp" "$out"

echo "captured $(jq '.marketplaces | length' "$out") marketplaces, $(jq '.enabledPlugins | length' "$out") plugins -> $out"
jq -r '.enabledPlugins | keys[] | "  " + .' "$out"
jq -r '.localMarketplaces | to_entries[] | .key as $m | .value[] | "  " + . + "@" + $m + " (local)"' "$out"
