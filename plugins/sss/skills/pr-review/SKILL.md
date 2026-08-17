---
name: pr-review
description: Carry a PR or branch from review to proof — three tracks at once (Standards and Spec from matt:code-review, plus a rule-driven file-by-file pass from sss:ocr-delegate) over one resolved diff, reported side by side with the agreements called out, then the findings applied and committed without stopping to ask — every Standards and Spec finding, and OCR's down to Medium — then translations synced when the repo has a translation config and the diff touched locales, then a Playwright proof of the result via e2e:pw-prove. Use when the user asks to review a PR, review a branch, get a second opinion on a diff, or wants a high-confidence review before merging.
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

Tracks are concurrent and never merged; stages are serial and share one context and one working tree. Steps 1-3 are the read stage; every step after them writes — Step 4 fixes, Step 5 syncs, Step 6 proves. **Step 1 moves the tree to the PR head**, so every stage after it reads and writes the same files the tracks read. Where it cannot, it stops the run there rather than reporting on a tree the fixes could never reach. Step 5 is conditional on top of that, and in a repo with no translation config is simply not there. One `BASE`, resolved in Step 1, holds from the first step to the last. See `CONTEXT.md`.

## Step 1 — Prep

Run this in the parent, before anything spawns. Its output is a set of **findings** the two skills verify on arrival rather than rediscover — one resolved `BASE` shared by all three tracks is what makes their reports comparable.

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
git switch -C <headRefName> "$HEAD_SHA"                    # a branch, not a detached HEAD: Step 4e commits, Step 6c pushes
TREE_SHA=$(git rev-parse HEAD)                             # read after the acquisition, never inferred from it
git diff "$BASE...$HEAD_SHA" --stat
```

**Both ends resolve to SHAs before the tree moves**, so a bad ref stops the run with the tree where the user left it. There is no `git pull` in this stage: `fetch` plus a SHA is the whole resolution.

**The stacked probe is conditional on the default branch.** `baseRefName` may itself be an open PR, and then `BASE` sits off the default branch. Look that branch up — it is not always `main` — and run `gh pr list --head <baseRefName>` only when `baseRefName` differs from it. Aimed at the default branch the probe returns nothing and reads as *not stacked* by accident. An open parent PR goes in the provenance line's stack clause; the merge-base arithmetic is unchanged either way.

**Each guard names one thing `switch -C` would destroy**, which is why there are three: `-C` resets an existing local branch of that name.

- **Guard 1 — a dirty tree.** Uncommitted work stays exactly where the user left it: never stashed, never reset, never carried across into a review of files the PR does not contain. **The stop names the two routes back** — stash or commit the edits and re-run, or review the PR from a separate worktree so this checkout is never touched. Whose hands the stash is in is the whole distinction: the user popping their own costs them one command, where this skill holding it would own restoring that state across four stages and `pw-prove`'s push.
- **Guard 2 — `fatal: '…' is already used by worktree at '…'`, caught before it fires.** The ordinary Orca case, a review in a fresh worktree while the branch is live in the main clone. Only *another* worktree counts; the branch already being current here is the success path.
- **Guard 3 — unpushed commits.** A non-zero count is work `-C` would strand. The command failing means no such branch, which has nothing to lose.

**A failed guard prints the provenance line, then stops the run** — naming the guard and the corrective action, `re-run from <that worktree>`. No track spawns, no file is written, the tree does not move. The guards sit ahead of the Step 2 fan-out, so the stop costs a message and nothing else, and the write stages are never reached. The cost is stated rather than softened: on a guard failure there is no report at all until the user re-runs from a usable tree.

**Branch mode:** take the fixed point the user named (`main`, a tag, a SHA) and set `BASE` to it. `HEAD_SHA` is `HEAD`, so the tree is trivially at it and there is nothing to acquire — no guards, no `switch`.

**Echo one provenance line**, before any track is spawned:

```
BASE=<40-char> (merge-base of origin/MAMAS-9316 ← stacked on open PR 3140) · HEAD=<40-char> (origin/mamas-9299-x) · TREE=<40-char> = HEAD → tree at PR head
```

Four fields in PR mode, and **every SHA is the full 40 characters, never abbreviated** — a 40-character string gets copied where a 9-character one gets retyped, and one transposition survived into a track prompt and cost that track its base. `TREE` is whatever `git rev-parse HEAD` returned, so the verdict `tree at PR head` is a conclusion the reader draws from two printed SHAs rather than a claim to take on trust. The stack clause appears only where the probe found an open parent PR. Branch mode fills the same slots with what it has: `BASE=<40-char> (user-named fixed point 'main') · HEAD=<40-char> · branch mode`. One line, printed before the fan-out, is the point: three tracks reading a base nobody printed is how a wrong one survives to the end of a run.

Then `ocr --version` — the version, not just the presence, because `sss:ocr-delegate` takes a different path below v1.9.3 and the report should say which one ran.

**Then resolve the two sync findings** — both of them here, off the one `BASE` the tracks share, so Step 5 decides from settled facts rather than re-reading the tree after the fixes have moved it:

```bash
CFG=.github/hyrd-trans-bot.json
[ -f "$CFG" ] && cat "$CFG"
```

No file, and the first finding is false and the second does not need asking. Otherwise read `localesDir` out of what it printed — the config is a handful of keys, so read it rather than shelling out to a JSON parser this skill would then depend on — and resolve the directory the way `translation-sync` Step 2 does: `localesDir` if it is set **and exists on disk**, else the first of `i18n/locales`, `app/locales`, `locales` that does. Only once that resolved to a real directory:

```bash
git diff --name-only "$BASE"..."$HEAD_SHA" -- "$DIR" | grep '\.json$'
```

Any output at all and the second finding is true. Do not run it with `$DIR` unset: git rejects an empty pathspec outright, and this line failing would be indistinguishable from the failures that are meant to stop the run. A config present but naming no resolvable directory is simply the second finding false — the sync has nowhere to read from.

Done when the tree is acquired, seven findings are in hand, and the provenance line has been printed: the resolved `BASE` SHA, `HEAD_SHA` and the `TREE_SHA` read against it, a non-empty diff, the spec source (the PR body plus any issue it closes, fetched with `gh` — or "none" in branch mode), whether `ocr` is on PATH, whether `.github/hyrd-trans-bot.json` exists at the repo root, and whether the diff touched locale JSON under the directory it resolves to. A bad ref, an empty diff or a failed guard stops here, naming which one failed. Neither sync finding stops the run; the two of them decide whether Step 5 exists.

## Step 2 — Load `matt:code-review`, fan out three

Invoke the Skill tool with `matt:code-review` **inline, in this context**. It loads its own two-axis briefs and the twelve-smell baseline, and hands you the fixed point it needs — which Step 1 already resolved, so give it the `BASE` SHA and the spec source as settled facts.

Then send **one** message with **three** `general-purpose` `Agent` calls. The loaded skill's step 4, *Spawn both sub-agents in parallel*, defines two briefs — **Standards** and **Spec**; you send those two plus OCR, so all three tracks run concurrently at the same depth. This is the one instruction `pr-review` overrides in a skill it does not own.

**The anchor is the two named briefs, not a sentence about tool calls.** That step used to end with "send a single message with two `Agent` tool calls", and this skill used to point at it by saying the loaded skill "says two". Upstream deleted that sentence in 1.2.3, deliberately, so the step reads on Codex and other harnesses instead of naming Claude Code's tools — and the override broke, pointing at words that were no longer there. Counting briefs survives that rewrite; counting calls did not.

- **Standards** and **Spec** — the two prompts `matt:code-review` step 4 specifies, verbatim, including the smell baseline it says to paste in full.
- **OCR** — invoke the Skill tool with `sss:ocr-delegate` in range mode (`--from`/`--to`), passing the PR title and body as `--background`. Review only: finish at its Step 6 and report. Return the structured comments plus the coverage summary — total, reviewable, reviewed and skipped file counts, the coverage rate over the reviewable set, and a reason for every skipped file.

**Every track prompt names the tree it reads**, in one clause — *this tree is at the PR head; read files directly.* Left unsaid, a track invents the opposite and routes every read through `git show`.

With no `ocr` on PATH, send the two and open the report with: *OCR track skipped, no `ocr` on PATH — this is a plain `matt:code-review` run.* An `ocr` that is present but whose `delegate` sub-commands reject the skill's invocation degrades the same way, with the failing command quoted instead of the PATH note — it is a broken tool, not a review with nothing to say, and the two must never read alike in the report. A rejected `--format json` is **not** that case: `sss:ocr-delegate` falls back to the text output on its own and the track runs in full, so degrading on it would throw away a working review.

Done when every launched track has returned.

## Step 3 — Aggregate

`## Standards`, `## Spec`, `## OCR` — each verbatim, in that order. **Number every finding as you emit it** — `S1, S2…` for Standards, `P1, P2…` for Spec, `O1, O2…` for OCR. The IDs are how Step 4 accounts for the whole set and how the user points at one in conversation; an unnumbered finding is one that can go missing between the report and the fixes. Then:

```markdown
## Overlap
Findings two or more tracks share, by ID (same file+line, or the same defect described differently).
Findings unique to one track, by ID.
```

Compare the full text here in the parent: this is the one judgement in the skill that wants the verbatim reports present rather than a paraphrase.

Close with one line per track — finding count, worst issue within that track. Each track is scored on its own; a cross-track ranking is the merge the separation exists to prevent.

Report in chat. Posting to GitHub is a separate ask.

Done when all four sections are on screen, every finding carries an ID, and no file in the working tree has been modified. Step 4 starts from there and not before: a report written after the fixes exist is a report with hindsight in it, and the whole point of three unmerged tracks is output nobody got to soften.

**This boundary orders the work and asks nothing.** Nothing is edited before the report prints, and no confirmation is asked once it has — Step 4 begins immediately, on the report's own terms. The user who invoked this skill asked for the fixes, so an offer to stop here spends their turn re-typing a policy this skill already holds. The run's one human checkpoint is `pw-prove`'s own gate in Step 6.

## Step 4 — Fix

The stage that writes. Findings become edits, the edits get committed, and nothing is pushed.

**Step 1 already guaranteed the tree.** Its three guards stop the run rather than letting it reach here on a tree that is not the PR head, so this stage edits the same files all three tracks read. Fixes applied to files the tracks never read are not fixes, and a handoff artifact built off them is worse — `pw-prove` would prove a tree nobody reviewed.

### 4a. Grade for order, not for admission

Severity sets the fix queue's order and the grade the handoff artifact carries. **It does not decide what gets applied** — 4c's per-track table does.

Three tracks speak three vocabularies. This is the mapping between them, written once:

| Track | Native output | Our severity |
|-------|---------------|--------------|
| OCR | `critical`, `high`, `medium`, `low` | taken verbatim, never re-graded |
| OCR | `category`: `bug`, `security`, `performance`, `maintainability`, `test`, `style`, `documentation`, `other` | none — a category is not a grade |
| Standards | a hard violation of a documented repo standard | High |
| Standards | a baseline smell — a labelled heuristic | Medium |
| Spec | a requirement missing, partial, or implemented wrongly | High |
| Spec | scope creep, behaviour nobody asked for | Medium |

**`bug` is OCR's category, not its severity.** A finding reading `severity: medium, category: bug` is Medium, and Medium is applied — the category says what kind of defect it is, and OCR already graded it. Reading the category as a grade is what promoted such findings to Critical and produced hybrids like `medium·bug`.

**Blocker means Critical** — one tier, two words for it. The handoff artifact's `severity` enum is `pw-prove`'s, and adding a tier to it is a cross-plugin change this skill routes rather than makes.

This grades findings, never tracks. Each track's report stays verbatim above and scored only against itself; ranking the tracks against each other is the merge the separation exists to prevent.

### 4b. Order the work

Two rules:

1. **Overlap-confirmed findings first** — a defect two or more tracks landed on.
2. **Then severity descending** — Critical, then High, then Medium.

**Overlap orders the work; it does not filter it and it does not promote it.** A Critical only the OCR track caught is applied like any other Critical, and a finding two tracks agree on keeps the severity it arrived with. Agreement buys position in the queue — not admission to it, and not a grade.

### 4c. Admit, then apply

**Admission is per track.** A track we invoked on purpose, whose brief we wrote, is trusted at the level it reports — `docs/adr/0008-pr-review-trusts-its-tracks.md` is why:

| Track | Applied | Described only |
|-------|---------|----------------|
| Standards | every finding — hard violations and baseline smells alike | the fix reaches outside the diff's own hunks |
| Spec | requirements missing, partial, or implemented wrongly | scope creep — behaviour nobody asked for |
| OCR | `critical`, `high`, `medium` | `low` |

**Standards is gated by containment, not by the smell's name.** Four of the twelve baseline smells document fixes that restructure modules or inheritance, so the boundary is the diff's own hunks: a contained instance of any smell lands, and a fix that splits a module is described. That is what keeps a review commit a review commit rather than a module restructure.

**Spec scope creep is described and never applied.** Deleting working code a colleague wrote, on a heuristic, is a larger act than anything else in this stage.

Every admitted finding is then **applied or explained**. There is no third outcome and silence is not one of them. Apply it in the working tree; where you cannot, the reason comes from this list and nowhere else:

1. The fix reaches outside the diff's own hunks.
2. The finding rests on a misreading of the code.
3. Two findings contradict each other.
4. The finding targets PR metadata — the title or body — rather than the tree.

**A reason off that list is not available.** "An outward-facing write you haven't authorized" and "ran out of turns" are the two observed inventions — the first describes a push this stage never makes, the second describes the run rather than the finding. Neither admits a finding to *Described*: a finding closed on either one is a finding to apply.

A finding the table above never admitted carries the table's own wording instead — *scope creep* for Spec, `low` for OCR. The four reasons are for findings that were admitted and still could not land.

**Reason 4 is a recorded disposition, not a refusal.** Editing a PR description is a published write, louder than the push Step 4 already defers to later stages — so a PR-body finding is listed under *Described* with that reason, and the reader makes the edit themselves.

Then re-run whatever the repo documents as its own gate — its validation target, typecheck, or test command — **once, after every fix has landed**. A fix that breaks the build is a finding of its own: fix it, or revert that one fix and describe it instead.

### 4d. Report the boundary

A fifth section, underneath the four. **`## Fixes` is the run's accounting of its findings, and it has exactly three `###` headings, verbatim:**

1. `Applied`
2. `Described, not applied`
3. `OCR Low — described only`

Emit all three every time, empty ones included, and place every finding ID Step 3 emitted under exactly one of them.

**`Described, not applied` is where a finding the commit does not carry belongs** — the misreading, the fix that reaches beyond the hunks, the PR-body finding under reason 4 carrying its suggested rewrite inline. That is the heading that keeps `Applied` an honest list of what landed while the accounting still adds up to Step 3's own count.

```markdown
## Fixes

### Applied
- <ID> · <severity> · <tracks that found it> · <file:line> — what changed

### Described, not applied
- <ID> · <severity> · <tracks> · <file:line> — the finding, and its reason: one of 4c's four, or `scope creep`

### OCR Low — described only
- <ID> · <severity> · <tracks> · <file:line> — the finding
```

**A later fix pass re-emits all three headings in full**, superseding this section rather than appending a delta to it. Step 6b builds `fixes_applied` from the Applied list, so a partial section ships a stale artifact.

### 4e. Commit

Commit the applied fixes to the current branch in the repo's own subject-line style, naming the PR. **Never push.** Later stages own the pushing, and a third pusher makes the PR history unreadable.

A run that applied nothing commits nothing and says so — an empty commit claims work that did not happen.

Done when every finding ID Step 3 emitted appears exactly once across the three `## Fixes` headings, the tree is clean, and the branch is one commit ahead of where Step 3 left it. Count the IDs against Step 3's own numbering before claiming the stage: an ID in none of the three headings is an unfinished stage, not a shorter one.

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

**What the schema carries is `pw-prove`'s call, whatever a new key would or would not disturb in
this run.** The reader is the only party that can say what a field means, so routing the request
there is the answer with the information in it.

**Asked mid-run for a field this schema does not have, name the owner and carry on** — the answer is
where the change belongs, not the change. It is two files in two plugins plus a parity test and a
targeted push to the fork, which is a decision of its own and not a step of this review. Say so in
one line and finish the run.

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
- **Every severity ships**, including the findings Step 4 described rather than applied — OCR Low
  and Spec scope creep among them.
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
- **Step 1 checks out the PR head, and the *guards* are the load-bearing half.** Three of them stand between `switch -C` and work the user cannot get back — a dirty tree, the branch live in another worktree (the ordinary Orca case), unpushed commits. A guard that fails prints the provenance line and stops the run naming the worktree to re-run from; it does not carry on with a report. Revision four of one decision, the first two legible only from commit messages: `docs/adr/0007-pr-review-acquires-the-tree-in-step-1.md`. `tests/bash/test-pr-review-step1-cases.sh` is what notices.
- **The handoff schema is `pw-prove`'s, not ours.** Adding a field here writes a key nothing reads;
  renaming one breaks the consumer silently, because an unparseable handoff is a handoff `pw-prove`
  is told to ignore without complaint. `tests/bash/test-pr-review-handoff-parity.sh` is what
  notices. If the contract is wrong, that is a change in `pw-prove` and a push to the fork — which
  this run routes and does not make. **Neither half of that is edited away by a request to extend
  the schema**: an eval trial asked for one field and got the field, plus this Gotcha rewritten to
  permit it. A rule that yields to the first request it refuses was never a rule.
- **`track`, `axis` and `stage` are distinct** — see `CONTEXT.md`. An axis is a question `matt:code-review` asks; a track is who ran it; a stage is one serial phase of the run.
- **Report before you write — and then write.** Editing a file before Step 3 has printed puts the fixes into the tracks' own reports and the four sections stop being evidence. Asking permission after it has printed costs the user a turn to re-state a policy 4c already holds; the two rules are separate and both hold.
- **The fix stage edits the tree in place, exactly as Step 1 left it.** Step 1 owns every move the run makes, and by Step 4 the tree is already the one all three tracks read — including for the gate re-run, which runs against the fixes where they sit. Tidying it first would fix files nobody reviewed.
- **`matt:code-review` calls its smell baseline "always a judgement call", and 4c applies it anyway.** That tension is real and deliberate: the caution is calibrated for a skill that only reports, and `pr-review` cross-checks the same diff against two other tracks before it acts. `docs/adr/0008-pr-review-trusts-its-tracks.md` is where a reader who notices should land. Nothing in `matt:code-review` is edited — it is a verbatim subtree, and what changed is how this skill treats its output.
- **The sync gate is directory-level, and deliberately.** `hyrd-trans-bot.json`'s `path` and `exclude` scope *namespaces inside* the locale file, not paths on disk, and `translation-sync` applies them itself when it diffs. Re-implementing that scoping here would mean parsing the changed JSON to decide whether to invoke the skill that parses it — a second, staler copy of the one rule. A touched `{lang}.json` under the resolved directory is the whole condition; what actually moves is the sync's call.
- **Step 5 may push, and that is not a contradiction of Step 4.** Step 4 commits and never pushes because a third pusher makes the history unreadable; `translation-sync` owns its own empty re-trigger commit and push, which is exactly the "later stages own the pushing" Step 4 defers to. It pushes only when it actually applied something, on a non-default branch, with a clean index — so a run whose sync changed nothing ends with the fix commit still local, and that is the correct outcome, not a stage that failed.
- **Do not use OCR's fix mode for this.** `sss:ocr-delegate` has its own Step 7; the OCR track finishes at Step 6 and reports. Fixes are applied here, in the parent, from all three tracks at once — one agent fixing what only it found is how the overlap ordering gets bypassed.
