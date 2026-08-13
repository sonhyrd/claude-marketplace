# Glossary

One E2E proof skill: **pw-prove**, the lean default for proving a change, whose evidence is a
byproduct of its one proof run. The heavyweight `playwright-test-generator` variant is retired, and
its **film vocabulary** — Watch link, Proof film, Chapter-as-filmed-segment, Contact sheet, Static
chapter, Film QA gate, Refilm budget, Flake screen, State-isolation rule, Demotion — retires with
it. Nothing in this glossary describes a second pipeline. See `docs/adr/0005`, `docs/adr/0006`.

## pw-prove
The E2E proof skill. North star: the fastest correct proof of a change, under one rule — a
best-practice earns its place only if it also cuts steps or model output. PR-mode's guarantees
(mutation check, hermetic-by-default, POM-always, PROVES headers, stop-report) hold, and evidence is
a byproduct of the single proof run rather than a separate production step. 8 steps; probe-required
recon; HAR-first mocks.

## Proof clip
pw-prove's evidence artifact: the per-test webm Playwright records when the proof run enables video
via the [proof config](#proof-config). One clip per scenario (per AC). Published as part of the
run's [proof page](#proof-page); the `trace.zip` from the same run is a local heal/debug aid, not a
delivered clip. Reviewer-facing, and therefore held to a [fidelity contract](#clip-fidelity-contract).

## Proof page
The single `https://clips.paulsjob.ai/share/<id>` URL a pw-prove run delivers: every per-AC [Proof
clip](#proof-clip) joined by stream copy into ONE Paul Clips recording, with one **chapter** per AC —
a scrubber marker at the cumulative measured offset, labelled with the scenario name (capped at 60
characters, cut on a word boundary) because a marker label renders in tooltip-sized space, while the
AC itself travels verbatim as a timestamped comment beside it, where a sentence of 54–167 characters
can wrap. Nothing is paraphrased; `ac` is the source of truth for both. Built by `publish-proof.mjs`
from a manifest: one JSON-RPC `tools/call` POST to the Clips `/mcp` endpoint carrying the whole
recording, then one best-effort `add-comment` call per chapter, all under a single opaque bearer
[leased](#lease) from the workspace vault — long-lived (365-day, `jti`-revocable) and not per-action
scoped, since its [callable catalog](#callable-catalog) is twelve actions. Four gates
(empty-recording, token-leak, homogeneity, duration-reconciliation) run before anything leaves the
machine, and a gate trip publishes nothing and withholds the local file. A transport or credential
failure leaves the run passing and prints the kept file's path instead. The PR comment leads with
this link; the per-AC rows deep-link their offsets against `/embed/<id>?t=<seconds>`, because on
`/share/<id>` the `t` parameter is an access token and an offset there is dropped silently. No second
run, no production step, no chapters sidecar: the offsets are measured from the clips the one proof
run already produced, and stream copy decodes no frame. See `docs/adr/0012` and `docs/adr/0014`, and
`docs/adr/0009` for the goal it preserves.

## Callable catalog
The set of actions a given credential may actually invoke, as returned by `tools/list` for that
token. **Distinct from the searchable index** surfaced by `tool-search`, which is far larger — 188
entries against a callable catalog of 12, measured. An action can therefore be findable, fully
documented, and uncallable; the refusal arrives at **HTTP 200** as `Unknown tool: <name>`, not as an
error status. Catalog breadth is a property of the token's tier, so narrowing it is a re-mint, never
a skill change. See `docs/adr/0014`.

## Delegable action
An action present in the caller's [callable catalog](#callable-catalog). Non-delegable is a statement
about the token's tier, **not** about the credential's validity: a perfectly current bearer gets
`Unknown tool` for an action outside its catalog, which is a different problem, with a different fix,
from the honest 401 that means the credential itself was refused. `clips.mjs` keeps the two verdicts
separate — and keeps the remedy sentence for a non-delegable action in one place, so the minute-zero
probe and the minute-fifty publish cannot send an operator down two roads for one problem.

## Lease
A vault-issued, audited loan of a secret into one child process's environment (`agent-native vault
exec --app … --key … -- node …`). It keeps the credential out of the shell history, the dotfiles and
the transcript, and prints a lease id so *"this credential was used here"* is checkable afterwards.
**A receipt, not a boundary** — its own help text says "This is hygiene, not containment": anything
running as the operator can read the same secret. The shipped scripts are lease-*ignorant*: they read
`process.env.CLIPS_MCP_TOKEN` and never spawn `agent-native`, so a private CLI never becomes a
runtime dependency. See `docs/adr/0014`.

## Clip fidelity contract
The four properties a Proof clip must have to be usable as evidence: recorded at the **effective
viewport** (never Playwright's 800×800-box downscale), opening on a **warmed** route rather than a
cold compile, ending on the success signal **held** on screen, and holding it in
[frame](#framing). Held at authoring time — a committed viewport pin, ungated centering, and a
`PW_PROVE_CLIP`-gated, `// JUSTIFIED:` post-assertion dwell **inline in each `test()` body** (a
dwell hoisted into a helper does not count: one shared dwell would satisfy tests that hold on
nothing) — never by a second run, a measurement
gate, or editing the recording. Authoring-time compliance is *checked*, not assumed: `clip-fidelity
spec` blocks Step 7 on a spec that carries neither. A clip that fails the contract is a defect, not
a trade-off. What the contract cannot check from the source is caught by the
[clip inspection](#clip-inspection) instead. See `docs/adr/0007` and `docs/adr/0015`.

## Clip inspection
The Step-7 beat where the AGENT looks at the [proof clip](#proof-clip) before anyone publishes it:
`clip-fidelity frames` extracts one frame per clip at `duration − 0.5s` (inside the payoff hold) and
the agent states in the report what each one shows. **Not a gate, and the distinction is the
design** — it informs the agent, it never vetoes the artifact, so absent video tooling skips and an
illegible frame that survives one diagnosed fix and one re-film publishes with a warning. The
counterpart it is defined against is a legibility gate in the publish path, which was rejected
because its failure mode is dropping a good proof and a gate that trips aborts the whole recording.
An illegible frame is *diagnosed* — payoff not held, [element off-frame](#framing), still booting —
before anything is re-filmed: a re-film with no preceding fix is deterministic. See `docs/adr/0015`.

## Framing
The fourth property of the [clip fidelity contract](#clip-fidelity-contract): the element under
proof is on screen, and near the centre of it, at the moment of the payoff hold. Distinct from the
hold itself — a clip can hold the success signal for the full dwell and still be worthless because
the signal sits against the screen edge, or was pushed off-frame by a re-render after the scroll.
`scrollIntoViewIfNeeded()` moves the minimum distance and is therefore the usual cause; centring is
the fix, and it is **ungated** so CI renders identically. Named because it went unnamed: "held
payoff" was already in this glossary and was read as a duration. See `docs/adr/0015`.

## Filming law
The one rule governing `PW_PROVE_CLIP`: it may only ever **add time**, never change what the app is
asked to do. Waits are gated; everything else — centring, scroll, choice of input method — is
unconditional and runs in CI too. A gated dwell may sit at any beat except between an action and the
assertion that covers it, because there the filmed run is more patient than CI and a proof passes
where CI flakes. Generalises the argument in `docs/adr/0007` (which permitted the dwell only because,
sitting after the terminal assertion, it could not move the verdict) from one position to one class
of operation. See `docs/adr/0015`.

## Effective viewport
The viewport a generated spec actually renders at, and the size its clip is recorded at. Resolved
from the project's Playwright config by one rule: only an **explicit `viewport:` key** is a
deliberate project decision and is respected; a viewport arriving solely from a *desktop*
device-descriptor spread is scaffold default and is pinned over (1600×900). A **mobile/non-desktop**
descriptor is always respected. Resolved in the Step-4 Assumptions block as either a `deliberate:` or
a `pinned:` verdict. The pin lives in the committed spec, never only in the [proof
config](#proof-config) — otherwise the proof renders at a size CI never produces. Step 7 passes it to
the recording as `PW_PROVE_W`/`PW_PROVE_H`.

## Proof target
The **served form of the application a proof runs against**: the *built* application, served by its
preview server. Never the development server — that path is removed, not conditional, so there is no
second bring-up path to maintain or to take by accident. The agent owns its lifecycle (allocate the
port, build, start the server, stop it in Step 8 hygiene), and bring-up is three phases with three
distinct failures — configuration (exit 4, names the missing keys), build (exit 5, carries the build's
standard error), serve (exit 3, a short poll) — because one not-ready verdict for all three was a
misdiagnosis often enough to cost twelve minutes of wall clock and five needless rebuilds. Named here
so the choice is a modelled decision rather than a hard-coded assumption re-litigated every time
someone reads the bring-up timings in isolation: the built target is *slower* to bring up and much
slower to mutate, and wins on the session total, on clip quality, and on proving the artifact that
ships. See `docs/adr/0016` and `docs/studies/proof-target-measurements.md`.

## Session ladder
The ordered set of **rungs** — `?token=` query bootstrap, `storageState`, a server-set login cookie,
client-storage seeding — by which a proof establishes its session, walked top-down until one holds.
A rung is chosen by grepping the application's own source for what it actually reads, on every run,
never by assumption. A rung whose mechanism sits behind a development-only guard (`import.meta.dev`
and its equivalents) is **absent**: the [proof target](#proof-target) is a production build, so that
code is compiled out and the input it reads is never consumed — the ladder records the rung as absent
and descends rather than driving a path that no longer exists. Absence is a property of the artifact
under proof, not of any one application, and it is never repaired by editing the application's
source. Each rung's success is asserted on the authenticated state itself against a short budget, so
an unestablished session is named in seconds instead of expiring a default timeout on a side effect
that can never occur. See `docs/studies/proof-target-measurements.md` › The auto-login blocker.

## Proof config
`<configDir>/playwright.proof.config.ts` — the second Playwright config pw-prove runs the proof
through, spreading the project's own config and overriding only `use` (`video`, `trace`). **Static,
project-agnostic and committed once**, then reused verbatim by every later run: the single per-run
value, the recording size, arrives as `PW_PROVE_W`/`PW_PROVE_H` rather than as a file edit. The
project's own `playwright.config` is never edited. Carries `webServer: undefined`, so the spread cannot inherit the project's development-server command and boot one behind a run aimed at the [proof target](#proof-target) — a one-time committed migration, not a per-run edit. Superseded the throwaway
`.pw-prove.proof.config.ts` that each run rewrote and deleted. See `docs/adr/0008`, amended by `docs/adr/0016`.

## Hermetic audit
The Step-7 check that the passing proof run reached nothing it did not declare. `hermetic.mjs`
classifies every request from the run's traces — LIVE (the browser put it on the wire: the trace
entry carries `serverIPAddress`), MOCKED (a `route.fulfill()` answered it), FAILED — and separately
greps the spec for `route.fetch()` call sites, which perform a real round-trip from the Playwright
process and therefore look mocked in a browser trace. The verdict stays with the agent: every LIVE
call must appear in a `// CARVE-OUT:` line or the run fails despite being green. See `docs/adr/0010`.

## HAR fixture
pw-prove's replacement for hand-written read mocks: an API-scoped (`**/api/**`) HAR recorded during
the probe pass, **scrubbed at capture** and committed alongside the spec. `routeFromHAR(..., { notFound:
'abort' })` replays it deterministically, keeping the spec self-hermetic and CI-durable. Because
Playwright matches a recorded entry by exact request-URL equality, a live run replays a **bound
working copy** (`har-scrub.mjs bind`) — the canonical origin re-pointed at the run's port and each
placeholder in the match key given the run's own value, written to a gitignored path and never
staged. Hand-written
`route.fulfill` remains only for the mutation under assertion. Playwright flushes the recording on
**context** close, so `probe.mjs` closes the context before the browser and reports the written path
and byte count — a recorder that cannot be observed recording is indistinguishable from a broken one.
The same close scrubs it: the raw flush goes to a private staging file that is destroyed in the same
breath, so the working tree never holds an unscrubbed authenticated capture, and the scrub has no
placement left to decide. Before commit the hygiene sweep runs `har-scrub.mjs --verify`, whose
non-zero exit refuses residue rather than asking anyone to confirm its absence.
See `docs/adr/0011`.

## Runner origin
The origin **Playwright itself** dials — `webServer.url` / `use.baseURL` after env overrides — as
distinct from the origin the agent confirmed healthy. Resolved and curled in Step 3, recorded in the
Step-4 Assumptions block. They differ more often than they look like they should: a dev server bound
to `[::1]` answers on `localhost` and refuses on the `127.0.0.1` a scaffolded config carries, so
Playwright boots a duplicate server and dies on `Timed out waiting 120000ms from config.webServer`
having run zero tests. A mismatch is resolved by carrying the config's own env var (`E2E_BASE_URL`,
`PLAYWRIGHT_BASE_URL`) on every runner invocation, never by editing the project's config. See
`docs/adr/0011`.

## PR-mode
The pipeline variant that proves a specific change (PR, branch, ticket, or prose "prove this change"
argument) end-to-end. Scope is closed: acceptance criteria are derived from the diff.

## Coverage-gap mode
The pipeline variant invoked with no target, where pw-prove proposes what to cover. Scope is open:
the user's intent cannot be derived from a diff.

## Approval gate
A hard stop where the pipeline waits for an explicit user go-ahead before proceeding. As of
2026-07-10: exists only in coverage-gap mode. PR-mode uses notify-and-continue.

## Notify-and-continue
Posting the scenario plan to the conversation as an audit trail and proceeding immediately without
waiting for a reply. The user interrupts to redirect; silence is consent. The PR-mode replacement for
the approval gate.

## Recon probe
The persistent browser context (`scripts/probe.mjs`) that answers batched recon questions during
Step 3. The recon channel; the test run is the validator, never the question channel. A run reaches
Step 4 in exactly one of two states — a probe session that answered at least one batch, or a recorded
exit-2 (browserless) refusal with the source-reading fallback named in the Assumptions block. Neither
state is a HARD STOP. Decided 2026-07-24: of 15 audited runs, the 10 that skipped the probe ran the
test runner 9–42 times each; the 5 that used it ran it 5–8 times.

## Unguardable at this layer
The mutation check's third verdict: the mutation did not turn the spec red, and no browser-layer
assertion can distinguish the mutated behavior because another layer independently preserves the
observable outcome (e.g. a read-modify-write that re-reads and merges the full record). A stated
verdict in the report and the PR comment, never a silent skip, and never a third
strengthen-and-retry cycle.

## Hermetic spec
A generated spec whose every network call is mocked. The default for all pw-prove output; Step 7
fails a run on any live call that is not part of a declared carve-out.

## Declared carve-out
The sanctioned exception to hermetic specs: a real-backend interaction that is itself the acceptance
criterion under proof. Must be named in the scenario plan and in the spec header. Reads freely;
writes only with a proven restore; never creates data on a shared tenant.

## Gated AC
An acceptance criterion recorded as `unproven — gated: <reason>` on the report's ACs line instead of
being proven — a surface unreachable with the available auth, or a scenario whose nondeterminism is
app-inherent. Always stated, never a silent drop: dropping a gated surface without the marker is a
coverage lie. The committed spec keeps every scenario that passes its own run.

## Proof
The complete PR-mode deliverable: green spec + POM committed to the PR branch, plus the published
evidence — the [proof page](#proof-page) built from the run's Proof clips. A run that ends with
uncommitted tests, or with no published evidence and no stated skip reason, has not delivered a
proof.

## Land the proof
The deterministic PR-mode tail — pw-prove's Step 8: publish the evidence → hygiene sweep → commit
spec+POM to the PR branch → push → PR comment (creating a PR when none exists) → completion report.
The report format is the run's exit gate, structurally invalid in PR-mode without its Proof page,
Mutation, Committed, Pushed and PR comment lines.
