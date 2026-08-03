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

### Fixed

- **The Step 6 quality gate could not run.** `pw-prove` and `playwright-test-generator` both
  invoke `e2e-reviewer` through the Skill tool, which failed outright with
  `Skill e2e:e2e-reviewer cannot be used with Skill tool due to disable-model-invocation`.
  `disable-model-invocation: true` blocks *every* model-initiated launch — including a chained one
  from inside a skill the user invoked by name, which is the only path that ever reached this gate.
  Dropped the flag from `e2e-reviewer`: a skill that is a documented handoff target cannot be
  pinned user-invocable-only. `pw-prove` keeps its own pin — it is an entry point, never a target.

- `playwright-test-generator` no longer shadows `/e2e:pw-prove`. Session
  `31c05f72-b031-4071-afa7-5d643f611c55` sent `/e2e:pw-prove <PR url>` with a leading U+00A0
  (non-breaking space) in front of the slash, so Claude Code's command parser did not recognise it
  and passed the line through as ordinary prose. `pw-prove` carries
  `disable-model-invocation: true`, which removes it from the model-facing skill listing entirely —
  so the model had no `pw-prove` to reach for, and picked the one listed skill whose description
  claimed the job: `playwright-test-generator` ("…or prove a PR/branch/ticket/diff with one"). The
  whole PR then ran through the wrong pipeline. Note the correction below — the `skills` array was
  never what kept it out of the model's hands.

### Removed

- `playwright-test-generator` is disabled. Its `SKILL.md` is renamed `SKILL.md.disabled`, which is
  what actually stops Claude Code's auto-discovery — `claude plugin details e2e` now reports
  `Skills (4)` and ~100 fewer always-on tokens. It is unused in practice and `pw-prove` covers the
  proving path; the directory stays as reference pending outright removal. The entry file is
  renamed rather than the directory moved or deleted so `scripts/ptg-run.mjs` keeps the relative
  path `e2e-reviewer/scripts/scan.mjs` imports for run-ledger telemetry. Its frontmatter also gains
  `disable-model-invocation: true` and drops the "or prove a PR/branch/ticket/diff with one" claim,
  so a revival by rename comes back inert instead of re-shadowing `pw-prove`. Upstream
  `voidmatcha` actively edits this file, so a `git subtree pull` will conflict here, and the fork's
  own `scripts/ci/review.sh` public-skill-surface check expects five `SKILL.md` files — both
  expected, both resolved in favour of the rename. This also retires the Step 6 handoff *out of*
  `playwright-test-generator` noted in the fix above — `pw-prove` is now the only skill that reaches
  `e2e-reviewer`.

### Notes

- **Never pin a handoff target.** A SKILL.md line saying "invoke `<x>` (Skill tool)" is only valid
  when `<x>` carries no `disable-model-invocation`. That now holds for both handoff targets in this
  bundle: `e2e-reviewer` (Step 6) and `playwright-debugger` (Step 7, never pinned).
- **Declaring a skill in `plugin.json` is not what makes it load.** All five on-disk skills appear
  to the host as `e2e:<name>`, including the three the manifest omits — verified against the
  installed cache at `~/.claude/plugins/cache/sss-marketplace/e2e/1.0.0/skills/`, with no
  leftover `~/.claude/skills` symlinks in play. So `pw-prove`'s `playwright-debugger` handoff is
  not the dangling reference the note below assumed; the `skills` array affects the published
  manifest, not host discovery.
- **Two of the four live skills are declared.** `cypress-debugger` and `playwright-debugger` ship
  inside the subtree and load, but are not registered in the manifest;
  `playwright-test-generator` is off entirely (see Removed). Keeping its files is load-bearing in
  one place: `e2e-reviewer/scripts/scan.mjs` dynamically imports
  `../../playwright-test-generator/scripts/ptg-run.mjs` for run-ledger telemetry. The import is
  already wrapped in `try`/`catch`, but the file being present keeps it working. Re-declaring one
  is a one-line edit to the `skills` array in `.claude-plugin/plugin.json` and
  `.claude-plugin/marketplace.json`.
- **`pw-prove` is user-invocable only**, via `disable-model-invocation: true` in its frontmatter.
  That field is the only mechanism that pins a plugin-sourced skill — `skillOverrides` in
  `~/.claude/settings.json` does not apply to plugin skills. `e2e-reviewer` deliberately carries
  no such flag; see Fixed above.
- **Version is fresh, not borrowed.** Upstream publishes no plugin and no repo version; the only
  signals are per-skill `metadata.version` (`1.9.0` on the four voidmatcha skills, `0.1.0` on
  `pw-prove`). Those disagree, and `1.9.0` describes a five-skill bundle. `1.0.0` is the honest
  number for a new two-skill artifact.
- **Known, deliberate divergence-avoidance.** `pw-prove`'s SKILL.md instructs the model to invoke
  `playwright-debugger` after three failed heal attempts; that skill is not declared, so the
  handoff dangles. It dangled before this move too (`playwright-debugger` was `off`), and editing
  it would create a permanent conflict surface in a file upstream actively edits. Left alone on
  purpose — this is a known lie, not an oversight.
