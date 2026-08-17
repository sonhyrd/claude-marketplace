---
name: ocr-delegate
description: >
  Delegation mode for open-code-review (OCR). Instead of OCR calling an LLM
  endpoint, this skill instructs the host agent to perform the code review
  itself, using OCR only for deterministic engineering: file selection and
  rule resolution. Use when the host agent should drive the review with its
  own LLM capabilities.
license: Apache-2.0
compatibility: >
  Requires the `ocr` CLI installed (via `npm install -g
  @alibaba-group/open-code-review` or GitHub release binary). Does NOT
  require a configured LLM endpoint — delegation mode is LLM-free on the
  OCR side. `--format json` needs `ocr` >= 1.9.3; older releases reject it
  and Steps 1 and 2 fall back to parsing the text output.
metadata:
  author: alibaba
  homepage: https://github.com/alibaba/open-code-review
  version: "1.1.0"
---

# Open Code Review — Delegation Mode

A skill for performing AI code review where OCR provides deterministic engineering (file filtering, rule resolution) and the host agent performs the actual review using its own intelligence and tools.

## Prerequisites

```bash
ocr --version || echo "NOT INSTALLED"
```

If `ocr` is not installed, or is older than v1.9.3:

```bash
npm install -g @alibaba-group/open-code-review@latest
```

No LLM configuration is needed for delegation mode.

## Workflow

### Step 1: Preview — Determine What to Review

```bash
ocr delegate preview --format json [--from <ref> --to <ref>] [--commit <hash>] [--exclude <patterns>]
```

The JSON carries everything the rest of the workflow needs:

| Field | Use |
|-------|-----|
| `mode` | `workspace` / `range` / `commit` — picks the Step 3 git command |
| `from`, `to`, `commit`, `merge_base` | the refs Step 3 builds that command from |
| `reviewable_files[]` | `path`, `status`, `insertions`, `deletions` — the Step 4 checklist |
| `excluded_files[]` | same, plus `exclude_reason`. Out of scope; never in the checklist |
| `total_files`, `reviewable_count`, `excluded_count` | the Step 6 coverage numerator/denominator |

`coverage_rate` is **not** in the output — Step 6 computes it as reviewed ÷ `reviewable_count`.

**If `--format` is rejected** (`unknown flag: --format`, on `ocr` < 1.9.3), do not treat
that as a review with nothing to say — drop to the text output, which is parseable as-is:

```
# Files (12 reviewable / 26 total)

- mode: range
- from: origin/main
- to: feature
- merge_base: 47fcf0f…
- total_insertions: 2851
- total_deletions: 81

  - `path/reviewable.ts` [modified] +6/-1
~~- `path/skipped.md` [modified] +9/-0 (excluded: unsupported_ext)~~
```

The plain ` - ` bullets are the reviewable files; the `~~`-struck ones are excluded, each
with its reason in parentheses. Say in the report which path was taken — an old `ocr` is a
fact about the run, not a detail to swallow.

**Common invocations:**

| Scenario | Command |
|----------|---------|
| Workspace changes | `ocr delegate preview --format json` |
| Branch comparison | `ocr delegate preview --format json --from main --to feature` |
| Single commit | `ocr delegate preview --format json -c abc123` |

### Step 2: Get Rules for Files

```bash
ocr delegate rule --format json <path1> <path2> ...
```

Pass the reviewable file paths from Step 1. Output is `groups[]`, each with a `group_id`,
`source`, `pattern`, the `files` it covers, and the `rule` text itself — files sharing a
rule appear under one group, avoiding repetition. Same fallback as Step 1: without
`--format`, the text output carries the same groups.

### Step 3: Get Diffs

Use git directly based on the mode/ref info from Step 1:

**Range mode** (merge_base provided in preview output):
```bash
git diff <merge_base>..<to> -- <path>
```

**Commit mode**:
```bash
git show <commit> -- <path>
```

**Workspace mode**:
```bash
# Tracked files
git diff HEAD -- <path>
# New untracked files — read directly (entire file is new code)
cat <path>
```

### Step 4: Review Each File

Create a checklist containing every `reviewable_files` entry from Step 1 — never an
`excluded_files` one. For each:

Use `(path, status)` as the checklist identity. Workspace mode can report the same path twice when a staged deletion is followed by an untracked recreation.

1. Get its diff (Step 3)
2. Consult its Rule Group (from Step 2) for the review checklist
3. Conduct a thorough review, using appropriate context tools as needed
4. Mark the file `reviewed`, or `skipped` with a concrete reason

For large changes, review in bounded batches grouped by shared rules and diff size. Do not stop after finding the first high-severity issue.

### Step 5: Format Output

Each comment must follow this structure:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| path | string | yes | Relative file path |
| content | string | yes | Review comment describing the issue |
| start_line | integer | no | Start line in the new file |
| end_line | integer | no | End line in the new file |
| category | enum | no | bug, security, performance, maintainability, test, style, documentation, other |
| severity | enum | no | critical, high, medium, low |

### Step 6: Classify and Report

Before reporting, verify that every `reviewable_files` entry from Step 1 is accounted for.
Open the report with a coverage summary naming, in these words, **total files**
(`total_files`), **reviewable files** (`reviewable_count`), **reviewed files**, **skipped
files** and **coverage rate** — the rate is reviewed ÷ `reviewable_count`, not ÷
`total_files`, since the excluded files were never in scope. A skipped file must include
its reason.

Group findings by severity:

- **Critical/High**: Bugs, security issues, data loss risks — always report
- **Medium**: Performance concerns, error handling gaps, maintainability issues — report with context
- **Low**: Style nits, minor suggestions — report only if clearly valuable

Discard likely false positives silently.

### Step 7: Fix (Optional)

If the user requested "review and fix":
- Apply High/Critical fixes directly
- Describe Medium fixes that require manual intervention
- Skip Low-priority items unless trivial

## Sub-commands Reference

| Command | Purpose |
|---------|---------|
| `ocr delegate preview` | Which files to review + mode/ref metadata |
| `ocr delegate rule <path...>` | Review rules grouped by content |

## Shared Flags

| Flag | Description |
|------|-------------|
| `--from <ref>` | Source ref for range mode |
| `--to <ref>` | Target ref for range mode |
| `-c, --commit <hash>` | Single commit mode |
| `--repo <path>` | Repository root (default: cwd) |
| `--rule <path>` | Custom rule.json path |
| `--exclude <patterns>` | Comma-separated exclude patterns |
| `-b, --background <text>` | Business context |
| `-B, --background-file <path>` | Business context from Markdown file |
| `-f, --format <text\|json>` | Output format; `json` for agent integrations. `sarif` is rejected by delegate mode |
| `--max-git-procs <n>` | Max concurrent git subprocesses (default 16) |

## Gotchas

- **No LLM needed on OCR side** — delegation mode never calls an LLM. All intelligence comes from the host agent.
- **Rules are grouped** — Files sharing the same rule are grouped together in the output. You can pass any number of paths per call; for large changes, fetch rules per-batch as you review.
- **Working directory matters** — `ocr delegate` operates on the Git repo at the current directory. Use `--repo /path` to override.
- **Untracked files in workspace mode** — `preview` includes untracked files. For these, read the file directly instead of using `git diff`.
- **Background context** — pass `--background` to `preview` when you have requirement context; it appears in the output for your reference during review.
- **Coverage is mandatory** — every `reviewable_files` entry must end as reviewed or explicitly skipped; do not silently omit files.
- **`--format` is version-gated** — it reached `ocr delegate` in v1.9.3 (via the SARIF work) and did not exist in v1.8.10, where pinning it made every run through this skill exit on its first command and review nothing. That is why Step 1 states a fallback instead of assuming the flag. Check with `ocr --version` before blaming the diff.
- **Markdown-only repos get an empty review** — OCR excludes `.md` as `unsupported_ext`, so a docs or skills repo can preview 26 files and offer 2. That is a real limit of the tool, not a clean bill of health: say so in the report rather than letting a high coverage rate over a tiny reviewable set imply the diff was covered.