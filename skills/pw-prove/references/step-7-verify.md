# pw-prove — Step 7 reference: Verify

Moved verbatim from `SKILL.md`, whose Step 7 says when to read it. Nothing here changes the procedure `SKILL.md` states.

**1. Two preconditions, and both are phases of the audit verb.** The type check and the HAR bind run inside `proof-run.mjs audit`, before it spends a browser run — you do not run either by hand, and there is no documented raw fallback for either.

- **The type check** takes the e2e tsconfig when the project has one and the root one otherwise; that branch is the verb's, not yours, and a project with neither is skipped rather than failed. Exit **4** is a spec set that does not compile.
- **The HAR bind** takes the recording you pass as `--har` and binds it to a copy under `.pw-prove/`, which the verb then puts on the runner's own environment. **Pass `--har` only when the project has a recording**; omitted, the phase is skipped.

**The two verbs with no bind phase of their own still have to carry it.** `film` and `mutate` below run in a fresh environment each: unset there, the spec falls back to the committed placeheld recording and *every* read aborts under `notFound: 'abort'` — on the run whose footage gets published. So both carry `PW_PROVE_HAR=$PWD/.pw-prove/<feature>.api.har` as an inline assignment, exactly as written in their command blocks. The path is the one the audit summary's `phases.har_bind.out` names; read it there rather than reconstructing it.

**Exit 5 is a bind that cannot be made safe, in either of its two forms**, and the summary's `phases.har_bind.reason` says which:

| `reason` | What it means | What to do |
|---|---|---|
| `unbound-placeholder` | A placeholder sits in the replay **match key** — a `token=` in a URL, a matched POST body. That entry can never match, and left alone it aborts mid-run and reads as a broken application | The refusal names each one. Put this run's own value against it in a bindings file under `.pw-prove/` and pass `--bindings .pw-prove/bindings.json`, or re-record. Most recordings need none of this: a credential that travelled only in headers and cookies plays no part in the lookup and stays placeheld |
| `committable-output` | The project un-ignores `.pw-prove/`, so the bound copy would land where git tracks it — with a live credential in it | Stop un-ignoring the run's own directory. Never bind into a tracked path |

**When the project owns rebinding, drop `--origin` and say so.** Some repos ship their own replay helper that rebinds the recording to whatever origin the run is on (an `installApiHar()` over `routeFromHAR`, typically honouring `PW_PROVE_HAR` itself). You will have read it in Step 1. Where one is present, re-pointing the origin here duplicates work the app does at run time — so leave `--origin` off and note it in the report. **Keep everything else**: `--har` still goes in, and if the bind refuses on a placeholder in the match key that binding is still yours to do, because a repo-owned rebinder does not supply it. Dropping the recording entirely on the strength of a runtime helper is how a token in a query string turns back into an aborted read.

Unset in CI, the spec falls back to the committed HAR by construction.

**2a. In PR-mode, both runs execute the PR spec set** — every spec that proves this PR, not only the one this run wrote. A run that films its own delta delivers a proof page holding two chapters of a thirteen-scenario PR, and nothing in the artifact says so. **`proof-run.mjs audit` resolves that set** from the merge base, tags every spec `carried` or `written` in its summary, and stops on an empty one. You do not assemble it. **There is no raw-runner fallback anywhere in this step** — not for the audit run, not for the filming run, not for the mutation run: a fallback is a second copy, and the second copy is the one that drifts. A project whose invocation these flags cannot express is a defect report, not a bypass. The reasons behind each mechanic are in the module's header comment (`scripts/proof-run.mjs`); read it when you need to check a claim.

Target and coverage-gap mode prove one run's work by definition — pass the spec this run wrote as `--written` and the resolution comes back to that spec alone.

**A carried spec that goes red in the audit run is a finding, not a spec to heal** — the summary's `carried` tag is what tells you which one you are looking at. It passed on the run that wrote it, so a failure now says the PR moved the behaviour underneath it. Diagnose it like any other failure, and when the fix belongs in the *application* rather than the spec, report it with its evidence and leave the spec asserting what it always asserted. Loosening a carried assertion to get green deletes the only guard that caught the regression.

That resolved set is `<spec set>` below. It widens what is **filmed**. It does not widen what is **mutation-verified** — that scope is stated at the mutation check and is deliberately narrower.

**2b. Two runs of the same command: an audit run, then the filming run.** Both go through the committed proof config; the only difference is that the filming run sets `PW_PROVE_CLIP`/`PW_PROVE_W`/`PW_PROVE_H` and the audit run sets none of them.

| Run | What it is for | What it costs |
|---|---|---|
| **Audit run** — no `PW_PROVE_CLIP` | Getting the spec green (the whole heal loop happens here), and producing the traces the [hermetic audit](#hermetic-audit-before-the-filming-run) classifies | Cheapest form of the run: `trace: 'on'` is in the config, so traces arrive regardless, and every dwell is skipped |
| **Filming run** — `PW_PROVE_CLIP=1` | The clips that get delivered | The dwells, plus video encoding |

**The audit comes first because a hermetic finding is a spec edit, and a spec edit invalidates footage.** Fix it before filming and it costs one cheap re-run; fix it after and it costs the clips as well.

**Seed the third-party block list at recon, so the first audit usually has nothing to say.** After the probe pass writes its HAR (Step 3), read the recorded entries for origins outside the fixture's `**/api/**` scope — analytics, chat widgets, websocket polling — and block them in the generated spec. **Seeding is an optimisation and never a verdict**: the audit still classifies every request and still fails on any LIVE call missing a `// CARVE-OUT:` line, so a block list that missed something produces exactly the failure it produces today.

There is no `--video` CLI flag, so enable video via a **second config passed with `--config`** that spreads the project config and overrides `use`. That file is **static, project-agnostic and committed**: written once next to the detected `configPath` (so its relative import resolves), then reused verbatim by every later run.

- **Present** (a previous run committed it) → use it as-is. Do **not** rewrite, re-derive or "refresh" it; a per-run diff on this file is the churn it exists to remove.
- **Absent** → write it as below, taking the `webServer` branch the curl in Step 3 phase 5 already decided. No other substitutions, nothing else per-run in it; stage it in Step 8.

```ts
// <configDir>/playwright.proof.config.ts  (committed once, reused by every pw-prove run)
// Spreads the project config and overrides only `use`, so video + trace fall out of the proof
// run as byproducts. Recording size comes from the env the proof run sets (the effective
// viewport), defaulting to 1600x900 — Playwright's own default is the viewport scaled into an
// 800x800 box (~800x450, illegible), which is what this override exists to kill.
// Deliberately never sets `viewport`: the viewport pin belongs in the committed spec.
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const size = {
  width: Number(process.env.PW_PROVE_W) || 1600,
  height: Number(process.env.PW_PROVE_H) || 900,
};
// Set only when the dropped `webServer` was the project's sole source of `baseURL` (see below).
const baseURL = process.env.PW_PROVE_BASE_URL;

export default defineConfig({
  ...base,
  // The spread copies EVERY top-level key of the project config — `webServer` among them. Which way
  // this line goes was decided in Step 3 phase 5, by curling the url that entry declares:
  //   NOTHING ANSWERS THERE → keep the line, as here. That entry boots a DEVELOPMENT server the
  //     moment the runner starts, at an origin this run is not proving, and the proof target is
  //     defeated silently. Dropping Playwright's readiness wait is safe here and only here:
  //     pw-prove owns the server's lifecycle and preflight.mjs has already gated bring-up.
  //   THE PROOF TARGET ANSWERS THERE → DELETE this line. That entry is what builds and boots the
  //     origin under proof, and your running server means Playwright adopts it and never runs the
  //     command. Deleting the entry would leave the run with no origin at all.
  webServer: undefined,
  use: { ...(base.use ?? {}), ...(baseURL ? { baseURL } : {}), video: { mode: 'on', size }, trace: 'on' },
});
```

**`webServer: undefined` deletes `baseURL` too when Playwright was deriving it.** Playwright derives `use.baseURL` from `webServer.port`, and only while that entry lives: single object, `port` form — never `url`, never an array. So a project config shaped `webServer: { command, port }` with no `use.baseURL` of its own loses its base URL to the drop branch, and every relative `page.goto()` in the committed spec breaks. Recognise that one shape and carry `PW_PROVE_BASE_URL=<the proved origin>` on **every** runner invocation from Step 6 on, the way `PW_PROVE_W`/`PW_PROVE_H` are carried. The config line above stays inert for every other shape, so the file is still one file.

**An existing proof config is migrated once, in place, onto whichever branch the curl decided** — add `webServer: undefined` when nothing answers at the inherited entry's url, remove it when the proof target answers. Keep everything else, and stage it with this run. That is the one other sanctioned edit to a committed proof config besides a structural mismatch, and it is a one-time migration rather than a per-run rewrite, which stays forbidden.

The **only** legitimate reason to edit an existing proof config is a structural mismatch with the project's own config (below) — a one-time, committed fix, never a per-run edit.

**Clip fidelity — the Proof clip is reviewer-facing evidence.** Three properties make it usable; none of them re-runs the spec or post-processes the recording:

| | What | Why |
|---|---|---|
| **Size** | `PW_PROVE_W`/`PW_PROVE_H` = the effective viewport, from `code-rules.md` → Clip Fidelity | `video.size` is an *encoding* parameter only. It never changes rendering — the **viewport pin in the committed spec** does. That is why size arrives by env and the config stays static: it is the one per-run value, and it belongs on the command line, not in a file diff. Deliberately **do not** set `viewport` in the proof config: a viewport that exists only while filming means healing, the hermetic audit and the mutation check all ran against a rendering CI never produces. |
| **Payoff hold** | `PW_PROVE_CLIP=1` on this run only | Enables the spec's `// JUSTIFIED:` dwell. Under the **filming law** the variable may only add time, and the dwell sits outside every race window, so it cannot move pass/fail; CI never sets the variable and pays nothing. |
| **Framing** | Ungated `scrollIntoView({ block: 'center' })` in the committed spec, at the moment of the hold | A held payoff jammed against the screen edge, or pushed off-frame by a later re-render, is an unwatchable clip that passes every gate. Centring is a scroll, not a wait, so it is unconditional and CI renders identically. |

**Smoke one scenario before the first full audit of a spec this run just wrote.** A generated spec is usually wrong in bulk — one wrong root selector, one unbound HAR — so the full set spends every scenario's timeout to report one cause. Run the scenario traversing the most of the Locator Mapping Table (the primary happy path): it proves bring-up, auth, the HAR bind and the core locators for one scenario's price.

**Green → run the full set**, budget intact: a green run resets the attempt count. **Red → attempt 1: fix first.** Never re-run the full set unchanged — it spends attempt 2 of 3 to learn what the smoke run already said, and a repeated failure signature stalls the loop into refusing even the green run that would clear it. **Attempt 1 only**: from attempt 2 on, the rerun rule under *Failure handling* governs.

```bash
# SMOKE RUN — the first execution of a newly generated spec: one scenario, the same verb.
node <skill-base>/scripts/proof-run.mjs audit \
  --config <configDir>/playwright.proof.config.ts --test-dir <testDir> --base <base> \
  --written <the spec this run wrote> --grep "<the scenario that traverses the most of the table>" \
  --har <testDir>/<feature>.api.har --origin "$BASE_URL"     # both omitted when there is no recording
```

```bash
# AUDIT RUN — one command. It resolves the spec set, clears test-results/, invokes the runner with
# no PW_PROVE_CLIP (so no dwell is paid) and no worker override, and bounds the heal loop. trace:'on'
# is in the config, so the traces the hermetic audit reads arrive anyway.
node <skill-base>/scripts/proof-run.mjs audit \
  --config <configDir>/playwright.proof.config.ts --test-dir <testDir> --base <base> \
  --written <the spec this run wrote> \
  --har <testDir>/<feature>.api.har --origin "$BASE_URL"     # both omitted when there is no recording
# One JSON summary line on stdout carries the spec set with its carried/written tags, both
# precondition phases, the attempt count and the failure signature. Read it; do not re-derive any of
# it from the console output.

# ...green, then read phases.hermetic from the summary (the verb classified the run's own traces)
# and take any fix the carve-out judgement forces...

# FILMING RUN — one command. It runs the Step-6 clip-fidelity audit again as a PRECONDITION, clears
# test-results/ (the audit run's traces have served their purpose, and only the filming run's webms
# may be standing here at publish time), films the same spec set with PW_PROVE_CLIP=1 and the
# effective viewport the verdict declares, then extracts one frame per clip for you to read.
# PW_PROVE_HAR is the audit summary's phases.har_bind.out, made absolute. The film verb does not
# run the bind itself — it inherits this environment — and unset here every recorded read aborts
# on the run that gets published.
PW_PROVE_HAR="$PWD/.pw-prove/<feature>.api.har" \
  node <skill-base>/scripts/proof-run.mjs film \
  --config <configDir>/playwright.proof.config.ts --test-dir <testDir> --base <base> \
  --written <the spec this run wrote> \
  --project-config <the project's own playwright.config.ts> \
  --verdict <the Step-4 Assumptions block's Effective viewport line, verbatim>
# video records ONE webm per test (per AC). webms + their frames land under test-results/<...>/ ;
# the HTML report lands in playwright-report/. The JSON summary line carries every clip path with
# its MEASURED duration and whether a frame was extracted — that is Step 8's manifest source.
```

**Branch on the audit verb's exit code — each one is a different next move:**

| Exit | Meaning | What to do |
|---|---|---|
| `0` | The spec set went green | Read `phases.hermetic` and take the carve-out judgement below |
| `1` | Usage — a flag is missing or unknown | Fix the invocation; nothing was run |
| `2` | Unreadable input, or `npx` is not on PATH | Fix the flag it names; nothing was run |
| `3` | The spec set resolved **empty** | The resolution is wrong — a wrong `--base`, or a `--test-dir` that is not where the specs landed. Fix it; never proceed on an empty set |
| `4` | **The spec set does not compile** | Fix the type errors the phase printed and invoke the verb again. Nothing was run |
| `5` | **The HAR bind refused** | Read `phases.har_bind.reason` and take the row above. Nothing was run — never run the proof past this and let it surface as an aborted call |
| `6` | Tests red | Diagnose and heal, below. Rerun through this same verb with `--grep "<title>"` |
| `7` | **Checkpoint refusal** — the failure signature did not move, or the attempt bound is spent | Stop the loop. Do not attempt another fix: invoke `playwright-debugger` and take the handover stop |
| `15` | **The built artifact is marked stale** — the last mutation check reverted its mutation and did not rebuild | Nothing was run and nothing was cleared. What the server holds is not what the source says, so heal or evidence taken from it means nothing. Rebuild forcing the build, prove the restart, then `rm .pw-prove/artifact-stale` — the refusal prints the exact commands, in order |

Every summary carries all three phases whatever they did — `ok`, `skipped` (the project has no tsconfig, or no `--har` was passed), `failed`, `refused`, or **`not-reached`** on an exit that stopped before the phase ran at all (`3` and `7`, and any non-green exit for `hermetic`, which is asked only of a green run). `not-reached` is not `skipped`: the first says the question was never asked, the second says it was asked and had no answer to give.

**Branch on the film verb's exit code — `1`, `2` and `3` mean exactly what they mean above:**

| Exit | Meaning | What to do |
|---|---|---|
| `0` | The set was filmed | **Read every frame** (*Clip inspection* below), then the mutation check |
| `6` | The filming run went red | A spec green in the audit run and red under `PW_PROVE_CLIP` is a **filming-law violation** — the variable may only add time. Fix the spec, re-run the audit verb, film again |
| `12` | **Fidelity precondition refused** — the spec set does not carry the clip-fidelity contract | Nothing was filmed and `test-results/` is untouched. The audit's own output names the offending spec and the fix; apply it to the **committed spec** and film again. This holds for a `carried` spec too: the dwell is proof machinery, not an assertion about the PR's behaviour, so repairing it is not the loosening a carried failure forbids |
| `13` | **An undeclared live call from the audit stands** | Nothing was filmed and `test-results/` is untouched. The refusal names each call and the summary's `network.reason` says which kind it is: `undeclared` — mock the call, or add the `// CARVE-OUT:` line when the real round-trip **is** the AC, and film again (a declaration clears it with **no** second audit); `stale` — the spec set has moved since the audit that recorded these calls, so that record cannot speak for it. Run the audit verb again |
| `15` | **The built artifact is marked stale** — the last mutation check reverted its mutation and did not rebuild | Nothing was run and nothing was cleared. What the server holds is not what the source says, so heal or evidence taken from it means nothing. Rebuild forcing the build, prove the restart, then `rm .pw-prove/artifact-stale` — the refusal prints the exact commands, in order |

**Judging whether a carve-out that *is* present earns its place remains yours**; presence is all exit 13 computes. Declaring the carve-out clears it immediately; mocking the call — invisible in the spec's carve-out lines — needs the audit re-run.

**Running the fidelity audit at Step 6 does not license skipping it here.** A heal-loop edit between the two can have moved or dropped the dwell, so the verb enforces it again rather than trusting that it ran.

**The proof run is concurrent — the worker count is Playwright's.** The verb expresses no worker override by construction (ADR-0017), so the run takes Playwright's default of `cores/2` and the scenarios go together. Do not pin one in the committed proof config or in the project's `playwright.config` either.

Two things this does not license:

- **A spec whose scenarios contend over shared state still has to serialise, in the spec** — `test.describe.configure({ mode: 'serial' })`, with the reason in a comment beside it. Each test gets a fresh browser context, so nothing leaks that way; what interferes is scenarios racing for one record on a shared tenant. That is a property of the spec, and it belongs where the code is, never in a global flag that charges every other proof for it.
  **Ask the hermetic question first — mocking outranks serialising.** Hermetic-by-default (`code-rules.md` › Network Determinism) means a PR-mode spec should not be mutating a shared staging record at all: fixture both sides and the contention is gone, not scheduled around, and the scenarios keep full concurrency. Serialisation is for the residue that survives that question — a **declared carve-out**, where the live round-trip *is* the AC (cross-view persistence of a real write is the standard case) and a mock would be the thing making the assertion pass. Reach for `mode: 'serial'` only after naming why the mock is unavailable; reaching for it first fixes the schedule and leaves a spec that pollutes a shared tenant.
- **Serialisation is now a diagnostic, not a fix.** If *every* scenario times out at its first navigation, re-run the same spec **unchanged** with `npx --no-install playwright test <spec> --config … -j 1` — one command, one worker, that run only — and it separates a concurrency problem from a spec problem. That is a **diagnostic outside the proof run**, which is why the verb has no flag for it and why this raw invocation is not a fallback for one: it never enters the proof run, a config, or the committed spec. But against the built target that signature has **no known cause** — a preview compiles nothing — so a spec that then passes serialised is a **finding to report with its evidence**, not a box ticked on the way to green.

If the project config is not spread-friendly (a function export, or per-project `use` that must win), adapt the proof config **once** — a dedicated `use.video`/`use.trace` in its own `use` block, or per-project overrides — and commit that adaptation. Still never edit the project's `playwright.config`.

**No *gate* measures the finished webm — the agent looks instead** (*Clip inspection* below). One frame is extracted and read; its verdict informs you rather than vetoing the artifact.

Fidelity is still held at authoring time: `PW_PROVE_W`/`PW_PROVE_H` carry the Step-4 effective viewport, and a `pinned:` verdict has already produced a `test.use({ viewport })` line in the committed spec. A letterboxed clip means that pin is missing from the **spec** — fix it there, never by adding `viewport` to the proof config.

### Failure handling (max 3 auto-fix attempts, fewer if the failure stops changing)

Per attempt, diagnose the actual failure and apply the matching fix:

| Likely cause | Fix |
|---|---|
| Selector mismatch | Heal by intent: re-snapshot the live page, find the element the step semantically targets, write a fresh locator at the highest stable tier (role+name > placeholder > testid). Tweaking the old string re-breaks on the next DOM change. |
| Assertion failure | Fix expected values, add `{ timeout }` for slow elements |
| Structural | Fix missing `await`, wrong setup, incorrect `beforeEach` |
| Unrecorded call aborted (`notFound:'abort'`) | First check the binding: **every** read aborting means the HAR was not bound to this run — the audit verb was invoked without `--har`, or with an `--origin` that is not the origin this run proved — not that the recording is short. The summary's `phases.har_bind` says which of the two it was. A *particular* call aborting is a genuine miss — re-record with the probe (`RECORD_HAR`, navigate the missed interaction) or add a hand-mock; never widen to a live call |
| Every test errored — `Executable doesn't exist at …/chromium_headless_shell-…` (runner exit 2) | The browser was never installed — Playwright's binaries do not come from a package-manager install. This is the Step-3 `browser` phase's failure arriving late, so **do not heal, rebuild, or touch the spec**: run the install command that phase prints (`node <skill-base>/scripts/preflight.mjs browser` names it), then re-run. A run that got here with `BROWSER=skipped` in its bring-up summary is the expected path — the check was skipped, not passed. |
| **Zero** tests ran — `Timed out waiting <n>ms from config.webServer` | A live `webServer` entry existed and never became ready — that is all this message proves. Match on `from config.webServer`: the number is that entry's own `timeout`, not a constant, and the message names no url, so with an array it does not say which entry. Curl the entry's url: **nothing answers** → the proof config still inherits a development server, so add `webServer: undefined` (Step 7); **the proof target answers** → the entry is the right one and its own readiness check timed out, so re-read the url it declares against the proved origin. |
| **Zero** tests ran — nothing listening at the origin, connection refused on the first navigation | The opposite mistake: a `webServer` that builds and boots the proof target was dropped, so nothing produces the origin. A live entry makes this impossible, which is what tells it apart from the row above. Restore the entry in the proof config (Step 7), or bring the origin up yourself through `preflight.mjs`. |

**Rerun only what failed, and rerun through the same verb.** During the ≤3 attempts, run just the failing test(s) — the same `proof-run.mjs audit` invocation with `--grep "<title>"` added. Never reach for a raw runner call here: the attempt bound and the signature comparison only see the attempts that go through the verb, and an attempt they cannot see is an attempt that is not bounded. The full spec set runs **once** after the last fix, as the gate — the same command with `--grep` dropped. A **type-only fix** is gated by `tsc` — batch it into the next behavioral rerun.

**Token diet.** Inside the fix loop, run tool calls back-to-back — no prose narration between them; the diagnosis lands in the fix. Write the spec **once** from the `pomInventory` + Locator Mapping Table — never scaffold a throwaway skeleton and rewrite it. **Non-deliverable spec probes are forbidden** — no `_recon.spec.ts`, no `zz-debug.spec.ts`: the probe is the recon channel, the test runner is not a REPL.

**No-progress checkpoint — the bound is three attempts, but not three retries.** The verb owns it: it records and persists each attempt's **failure signature** and exits **7** on the attempt that repeats an unchanged one, or on any invocation past the bound. Exit 7 is not a failure to diagnose harder: it is the loop ending, and the remaining attempt is deliberately unspent.

When the loop ends without a green run — three attempts spent, or the checkpoint tripped at two — **invoke `playwright-debugger`** (Skill tool) pointed at `playwright-report/` (HTML + traces) for the diagnosis. Do not attempt a 4th fix. Then stop: PR-mode takes the handover stop below; target and coverage-gap modes emit the stop report from the Pipeline Overview.

### The handover stop — PR-mode's exit when the loop is exhausted

The second sanctioned PR-mode stop. The instinct to write a handover is right; a handover filed in a repo directory reaches nobody watching the PR. **The destination is a PR comment.**

**Write the six-beat stop report** from the Pipeline Overview — verdict + where, target, what was attempted, blocker evidence verbatim, what was NOT produced, how to unblock — with these values:

- **Beat 1** — `pw-prove — HANDOVER STOP at Step 7: <N> fix attempts, no green run` (or `… stopped at attempt 2 — unchanged failure signature`).
- **Beat 3** — every fix already attempted, and why each one did not move the failure signature.
- **Beat 4** — the runner's own output for the last attempt (error class, locator, stack, attempt/retry counts), never paraphrased.
- **Beat 5** — no *passing* spec; nothing committed, nothing pushed, no proof page.
- **Beat 6** — the one change (usually in the app, not the spec) that would let a re-run pass.

Plus two additions this stop alone carries, because the next agent inherits them instead of re-deriving them:

- **The spec, verbatim** — the generated spec and POM in fenced blocks. This is the *only* place they land; see below.
- **The diagnosis** — `playwright-debugger`'s F-code verdict and its named cause.

**REQUIRED — post it with `gh pr comment` before ending the run.** The stop is not taken until the comment exists; a handover that only reaches the transcript is a non-delivery.

**Nothing is committed to the branch, and nothing is pushed.** A knowingly-failing spec on the branch is precisely the defect this pipeline exists to prevent, so the spec travels in the comment body rather than in a commit. Run the Step-8 hygiene beats that release resources — stop a dev server this run started, sweep `test-results/` — and nothing else from Step 8.

**Never emit the delivery tail.** No `Proof page`, `Mutation`, `Committed`, `Pushed` or `PR comment: <proof link>` lines: the completion report's shape is what distinguishes a delivered proof from a reported non-delivery, and a stop that borrows the tail is indistinguishable from a proof that shipped.

A **flaky verdict** (passed only on retry) is not clean — diagnose once. If the nondeterminism is app-inherent (the app races its own state), remove the scenario on this evidence and report its AC as `unproven — gated: nondeterministic (<cause>)`.

### Hermetic audit (on the audit run, before anything is filmed)

The spec is hermetic by default, and **the audit verb already classified the run** — the phase runs on a green run, over the run's own traces, once per spec in the set. You do not invoke a classifier and you do not hand-write a trace parser. Read `phases.hermetic` from the summary:

| Field | What it holds |
|---|---|
| `live` | The calls the browser put on the wire — each one must be a declared carve-out |
| `mocked` / `failed` | Answered in-browser / aborted (blocked third parties land here) |
| `in_spec_round_trips` | The spec's `route.fetch()` call sites — those leave the machine but *look* mocked in a trace, because a trace records the browser and not the Playwright process |
| `undeclared` | The **mechanical** half of the check: every `live` call no `// CARVE-OUT:` line in the spec set names |
| `carve_outs` | Every carve-out line found in the spec set, with the spec and line it sits on |
| `status: failed`, `reason: no-traces` | The run recorded no traces, so nothing was classified — the proof config must set `trace: 'on'`; re-run the audit run through it |

**The presence test is deliberately generous, and its generosity is yours to check.** A carve-out declares the path it names *and the paths under it* (a `:param` segment stands for one segment, a `*` for any run of characters), and a line naming no method declares that path for every method — so `// CARVE-OUT: /api` would leave every live `/api/**` call out of `undeclared`. That is the safe direction to err in mechanically: a false *undeclared* would send you to declare what is already declared, while a false *declared* leaves you the judgement you already owe. Read `carve_outs` beside `live` — a carve-out broader than the call it was written for is a finding.

**Presence is computed; legitimacy is yours.** An `undeclared` entry is a string comparison, so it needs no judgement from you — but the reverse is not true: a call that *is* declared is a call whose carve-out you still have to accept or reject, against the AC. A carve-out is legitimate only where the real round-trip **is** the acceptance criterion; one that exists to make a mock unnecessary is a live call wearing a comment.

- Every live call (and every in-spec round-trip) named in a `// CARVE-OUT:` line **you accept** → pass; the report's `Tests` line carries `hermetic (carve-outs: <list>)`.
- **Any undeclared live call → the run FAILS**, even though green: mock it (or declare the carve-out if the real round-trip IS the AC) and re-run the audit verb. You are not the only thing standing between it and the clips — **the film verb refuses while any stands** (exit `13`) — but reaching that refusal means you carried a known finding into the next command. An undeclared live *write* to a shared tenant is a data-pollution incident — say so in the report.
- An in-spec round-trip is **not** in `undeclared` — a source line is not a URL, so matching it against a carve-out is a reading, not a comparison. Judge each one.

**A clean audit is what licenses the filming run.** Fix here and the fix costs one cheap re-run; fix after filming and it costs the clips as well.

### Clip inspection — look at the frame before anyone else does

The run that motivated this shipped a correctly sized, held clip that showed **nothing**: the element under proof sat against the screen edge. Every gate was green, and the *operator* discovered their own broken evidence after the PR was commented on. So one frame per clip is extracted at the moment of the hold, and you **read it**:

**The film verb already extracted them**, beside their clips under `test-results/`. You do not run a command for this; you read what the run handed you. Its summary line names every clip, its measured duration, its frame, and whether the frame exists:

- `"inspected": true` → **open the frame** (image tool) and give it a line in the report — `Clip 1 — the saved banner reads "Saved", centred, page settled`.
- `"inspected": false` → that clip is reported `uninspected` and nothing else. It happens when `ffmpeg`/`ffprobe` are absent (every clip, `uninspected — no video tooling`) or when one recording yielded no frame while the rest got theirs.

**Neither case fails the run.** A clip you did not look at is reported as **uninspected**, which is the honest verdict — an unread clip is not a good one, and inventing a description of a frame you never opened is the failure this whole section exists to prevent.

**An illegible frame is diagnosed, then fixed, then re-filmed — in that order.** A re-film with no preceding fix is deterministic and reproduces the same frame, so the diagnosis is the only thing that makes the retry worth having:

| What the frame shows | Diagnosis | The fix |
|---|---|---|
| Mid-transition, a spinner, the state not yet reached | **payoff not held** | The dwell is in the wrong place. Move it after that beat's own assertion — outside the race window, still `PW_PROVE_CLIP`-gated, still `// JUSTIFIED:`. |
| The subject at the edge, cropped, or absent | **element off-frame** | The ungated `scrollIntoView({ block: 'center', inline: 'center' })` is missing, or it runs *before* a re-render that pushes the subject away — centre **at** the moment of the hold. |
| A settled page with the payoff simply gone — a toast that dismissed itself | **payoff expired** | A beat ran between the assertion and the dwell, and the element auto-dismissed in the gap (~4s for most toast libraries). Move the dwell to sit *immediately* after that assertion — `code-rules.md` → Transient payoffs. |
| A skeleton, a blank page, a loader | **never settled** | The spec held on a state it never reached. Assert the loaded state — the element the AC is about — *before* the dwell, so the hold cannot land on a loader. |

The fix goes into the **committed spec** — never into the proof config, and never into a filming-only branch (the filming law: `PW_PROVE_CLIP` may only add time).

1. Apply the matching fix.
2. **Re-film once** — the same `proof-run.mjs film` command. It re-runs the clip-fidelity audit over the edited spec as its precondition (an edit that moved the dwell can have dropped its marker), clears `test-results/` itself, re-extracts the frames, and counts this run as the re-film. Exit 12 means the edit broke the contract rather than fixing the frame; exit 13 means the edit moved the spec set out from under the audit's network finding — re-run the audit verb.

**Exactly one re-film, and the verb is the one counting.** A second illegible frame **publishes anyway**, with an explicit warning: `Clip N — illegible (<diagnosis>), published with warning`, in both the completion report and the PR comment. A bad clip is not a failed test; the proof is the passing test plus the mutation verdict.

Which attempt this is is **read, never recalled**: the film summary carries `films` (this filming run's number) and `publish_with_warning`. `publish_with_warning: true` means this run is a re-film, so any clip still illegible after it goes out with the warning above rather than round again — carry that flag into Step 8 and the completion report.

### Mutation check (PR-mode: REQUIRED — hard-bounded)

Proving the spec *guards* the change is **required in PR-mode**, via ONE bounded source mutation:

**Scope: the scenarios this run wrote.** A carried scenario's mutation verdict was recorded by the run that wrote it, and re-deriving it costs one forced-no-reuse rebuild each (~635s, below). So the run carries two scopes and they are different on purpose: **filmed** is the PR spec set (Step 7), **mutation-verified** is this run's new scenarios. Widening one leaves the other where it is. A run that wrote no new scenario — a re-film of an unchanged branch — reports `Mutation: carried (no new scenario this run)` and mutates nothing.

**The mutation run must not touch the clips**, and the verb is what makes that true by construction: it sends the run to an isolated output, leaves `test-results/` exactly as it stands — the one verb that does not clear it — and counts the clips afterwards against the PR spec set, carried scenarios included.

**The mutation must be in the artifact under test, and the verb is what puts it there.** The proof target is a *build*, so the verb forces the rebuild, stops **whatever is listening on the origin's port** — resolved from the kernel with `ss`/`lsof`, together with the PID you recorded at Step 3 — starts it again with the command you give it, and **proves** the restart against two things: the server's own new announcement past a mark it takes before the stop, *and* a fresh pid holding the port. The PID you recorded is a hint here and never the authority: where your preview command is a `pnpm`/`npm` script, that PID is a wrapper and the listener is its child, so a stop by PID alone leaves the old build serving under a restart that reports proven. You pass the four things only you know — the build script, the recorded PID, the preview task's log, and how the server is started. An unproven restart is **exit 11** and there is no verdict to read: kill whatever holds the port and invoke the verb again. Budget for it: this is the step the built target made expensive (~635s against ~40s under hot reload), and it is the accepted price of a mutation verdict that still names a *source* behaviour.

1. **Mutate the changed behavior** — one line is enough, in a file git already tracks, left **unstaged**. Choosing which line is yours: pick the one the AC is actually about, not a nearby constant a stronger layer would restore.
2. **Run the verb.** It forces the rebuild, restarts the preview server and proves the restart, captures the tree's pre-state, runs the guarding test into an isolated output with `test-results/` untouched, reverts the file you named, marks the artifact stale, checks the tree came back, and counts the clips.

   ```bash
   PW_PROVE_HAR="$PWD/.pw-prove/<feature>.api.har" \
     node <skill-base>/scripts/proof-run.mjs mutate \
     --config <configDir>/playwright.proof.config.ts --test-dir <testDir> --base <base ref> \
     --written <this run's spec> --grep "<the guarding test>" --mutated <the file you mutated> \
     --build-command "<the project's build script>" --app-root "$PWD" \
     --server-pid <the recorded PID> --server-log "<the preview task's log>" \
     --serve-command "<how you start the preview server>" --origin "$BASE_URL" \
     --clips <the film summary's clips.length>
   ```

   `--serve-command` is the same command Step 3 started the server with, `PORT` included. The summary's `server.pid_after` is the **new** process id: carry it as the recorded PID from here on, and stop it with `kill -- -<pid>` (it leads its own process group). `--written` is repeatable and is the mutation-verified scope; `--grep` scopes the run to ONE test, so **give the test's `test(...)` title verbatim** — a title that also matches a second written spec's test widens the scope silently. `--clips` is the filming summary's own `clips.length`; without it the surviving-clip floor is one per spec file, which a multi-scenario spec passes while two of its clips are missing. `PW_PROVE_HAR` travels inline for the same reason it does on the filming run: this verb has no bind phase. Read the exit code:

   | Exit | Meaning | Do |
   |---|---|---|
   | `0` | **Red** — the spec guards the change | Read the summary's `signature` and confirm it is the assertion your mutation targeted. A red that names a navigation or connection failure is the application falling over, not a guard — fix that and run again |
   | `8` | **Green** — the spec does not guard it. Not a failed run | Strengthen the terminal assertion and repeat **once**. Green a second time, with another layer independently preserving the outcome (e.g. a read-modify-write that re-reads and merges) → **"unguardable at this layer"**. Never a third cycle. State it in the report and PR comment, naming the masking layer |
   | `9` | Tree residue after the revert | **HARD STOP.** Report immediately; never continue on a polluted tree |
   | `10` | The clips no longer show the passing run | Delete `test-results/`, re-run the audit and filming verbs, then publish. Never publish a clip you cannot place after the last source revert |
   | `11` | The restart is **unproven** — the stop could not be confirmed, or nothing announced past the mark | No verdict: whatever answers may be the predecessor serving the pre-mutation artifact. Kill whatever holds the port and invoke again. The artifact is marked stale |
   | `14` | The forced rebuild failed | The line you mutated may not compile. Revert it, choose one the build accepts, invoke again |
   | `2` | The file you named is untracked or carries no change; a `--written` spec is not on disk; or `--grep` matched **no test at all** | Nothing ran, so there is no verdict. Fix the input named and invoke again |
   | `1` | Usage — a missing or malformed flag | Fix the invocation |
   | `3` | The spec set resolved empty | The wrong base ref, or a test directory that is not where the specs landed. Fix the resolution |

   The revert has already happened whatever the code says — it is unconditional, and runs before the verdict is read.

3. **The artifact is marked stale, and nothing rebuilds it here.** The verb writes `.pw-prove/artifact-stale` after the revert. The revert is unconditional and immediate; the rebuild is **lazy**, and the marker is what makes laziness safe:

   **`audit` and `film` refuse (exit 15) while that marker stands** — they never silently rebuild, because a self-heal would hide that the mutation check left the machine in this state. **Clear it by running the exact commands the refusal prints**, in the order it prints them; they are the only copy, and reconstructing them from memory is how the mark gets taken after the stop instead of before it. A further `mutate` needs no clearing — it forces a rebuild by construction, and its proven restart clears the standing marker before writing its own.

   **Step 8 hygiene stops a stale server rather than rebuilding it**, which is the common case: a mutation check that is the run's last step pays nothing.

## Script contracts (from `SKILL.md` → Reference)

- Step-7 verify mechanics, and the only invocation of them — `audit` (the two preconditions, spec-set resolution, the clearing, the bounded heal loop, the network classification), `film` (the fidelity precondition, the clip flag and effective viewport, frame extraction, the clip manifest in its summary) and `mutate` (the forced rebuild and proven restart, the isolated output, the revert, the residue and clip counts, the stale-artifact marker). **There is no raw-runner fallback for any of the three.** Exit codes are one table across the verbs; the reasons behind each mechanic are in the module's header: `scripts/proof-run.mjs`
- Step-7 hermetic audit (classifies the run's traces LIVE/MOCKED/FAILED + finds `route.fetch` round-trips a trace cannot see) — **the audit verb invokes it rather than you**, and reaches you as the summary's `phases.hermetic`; it renders no verdict by design, and the undeclared list the verb computes beside it is presence, never legitimacy: `scripts/hermetic.mjs`
