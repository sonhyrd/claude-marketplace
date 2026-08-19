# The proof run is concurrent, and serialisation is a diagnostic rather than a mandate

> Supersedes the **first** decision of `docs/adr/0010` — `--workers=1` on every proof run. 0010's
> other two decisions (the mutation run's isolated `--output`, and `hermetic.mjs` as a script) are
> untouched and remain live.

`docs/adr/0010` pinned every proof run to one worker. It was right to, and it was right on evidence:
a five-scenario run in which all five scenarios timed out at their first navigation after six
minutes, then passed in two minutes serialised. The target then was a **development server**, which
compiles routes on demand; five cold compiles of the same route starved each other. That is not
tuning, and the record correctly refused to call it tuning.

`docs/adr/0016` changed the proof target to the **built application served by its preview server**,
which compiles nothing and therefore cannot saturate that way. It would have been easy to drop the
mandate in the same change on exactly that reasoning. 0016 deliberately did not: it kept
`--workers=1` binding and staged its removal behind evidence from real runs, because the mandate
rests on an observed failure and reasoning does not retire an observation. A decision record wrongly
superseded is worse than one left standing — the next agent trusts it.

The evidence now exists, and it is recorded here rather than in a separate study: **31 runs and 120
test instances** against a real open pull request on a real application, at `--workers` from 1 to 6,
hermetic and non-hermetic, filmed. The three numbers that decide this:

- **Wall clock falls by 1.76×** on the three-scenario proof shape (median 46.4 s serialised against
  26.4 s at Playwright's default of 4 workers) and by **1.89×** on the six-instance shape that
  matches the original failure (75.5 s against 39.9 s).
- **31 of 31 runs passed every test. Zero failures, zero flaky verdicts**, at every worker count,
  under one-minute load averages from 1.7 to 19.5 on 8 cores.
- **The preview server does not saturate.** With the HAR replay removed so that every API call goes
  live through Nitro, six concurrent browsers finished in the same time as three (22.4–24.7 s against
  23.0–23.6 s) and all passed. This is the shape that would starve a server if concurrency were going
  to starve one, and the mandate's original failure signature — every scenario timing out at its first
  navigation — did not appear once.

Evidence integrity was checked rather than assumed, because the clips and traces are the deliverable:
across the 25 hermetic runs, all **102 clips and 102 traces** were present, complete and decodable;
`hermetic.mjs` returned an **identical** LIVE/MOCKED classification at 1 and 4 workers on the same run
shape; and the payoff frame at `--workers=6` is the same legible beat as at `--workers=1`.

## The measurements

The application, the pull request and the bring-up are the ones in `docs/studies/live-proof-pr2866.md`:
a Nuxt 4 / Nitro / Vite (Rolldown) multi-tenant recruiting product, the pull request adding a
flag-gated compensation section to the job editor, three scenarios (the section renders; `min > max`
warns; a negative amount warns), replayed hermetically from a `**/api/**` HAR and filmed with
`PW_PROVE_CLIP=1` at 1600×900 through the committed proof config, in a throwaway `git worktree`.

Three axes, each varying only the worker count, run **round-robin rather than blocked** so drifting
machine load falls on every condition. This is a shared machine; the one-minute load average beside
each run ranged from **1.7 to 19.5** on 8 cores, which makes every number below conservative for
concurrency rather than generous to it.

**Axis A — the proof shape.** 3 scenarios, hermetic, filmed, n=4 per cell. Median, with range, and
speed-up against one worker:

| Workers | Median | Range | Speed-up |
|---|---|---|---|
| 1 | **46.4 s** | 39.5 – 60.4 | — |
| 2 | **35.1 s** | 29.8 – 46.0 | 1.32× |
| 3 | **29.6 s** | 22.7 – 36.1 | 1.57× |
| 4 (Playwright's default here) | **26.4 s** | 24.7 – 29.8 | **1.76×** |

**Axis B — the mandate's shape.** The same spec at `--repeat-each=2`, so **6** test instances, which
is the concurrency the original five-scenario failure had; n=3 per cell:

| Workers | Median | Range | Speed-up |
|---|---|---|---|
| 1 | **75.5 s** | 70.4 – 77.1 | — |
| 4 | **39.9 s** | 38.9 – 49.5 | **1.89×** |
| 6 | **37.4 s** | 34.9 – 42.5 | 2.02× |

**Axis C — the load control.** The same 3 scenarios with the HAR replay **removed**, so every call —
the document, 262 asset requests and 24 API calls per browser — traverses the preview server's Nitro
proxy; n=2 per cell. This is the shape that would starve a server if concurrency were going to starve
one, and it is the axis that answers the mandate directly:

| Workers | Runs | Speed-up |
|---|---|---|
| 1 | 39.5 s, 40.5 s | — |
| 3 | 23.0 s, 23.6 s | 1.72× |
| 6 | 22.4 s, 24.7 s | 1.71× |

Two shapes of the result are worth separating. The gain is **real but bounded** — most of it is
bought by the second and third worker, and past four there is nothing left to buy on a three-scenario
proof. And the **variance narrows** as workers go up: the serialised cell has the widest spread in
both hermetic axes (39.5–60.4 s), because a serial run pays every scenario's page load end to end and
each one is exposed to whatever else the machine is doing.

Verdict stability, across all 31 runs: 16 / 9 / 6 runs and 48 / 54 / 18 test instances on axes A / B /
C; **31 of 31 runs passed every test; 0 failed tests; 0 flaky tests.** Evidence integrity across the
25 hermetic runs: exactly one `video.webm` and one `trace.zip` per test instance with none missing,
duplicated or truncated; every `trace.zip` passed `unzip -t`; every `video.webm` decoded with far more
than a trivial frame count. `hermetic.mjs` classified the same **23 endpoints as MOCKED (131 requests)
and the same 2 as LIVE** (the declared Intercom carve-out) at one worker and at four, per test —
concurrency does not move an endpoint across that line. The `min > max` payoff frame, extracted at
duration − 0.5 s by `clip-fidelity.mjs frames`, is pixel-for-pixel the same beat at one worker and at
six: the Create Job sheet centred, Minimum `5000`, Maximum `100`, and *Minimum can't be greater than
maximum.* in red beneath them, nothing occluded and nothing mid-transition.

**Decision, three parts:**

- **The proof run passes no `--workers` flag and takes Playwright's default.** Not `--workers=4`: the
  default is `cores/2`, and hard-coding a number that was right on an 8-core machine is the same
  mistake as hard-coding a port. The mutation run is `-g`-scoped to one test, so it is serial by
  arithmetic and needs no flag either.
- **Serialisation survives as a diagnostic.** If every scenario times out at its first navigation, one
  re-run at `--workers=1` separates a concurrency problem from a spec problem in a single command.
  What changes is the reading: against this target that signature has **no known cause**, so a spec
  that then passes serialised is a finding to report with its evidence — a saturating preview server
  would be new — and not a box ticked on the way to green.
- **A spec that genuinely cannot run concurrently says so in the spec** —
  `test.describe.configure({ mode: 'serial' })` — where the reason sits next to the code it
  constrains. Scenarios that contend over one record on a shared tenant will interfere under
  concurrency whatever serves them; that is a property of the spec, and a global flag is the wrong
  place to record it because it charges every other proof for one spec's shared state.

**The cost, which is real and is accepted with the number in hand.** Concurrency does not make an
individual test faster — N browsers share the machine, so each one is slower, and a clip records for
as long as its test holds a page open. Mean clip length goes from 12–15 s serialised to 18–20 s at
four workers, and to 31–33 s at six. The payoff hold is a fixed 2.5 s at the end, so every added
second is lead-in a reviewer watches before the beat. At six workers a six-scenario proof would
concatenate to roughly three minutes of film where the serialised run gives about seventy-five
seconds, and the extra two minutes are all dead air before each payoff. That is a fair trade at the default and stops
being one above it — which is the same place the wall-clock gain stops, so one boundary serves both.

Trade-offs weighed. **Pinning `workers: 1` in the committed proof config** was rejected in 0010 and is
still rejected, for the same reason and now for a second one: there is nothing to pin. **Naming a
concurrency (`--workers=4`)** was rejected — it is a machine fact, Playwright already computes it, and
a literal would be wrong on the next box. **Going above the default** was rejected on the measurement:
past four workers the three-scenario proof gets no faster and the clips keep getting longer, so it
buys nothing and spends reviewer attention. **Keeping the mandate** was a live option throughout and
is what 31 runs were there to test; it is retired because the runs refuted its premise on this target,
not because its cause was argued away.

**What this does not establish.** Stated plainly, because the next agent will be tempted to read
further than the runs go.

1. **One application, one spec.** Three scenarios (six instances) on one Nuxt/Nitro preview. A
   framework whose preview server is single-threaded and CPU-bound per request could still starve;
   nothing here rules that out for a target that has not been measured. The diagnostic in part two is
   what remains pointed at that case.
2. **This spec has no shared state.** It asserts client-side validation, never submits the form and
   writes nothing to the tenant. Playwright gives each test a fresh browser context, so nothing leaked
   between the concurrent tests here — but that is a property of *this spec*, not of the proof target.
   A spec whose scenarios contend over one record on a shared tenant will interfere under concurrency
   no matter what serves it, and that is a spec defect (`#19`, module-level mutable state, is the
   scanner's name for one shape of it), not a bring-up setting.
3. **A contended machine.** Load ran from 1.7 to 19.5 throughout. Round-robin ordering spreads that
   across conditions and the direction of the bias is conservative — a quieter box would show a
   *larger* speed-up, not a smaller one — but no cell here is a clean-room number.
4. **`--repeat-each=2` is not six distinct scenarios.** Axis B runs the same three tests twice to
   reach the six-instance concurrency the mandate's original failure had. It loads the runner and the
   server the same way; it does not exercise six different surfaces.
