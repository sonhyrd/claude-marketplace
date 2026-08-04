#!/usr/bin/env bash
# Install the captured plugin roster onto this machine.
#
# Drives the `claude plugin` CLI rather than writing extraKnownMarketplaces / enabledPlugins
# into settings.json directly. Registering a marketplace by hand-editing settings leaves no
# clone on disk, so the plugin resolves to nothing until something fetches it; the CLI clones,
# validates the manifest and writes both settings keys itself. Both commands are idempotent,
# so re-running this is a no-op on an already-provisioned machine.
#
# Machine-local by design and NOT handled here: directory-sourced marketplaces (this repo).
# Add those by hand — the path differs per machine.
set -euo pipefail

roster="${1:?usage: apply-plugins.sh <path/to/baseline/plugins.json>}"
dry=${DRY_RUN:-0}

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
command -v claude >/dev/null || { echo "the claude CLI is required" >&2; exit 1; }
[ -r "$roster" ] || { echo "no readable roster at $roster" >&2; exit 1; }

run() {
  if [ "$dry" = 1 ]; then echo "DRY: $*"; else "$@"; fi
}

have_mk=$(claude plugin marketplace list 2>/dev/null || true)
have_pl=$(claude plugin list 2>/dev/null || true)

# 1. Marketplaces. Only github sources are captured, so `repo` is always present.
while IFS=$'\t' read -r name repo; do
  [ -n "$name" ] || continue
  if grep -qE "^[[:space:]]*❯[[:space:]]+${name}\$" <<<"$have_mk"; then
    echo "= marketplace $name already registered"
  else
    echo "+ adding marketplace $name ($repo)"
    run claude plugin marketplace add "$repo"
  fi
done < <(jq -r '.marketplaces | to_entries[] | select(.value.source.repo) | [.key, .value.source.repo] | @tsv' "$roster")

# 2. Plugins. A built-in marketplace (claude-plugins-official) needs no add, so this loop
#    covers it even though step 1 never saw it.
while read -r id; do
  [ -n "$id" ] || continue
  if grep -qE "^[[:space:]]*❯[[:space:]]+${id}\$" <<<"$have_pl"; then
    echo "= plugin $id already installed"
  else
    echo "+ installing plugin $id"
    run claude plugin install "$id"
  fi
done < <(jq -r '.enabledPlugins | to_entries[] | select(.value == true) | .key' "$roster")

echo
echo "roster applied. Directory-sourced marketplaces are machine-local and were skipped:"
echo "  claude plugin marketplace add /path/to/claude-marketplace   # then enable sss, matt, e2e"
