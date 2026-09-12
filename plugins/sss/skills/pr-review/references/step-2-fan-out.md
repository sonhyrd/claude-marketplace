# pr-review — Step 2 reference: Load `matt-code-review`, fan out four

Moved verbatim from `SKILL.md`, whose Step 2 says when to read it. Nothing here changes the procedure `SKILL.md` states.

**The anchor is the two named briefs, not a sentence about tool calls.** That step used to end with "send a single message with two `Agent` tool calls", and this skill used to point at it by saying the loaded skill "says two". Upstream deleted that sentence in 1.2.3, deliberately, so the step reads on Codex and other harnesses instead of naming Claude Code's tools — and the override broke, pointing at words that were no longer there. Counting briefs survives that rewrite; counting calls did not.

**The Complexity track reviews the diff, not the repo.** Bound it to the changed hunks in its brief. `ponytail-review` will happily name deletable code anywhere it is pointed, and a track that returns cuts to files this PR never touched produces findings 4c can only describe, at the cost of a full agent.

**Every track prompt names the tree it reads**, in one clause — *this tree is at the PR head; read files directly.* Left unsaid, a track invents the opposite and routes every read through `git show`.

**Preflight proved `ocr` is installed, so the missing-tool branch is gone from this step.** What remains is the broken one: an `ocr` present enough to answer `--version` whose `delegate` sub-commands then reject the skill's invocation. Quote the failing command, send the other two, and open the report with the count Step 3 emits — a broken tool is a track that had something to say and could not, and the report says so in its first line. A rejected `--format json` is **not** that case: `sss:ocr-delegate` falls back to the text output on its own and the track runs in full, so degrading on it would throw away a working review.

### A track that stops without returning

A spawned track can come back `<status>stopped</status>` carrying a summary that opens *No completion record was found for background agent "<name>" from the previous session* and closes by saying the transcript is on disk and its progress is not lost. Read that closing clause literally, because it is both the truth and the instruction: **the work exists, and only the write-up was lost.**

**"From the previous session" describes the transcript, not the agent.** The phrase reads like a crashed process from some earlier run and sends the reader looking for wreckage; the agent is addressable right now, by id, and that is the whole recovery.

**Resume it by id; a fresh launch pays for the same review twice.** Send the track's agent id a message restating its brief and closing with *if you already have findings, report those — do not restart*. The observed recovery came back complete at `tool_uses: 0`, which is what a resumed write-up of finished work looks like. `SendMessage` is a deferred tool in most sessions, so load it first with `ToolSearch("select:SendMessage")`.

**A track that will not come back is counted, not absorbed.** Carry it into Step 3's count and name the axis that is missing. A review that quietly drops an axis is the same defect as a review that quietly drops a tool, and four unmerged tracks exist precisely so that no one of them can go missing unnoticed.

Done when every launched track has returned, or the ones that did not are named for Step 3 to count.

## Why inline

`matt-code-review` fans out on its own. Running it inside an agent of ours would put its two tracks a level below OCR's, betting that a spawned agent may itself spawn — a bet whose loss is silent, degrading a two-axis review to one context with nothing in the output saying so. Loading it here instead makes the bet unnecessary.

The rejected alternative was pasting its Standards and Spec briefs into this file to get four flat peers. That buys the same shape at the price of a second copy of the smell baseline, owned forever — the duplication this composition exists to avoid.
