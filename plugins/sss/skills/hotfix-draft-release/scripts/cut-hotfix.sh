#!/usr/bin/env bash
# cut-hotfix.sh — pick from the PRs merged since the last release, then ship the chosen
# ones as an isolated hotfix: cherry-pick them onto the last published release tag, tag the
# next patch version, and create a GitHub *draft* release. Never publishes.
#
# Two modes:
#   --list                 show the release-candidate PRs (everything merged into the default
#                          branch since the last release) so a human can pick which to hotfix.
#   --pr N [--pr M ...]     cut the draft hotfix release from the chosen PRs.
#
# Why a script (not ad-hoc commands): this sequence is easy to get wrong in ways that touch a
# shared remote. Guards baked in: `set -euo pipefail` so a failed step NEVER cascades into
# pushing a bad tag; branch name `hotfix-vX.Y.Z` (hyphen sibling) so it can't collide with an
# existing `hotfix` branch; the diff vs the base is printed for review before you trust the tag;
# and the release is always `--draft` — a human reviews and clicks Publish.
#
# usage:
#   cut-hotfix.sh --list [--base vX.Y.Z]
#   cut-hotfix.sh --pr 347 [--pr 349 ...] [--base vX.Y.Z] [--version vX.Y.Z] [--notes FILE] [--remote origin]
#
#   --base     last released tag to branch from / compare against. Default: latest non-draft release.
#   --version  new tag. Default: --base with the patch number +1.
#   --notes    release-notes file. Default: auto-built from the chosen PR titles (hotfix PRs only).
#   --remote   git remote. Default: origin.
set -euo pipefail

REMOTE="origin"; BASE=""; VERSION=""; NOTES_FILE=""; LIST=0; PRS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --list) LIST=1; shift;;
    --pr) PRS+=("$2"); shift 2;;
    --base) BASE="$2"; shift 2;;
    --version) VERSION="$2"; shift 2;;
    --notes) NOTES_FILE="$2"; shift 2;;
    --remote) REMOTE="$2"; shift 2;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done
if [ "$LIST" -eq 0 ] && [ ${#PRS[@]} -eq 0 ]; then
  echo "error: pass --list to see candidates, or --pr <number> (repeatable) to cut a hotfix" >&2; exit 2
fi

# ── shared preconditions ────────────────────────────────────────────────────
command -v gh >/dev/null || { echo "error: gh CLI not found" >&2; exit 1; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "error: not a git repo" >&2; exit 1; }

echo "→ fetching $REMOTE (branches + tags)…" >&2
git fetch --quiet --tags "$REMOTE"

DEFAULT_BRANCH="$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name 2>/dev/null || echo main)"

# default base = latest published release
if [ -z "$BASE" ]; then
  BASE="$(gh release view --json tagName --jq .tagName 2>/dev/null || true)"
  [ -n "$BASE" ] || { echo "error: could not auto-detect latest release; pass --base <tag>" >&2; exit 1; }
  echo "→ base (latest release): $BASE" >&2
fi
git rev-parse -q --verify "refs/tags/$BASE^{commit}" >/dev/null \
  || { echo "error: base tag $BASE not found locally (try: git fetch --tags $REMOTE)" >&2; exit 1; }

# ── --list: show release-candidate PRs (merged into default branch since BASE) ──
if [ "$LIST" -eq 1 ]; then
  range_file="$(mktemp)"; trap 'rm -f "$range_file"' EXIT
  git rev-list "$BASE..$REMOTE/$DEFAULT_BRANCH" > "$range_file"
  echo
  echo "## Merged into $DEFAULT_BRANCH since $BASE (release candidates)"
  echo
  found=0
  while IFS=$'\t' read -r _ num login title; do
    printf '  #%-6s %s  (@%s)\n' "$num" "$title" "$login"; found=1
  done < <(
    gh pr list --state merged --base "$DEFAULT_BRANCH" --limit 200 \
      --json number,title,author,mergeCommit,mergedAt \
      --jq '.[] | select(.mergeCommit.oid != null)
            | [.mergeCommit.oid, .mergedAt, (.number|tostring), (.author.login // "?"), .title] | @tsv' \
    | while IFS=$'\t' read -r oid mergedAt num login title; do
        grep -qx "$oid" "$range_file" && printf '%s\t%s\t%s\t%s\n' "$mergedAt" "$num" "$login" "$title"
      done | sort
  )
  [ "$found" -eq 1 ] || echo "  (nothing merged since $BASE)"
  echo
  echo "Pick the ones to hotfix, then:"
  echo "  cut-hotfix.sh --pr <n> [--pr <m> ...]"
  exit 0
fi

# ── cut path: needs a clean tree ────────────────────────────────────────────
if ! { git diff --quiet && git diff --cached --quiet; }; then
  echo "error: working tree is dirty — commit or stash first (a botched run here is how bad tags get pushed)" >&2; exit 1
fi

# default version = base patch + 1
if [ -z "$VERSION" ]; then
  case "$BASE" in
    v[0-9]*.[0-9]*.[0-9]*)
      core="${BASE#v}"; major="${core%%.*}"; rest="${core#*.}"; minor="${rest%%.*}"; patch="${rest#*.}"
      [[ "$patch" =~ ^[0-9]+$ ]] || { echo "error: cannot auto-bump $BASE; pass --version" >&2; exit 1; }
      VERSION="v${major}.${minor}.$((patch + 1))";;
    *) echo "error: base $BASE is not vMAJOR.MINOR.PATCH; pass --version explicitly" >&2; exit 1;;
  esac
  echo "→ version (auto-bumped): $VERSION"
fi

# version must not already exist (local, remote, or as a draft)
if git rev-parse -q --verify "refs/tags/$VERSION" >/dev/null \
   || git ls-remote --exit-code --tags "$REMOTE" "$VERSION" >/dev/null 2>&1 \
   || gh release view "$VERSION" >/dev/null 2>&1; then
  echo "error: $VERSION already exists (tag or release). Pick a fresh version or delete the old one." >&2; exit 1
fi
BRANCH="hotfix-$VERSION"
git rev-parse -q --verify "refs/heads/$BRANCH" >/dev/null 2>&1 \
  && { echo "error: branch $BRANCH already exists locally — delete it or pick another version" >&2; exit 1; }

# ── resolve PR merge commits ────────────────────────────────────────────────
OIDS=(); TITLES=()
for pr in "${PRS[@]}"; do
  state="$(gh pr view "$pr" --json state --jq .state 2>/dev/null || true)"
  [ "$state" = "MERGED" ] || { echo "error: PR #$pr is not merged (state=$state)" >&2; exit 1; }
  oid="$(gh pr view "$pr" --json mergeCommit --jq '.mergeCommit.oid // empty')"
  [ -n "$oid" ] || { echo "error: PR #$pr has no mergeCommit" >&2; exit 1; }
  git cat-file -e "$oid^{commit}" 2>/dev/null || git fetch --quiet "$REMOTE" "$oid" 2>/dev/null || true
  git cat-file -e "$oid^{commit}" 2>/dev/null || { echo "error: merge commit $oid for PR #$pr not reachable" >&2; exit 1; }
  OIDS+=("$oid"); TITLES+=("$(gh pr view "$pr" --json title --jq .title)")
  echo "→ PR #$pr → $oid"
done

# ── build on a throwaway branch, restore on any error ───────────────────────
START="$(git symbolic-ref -q --short HEAD || git rev-parse HEAD)"
cleanup() { git cherry-pick --abort >/dev/null 2>&1 || true; git checkout -q "$START" 2>/dev/null || true; }
trap cleanup ERR

git checkout -q -b "$BRANCH" "$BASE"
for i in "${!OIDS[@]}"; do
  oid="${OIDS[$i]}"
  nparents="$(git rev-list --parents -n 1 "$oid" | wc -w | tr -d ' ')"   # self + parents
  if [ "$nparents" -ge 3 ]; then
    echo "→ cherry-pick -m 1 $oid (merge commit)"; git cherry-pick -m 1 "$oid"
  else
    echo "→ cherry-pick $oid"; git cherry-pick "$oid"
  fi
done

echo
echo "════════ REVIEW: diff $BASE..$BRANCH (must be ONLY the hotfix) ════════"
git --no-pager diff --stat "$BASE" HEAD
echo "═══════════════════════════════════════════════════════════════════════"
echo

# ── notes ───────────────────────────────────────────────────────────────────
TMP_NOTES=""
if [ -z "$NOTES_FILE" ]; then
  TMP_NOTES="$(mktemp)"; NOTES_FILE="$TMP_NOTES"
  {
    echo "## Hotfix"
    echo
    for i in "${!PRS[@]}"; do echo "* ${TITLES[$i]} (#${PRS[$i]})"; done
    echo
    echo "> Isolated hotfix off \`$BASE\` — excludes any other unreleased work on \`$DEFAULT_BRANCH\`."
    echo
    REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)"
    [ -n "$REPO" ] && echo "**Full Changelog**: https://github.com/$REPO/compare/$BASE...$VERSION"
  } > "$NOTES_FILE"
fi

# ── tag + push + DRAFT release ──────────────────────────────────────────────
git tag -a "$VERSION" -m "$VERSION — hotfix"
git push -q "$REMOTE" "$BRANCH"
git push -q "$REMOTE" "$VERSION"
gh release create "$VERSION" --draft --title "$VERSION" --notes-file "$NOTES_FILE"

trap - ERR
git checkout -q "$START"
[ -n "$TMP_NOTES" ] && rm -f "$TMP_NOTES" || true

echo "✓ DRAFT release $VERSION created from $BRANCH (cherry-picked: ${PRS[*]})"
echo "  Review the notes and click Publish in the GitHub UI:"
gh release view "$VERSION" --json url --jq .url
