# Changelog - web-search

All notable changes to the web-search skill in this marketplace will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.0.0] - 2026-08-11

### Added

- Initial addition to the marketplace — a vendored copy of the **web-search** skill from
  [ogulcancelik/agent-skills](https://github.com/ogulcancelik/agent-skills/tree/main/skills/web-search)
  (MIT, Can Celik). It searches Google or DuckDuckGo through a real local Chromium-family browser,
  lists numbered results, and extracts selected pages as readable Markdown, so answers that need
  current sources, JavaScript-rendered pages, or bot-protection-tolerant access do not depend on a
  fetch tool that only sees static HTML.
- `SKILL.md`, `web-search.js` (the CLI entry point), `lib/` (search, extraction, CDP, daemon,
  bot-protection, fingerprinting), and `test/` — vendored verbatim from upstream. `node_modules/`
  and `bun.lock` are excluded, matching upstream's `.gitignore`; the skill runs `bun install` in its
  own directory on first use.
- The skill keeps a warm browser daemon between calls (`--daemon status|start|stop|restart`), which
  is what keeps repeat searches from paying browser-startup cost and from tripping bot detection on
  every query.

### Notes

- Previously this skill existed only as an untracked directory under `~/.agents/skills/web-search`,
  symlinked into `~/.claude/skills/`, so it was present on exactly one machine and survived no
  reinstall. Publishing it as a marketplace plugin is what makes `/web-search` reproducible.
