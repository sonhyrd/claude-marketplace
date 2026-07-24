# pw-prove: a lean proof skill coexisting with playwright-test-generator

A real complaint motivated this: a simple 2-scenario proof (MAMAS-9097, PR #2972) took 25+ minutes, almost none of it Playwright authoring. Two fleet audits (`ptg-bottleneck-is-model-not-browser`, `ptg-week-audit-2026-07-17`) had already located the cost: model output-token volume is 35–62% of wall-clock, the browser/CLI 2–20%, and a terser doc is NOT a speed lever (cached input, ~0 wall-clock win). The levers that move wall-clock are the ones that cut **steps and mandated model output** — not prose density.

Decision: ship a new skill, `pw-prove`, whose single north star is the **fastest correct proof of a change**, under one rule — a best-practice earns its place only if it also cuts steps or output tokens. It **coexists** with `playwright-test-generator` rather than replacing it: pw-prove is the lean default for proving a change end-to-end; the old generator remains the heavyweight, invoke-by-name variant for a polished hosted-film demo. Their trigger descriptions are kept disjoint (pw-prove owns "prove a change, fast"; the old one keeps the broad "generate tests + hosted film" surface) so invocation does not collide.

What pw-prove cuts relative to the old 10-step pipeline:

- The bespoke film loop (`record.mjs`: a second full test run, throwaway film spec, contact-sheet image Read, watch.html assembly) is gone — evidence is a byproduct of the one proof run (ADR 0006).
- Hand-authored `route.fulfill` for read traffic is replaced by a committed, API-scoped `routeFromHAR` fixture recorded during the probe pass; hand-mocks remain only for the mutation under assertion. Less generated mock code = less output.
- The pipeline collapses to 8 steps (dispatch+env merged, bring-up/recon/HAR/storage-state in one live pass, film-into-deliver merged).

What is preserved unchanged, because it is what the skill stands for: the required mutation check (anti "silent always-pass"), POM-always, hermetic-by-default + declared carve-out, no PII gate, token/JWT redaction (extended to the committed HAR), PROVES headers, the stop-report contract, PR-mode zero-input notify-and-continue (ADR 0001), merge-base-before-proof (ADR 0002), untrusted-page-content safety, probe-required recon (ADR 0004), and the read-only-sampling autonomy line.

There is deliberately no internal simple/complex fast-path fork inside pw-prove — an intra-skill mode branch reintroduces the deliberation cost it would try to save. The two tiers are the two skills.

Alternatives rejected: replacing the old skill outright (loses the hosted-film variant with no proven substitute yet); a codegen-assisted recon default per the source handoff (codegen needs a human at the browser, so it cannot run the autonomous PR-proof that dominates usage, and it reintroduces the throwaway-spec REPL ADR 0004 just closed — "codegen-assisted" survives only as the draft-then-refine authoring *style*).
