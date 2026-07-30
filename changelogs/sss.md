# Changelog - sss

All notable changes to the sss plugin in this marketplace will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.1.0] - 2026-07-30

### Added

- Initial addition to marketplace as a personal skill bundle
- `jira-ticket` skill: writing and creating Story / Task / Bug / Sub-task tickets in the hyrd Jira (project MAMAS) — ticket grammar, `## Description` / `## Acceptance Criteria` structure, a pre-create gate checklist, and vertical story-splitting patterns
- `jira-ticket` reference `field-review-2026-07-10.md` documenting the field-failure evidence behind the create/flow rules
- `release-readiness` skill: read-only report on what is going into the next release — commits since the last release, the Jira tickets they bundle, each ticket's status, blockers, and a suggested next version. Never writes (no tags, no releases, no Jira transitions)
- Migrated from local `~/.claude/skills/*` symlinks into the marketplace
