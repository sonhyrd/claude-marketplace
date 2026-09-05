# pr-review — Step 4 reference: Fix

Moved verbatim from `SKILL.md`, whose Step 4 says when to read it. Nothing here changes the procedure `SKILL.md` states.

The stage that writes. Findings become edits, the edits get committed and pushed, and the report Step 3 printed gets published on the PR.

**Step 1 already guaranteed the tree.** Its three guards stop the run rather than letting it reach here on a tree that is not the PR head, so this stage edits the same files all four tracks read. Fixes applied to files the tracks never read are not fixes, and a handoff artifact built off them is worse — `pw-prove` would prove a tree nobody reviewed.

### 4a. Grade for order, not for admission

Severity sets the fix queue's order and the grade the handoff artifact carries. **It does not decide what gets applied** — 4c's per-track table does.

Four tracks speak four vocabularies. This is the mapping between them, written once:

| Track | Native output | Our severity |
|-------|---------------|--------------|
| OCR | `critical`, `high`, `medium`, `low` | taken verbatim, never re-graded |
| OCR | `category`: `bug`, `security`, `performance`, `maintainability`, `test`, `style`, `documentation`, `other` | none — a category is not a grade |
| Standards | a hard violation of a documented repo standard | High |
| Standards | a baseline smell — a labelled heuristic | Medium |
| Spec | a requirement missing, partial, or implemented wrongly | High |
| Spec | scope creep, behaviour nobody asked for | Medium |
| Complexity | any of the five tags — `delete`, `stdlib`, `native`, `yagni`, `shrink` | Medium |

**A Complexity tag is not a grade either, and there is no tier above Medium here.** `ponytail-review` grades nothing; the tag says what kind of cut it is. Every one of them is Medium — over-engineering is a maintainability finding, and a track that is explicitly not looking at correctness cannot produce a Critical. Its `net: -<N> lines` line is a summary, not a finding: it gets no ID and it is never queued. **It is not dropped either** — Step 3's closing line for the track carries it, which is where a track's own score belongs.

**`bug` is OCR's category, not its severity.** A finding reading `severity: medium, category: bug` is Medium, and Medium is applied — the category says what kind of defect it is, and OCR already graded it. Reading the category as a grade is what promoted such findings to Critical and produced hybrids like `medium·bug`.

**Blocker means Critical** — one tier, two words for it. The handoff artifact's `severity` enum is `pw-prove`'s, and adding a tier to it is a cross-plugin change this skill routes rather than makes.

This grades findings, never tracks. Each track's report stays verbatim above and scored only against itself; ranking the tracks against each other is the merge the separation exists to prevent.

### 4b. Order the work

**Overlap orders the work; it does not filter it and it does not promote it.** A Critical only the OCR track caught is applied like any other Critical, and a finding two tracks agree on keeps the severity it arrived with. Agreement buys position in the queue — not admission to it, and not a grade.

### 4c. Admit, then apply

**Admission is per track.** A track we invoked on purpose, whose brief we wrote, is trusted at the level it reports — `docs/adr/0008-pr-review-trusts-its-tracks.md` is why:

**Complexity is gated by containment, on the same boundary Standards uses and for a sharper reason.** A `delete` or `yagni` cut is the removal of working code, so a cut reaching outside the diff deletes a colleague's code in a review commit — the one act 4c's Spec row already refuses. Inside the hunks it is this PR's own code and this PR's own review, which is what makes it applicable. A `shrink` that rewrites a hunk the PR added lands; a `yagni` that inlines an abstraction with callers elsewhere in the repo is described.

**Standards is gated by containment, not by the smell's name.** Four of the twelve baseline smells document fixes that restructure modules or inheritance, so the boundary is the diff's own hunks: a contained instance of any smell lands, and a fix that splits a module is described. That is what keeps a review commit a review commit rather than a module restructure.

**Spec scope creep is described and never applied.** Deleting working code a colleague wrote, on a heuristic, is a larger act than anything else in this stage.

**A reason off that list is not available.** "An outward-facing write you haven't authorized" and "ran out of turns" are the two observed inventions — the first is answered by the invocation itself, which authorizes 4e's push and 4f's comment along with the fixes, and the second describes the run rather than the finding. Neither admits a finding to *Described*: a finding closed on either one is a finding to apply.

A finding the table above never admitted carries the table's own wording instead — *scope creep* for Spec, `low` for OCR. The four reasons are for findings that were admitted and still could not land.

**Reason 4 is a recorded disposition, not a refusal.** A comment adds text; editing the PR description overwrites words the author wrote — and that difference, not loudness, is why the tree is this stage's to change and the description is not. So a PR-body finding is listed under *Described* with that reason and its suggested rewrite inline, and 4f carries that rewrite to the author on the PR itself rather than leaving it in the invoker's chat.

### 4d. Report the boundary

1. `Applied`
2. `Described, not applied`
3. `OCR Low — described only`

**`Described, not applied` is where a finding the commit does not carry belongs** — the misreading, the fix that reaches beyond the hunks, the PR-body finding under reason 4 carrying its suggested rewrite inline. That is the heading that keeps `Applied` an honest list of what landed while the accounting still adds up to Step 3's own count.

**A later fix pass re-emits all three headings in full**, superseding this section rather than appending a delta to it. Step 6b builds `fixes_applied` from the Applied list, so a partial section ships a stale artifact.

### 4e. Commit and push

A rejected push does not stop the run. 4f still posts, saying the fixes are local — a review nobody can read is a worse outcome than a review whose commit is one push behind.

Done when every finding ID Step 3 emitted appears exactly once across 4d's three `## Fixes` headings and the working tree is clean — with the applied fixes committed and pushed, or committed and reported as local when the push was rejected, or nothing committed at all because nothing was applied. Count the IDs against Step 3's own numbering before claiming the stage: an ID in none of the three headings is an unfinished stage, not a shorter one. The accounting is what the whole stage is for, so it is checked here rather than in 4f, which a branch-mode run never reaches.

### 4f. Publish the review on the PR

Every angle-bracketed name above is a placeholder, filled from what Step 1 resolved and 4e committed — the block is the shape of the header, not text to copy.

- **Reproduced, never regenerated.** Re-writing the tracks' text now that the fixes exist puts hindsight into the one output whose whole value is that nobody got to soften it — the same reason Step 3 prints before Step 4 edits.
- **The push line says where the fixes are.** It reads `Fixes committed locally as <sha> — not yet pushed.` when 4e's push was rejected, and it is omitted entirely when nothing was applied. `Applied` read against a diff that does not contain the fixes is exactly the misreading this line exists to prevent.
- **The header's SHAs are abbreviated.** These two are display, read by a person scanning a comment header, and GitHub links a short SHA to the same commit as the full one. Resolve them full, print them short.
- **The marker comment is written even though nothing reads it back today.** It costs one line, and it is what lets a later change find this skill's own comments without re-deriving which ones were ours.
- **One new comment per run, never an edit of an earlier one.** 4d's supersede-rather-than-append rule governs one live chat document; a PR thread is an append-only record other people quote and reply to, and rewriting a comment underneath a reply is how the reply stops making sense. *Never edit an earlier comment* is the rule; "one comment" is what it produces on every run whose body fits. An oversized body below is still one run's report — one logical report carried across n comments, not n runs — and none of those comments edits anything that was already there.
- **A run that applied nothing still posts**, its header naming the existing `HEAD` rather than a new SHA. Four tracks agreeing a PR needs nothing is a result, and suppressing it makes a clean review indistinguishable from a review that never ran.
- **An issue comment, not a formal review and not inline per-finding comments.** The tracks do not all carry reliable line anchors, so inline comments would half-fail on exactly the runs with the most findings.

**Past 65,536 characters GitHub rejects the whole write**, and four verbatim track reports plus `## Fixes` can reach that on a large diff. Split at `##` boundaries only, never mid-finding, across sequential comments each numbered `1/n`. Every finding ID reaching the PR is the property being protected, and a report that failed to post protects none of them.

**Every comment in a split carries the marker; only the first carries the header.** The marker's job is finding this skill's own comments, and a part left unmarked is a part a later "find our previous comments" pass would miss while its siblings are found. The header identifies one review — its track count, base and reviewed SHA describe the whole report, so repeating it on each part would read as several reviews. The `1/n` counter goes on every part instead, which is what tells a reader who landed on part 3 that there are two more.

**A failed comment prints the body in chat and the run carries on** to Steps 5 and 6. A GitHub outage costs the review its publication, not its proof — and that failure, like a rejected push, is loud in the invoker's chat, unlike the silent degradations the Step 1 gate exists to catch.
