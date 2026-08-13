# The proof run is serialized, the mutation run is isolated, and the hermetic audit is a script

> **AMENDED by `docs/adr/0016` (issue #46) — this record is LIVE, not superseded.** `--workers=1`
> **still binds every proof run.** It rests on a documented five-scenario failure, and 0016 stages its
> removal deliberately: it is lifted on evidence from real runs against a preview server, by issue
> **#48**, not on the reasoning that its cause is gone. Mutation-output isolation and `hermetic.mjs`
> are untouched by the proof-target change. What *is* retired with the development server is the
> **diagnosis**: the Step-7 failure row reading "every test timing out on its first navigation is a
> saturated server" is deleted, because the built preview compiles nothing and cannot saturate that
> way. Against the current target, every test timing out at its first navigation is an ordinary
> failure to diagnose on its evidence, not a signature with a known cause.

A transcript audit of one real 5-AC pw-prove run (57.7 min wall, 155k output tokens) put `playwright test` at 39% of the run — for the first time ahead of model time, which every prior audit in this repo had found to be the dominant cost. Two-thirds of that runner time produced nothing:

- **6.2 minutes on a run where all five scenarios timed out in `page.goto`.** Scaffolded configs pin one worker only on CI (`workers: process.env.CI ? 1 : undefined`), so the proof ran five workers against a dev server that compiles routes on demand; five cold compiles of the same route saturated it. Serialized, the same spec passed in 2 minutes. The agent had read that config line in the first minute and had no rule that made it actionable.
- **1.7 minutes re-recording clips the mutation check had overwritten.** Both runs wrote to `test-results/`, so proving the spec goes red destroyed the evidence of it going green. The agent caught it; the failure mode if it hadn't is publishing footage of deliberately broken software as proof.
- **~3 minutes of model time writing throwaway trace parsers** for the hermetic audit — three ad-hoc `node -e` scripts across 8 calls, discarded the moment they printed.

Decision (pw-prove only), three changes:

- **`--workers=1` on every proof run**, passed on the command line rather than pinned in the proof config. Parallelism buys nothing for a handful of seconds-long scenarios and costs a false failure indistinguishable from a broken spec. The flag keeps `docs/adr/0008`'s committed config a static artifact the skill never edits, and needs no migration for repos that already committed one. Step 7's failure table now names the signature — *every* test timing out on its first navigation is a saturated server, not a locator problem.
- **The mutation run writes to `--output=/tmp/pw-prove-mutation`** and sets no `PW_PROVE_CLIP`, so `test-results/` keeps the passing run's clips untouched. Step 7 adds a post-revert check that the clip count still matches the scenario count. Evidence recorded against mutated source must be structurally impossible to publish, not merely noticed.
- **`hermetic.mjs` replaces the hand-rolled audit.** It classifies each request from the run's traces: `serverIPAddress` present means the browser put it on the wire, a `route.fulfill()` response has none, a failure carries `status: -1`. The verdict — matching LIVE calls against the spec's `// CARVE-OUT:` header — deliberately stays with the agent; only the mechanical, repeatedly re-derived half is scripted.

The audit script's own spike is why it ships with two signals instead of one. A trace records what the **browser** did, so `route.fetch()` + fulfill — the patch-in-flight idiom the audited run used for its feature-flag carve-out — performs a real round-trip from the Playwright process and appears in the trace as *mocked*. A trace-only auditor would have reported that run hermetic over live traffic: a silent pass, the exact class this bundle sells a scanner to detect. So the script also greps the spec for those call sites, reports them separately, and states plainly when `--spec` was not passed rather than letting unchecked look like clean. The first version of that grep missed `const real = await r.fetch()` because it only matched `route.`/`request.` receivers — caught by the spike, which is the argument for spiking rather than shipping the parser that "obviously" works.

Trade-offs weighed. Pinning `workers: 1` in the proof config template was rejected: existing committed configs would keep the failure mode until something patched them, and patching them contradicts 0008. Auditing a recorded HAR instead of traces was rejected for now — the format is public and stable, but distinguishing mock-fulfilled from real round-trip in HAR entries is unproven and the trace field is verified. Having `hermetic.mjs` render pass/fail was rejected: matching a live call to a carve-out is a judgement about intent, and a script that guesses it would either block honest runs or rubber-stamp dishonest ones.
