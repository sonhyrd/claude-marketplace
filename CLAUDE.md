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
  subtree prefix; do not rename it to match the plugin. Note that despite the name, it has never
  been a real `git subtree` graft — commit `9a7aa85` has a single parent and the repo holds no
  `git-subtree-dir` metadata for it. It is a plain copy with a `mattpocock` remote configured so
  `git subtree pull` can be used later, and it has never been pushed. Do not cite it as precedent
  for how `git subtree push` behaves.
- `plugins/e2e-skills/` is a real, **editable, bidirectional** git subtree of
  [sonhyrd/e2e-skills](https://github.com/sonhyrd/e2e-skills), published as the plugin **`e2e`** (so
  skills invoke as `/e2e:pw-prove`). **The verbatim rule above does not apply here** — this is the
  opposite of `mattpocock-skills`: edit it in place. Fixing `pw-prove` is one commit in this repo,
  not a commit in another clone plus a pull.
  - Push work back: `git subtree push --prefix=plugins/e2e-skills e2e-fork main`
    (`e2e-fork` = `git@github.com:sonhyrd/e2e-skills.git`; add it with `git remote add` if missing).
  - Pull upstream in: merge `voidmatcha/main` into the fork *in the merge workbench clone at*
    `/Users/sondh0127/orca/e2e-skills`, push that, then
    `git subtree pull --prefix=plugins/e2e-skills e2e-fork main` here. That clone is a merge
    workbench only — never the source of truth, never a place to author skill changes.
  - The directory keeps the name `e2e-skills` because it is the subtree prefix; renaming it to
    `e2e` would break both `pull` and `push`. Plugin name ≠ directory name, same as `matt`.
  - **After any pull, run `make check-e2e-subtree`.** A pull is a merge, and a merge can silently
    revert a marketplace-only decision. The prefix is expected to differ from the fork by exactly
    three things and nothing else: the two plugin manifests `.claude-plugin/plugin.json` and
    `.codex-plugin/plugin.json` (the fork ships none), and exactly one added line in
    `skills/pw-prove/SKILL.md`. `scripts/check-e2e-subtree.sh` is the single owner of that set and
    the only thing that asserts it — this list is orientation, the exit code is the verdict, and
    `./scripts/check-e2e-subtree.sh --explain` prints the set with each entry's reason straight from
    the script. A test asserts this paragraph names every path the script expects, so the two cannot
    silently disagree. The check fetches the fork, so it is deliberately not part of `make validate`,
    which is static and offline. Its own tests are `make test-e2e-subtree-check`.
  - Only two of the three on-disk skills are declared in `plugin.json`: `pw-prove` and
    `e2e-reviewer`. The third — `playwright-debugger` — still loads and still appears to the host as
    `e2e:playwright-debugger`; the `skills` array shapes the published manifest, not host discovery.
    Re-declaring one is a one-line `skills` array edit in *both*
    `plugins/e2e-skills/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
  - `playwright-test-generator` and `cypress-debugger` are **gone**, retired by the fork itself
    (`652c696 retire(playwright-test-generator)`), not disabled here. This repo used to disable the
    former by renaming its `SKILL.md` to `SKILL.md.disabled` — that rename was a marketplace-only
    deviation tracked by `check-e2e-subtree.sh`, and it was dropped when the directory it renamed
    stopped existing. Do not re-add it.
  - `disable-model-invocation: true` also removes a skill from the model-facing skill listing
    entirely, so a hidden skill can be *shadowed*: if the user's `/e2e:pw-prove` fails to parse as a
    command (e.g. a leading U+00A0 from a paste), the model sees no `pw-prove` and falls through to
    whatever listed skill advertises the same job. `playwright-test-generator` was that skill — its
    retirement removes the shadow at the source.
  - `pw-prove` carries `disable-model-invocation: true` in its frontmatter. That is the *only*
    mechanism that pins a plugin skill to user-invocable-only — `skillOverrides` in
    `~/.claude/settings.json` is inert for skills whose source is a plugin. Do not "fix" this by
    adding settings keys.
  - **`e2e-reviewer` must stay un-pinned.** It carried the same flag briefly and it broke the
    Step 6 quality gate in `pw-prove`, which invokes it through
    the Skill tool: the flag blocks *chained* launches too, so the gate died with `Skill
    e2e:e2e-reviewer cannot be used with Skill tool due to disable-model-invocation` even inside a
    run the user had started by name. Do not re-add it; a skill that is a handoff target cannot be
    pinned.
  - `plugins/e2e-skills/CLAUDE.md` is an 11-byte `@AGENTS.md` include that pulls a 15.4K file into
    context for any agent working in that directory. Known and accepted; deleting it would diverge
    from the fork.
- Never reference a plugin MCP tool by its bare `mcp__<server>__<tool>` name; plugin tools are
  namespaced `mcp__plugin_<plugin>_<server>__<tool>`. Verify the real id after install.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on our fork `sonhyrd/claude-marketplace` (`origin`), not upstream `dashed/claude-marketplace`. Managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root, both created lazily. See `docs/agents/domain.md`.

### Delegation profile

Branch prefix, post-merge check, commit policy, and worker constraints for `/delegate-tickets`.
See `docs/agents/delegate-profile.md`.
