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
- `plugins/mattpocock-skills/` is a **git subtree** of [mattpocock/skills](https://github.com/mattpocock/skills),
  not hand-maintained code, and it is published as the plugin **`matt`** (so skills invoke as
  `/matt:<skill>`). Never edit anything in it beyond the two known deviations: `plugin.json`'s
  `"name"` is `matt`, not `mattpocock-skills`, and `.codex-plugin/plugin.json` is generated. Every
  other byte matches upstream. Sync with
  `git subtree pull --prefix=plugins/mattpocock-skills mattpocock main`, then mirror upstream's new
  version number into `.claude-plugin/marketplace.json`. It keeps upstream's category-nested
  `skills/<category>/<name>/` layout — do not flatten it, or subtree pulls will recreate the nested
  paths alongside the flattened copies. Locally-authored skills built on top of it live in
  `plugins/sss/`, never here. The directory keeps its `mattpocock-skills` name because it is the
  subtree prefix; do not rename it to match the plugin.
- Never reference a plugin MCP tool by its bare `mcp__<server>__<tool>` name; plugin tools are
  namespaced `mcp__plugin_<plugin>_<server>__<tool>`. Verify the real id after install.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on our fork `sonhyrd/claude-marketplace` (`origin`), not upstream `dashed/claude-marketplace`. Managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root, both created lazily. See `docs/agents/domain.md`.
