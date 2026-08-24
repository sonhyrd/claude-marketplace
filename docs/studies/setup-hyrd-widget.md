# Target-repo setup — `hyrd-widget`

What the **repository** could provide so the next pw-prove run against it starts from something
better than a blank worktree. Part of [run forensics](run-forensics.md), drawn from the twelve
`hyrd-widget` [session distillations](session-distillation.md) in the corpus and from the
[profile audit](profile-audit.md).

**Nothing here is applied and nothing here is a decision.** `docs/adr/` holds decisions and
`docs/specs/` holds specs; this file holds evidence and a recommendation a reader may act on. The
repository was read and not written: no file in the `hyrd-widget` checkout was modified, and
`.pw-prove/profile.md` in particular was read at its live path and left at 217 lines.

**This repository is written up separately from `nuxt-hyrd-chrysus`** because the two genuinely
differ. Chrysus is one proof target whose build dominates every run; widget is three proof targets
whose builds are cheaper and whose specs are heavier. A merged document would hide which
recommendation belongs where — see [setup — nuxt-hyrd-chrysus](setup-nuxt-hyrd-chrysus.md) for the
other half. Where a finding is the skill's rather than the repository's it is named in
[Not this repository's to fix](#not-this-repositorys-to-fix) rather than dropped.

## How to read a recommendation

Each one names the sessions that paid for its absence, with the transcript lines a reader can open.
A setup change nothing in the evidence asks for is not here. Costs are the distillations' own
measurements; where a distillation says a figure is approximate, so does this file. The
distillations are not committed — they live in the exercise's scratchpad, and a reader with them can
open any line cited below.

## The twelve sessions this study reads

| Session | Worktree | pw-prove | Records / non-zero | Date |
|---|---|---|---|---|
| `9899ba51` | razorbill | 0.21.0 | 20 / 2 | 08-17 |
| `6f307a2f` | stickleback | 0.22.0 | 10 / 2 | 08-18 |
| `bbae9aa2` | hogfish | 0.23.1 | 16 / 1 | 08-18 |
| `0259fd57` | shearwater | 0.24.0 | 24 / 0 | 08-19 |
| `8eb0585c` | *(main checkout)* | 0.24.0 | 8 / 1 | 08-19 |
| `befb0456` | krill | 0.24.0 | 15 / 2 | 08-19 |
| `998dd2c1` | sanddab | 0.26.0 | 22 / 2 | 08-20 |
| `f28c3493` | *(main checkout)* | 0.26.0 | 9 / 0 | 08-20 |
| `240d63c1` | krill | 0.26.0 → 0.27.0 | 27 / 4 | 08-20 |
| `10748ea5` | *(main checkout)* | 0.27.0 | 14 / 2 | 08-21 |
| `af23ab55` | rainbowfish | 0.27.0 | 34 / 1 | 08-21 |
| `3deeddd7` | *(main checkout)* | 0.27.0 → 0.27.1 | 19 / 4 | 08-21 |

---

## 1 — Three proof targets, and no way to name one

The repository's own profile states the problem in its header:

> The header below describes **one** target — the SSR start page — because the skill's header holds a
> single build/serve pair. The other two targets are rows in that table.

The skill can carry one build/serve pair. The repository has three targets — the SSR start page, the
statically built widget app, and the standalone embeds under `build/chat` — and each has a different
build command, a different serve command and a different set of things it can prove. Nothing in the
repository resolves a run to one of them, so every run assembles a target by hand, and two runs
assembled the wrong one.

- **`0259fd57` picked the wrong target and lost a whole arm to it.** The PR was a defect reported
  against one real customer's logo file; the run brought up the statically built widget app, which can
  only render fixture logos. Every gate passed — 8 of 9 green, three guards RED under mutation, every
  frame read, hermetic audit clean — and the operator rejected it in one line (line 342):
  *"did you run this with fake data and fake company"*. The concession is at line 347. **Cost: the
  entire first arm — 24 minutes, two published recordings, a commit, a push and a PR comment, all
  superseded.** The second arm rebuilt against the SSR origin and redid Steps 3, 5, 6, 7 and 8.
- **`8eb0585c` skipped the bring-up gate entirely** rather than resolve the mismatch. `preflight.mjs`
  never ran its config/build/serve phases; the build was a hand-run `vite build` (lines 89, 214) and
  the origin a hand-written static server (lines 144, 213). The distillation marks it a boundary case
  for exactly the reason above: `CONTRIBUTING.md` owns the three targets and the profile's env header
  covers only the SSR one. The visible cost was **~2 m 33 s of build-wait polling** (lines 116–197,
  eight tool calls on one question) because the hand-rolled build has no instrument that returns when
  it finishes.
- **`0259fd57` also found the repository's own target table wrong.** `.pw-prove/AGENTS.md` recorded
  the `--base /` + `build/chat` root as the *rejected* alternative, while the specs under proof
  navigate a path that requires it. The run corrected it at line 305 and priced it at line 334:
  *"Cost me one 118 s build to learn; corrected in the same commit."*
- The profile's *Bring-up — the standalone widget embeds* entry documents the same trap from the
  other side: `vite.config.app.ts` writes to `build/chat`, so under `build/` a spec navigating
  `/meet/` gets a 404 shell that boots nothing.

**Recommendation.** Give each target a named script pair in `package.json` — `proof:build:<target>`
and `proof:serve:<target>` — and one table, in `CONTRIBUTING.md`, saying which surfaces each one can
prove. A run then names a target instead of assembling one, and the "which root serves `/meet/`"
class of error stops existing. This is the highest-value change available to this repository: it is
the only one in this study that would have prevented a *published, fully-gated, wrong* proof.

**Boundary case, and the other half is the skill's.** `0259fd57`'s distillation attributes the
wrong-subject proof to pw-prove — "nothing in Step 5, Step 6 or Step 7 asks whether the artifact in
frame is the artifact the AC is about; the clip inspection table diagnoses framing, dwell and
settling, never subject identity". A target table cannot make a run ask that question, and the
question would have caught this run four minutes in. It is listed again under
[Not this repository's to fix](#not-this-repositorys-to-fix).

**Also worth saying plainly:** `.pw-prove/AGENTS.md` is repository-authored documentation that a
proof run treats as authoritative, and it was wrong. It needs the same review as code, or it should
be folded into `CONTRIBUTING.md`, which the profile preamble already names as the owner.

---

## 2 — The serve scripts hide the listener, and every run improvises a kill

The repository's serve entry points wrap the process that actually binds, so the pid a caller can
record is never the listener. `exec env PORT=… pnpm serve:start-ssr:staging` records the shell's own
pid, which becomes pnpm, which forks node.

- **`0259fd57` (Wrong turn 2):** line 478 killed pid 100361; line 497 revealed the real pid via
  `pgrep`; line 516 killed 100574. The agent named the mechanism itself at line 509.
- **`0259fd57` (False proof 2):** the consequence. `preflight.mjs` reported `SERVE=ok /
  RESTART=proven` at line 492 while the restarted process had died on `EADDRINUSE` (line 511) and the
  **old, un-mutated** build kept answering. Had the run obeyed the skill's own "do not re-litigate a
  fast `RESTART=proven`", the mutation verdict would have been read against an artifact that never
  held the mutation. Caught only by an unrequested `pgrep`/`curl` cross-check.
- The improvised alternative fails too: three sessions killed their own shell with a `pkill` pattern
  that matched the command line issuing it — `9899ba51` (lines 1151/1157, `Exit code 144` twice,
  ~1 minute and three turns), `befb0456` (line 504), `6f307a2f`.
- **`af23ab55`** hit the milder version: `PID=3389264 /bin/bash: line 1: kill: (3389264) - No such
  process` (line 725), a pid read from a log whose process had already exited.

**Recommendation.** Give each target one `serve:` entry point that `exec`s the listener and prints
its own pid and port **after** the listen callback fires. That makes the recorded pid the listener
and the banner a bind proof, and it removes the `pkill`-by-pattern improvisation that three sessions
reached for. The sibling repository has the identical defect from a different direction (see
[setup — nuxt-hyrd-chrysus](setup-nuxt-hyrd-chrysus.md) §2); neither profile can fix it, because no
caller can obtain the listener's pid at all.

---

## 3 — The e2e suite carries thirty P0 findings, and nothing is burning them down

Five sessions ran `scan.mjs` over `tests/e2e`. The P0 count is stable across five days:

| Session | Scanner summary | Line |
|---|---|---|
| `9899ba51` | 210 hits, **26 P0** across the existing suite | 963 |
| `998dd2c1` | `223 total hit(s), 30 P0, 176 P1/P2 heuristic, 17 LLM-triage` | 304 |
| `befb0456` | `224 total hit(s), 30 P0` | 460 |
| `10748ea5` | `[P1] #9 Playwright hard-coded sleep (119 hits)` | 378 |
| `af23ab55` | `267 total hit(s), 30 P0, 219 P1/P2 heuristic, 18 LLM-triage` | 169 |

P0 in this taxonomy is the **silent-always-pass** class: tests that would still be green with the
feature removed. Thirty of them are in specs this repository ships, and CI is green over them.

The standing count also costs every run twice. Because the scan is directory-wide and the summary is
not scoped, each run pays a second scan just to see its own files — `9899ba51` (lines 962/968, 13 s
apart, only the grep changed), `998dd2c1` (lines 303/308), `befb0456` (lines 459/464, the first run's
`tail -45` cut off the two files under review), `10748ea5` (lines 372/377). And the report line it
produces is not checkable: `998dd2c1`'s report claims `0 P0, 0 P1` over a scan that listed nine
unsuppressed hits in its own new spec (line 304 against line 719).

**Recommendation.** Triage the 30 P0s once and put the standing count in a check that can only go
down. That is the whole recommendation; the second-scan cost disappears on its own once the
directory-wide number means something. The sibling repository carries 13 of the same class and the
same second-scan cost — see [setup — nuxt-hyrd-chrysus](setup-nuxt-hyrd-chrysus.md) §3, where the
first recommendation differs because its suite also holds specs that had never been run at all.

---

## 4 — Carried specs are red or unfilmable at the merge base, and a proof run finds out the expensive way

Three distinct shapes, all repository state, all discovered by a run that had to pay a full audit or
filming pass to see them.

### 4a. A carried spec fails at the merge base

`f28c3493`'s Step-4 plan declared a three-file spec set — ten scenarios — because "filming its two
consumers is what proves the POM change". `dead-embed-degrades.spec.ts` › *"a live embed keeps the
strong scroll gate, even past the liveness deadline"* failed on the first run (line 283). The agent
established at lines 302/303 that the spec is **byte-identical at the merge base and fails the same
way**, then quietly dropped the file: every subsequent run covered five scenarios, not ten, and the
report's "8 proven of 8 total" is arithmetic over a narrowed set.

`0259fd57` records the same shape declared in advance — a pre-existing spec failure named in the PR
body before the run began (lines 162/197).

### 4b. Carried specs are flaky, and a run cannot tell flake from regression without paying

`3deeddd7` lost **two filming runs** to it. The first film went red on `error-nets` (line 409); the
re-film went red on `static-tree-origin` (line 439); an isolation check ran `error-nets` alone 3/3
green (line 429). The agent's own reading at line 443: *"a different carried spec timed out … Same
class, different victim — flaky, not caused by my spec."* The final audit run on the merged tree was
20/22 (line 605). Roughly **6 m 37 s of filming** bought nothing, and the run's report contradicted
itself in one message (`22 proven of 22` beside "the final 20/22").

The cause is §7 below: third parties hanging `load`/`networkidle`. The repository eventually grew
`helpers/incidentalThirdParties.ts` for it — at lines 653–675 of that same session, **after** the
report had already gone out.

### 4c. Nine of seventeen carried scenarios film nothing

`240d63c1` filmed, extracted 21 frames and read 17 of them before running the clip-fidelity audit
over the **carried** specs and learning what it had just filmed (line 587):

> `clip-fidelity: STOP — 6 test() block(s) in tests/e2e/meet-date-request-time-choice.spec.ts have a
> missing, misplaced or unjustified payoff dwell`

and the agent's reading at line 591:

> **9 of the 17 carried scenarios have no payoff dwell at all** — `PW_PROVE_CLIP` is inert for them,
> so those chapters are unheld footage. That's what produced the off-frame frames.

**Cost: roughly 11 minutes and ~21 image reads inside a 45-minute pipeline**, plus a re-film.
`bbae9aa2` hit the same convention from the reporting side: four `#9` hits on the run's own dwells,
neither fixed nor reported (line 369 against line 551).

**Recommendation for all three.** Run `tests/e2e` in CI so a spec cannot be red at the merge base
without somebody knowing, quarantine what does not pass, and add the inline gated payoff dwell to
every carried scenario once — in the repository — rather than having each proof run discover and patch
it. A proof run cannot distinguish *"this PR broke it"* from *"it was already red"* without paying a
full run, and it pays that on every branch.

---

## 5 — `CONTRIBUTING.md`'s push rule stops five runs dead, for a question a rule could answer

The repository requires operator confirmation before a push. pw-prove's Step 8 is titled
"deterministic, no questions". The two collide in five of the twelve sessions, and the collision is
almost pure idle time:

| Session | Wait | Line |
|---|---|---|
| `10748ea5` | **26 m 35 s** — the single largest wall-clock item in that range | 525 → 526 |
| `0259fd57` | 8 m 38 s, and the operator chose the option the pipeline would have taken unprompted | 319 → 321 |
| `f28c3493` | 3 m 16 s | 486 → 487 |
| `8eb0585c` | 1 m 47 s | 562 → 567 |
| `befb0456` | the run's range **ends** at the unanswered gate | 540 |

Look at what actually triggered three of them, though, and the rule has a real job. In each case the
branch carried a **foreign** unpushed commit the run had not authored: `10748ea5` line 525 (*"my test
commit, plus `135ec372` … your own commit, authored today, but made before this run and never
pushed"*), `f28c3493` line 479, `0259fd57` line 48.

**Recommendation.** Narrow the rule to the thing it protects. *"Push only commits you authored; if
`@{upstream}..HEAD` carries a commit you did not write, stop and report."* A run can evaluate that
from `git log` without asking anyone, and the four cases above where the operator's answer was the
obvious one become four decisions instead of ~40 minutes of idle. Keep the blanket rule if the
intent is broader than the evidence shows — but then say so in `CONTRIBUTING.md`, because right now a
run reads the rule, cannot tell whether it is protecting authorship or something else, and asks.

**Related, and the repository's to settle:** `240d63c1` spent 3 m 39 s asking which tree to prove,
because PR #1009 was `MERGED` as squash `d114a72f` while the local branch carried three unmerged
commits on top (lines 66/73/74). The same history shape later made PR #1029 come back `CONFLICTING`
(lines 802–807). Squash-merging a branch that keeps being worked on produces exactly this.

---

## 6 — The builds are cheap; the SSR target's first render is not the tenant's

Widget's builds cost a third of chrysus's, and the repository already knows why one of its targets
needs no restart at all. From the profile's *Bring-up — the widget static target* entry:

> The widget app target rebuilds in **~200 s** for the SDK+app pair, and `serve` reads from disk per
> request — so a rebuild needs **no restart** […] here.

Two runs used that fact and said so: `befb0456` (line 331) and `f28c3493` (line 425). Both then had a
mutation verdict with no `RESTART=proven` to license reading it — sound in both cases, because a
stale artifact can only yield green and both went RED, but neither could show the licence.

Measured build costs across the corpus, for whoever is deciding what to cache: 57–59 s (`9899ba51`),
108–162 s (`6f307a2f`), 123 s / 219 s (`bbae9aa2`), 99–156 s (`0259fd57`), 124–164 s (`befb0456`),
200–257 s (`998dd2c1`), 135 s / 208 s (`f28c3493`), 176 s / 203 s (`240d63c1`), 122 s / 241 s
(`10748ea5`), 110–221 s (`af23ab55`).

**Recommendation.** Put the per-target rebuild cost and the *static target needs no restart* fact in
`CONTRIBUTING.md`, beside the target table §1 asks for. It is the single most reusable measurement
either repository holds, and it currently lives in a profile that the next run may not have (§9).

**And one target-specific fact that is not in the repo docs and should be.** From the profile's
*Bring-up — the SSR start page's first render is not the tenant's*: the first request after the
origin boots answers 200 with the generic title and a tenant-fallback marker header; the tenant's
own title appears from the second request on. A spec whose first navigation carries its assertion
reads a healthy-looking page naming the wrong thing. That is a bring-up contract, not a runtime
observation — it belongs with the serve script.

---

## 7 — Third parties hang the page, and every spec aborts them by hand

`3deeddd7` paid the worst of it. Step 3's recon was done with `curl` rather than the probe, so nothing
opened a browser; Step 7's first proof run then died on a **114.5 s `page.goto`** (line 352), which the
agent could only diagnose by finally starting a probe session (line 362). The cause: the
`widget.hyrd.ai` proxy iframes and the CCM19 consent platform never let `load`/`networkidle` settle
(lines 368, 427). That same hang is what produced §4b's two lost films.

The other side of it is that aborting everything is not safe either. From the profile's *Gotchas —
proving the SSR origin's OWN output in a browser*:

> Aborting EVERY off-origin request on `/chat/embed/start` is not the safe default it looks like […]
> hydration REPLACES the 12 server-rendered job cards (two observed false reds).

So the right set is neither "none" nor "all", and today every spec derives it again. `3deeddd7`
eventually wrote `helpers/incidentalThirdParties.ts` (lines 653–675) — after its report had shipped.
`af23ab55` reached the same conclusion independently and declared a twelve-line `CARVE-OUT:` header
instead (line 393); its delivered spec is **100 % live — 22 distinct LIVE endpoints, 0 mocked** (line
614), honestly declared at four surfaces and still a proof against a shared staging tenant.

**Recommendation.** Make `helpers/incidentalThirdParties.ts` the default for every spec — a fixture,
not an opt-in import — and record in the repository which origins are incidental and which are the
tenant's own. That is one list, it is the repository's to know, and it currently gets re-derived per
spec at a cost the corpus measures in whole filming runs.

---

## 8 — Smaller items the evidence names

**`mise.toml` pins a node version the publish tooling is not installed under.** `9899ba51`'s publish
failed with `mise ERROR No version is set for shim: agent-native` (line 1218); the run copied mise's
own hint into its completion report as the fix and stopped. The operator pushed back (line 1274) and
the real cause surfaced three turns later (line 1313): `agent-native` is installed only under node
**24.18.1** while this repo's `mise.toml` pins **24.19.0**, and global npm packages are
per-node-version. **Cost: 16 m 23 s idle plus 6 m 52 s of work, including a full re-film** because the
Step-8 hygiene sweep had already deleted `test-results/`. The tooling is the host's; the pin is the
repository's, and it is what selects the node that lacks it. **Recommendation:** name the required
global tooling and the node version it must live under in `CONTRIBUTING.md`.

**No e2e `tsconfig.json`.** `240d63c1` ran `tsc --noEmit -p tests/e2e/tsconfig.json`; it answered
`error TS5058: The specified path does not exist` and the shell `||` fallback grep printed nothing —
*"which reads exactly like a clean typecheck"* (line 313). A gate that cannot fail — which is worse
than the sibling repository's version of the same gap, where the typecheck simply did not run
([setup — nuxt-hyrd-chrysus](setup-nuxt-hyrd-chrysus.md) §7). Recovered against the root config at
line 318. **Recommendation:** add `tests/e2e/tsconfig.json`.

**The map has no readiness signal.** `af23ab55` spent three navigations and ~2 minutes finding one: a
9000 ms settle reported `hasMap:false` (line 222), 12000 ms reported `hasMap:true,
clusterCount:"168"` (line 238), and the run settled on 13–14 s (lines 253, 329). The map mounts only
after a guest mint plus a client cluster query. The same session then shipped a locale-pinned
assertion that failed in a cold test context (`Expected: "Vergrößern" Received: "Zoom in"`, line
493) — because `JobLocationsMap.vue` relabels its zoom controls once, in the `load` handler, and never
re-runs. Rewritten twice. **Recommendation:** emit a settled attribute (`data-map-ready`) once the
cluster query lands. Small, and it retires a recurring class.

**Recon against the built widget app is meaningless without the spec's own mocks.** `0259fd57`'s four
probe calls returned `hasHeader:false, boxes:0, imgs:0` and five console errors including 403s (line
148) — with no guest bearer, `candidate-page-config/sections`, `company-info` and `consent-documents`
all answer 403 and the header never mounts. The distillation's own note is the sharp one: *"a recon
that reported `0 imgs` on a logo proof is precisely the signal that would have caught friction 1 four
minutes in."* This is recorded in the profile and it is a property of the target, not a defect — but
it is a bring-up contract and belongs beside §1's target table.

**Fixture realism.** `0259fd57`'s specs seed a synthetic `ACME` SVG wordmark under a tenant slug that
is not the reporting customer's. Every gate passed over it and the operator rejected the film. Not a
defect in any single spec; worth a repository convention about when a fixture may stand in for the
subject of a proof.

**`ConsentReadThroughPage.open()` hard-codes localhost** — reported in passing by `f28c3493`
(line 513) and not verified further here.

---

## 9 — The profile is not reaching the next run, and this repository's copy is the worse of the two

The [profile audit](profile-audit.md) found the delivery broken in both repositories. Here it is
measurably worse:

- Local `main` is **9 commits behind** `origin/main`.
- The working-tree profile is **217 lines**; `origin/main` holds **328**.
- **Ten whole entries are missing from the file a local run reads**, every one written on 2026-08-21
  by corpus sessions — including the job-location map's zoom-language latch that `af23ab55` paid for
  (§8), and the pair `3deeddd7` re-derived at the cost of a 114.5 s `goto` timeout, an unplanned probe
  session and two re-films (§7).
- `af23ab55` committed 58 lines of profile to branch `MAMAS-9256-map` and reported *"Profile updated:
  5 entries added"* (lines 357, 892). Those five entries are on `origin/main` now and were never in
  the file the next local run read.

The mechanism is in the skill's own contract — Step 8 stages the profile with the proof commit, so a
fact learned on branch A reaches branch B only after A merges and the reader's checkout syncs — and
that half belongs to the pw-prove fix spec (#138). The repository's half is the checkout that is nine
commits behind, and the decision about whether `.pw-prove/profile.md` is repository state at all.

**The good news, and it is worth saying because chrysus has not done it.** This repository's profile
preamble already carries an eviction rule:

> An entry leaves this file as soon as the thing it describes has been addressed anywhere. Nothing
> here is a repository defect (fix it, and document the result where agents already look).

That rule is why this file is 217 lines against chrysus's 321, and the recommendations above are
mostly a request to finish what it started: the target table (§1), the per-target build costs (§6),
the incidental-third-party list (§7) and the SSR first-render fact (§6) are all things the preamble
says belong in `CONTRIBUTING.md` and that are currently in the profile.

**One cost the preamble has already caused, recorded rather than hidden.** The profile audit found
`8eb0585c` reading the preamble's "read `CONTRIBUTING.md` for the other targets" and using it to
skip Step 3's three-phase bring-up gate entirely. A pointer that redirects a run out of its own
pipeline is doing more than shortening a search. If the target table lands in `CONTRIBUTING.md` as
§1 recommends, the redirect stops being an escape hatch and becomes an answer.

---

## Not this repository's to fix

Recorded so the boundary is stated rather than implied. Each cost a widget session something and
belongs to the pw-prove fix spec (#138) or outside the exercise:

- **Nothing in the pipeline asks whether the artifact in frame is the artifact the AC is about.**
  The other half of §1: every gate passed over `0259fd57`'s arm-1 film and only the operator caught
  it. The clip-inspection table diagnoses framing, dwell and settling, and has no row for subject
  identity.
- **`preflight.mjs` reading a pre-bind banner as a restart proof** (`0259fd57` line 492). The
  repository's half is §2; the check is the skill's.
- **`.git/info/exclude` written as a literal path in a linked worktree** — `998dd2c1` (lines 497 →
  510), `af23ab55` (lines 201 → 211, and the exclude landed in the *main* checkout's file),
  `240d63c1` (line 222). Three sessions, one line of script.
- **`clip-fidelity.mjs` certifying a spec that cannot film.** `bbae9aa2` line 355 returned
  *"clip fidelity contract satisfied — Step 7 may film"* over a spec whose no-JS scenario built its
  own context with `browser.newContext()` and therefore does not inherit `use.video`; the film
  produced 3 clips for 4 tests (line 406). ~4 minutes and three extra runs.
- **`clip-fidelity.mjs spec` scoped to generated specs while Step 7 films the whole PR spec set** —
  the mismatch behind §4c (`240d63c1` Friction 4).
- **`scan.mjs`'s `// JUSTIFIED:` suppression not reaching through the `if (process.env.PW_PROVE_CLIP)`
  guard**, so the skill's own mandated dwell reads as a `#9` hit. `998dd2c1` (line 258 accepting vs
  line 304 flagging the same nine lines), `10748ea5` (line 378), `af23ab55` (six hits, line 440),
  `bbae9aa2` (four hits). Two shipped scripts, one convention, opposite verdicts.
- **`publish-proof.mjs` reporting a successful publish as a failure** — `3deeddd7` line 560,
  `publish failed — … HTTP 200` beside a live share link, on 0.27.0 and not on 0.27.1.
- **`preflight.mjs serve` invoked for a publish-credential question it cannot answer** — `3deeddd7`
  line 511, exit 3, `SERVE_CAUSE=no-log`, ~21 s and one turn.
- **`ENV_CONTRACT=none` documented and unimplemented** — `6f307a2f` (line 103, the 162 s build never
  started), `bbae9aa2` (line 282). Gone in 0.28.0.
- **Orca and the harness.** The turn-boundary kill that cost `3deeddd7` a 46-minute stall; the
  `sleep`-chain refusals in `6f307a2f` and `af23ab55`; the concurrent session that committed into
  `6f307a2f`'s worktree mid-run and the one that merged into `3deeddd7`'s branch; the exit-144
  notifications on every deliberate server teardown. Excluded by the exercise's scope rules.
- **Genuine application defects the runs found** — the content iframe stealing focus at ~1.2 s, the
  eager `ScreenDocuments` mount, `UiDialogContent` swallowing `data-testid`, radix-vue's
  `SelectContent` overriding the caller's `id`, the `ScrollPicker` alignment bug. pw-prove is not
  blamed for finding what it was asked to find.

## What I could not determine

- **Whether the 30 P0 findings are real.** The corpus records the count from five scans; no session
  triaged them, and this study did not open the specs. The recommendation is to triage, not to
  assume.
- **Whether `CONTRIBUTING.md` actually says what the runs cited it as saying.** Three sessions
  justified a deviation by citing it — the push rule (`8eb0585c` line 561, `f28c3493` line 478), the
  static-origin no-restart claim (`f28c3493` line 425), the alternative build root (`0259fd57`) — and
  no distillation read the file. §5 and §6 take the runs' readings at face value and say so.
- **Whether the ten entries missing from the working-tree profile were ever read by anything.** They
  exist on `origin/main` and on their own branches; whether a run in another checkout saw them is
  outside what the corpus records.
- **Whether the flakiness in §4b is fully explained by the third parties.** `3deeddd7` diagnosed it
  that way and the fix it eventually wrote is consistent, but the run never isolated the two, and its
  own report could not say whether the 22/22 and the 20/22 differ because of the mid-run merge or
  because of the flake.
- **How much of §1 survives the repository's own changes since 2026-08-21.** The three-target shape
  is stated in the profile as of this reading; the corpus ends on 08-21 and nothing here re-measured
  it.
