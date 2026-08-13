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

The evidence now exists. **31 runs and 120 test instances** against a real open pull request on a
real application, at `--workers` from 1 to 6, hermetic and non-hermetic, filmed —
`docs/studies/proof-concurrency-pr2866.md` holds all of it. The three numbers that decide this:

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
second is lead-in a reviewer watches before the beat. That is a fair trade at the default and stops
being one above it — which is the same place the wall-clock gain stops, so one boundary serves both.

Trade-offs weighed. **Pinning `workers: 1` in the committed proof config** was rejected in 0010 and is
still rejected, for the same reason and now for a second one: there is nothing to pin. **Naming a
concurrency (`--workers=4`)** was rejected — it is a machine fact, Playwright already computes it, and
a literal would be wrong on the next box. **Going above the default** was rejected on the measurement:
past four workers the three-scenario proof gets no faster and the clips keep getting longer, so it
buys nothing and spends reviewer attention. **Keeping the mandate** was a live option throughout and
is what 31 runs were there to test; it is retired because the runs refuted its premise on this target,
not because its cause was argued away.

**What this does not establish**, and the study says at more length: one application, one spec, one
preview server, on a contended machine. A framework whose preview is single-threaded and CPU-bound per
request could still starve, and nothing here rules that out for a target nobody has measured. The
diagnostic in part two is what remains pointed at that case.
