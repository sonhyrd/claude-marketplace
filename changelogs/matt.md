# Changelog - matt

All notable changes to the matt plugin in this marketplace will be documented in this file.

> Installed as **`matt`**, so its skills invoke as `/matt:to-tickets`, `/matt:grilling`, and so on.
> The plugin directory is still `plugins/mattpocock-skills/` — that path is a `git subtree` prefix
> and renaming it would complicate future `subtree pull`s for no functional gain.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.2.4] - Unreleased

### Changed

- Subtree pulled from `mattpocock/main` (`9c9f36c` → `0ab1b63`, 12 commits). **The declared skill
  set is byte-identical to 1.2.3** — the same 25 entries, nothing added, removed, promoted or
  renamed — so nothing re-routes on the skill list.
- **The version is ours, not upstream's.** Upstream still declares `1.2.3`: all four changes sit on
  `main` as unreleased changesets, past the `v1.2.3` tag our previous base was already past. Mirroring
  `1.2.3` would leave the marketplace shipping changed content under an unchanged version, and a
  plugin cache keyed on version never re-fetches — the exact trap that left `sss` 1.4.0 stale on
  disk while the repo moved on. A local patch bump is the cheaper of the two errors, and it is the
  first deliberate divergence from `CLAUDE.md`'s "mirror upstream's version number" rule.
- Upstream's four changes: `wait-what` now **follows `CONTEXT-MAP.md`** to the right `CONTEXT.md` in
  a repo that has more than one; `grilling` separates the questions in a round with a horizontal
  rule; unquoted colons in `SKILL.md` front-matter descriptions are **quoted** (upstream's #907 — a
  bare `description: Foo: bar` is invalid YAML and the front-matter fails to parse); and every
  em-dash in the repo is replaced, with the writing guidance steered away from them for future
  edits.
- **11 skill descriptions changed wording** as a result of those last two — em-dashes became colons,
  semicolons or parentheses, and eleven descriptions gained surrounding quotes. Descriptions are the
  discovery surface, so this is the one part of the pull that is not cosmetic: `code-review`,
  `setup-matt-pocock-skills`, `to-spec`, `to-tickets`, `triage`, `wayfinder`,
  `setup-ts-deep-modules`, `writing-beats`, `writing-fragments`, `writing-shape` and `wait-what`.
  Every one keeps its trigger vocabulary; none changes what it claims to do.
- 17 merge conflicts, every one of them the em-dash rewrite landing on text our copy already held
  verbatim from `9c9f36c` — an artifact of the recorded `git-subtree-split` still pointing at
  `f3db03b` (the 1.2.2-era `subtree add`), so git diffed against a base four months stale. Resolved
  to upstream in all 17 except `.claude-plugin/plugin.json`, which keeps `"name": "matt"` over
  upstream's `"mattpocock-skills"`. Verified after the fact rather than asserted: the merged prefix
  tree is path-for-path identical to upstream `0ab1b63` except the two known deviations.
- **The merge commit now carries the subtree trailers** (`git-subtree-dir`, `git-subtree-mainline`,
  `git-subtree-split: 0ab1b63`), which is what makes the next `git subtree pull` base off this pull
  instead of off `f3db03b` again. Without them the 17-conflict replay is the *floor* for every
  future sync, growing with each upstream rewrite.

### Notes

- **`sss:pr-review`'s one override of a skill it does not own survives this pull**, and was checked
  rather than assumed. It anchors on the two named briefs in `code-review`'s step 4 — Standards and
  Spec — and on that step's title, *Spawn both sub-agents in parallel*; the em-dash pass rewrote
  prose inside the step and left both intact. That is the second consecutive pull where anchoring on
  briefs rather than on a sentence about tool calls is what kept it working.

## [1.2.3] - Unreleased

### Changed

- Subtree pulled from `mattpocock/main` (`9c9f36c`), moving the plugin 1.2.2 → **1.2.3**. 30 files
  changed, 107 insertions, 65 deletions. **The declared skill set is byte-identical to 1.2.2** —
  same 25 entries, nothing added, removed, promoted or renamed — so nothing re-routes.
- The pull is **not** `--squash`, matching the graft: `d46eb83` is a real two-parent subtree commit
  carrying `git-subtree-dir` / `git-subtree-mainline` / `git-subtree-split`.
- Exactly one conflict, in `.claude-plugin/plugin.json`, and it is the known deviation — upstream's
  `"name": "mattpocock-skills"` against our `"name": "matt"`. Resolved as always: our name,
  upstream's version. Every other byte across the 30 files merged clean.
- Upstream's three released changes in 1.2.3: `diagnosing-bugs` now **redacts secrets** as the
  first move on every command, output and captured artifact; `code-review`, `codebase-design` and
  `improve-codebase-architecture` drop Claude Code's tool and agent-type names from their
  subagent-dispatch steps so they read on Codex too; `wizard` drops its time estimate, counting
  progress in stages instead.

### Fixed

- **`sss:pr-review`'s one override of a skill it does not own broke, exactly where it said it
  would.** Its Step 2 pointed at `matt:code-review`'s dispatch step by saying "the loaded skill's
  step 4 says two" — and 1.2.3 **deleted** the sentence it was counting, *Send a single message
  with two `Agent` tool calls*, as part of making that step harness-portable. The override now
  anchors on the **two named briefs** the step still defines, Standards and Spec, which survives a
  rewrite that removes harness-specific tool names. Counting briefs is durable; counting calls was
  not.

### Notes

- The tree is upstream `main`, not the `v1.2.3` tag: four unreleased changesets sit on top of the
  release — `domain-modeling` triggering on CONTEXT.md/ADR writes, em-dashes out of `grilling`,
  cross-skill invocation standardised on explicit Skill-tool phrasing, and skills told to stop
  calling other user-invoked skills. `plugin.json` reads 1.2.3 because that is what upstream's
  manifest says; the content is slightly ahead of it.

## [1.2.0] - 2026-07-31

### Added

- Initial addition to the marketplace as **`matt`** — [mattpocock/skills](https://github.com/mattpocock/skills) (MIT) vendored via `git subtree` under `plugins/mattpocock-skills/`, mirroring upstream's own plugin version `1.2.0`
- Exposes the 22 skills declared by upstream's `.claude-plugin/plugin.json`: `ask-matt`, `code-review`, `codebase-design`, `diagnosing-bugs`, `domain-modeling`, `grill-me`, `grill-with-docs`, `grilling`, `handoff`, `implement`, `improve-codebase-architecture`, `prototype`, `research`, `resolving-merge-conflicts`, `setup-matt-pocock-skills`, `tdd`, `teach`, `to-spec`, `to-tickets`, `triage`, `wayfinder`, `writing-great-skills`
- Upstream's MIT `LICENSE` is vendored alongside the skills

### Notes on the vendored copy

- **Identical to upstream apart from the plugin name and one generated file.** Exactly one upstream line is changed: `.claude-plugin/plugin.json`'s `"name"` field, `mattpocock-skills` → `matt`, so the skills invoke as `/matt:<skill>` instead of `/mattpocock-skills:<skill>`. The only added file is `.codex-plugin/plugin.json`, generated by `make sync-codex-plugins` and absent upstream, so it cannot conflict. Every other byte matches upstream. Keep it that way — behavioural changes belong upstream, not here.
- The renamed line is the one to watch on `git subtree pull`: if upstream ever edits its own `name` field the merge will conflict there, and the resolution is to keep `matt`. Upstream's `skills` array churns far more often, but it sits in a separate hunk.
- **Upstream's category-nested layout is preserved** (`skills/<category>/<name>/SKILL.md`). Flattening it would break subtree pulls, since upstream commits would recreate the nested paths. `scripts/validators/validate_structure.py` and `scripts/sync_codex_plugins.py` were taught to discover skills at that depth.
- **41 skill directories are on disk; only 22 are exposed.** Upstream deliberately keeps `skills/in-progress/`, `skills/misc/` and parts of `skills/personal/` out of its `plugins.json` skills array. This marketplace does not override that — adding them would mean a large local edit to the most-churned upstream file.
- **`handoff` collides by name** with this marketplace's former standalone `handoff` plugin (removed in 0.46.0). This is the upstream original; the removed plugin was an extended fork of it.
- **`teach` collides by name only.** Upstream's `teach` teaches a concept within the workspace; the marketplace's former `teach` plugin (removed in 0.46.0, ported from alexknowshtml) ran a Socratic quiz loop over session history. They are unrelated skills.
- Three skills authored locally on top of upstream — `autoship`, `delegate-tickets` and `setup-cursor-worker` — were **not** vendored here; they live in the `sss` plugin. See `changelogs/sss.md`.

### Syncing with upstream

```bash
git subtree pull --prefix=plugins/mattpocock-skills mattpocock main
```

Then mirror upstream's new version number into `.claude-plugin/marketplace.json` and add a section here.
