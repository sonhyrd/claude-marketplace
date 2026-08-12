---
name: hotfix-draft-release
description: >-
  Cut an isolated hotfix release: cherry-pick one or more ALREADY-MERGED fix PRs onto the last
  published release tag, tag the next patch version, and create a GitHub DRAFT release (never
  auto-published) with hotfix-only notes. Use this whenever someone wants to ship just a specific
  fix WITHOUT bundling the other work already merged to main — e.g. "prepare a hotfix release",
  "cut a patch release for just this fix", "release only the hotfix", "draft a release for PR #347",
  "ship this fix but not the other merged PRs", or when a fix is on main but in-flight/in-QA
  features merged alongside it must be excluded from the release. Also trigger when the next release
  would otherwise be a cumulative tag of main but only one or two fixes are actually ready to go.
---

# Hotfix draft release

Ship one or more already-merged fixes as their own patch release, leaving everything else that's
sitting on `main` out of it. The output is always a **draft** GitHub release — a human reviews the
notes and clicks Publish.

## When this is the right move

`main` accumulates merged PRs between releases. Sometimes one of them is an urgent fix and the rest
(features, refactors) aren't release-ready — still in QA, ungroomed, or just unverified. Tagging
`main` as the next release would drag all of it out the door. Instead, branch from the **last
released tag** and cherry-pick only the fix. The release then contains exactly `last_tag + the fix`.

If everything on `main` IS ready, you don't need this — just tag `main`. This skill is specifically
for the "only ship some of it" case.

## The flow: list → pick → cut

The normal next release is a cumulative tag of `main`. This skill starts from that same candidate
list — the PRs merged since the last release (exactly what GitHub's "What's Changed" shows) — lets
the user pick a subset, and ships only those as a draft hotfix.

**Step 0 — resolve the script.** It ships inside this plugin, and every command below runs from the
**repo being released**, so a relative path finds nothing. Resolve `$CUT` once, at the top of the run:

```bash
CUT=$(
  {
    [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] &&
      printf '%s\n' "$CLAUDE_PLUGIN_ROOT/skills/hotfix-draft-release/scripts/cut-hotfix.sh"
    find "$HOME/.claude/plugins/cache" -maxdepth 7 \
      -path '*/sss/*/skills/hotfix-draft-release/scripts/cut-hotfix.sh' 2>/dev/null | sort -Vr
  } | while IFS= read -r c; do [ -f "$c" ] && printf '%s\n' "$c"; done | head -1
)
[ -n "$CUT" ] || { echo "ERROR: cut-hotfix.sh not found in the sss plugin." >&2; false; }
```

Non-zero exit means no script: **STOP** and use the manual fallback below, deliberately. Never
substitute a repo-relative path — a `scripts/cut-hotfix.sh` in the repo being released is somebody
else's script. The cache candidates are `sort -Vr` (version sort): plain `sort -r` is lexicographic
and picks `1.9.0` over `1.10.0`.

**Step 1 — show the candidates.** Run the list mode and present the output to the user:

```bash
"$CUT" --list
```

It prints every PR merged into the default branch since the last release, oldest first, each with
its number, title, and author:

```
## Merged into main since v1.0.7 (release candidates)

  #344   fix(start): hide career level in the More-jobs sidebar  (@sonhyrd)
  #338   fix(start): suppress phone duplicate error for logged-in candidates  (@sonhyrd)
  #347   fix(widget): honor targeting.whitelisted_urls in the cpc adapter  (@sonhyrd)
  ...
```

**Step 2 — let the user pick.** Show them the list and ask which PRs go into the hotfix. Don't
guess — the whole point is that the human decides what's release-ready vs what stays on `main`.

**Step 3 — cut the draft release** with the chosen numbers:

```bash
"$CUT" --pr 347
# or several:
"$CUT" --pr 344 --pr 347
```

Explicit base/version/notes are optional:

```bash
"$CUT" --pr 347 --pr 349 --base v1.0.7 --version v1.0.8 --notes /tmp/notes.md
```

Defaults: `--base` = latest published GitHub release, `--version` = base with patch +1, `--notes` =
auto-built from the chosen PR titles. The cut step fetches, validates, creates branch
`hotfix-vX.Y.Z`, cherry-picks each PR's merge commit (handling squash vs merge commits
automatically), **prints the diff vs the base for you to review**, tags, pushes, and creates the
draft release. It restores your original branch even on failure.

After it runs: **read the printed `diff --stat`.** It must contain only the picked PRs' files. Then
open the draft URL it prints, sanity-check the notes, and Publish from the GitHub UI.

## Why a script instead of typing the commands

This exact workflow has a nasty failure mode: a shell sequence without `set -e` keeps going after a
mid-step failure and pushes a tag pointing at the wrong commit (e.g. all of `main` instead of just
the fix) to the shared remote. The script exists to make that impossible. It bakes in the four
things that bite every time:

1. **`set -euo pipefail`** — any failed step aborts before anything is pushed. No cascade.
2. **Branch name `hotfix-vX.Y.Z`** (hyphen, a sibling name) — a `hotfix/x` *slug* fails to create
   when a plain `hotfix` branch already exists (`cannot lock ref … 'hotfix' exists`). The hyphen
   form sidesteps that.
3. **Tag-on-cherry-pick + diff review** — the tag is created on the isolated commit, and the diff
   against the base is printed so you confirm scope before trusting it.
4. **`--draft` always** — the release is never published automatically. A human reviews and ships.

Prefer the script. Only fall back to manual steps if `gh`/the script is unavailable.

## Finding the inputs

- **Which PR is the hotfix?** The merged fix the user is pointing at. If they name a PR number, use
  it. If they describe the fix, find it: `gh pr list --state merged --limit 15`.
- **Last released tag** (the base): `gh release view --json tagName --jq .tagName` — the script does
  this for you, but it's how you'd check manually.
- The script resolves each PR's commit itself via `gh pr view <#> --json mergeCommit`; you do not
  need to hunt for SHAs.

## Manual fallback (only if the script can't run)

```bash
set -euo pipefail                              # do NOT skip this
git fetch --tags origin
BASE=v1.0.7; VER=v1.0.8                         # base = last release; VER = patch+1
OID=$(gh pr view 347 --json mergeCommit --jq .mergeCommit.oid)
git checkout -b hotfix-$VER $BASE              # hyphen, not hotfix/$VER
# merge commit (2 parents) → add `-m 1`; squashed single commit → plain cherry-pick:
git cherry-pick -m 1 $OID 2>/dev/null || git cherry-pick $OID
git --no-pager diff --stat $BASE HEAD          # REVIEW: only the fix's files?
git tag -a $VER -m "$VER — hotfix"
git push origin hotfix-$VER && git push origin $VER
gh release create $VER --draft --title $VER --notes-file notes.md   # --draft, never publish
```

## If something goes wrong mid-run

A pushed-but-wrong tag is recoverable as long as no release was published:

```bash
git push --delete origin v1.0.8   # remove the bad remote tag
git tag -d v1.0.8                  # remove it locally
git reset --hard HEAD             # clean the working tree
```

Then re-run the script. (Deleting a tag that a *published* release depends on is messier — that's
exactly why the release is a draft until a human approves it.)
