#!/usr/bin/env bash
# Symlink the 4 e2e-skills from this repo straight into the agent skill dirs,
# so the runtime ALWAYS reflects the repo working tree — zero staleness, no
# reinstall on every edit. Direct filesystem symlinks, NOT the `skills` CLI:
# the CLI copies files into its own store (~/.agents/skills as a real dir) and
# only symlinks per-agent dirs to that copy, so it still drifts — a --copy
# install once shipped the old shell record.sh long after HEAD ported it to
# record.mjs, and a live session kept emitting the old watch.html format.
#
# Overrides:
#   E2E_SKILLS_DIRS  space-separated target skill dirs
#                    (default: "$HOME/.claude/skills $HOME/.agents/skills")

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SKILLS=(cypress-debugger e2e-reviewer playwright-debugger playwright-test-generator)

if [ -n "${E2E_SKILLS_DIRS:-}" ]; then
  # shellcheck disable=SC2206
  TARGET_DIRS=($E2E_SKILLS_DIRS)
else
  TARGET_DIRS=("$HOME/.claude/skills" "$HOME/.agents/skills")
fi

for dir in "${TARGET_DIRS[@]}"; do
  mkdir -p "$dir"
  for s in "${SKILLS[@]}"; do
    rm -rf "$dir/$s"                          # drop any prior copy or symlink
    ln -sfn "$REPO_ROOT/skills/$s" "$dir/$s"
    echo "symlinked $dir/$s -> $REPO_ROOT/skills/$s"
  done
done
