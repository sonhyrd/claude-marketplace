# pw-prove — Step 1 reference: Dispatch + Environment

Moved verbatim from `SKILL.md`, whose Step 1 says when to read it. Nothing here changes the procedure `SKILL.md` states.

## Run endings and stop reports (every mode)

Moved from the Pipeline Overview, which points here.

**A PR-mode run ends at Step 8's completion report, or at a sanctioned stop, and nowhere else.** The completion report is structurally invalid without its `Proof page`, `Mutation`, `Committed`, `Pushed`, and `PR comment` lines — and a stop never emits those lines, so the two endings can never be confused. PR-mode has exactly **two** sanctioned stops — a base-merge conflict (Step 3) and the **handover stop** (Step 7, the verify loop exhausted); everything else resolves from the contract with a stated assumption. The [context gate](../SKILL.md#context-gate--a-heavy-session-is-refused-not-survived) is a third ending and a different kind: it refuses *before* the run begins, so there is no run to stop.

**Stop reports (every mode).** A run that cannot legitimately produce coverage (flow absent, the proof target won't build or serve, auth wall with no discoverable credential) or cannot make its spec pass STOPs with a report — never a fabricated pass. In order:

1. **Verdict + where** — one line ("STOPPED at Step 3 — the build failed", "STOPPED at Step 3 — the preview server never answered").
2. **Target** — the flow/route/change requested.
3. **What was attempted** — the concrete bring-up/recon steps.
4. **Blocker evidence, verbatim** — the real error, HTTP status, or recon counts (`0 forms`, `HTTP 404`), never paraphrased.
5. **What was NOT produced** — state plainly what is missing: no spec/POM was written, or (at the handover stop) no *passing* spec and nothing committed. If a prior spec exists, that it was *not* run against the unavailable app and *not* reported green (a "pass" against a dead surface is the silent-always-pass anti-pattern this pipeline exists to avoid).
6. **How to unblock** — the one action that would let a re-run succeed, plus an offer to re-run.

**A stop still carries its `Learned:` line.** A stopped run is the one that learned the most
expensive thing in the repository, and the report is now the only place that lands — so a stop is
where the line matters most, not least. The [context gate](../SKILL.md#context-gate--a-heavy-session-is-refused-not-survived)
refusal is the one exception: it fires before any environment work, so there is nothing to report.

#### `Learned:` — what this run paid a live pass to find out

Everything a run discovers about a repository — that the tenant resolves by **subdomain**, so a proof
dialling `localhost` gets a `307` to `/login` and never sees the product; that the auth rung the app's
own e2e helper uses sits behind `import.meta.dev` and is compiled out of the proof target; that nine
of the eleven keys `.env.example` declares are not actually required — costs a live pass to learn.
**It goes in the report, to be read once by a human**, and nowhere else. A `Learned:` line is the
whole durable output of that spend.

**Admission test — a finding earns the line on all three, or it is not reported as learned:**

1. It is about the **repository**, never the change under proof.
2. It **cost a live pass** to learn — not something the next run reads off the config in ten seconds.
3. It is **still true next month**.

A fact that misses any part belongs in the ordinary body of the report, not on this line.

**The line has no skip form.** `Learned: nothing durable` is a real outcome and says the run learned
nothing that would outlive it; omitting the line is not the same statement, and the difference is
the whole reason the line is mandatory. One sentence per entry:

- `Learned: <N entries>` — then one sentence each.
- `Learned: nothing durable`

A stop never emits the Step 8 tail — nothing shipped. The [handover stop](../SKILL.md#the-handover-stop--pr-modes-exit-when-the-loop-is-exhausted) delivers this same report as a **PR comment**, because a report that only reaches the transcript reaches nobody waiting on the PR.

### Context gate — a heavy session is refused, not survived

**The first thing Step 1 does, before the confirmation gate and before any environment work.**

The threshold is written down because "heavy" is not assessable from inside a heavy session. It is
where a traced run lost two instructions it had read — a foreground probe start whose rule sat in
bold three lines above it, and a config declaration it had already been told not to pass — both
in the 200–250k band, in a run that opened at 196k because a calling skill chained into it.

**Refuse with the six-beat stop report** from the Pipeline Overview, filled in like this:

1. `pw-prove — REFUSED at the context gate: this session carries ~<measured>k tokens, and pw-prove needs under 100k.`
2. The change or surface that was requested.
3. Nothing was attempted — the gate runs before the mode dispatch.
4. The measured size and the threshold, as numbers.
5. No spec, no POM, nothing built, served, committed or pushed.
6. The exact invocation to paste into a fresh session — `/e2e:pw-prove <the original argument>` — plus the working directory it needs.

**This refusal has no `Learned:` line.** Every other stop carries one because the run got far enough
to learn something; this one fires before any environment work, so there is nothing to report.

**A caller cannot spend this gate on the user's behalf.** A calling skill that already asked its own
confirmation question has asked about *proceeding*, never about *where* — so the gate still fires,
and it is a statement rather than a question. The one thing that continues the run is the **user**
saying, in their own words, to run it in this session anyway; record that as an Assumptions line.

### Confirmation gate — model-invoked runs only

**Runs immediately after the context gate.** Nothing before Mode starts a process, writes a file, or
touches git — not the mode dispatch, not the environment facts.

The gate is what makes this skill safe to chain. A PR-mode run builds the app and serves it, checks out
and base-merges a branch in the user's worktree, records a HAR, commits, pushes, and comments on a
PR — none of which a user who never asked for it can take back.

Ask in **one** message, and say what is about to happen:

> `pw-prove` was invoked by `<the calling skill>`, not by you. It will build the app and serve it,
> check out and base-merge `<branch>`, generate and run a Playwright proof, then commit, push, and
> comment on PR #`<N>`. Run it?

- **Yes** → continue to Mode. Ask nothing else — every later decision is still resolved from the
  contract rather than asked (Step 4).
- **No, or no answer** → stop with one line: `pw-prove — declined at the confirmation gate; nothing
  was run.` Never a partial run, never a re-ask, never a "just the read-only part".

Once per run. A chained run that was confirmed does not re-ask at any later step.

### Mode

The mode steers **Step 2** (what to derive), **Step 4** (notify-and-continue vs approval gate), and the tail (**Step 8** is the PR-mode deliverable); Steps 3 and 5–7 are identical in every mode. `gh` unavailable → PR-mode falls back to plain `git` for the diff and asks the user to paste the PR/ticket description; never stop over a missing `gh`.

### Environment facts

| What | Where |
|------|-------|
| Playwright config | `playwright.config.ts` / `.js` (record its path — Step 7's proof config sits next to it) |
| Proof config | `<configDir>/playwright.proof.config.ts` — present = a previous run committed it, reuse untouched; absent = Step 7 writes it once |
| Base URL | `baseURL` in config → `PLAYWRIGHT_TEST_BASE_URL` → else ask |
| Test directory | config `testDir` → scan `e2e/`, `tests/`, `playwright/` |
| POM inventory | `models/`, `pages/`, `page-objects/` dirs; for each Page Object, record the route(s) it covers → `pomInventory` |
| Existing specs | `*.spec.ts` / `*.test.ts` in the test dir |
| Conventions doc | E2E section in `AGENTS.md`/`CLAUDE.md`/`CONTRIBUTING.md`; a designated seed spec |
| Test runner | `@playwright/test` in `package.json` or `require.resolve` succeeds. Neither → **greenfield**; Step 5b bootstraps the runner. |
