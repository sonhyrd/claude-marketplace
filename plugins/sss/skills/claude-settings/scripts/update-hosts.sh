#!/usr/bin/env bash
# Pull the marketplace's plugins onto every Orca-managed host, and report what actually landed.
#
# `sss-marketplace` is a `github` source, so a push reaches another machine only after that
# machine runs `claude plugin marketplace update`. Registration is not a subscription and nothing
# polls; before this script the pass was manual, one Orca terminal per host.
#
# Two properties are the reason this is a script and not a paste-able command:
#
#   - It reports the CLONE COMMIT and the CACHED VERSIONS rather than the CLI's success lines.
#     `claude plugin update` prints success for a plugin whose version did not move, and the cache
#     is keyed on the version — so "updated" and "re-read the same files" are indistinguishable
#     from the exit code. The commit and the version list are the only evidence that separates them.
#   - It installs Node dependencies for any skill shipping a package.json with no node_modules.
#     `web-search` is the one in this roster, and its manifest is at skills/web-search/package.json,
#     NOT at the plugin cache root: pointing npm at the root fails ENOENT on one host and with
#     npm's misleading `Tracker "idealTree" already exists` on another, which reads as a corrupt
#     npm rather than a wrong directory. It also unsets npm_config_* first — an Orca terminal
#     inherits them, and a nested npm install fails on the same idealTree error.
#
# Read-only unless a host is out of date; safe to re-run. A host that is already current does
# nothing but re-print its commit and versions.
set -euo pipefail

roster="${1:?usage: update-hosts.sh <path/to/baseline/plugins.json> [host ...]}"
shift || true
only_hosts=("$@")
dry=${DRY_RUN:-0}
timeout_ms=${ORCA_TIMEOUT_MS:-300000}

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
[ -r "$roster" ] || { echo "no readable roster at $roster" >&2; exit 1; }

# Resolve the Orca CLI the way the orca-cli skill does. Never bare `orca` on Linux outside an
# Orca terminal: there it is normally the GNOME Orca screen reader and starts speech on the box.
if [ -n "${ORCA_CLI_COMMAND:-}" ]; then ORCA="$ORCA_CLI_COMMAND"
elif [ "$(uname -s)" = "Linux" ] && command -v orca-ide >/dev/null; then ORCA="orca-ide"
else ORCA="orca"; fi
command -v "$ORCA" >/dev/null || { echo "no Orca CLI ($ORCA) on PATH" >&2; exit 1; }

# The marketplace and its plugins come from the roster, so adding a plugin to the baseline is
# the only edit needed to have every host pick it up.
mkt=$(jq -r '.marketplaces | keys[] | select(. == "sss-marketplace")' "$roster")
[ -n "$mkt" ] || { echo "sss-marketplace is not a portable entry in $roster" >&2; exit 1; }
repo=$(jq -r --arg m "$mkt" '.marketplaces[$m].source.repo // empty' "$roster")
[ -n "$repo" ] || { echo "$mkt has no github repo in $roster; nothing to pull from" >&2; exit 1; }
plugins=$(jq -r --arg m "$mkt" '.enabledPlugins | keys[] | select(endswith("@" + $m)) | sub("@.*";"")' "$roster")
[ -n "$plugins" ] || { echo "no enabled plugins for $mkt in $roster" >&2; exit 1; }

echo "marketplace $mkt <- $repo"
echo "plugins: $(echo "$plugins" | tr '\n' ' ')"

# The remote payload. Built once and reused per host; it decides for itself whether the host
# needs the one-time swap off a directory source or just an update.
remote_script() {
  cat <<EOF
set -u
mkt=$mkt; repo=$repo
plugins="$(echo "$plugins" | tr '\n' ' ')"
if claude plugin marketplace list 2>/dev/null | grep -A1 "\$mkt\$" | grep -q "Source: Directory"; then
  echo "--- swapping \$mkt off its directory source"
  claude plugin marketplace remove "\$mkt" || true
  claude plugin marketplace add "\$repo" || echo "!! marketplace add failed"
  for p in \$plugins; do claude plugin install "\$p@\$mkt" >/dev/null || echo "!! install \$p failed"; done
else
  claude plugin marketplace update "\$mkt" >/dev/null || echo "!! marketplace update failed"
  for p in \$plugins; do claude plugin update "\$p@\$mkt" >/dev/null 2>&1 || claude plugin install "\$p@\$mkt" >/dev/null || echo "!! update \$p failed"; done
fi
echo "---COMMIT---"
git -C ~/.claude/plugins/marketplaces/\$mkt log --oneline -1 2>&1 || echo "!! no marketplace clone"
echo "---VERSIONS---"
ls -d ~/.claude/plugins/cache/\$mkt/*/*/ 2>/dev/null | sed "s|.*/cache/\$mkt/||;s|/\$||" || echo "!! no cache"
echo "---DEPS---"
for m in ~/.claude/plugins/cache/\$mkt/*/*/skills/*/package.json; do
  [ -e "\$m" ] || continue
  d=\$(dirname "\$m")
  [ -d "\$d/node_modules" ] && continue
  echo "installing deps: \$(basename \$d)"
  ( cd "\$d"; for v in \$(env | grep -o "^npm_[^=]*"); do unset "\$v"; done
    npm install --no-audit --no-fund >/dev/null 2>&1 && echo "ok: \$(basename \$d)" || echo "!! npm install failed: \$(basename \$d)" )
done
echo "---DONE---"
EOF
}

hosts=$("$ORCA" host list --json 2>/dev/null \
  | jq -r '.result.hosts[] | select(.kind == "environment") | .name')
[ -n "$hosts" ] || { echo "no Orca environments to update" >&2; exit 1; }

failed=0
for host in $hosts; do
  if [ ${#only_hosts[@]} -gt 0 ]; then
    case " ${only_hosts[*]} " in *" $host "*) ;; *) continue ;; esac
  fi
  echo
  echo "=== $host ==="

  # A remote terminal needs a worktree selector; any ready one will do, because every command
  # here is host-global rather than repo-scoped.
  wt=$("$ORCA" worktree list --environment "$host" --json 2>/dev/null \
    | jq -r '[.result.worktrees[]? | select(.isArchived != true)][0].id // empty')
  if [ -z "$wt" ]; then
    echo "!! no worktree on $host to open a terminal in; skipped"
    failed=1; continue
  fi

  if [ "$dry" = 1 ]; then echo "DRY: would run the update in worktree $wt"; continue; fi

  # The payload travels base64-encoded. It is a multi-line script and --command takes a single
  # string, so every quoting scheme that tries to keep the newlines — printf %q included — hands
  # the CLI something it word-splits into an unrunnable command and then blocks on: no terminal
  # is created, no handle comes back, and nothing times out. Encoding sidesteps the question,
  # because what crosses the wire has no quotes, newlines or $ in it at all.
  payload=$(remote_script | base64 | tr -d '\n')
  handle=$("$ORCA" terminal create --environment "$host" --worktree "id:$wt" \
    --title "mkt-update" --command "bash -lc 'echo $payload | base64 -d | bash'" --json 2>/dev/null \
    | jq -r '.result.terminal.handle // empty')
  if [ -z "$handle" ]; then echo "!! could not open a terminal on $host"; failed=1; continue; fi

  # Poll for the payload's own end marker rather than `terminal wait --for exit`. The remote
  # command finishing does not exit the pty — the shell returns to its prompt and stays alive —
  # so `--for exit` waits out its whole timeout on a run that succeeded in seconds, and a script
  # built on it looks hung rather than slow. The marker is the only signal that the work is done.
  deadline=$(( $(date +%s) + timeout_ms / 1000 ))
  out=""
  while :; do
    out=$("$ORCA" terminal read --environment "$host" --terminal "$handle" --json 2>/dev/null \
      | jq -r '.result.terminal.tail[]?')
    case "$out" in *---DONE---*) break ;; esac
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "!! $host did not finish within ${timeout_ms}ms; partial output follows"
      failed=1; break
    fi
    sleep 3
  done
  printf '%s\n' "$out" | sed '1d'
  "$ORCA" terminal close --environment "$host" --terminal "$handle" --tab --json >/dev/null 2>&1 || true
done

echo
if [ "$failed" = 1 ]; then
  echo "at least one host was skipped or failed; see the ! lines above" >&2
  exit 1
fi
echo "Each host needs a Claude Code restart there before refreshed skills load."
