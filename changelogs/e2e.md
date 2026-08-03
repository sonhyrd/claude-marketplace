# Changelog - e2e

All notable changes to the e2e plugin in this marketplace will be documented in this file.

> Installed as **`e2e`**, so its skills invoke as `/e2e:pw-prove` and `/e2e:e2e-reviewer`.
> The plugin directory is `plugins/e2e-skills/` — that path is a `git subtree` prefix and renaming
> it would break both `git subtree pull` and `git subtree push`.
>
> Unlike `plugins/mattpocock-skills/`, **this subtree is editable in place.** Author changes here,
> then `git subtree push --prefix=plugins/e2e-skills e2e-fork main`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.0.0] - Unreleased

### Added

- Initial addition to the marketplace as **`e2e`** — [sonhyrd/e2e-skills](https://github.com/sonhyrd/e2e-skills)
  (Apache-2.0) grafted via a real, un-squashed `git subtree add` under `plugins/e2e-skills/`,
  bringing all 146 commits of history so `git blame` on a `pw-prove` line still reaches the commit
  that wrote it. The subtree remote is the fork, not upstream `voidmatcha/e2e-skills`, because the
  fork carries 52 commits of `pw-prove` work the upstream tree does not have.
- `pw-prove` — prove a PR / branch / ticket / diff with a Playwright E2E test, fast. Owns server
  bring-up, auth and live-DOM recon; the trace and video are a byproduct of the proof run rather
  than a hosted film.
- `e2e-reviewer` — static review of Playwright/Cypress specs and Page Object Models, flagging 24
  anti-patterns grouped P0 (silently always-pass) / P1 (poor diagnostics) / P2 (maintenance).

### Notes

- **Two of five skills are declared.** `cypress-debugger`, `playwright-debugger` and
  `playwright-test-generator` ship inside the subtree as files but are not registered as skills.
  This is load-bearing in one place: `e2e-reviewer/scripts/scan.mjs` dynamically imports
  `../../playwright-test-generator/scripts/ptg-run.mjs` for run-ledger telemetry. The import is
  already wrapped in `try`/`catch`, but the file being present keeps it working. Re-declaring one
  is a one-line edit to the `skills` array in `.claude-plugin/plugin.json` and
  `.claude-plugin/marketplace.json`.
- **Both declared skills are user-invocable only**, via `disable-model-invocation: true` in their
  frontmatter. That field is the only mechanism that pins a plugin-sourced skill —
  `skillOverrides` in `~/.claude/settings.json` does not apply to plugin skills.
- **Version is fresh, not borrowed.** Upstream publishes no plugin and no repo version; the only
  signals are per-skill `metadata.version` (`1.9.0` on the four voidmatcha skills, `0.1.0` on
  `pw-prove`). Those disagree, and `1.9.0` describes a five-skill bundle. `1.0.0` is the honest
  number for a new two-skill artifact.
- **Known, deliberate divergence-avoidance.** `pw-prove`'s SKILL.md instructs the model to invoke
  `playwright-debugger` after three failed heal attempts; that skill is not declared, so the
  handoff dangles. It dangled before this move too (`playwright-debugger` was `off`), and editing
  it would create a permanent conflict surface in a file upstream actively edits. Left alone on
  purpose — this is a known lie, not an oversight.
