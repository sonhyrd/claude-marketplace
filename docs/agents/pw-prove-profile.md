# pw-prove profile — what an agent faces running the skill

Read before editing [`skills/pw-prove/SKILL.md`](../../skills/pw-prove/SKILL.md) or its shipped
scripts. Amended after any real proof run, and after any change that closes a trap listed here.

**Nothing loads this file at runtime.** It is a field report addressed to whoever is about to edit
pw-prove, not an instruction surface: it carries no directives for a proving agent, and a proving
agent never reads it. It also does not restate what `SKILL.md` instructs — where a step's contract
matters, this document links to it rather than copying it, so the two cannot drift into
contradicting each other.

## How to read this

Every entry carries a count, an exit code, a source line, or a quotation. Anything that could only
be inferred by reading `SKILL.md` is fenced under *Suspected, unmeasured* or is not here at all.

**Three evidence tiers, never blended.**

| Tier | Source | What it can support |
|---|---|---|
| **1 — real runs** | [`docs/studies/live-proof-pr2866.md`](../studies/live-proof-pr2866.md) and the [run ledger](#the-ledger-population-is-contaminated) | What an agent actually hit against a real application |
| **2 — eval transcripts** | `skills/pw-prove/evals/` — the only window into steps 1, 2, 4 and 5, which emit no ledger record | What a case measured, in a synthetic harness under `environment.type: none` ([ADR 0018](../adr/0018-eval-runtime-is-none.md)) |
| **3 — suspected, unmeasured** | Reasoning | Nothing. It is written down so it can be measured, not acted on |

**Every trap is stamped with the version it was verified at.** Traps carried forward from the
`0.11.0` study were each checked against `0.19.1` source before being included; the ones that had
been closed moved to [Fixed since](#fixed-since) rather than being deleted, because the *kind* of
defect this skill produces is itself a finding.

### The ledger population is contaminated

Read this once, then read every ledger figure below through it.

`~/.ptg/ledger.jsonl` on the authoring machine held **2,321 lines, 2,312 parseable** (the 9 bad
lines are noise, not a finding) when these figures were taken on 2026-08-17. **145 `scan.mjs`
records belong to `e2e-reviewer`** and share the same ledger; they are excluded from every pw-prove
figure here, leaving **2,167 pw-prove records**.

That population is development and CI loops, not proofs:

- **693 of them carry no `session` field at all** — schema 1, written before the field existed. They
  cannot be attributed to a run. All 26 `publish-proof.mjs` records sit in this block. (The
  un-excluded figure across both skills is 730; the 37-record difference is `scan.mjs`.)
- **The large sessions are edit loops.** One session carries 384 records inside an 18-minute span
  and spans versions `0.11.0` → `0.12.0`. A version moving *inside* a session means the working tree
  was being edited mid-session.
- **1,474 records are attributable, across 20 sessions.**

**Consequently, ledger evidence is used here for coverage and shape, never as a rate.** "No recorded
run has ever reached `publish-proof.mjs` with a session id" is a usable finding. A percentage of
non-zero exits is not, and must not be added to this document later.

One `0.19.1` record exists in that ledger because writing this document ran `clip-fidelity.mjs`
once. It is the only record above `0.15.2`, and it is an artefact of the authoring, not a run.

### Which scripts the ledger can see at all

`clips.mjs`, `video.mjs` and `pwprove-run.mjs` show **zero records, and that is correct rather than
alarming**: all three are libraries imported by the entry points, and each says so in its own header
("a library, not an entry point, so it registers no run-ledger line of its own" —
`video.mjs:4`). `clips.mjs` is imported by `preflight.mjs:101` and `publish-proof.mjs:90`;
`video.mjs` by `clip-fidelity.mjs:72` and `publish-proof.mjs:92`. **A zero next to them is not
evidence that the code is unreached.** Six scripts emit records, and those six are the whole of the
ledger's field of view.

---

## Step 1 — Dispatch + Environment

**What the agent must decide.** Whether a confirmation gate applies at all (model-invoked runs stop
and ask; a user who named the skill has already consented); which of four modes `$ARGUMENT` selects,
including the one genuinely ambiguous case — a string that is both a route and a branch — which is
the only place Step 1 is permitted to ask; and eight fields of environment profile, of which a
missing `baseURL` is a stop.

**What it runs.** Nothing. **Step 1 emits no ledger record**, so no recorded evidence exists for how
long dispatch takes, how often the confirmation gate fires, or how often the mode table's ambiguous
row is hit. This is a blind spot, not a quiet step.

**Evidence — tier 2.** Two active cases: the confirmation gate for model-invoked runs, and the
heavy-session recommendation. Seven further active cases guard the `description:` frontmatter that
decides whether Step 1 is reached at all, three of them in the two-skill collision arm
(`eval.collision.yaml`) that is the only place a routing question between pw-prove and
`e2e-reviewer` can be asked.

---

## Step 2 — Diff → AC / Coverage Gap

**What the agent must decide.** Whether `.pw-prove/handoff.json` is current, stale or absent — and
a stale handoff must produce a visible line, because dropping it silently leaves a reader believing
a review's findings were carried when they were not. Then the AC derivation itself, including which
ACs the diff already proves more cheaply.

**What it runs.** Nothing. **Step 2 emits no ledger record.**

**Evidence — tier 2, and it is thin.** **One** active case covers this step: folding ACs the diff
already proves cheaper. The whole coverage-gap branch, the handoff freshness table and the AC
derivation have no active case of their own. Set against Step 7's seven, this is the least-guarded
step in the pipeline with a live contract.

---

## Step 3 — Bring-up + Probe

The most heavily instrumented step, and the one **9 of the 20 attributable sessions never leave** —
those nine recorded `preflight.mjs` and `probe.mjs` and no other script.

**What the agent must decide.** How to declare the app's configuration contract; whether a bring-up
failure is fatal or recoverable; which rung of the **session ladder** (`SKILL.md` calls it the
token-source ladder) the app supports, and when the ladder is exhausted — a rung compiled out of the
built target is recorded absent, not retried; which questions to batch into the probe rather than
discover through a
test run ([ADR 0004](../adr/0004-probe-required-recon.md)).

**What it runs.**

| Script · phase | Records | Median | p90 | Max |
|---|---|---|---|---|
| `preflight.mjs` · `bringup` | 941 | 39 ms | 233 ms | 101 s |
| `preflight.mjs` · `readiness` | 122 | 107 ms | 53 s | 120 s |
| `probe.mjs` · `recon` | 841 | 28 ms | 34 s | 948 s |
| `probe.mjs` · `warm` | 73 | 7.1 s | 18 s | 25 s |
| `har-scrub.mjs` · `scrub` | 16 | 17 ms | 353 ms | 427 ms |

Read the medians as argument-validation and the tails as the real work: `preflight.mjs` refuses in
tens of milliseconds and builds in tens of seconds, and the 39 ms median says most recorded
invocations were rejected at the boundary rather than run. The tier-1 run measured the honest
end-to-end figure — **≈ 88 s cold bring-up**, 420 ms on a build-reuse hit, 106 ms for the serve poll
(`live-proof-pr2866.md`, *Bring-up*).

**Exit codes ever recorded.** `preflight.mjs` 0, 1, 3, 4, 5 · `probe.mjs` 0, 1, 2, 3 ·
`har-scrub.mjs` 0, 1, 2, 3, 4. `har-scrub.mjs` exit **6 — over-scrub — has never been recorded**,
which matters because exit 6 exists precisely to catch the tier-1 defect that once destroyed a
recording (see [Fixed since](#fixed-since)); nothing in the recorded population has exercised it.

**Where it stalls or invents process.**

- **The configuration contract over-declares from a generated `.env.example`.** `preflight.mjs:243`
  treats any key declared with no value as required. An application whose `.env.example` is
  *generated* from a schema carrying an explicit `required` boolean emits valueless placeholders for
  optional and vault-leased keys, so the phase stops the run naming keys the app boots without: on
  the tier-1 application, **`exit 4` in 91 ms naming 11 keys, of which 9 were `required: false`**.
  The `REQUIRED_ENV=` form is the documented escape and it worked; **nothing in the output points at
  it**, so the agent's next move is unprompted. *Verified still open at `0.19.1`.*
- **A dual-stack bind is reported as a single family.** When the origin that answered differs from
  the one requested, `preflight.mjs:815` prints `the bound loopback family is <family>` as a
  statement of fact and instructs the reader to carry that origin everywhere. On a server logging
  `Listening on http://[::]:<port>`, both `127.0.0.1` and `localhost` answer and the sentence is
  false. Harmless to the run, misleading in a diagnosis. *Verified still open at `0.19.1`.*
- **A real list page makes a very large recording.** One recon pass over a 2,015-row list route
  produced a **9.1 MB `api.har`**, which Step 8 commits to the target repository. **No warning
  exists anywhere in the pipeline.** *Verified still open at `0.19.1` — `har-scrub.mjs` measures
  value shape, never document size.*

**What it costs.** The tier-1 run put a cold build at **87 s** against **100 s** for the same
application's development server to answer its first request, and a warm browser navigation at
**~1.0 s** against **1.7–3.8 s**. Both figures invert the trade this step was justified by; see the
study, which also records that the original `14 ms vs 4.26 s` comparison put a `curl` against a page
load.

**Evidence.** Six active cases and four quarantined — bring-up announcements, the `exit 4` message,
the hard-coded serve port, both session-ladder branches, the probe verb surface, and the
capture-time scrub. Plus the tier-1 run in full.

---

## Step 4 — Plan

**What the agent must decide.** Almost nothing, by design — and that is the point of the step. Six
would-be questions resolve from the contract as stated Assumptions lines, and **asking any of them
is a bug**. The genuine decisions are the coverage floors (a locale-touching diff forces a
non-default-locale scenario; a gated surface must stay visible as `unproven — gated: …` rather than
be dropped) and the effective-viewport verdict, which is a *claim* Step 6 later checks.

**What it runs.** Nothing. **Step 4 emits no ledger record**, so the notify-and-continue behaviour
that distinguishes PR-mode from the coverage-gap approval gate is invisible to the ledger entirely.

**Evidence — tier 2 only.** Five active cases and two quarantined, concentrated on the
effective-viewport branches and the probe's `eval` contract. Two of them exist
because the `eval` argument shape was a real defect — that the `arg` carries JSON data rather than a
page handle, and that a string expression is evaluated rather than called, are both cases written
against a fixed bug rather than a hypothetical.

---

## Step 5 — Generate

**What the agent must decide.** Whether an existing Page Object covers the route (extend) or none
does (scaffold) — the flat-spec sibling is never matched and never rewritten; what the recon pass
actually recorded, since a missing HAR must be declared in two places rather than silently replaced
with hand-written mocks; and where in each `test()` the payoff dwell sits, which must be outside a
race window.

**What it runs.** Nothing. **Step 5 emits no ledger record.**

**Evidence — tier 2.** Two active cases plus one for Step 5b's greenfield runner bootstrap, and one
quarantined. The canonical dwell is pinned across three surfaces — `clip-fidelity.mjs`'s
`CANONICAL_DWELL` export, `SKILL.md` Step 5, and `code-rules.md` — by `review.sh`'s *Canonical dwell
snippet* check, after three near-identical variants existed and **ten of eleven field sessions never
opened the reference at all**; every recovery in that sample came from the script's error text
rather than from documentation. That is the sharpest recorded statement in this repository about how
a reference file is actually received, and it generalises past the dwell.

---

## Step 6 — Reviewer quality gate

**What the agent must decide.** Whether each finding is real. The step is otherwise mechanical: four
audits, each with its own refusal.

**What it runs.**

| Script · phase | Records | Median | p90 | Max |
|---|---|---|---|---|
| `clip-fidelity.mjs` · `audit` | 66 | 30 ms | 61 ms | 130 ms |

`scan.mjs` runs here too, but its 145 records are booked under `e2e-reviewer` and are excluded from
every figure in this document.

**Exit codes ever recorded.** 0, 2 and 4 only. **Exit 3 (pin), 5 (config ambiguity), 6 (no tooling)
and 7 (no frame) have never been recorded** — including the ambiguity refusal that exists
specifically so the script does not guess.

**Where it stalls or invents process.**

- **A computed device spread reads as an empty config.** `DEVICE_SPREAD`
  (`clip-fidelity.mjs:227`) requires the bracket to open on a quote, so
  `...devices[process.env.PROJECT_DEVICE || 'Desktop Chrome']` matches nothing, `deriveScope`
  returns `null`, and the fallback `SCAFFOLD_DEFAULT` reports *"nothing at all — Playwright's
  1280x720 default"*. The **verdict (`pinned`) is right and the audit passes**; the stated reason is
  false. An agent that trusts the reason carries a wrong belief about the project's config into the
  Assumptions block. *Verified still open at `0.19.1`.*

**Evidence — tier 2.** Two active cases: the dwell is inline per `test()`, and `spec` exit 2 blocks
Step 7. Both guard the audit's refusals rather than its passes.

---

## Step 7 — Verify

The step with the most eval cases, the most quarantined cases, and the pipeline's two most expensive
recorded operations.

**What the agent must decide.** Whether a failure is converging (a moved signature) or stuck (the
no-progress checkpoint, which takes the handover stop); what each extracted frame actually shows,
which is a judgement no script makes for it; and whether a mutation-check RED is genuine.

**What it runs.**

| Script · phase | Records | Median | p90 | Max |
|---|---|---|---|---|
| `clip-fidelity.mjs` · `inspect` | 28 | 2.0 s | 3.6 s | 7.3 s |
| `hermetic.mjs` · `audit` | 54 | 214 ms | 554 ms | 1.2 s |

`preflight.mjs` runs again here for the mutation check's two preview-server restarts, under the same
`bringup` and `readiness` phases counted at Step 3; the ledger cannot separate a Step-3 bring-up
from a Step-7 restart.

**Exit codes ever recorded.** `hermetic.mjs` 0, 1, 2 — the full documented set.

**What it costs.** Tier 1: **3 tests in 40.7 s** for the proof run, and a **207 s** mutation cycle
(87 s rebuild + 18.7 s scoped run + 101 s revert rebuild) against an expected ~635 s. The
development-server control could not complete the same spec at all — three timeouts at 120 s — so
there is no comparison figure, which is the study's strongest single result.

**Where it stalls or invents process.**

- **`.git/info/exclude` is not a path in a linked worktree.** `SKILL.md:546` still writes
  `grep -qxF '.pw-prove/' .git/info/exclude || printf … >> .git/info/exclude`. In a linked worktree
  `.git` is a **file**, so the append fails with `Not a directory` — and because it sits on the
  right-hand side of a `||`, the failure is silent. The bound HAR, which carries a live credential,
  is then not excluded from `git status`. The correct path comes from
  `git rev-parse --git-common-dir`. *Verified still open at `0.19.1`.* This is the highest-severity
  open trap in this document: it is a credential-adjacent failure that produces no error the agent
  will notice.
- **Five quarantined cases sit on this step**, more than any other — failure handling, the frame
  extract's skip semantics, restart proof, and the proof-config contract. A quarantined case is one
  whose pass rate was a coinflip, so this is where the body's instructions are least reliably
  followed.

**Evidence.** Seven active cases, five quarantined, plus the tier-1 run.

---

## Step 8 — Deliver

**The least-witnessed step in the pipeline.**

**What the agent must decide.** Which of three non-interchangeable publish outcomes occurred —
published, undelivered, or gated — read from the **exit code**, never from an empty `$PAGE`; whether
a HAR is safe to stage; and what the completion report must say, which is structurally invalid
without its `Proof page`, `Mutation`, `Committed`, `Pushed` and `PR comment` lines.

**What it runs.**

| Script · phase | Records | Median | p90 | Max |
|---|---|---|---|---|
| `publish-proof.mjs` · `publish` | 26 | 10.2 s | 17.3 s | 26.6 s |

**No recorded session reached Step 8.** All 26 `publish-proof.mjs` records sit in the schema-1
block that carries no `session` field, so none can be attributed to a run, and **0 of the 20
attributable sessions invoked it**. The 10.2 s median is real; nothing around it is.

**Exit codes ever recorded.** 0 and 4 only. **Every publish gate — 3 (empty recording), 6 (token
leak), 8 (homogeneity), 9 (duration reconciliation) — has never fired in a recorded run**, and
neither has `har-scrub.mjs` exit 6. `SKILL.md` spends more prose on these gates than on any other
outcome in the step, and no recorded evidence exists for how an agent behaves when one fires.

**Where it stalls or invents process.** Two quotable hazards, both recorded in the body as
already-paid costs rather than as hypotheses: a run "has already lost five URLs" to reading
`head -n1` instead of the `PWPROVE_URL` marker, because npm and ffmpeg chatter lands on line 1; and
**a refusal arrives as HTTP 200**, so any check keyed on the status code passes vacuously and
reports a proof that was never published.

**Evidence.** Two active cases, three quarantined — the residue refusal, the over-scrub exit, the
`PWPROVE_URL` marker, and the skipped-accounting branch when the publish credential is refused.

---

## Fixed since

Traps recorded against `0.11.0` that current source has closed. They stay here because they
characterise the *kind* of defect this skill produces: three of the four were invisible failures
that reported success.

- **The HAR scrubber destroyed the recording when a cookie value was short.** A two-character locale
  cookie (`i18n_redirected=en`) was minted as a secret and substituted everywhere — **125,403
  occurrences** across a 9.1 MB recording — and `--verify` reported it **clean**, because
  over-scrubbing is indistinguishable from scrubbing to a residue check. **Closed two ways:** a
  value floor (`MIN_GLOBAL_SECRET_LENGTH = 12` plus a distinct-character floor,
  `har-scrub.mjs:175–181`) restricts global substitution, with sub-floor values still placeheld at
  their own learn sites; and over-scrub became its own hard stop, `exit 6`, so it can no longer hide
  behind a passing residue check.
- **`probe.mjs`'s `{"fn": …, "arg": …}` eval form was inert.** The shape a model reaches for first
  returned `undefined` and silently dropped `arg`, because Playwright evaluates a string expression
  and an arrow-function source evaluates to a function object. It had never worked. **Closed** at
  `probe.mjs:176`, which now builds the call: `` `(${e.fn}\n)(${jsLiteral(e.arg)})` ``.
- **The serve phase could not tell a restarted server from a stale one, and produced a false RED.**
  A restart that died with `EADDRINUSE` left the old process answering; the poll reported `SERVE=ok`
  and the mutation run failed at 128 s on 404'd chunk files. That failure reads as RED, and RED is
  the outcome the mutation check wants — so the run would have reported "the spec guards the change"
  on evidence proving nothing. **Closed** by `SERVE_RESTART` + `RESTART_LOG_OFFSET`: a restart is
  proven by a *new* announcement past a byte offset in the server log, never by an answer on the
  port, and an unprovable restart is a serve failure (`RESTART=unproven`) rather than `SERVE=ok`.
- **`e2e-reviewer` flagged pw-prove's own dwell** when the dwell was written across two lines as a
  formatter leaves it — three unsuppressed `[P1] #9` hits, zero for the identical code on one line.
  **Closed for pw-prove, not repaired in the scanner:** `CANONICAL_DWELL` is the one-line form, and
  `review.sh` pins it across the three surfaces that show it. `lineIsJustified`
  (`scan.mjs:129–145`) still breaks at the first non-`//` line above a hit, so the underlying
  suppression behaviour is unchanged and the same shape written by hand would flag again.

---

## Not yet measured

**A real proof run at `0.19.1`.** — *slot deliberately empty.*

The one documented real run is at `0.11.0`, eight minor versions back, and the run ledger holds
nothing above `0.15.2`. Every tier-1 finding in this document therefore describes a version no
current install is running, checked forward against current source line by line but not re-observed.
Performing the run is separate work; until it lands, this heading is the document's own statement of
its coverage gap. Fill it here, and cite the new study rather than pasting it.

### Suspected, unmeasured

Tier 3. Nothing below has been observed; it is written down to be measured, not acted on.

- The steps that emit no ledger record — **1, 2, 4 and 5** — may be where most wall-clock and
  context actually goes, since they are the reasoning-heavy ones. No instrumentation exists to say
  so either way, and adding it is out of scope here.
- Step 2's single active case may understate its reliability rather than its risk; a thin guard and
  a stable step look identical from the registry.

---
---

# Optimization candidates, ranked

**This is the only prescriptive section in this document, and it is walled off deliberately.**
Everything above describes what was observed; everything below is a recommendation that can be
disagreed with without disturbing a finding. Each candidate names the evidence that motivates it —
**a candidate does not survive its evidence being retracted.**

1. **Fix the `.git/info/exclude` path in Step 7** — read the real path from
   `git rev-parse --git-common-dir`. *Motivated by:* the Step-7 trap. Highest severity open: it
   fails silently inside a `||` chain and leaves a credential-bearing bound HAR visible to
   `git status`. It is also the cheapest fix here, being one line of `SKILL.md`.

2. **Make `preflight.mjs`'s config refusal name its own escape.** The STOP is fast and legible and
   the heuristic is wrong for a generated contract; printing the `REQUIRED_ENV=` form in the refusal
   would convert an unprompted stall into a one-step recovery. *Motivated by:* the Step-3
   over-declaration trap, and by the `CANONICAL_DWELL` finding at Step 5 — recovery in that sample
   came from error text, not from documentation.

3. **Take a real proof run at the current version.** *Motivated by:* the empty slot above. Every
   tier-1 finding here is eight versions stale and verified only against source. It is also the only
   way the Step-8 gates and `har-scrub.mjs` exit 6 acquire any recorded behaviour at all.

4. **Add an active eval case for Step 2.** One case guards the whole diff→AC derivation, the
   handoff-freshness table and the coverage-gap branch. *Motivated by:* the Step-2 evidence line.
   Admission rules apply — characterize it and add its `REGISTRY.md` row before activating it.

5. **Warn on a large `api.har` before Step 8 commits it.** *Motivated by:* the 9.1 MB recording in
   the Step-3 trap list. A size line in the scrub report costs nothing and the current silence
   commits real weight to a user's repository unannounced.

6. **Correct the dual-stack family sentence in `preflight.mjs`.** State the origin that answered and
   stop asserting the family when the bind was `[::]`. *Motivated by:* the Step-3 trap. Lowest
   severity here — it misleads a diagnosis, it does not break a run.

7. **Fix `DEVICE_SPREAD` to see a computed device expression, or make it refuse.** The verdict is
   already right; only the stated reason is wrong, and `clip-fidelity.mjs` elsewhere refuses rather
   than guesses. *Motivated by:* the Step-6 trap.

8. **Re-characterize Step 7's five quarantined cases.** *Motivated by:* the Step-7 evidence line —
   the step with the most contract also has the least reliable adherence, and a coinflip case
   detects nothing while it sits on disk.
