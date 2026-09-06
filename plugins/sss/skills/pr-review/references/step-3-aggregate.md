# pr-review — Step 3 reference: Aggregate

Moved verbatim from `SKILL.md`, whose Step 3 says when to read it. Nothing here changes the procedure `SKILL.md` states.

**Open with the track count — `4 of 4 tracks reported`, or the shortfall and which axis it cost.** One line, first thing, before any section. Preflight makes the full count the ordinary case, so the line is usually a formality; it is written every time because the run where it is not a formality is the run that would otherwise read as complete while an axis is missing. A count is legible at a glance where a missing `## OCR` or `## Complexity` section is not.

Compare the full text here in the parent: this is the one judgement in the skill that wants the verbatim reports present rather than a paraphrase.

Close with one line per track — finding count, worst issue within that track. **The Complexity track's closing line carries its `net: -N lines possible.` verbatim**, because that number is the score `ponytail-review` gives itself, and this is the slot the report already has for a track's own score. It is the number the track reported, not a number the run achieved: only contained cuts land, so 4d's `Applied` list is what says how much of it the fix stage took. Each track is scored on its own; a cross-track ranking is the merge the separation exists to prevent.

Report in chat. Step 4f publishes this same text on the PR once the fixes have landed, reproduced rather than rewritten.

Done when the track count and all five sections are on screen, every finding carries an ID, and no file in the working tree has been modified. Step 4 starts from there and not before: a report written after the fixes exist is a report with hindsight in it, and the whole point of four unmerged tracks is output nobody got to soften.

**This boundary orders the work and asks nothing.** Nothing is edited before the report prints, and no confirmation is asked once it has — Step 4 begins immediately, on the report's own terms. The user who invoked this skill asked for the fixes, so an offer to stop here spends their turn re-typing a policy this skill already holds. Nothing later asks either: Step 6 spawns the proof unprompted, so this run has no human checkpoint anywhere — deliberately, and `docs/adr/0009-pr-review-spawns-the-proof-in-a-fresh-session.md` is where the trade is recorded.
