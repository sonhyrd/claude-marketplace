# Concurrency against the built proof target — 31 runs on a real pull request

`docs/adr/0010` pinned every proof run to `--workers=1`. It did so on a real failure: a five-scenario
run against a **development server** in which all five scenarios timed out at their first navigation
after six minutes, then passed in two minutes serialised. On-demand compilation saturates under
concurrency, so N cold compiles of the same route starve each other.

`docs/adr/0016` changed the proof target to a **built application served by its preview server**,
which compiles nothing. That removes the *cause* the mandate was written for — but 0016 deliberately
kept the mandate anyway and staged its removal behind evidence from real runs, because a decision
record wrongly superseded is worse than one left standing. This file is that evidence.

**Nothing here is a decision.** `docs/adr/0017` holds the decision; this file holds the runs it rests
on.

---

## What was run

The same application and the same pull request as `docs/studies/live-proof-pr2866.md`: a Nuxt 4 /
Nitro / Vite (Rolldown) multi-tenant recruiting product, on the open pull request that adds a
flag-gated compensation section to the job editor. The proof spec is `#47`'s — three scenarios
(the section renders; `min > max` warns; a negative amount warns), replayed hermetically from a
`**/api/**` HAR, filmed with `PW_PROVE_CLIP=1` at 1600×900 through the committed proof config.

Bring-up was the shipped three-phase one: `preflight.mjs build` (forced, **90 s**), the preview
server on an allocated port, `preflight.mjs serve` (**72 ms**, `READY=yes`, port read from the
server's own announcement). The proof ran in a throwaway `git worktree` cut from the pull request's
commit; the application's own checkout was never written to.

**Three measurement axes**, each varying only `--workers`:

| Axis | Shape | Why |
|---|---|---|
| **A — the proof shape** | 3 scenarios, hermetic, filmed. `--workers` ∈ {1, 2, 3, 4}, four rounds each | 4 is Playwright's own default on this 8-core machine, so it is the value the mandate actually suppresses |
| **B — the mandate's shape** | the same spec at `--repeat-each=2` — **6** test instances. `--workers` ∈ {1, 4, 6}, three rounds each | the failure that put the mandate in the skill was a *five*-scenario run; three scenarios is a thinner test than the one that broke |
| **C — the load control** | 3 scenarios with the HAR replay **removed**, so every API call traverses the preview server's Nitro proxy. `--workers` ∈ {1, 3, 6}, two rounds each | a hermetic run barely touches the server. If concurrency were going to saturate one, this is the shape that would do it |

Rounds are **round-robin, not blocked** — one run at each worker count, then the next round — so
drifting machine load falls on every condition rather than on whichever one happened to run last.
That matters here: this is a shared machine and other agents were working on it throughout. The
one-minute load average recorded beside each run ranged from **1.7 to 19.5** on 8 cores. Every number
below was measured under that contention, which makes them conservative for concurrency and not
generous to it.

**31 runs, 120 test instances in total.**

---

## Wall clock

Median of each cell, with the range beneath it. Speed-up is against `--workers=1` in the same axis.

### Axis A — 3 scenarios, hermetic, filmed (n=4 per cell)

| `--workers` | Median | Range | Speed-up |
|---|---|---|---|
| 1 | **46.4 s** | 39.5 – 60.4 | — |
| 2 | **35.1 s** | 29.8 – 46.0 | 1.32× |
| 3 | **29.6 s** | 22.7 – 36.1 | 1.57× |
| 4 (Playwright's default) | **26.4 s** | 24.7 – 29.8 | **1.76×** |

### Axis B — 6 test instances, hermetic, filmed (n=3 per cell)

| `--workers` | Median | Range | Speed-up |
|---|---|---|---|
| 1 | **75.5 s** | 70.4 – 77.1 | — |
| 4 | **39.9 s** | 38.9 – 49.5 | **1.89×** |
| 6 | **37.4 s** | 34.9 – 42.5 | 2.02× |

### Axis C — 3 scenarios, no HAR replay, every call live through the preview (n=2 per cell)

| `--workers` | Runs | Speed-up |
|---|---|---|
| 1 | 39.5 s, 40.5 s | — |
| 3 | 23.0 s, 23.6 s | 1.72× |
| 6 | 22.4 s, 24.7 s | 1.71× |

Axis C is the one that answers the mandate directly. **The preview server does not saturate.** Six
concurrent browsers, each pulling the document, 262 asset requests and 24 live API calls through the
same Nitro process, finished in the same time as three — and every one of them passed. Whatever
starved five cold route compiles on a development server has no counterpart here.

Two shapes of the result are worth separating. The gain is **real but bounded**: most of it is bought
by the second and third worker, and past four there is nothing left to buy on a three-scenario proof.
And the *variance* narrows as workers go up — the `--workers=1` cell has the widest spread in both
hermetic axes (39.5–60.4 s), because a serial run pays every scenario's page load end to end and each
one is exposed to whatever else the machine is doing.

---

## Verdict stability — the part that decides it

A concurrency that is faster but flaky is not a win. Across all 31 runs:

| | Axis A | Axis B | Axis C | Total |
|---|---|---|---|---|
| Runs | 16 | 9 | 6 | **31** |
| Test instances | 48 | 54 | 18 | **120** |
| Runs where every test passed | 16/16 | 9/9 | 6/6 | **31/31** |
| Failed tests | 0 | 0 | 0 | **0** |
| Flaky tests (passed only on retry) | 0 | 0 | 0 | **0** |

Not one failure and not one retry, at every worker count, hermetic and live, under load averages up
to 19.5. There is no signal here that concurrency destabilises the verdict on this target.

### Evidence integrity

The clips and traces are the deliverable, so they were checked rather than assumed. For all 25
hermetic runs — **102 clips and 102 traces**:

- every run produced exactly one `video.webm` and one `trace.zip` per test instance — no missing,
  no duplicated, no truncated artifact;
- every `trace.zip` passed `unzip -t`;
- every `video.webm` decoded, and every one carried far more than a trivial number of frames.

The **hermetic audit is identical** at `--workers=1` and `--workers=4` on the same run shape:
`hermetic.mjs` classified 23 distinct endpoints as MOCKED (131 requests) and the same 2 as LIVE (the
declared Intercom carve-out) in both, per test. Concurrency does not move an endpoint across the
LIVE/MOCKED line.

The **payoff frames are legible at every worker count.** The `min > max` scenario's frame, extracted
at duration − 0.5 s by `clip-fidelity.mjs frames`, is pixel-for-pixel the same beat at `--workers=1`
and at `--workers=6`: the Create Job sheet centred, Minimum `5000`, Maximum `100`, and *Minimum can't
be greater than maximum.* in red beneath them. Nothing occluded, nothing mid-transition.

---

## The one real cost: clips get longer

This is the finding that does not favour concurrency, and it is the reason the decision that follows
is not "as many workers as you like".

Mean clip length, at 25 fps:

| Condition | Mean per clip |
|---|---|
| `--workers=1`, 3 scenarios | **12 – 15 s** |
| `--workers=4`, 3 scenarios | **18 – 20 s** |
| `--workers=6`, 6 instances | **31 – 33 s** |

A clip records for as long as its test holds a page open. Concurrency does not make an individual
test faster — it makes it *slower*, because N browsers share the machine — and the recording grows
with it. The payoff hold is a fixed 2.5 s at the end, so everything added is lead-in: page load,
hydration, the dialog opening. At `--workers=6` a six-scenario proof would concatenate to roughly
three minutes of film where the serialised run gives about seventy-five seconds, and the extra two
minutes are all dead air before each payoff.

So the wall clock saved on the run is partly paid back in the length of what a reviewer watches.
That trade is worth making at Playwright's default and stops being worth making above it, which is
exactly where the wall-clock gain stops too.

---

## What this does not establish

Stated plainly, because the next agent will be tempted to read further than the runs go.

1. **One application, one spec.** Three scenarios (six instances) on one Nuxt/Nitro preview. A
   framework whose preview server is single-threaded and CPU-bound per request could still starve;
   nothing here rules that out for a target that has not been measured.
2. **This spec has no shared state.** It asserts client-side validation, never submits the form and
   writes nothing to the tenant. Playwright gives each test a fresh browser context, so nothing
   leaked between the concurrent tests here — but that is a property of *this spec*, not of the
   proof target. A spec whose scenarios contend over one record on a shared tenant will interfere
   under concurrency no matter what serves it, and that is a spec defect (`#19`, module-level mutable
   state, is the scanner's name for one shape of it), not a bring-up setting.
3. **A contended machine.** Load ran from 1.7 to 19.5 throughout. Round-robin ordering spreads that
   across conditions and the direction of the bias is conservative — a quieter box would show a
   *larger* speed-up, not a smaller one — but no cell here is a clean-room number.
4. **`--repeat-each=2` is not six distinct scenarios.** Axis B runs the same three tests twice to
   reach the six-instance concurrency the mandate's original failure had. It loads the runner and the
   server the same way; it does not exercise six different surfaces.

## What replaced the mandate

`docs/adr/0017`. The short version: the proof run stops passing `--workers=1` and takes Playwright's
default, serialisation survives as a **diagnostic** rather than a mandate, and a spec that genuinely
cannot run concurrently says so in the spec — `test.describe.configure({ mode: 'serial' })` — where
the reason is next to the code, instead of in a global flag that costs every other proof wall clock.
