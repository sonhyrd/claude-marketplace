#!/usr/bin/env bash
# Install the captured plugin roster onto this machine.
#
# Drives the `claude plugin` CLI rather than writing extraKnownMarketplaces / enabledPlugins
# into settings.json directly. Registering a marketplace by hand-editing settings leaves no
# clone on disk, so the plugin resolves to nothing until something fetches it; the CLI clones,
# validates the manifest and writes both settings keys itself. Both commands are idempotent,
# so re-running this is a no-op on an already-provisioned machine.
#
# Directory-sourced marketplaces (this repo) are handled too, in step 3. Only their PATH is
# machine-local; the plugin names behind them are not, so the roster carries the names and this
# script resolves the path once. See resolve_local_path for the order it tries.
set -euo pipefail

roster="${1:?usage: apply-plugins.sh <path/to/baseline/plugins.json>}"
dry=${DRY_RUN:-0}
settings="${CLAUDE_SETTINGS:-$HOME/.claude/settings.json}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
command -v claude >/dev/null || { echo "the claude CLI is required" >&2; exit 1; }
[ -r "$roster" ] || { echo "no readable roster at $roster" >&2; exit 1; }

run() {
  if [ "$dry" = 1 ]; then echo "DRY: $*"; else "$@"; fi
}

# One plugin that will not install must not take the rest of the roster with it. Under `set -e` a
# single failure aborted the run mid-list, silently skipping every plugin after it — which reads as
# a crash, not as a report, and leaves the operator to work out which half of the list is missing.
# Collect and carry on; the exit code at the end still tells the truth.
failures=()
attempt() {
  local what="$1"; shift
  if run "$@"; then return 0; fi
  echo "! $what failed — continuing with the rest of the roster"
  failures+=("$what")
}

# Where does directory-sourced marketplace $1 live on THIS machine? Prints nothing and returns
# 1 when it cannot be answered, which is the normal state of a machine that has never had it.
resolve_local_path() {
  local name="$1" env_var candidate

  # 1. Explicit override, for a checkout in a non-obvious place.
  env_var="SSS_MARKETPLACE_PATH"
  if [ -n "${!env_var:-}" ]; then printf '%s\n' "${!env_var}"; return 0; fi

  # 2. Already registered here — settings holds the answer from the last time it was added.
  if [ -r "$settings" ]; then
    candidate=$(jq -r --arg n "$name" \
      '.extraKnownMarketplaces[$n].source.path // empty' "$settings" 2>/dev/null || true)
    if [ -n "$candidate" ] && [ -d "$candidate" ]; then printf '%s\n' "$candidate"; return 0; fi
  fi

  # 3. This script is itself in the marketplace. When it runs from a checkout rather than from
  #    the versioned plugin cache, the repo containing it IS the marketplace — so a fresh clone
  #    can bootstrap with no path typed anywhere.
  if candidate=$(git -C "$script_dir" rev-parse --show-toplevel 2>/dev/null); then
    if [ "$(jq -r '.name // empty' "$candidate/.claude-plugin/marketplace.json" 2>/dev/null)" = "$name" ]; then
      printf '%s\n' "$candidate"; return 0
    fi
  fi

  return 1
}

# A vendored skill can ship a package.json with no node_modules and no lockfile — installing the
# plugin then leaves a skill that fails on first call. Install deps for any skill in $1 that is
# in that state. Silent no-op for the plugins that carry no package.json, which is most of them.
ensure_skill_deps() {
  local root="$1" pkg dir mgr
  command -v bun >/dev/null && mgr=bun || { command -v npm >/dev/null && mgr=npm || return 0; }
  while IFS= read -r pkg; do
    dir="$(dirname "$pkg")"
    [ -d "$dir/node_modules" ] && continue
    echo "+ installing dependencies for $(basename "$dir") ($mgr)"
    attempt "deps for $(basename "$dir")" bash -c "cd \"\$1\" && $mgr install" _ "$dir"
  done < <(find "$root" -name package.json -not -path '*/node_modules/*' 2>/dev/null)
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
    attempt "marketplace $name" claude plugin marketplace add "$repo"
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
    attempt "$id" claude plugin install "$id"
  fi
done < <(jq -r '.enabledPlugins | to_entries[] | select(.value == true) | .key' "$roster")

# 3. Directory-sourced marketplaces. The roster carries the plugin names; the path is resolved
#    per machine. Unresolvable is not an error — it is a machine that has never had this repo,
#    and the only thing missing is one path the user has to supply.
unresolved=0
while IFS= read -r mk; do
  [ -n "$mk" ] || continue
  if ! path=$(resolve_local_path "$mk"); then
    unresolved=1
    echo "! marketplace $mk not resolvable on this machine — skipping its plugins:"
    jq -r --arg m "$mk" '.localMarketplaces[$m][] | "    " + . + "@" + $m' "$roster"
    continue
  fi

  if grep -qE "^[[:space:]]*❯[[:space:]]+${mk}\$" <<<"$have_mk"; then
    echo "= marketplace $mk already registered ($path)"
  else
    echo "+ adding marketplace $mk ($path)"
    attempt "marketplace $mk" claude plugin marketplace add "$path"
  fi

  while read -r plugin; do
    [ -n "$plugin" ] || continue
    id="$plugin@$mk"
    if grep -qE "^[[:space:]]*❯[[:space:]]+${id}\$" <<<"$have_pl"; then
      echo "= plugin $id already installed"
    else
      echo "+ installing plugin $id"
      attempt "$id" claude plugin install "$id"
    fi
    # Only ever look inside a cache dir that exists — a dry run installed nothing.
    for cached in "$HOME/.claude/plugins/cache/$mk/$plugin"/*/; do
      [ -d "$cached" ] && ensure_skill_deps "$cached"
    done
  done < <(jq -r --arg m "$mk" '.localMarketplaces[$m][]' "$roster")
done < <(jq -r '.localMarketplaces // {} | keys[]' "$roster")

echo
if [ "$unresolved" = 1 ]; then
  echo "roster applied, minus the directory-sourced plugins listed above. To finish:"
  echo "  SSS_MARKETPLACE_PATH=/path/to/claude-marketplace $0 $roster"
elif [ ${#failures[@]} -eq 0 ]; then
  echo "roster applied."
fi

# A plugin whose marketplace entry declares its own `github` source is fetched by a SECOND clone,
# separate from the marketplace's. On a host with no working SSH to GitHub that clone can fail
# ("ssh: not found", or a key that GitHub rejects) while every `"source": "./"` plugin around it
# installs fine, because those are served from the already-cloned marketplace. There is no reliable
# preflight for it — `command -v ssh` passes on a box that has ssh but no key — so the remedy is
# offered here, after the fact. CLAUDE_CODE_PLUGIN_PREFER_HTTPS makes the CLI skip the SSH probe
# entirely and clone over HTTPS; it is machine-local (it states that THIS host has no usable SSH),
# so it belongs in that host's settings.json env, not in the shared baseline.
if [ ${#failures[@]} -gt 0 ]; then
  echo "roster applied with ${#failures[@]} failure(s):"
  printf '  ! %s\n' "${failures[@]}"
  echo
  echo "If any of those failed to clone, this host has no usable SSH to GitHub. Retry with:"
  echo "  CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1 $0 $roster"
  echo "and if that fixes it, make it stick by adding to ~/.claude/settings.json:"
  echo '  "env": { "CLAUDE_CODE_PLUGIN_PREFER_HTTPS": "1" }'
  exit 1
fi
