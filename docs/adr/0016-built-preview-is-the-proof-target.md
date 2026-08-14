# The proof target is the built-and-previewed application, brought up in three phases

pw-prove used to bring the application up with its **development server**, and a surprising amount of
the pipeline existed only to survive that choice. The numbers are in
`docs/studies/proof-target-measurements.md`; the ones that decided this are here.

A development server compiles routes on demand. On the measured application the first hit of a route
cost **24.4 s** and a *repeat* hit still cost **4.3 s**, because an unbundled module graph is walked
on every load — so every route transition put roughly four seconds of dead air inside a proof clip,
and a warm-lead step burned **598 s** across the sampled sessions paying that cost outside the
recording. Because on-demand compilation saturates under concurrency, proof runs are pinned to one
worker: a five-scenario run in which **all five scenarios timed out at their first navigation after
six minutes**, then passed in two minutes serialised, is what put `--workers=1` in the skill. And a
change about bundling, chunking or tree-shaking is simply **unprovable** against a server that never
produces the artifact the claim is about.

Against the same application, the built output served by a preview server boots in **0.82 s** and
serves both the first page and a repeat page in **14 ms**. On the second sampled application the
preview requested **28** asset endpoints for a page where the development server requested **256**,
and a real spec returned the identical `5 passed, 2 failed` verdict against both — the target changed
and the verdict did not, which is what makes the swap safe.

**Decision: the built application, served by its preview server, is the proof target. The
development-server path is removed rather than kept as a fallback.**

The cost is real and is accepted with the numbers in hand, not waved away. Bring-up gets **slower**:
104–201 s of build against a 56 s development-server median. The mutation check gets **much** slower:
roughly 635 s for a build-and-preview mutation run against roughly 40 s under hot reload. The trade
is a session-level one, and it was originally argued the wrong way round — measured per phase, the
development server wins. A median session runs six spec runs, each paying navigation latency the
development server charges *even when warm*, serially, because concurrency is forbidden; counting
that, plus the warm lead's ten minutes across the sample, the built target wins the session
comfortably — and it proves the artifact that ships, which is a strictly stronger claim.

**Bring-up becomes three phases with three distinct failures**, because the single ninety-second
readiness poll was aimed at what is now the *fastest* of the three and its one verdict was frequently
a misdiagnosis. It exited not-ready eight times, each burning its full budget — twelve minutes of
wasted wall clock — and one session read "server not ready" and answered it with five rebuilds and a
port kill.

- **Configuration first** (`preflight.mjs config`, exit 4), against the application's **own declared
  contract** — its committed `.env.example`-shaped file, or the keys recon found it boots on. It fails
  in the time it takes to read two files and it names the keys. This matters more under a built
  target than it did before: a development server supplies defaults a production build does not, and
  the observed failure was `Missing required configuration` arriving *after* a build. Paying 174
  seconds, unattended, to discover a missing environment variable is the shape of failure this whole
  record exists to remove.
- **The build as a tracked subprocess** (`preflight.mjs build`, exit 5), waited on as one, reported
  with the build's own standard error attached. A build failure is a build failure; it is not a
  server that never became ready.
- **The preview server polled on a short budget** (`preflight.mjs serve`, exit 3, 20 s by default).
  A preview binds in under a second and answers in milliseconds, so one that is not answering quickly
  is broken, not slow. The long budget only ever bought patience for a compile that no longer happens.

Three exit codes are the deliverable, not an implementation detail: they are what makes "the key is
missing", "the build broke" and "nothing is listening" three answers with three different fixes.

**The committed proof config gains `webServer: undefined`.** It spreads the project's config and
therefore inherited `webServer` — so a preview-targeted run booted a **development** server anyway,
silently, whenever nothing was listening at that config's own url. That was confirmed by running it,
not by reading it (`docs/studies/proof-target-measurements.md`, Part 2), including the two cases
`reuseExistingServer` does not cover: a shifted port and a loopback-family mismatch, which are exactly
the port-discovery failures counted among the eight readiness timeouts. This is a **one-time,
committed migration** of the template and of any proof config already in a repository, not a per-run
edit — `docs/adr/0008` still holds. It also removes Playwright's own readiness wait, which is correct
only because the agent owns the server lifecycle and `preflight.mjs` gates bring-up.

**There is no unbuilt fallback, and the gate refuses rather than skips.** Asking for the build phase
without a build command is a usage error, not a quiet `BUILD=skipped` that lets a run pass while
proving whatever server happened to be listening — a skipped build is the second, silent path this
record removes, wearing a different name. An undeclared configuration contract is reported as
`CONFIG=undeclared` rather than as `CONFIG=ok`: the skill cannot invent another repository's contract,
so it says the check did not happen instead of implying it passed.

Trade-offs weighed. **Keeping the development server as a fallback** was rejected: two bring-up paths
mean two sets of failure modes, two sets of workarounds to keep alive, and a silent second path a
future change can take by accident. **Starting the preview server from inside `preflight.mjs`** was
rejected for the reason the script has always refused to start servers — a script-started server can
bind a sibling worktree on the wrong branch — and because the agent needs the server's own log to read
back the port it actually bound. **Validating configuration by sniffing** the application's source was
rejected in favour of a declared contract: guessing which variables an unfamiliar application requires
produces both false stops and false confidence, and the applications that fail this way already ship
the declaration. **The framework's own build cache** was measured and reverted by a prior session: 3×
on unchanged source, useless once source changed.

Removal is **staged**, and staged per item rather than wholesale. This record changed the target and
the bring-up first. The **warm lead of `docs/adr/0013` is now gone** (issue #46), together with the
browserless `curl` fallback, the boot-heavy-clip reporting, and the runner-origin loopback resolution
of `docs/adr/0011` — none of which has a job against a target that compiles nothing and answers a
cold route in 14 ms. The `--workers=1` mandate of `docs/adr/0010` was held back deliberately, on the
asymmetry that the warm lead's premise was measurably absent while the mandate's was a concurrency
behaviour nobody had yet observed under the new target: it rests on a documented five-scenario
failure, so it was to be retired on evidence from real runs against a preview server, not on the
reasoning that its cause is gone. **That evidence arrived (issue #48) and the mandate is now
retired** — 31 runs, 120 test instances, 1.76–1.89× faster concurrent with zero failures and zero
flaky verdicts, and a preview server that did not saturate even unmocked. See `docs/adr/0017` and
`docs/studies/proof-concurrency-pr2866.md`. The staging was still the right call: the runs, not the
reasoning, are what closed it.
