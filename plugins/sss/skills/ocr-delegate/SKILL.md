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
  OCR side.
metadata:
  author: alibaba
  homepage: https://github.com/alibaba/open-code-review
  version: "1.0.0"
---

# Open Code Review — Delegation Mode

A skill for performing AI code review where OCR provides deterministic engineering (file filtering, rule resolution) and the host agent performs the actual review using its own intelligence and tools.

## Prerequisites

```bash
which ocr || echo "NOT INSTALLED"
```

If `ocr` is not installed:

```bash
npm install -g @alibaba-group/open-code-review
```

No LLM configuration is needed for delegation mode.

## Workflow

### Step 1: Preview — Determine What to Review

```bash
ocr delegate preview [--from <ref> --to <ref>] [--commit <hash>] [--exclude <patterns>]
```

There is no `--format` flag on `ocr delegate` — passing one exits non-zero with
`unknown flag: --format`. The output is Markdown, and it is parseable as-is:

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

Read it as:
- **mode** (workspace / range / commit) and the **from / to / commit / merge_base**
  ref metadata, from the bullet list — this is what Step 3 builds git commands from
- **Reviewable files** — the plain ` - ` bullets: path, status, insertions/deletions
- **Excluded files** — the `~~`-struck bullets, each with its exclusion reason in
  parentheses. These are out of scope; only the reviewable ones need accounting for.

**Common invocations:**

| Scenario | Command |
|----------|---------|
| Workspace changes | `ocr delegate preview` |
| Branch comparison | `ocr delegate preview --from main --to feature` |
| Single commit | `ocr delegate preview -c abc123` |

### Step 2: Get Rules for Files

```bash
ocr delegate rule <path1> <path2> ...
```

Pass the reviewable file paths from Step 1. Output is grouped by rule content — files sharing the same rule appear under one group, avoiding repetition.

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

Create a checklist containing every reviewable file from Step 1 — the plain bullets,
not the `~~`-struck excluded ones. For each:

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

Before reporting, verify that every reviewable file from Step 1 is accounted for. Open
the report with a coverage summary naming, in these words, **total files**, **reviewable
files**, **reviewed files**, **skipped files** and **coverage rate** — the rate is over
the reviewable set, not the total, since the excluded files were never in scope. A
skipped file must include its reason.

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
| `--max-git-procs <n>` | Max concurrent git subprocesses (default 16) |

## Gotchas

- **No LLM needed on OCR side** — delegation mode never calls an LLM. All intelligence comes from the host agent.
- **Rules are grouped** — Files sharing the same rule are grouped together in the output. You can pass any number of paths per call; for large changes, fetch rules per-batch as you review.
- **Working directory matters** — `ocr delegate` operates on the Git repo at the current directory. Use `--repo /path` to override.
- **Untracked files in workspace mode** — `preview` includes untracked files. For these, read the file directly instead of using `git diff`.
- **Background context** — pass `--background` to `preview` when you have requirement context; it appears in the output for your reference during review.
- **Coverage is mandatory** — every reviewable file must end as reviewed or explicitly skipped; do not silently omit files.
- **Markdown-only repos get an empty review** — OCR excludes `.md` as `unsupported_ext`, so a docs or skills repo can preview 26 files and offer 2. That is a real limit of the tool, not a clean bill of health: say so in the report rather than letting a high coverage rate over a tiny reviewable set imply the diff was covered.