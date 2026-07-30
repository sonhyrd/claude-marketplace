---
name: add-mcp-plugin
description: Add a plugin that ships an MCP server to this marketplace. Use when creating or editing a .mcp.json, adding an MCP server script under plugins/, or referencing a plugin MCP tool by name from a skill or doc.
---

# Adding an MCP Server Plugin

Some plugins ship a Model Context Protocol (MCP) server instead of (or in addition to) a skill. Four
MCP-server plugins already ship here, all ported verbatim from the `mcp-personal` repo — use whichever
is the closest analog as the reference implementation:

| Plugin | Server script | Tools | Notable traits to copy from |
|--------|---------------|-------|------------------------------|
| `sequential-thinking` | `mcp_sequential_thinking.py` | `sequentialthinking` | Simplest reference: pure-stdlib-style server, no external binaries, import-only tests |
| `file-search` | `mcp_fd_server.py` | `search_files`, `filter_files` | External binary prereqs (`fd`, `fzf`); `tests/conftest.py` chdir shim for bare-filename subprocess tests |
| `fuzzy-search` | `mcp_fuzzy_search.py` | content/file/document search + PDF tools | Extra runtime dep (`PyMuPDF`) in the dev extra; a known-flaky upstream test `xfail`'d via `conftest.py` while keeping the test module verbatim |
| `sqlite` | `mcp_sqlite_server.py` | `query`, `execute`, `list_tables`, `describe_table`, `create_table` | Safe-by-default config (read-only unless `--allow-writes` / `MCP_SQLITE_ALLOW_WRITES`) |

When a bundled test launches the server by a bare relative filename (subprocess), add a
`tests/conftest.py` that resolves/`chdir`s to `scripts/` rather than editing the verbatim test module —
see `file-search` and `fuzzy-search`.

## Checklist

1. [ ] Create `plugins/<plugin-name>/scripts/<server>` (keep executable bit / shebang if applicable)
2. [ ] Create `plugins/<plugin-name>/.mcp.json` (server key drives the tool id)
3. [ ] Create `plugins/<plugin-name>/.claude-plugin/plugin.json` (metadata only — required to pass `validate-strict`)
4. [ ] Create `plugins/<plugin-name>/README.md` (tools, prerequisites, env vars)
5. [ ] Add the marketplace.json entry with `"mcpServers": "./.mcp.json"`
6. [ ] Create `changelogs/<plugin-name>.md`
7. [ ] Update `CHANGELOG.md` under `## [Unreleased]`
8. [ ] `make validate-strict`
9. [ ] After install, **verify the real `mcp__plugin_..._...__<tool>` id** and reference it in any companion skill/docs

> **`plugin.json` is required for MCP-only plugins.** The structure validator emits a *warning* for any
> plugin with no `plugin.json`, `SKILL.md`, or `skills/` directory, and `make validate-strict` fails on
> warnings. A metadata-only `plugin.json` silences it. (Skills-only plugins don't need one because the
> `skills/` directory satisfies the check.)

## `.mcp.json` format

Declare a stdio server at the plugin root. Use `${CLAUDE_PLUGIN_ROOT}` for paths so the plugin is relocatable:

```json
{
  "mcpServers": {
    "<server-key>": {
      "command": "uv",
      "args": ["run", "--script", "${CLAUDE_PLUGIN_ROOT}/scripts/<server-script>.py"]
    }
  }
}
```

For a self-contained Python server, prefer a [PEP 723](https://peps.python.org/pep-0723/) inline-dependency
script run via `uv run --script` — no separate venv or `requirements.txt`, only `uv` as a prerequisite.

Keep vendored/ported server scripts **verbatim** from upstream. The repo's `ruff`/`black` targets only
cover `scripts/`, `tests/`, and explicitly-enumerated per-plugin paths, so a bundled server under
`plugins/*/scripts/` is out of scope and should not be reformatted (avoids divergence from upstream).

## MCP tool naming (important)

The server **key** in `.mcp.json` determines the tool id, but **the tool is namespaced by the plugin loader**:

```
mcp__plugin_<plugin-name>_<server-key>__<tool-name>
```

Example: the `sequential-thinking` plugin (server key `sequential-thinking`, tool `sequentialthinking`)
registers as `mcp__plugin_sequential-thinking_sequential-thinking__sequentialthinking`.

A directly-configured (non-plugin) MCP server instead uses the bare `mcp__<server-key>__<tool-name>`.
**Any skill or doc that references a plugin MCP tool by name must use the `mcp__plugin_...` form** — and
verify the real id by inspecting the available tools after installing the plugin, not by assuming. (This
exact mismatch caused the v0.15.1 ultrathink fix.)

## marketplace.json entry

Same as a skill entry, but use `"mcpServers": "./.mcp.json"` instead of `"skills": ["./skills"]`:

```json
{
  "name": "sequential-thinking",
  "version": "1.0.0",
  "source": "./plugins/sequential-thinking",
  "description": "MCP server exposing a single sequentialthinking tool for dynamic, reflective, step-by-step problem-solving. Use when a task needs structured reasoning, planning, hypothesis generation, branching, or revising earlier steps.",
  "author": { "name": "Alberto Leal" },
  "repository": "https://github.com/dashed/claude-marketplace/tree/master/plugins/sequential-thinking",
  "license": "MIT",
  "keywords": ["mcp", "sequential-thinking", "reasoning"],
  "strict": false,
  "mcpServers": "./.mcp.json"
}
```

A plugin may declare both `"skills": [...]` and `"mcpServers": "./.mcp.json"` if it ships both. Do **not**
also inline `mcpServers` in `plugin.json` when `.mcp.json` exists — `.mcp.json` is the single source of
truth (avoids double-registration).
