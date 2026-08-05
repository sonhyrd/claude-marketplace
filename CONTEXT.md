# Glossary

Two E2E-generation skills coexist. **playwright-test-generator** (`PTG`) is the heavyweight, invoke-by-name variant that ships a hosted, chaptered proof film. **pw-prove** is the lean default for proving a change fast, whose evidence is a byproduct of its one proof run. Terms shared by both (PR-mode, Coverage-gap mode, Approval gate, Notify-and-continue, Recon probe, Hermetic spec, Declared carve-out, Mutation check / Unguardable at this layer, Land the proof) apply to both. The **film vocabulary** — Watch link, Proof film, Chapter, Contact sheet, Static chapter, Film QA gate, Refilm budget, Flake screen, State-isolation rule, Demotion — is **PTG-only**; pw-prove retires it in favor of Proof clip + HAR fixture (below). See `docs/adr/0005`, `docs/adr/0006`.

## pw-prove
The lean E2E proof skill. North star: the fastest correct proof of a change, under one rule — a best-practice earns its place only if it also cuts steps or model output. Same guarantees as PR-mode (mutation check, hermetic-by-default, POM-always, PROVES headers, stop-report), but evidence is a byproduct of the single proof run rather than a separate film step. 8 steps; probe-required recon; HAR-first mocks.

## Proof clip
pw-prove's evidence artifact: the per-test webm Playwright records when the proof run enables video via the [proof config](#proof-config). One clip per scenario (per AC), not one chaptered film. Published as part of the run's [proof page](#proof-page); the `trace.zip` from the same run is a local heal/debug aid, not a delivered clip. Reviewer-facing, and therefore held to a [fidelity contract](#clip-fidelity-contract).

## Proof page
The single `https://clips.paulsjob.ai/share/<id>` URL a pw-prove run delivers: every per-AC [Proof clip](#proof-clip) joined by stream copy into ONE Paul Clips recording, with one chapter per AC — labelled with the scenario name, at the cumulative measured offset — so the scrubber carries the AC rail, and the criterion itself verbatim as a timestamped comment beside it. Built by `publish-proof.mjs` from a manifest: one JSON-RPC `tools/call` POST to the Clips `/mcp` endpoint carrying the whole recording, then one best-effort `add-comment` call per chapter, all under a single opaque bearer [leased](#lease) from the workspace vault — long-lived (365-day, `jti`-revocable) and not per-action scoped, since its [callable catalog](#callable-catalog) is twelve actions. Four gates (empty-recording, token-leak, homogeneity, duration-reconciliation) run before anything leaves the machine, and a gate trip publishes nothing and withholds the local file. A transport or credential failure leaves the run passing and prints the kept file's path instead. The PR comment leads with this link; the per-AC rows deep-link their offsets against `/embed/<id>?t=<seconds>`, because on `/share/<id>` the `t` parameter is an access token and an offset there is dropped silently. Still not a Proof film (that vocabulary stays PTG-only): no second run, no film step, no chapters sidecar, no contact sheet — the chapters are offsets measured from the clips the one proof run already produced, and stream copy decodes no frame. See `docs/adr/0012` and `docs/adr/0014`, and `docs/adr/0009` for the goal it preserves.

## Callable catalog
The set of actions a given credential may actually invoke, as returned by `tools/list` for that token. **Distinct from the searchable index** surfaced by `tool-search`, which is far larger — 188 entries against a callable catalog of 12, measured. An action can therefore be findable, fully documented, and uncallable; the refusal arrives at **HTTP 200** as `Unknown tool: <name>`, not as an error status. Catalog breadth is a property of the token's tier, so narrowing it is a re-mint, never a skill change. See `docs/adr/0014`.

## Delegable action
An action present in the caller's [callable catalog](#callable-catalog). Non-delegable is a statement about the token's tier, **not** about the credential's validity: a perfectly current bearer gets `Unknown tool` for an action outside its catalog, which is a different problem, with a different fix, from the honest 401 that means the credential itself was refused. `clips.mjs` keeps the two verdicts separate — and keeps the remedy sentence for a non-delegable action in one place, so the minute-zero probe and the minute-fifty publish cannot send an operator down two roads for one problem.

## Lease
A vault-issued, audited loan of a secret into one child process's environment (`agent-native vault exec --app … --key … -- node …`). It keeps the credential out of the shell history, the dotfiles and the transcript, and prints a lease id so *"this credential was used here"* is checkable afterwards. **A receipt, not a boundary** — its own help text says "This is hygiene, not containment": anything running as the operator can read the same secret. The shipped scripts are lease-*ignorant*: they read `process.env.CLIPS_MCP_TOKEN` and never spawn `agent-native`, so a private CLI never becomes a runtime dependency. See `docs/adr/0014`.

## Clip fidelity contract
The three properties a Proof clip must have to be usable as evidence: recorded at the **effective viewport** (never Playwright's 800×800-box downscale), opening on a **warmed** route rather than a cold compile, and ending on the success signal **held** on screen. Held at authoring time — a committed viewport pin plus a `PW_PROVE_CLIP`-gated, `// JUSTIFIED:` post-assertion dwell — never by a second run, a measurement gate, or editing the recording. A clip that fails the contract is a defect, not a trade-off. See `docs/adr/0007`.

## Effective viewport
The viewport a generated spec actually renders at, and the size its clip is recorded at. Resolved from the project's Playwright config by one rule: only an **explicit `viewport:` key** is a deliberate project decision and is respected; a viewport arriving solely from a *desktop* device-descriptor spread is scaffold default and is pinned over (1600×900). A **mobile/non-desktop** descriptor is always respected. Resolved in the Step-4 Assumptions block as either a `deliberate:` or a `pinned:` verdict. The pin lives in the committed spec, never only in the [proof config](#proof-config) — otherwise the proof renders at a size CI never produces. Step 7 passes it to the recording as `PW_PROVE_W`/`PW_PROVE_H`.

## Proof config
`<configDir>/playwright.proof.config.ts` — the second Playwright config pw-prove runs the proof through, spreading the project's own config and overriding only `use` (`video`, `trace`). **Static, project-agnostic and committed once**, then reused verbatim by every later run: the single per-run value, the recording size, arrives as `PW_PROVE_W`/`PW_PROVE_H` rather than as a file edit. The project's own `playwright.config` is never edited. Superseded the throwaway `.pw-prove.proof.config.ts` that each run rewrote and deleted. See `docs/adr/0008`.

## Hermetic audit
The Step-7 check that the passing proof run reached nothing it did not declare. `hermetic.mjs` classifies every request from the run's traces — LIVE (the browser put it on the wire: the trace entry carries `serverIPAddress`), MOCKED (a `route.fulfill()` answered it), FAILED — and separately greps the spec for `route.fetch()` call sites, which perform a real round-trip from the Playwright process and therefore look mocked in a browser trace. The verdict stays with the agent: every LIVE call must appear in a `// CARVE-OUT:` line or the run fails despite being green. See `docs/adr/0010`.

## HAR fixture
pw-prove's replacement for hand-written read mocks: an API-scoped (`**/api/**`), auth-scrubbed HAR recorded during the probe pass and committed alongside the spec. `routeFromHAR(..., { notFound: 'abort' })` replays it deterministically, keeping the spec self-hermetic and CI-durable. Hand-written `route.fulfill` remains only for the mutation under assertion. Playwright flushes the recording on **context** close, so `probe.mjs` closes the context before the browser and reports the written path and byte count — a recorder that cannot be observed recording is indistinguishable from a broken one. See `docs/adr/0011`.

## Runner origin
The origin **Playwright itself** dials — `webServer.url` / `use.baseURL` after env overrides — as distinct from the origin the agent confirmed healthy. Resolved and curled in Step 3, recorded in the Step-4 Assumptions block. They differ more often than they look like they should: a dev server bound to `[::1]` answers on `localhost` and refuses on the `127.0.0.1` a scaffolded config carries, so Playwright boots a duplicate server and dies on `Timed out waiting 120000ms from config.webServer` having run zero tests. A mismatch is resolved by carrying the config's own env var (`E2E_BASE_URL`, `PLAYWRIGHT_BASE_URL`) on every runner invocation, never by editing the project's config. See `docs/adr/0011`.

## PR-mode
The playwright-test-generator pipeline variant that proves a specific change (PR, branch, ticket, or prose "prove this change" argument) end-to-end. Scope is closed: acceptance criteria are derived from the diff.

## Coverage-gap mode
The pipeline variant invoked with no target, where PTG proposes what to cover. Scope is open: the user's intent cannot be derived from a diff.

## Approval gate
A hard stop where the pipeline waits for an explicit user go-ahead before proceeding. As of 2026-07-10: exists only in coverage-gap mode. PR-mode uses notify-and-continue.

## Notify-and-continue
Posting the scenario plan to the conversation as an audit trail and proceeding immediately without waiting for a reply. The user interrupts to redirect; silence is consent. The PR-mode replacement for the approval gate.

## Watch link
The hosted, shareable proof of a PR-mode run: a watch.html page (title + chapters + video), not a bare .webm. Required deliverable in PR-mode.

## Proof film
The video behind the watch link. Covers every approved scenario, one titled chapter per scenario, ending with the final scenario's payoff held on screen. A film that covers fewer scenarios than the spec, or ends before the success state is visible, is a defective proof.

## Chapter
A titled segment of a published recording corresponding to exactly one scenario. **PTG:** a segment of the proof film, whose title must be readable *in* the video (on screen long enough and at legible resolution) — a filmed artifact. **pw-prove:** metadata only — one chapter per AC at the cumulative measured offset of the clips before it, sent as JSON with the [proof page](#proof-page) recording and rendered by Clips as a scrubber marker. Its *title* is a label, not the criterion: a scrubber tooltip has tooltip-sized room, and ACs of 54–167 characters overlaid the video and clipped, so the title is the scenario name (capped at 60 characters, cut on a word boundary) and the AC verbatim travels as a timestamped comment, where it can wrap. Nothing is paraphrased; `ac` is the source of truth for both. Nothing is filmed and no frame is touched, so this is not the film vocabulary returning to pw-prove. See `docs/adr/0012` and `docs/adr/0014`.

## Recon probe
The persistent browser context (`scripts/probe.mjs`) that answers batched recon questions during Step 3. The recon channel; the test run is the validator, never the question channel. A run reaches Step 4 in exactly one of two states — a probe session that answered at least one batch, or a recorded exit-2 (browserless) refusal with the source-reading fallback named in the Assumptions block. Neither state is a HARD STOP. Decided 2026-07-24: of 15 audited runs, the 10 that skipped the probe ran the test runner 9–42 times each; the 5 that used it ran it 5–8 times.

## Unguardable at this layer
The mutation check's third verdict: the mutation did not turn the spec red, and no browser-layer assertion can distinguish the mutated behavior because another layer independently preserves the observable outcome (e.g. a read-modify-write that re-reads and merges the full record). A stated verdict in the report and the PR comment, never a silent skip, and never a third strengthen-and-retry cycle.

## Static chapter
A proof-film chapter whose interval shows no visible change on screen — it proves nothing about its scenario. Detected by `record.mjs` with an ffmpeg `freezedetect` pass over each chapter's interval (>90% frozen). **Advisory as of 2026-07-24:** it prints its verdict on every run, clean or not, and does not block publication; the threshold is promoted to a real Film QA gate only once the printed record shows the required ≥3s payoff hold never trips it.

## Hermetic spec
A generated spec whose every network call is mocked. The default for all PTG output; Step 7 fails a run on any live call that is not part of a declared carve-out.

## Declared carve-out
The sanctioned exception to hermetic specs: a real-backend interaction that is itself the acceptance criterion under proof. Must be named in the scenario plan and in the spec header. Reads freely; writes only with a proven restore; never creates data on a shared tenant.

## Proof
The complete PR-mode deliverable: green spec + POM committed to the PR branch, plus the published evidence — the **watch link** in PTG, the per-AC **Proof clips** in pw-prove. A run that ends with uncommitted tests, or with no published evidence, has not delivered a proof.

## Contact sheet
The single film-QA evidence artifact record.mjs extracts: 30 frames spanning the whole film, tiled on one image (`CONTACT=`). Its final tile is the film's final-frame evidence (there is no separate poster). Step 8 reads it once per film before publishing; the report's `Film QA:` line is filled from it.

## Film QA gate
The Step 8 structural gate on the proof film: record.mjs's scripted floors (duration ≥ 4s + ~3s per scenario, chapter count ≥ scenario count, ordered timestamps, contact-sheet extraction — any failure is exit 5), the advisory [static chapter](#static-chapter) check, plus the agent's one contact-sheet screening. Film runs are single-attempt (`--retries=0`): a flaky film is a re-shoot, not a proof. Publishing past a failed gate is forbidden.

## Refilm budget
The bound on Step 8's fix-and-refilm loop: one diagnose+fix+refilm attempt per failing chapter. A chapter that fails its second film is dropped from the film and its scenario demoted — never a third cycle. Decided 2026-07-10 after a run spent three full-price refilm cycles on a chapter that was deleted anyway.

## Flake screen
Using Step 7's own run verdicts as the admission test for film chapters: a scenario Playwright marked flaky does not get a chapter until it has passed clean. Failing the screen leads to demotion, not to filming-and-hoping.

## Demotion
Recording a scenario as `unproven — gated: <reason>` on the report's ACs line instead of proving it. Demotion affects the film and the report only — the committed spec never loses a passing scenario to make a film green.

## State-isolation rule
The film-spec authoring constraint that follows from chapters sharing one browser context (unlike committed tests, which each get a fresh one): any scenario whose committed test depends on fresh-context state (cookies, storage, locale, auth) must open with an explicit state reset or be excluded from the film via demotion.

## Land the proof
The deterministic PR-mode tail — PTG's Step 9, pw-prove's Step 8: upload/host the evidence → hygiene sweep → commit spec+POM to the PR branch → push → PR comment (creating a PR when none exists) → completion report. The report format is the run's exit gate, structurally invalid in PR-mode without its Committed, Pushed and PR comment lines, plus the mode's evidence lines: **Watch link + Film QA** in PTG, **Proof clips + Mutation** in pw-prove.
