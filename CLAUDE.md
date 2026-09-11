# Development Guide

## Task workflows

These live as skills so they load only when you're doing the task:

- **Releasing / bumping the version** → `release-version-bump` skill (`.claude/skills/release-version-bump/`)
- **Adding a new skill plugin** → `add-marketplace-skill` skill (`.claude/skills/add-marketplace-skill/`)
- **Adding an MCP server plugin** → `add-mcp-plugin` skill (`.claude/skills/add-mcp-plugin/`)

## Always applies

- Every change must pass `make validate` before commit, and `make validate-strict` before a release
  (strict mode fails on warnings, which is how missing `plugin.json` files get caught).
- Document user-facing changes under `## [Unreleased]` in `CHANGELOG.md`, prefixing skill-specific
  lines with `<skill-name> skill:`. See the `release-version-bump` skill for which changelog to touch.
- Keep vendored/ported plugin code **verbatim** from upstream — do not reformat it. The lint targets
  deliberately exclude `plugins/*/scripts/`.
- `plugins/mattpocock-skills/` is a **git subtree** of
  [mattpocock/skills](https://github.com/mattpocock/skills), not hand-maintained code, and it is
  published as the plugin **`matt`** (so skills invoke as `/matt:<skill>`). Never edit anything in
  it beyond the three known deviations: `plugin.json`'s `"name"` is `matt`, not
  `mattpocock-skills`; `plugin.json`'s `skills` array additionally declares
  `./skills/in-progress/claude-handoff` and `./skills/in-progress/implement-spec`, which upstream
  deliberately leaves undeclared (see `changelogs/matt.md` 1.2.5 — both carry
  `disable-model-invocation: true`, so leaving them out of the array made them invisible on *both*
  paths at once and therefore unusable, and this override is what makes them user-invocable); and
  `.codex-plugin/plugin.json` is generated. Every other byte matches upstream. Sync with `git
  subtree pull --prefix=plugins/mattpocock-skills mattpocock main`, then mirror upstream's new
  version number into `.claude-plugin/marketplace.json` — **unless upstream's number did not move**,
  which happens whenever the pull crosses commits upstream is still holding as unreleased
  changesets. Mirroring an unchanged number ships changed content under a version a plugin cache is
  keyed on, and such a cache never re-fetches. In that case bump the patch digit locally instead and
  say so in `changelogs/matt.md`; `1.2.4` against upstream's `1.2.3` is the first of these. The
  `mattpocock` remote is not always configured in a fresh clone — `git remote add mattpocock
  https://github.com/mattpocock/skills.git` if `git remote -v` does not list it. Give the merge
  commit the `git-subtree-dir` / `git-subtree-mainline` / `git-subtree-split` trailers, and never
  pass a plain `-m` that drops them: without a recorded split the next pull diffs against the last
  commit that had one and replays every intervening upstream rewrite as a conflict. It keeps
  upstream's category-nested `skills/<category>/<name>/` layout — do not flatten it, or subtree
  pulls will recreate the nested paths alongside the flattened copies. Locally-authored skills built
  on top of it live in `plugins/sss/`, never here. The directory keeps its `mattpocock-skills` name
  because it is the subtree prefix; do not rename it to match the plugin. Note that the graft itself
  was never a real `git subtree` one — commit `9a7aa85` has a single parent — and it has never been
  pushed, so do not cite it as precedent for how `git subtree push` behaves. Inbound is a different
  story: `d46eb83` and the `0ab1b63` sync both carry `git-subtree-dir` metadata, so `git subtree
  pull` works and is the only supported way in.
- `disable-model-invocation: true` in a skill's frontmatter is the *only* mechanism that pins a
  plugin skill to user-invocable-only — `skillOverrides` in `~/.claude/settings.json` is inert for
  skills whose source is a plugin, so never "fix" a pin question by adding settings keys. The flag
  also blocks *chained* Skill-tool launches, so a skill another skill hands off to cannot be pinned.
- `plugins/sss/skills/skill-upper/` is **vendored verbatim** from
  [alibaba/skill-up](https://github.com/alibaba/skill-up) (`skills/skill-upper/`, upstream `24e5185`
  / release `v0.9.0`) — the one exception to `plugins/sss/` being entirely locally authored. Do not
  edit or reformat it; re-sync by re-copying that directory from upstream. Upstream's own `evals/`
  subtree is intentionally omitted (its cases grade the skill against upstream fixtures), so a
  re-copy must omit it again. Its frontmatter `name` is `skill-upper` while the body's H1 reads
  `use-skill-up-cli`; that mismatch is upstream's and the frontmatter is what the host reads. The
  skill is a wrapper around the `skill-up` Go CLI and does nothing without it on `PATH` — install
  per `references/install.md`.
- Never reference a plugin MCP tool by its bare `mcp__<server>__<tool>` name; plugin tools are
  namespaced `mcp__plugin_<plugin>_<server>__<tool>`. Verify the real id after install.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on our fork `sonhyrd/claude-marketplace` (`origin`), not upstream `dashed/claude-marketplace`. Managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root, both created lazily. See `docs/agents/domain.md`.
