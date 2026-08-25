# Target-repo setup — `nuxt-hyrd-chrysus`

What the **repository** could provide so the next pw-prove run against it starts from something
better than a blank worktree. Part of [run forensics](run-forensics.md), drawn from the fourteen
`nuxt-hyrd-chrysus` [session distillations](session-distillation.md) in the corpus and from the
[profile audit](profile-audit.md).

**Nothing here is applied and nothing here is a decision.** `docs/adr/` holds decisions and
`docs/specs/` holds specs; this file holds evidence and a recommendation a reader may act on. The
repository was read and not written: no file in the `nuxt-hyrd-chrysus` checkout was modified,
and `.pw-prove/profile.md` in particular was read at its live path and left at 321 lines.

**What separates this study from the pw-prove fix spec (#138)** is the question each answers.
This one asks *what did the repository fail to provide* — a convention the skill had to infer, a
bring-up fact it rediscovered every run, an environment value it had to be told. #138 asks what
pw-prove itself got wrong. Where an item straddles the line it is recorded here **and** named in
[Not this repository's to fix](#not-this-repositorys-to-fix) rather than dropped, which is the
boundary-case rule the exercise set for itself.

## How to read a recommendation

Each one names the sessions that paid for its absence, with the transcript lines a reader can open.
A setup change nothing in the evidence asks for is not here — including several that would be
defensible on general grounds. Costs are the distillations' own measurements; where a distillation
says a figure is approximate, so does this file.

Session ids are the eight-character prefixes the corpus uses. The distillations themselves are not
committed: they live in the exercise's scratchpad, and a reader with them can open any line cited
below.

## The fourteen sessions this study reads

| Session | Worktree | pw-prove | Records / non-zero | Date |
|---|---|---|---|---|
| `d3c037d9` | bocaccio | 0.20.0 | 56 / 6 | 08-17 |
| `fa0cc83b` | whelk | 0.21.0 | 38 / 3 | 08-17 |
| `d32c2495` | snailfish | 0.22.0 | 20 / 3 | 08-18 |
| `fe171475` | snailfish | 0.23.1 | 25 / 3 | 08-18 |
| `a7cdcd1c` | wentletrap | 0.23.1 | 53 / 4 | 08-18 |
| `b6dbd8be` | snailfish | 0.23.1 | 20 / 1 | 08-18 |
| `7cc7e6bc` | 3258-inline-proof-dwell | 0.24.0 | 6 / 1 | 08-19 |
| `18697484` | aspidochelone | 0.24.0 | 56 / 5 | 08-19 |
| `1927b90c` | *(main checkout)* | 0.24.0 | 17 / 2 | 08-19 |
| `3072aa9b` | nixie | 0.24.0 | 35 / 3 | 08-19 |
| `c871a4f2` | beluga | 0.26.0 | 25 / 2 | 08-20 |
| `67b624f4` | beluga | 0.26.0 | 14 / 1 | 08-20 |
| `a273eefa` | *(main checkout)* | 0.27.0 | 31 / 1 | 08-21 |
| `cbe2813b` | *(main checkout)* | 0.27.0 | 18 / 1 | 08-21 |

`7cc7e6bc` is not a pipeline run — it is ticket work that used `clip-fidelity.mjs` as an acceptance
gate, and its Steps 1–2 are recorded as *missing from range* rather than as not performed. It
contributes two small items below and nothing that depends on pipeline shape.

---

## 1 — The build is the run, and the mutation check pays for it twice

**Ranked first on measured cost.** Ten of the fourteen sessions paid two or three full production
builds, and in several the build is the largest single line in the run:

| Session | Builds | Total | Share of the run |
|---|---|---|---|
| `a7cdcd1c` | 448 s + 396 s (killed) + 405 s | 20 m 50 s | **29 %** of 71 min |
| `1927b90c` | 241.2 s + 214.7 s | 7 m 36 s | **15 %** of 51 min |
| `3072aa9b` | 242 s + 246 s + 273 s | 12 m 41 s | 15 % of 85 min |
| `a273eefa` | 145.9 s + 220.7 s + 164.6 s | 8 m 51 s | 15 % of 57 min |
| `d32c2495` | 103.9 s + 109.5 s + 367.9 s | 9 m 41 s | — (spans a 2 h 33 m operator gap) |
| `18697484` | 131.5 s + 125.9 s + 115.4 s | 6 m 12 s | 10 % of 64 min |
| `c871a4f2` | 210 s + 290 s | 8 m 20 s | 18 % of 47 min |
| `67b624f4` | 176.7 s + 207.3 s | 6 m 24 s | 15 % of 43 min |
| `cbe2813b` | 149 s + 145 s | 4 m 54 s | 13 % of 37 min |

One rebuild is bring-up and one is the mutation check's mandated `BUILD_REUSE=never`; both are the
contract's own price and neither is a defect. What the repository can change is the price.

Two of those builds were not merely expensive, they failed:

- **`a7cdcd1c` (lines 1086 → 1111):** the mutation rebuild was SIGTERMed — `BUILD_REUSE=miss /
  BUILD_REUSE_REASON=forced / BUILD=failed / BUILD_EXIT=143`. The agent diagnosed memory pressure
  from the still-running preview server, stopped it and rebuilt. **6 m 36 s wasted plus 6 m 45 s
  repeated = 13 m 21 s**, the single most expensive friction item in that run.
- **`3072aa9b` (lines 691 → 696):** the same race, caught in one turn — *"Docs warn a build racing a
  live preview server gets SIGTERMed. Stopping the server now."* The repository's own docs know
  about it; nothing enforces it.

**Recommendation.** Two things, in order of value:

1. **Make `pnpm build` refuse, or wait, rather than get OOM-killed while a preview server holds the
   port.** A build that exits 143 with no reason costs a full rebuild to diagnose; a build that
   refuses with `a preview server is listening on :<port>; stop it first` costs a turn. The
   repository already documents the hazard, which is the hard half.
2. **Publish a warm build the proof run can reuse.** The `BUILD_REUSE` contract already keys on the
   commit and the working tree, so an artifact cached per commit would take the bring-up build to
   zero for every run whose branch has not moved. The mutation rebuild is irreducible.

**Where it belongs:** the build/serve behaviour is `scripts/preview.mjs` and `package.json`; the
hazard note is already in the repo's docs and should stay there rather than in the profile.

---

## 2 — `pnpm preview` is three processes, and the pid it announces is never the listener

This is the finding that produced two near-false proofs in the corpus, and it is the one repository
change that removes a whole class of them.

`scripts/preview.mjs` `spawn()`s `node .output/server/index.mjs` as a child, so any pid a caller can
hold is a wrapper. Kill it and the listener survives; the replacement then dies on `EADDRINUSE`
while the predecessor keeps answering — and because `pnpm preview` prints its `serving .output on …`
banner **before** it binds, the announcement lands past the restart log mark and the restart check
passes.

- **`3072aa9b` (False proof 1):** line 1037 reports `SERVE=ok / RESTART=proven`; line 1052 of the
  same log reads `[uncaughtException] Error: listen EADDRINUSE: address already in use :::37203`.
  **The mutation run at line 1043 therefore executed against the un-mutated artifact** and failed at
  auth rather than at the assertion. Caught at line 1056, redone at lines 1065–1076.
- **`c871a4f2` (False proof 1):** the same shape at lines 523 / 531 / 537, caught before the verdict
  was read — *"the restart died and the **old** server is still answering the pre-mutation artifact.
  Not reading the mutation result until that's fixed"* (line 535). The run then wrote the defect into
  the profile (line 639) and named it in its report (line 696).
- The corpus shows this **re-paid**: `c871a4f2` hit it after `3072aa9b` had already paid for it, with
  entries C5 and C29 on disk describing it. The [profile audit](profile-audit.md) lists it in its
  Tier-2 table for exactly that reason.

**Recommendation.** Make `scripts/preview.mjs` `exec` the server instead of spawning it, or have it
print the bound pid and port **after** the listen callback fires. Either one makes the announced pid
the listener and the banner a bind proof. Today the workaround costs ~25 lines of profile across two
entries and has still not stopped the failure recurring.

**Boundary note.** `preflight.mjs` trusting a banner it should be checking against a bind is
pw-prove's half, and it is the pw-prove fix spec's (#138). The repository's half is that no caller can
obtain the listener's pid at all, which is what makes the skill's check unfixable from outside.

---

## 3 — The e2e suite's standing scanner debt, and specs that had never been run

Two related facts, both repository state, both paid repeatedly.

### 3a. Nothing has burned down the pre-existing findings

| Session | `scan.mjs` over `tests/e2e` | Of which the run's own files |
|---|---|---|
| `1927b90c` (line 235) | 233 hits | 7 lines in one spec |
| `18697484` (line 409) | 86 P1 positional-selector hits | 2 |
| `c871a4f2` (lines 306/316) | 17 P1 | 8 fixed, 9 remaining |
| `a273eefa` (line 454) | `290 total hit(s), 13 P0, 275 P1/P2 heuristic, 2 LLM-triage` | 0 |
| `d32c2495` (line 328) | findings dominated by `candidates.walkthrough.spec.ts` | 2 |

Two consequences show up in the distillations. First, **every run pays a second scan** to find its
own files in a directory-wide report — `1927b90c` (lines 235/240, nothing changed but the grep),
`18697484` (three runs in 49 s, 13 s wasted), `d32c2495`, `a273eefa`. Second, and worse, the
directory-wide summary is not a verdict a report can quote: `a273eefa`'s report line reads
`e2e-reviewer: 0 P0` over a scan whose own summary says **13 P0**, including a `#16` missing-await.
The claim is true as scoped and unreadable as written.

Note the honest half: **13 P0 findings are the silent-always-pass class.** They are in specs this
repository ships and CI is green over them.

### 3b. Carried specs that had never passed

`1927b90c` planned two acceptance criteria as *carried* by `silent-reject.spec.ts`, then discovered
in its first audit run that they had never run. Its own report (line 665):

> Two of the three carried wizard scenarios had never passed. They called `goToReview()`, which polls
> for a submittable review, so they burned 60 s and failed on the poll.

The distillation records the PR body saying the suite was never run. Cost: roughly **6.3 minutes** in
two identical 3-minute audit runs, plus the **25 m 24 s** to the rewrite onto a different Page
Object.

`fe171475` is the extreme case. Seven of thirteen carried scenarios failed on stale English copy in
spec locators against an app rendering German tenant data (lines 824, 1078). The repair ran
**52 minutes** of operator-directed, endpoint-by-endpoint fixture work and ended at 6/13 green; the
run's only deliverable was a diagnostic film of a red suite.

**Recommendation.** Run `tests/e2e` in CI, on a schedule if not per-PR, and quarantine what does not
pass at the merge base. A proof run cannot distinguish *"this PR broke it"* from *"it was already
red"* without paying a full audit run to find out, and it pays that price on every branch. Then
triage the 13 P0s once and put the standing count in a check that can only go down.

The widget repository has the same shape at a larger scale — 30 P0 findings, carried scenarios that
film nothing, and a spec that fails at the merge base — and it is written up there rather than merged
with this one, because the recommendations differ in what to do first. See
[setup — hyrd-widget](setup-hyrd-widget.md) §3 and §4.

### 3c. The deliberate proof-clip dwells are written on two lines

The repository writes the dwell as `if (process.env.PW_PROVE_CLIP)` and then an indented
`await page.waitForTimeout(...)`. `scan.mjs` walks up from the hit line and stops at the first
non-comment line — the `if` — so the `// JUSTIFIED:` above the block is never reached, and roughly
**34 dwells across the suite stand as `#9` hits** (the profile's own *Clips (toast payoffs)* entry
records the count). `clip-fidelity.mjs` accepts the same code. Two shipped scripts disagree about the
same lines, on every run.

**Boundary case, and this study takes both halves.** The repository's half is the two-line shape,
and writing it on one line is a mechanical edit within its reach. The scanner's half is that
`scan.mjs`'s `lineIsJustified` breaks at the first non-comment line, so a `// JUSTIFIED:` above an
enclosing block never suppresses the hit inside it — which is what `AGENTS.md`'s own Conventions line
("or above the enclosing block") promises and the scanner does not deliver. It is listed again under
[Not this repository's to fix](#not-this-repositorys-to-fix), and the widget study records the same
defect from the scanner's side.

**Recommendation.** Write the dwell on one line, as pw-prove's own Step-5 template does. That is a
mechanical edit to the suite and it retires 34 standing findings — without waiting on the scanner
half, which no target repository can fix.

---

## 4 — The generated API types are committed, so every base merge conflicts

`types/paul-api.gen.ts` is generated and tracked. When `main` and a branch have both regenerated it,
`git` cannot merge it, and Step 3's mandated base merge stops the run.

- **`b6dbd8be` (Friction 2, line 134):** *"`origin/main` moved 7 commits ahead and merging it into
  `sss/arch-c1-agent-config` hits conflicts in 5 files."* The sanctioned stop fired, the operator left
  pw-prove entirely and resolved 16 hunks across 4 components under a different skill — **15 m 24 s of
  agent time and 40 tool calls**, plus a full re-entry into Step 3 (a 150.6 s bring-up). The
  distillation calls it "the single largest recoverable cost in the range".
- **`67b624f4` (Friction 1, lines 150 → 154):** the same stop, on **70 hunks in the generated types
  file alone**. Recovery cost 2 m 08 s idle plus 6 m 30 s of merge-and-regen — including a
  `pnpm install --frozen-lockfile` because `openapi-typescript` was missing from the worktree's
  `node_modules` (lines 188 → 196).

The profile's *Merging* entry already carries the workaround (take either side, then run
`refresh-paul-types.mjs`). That the workaround exists and the conflict keeps happening is the point.

**Recommendation.** Either stop tracking `types/paul-api.gen.ts` and generate it on `postinstall`, or
add a `.gitattributes` merge driver that resolves it to either side and regenerates. And make
`openapi-typescript` a dependency the worktree reliably has, so the regen does not fail with
`sh: 1: openapi-typescript: not found` on a checkout with an otherwise-complete `node_modules`.

---

## 5 — `.env.example` over-declares, and a fresh worktree has no `.env` at all

`.env.example` declares eleven keys as required. Two are load-bearing.

- **`d3c037d9` (Friction 1):** `preflight.mjs config` stopped in 16 ms — `STOP - configuration
  incomplete: 11 required key(s) not set` (line 194). Recovered in ~20 s by sourcing `./.env` and
  declaring `REQUIRED_ENV="NUXT_API_BASE_URL NUXT_PAUL_API_BASE_URL"`. The agent named the cause at
  line 200 and the report repeated it at line 902.
- **`fa0cc83b` (Friction 1):** the same refusal at lines 733/734, ~20 s, on 0.21.0.

Separately, a fresh worktree carries no `.env`: `d3c037d9` copied one from the main checkout at line
121, `fa0cc83b` found none at line 729, and profile entry C3 spells out the whole hand-written recipe
for a checkout that has neither a `.env` nor a sibling to copy from — including the two required
values, which is a `.env` value committed to a shared file.

**Recommendation.** Two small changes:

1. **Let `.env.example` declare only what is required**, and put the optional keys behind a comment
   or a second file. Every tool that reads it — `pnpm check:env` included — is currently reading a
   contract the app does not have.
2. **Give a fresh worktree a bootstrap.** `config/env.ts` already holds the two constants profile
   entry C3 tells a human to copy by hand; a `pnpm setup:worktree` that writes them, and picks a free
   port, ends both the copying and the profile entry.

**A related note on `NUXT_PAUL_API_BASE_URL`.** Its value is required to carry a path suffix, and a
copied `.env` can drop it. The app then answers 200 on the main API, 404s every call that joins a
path onto it, and the page renders "Error loading data" — which reads as a broken tenant. The profile's *Env* entry records PR #3274's
description misdiagnosing exactly that. `pnpm check:env` passes either way, because it only checks
presence. **Recommendation:** check the shape, not just the key.

---

## 6 — The proof-relevant application facts a run rediscovers, and where they should live

This section is the study's central structural recommendation, and it is built directly on the
[profile audit](profile-audit.md)'s result: over twenty-six sessions, **four of fifty-six profile
entries scored as applied, seven were re-paid by a later run, and forty-five have no evidence either
way.** The chrysus profile is 321 lines read at every Step 1 and it is not delivering.

The facts themselves are real and each one cost a live pass:

| Fact | What it cost, and where |
|---|---|
| `hFetch` unwraps a `{status,message,data}` envelope on every 200 GET, so a bare `page.route` fixture resolves to `undefined` | `c871a4f2` Friction 4 — **8 of 9 scenarios failed**, one audit run and four turns of diagnosis (lines 332–359) |
| vue-sonner toasts self-dismiss in ~3 s, top-centre, and `clip-fidelity.mjs frames` samples at `duration − 0.5 s` | `18697484` — **four filming runs and ~40 minutes** circling one payoff frame (lines 433/519/568/807); `3072aa9b` — three films, ~9 minutes, budget overrun stated at line 993; `67b624f4` — one wasted sanctioned re-film (lines 399/495/510); `c871a4f2`, `cbe2813b` — two chapters published off-payoff |
| `?ff=reset` clears the override rather than setting the flag off; only `?ff=<key>:0` proves an off state | `18697484` line 354 — one spec failure and one fix cycle |
| A production `NUXT_PUBLIC_DEPLOY_ENV` refuses the `?ff=` override the whole proof depends on | `d3c037d9` line 110 — the run proceeded with that key set to a development value and disclosed it, so every scenario proves the app under a path production refuses |
| `data-testid` is silently dropped by multi-root `Ui*` components | profile C6; the identical fact cost `8eb0585c` two failing scenarios in the sibling repository |
| The candidate profile's tab query is `?tab=application`, **singular** | `a7cdcd1c` — part of a **~13-minute** heal loop (lines 720–866), guessed rather than read |
| The review step renders each agent as a collapsed native `<details>`, so its text is in the DOM and outside the accessibility tree | `d32c2495` Friction 3 — three red audit runs, **~7.5 minutes** of a 12 m 25 s Step 7 |
| Filter definitions are keyed on `Label`, not `Name` | `a7cdcd1c` Rework 4, line 991 — an injected fixture that made the flag-on direction unprovable |
| The recruiting-template wizard's **Create** button cannot be reached on the default staging tenant's pipeline | `1927b90c` Friction 4 — the wizard's `totalMissingFields` counts inline-handled warnings unfiltered, so submit stays disabled with **no readable reason**; two 3-minute audit runs and a 25-minute rewrite onto a different POM |

Every one of those is in the profile today. The profile is where an entry goes to be read by nobody:
its delivery is branch-local (Step 8 stages it with the proof commit), so a fact learned on branch A
reaches branch B only after A merges and the reader's checkout syncs. **As of this study the chrysus
checkout's local `main` is four commits behind `origin/main`, and the working-tree profile is 321
lines against 332 on `origin/main`.** Eight of its thirty entries are stamped with a `<sha7>`
(`ea311fa9`, `dfa75b4f4`) that is not a commit in this repository at all.

**Recommendation.** Move the application facts into the repository's own
`docs/agents/e2e-and-typecheck.md` — the file the profile's own preamble already names as their
owner, that a base merge distributes, that a human reviews, and that CI can lint. Keep in
`.pw-prove/profile.md` only what is genuinely unsettled and unencodable, which is what the preamble
says it is for. The widget repository has already done this and its file is visibly cleaner for it
(217 lines against chrysus's 321, with an explicit eviction rule in its preamble).

### The six entries that are not repository facts at all, and where each one goes

[`profile-audit.md`](profile-audit.md) names six chrysus entries that fail admission test 1 —
"is it about the repository?" — and says the reason is structural rather than careless: *"a run that
learns something about `preflight.mjs` has exactly one write surface — the target repository's
profile — and `SKILL.md` gives it no other."* Where they belong instead is partly a setup question
and partly not, so this study answers it entry by entry rather than as a block:

| Entry | What it describes | Where it belongs |
|---|---|---|
| **C5**, **C29** | `pnpm preview` is three processes; `RESTART=proven` over an `EADDRINUSE` death | **This repository.** They are two entries and ~25 lines describing one defect in `scripts/preview.mjs`. §2 above is the fix; once it lands, both entries leave under the profile's own eviction rule |
| **C3** | a macOS checkout with no `.env`, written by hand from `config/env.ts`'s constants | **This repository, as a script.** §5's `pnpm setup:worktree` recommendation is exactly this entry stopping being prose. It also carries two configuration values in a committed file, which is the redaction line the profile is not holding |
| **C4** | `rg` resolves to a Claude Code shell function, not a binary, so any tool spawning it dies | **Neither repository.** It is a property of the operator's host runtime and would be identically true of any project. Nothing in this study can give it a home |
| **C20** | the Clips publish endpoint is intermittently unreachable from the macOS worktree | **Neither repository.** A hosting-service observation about one machine on two dates |
| **C21** | `agent-native` is not on PATH on macOS; the vault lease must wrap the `PROBE_HOSTING` probe | **Neither repository** — though the widget study's §8 shows the adjacent case where a *repository* file (`mise.toml`) selects the runtime that lacks the tooling, and there the repository does own the fix |

**So four of the six have nowhere to go, and that is the finding.** C4, C20 and C21 are true, each
cost a live pass, and each is about the machine rather than about either repository — and a run that
learns one has exactly one place to write it. Two consequences follow, and only the second is this
repository's:

- **Not this repository's.** pw-prove has no host-facts surface, so the target repository's profile
  absorbs them by default. That is a skill-side gap and it is named under
  [Not this repository's to fix](#not-this-repositorys-to-fix).
- **This repository's.** Nothing stops the absorption from the reading side either. `hyrd-widget`'s
  profile preamble does — *"nothing here is true of every repository using the skill (that is a skill
  defect)"* — and chrysus's has no such rule, which is the plainest single reason its file has drifted
  to 321 lines while widget's holds at 217. **Adopt the widget preamble's eviction rule.** It costs
  four sentences and it is the only one of these recommendations that pays for itself immediately.

Two smaller repository fixes belong under the same heading, because they are what make the wizard and
the toasts costly rather than merely quirky:

- **`totalMissingFields` should filter `INLINE_HANDLED_MISSING_LABEL_KEYS`,** or the review step
  should name what is missing. A disabled submit with a bare `1` badge and no banner text is
  undiagnosable from a test, and the workaround (`goToReviewUnchecked()`) is a profile entry rather
  than a repo API.
- **The `_silentRejectLive` fallback should be settled.** `d3c037d9` spent **~8 minutes and three
  forced rebuilds** on a mutation target that is structurally unreachable with the flag on; both its
  own report and the later review left "is this dead code" open.

---

## 7 — Smaller items the evidence names

**No e2e `tsconfig.json`.** `b6dbd8be` (Wrong turn 3) probed `tests/e2e/tsconfig.json` and
`tests/tsconfig.json`, found neither, and ran **no typecheck at all** after hand-editing seven specs.
`cbe2813b` (Friction 6) guessed the same path, got `TS5058`, and recovered with the repo's own
`pnpm typecheck:scoped` at a cost of 3 m 32 s. **Recommendation:** add `tests/e2e/tsconfig.json`, or
name `pnpm typecheck:scoped` as the e2e typecheck in the repo's agent docs. The widget repository is
missing the same file, with a sharper consequence — see
[setup — hyrd-widget](setup-hyrd-widget.md) §8.

**`pnpm typecheck:scoped` has pre-existing errors, so there is no clean baseline.** `7cc7e6bc`
(Rework 1) tried to take a before/after delta with `git checkout HEAD~1 -- $FILES`, which resurrected
a helper the commit under test had deliberately deleted; three extra tool calls to get back to a
clean tree. **Recommendation:** get the scoped typecheck to zero, or publish the expected-error
baseline.

**`.pw-prove/` is refused by `.gitignore:94`.** `c871a4f2` (Friction 6) hit `git add` exit 1 at line
667 and recovered with `git add -f` at line 673. The file is ignored *and* force-added on every run,
which is the least discoverable combination available. **Recommendation:** if the profile is
repository state, un-ignore it explicitly (`!.pw-prove/profile.md`); if it is not, stop committing it.

**Five specs still wrap their proof dwell in a file-local helper.** `7cc7e6bc` line 592 names
`cookie-banner-section`, `welcome-message-inheritance`, `employee-page-config`,
`message-settings-tabs` and `person-search-migration`. A helper call is invisible to
`clip-fidelity.mjs`, so those dwells are inert under `PW_PROVE_CLIP` and their chapters film nothing.
**Recommendation:** finish the inlining #3258 started.

**Import order.** `7cc7e6bc` (Friction 4) had to fix `import process from 'node:process'` placement
twice, in two passes. Minor, and it is the repository's lint convention rather than a defect.

---

## Not this repository's to fix

Recorded so the boundary is stated rather than implied. Each of these cost a chrysus session
something and belongs to the pw-prove fix spec (#138) or outside the exercise:

- **`preflight.mjs` trusting a pre-bind banner as a restart proof** (`3072aa9b`, `c871a4f2`). The
  repository's half is §2 above; the check itself is the skill's.
- **The mutation check does not stop the preview server before its forced rebuild.** The other half
  of §1's killed build: `a7cdcd1c`'s distillation is explicit that "the body's own mutation-check step
  does not tell the run to stop the preview server *before* the forced rebuild, only to restart it
  after, so pw-prove's ordering contributed". The repository can make the build refuse; the skill can
  make the collision not happen.
- **`ENV_CONTRACT=none` documented in the body and unimplemented in the script** — `d32c2495` line
  122, `a7cdcd1c` line 438, `fa0cc83b`, `6f307a2f`. Body and shipped script of the same version
  disagreed. Gone in 0.28.0, which removed the key from both.
- **`preflight.mjs config browser build` refusing the `browser` phase** the 0.24.0 body prescribes
  (`3072aa9b` line 123). Same parity class.
- **`.git/info/exclude` written as a literal path in a linked worktree** (`c871a4f2` line 639,
  `998dd2c1`, `af23ab55`, `240d63c1`). The repository's use of worktrees is not a defect; the
  hard-coded path is.
- **`git checkout -- '**/auto-imports.d.ts'`** in the Step-8 sweep, which git's default pathspec
  cannot glob (`3072aa9b` line 1123, `67b624f4` line 603). Silently does nothing.
- **The clip-fidelity audit's five-line `// JUSTIFIED:` lookback**, which a longer rationale block
  overruns (profile, *Clips (toast payoffs)*).
- **pw-prove gives a run no place to write a host fact.** The other half of §6's six-entry table:
  C4, C20 and C21 describe the operator's machine, belong to neither target repository, and land in
  a target repository's profile because it is the only write surface the skill offers.
- **`scan.mjs`'s `// JUSTIFIED:` suppression not reaching through an enclosing block.** The other
  half of §3c: the scanner walks up from the hit line and stops at the first non-comment line, so a
  rationale above an `if` never suppresses the statement inside it. `AGENTS.md`'s Conventions line
  promises "or above the enclosing block" and the scanner does not deliver it. The widget study
  records the same defect from four of its own sessions.
- **Orca, the harness and the model API.** Five API 529 stalls costing `b6dbd8be` ~35 minutes; the
  10-minute Bash ceiling that killed `fe171475`'s first audit run; `index.lock` contention from
  `orca-ide`; the worktree auto-sync that moved the remote branch under `18697484`. Excluded by the
  exercise's own scope rules.
- **Genuine application defects the runs found** — the ungated `SilentReject` default, the IAM nav
  gating in `settings.vue`, the unlabelled checkbox. pw-prove is not blamed for finding what it was
  asked to find, and fixing them is not a setup change.

## What I could not determine

- **Whether any of the forty-five unresolved profile entries were ever applied.** The distillations
  record friction and mistakes; a quiet, successful application leaves no trace, every transcript in
  the corpus serialises its `thinking` blocks empty, and no distillation records the Step-4
  `Profile:` line that would have said so. §6's recommendation rests on the entries that were
  **re-paid**, not on silence.
- **The true cost of the standing scanner debt.** The distillations measure the second scan (seconds)
  and the unreadable report line. They do not measure whether a real finding was ever lost in the
  noise, and nothing in the corpus would show it.
- **Whether the build could be made materially cheaper.** The measurements above are what the runs
  paid; nobody profiled the build itself, and a warm-cache recommendation is an inference from the
  `BUILD_REUSE` contract rather than something the corpus demonstrates.
- **How much of §5 is still true.** The `.env.example` figure of eleven-declared-two-required is from
  0.20.0/0.21.0 runs on 2026-08-17. Nothing since re-measured it; the profile header's
  `ENV_CONTRACT=omit` is consistent with it and is not evidence.
- **Whether the `_silentRejectLive` fallback is dead code.** `d3c037d9`'s report called it "looks
  like dead code" and the later review left it open. That is a repository question the corpus does
  not settle.
