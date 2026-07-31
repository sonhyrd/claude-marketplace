# Changelog - sss

All notable changes to the sss plugin in this marketplace will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.2.0] - 2026-07-31

### Added

- `autoship` skill: takes an idea or an existing Issue and drives it through the full pipeline autonomously — align into a spec, slice into Issues, drain the Frontier one Issue at a time, ending in one reviewable PR. The invoking session is the coordinator and replaces the human at every gate. Workers run on `claude` by default, or on `cursor-agent` via `--engine cursor` (one engine per run, never mixed). References: `reference.md` (concrete Orca CLI invocations), `references/spec.md` (source spec), `references/tickets.md` (the build log)
- `delegate-tickets` skill: delegates a ticket tree from `/to-tickets` to parallel Orca workers — one child worktree per ticket, dispatched in DAG order using the tickets' blocking edges as-is, merged back as each finishes. References: `PROFILES.md` (per-repo profiles), `references/quickstart.md`
- `setup-cursor-worker` skill: one-time, machine-scoped setup making `cursor-agent` usable as an Orca worker engine — verifies PATH, auth, permissions, model and workspace trust, then proves the dispatch round-trip with a live smoke test. Emits a ready / not-ready verdict rather than a config dump
- All three moved out of a local fork of [mattpocock/skills](https://github.com/mattpocock/skills), where they had been authored on top of upstream and could never be pushed. Their commit history is preserved through the `matt` subtree import (see `changelogs/matt.md`); the fork's copies were deleted so this marketplace is the single source of truth

### Changed

- Plugin description and keywords now state that the three new skills require external dependencies — the `matt` plugin (for `/matt:setup-matt-pocock-skills`, `/to-spec`, `/to-tickets`, `/implement`) and an Orca install (for `/orchestration`); `setup-cursor-worker` additionally needs an authenticated `cursor-agent`. Each of the three `SKILL.md` files opens with a prerequisites callout
- `jira-ticket` and `release-readiness` are unaffected and remain dependency-free — the prerequisites are per-skill, not per-plugin

## [1.1.0] - 2026-07-30

### Added

- Initial addition to marketplace as a personal skill bundle
- `jira-ticket` skill: writing and creating Story / Task / Bug / Sub-task tickets in the hyrd Jira (project MAMAS) — ticket grammar, `## Description` / `## Acceptance Criteria` structure, a pre-create gate checklist, and vertical story-splitting patterns
- `jira-ticket` reference `field-review-2026-07-10.md` documenting the field-failure evidence behind the create/flow rules
- `release-readiness` skill: read-only report on what is going into the next release — commits since the last release, the Jira tickets they bundle, each ticket's status, blockers, and a suggested next version. Never writes (no tags, no releases, no Jira transitions)
- Migrated from local `~/.claude/skills/*` symlinks into the marketplace
