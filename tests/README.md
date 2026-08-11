# Tests

Repo-level tests for claude-marketplace tooling. Per-plugin test suites live with their plugin
(`make test-linear`, `make test-chrome-cdp`, `make test-sequential-thinking`, `make test-sqlite`,
`make test-file-search`, `make test-fuzzy-search`, `make test-react-bp`) and are not covered here.

## Directory structure

```
tests/
├── test_install_codex_skills.py     # scripts/install_codex_skills.py
├── test_manage_codex_skills.py      # scripts/manage_codex_skills.py
├── test_sync_codex_plugins.py       # scripts/sync_codex_plugins.py
├── bash/
│   ├── test-e2e-subtree-check.sh        # scripts/check-e2e-subtree.sh
│   ├── test-playwright.sh               # playwright plugin scripts
│   └── test-pr-review-handoff-parity.sh # pr-review ↔ pw-prove handoff schema
├── Dockerfile.playwright            # image for the playwright tests
└── README.md
```

## Running them

| Command | What it runs |
|---|---|
| `make test` | pytest over `tests/`, then `make test-linear` |
| `make test-cov` | the same with a coverage report |
| `make test-codex-skills` | Ruff, ty, format and drift checks plus the three Codex pytest files |
| `make check-codex-plugins` | generated Codex manifests are current (no test run) |
| `make test-e2e-subtree-check` | `tests/bash/test-e2e-subtree-check.sh` |
| `make test-pr-review-handoff-parity` | `tests/bash/test-pr-review-handoff-parity.sh` |
| `make test-playwright` | `tests/bash/test-playwright.sh` in Docker |
| `make test-playwright-local` | the same on the host (needs Playwright browsers) |
| `make test-playwright-shell` | interactive shell in the Playwright test image |

`make ci` runs `validate-strict test lint type-check format-check`. The Playwright tests are not in
it — they need Docker or a browser install, so they stay opt-in.

Bash tests are executable and take no arguments:

```bash
./tests/bash/test-e2e-subtree-check.sh
```

`test-e2e-subtree-check.sh` fetches the `e2e-fork` remote, so it needs network and is deliberately
outside `make validate`, which is static and offline.

## Writing a new bash test

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TESTS_PASSED=0
TESTS_FAILED=0

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT
```

1. Use script-relative paths, never hardcoded ones.
2. `trap cleanup EXIT` for anything written outside `$TMPDIR`.
3. Exit 0 when everything passed, 1 when anything failed — the Makefile relies on it.
4. Add a target to the Makefile and a row to the table above.
