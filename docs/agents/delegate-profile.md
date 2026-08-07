# Delegation profile

Read by `/delegate-tickets` (step 1). Amended by the coordinator when a merge-back reveals a new
baseline, known-noise test, or environment trap.

- **Remote**: `sonhyrd/claude-marketplace` — the origin this profile describes. Step 1 compares it
  against `git remote get-url origin` and warns on mismatch. This is a self-check, not a key: the
  profile is found by being in this repo, not by matching a list.
- **Branch prefix**: `ticket/` — per-ticket branches are `ticket/<ticket-slug>`.
- **Post-merge check**: `make validate`. Baseline **3/3 passing, 0 failures** as of `fa20228`
  (2026-08-07): File Structure, JSON Manifest, YAML Frontmatter. No known-noise failures — any
  failure is a regression. `make validate` is static and offline; it deliberately excludes
  `make check-e2e-subtree`, which fetches the fork. A ticket touching `plugins/e2e-skills/` must run
  `make check-e2e-subtree` and `make test-e2e-subtree-check` itself.
- **Commit policy**: scoped subject lines matching the existing log — `sss: …`, `sss(<skill>): …`,
  `fix(e2e): …`, `docs(changelog): …`. Imperative mood, no trailing period. A body explaining *why*
  where the subject cannot carry it. **No AI attribution**: no `Co-Authored-By: Claude`, no
  `Generated with Claude Code`, no emoji trailer. User-facing changes get a line under
  `## [Unreleased]` in `CHANGELOG.md`, skill-specific lines prefixed `<skill-name> skill:`.
- **Prohibitions**: carried verbatim into every worker brief.
  1. Never run bare `git stash` — the stash is shared across all worktrees of this repo, and popping
     it in the wrong one silently moves another worker's uncommitted work.
  2. Never `git push`, open a PR, or push tags. The coordinator merges back and owns all pushing.
     Pushing to the `e2e-fork` remote requires the coordinator's approval per push; when granted, it
     is a **targeted push** (`git push e2e-fork <sha>:main` from a commit carrying only the paths the
     fork owns), never `git subtree push`, which lands the two plugin manifests on a fork that
     deliberately ships none. `docs/adr/0005` records the measurement.
  3. Never edit anything under `plugins/mattpocock-skills/`. It is a vendored copy of an upstream
     repo; edits there are destroyed by the next subtree pull.
  4. Never run `pnpm -r run test`, `turbo run test`, or any recursive sweep without capping **both**
     `--workspace-concurrency` and the runner's worker count. Sibling worktrees each size their pool
     from total machine cores; unbounded sweeps oversubscribe the box and starve every other worker.
  5. Never `git checkout`, `git switch`, or `git rebase` onto another worker's `ticket/` branch, and
     never `git worktree remove` a directory you did not create. Each worker owns exactly one
     worktree.
  6. Never `git commit --amend`, `git reset --hard`, or force-push a commit that is already on your
     branch's merge-base — the coordinator diffs against that base and rewritten history reads as a
     revert.
  7. Never edit `docs/agents/delegate-profile.md`. The coordinator owns it; a worker editing it
     conflicts on every merge-back.
  8. Never bump the version in `.claude-plugin/marketplace.json` or any `plugin.json`, and never add
     a `## [x.y.z]` heading to `CHANGELOG.md`. Releases are cut separately; five workers each
     claiming the next version is five conflicts.
  9. Never reformat, re-indent, or lint-fix a file you did not otherwise change — especially
     anything under `plugins/*/scripts/`, which the lint targets deliberately exclude. Whitespace
     churn makes the merge-back review surface unreadable.
  10. Never mark your own ticket closed on GitHub. Report completion; the coordinator closes it
      after the merge-back check passes.
- **Conventions**: `CLAUDE.md` at the repo root. Read it in full before your first edit — it owns
  the subtree rules, the plugin-vs-directory naming distinction, the MCP tool-namespacing rule, and
  the pointers to `docs/agents/`.
