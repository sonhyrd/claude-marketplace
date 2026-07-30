---
name: release-readiness
description: >-
  Read-only release-readiness report for the current git repo: finds the commits since the last
  release, the Jira tickets they bundle, each ticket's status, any blockers, and a suggested next
  version — then prints the report and copies it to the clipboard. It NEVER writes (no tags, no
  releases, no Jira changes). Use this whenever the user is preparing, cutting, reviewing, or
  sanity-checking a release — e.g. "am I ready to release?", "is widget ready to ship?", "what's
  going into the next release?", "check release readiness", "are the tickets for this release
  done?", or any time they're about to tag or deploy to production — even if they never say the
  word "readiness". Do NOT use it to actually create a release, push a tag, or transition Jira
  tickets; it only assesses and reports.
argument-hint: "[baseline-tag] [branch]"
allowed-tools:
  - ToolSearch
  - Bash(git:*)
  - Bash(gh:*)
  - Bash(mktemp)
  - Bash(pbcopy)
  - mcp__claude_ai_Atlassian_Rovo__getAccessibleAtlassianResources
  - mcp__claude_ai_Atlassian_Rovo__searchJiraIssuesUsingJql
---

# Release Readiness

Assess whether the next release of THIS repo is safe to cut: find the commits since the last
release, the Jira tickets they bundle, each ticket's status, and flag anything blocking. Then
print a report and copy it to the clipboard.

**The deliverable is the printed report in your reply.** Gather the data in as few round-trips as
you can, then — the moment it's in — print the full report unprompted (Step 8). Do not stop at
"analysis done" and wait to be asked; the run isn't finished until the table is on screen.

## Execution Contract (non-negotiable)

This skill is **READ-ONLY** — that is the whole point of running it before a release, so it can be
invoked freely without risk. You are forbidden from:

- Creating tags, releases, or branches (`git tag`, `gh release create`, …)
- Transitioning, editing, or commenting on any Jira issue
- Pushing anything, or modifying the working tree

You only read git, read GitHub PR bodies, read Jira, and print/copy a report. If you find
blockers, you report them — you never fix or unblock them. (Executing the release is a separate,
gated step that is intentionally NOT part of this skill.)

**Printing ≠ running.** Step 9 ends the report with a ready-to-paste `gh release create … --draft`
command. That is output for a human — you write the text, you never execute it. Emitting the
command is allowed; running any `gh release create` / `git tag` / `git push` yourself is not.

## Inputs

- `$1` (optional): baseline tag override. If omitted, auto-detect (Step 1).
- `$2` (optional): branch to assess. Default `origin/main`.

**Guard against natural-language args.** Users invoke this with prose ("report me the table"), so
do not trust positional args blindly: only accept `$1` as a baseline if it looks like a tag
(`^v?[0-9]+\.[0-9]+\.[0-9]+`) and `$2` as a branch if `git rev-parse --verify` resolves it.
Otherwise ignore the args and auto-detect — a mis-parsed `baseline=me branch=the` is worse than
detecting.

**Say which branch you assessed.** Default is `origin/main`, but the user is often sitting on a
`hotfix-*` branch locally. Before reporting, if `git rev-parse --abbrev-ref HEAD` differs from the
assessed branch, state it in one line ("assessing `origin/main`; you're on `hotfix-v1.2.2`") so a
mismatch is caught before a wasted re-run — don't silently assess something other than where they are.

## Steps

### 1. Determine the baseline release

The baseline is **the actual latest prod release** — the highest semver tag *anywhere*, not just
the highest one merged into the branch. Refresh tags, then compute both and compare:

```bash
git fetch --tags --quiet origin
SEMVER='^v?[0-9]+\.[0-9]+\.[0-9]+$'
LATEST_ANY=$(git tag | grep -E "$SEMVER" | sort -V | tail -1)                       # true latest prod
LATEST_MERGED=$(git tag --merged origin/main | grep -E "$SEMVER" | sort -V | tail -1) # merged into branch
```

- Use `LATEST_ANY` as the baseline (if `$1` was given, use it instead).
- **Divergence check (field-validated):** if `LATEST_ANY != LATEST_MERGED`, the release line has
  forked from the branch — prod was tagged on a `hotfix-vX.Y.Z` (or similar) branch that was never
  merged back. `git tag --merged origin/main` alone would return a **stale** baseline and
  over-count already-shipped tickets. Warn loudly, then cross-check any surprising "already-done"
  ticket with `git branch -r --contains <commit>`, and flag the **re-ship hazard**: cutting the next
  release straight off the branch can silently re-introduce work the hotfix line intentionally
  reverted. That reconciliation is a human decision — report it, do not resolve it.
- If `LATEST_ANY` is empty (no prior release), warn: "No baseline tag found — assessing all of
  `<branch>` as unreleased" and use the repo root (`$(git rev-list --max-parents=0 HEAD | tail -1)`)
  as the lower bound.

### 2. Collect the commit range

Write the log to a temp file first — do NOT pipe `git log` straight into `grep` (inline pipes have
been bitten by shell-quoting / proxy buffering; the temp file is reliable):

```bash
RANGE="<baseline>..<branch>"
LOG=$(mktemp)
git log "$RANGE" --no-merges --format='%H%n%s%n%b%n---' > "$LOG"
git log "$RANGE" --format='%s %b' | grep -oE '#[0-9]+' | tr -d '#' | sort -u   # merged PR numbers
```

Note the commit count and the non-merge subjects (needed for Step 5's version inference).

### 3. Harvest ticket keys — the Jira ticket is the unit, PRs group under it

Harvest Jira keys from the commit log first (generic prefix, works on any repo's Jira project).
Match case-insensitively and upper-case the result so `mamas-8720` and `MAMAS-8720` collapse to one:

```bash
grep -oiE '[A-Z]{2,}-[0-9]+' "$LOG" | tr '[:lower:]' '[:upper:]' | sort -u
```

Now enrich from PRs — but **only where the commit log came up short**, and never one call per PR
over a padded list. Speed rules (field-validated: a run looped `gh pr view` over ~25 hand-typed
numbers — 7 of which were *issue refs, not PRs* — bloated output with raw bodies, and burned two
retries):

- The PR numbers are the `#NNNN` from Step 2's commit range — **use exactly those**, do not invent or
  pad the list.
- Skip any PR whose commit subject already yielded a ticket key. Only fetch the residual.
- For each residual PR, pull **title + branch + body** (the key is very often in the **title** or
  **branch**, not the body — PR #409's body listed `MAMAS-7556/8718/8719` but the deliverable
  `MAMAS-8720` was title-only, branch lowercase `alfred/mamas-7556-…`). **Pipe straight through
  `grep` — never dump a raw PR body into the transcript** (that is what forced the re-runs):

```bash
PR=$(gh pr view <N> --json title,body,headRefName -q '.title +"\n"+ .headRefName +"\n"+ .body' 2>/dev/null)
echo "$PR" | grep -oiE '[A-Z]{2,}-[0-9]+' | tr '[:lower:]' '[:upper:]' | sort -u            # Jira key(s)
echo "$PR" | grep -oiE '(close[sd]?|fix(e[sd])?|resolve[sd]?) #[0-9]+' | grep -oE '#[0-9]+' # fixed issue(s)
```

A number that `gh pr view` errors on is an **issue ref, not a PR** — drop it silently, don't retry.

**Invert the association to be ticket-keyed** — the report groups by Jira ticket, and one ticket can
span several PRs (feat PR + follow-up fix, FE + BE splits, …). Build `ticket → {prs[], fixesIssues[]}`:

- every harvested key adds its PR number to that ticket's `prs` (so multiple PRs collapse onto one ticket row),
- a ticket seen only in a commit (no PR) still gets a row, with `prs = —`,
- a PR that yields **no** Jira key is an **untracked PR** — list those separately (an orphan PR is worth
  seeing); do not invent a ticket for it.

Union and dedupe every key across all sources for the Jira query (Step 5).

### 4. Load Atlassian tools and resolve the cloud id

The Atlassian tools are deferred — load both in one call:

`ToolSearch("select:mcp__claude_ai_Atlassian_Rovo__getAccessibleAtlassianResources,mcp__claude_ai_Atlassian_Rovo__searchJiraIssuesUsingJql")`

Then call `getAccessibleAtlassianResources()` and take the cloud id (do not hardcode the site).

### 5. Query Jira for every harvested key

One batched call:

`searchJiraIssuesUsingJql(cloudId, jql="key in (K1, K2, …) ORDER BY key ASC", fields=["summary","status","issuetype"])`

(`issuetype` is needed for the scope guard in Step 6 — epics/parents get filtered out of the verdict.)

Pass `maxResults` = the number of keys so the call returns in one page. Read `summary`/`status`/
`issuetype` straight from the structured tool result — **do not pipe the raw JQL JSON into a Bash
extraction pass** (a real run wasted a round-trip stripping full ADF descriptions it never asked for).
If the tool returns extra fields anyway, ignore them; don't post-process.

- Keys Jira returns → real bundled tickets.
- Keys you harvested but Jira did **not** return → **dangling references** (typo, deleted issue,
  or a false positive like `UTF-8`). List them separately; never silently drop them — a real typo'd
  ticket hiding is worse than a visible false positive you ignore.

### 6. Classify each ticket and compute the verdict

| Bucket | Jira status |
|--------|-------------|
| ✅ ship-ready | `Ready to Release`, `Done`, `Closed` |
| ⚠️ warn | `Staging Done`, `QA Final Approval` |
| ❌ blocker | everything earlier (`QA Failed`, `In QA`, `In Progress`, `To Do`, …) |
| ⊘ out-of-scope | see scope guard below — **dropped from the table**, footnoted, never blocks |

The bar sits at `Ready to Release` because that is the status the team's own Jira workflow uses as
its prod gate — honoring it is the least surprising rule. `Staging Done` and `QA Final Approval` warn
rather than block: both are almost-ready, not signed off, and a real run wrongly hard-blocked
`MAMAS-8746` on `QA Final Approval`. Warning keeps them visible without crying wolf.

**Scope guard (field-validated — don't skip).** A flat status→bucket map over-blocks: a ticket that
a commit or PR merely *references* but that this repo does not ship is not a deliverable of this
release, yet lands ❌ and forces a false `NOT READY` (real cases: `FDE-731`, and backend-in-another-repo
tickets `MAMAS-8776`/`MAMAS-8778` that are "referenced only"). Reclassify these as **⊘ out-of-scope**:

- **Cross-project keys** — key whose project prefix ≠ the *majority* prefix of the range (e.g. one
  `FDE-*` among 18 `MAMAS-*`).
- **Cross-repo / referenced-only** — same prefix, but the ticket's deliverable lives in *another repo*
  (backend/other-service work this repo only calls). The summary usually says so ("BACKEND, other
  repo — referenced only"); the PR touches none of its files.
- **Epics / parents** — `issuetype` is `Epic` (an umbrella tracked separately, not shipped as a unit).

**Out-of-scope tickets are ignored: drop them from the ticket table entirely** — they are noise in
the row-per-ticket view. Surface them only as a compact one-line `Out-of-scope` footnote (Step 8) so
a mis-scope is still catchable. They never affect the verdict. If a reclassification feels wrong, say
so in one line rather than silently dropping what might be a real blocker.

**Verdict = the worst *in-scope* bucket present:** any ❌ → `NOT READY`; else any ⚠️ →
`READY WITH WARNINGS`; else `READY`. (Zero bundled tickets → `READY`, but explicitly note "no
tickets referenced" so a silent miss is visible.)

### 7. Suggest the next version (show the signal)

Infer a semver bump from the non-merge commit subjects:

- any `BREAKING CHANGE` in a body, or a `!` after the type (`feat!:`) → **major**
- else any `feat` → **minor**
- else → **patch**

Bump the baseline accordingly and print the evidence, e.g. `v1.2.3 → suggested v1.3.0 (2 feat, 5 fix)`.
Showing the signal keeps the number auditable in repos with loose commit conventions. This is
informational only — never create the tag.

### 8. Render and copy the report

**The report IS your reply. Author it as markdown text in your response — the moment the data is in,
print the full report, unprompted. Do not wait to be asked, do not summarize, do not say "done".**

> ⚠️ **Never build the report inside a Bash variable and pipe it to `pbcopy`.** `pbcopy` swallows
> stdout, so the Bash result shows nothing and the report never reaches the user — a real run did
> exactly this (`read -r -d '' REPORT <<EOF … | pbcopy`), printed nothing, then falsely claimed
> "printed above", and the user had to type "give me the report". The report living only in a shell
> variable or the clipboard is the bug.

Sequence, non-negotiable:
1. **Print the full report as your visible reply** (the table + footnotes + verdict, verbatim — every
   in-scope ticket, not a digest). This is the source of truth and must appear even if step 2 fails.
2. **Then**, as a *separate* best-effort step, copy it: `pbcopy` from a temp file you wrote, e.g.
   `printf '%s' "$REPORT" > "$LOG.txt" && pbcopy < "$LOG.txt"`. On non-macOS or any failure, add a
   one-line "clipboard copy skipped" note — the visible reply already stands.

Never claim the report was printed unless it is literally in your visible reply above.

The core is a **traceability table keyed by Jira ticket** — **one row per ticket**, with its status
and the PR(s) that carry it grouped into a cell (a ticket can span several PRs). This is the unit
reviewers reason about: "is this ticket shippable", not "is this PR". Order rows worst-bucket-first
so blockers are at the top.

```
RELEASE READINESS — <repo> — Readiness for <suggested version>   <✅ READY | ⚠️ READY WITH WARNINGS | ❌ NOT READY>
Range: <baseline>..<branch> · <M> in-scope tickets · <P> PRs · <N> commits · suggested <ver> (<X feat, Y fix → bump>)
```

| Jira | Status | Bucket | PRs | Summary |
|------|--------|--------|-----|---------|
| <KEY> | <status> | ✅/⚠️/❌ | #<pr>, #<pr> | <jira summary> |
| … | | | | |

The table lists **only in-scope tickets** (out-of-scope ⊘ and dangling keys go to the footnotes, not
here). Column rules — never leave a cell blank, use `—` so gaps are visible:
- **Jira** — the ticket; this is the row's identity. One row per ticket even if it has many PRs.
- **Status / Bucket / Summary** — from the Jira query (Step 5).
- **PRs** — every PR that references this ticket, comma-joined (`—` if it came only from a commit).

**"Fixes issue" is a conditional column — omit it entirely when it would be all `—`.** It shows the
GitHub *issue* a PR closes via `Fixes/Closes #N`. Teams that track work in **Jira don't file GitHub
issues**, so that keyword never appears and the column is dead weight (the Jira column already *is*
"the issue being fixed"). Only add a `Fixes issue` column **if at least one PR** in the range actually
closes a GitHub issue; otherwise leave it out.

Include a one-line **legend** under the table so the Bucket emoji is self-explanatory (a user asked
"why Bucket mean"): `Bucket: ✅ ship-ready · ⚠️ warn (Staging Done / QA Final Approval) · ❌ blocker`.

Then the summary lines and verdict:

```
Blockers (<n>):            <KEY> (<status>) — must reach Ready to Release before cutting
Warnings (<n>):            <KEY> (<status>) — not yet signed off
Out-of-scope (<n>):        <KEY> (<reason: epic / other project / other repo — referenced only>) — ignored, not in table, no effect on verdict
Dangling references (<n>): <KEY> — referenced in range but not found in Jira
Untracked PRs (<n>):       #<pr> <title> — no Jira key in title, branch, or body
Commits with no ticket (<n>): <sha> <subject>
```

End with the one-line verdict so it's the last thing on screen.

### 9. Hand off the draft-release command (do NOT run it)

The skill stays read-only, but the whole point of the report is to tee up the release. So the last
thing you print is the exact command a human can paste to cut the release **as a GitHub draft** —
you print it, you never execute it.

**Do not use GitHub's `--generate-notes`** — it emits one flat "What's Changed" list (every PR in
merge order, uncategorised). Instead **build grouped notes yourself** from the merged PRs (you
already have their numbers + titles from Steps 2–3). GitHub's native `release.yml` groups only by
PR *label*, and these PRs aren't labelled, so grouping has to come from the titles.

Classify each PR by its title's conventional-commit prefix, then by keyword fallback, then Other —
never drop a PR:

| Group | From |
|-------|------|
| Features | `feat` prefix; else title says add/implement/introduce/support |
| Fixes | `fix` prefix; else says fix/bug/revert-of-a-fix/correct |
| Performance | `perf` prefix |
| Maintenance | `refactor` `chore` `docs` `test` `build` `ci` `style` |
| Reverts | title starts `Revert` / `revert:` |
| Other | anything left (non-conventional titles) — keep it, don't guess wildly |

**No emoji anywhere in the release notes** — headings or bullets. The notes are a changelog someone
greps and pastes; the emoji were decoration.

One bullet per PR: `- <title, type prefix stripped> — <TICKET> (#<PR>)` (`—` no ticket → just `(#<PR>)`).
Drop empty groups. Order: Features, Fixes, Performance, Maintenance, Reverts, Other. Tip: a
revert+re-apply pair on the same ticket (e.g. a `fix` reverted then re-applied) is churn — net it to
the final state in one bullet rather than listing all three.

Then print the paste-ready command with the grouped notes piped in via stdin (self-contained, no temp
file), ending with a Full-Changelog compare link:

```
gh release create <suggested-ver> --target <branch> --draft --title <suggested-ver> --notes-file - <<'NOTES'
## Features
- <feat title> — <TICKET> (#<PR>)
## Fixes
- <fix title> — <TICKET> (#<PR>)

**Full Changelog**: https://github.com/<org>/<repo>/compare/<baseline>...<suggested-ver>
NOTES
```

Why this form (the team convention):
- **`--draft`** is the safety latch: a draft release does **not** create/push the real git tag until
  someone clicks Publish, so it cannot trigger a tag-push prod deploy. Only publishing does.
- **`--notes-file -`** feeds your grouped body from the heredoc, replacing the flat auto-notes; the
  compare link gives the same delta `--notes-start-tag <baseline>` would (true delta over current
  prod even when the line diverges — Step 1).
- **`--target <branch>`** creates the tag from the assessed branch (default `origin/main` → `main`).

If the verdict is ❌ NOT READY, still print the command but prefix it with a `# blocked:` comment
naming the blocking tickets, so it's obviously not to be run yet.

If it's ❌/⚠️ only because tickets are mid-flight and the user is clearly waiting on them, suggest
`/loop <interval> /release-readiness` to re-check on a cadence instead of re-running the skill by
hand — don't make them poll manually.
