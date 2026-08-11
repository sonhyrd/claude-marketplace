---
name: pr-review
description: Carry a PR or branch from review to proof — three tracks at once (Standards and Spec from matt:code-review, plus a rule-driven file-by-file pass from sss:ocr-delegate) over one resolved diff, reported side by side with the agreements called out, then the Critical and High findings applied and committed, then translations synced when the repo has a translation config and the diff touched locales, then a Playwright proof of the result via e2e:pw-prove. Use when the user asks to review a PR, review a branch, get a second opinion on a diff, or wants a high-confidence review before merging.
license: MIT
compatibility: >
  Requires the `matt` and `sss` plugins from this marketplace, the `gh` CLI for
  PR mode, and the `ocr` CLI for the OCR track. A missing `ocr` degrades to two
  tracks. The proof stage needs the `e2e` plugin for `e2e:pw-prove`; without it
  the run writes the handoff artifact and stops there.
metadata:
  author: sonhyrd
  version: "1.0.0"
---

# PR Review

Four **stages** over one diff — a read stage that reports, then write stages that fix, sync and prove. The first runs three **tracks**, each in its own context, each scored on its own:

| Track | Source | Asks |
|-------|--------|------|
| Standards | `matt:code-review` | Does the code follow this repo's documented standards and avoid the smell baseline? |
| Spec | `matt:code-review` | Does the code do what the issue or PR body asked for? |
| OCR | `sss:ocr-delegate` | File by file, against resolved rules, with mandatory coverage — what's wrong here? |

A track that never sees another track's findings cannot be talked out of its own. Where two land on the same defect, that agreement is the strongest signal in the report — and in Step 4 it is what decides which fix lands first.

Tracks are concurrent and never merged; stages are serial and share one context and one working tree. Steps 1-3 are the read stage; every step after them writes — Step 4 fixes, Step 5 syncs, Step 6 proves. The read stage runs from any tree; the write stages need the tree to be at the PR head. Step 5 is conditional on top of that, and in a repo with no translation config is simply not there. One `BASE`, resolved in Step 1, holds from the first step to the last. See `CONTEXT.md`.

## Step 1 — Prep

Run this in the parent, before anything spawns. Its output is a set of **findings** the two skills verify on arrival rather than rediscover — one resolved `BASE` shared by all three tracks is what makes their reports comparable.

**PR mode:**

```bash
gh pr view <NUM> --json title,body,baseRefName,headRefName,commits
git fetch origin
HEAD_SHA=$(git rev-parse origin/<headRefName>)
BASE=$(git merge-base origin/<baseRefName> "$HEAD_SHA")
git diff "$BASE...$HEAD_SHA" --stat
```

**Both ends of the diff resolve to SHAs, and the tree is left where it stands.** Git reads between two SHAs from any working tree, so the read stage wants no checkout, no branch and no pull. That is what answers `fatal: '…' is already used by worktree at '…'`: the ordinary Orca case is a review running in a fresh worktree while the PR branch is live in the main clone, and a step that asks git only for SHAs is a step git has nothing to refuse.

**Stacked PRs.** `baseRefName` may itself be an open PR, and then `BASE` sits off the default branch:

```bash
gh pr list --head <baseRefName> --state open --json number
```

The merge-base formula already handles that — against the parent branch it yields this PR's own commits rather than the parent's, which is what keeps a stacked review off the parent's 86 unrelated files. What was missing was any statement of it, so a run holding `baseRefName` was not trusted to use it. The arithmetic is unchanged; the stack goes in the provenance line.

**Is this tree at the PR head?** `git rev-parse HEAD` against `$HEAD_SHA`. This is a finding like the others, and the one that decides whether the write stages exist — Step 4 owns what it does with it.

**Branch mode:** take the fixed point the user named (`main`, a tag, a SHA) and set `BASE` to it. `HEAD_SHA` is `HEAD`, so the tree is trivially at it.

**Echo one provenance line**, before any track is spawned:

```
BASE=<sha> (merge-base of origin/MAMAS-9316 ← stacked on open PR 3140) · HEAD=<sha> (origin/mamas-9299-x) · tree at PR head
```

Three fields, in both modes: the resolved `BASE` with the ref it came from and a stack clause where there is one, `HEAD_SHA` with its ref, and the tree verdict — `tree at PR head`, or `tree at <sha> — write stages off`. Branch mode fills the same slots with what it has: `BASE=<sha> (user-named fixed point 'main') · HEAD=<sha> · branch mode`. One line, printed before the fan-out, is the point: three tracks reading a base nobody printed is how a wrong one survives to the end of a run.

Then `which ocr`.

**Then resolve the two sync findings** — both of them here, off the one `BASE` the tracks share, so Step 5 decides from settled facts rather than re-reading the tree after the fixes have moved it:

```bash
CFG=.github/hyrd-trans-bot.json
[ -f "$CFG" ] && cat "$CFG"
```

No file, and the first finding is false and the second does not need asking. Otherwise read `localesDir` out of what it printed — the config is a handful of keys, so read it rather than shelling out to a JSON parser this skill would then depend on — and resolve the directory the way `translation-sync` Step 2 does: `localesDir` if it is set **and exists on disk**, else the first of `i18n/locales`, `app/locales`, `locales` that does. Only once that resolved to a real directory:

```bash
git diff --name-only "$BASE"..."$HEAD_SHA" -- "$DIR" | grep '\.json$'
```

Any output at all and the second finding is true. Do not run it with `$DIR` unset: git rejects an empty pathspec outright, and this line failing would be indistinguishable from the failures that are meant to stop the run. A config present but naming no resolvable directory is simply the second finding false — the sync has nowhere to read from — and that is a deliberate divergence from `translation-sync`, which stops with a named error in the same case. It gets to: it was invoked on purpose. Here the two findings only decide whether it is invoked at all.

Done when seven findings are in hand and the provenance line has been printed: the resolved `BASE` SHA, `HEAD_SHA` and whether this tree is at it, a non-empty diff, the spec source (the PR body plus any issue it closes, fetched with `gh` — or "none" in branch mode), whether `ocr` is on PATH, whether `.github/hyrd-trans-bot.json` exists at the repo root, and whether the diff touched locale JSON under the directory it resolves to. A bad ref or an empty diff stops here, naming which one failed. The tree finding never stops the run and neither sync finding does — the first decides whether the write stages exist, the other two decide whether Step 5 does.

## Step 2 — Load `matt:code-review`, fan out three

Invoke the Skill tool with `matt:code-review` **inline, in this context**. It loads its own two-axis briefs and the twelve-smell baseline, and hands you the fixed point it needs — which Step 1 already resolved, so give it the `BASE` SHA and the spec source as settled facts.

Then send **one** message with **three** `general-purpose` `Agent` calls. The loaded skill's step 4 says two; you send its two plus OCR, so all three tracks run concurrently at the same depth. This is the one instruction `pr-review` overrides in a skill it does not own — an upstream rewrite of that step is where it breaks.

- **Standards** and **Spec** — the two prompts `matt:code-review` step 4 specifies, verbatim, including the smell baseline it says to paste in full.
- **OCR** — invoke the Skill tool with `sss:ocr-delegate` in range mode (`--from`/`--to`), passing the PR title and body as `--background`. Review only: finish at its Step 6 and report. Return the structured comments plus the coverage summary — total, reviewable, reviewed and skipped file counts, the coverage rate over the reviewable set, and a reason for every skipped file.

With no `ocr` on PATH, send the two and open the report with: *OCR track skipped, no `ocr` on PATH — this is a plain `matt:code-review` run.* An `ocr` that is present but whose `delegate` sub-commands reject the skill's invocation degrades the same way, with the failing command quoted instead of the PATH note — it is a broken tool, not a review with nothing to say, and the two must never read alike in the report.

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

Report in chat. Posting to GitHub is a separate ask.

Done when all four sections are on screen and no file in the working tree has been modified. Step 4 starts from there and not before: a report written after the fixes exist is a report with hindsight in it, and the whole point of three unmerged tracks is output nobody got to soften.

## Step 4 — Fix

The stage that writes. Findings become edits, the edits get committed, and nothing is pushed.

**Step 1's tree finding gates this stage and the two after it.** Equal SHAs is the ordinary case and everything here runs. Unequal — a worktree cut from `main`, or one behind a push — means the tree holds different files from the ones the three tracks read, so Steps 4, 5 and 6 are all absent and the run ends after Step 3 with one line naming both SHAs: *write stages skipped: tree at `<sha>`, PR head is `<sha>`*.

This degrades rather than refusing, because the report is the expensive half and it is valid from any tree. It degrades *declaredly*, unlike Step 5's silence, because a review that produced no fixes because it could not is not the same as one that found nothing to fix and the reader has no other way to tell them apart. Fixes applied to files the tracks never read are not fixes, and a handoff artifact built off them is worse — `pw-prove` would prove a tree nobody reviewed.

### 4a. Assign a severity

Only the OCR track ships one — `critical`, `high`, `medium`, `low`, per finding. Take it as given. The two `matt:code-review` axes ship none, so assign here, in the parent:

| Finding | Severity |
|---------|----------|
| Any track calling it a bug, a security hole, or a data-loss risk | Critical |
| Standards: a hard violation of a documented repo standard | High |
| Spec: a requirement missing, partial, or implemented wrongly | High |
| Standards: a baseline smell — always a judgement call | Medium |
| Spec: scope creep, behaviour nobody asked for | Medium |

This grades findings, never tracks. Each track's report stays verbatim above and scored only against itself; ranking the tracks against each other is the merge the separation exists to prevent. The fix stage still has to know what to touch first.

### 4b. Order the work

Critical and High only, overlap-confirmed first:

1. Critical, two or more tracks
2. Critical, one track
3. High, two or more tracks
4. High, one track

**Overlap orders the work; it does not filter it.** A Critical only the OCR track caught is applied like any other Critical. Agreement buys confidence, and confidence buys position in the queue — not admission to it.

### 4c. Apply

Every Critical and High finding is **applied or explained**. There is no third outcome and silence is not one of them.

Apply it in the working tree. Where you cannot — the fix reaches outside the diff, the finding rests on a misreading, two findings contradict each other — that is a reason, and the reason goes in `## Fixes` under *Described*. "Ran out of turns" is not a reason.

Medium and Low are **described, never applied**. They are judgement calls by construction, and a review that quietly rewrote them is a refactor with a review stapled to it.

Then re-run whatever the repo documents as its own gate — its validation target, typecheck, or test command. A fix that breaks the build is a finding of its own: fix it, or revert that one fix and describe it instead.

### 4d. Report the boundary

A fifth section, underneath the four:

```markdown
## Fixes

### Applied
- <severity> · <tracks that found it> · <file:line> — what changed

### Described, not applied
- <severity> · <tracks> · <file:line> — the finding, and why it was not applied

### Medium and Low — described only
- <severity> · <tracks> · <file:line> — the finding
```

### 4e. Commit

Commit the applied fixes to the current branch in the repo's own subject-line style, naming the PR. **Never push.** Later stages own the pushing, and a third pusher makes the PR history unreadable.

A run that applied nothing commits nothing and says so — an empty commit claims work that did not happen.

Done when every Critical and High finding appears in `## Fixes` as Applied or Described, the tree is clean, and the branch is one commit ahead of where Step 3 left it.

## Step 5 — Sync

Conditional. It runs after the fix commit and before any proof, because an unsynced key renders as its raw dot-path — a browser pointed at a pre-sync server photographs `board.title` instead of the string the PR added.

Take both sync findings from Step 1. **Both true** — the repo has `.github/hyrd-trans-bot.json` and the diff touched locale JSON under the directory it resolves to — and the stage runs: invoke the Skill tool with `sss:translation-sync` and let it run its own steps end to end. It resolves its own config, validates its own token, and owns its own confirmation prompt and its own push; nothing here re-derives any of that.

**Either false and the stage is absent.** Not skipped-with-a-note, not a prompt asking whether to sync anyway — absent. No line in the report says it did not run. Almost every repo in reach of this skill has no translation config, so a stage that announced its own irrelevance would announce it on nearly every run.

Both conditions are load-bearing and neither implies the other:

| Config | Locale diff | Why |
|--------|-------------|-----|
| present | touched | Sync. There is a server, and this PR changed what should be on it. |
| present | untouched | No sync. Otherwise every PR in the two repos that have a config talks to the translation server, including the ones that touch no locale at all. |
| absent | touched | No sync. Locale JSON with no config is a repo with no server to sync to. |
| absent | absent | No sync — and this is every other repo, which is the point. |

Requiring both is also what makes the stage self-disabling everywhere else: the config is the repo saying it has a server, so nothing here maintains a list of repo names.

Run it even when Step 4 applied nothing and committed nothing. The findings are properties of the diff, not of the fixes, and a review that changed no code can still be reviewing a PR whose locale keys are not on the server yet.

Done when either `sss:translation-sync` has reported its own closing status line, or one of the two findings was false and nothing was said.

## Step 6 — Prove

The last stage. What the review concluded gets written down where `e2e:pw-prove` reads it, and then
`pw-prove` runs. Nothing here re-reviews and nothing here re-fixes.

### 6a. Ignore the artifact path first

`.pw-prove/` is expected to be gitignored in the target repo. Check before writing anything:

```bash
git check-ignore -q .pw-prove/handoff.json || echo "not ignored"
```

Not ignored → append `.pw-prove/` to the repo's root `.gitignore` and commit that one line on its
own, in the repo's subject-line style. Still never push.

The commit is deliberate: the artifact is written on every review this repo ever gets, so ignoring
it once for everyone beats each contributor's checkout carrying an untracked directory nobody
recognises. `.git/info/exclude` hides it with no commit at all and is the fallback where the repo's
policy forbids touching `.gitignore` — say in `## Fixes` which of the two you used.

Do this **before** 6b, not after. Review findings are not PR content, and an artifact written into
an un-ignored path sits in someone's `git status` from then on — `pw-prove` stages only the spec,
the POM and the HAR, so nothing downstream ever cleans it up.

### 6b. Write the handoff artifact

`.pw-prove/handoff.json` at the repo root. **`pw-prove` owns this schema** — it is the only reader,
and its `SKILL.md` (`plugins/e2e-skills/skills/pw-prove/SKILL.md` in this marketplace, Step 2 step 0)
is where the shape is defined. Write to it; do not
extend it. A key it does not read is a key nobody reads.

```jsonc
{
  "base":      "origin/main",   // the BASE Step 1 resolved — the same one all three tracks saw
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

- **`findings` is ordered, and the order is Step 4b's**: overlap-confirmed before single-track,
  Critical before High. "Highest confidence first" is what agreement between tracks bought.
- **Every severity ships**, Medium and Low included. Step 4 only *applies* Critical and High;
  `pw-prove` decides for itself which findings name a user-observable behaviour worth a scenario,
  and a finding withheld here is one it cannot weigh.
- **`fixes_applied` is the Applied list from 4d**, carrying the commit SHA from 4e.
- A run that applied nothing writes `"fixes_applied": []`. It does not skip the artifact — the
  findings are the payload, and a review that fixed nothing still has them.

**`head_sha` is `HEAD` at the moment this file is written — run `git rev-parse HEAD` here, last, once
every commit this run makes has landed** (Step 4e's, and 6a's `.gitignore` commit if there was one).
`pw-prove` compares it to `HEAD` and drops the whole file when they differ, so a SHA captured one
commit too early is not a stale artifact you get warned about — it is the review silently thrown
away. Nothing between here and the handoff may commit; once `pw-prove` has it, its commits are its
own business.

### 6c. Hand into `pw-prove`

Invoke the Skill tool with `e2e:pw-prove`, passing the PR number (or the branch and `BASE` in branch
mode). It reads the artifact itself in its own Step 2 — the handoff is the file, not the prompt.

- **Its confirmation gate fires here, and that is the point.** A model invoked it, so it asks before
  a browser bring-up, a HAR record, a commit and a push. Do not try to pre-answer or suppress it;
  it is the one human checkpoint in the run.
- **`pw-prove` owns everything from this point**, including the push. Do not run its steps ahead of
  it, and do not push to make its job smaller.
- **If it is not installed**, say so in one line and stop. The artifact is on disk and a later
  `/e2e:pw-prove <PR#>` picks up the same findings — that standalone path is why the file is written
  at all, and it is not a failure of this run.

Done when `.pw-prove/handoff.json` is on disk with a `head_sha` equal to `HEAD`, the path is
gitignored, and `pw-prove` has either reached its own pipeline or been reported absent.

## Why inline

`matt:code-review` fans out on its own. Running it inside an agent of ours would put its two tracks a level below OCR's, betting that a spawned agent may itself spawn — a bet whose loss is silent, degrading a two-axis review to one context with nothing in the output saying so. Loading it here instead makes the bet unnecessary.

The rejected alternative was pasting its Standards and Spec briefs into this file to get three flat peers. That buys the same shape at the price of a second copy of the smell baseline, owned forever — the duplication this composition exists to avoid.

## Gotchas

- **Coverage is the OCR track's contract.** A report without a coverage rate and a reason per skipped file means that agent stopped short; send it back rather than passing the gap on. A high rate over a handful of reviewable files is not coverage either — OCR excludes Markdown, so a skills or docs repo can report 100% having seen almost none of the diff.
- **Overlap is additive.** It names the agreements underneath three intact verbatim sections.
- **Step 1 resolves refs to SHAs, and that is load-bearing.** Reaching for a branch name there — a checkout to "make the later steps simpler" — reinstates a failure that cost a recovery detour in 3 of 8 logged runs, because the branch under review is usually live in another worktree. The later steps read `$HEAD_SHA` and the tree finding instead. `tests/bash/test-pr-review-step1-cases.sh` is what notices.
- **The handoff schema is `pw-prove`'s, not ours.** Adding a field here writes a key nothing reads;
  renaming one breaks the consumer silently, because an unparseable handoff is a handoff `pw-prove`
  is told to ignore without complaint. `tests/bash/test-pr-review-handoff-parity.sh` is what
  notices. If the contract is wrong, change it there and push the fork — not here.
- **`track`, `axis` and `stage` are distinct** — see `CONTEXT.md`. An axis is a question `matt:code-review` asks; a track is who ran it; a stage is one serial phase of the run.
- **Report before you write.** Editing a file before Step 3 has printed puts the fixes into the tracks' own reports and the four sections stop being evidence.
- **The sync gate is directory-level, and deliberately.** `hyrd-trans-bot.json`'s `path` and `exclude` scope *namespaces inside* the locale file, not paths on disk, and `translation-sync` applies them itself when it diffs. Re-implementing that scoping here would mean parsing the changed JSON to decide whether to invoke the skill that parses it — a second, staler copy of the one rule. A touched `{lang}.json` under the resolved directory is the whole condition; what actually moves is the sync's call.
- **Step 5 may push, and that is not a contradiction of Step 4.** Step 4 commits and never pushes because a third pusher makes the history unreadable; `translation-sync` owns its own empty re-trigger commit and push, which is exactly the "later stages own the pushing" Step 4 defers to. It pushes only when it actually applied something, on a non-default branch, with a clean index — so a run whose sync changed nothing ends with the fix commit still local, and that is the correct outcome, not a stage that failed.
- **Do not use OCR's fix mode for this.** `sss:ocr-delegate` has its own Step 7; the OCR track finishes at Step 6 and reports. Fixes are applied here, in the parent, from all three tracks at once — one agent fixing what only it found is how the overlap ordering gets bypassed.
