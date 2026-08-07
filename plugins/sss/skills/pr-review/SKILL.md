---
name: pr-review
description: Review a PR or branch on three tracks at once — Standards and Spec from matt:code-review, plus a rule-driven file-by-file pass from sss:ocr-delegate — over one resolved diff, reported side by side with the agreements called out. Use when the user asks to review a PR, review a branch, get a second opinion on a diff, or wants a high-confidence review before merging.
license: MIT
compatibility: >
  Requires the `matt` and `sss` plugins from this marketplace, the `gh` CLI for
  PR mode, and the `ocr` CLI for the OCR track. A missing `ocr` degrades to two
  tracks.
metadata:
  author: sonhyrd
  version: "1.0.0"
---

# PR Review

Three **tracks** over one diff, each in its own context, each scored on its own:

| Track | Source | Asks |
|-------|--------|------|
| Standards | `matt:code-review` | Does the code follow this repo's documented standards and avoid the smell baseline? |
| Spec | `matt:code-review` | Does the code do what the issue or PR body asked for? |
| OCR | `sss:ocr-delegate` | File by file, against resolved rules, with mandatory coverage — what's wrong here? |

A track that never sees another track's findings cannot be talked out of its own. Where two land on the same defect, that agreement is the strongest signal in the report.

## Step 1 — Prep

Run this in the parent, before anything spawns. Its output is a set of **findings** the two skills verify on arrival rather than rediscover — one resolved `BASE` shared by all three tracks is what makes their reports comparable.

**PR mode:**

```bash
gh pr view <NUM> --json title,body,baseRefName,headRefName,commits
git fetch origin && git checkout <headRefName> && git pull
BASE=$(git merge-base origin/<baseRefName> HEAD)
git diff $BASE...HEAD --stat
```

**Branch mode:** take the fixed point the user named (`main`, a tag, a SHA) and set `BASE` to it.

Then `which ocr`.

Done when four findings are in hand: the resolved `BASE` SHA, a non-empty diff, the spec source (the PR body plus any issue it closes, fetched with `gh` — or "none" in branch mode), and whether `ocr` is on PATH. A bad ref or an empty diff stops here, naming which one failed.

## Step 2 — Load `matt:code-review`, fan out three

Invoke the Skill tool with `matt:code-review` **inline, in this context**. It loads its own two-axis briefs and the twelve-smell baseline, and hands you the fixed point it needs — which Step 1 already resolved, so give it the `BASE` SHA and the spec source as settled facts.

Then send **one** message with **three** `general-purpose` `Agent` calls. The loaded skill's step 4 says two; you send its two plus OCR, so all three tracks run concurrently at the same depth. This is the one instruction `pr-review` overrides in a skill it does not own — an upstream rewrite of that step is where it breaks.

- **Standards** and **Spec** — the two prompts `matt:code-review` step 4 specifies, verbatim, including the smell baseline it says to paste in full.
- **OCR** — invoke the Skill tool with `sss:ocr-delegate` in range mode (`--from`/`--to`), passing the PR title and body as `--background`. Review only: finish at its Step 6 and report. Return the structured comments plus the coverage summary — `total_files`, `reviewed_files`, `skipped_files`, `coverage_rate`, and a reason for every skipped file.

With no `ocr` on PATH, send the two and open the report with: *OCR track skipped, no `ocr` on PATH — this is a plain `matt:code-review` run.*

Done when every launched track has returned.

## Step 3 — Aggregate

`## Standards`, `## Spec`, `## OCR` — each verbatim, in that order. Then:

```markdown
## Overlap
Findings two or more tracks share (same file+line, or the same defect described differently).
Findings unique to one track.
```

Compare the full text here in the parent: this is the one judgement in the skill that wants the verbatim reports present rather than a paraphrase.

Close with one line per track — finding count, worst issue within that track. Each track is scored on its own; a cross-track ranking is the merge the separation exists to prevent.

Report in chat. Posting to GitHub is a separate ask, and so is fixing anything — "review" means these four sections and a clean tree.

## Why inline

`matt:code-review` fans out on its own. Running it inside an agent of ours would put its two tracks a level below OCR's, betting that a spawned agent may itself spawn — a bet whose loss is silent, degrading a two-axis review to one context with nothing in the output saying so. Loading it here instead makes the bet unnecessary.

The rejected alternative was pasting its Standards and Spec briefs into this file to get three flat peers. That buys the same shape at the price of a second copy of the smell baseline, owned forever — the duplication this composition exists to avoid.

## Gotchas

- **Coverage is the OCR track's contract.** A report without `coverage_rate` and a reason per skipped file means that agent stopped short; send it back rather than passing the gap on.
- **Overlap is additive.** It names the agreements underneath three intact verbatim sections.
- **`track` and `axis` are distinct** — see `CONTEXT.md`. An axis is a question `matt:code-review` asks; a track is who ran it.
