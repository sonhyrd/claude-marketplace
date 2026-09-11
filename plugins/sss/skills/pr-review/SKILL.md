---
name: pr-review
description: Carry a PR or branch from review to proof — four tracks at once (Standards and Spec from matt:code-review, a rule-driven file-by-file pass from sss:ocr-delegate, and an over-engineering pass from ponytail:ponytail-review) over one resolved diff, reported side by side with the agreements called out, then the findings applied and committed without stopping to ask — every Standards and Spec finding, OCR's down to Medium, and every Complexity cut that stays inside the diff's own hunks — then pushed and the whole report published as a comment on the PR, then translations synced when the repo has a translation config and the diff touched locales, then a Playwright proof of the result, which pw-prove runs in a fresh session spawned into an Orca terminal rather than inline in this one. Use when the user asks to review a PR, review a branch, get a second opinion on a diff, or wants a high-confidence review before merging.
license: MIT
compatibility: >
  Requires the `matt` and `sss` plugins from this marketplace, `pw-prove` from
  `sonhyrd/agent-kit`, the `ponytail` plugin from `DietrichGebert/ponytail`, and
  four CLIs on PATH: `gh` for PR mode, `ocr` for the OCR track, the `orca` CLI
  for the session that runs the proof, and `git`. Step 1 preflights all of them and stops the run naming
  the one command that installs whichever is missing, so a run that starts can
  finish at full strength.
  `/sss:claude-settings` provisions the whole set in one pass.
metadata:
  author: sonhyrd
  version: "1.0.0"
---

# PR Review

Four **stages** over one diff — a read stage that reports, then write stages that fix, sync and prove. The first runs four **tracks**, each in its own context, each scored on its own:

| Track | Source | Asks |
|-------|--------|------|
| Standards | `matt:code-review` | Does the code follow this repo's documented standards and avoid the smell baseline? |
| Spec | `matt:code-review` | Does the code do what the issue or PR body asked for? |
| OCR | `sss:ocr-delegate` | File by file, against resolved rules, with mandatory coverage — what's wrong here? |
| Complexity | `ponytail:ponytail-review` | What can be deleted? Reinvented stdlib, unneeded dependency, abstraction with one implementation. |

## Step 1 — Prep

Read `references/step-1-prep.md` before this step.

### Preflight — what this run needs to finish

```bash
command -v gh git
ocr --version          # OCR track — any version
claude plugin list     # matt, sss and ponytail, all enabled
test -f ~/.claude/skills/pw-prove/SKILL.md  # pw-prove, from sonhyrd/agent-kit via teamai
```

```bash
ORCA=""
first=orca-ide; second=orca
if [ -n "${ORCA_PANE_KEY:-}" ] || [ "${TERM_PROGRAM:-}" = "Orca" ]; then
  first=orca; second=orca-ide
fi
for candidate in "$first" "$second"; do
  command -v "$candidate" >/dev/null 2>&1 || continue
  # Materialize the help before matching it: under `pipefail`, a `grep -q` that
  # exits on the first match can SIGPIPE the binary and turn a match into a
  # non-zero pipeline -- which reads as "answers nothing" about the one that does.
  help="$("$candidate" worktree --help 2>/dev/null || true)"
  grep -q '^Usage: orca worktree' <<<"$help" || continue
  ORCA="$candidate"; break
done
```

```bash
"$ORCA" worktree current --json    # proof spawn — must print JSON
```

**A failed preflight names the tool and the one command that fixes it, then stops the run:**

**PR mode. Run this block top to bottom** — everything unconditional in the stage is in it, in the order it has to happen:

```bash
gh pr view <NUM> --json title,body,baseRefName,headRefName,commits
git fetch origin
HEAD_SHA=$(git rev-parse origin/<headRefName>)             # resolve both ends
BASE=$(git merge-base origin/<baseRefName> "$HEAD_SHA")    # before the tree moves
gh repo view --json defaultBranchRef -q .defaultBranchRef.name
gh pr list --head <baseRefName> --state open --json number # only when <baseRefName> is not that default branch
git status --porcelain                                     # guard 1 — empty
git worktree list --porcelain                              # guard 2 — must not hold <headRefName>
git rev-list --count origin/<headRefName>..<headRefName>   # guard 3 — 0, or the command fails: no such branch
git switch -C <headRefName> "$HEAD_SHA"                    # a branch, not a detached HEAD: Step 4e commits and pushes
TREE_SHA=$(git rev-parse HEAD)                             # read after the acquisition, never inferred from it
git diff "$BASE...$HEAD_SHA" --stat
```

**Branch mode:** take the fixed point the user named (`main`, a tag, a SHA) and set `BASE` to it. `HEAD_SHA` is `HEAD`, so the tree is trivially at it and there is nothing to acquire — no guards, no `switch`.

**Echo one provenance line**, before any track is spawned:

```
BASE=<40-char> (merge-base of origin/MAMAS-9316 ← stacked on open PR 3140) · HEAD=<40-char> (origin/mamas-9299-x) · TREE=<40-char> = HEAD → tree at PR head
```

**Then resolve the two sync findings** — both of them here, off the one `BASE` the tracks share, so Step 5 decides from settled facts rather than re-reading the tree after the fixes have moved it:

```bash
CFG=.github/hyrd-trans-bot.json
[ -f "$CFG" ] && cat "$CFG"
```

```bash
git diff --name-only "$BASE"..."$HEAD_SHA" -- "$DIR" | grep '\.json$'
```

## Step 2 — Load `matt:code-review`, fan out four

Read `references/step-2-fan-out.md` before this step.

Invoke the Skill tool with `matt:code-review` **inline, in this context**. It loads its own two-axis briefs and the twelve-smell baseline, and hands you the fixed point it needs — which Step 1 already resolved, so give it the `BASE` SHA and the spec source as settled facts.

Then send **one** message with **four** `general-purpose` `Agent` calls. The loaded skill's step 4, *Spawn both sub-agents in parallel*, defines two briefs — **Standards** and **Spec**; you send those two plus OCR and Complexity, so all four tracks run concurrently at the same depth. This is the one instruction `pr-review` overrides in a skill it does not own.

- **Standards** and **Spec** — the two prompts `matt:code-review` step 4 specifies, verbatim, including the smell baseline it says to paste in full.
- **OCR** — invoke the Skill tool with `sss:ocr-delegate` in range mode (`--from`/`--to`), passing the PR title and body as `--background`. Review only: finish at its Step 6 and report. Return the structured comments plus the coverage summary — total, reviewable, reviewed and skipped file counts, the coverage rate over the reviewable set, and a reason for every skipped file.
- **Complexity** — invoke the Skill tool with `ponytail:ponytail-review` over `git diff <BASE>...<HEAD_SHA>`. Its output format is its own and is returned unedited: one line per finding, `<file>:L<line>: <tag> <what to cut>. <replacement>.` over the five tags `delete`, `stdlib`, `native`, `yagni`, `shrink`, closing on its `net: -<N> lines possible.` — or `Lean already. Ship.` when there is nothing to cut. Do not ask it for severities, and do not ask it to widen: correctness, security and performance are explicitly out of its scope, and three other tracks are already on them.

## Step 3 — Aggregate

Read `references/step-3-aggregate.md` before this step.

`## Standards`, `## Spec`, `## OCR`, `## Complexity` — each verbatim, in that order. **Number every finding as you emit it** — `S1, S2…` for Standards, `P1, P2…` for Spec, `O1, O2…` for OCR, `X1, X2…` for Complexity. The IDs are how Step 4 accounts for the whole set and how the user points at one in conversation; an unnumbered finding is one that can go missing between the report and the fixes. Then:

```markdown
## Overlap
Findings two or more tracks share, by ID (same file+line, or the same defect described differently).
Findings unique to one track, by ID.
```

## Step 4 — Fix

Read `references/step-4-fix.md` before this step.

### 4a. Grade for order, not for admission

### 4b. Order the work

Two rules:

1. **Overlap-confirmed findings first** — a defect two or more tracks landed on.
2. **Then severity descending** — Critical, then High, then Medium.

### 4c. Admit, then apply

| Track | Applied | Described only |
|-------|---------|----------------|
| Standards | every finding — hard violations and baseline smells alike | the fix reaches outside the diff's own hunks |
| Spec | requirements missing, partial, or implemented wrongly | scope creep — behaviour nobody asked for |
| OCR | `critical`, `high`, `medium` | `low` |
| Complexity | a cut contained in the diff's own hunks | a cut that reaches outside them |

Every admitted finding is then **applied or explained**. There is no third outcome and silence is not one of them. Apply it in the working tree; where you cannot, the reason comes from this list and nowhere else:

1. The fix reaches outside the diff's own hunks.
2. The finding rests on a misreading of the code.
3. Two findings contradict each other.
4. The finding targets PR metadata — the title or body — rather than the tree.

Then re-run whatever the repo documents as its own gate — its validation target, typecheck, or test command — **once, after every fix has landed**. A fix that breaks the build is a finding of its own: fix it, or revert that one fix and describe it instead.

### 4d. Report the boundary

A sixth section, underneath the five. **`## Fixes` is the run's accounting of its findings, and it has exactly three `###` headings, verbatim:**

Emit all three every time, empty ones included, and place every finding ID Step 3 emitted under exactly one of them.

```markdown
## Fixes

### Applied
- <ID> · <severity> · <tracks that found it> · <file:line> — what changed

### Described, not applied
- <ID> · <severity> · <tracks> · <file:line> — the finding, and its reason: one of 4c's four, or `scope creep`

### OCR Low — described only
- <ID> · <severity> · <tracks> · <file:line> — the finding
```

### 4e. Commit and push

Commit the applied fixes to the current branch in the repo's own subject-line style, naming the PR, then push that branch. **A plain push** — no force, no `--force-with-lease`, no `-u`. Step 1's third guard already proved the branch had nothing unpushed when the run started, so a non-fast-forward rejection here is a colleague's commit arriving mid-review, and forcing over it would discard their work to save a re-run. The fixes are pushed because the invoker asked for them and cannot use them while they sit in one checkout; `docs/adr/0012-pr-review-publishes-its-own-review.md` is where the reversal of this stage's old no-push rule is recorded.

A run that applied nothing commits nothing and says so — an empty commit claims work that did not happen.

### 4f. Publish the review on the PR

**Runs when Step 1 resolved a PR number.** In branch mode this sub-step is absent — not skipped-with-a-note, not a prompt — the same shape Step 5 has in a repo with no translation config. There is no PR for the report to reach, and a line announcing that is a line about nothing.

Post one comment with `gh pr comment <NUM> --body-file -`, feeding the body on stdin — a body file written inside the repo would dirty the tree 4e's Done requires clean, and one written outside it is a temp file this stage would then own removing. Its body is **the aggregated report Step 3 printed, reproduced verbatim** — the track count, `## Standards`, `## Spec`, `## OCR`, `## Complexity`, `## Overlap` and the per-track closing lines — with 4d's `## Fixes` section appended, under this header:

```
<!-- sss:pr-review -->
**`sss:pr-review`** · <tracks that returned> of 4 tracks · base `<baseRef>` · reviewed `<headSha>`
Fixes committed and pushed as `<fixSha>`.
```

Done when the report is on the PR — as one comment, or as the whole numbered sequence an oversized body needed — or the `gh` call failed and its body is in chat instead.

## Step 5 — Sync

Read `references/step-5-sync.md` before this step.

Take both sync findings from Step 1. **Both true** — the repo has `.github/hyrd-trans-bot.json` and the diff touched locale JSON under the directory it resolves to — and the stage runs: invoke the Skill tool with `sss:translation-sync` and let it run its own steps end to end. It resolves its own config, validates its own token, and owns its own confirmation prompt and its own push; nothing here re-derives any of that.

**Either false and the stage is absent.** Not skipped-with-a-note, not a prompt asking whether to sync anyway — absent. No line in the report says it did not run. Almost every repo in reach of this skill has no translation config, so a stage that announced its own irrelevance would announce it on nearly every run.

Done when either `sss:translation-sync` has reported its own closing status line, or one of the two findings was false and nothing was said.

## Step 6 — Prove

Read `references/step-6-prove.md` before this step.

### 6a. Ignore the artifact path first

`.pw-prove/` is expected to be gitignored in the target repo. Check before writing anything:

```bash
git check-ignore -q .pw-prove/handoff.json || echo "not ignored"
```

Not ignored → append `.pw-prove/` to the repo's root `.gitignore` and commit that one line on its
own, in the repo's subject-line style. **Leave that commit local.** 4e's push has already happened
and 4f's comment names the SHA it left behind; `pw-prove` owns the pushing from the 6c spawn onward,
so a push here would move the branch past the commit the published review describes, for the sake of
one ignore line.

### 6b. Write the handoff artifact

```jsonc
{
  "base":      "origin/main",   // the BASE Step 1 resolved — the same one all four tracks saw
  "head_sha":  "<40-hex sha>",  // REQUIRED — `git rev-parse HEAD` read as you write this file
  "pr":        123,             // the PR number, or null in branch mode
  "findings":  [                // confirmed findings, highest confidence first
    { "title": "…", "severity": "Critical|High|Medium|Low", "file": "src/x.ts", "line": 12, "detail": "…" }
  ],
  "fixes_applied": [            // what Step 4 changed and committed
    { "title": "…", "file": "src/x.ts", "commit": "<sha>" }
  ]
}
```

**`head_sha` is `HEAD` at the moment this file is written — run `git rev-parse HEAD` here, last, once
every commit this run makes has landed** (Step 4e's, and 6a's `.gitignore` commit if there was one).
`pw-prove` compares it to `HEAD` and drops the whole file when they differ, so a SHA captured one
commit too early is not a stale artifact you get warned about — it is the review silently thrown
away. Nothing between here and the handoff may commit; once `pw-prove` has it, its commits are its
own business.

### 6c. Spawn a fresh session to run `pw-prove`

```bash
"$ORCA" terminal create --worktree active --command "claude '/pw-prove'" --json            # PR mode
"$ORCA" terminal create --worktree active --command "claude '/pw-prove <branch>'" --json   # branch mode
```

**A proof spawn never names a pull request.** In PR mode Step 1 left the PR's head branch checked
out, and `pw-prove` with nothing after it proves that branch's open PR on its own. Branch mode has
no PR to find, so it passes the branch name.

**Close on four things**: the artifact path, the terminal handle `terminal create` returned, the
`$ORCA terminal read --terminal <handle>` line that shows the proof's output, and one sentence saying
plainly that the proof is running there and is not verified here. A "Done" a reader takes for a
passed proof is the silent always-pass that `pw-prove` exists to prevent.

Done when `.pw-prove/handoff.json` is on disk with a `head_sha` equal to `HEAD`, the path is
gitignored, and either `terminal create` returned a handle that is on screen, or the paste line and
its working directory are. A handle is the evidence a session exists; a command that printed
something else is the paste-line branch.

## Gotchas

Read `references/gotchas.md` before Step 1 — every entry names the step it constrains.
