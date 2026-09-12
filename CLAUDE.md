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
- Matt Pocock's skills are not in this repo. `sonhyrd/agent-kit` vendors them under bare names
  (`matt-code-review` and `matt-prototype` are the two renamed ones), and teamai installs them. Skills
  here call those names, never `matt:<name>`.
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
