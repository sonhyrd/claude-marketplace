# Spec 0001 — Publish the Proof page through the Clips MCP endpoint

**Status:** ready-for-agent · **Date:** 2026-08-05 · **Repo:** `sonhyrd/e2e-skills`
**Tracker:** [sonhyrd/e2e-skills#16](https://github.com/sonhyrd/e2e-skills/issues/16)
**Amends:** [`docs/adr/0012`](../adr/0012-publish-to-clips-stream-copy-concat.md) · **Decided by:** grilling session, 2026-08-05

---

## Problem Statement

A `pw-prove` run in PR-mode ends by delivering a [Proof page](../../CONTEXT.md) — one Clips share
URL carrying every [Proof clip](../../CONTEXT.md) as a chapter. Getting that link requires the
operator to have configured **five** environment variables (`CLIPS_ORIGIN`, `CLIPS_A2A_SECRET`,
`CLIPS_ORG_ID`, `CLIPS_ORG_DOMAIN`, `CLIPS_SUBJECT`), each of which must be independently correct.

Three things go wrong with that, and they compound:

1. **The failure is silent and late.** If any of the five is missing or stale, the run still
   finishes **green** and reports `Proof page: skipped`. The operator learns nothing is wrong
   until they go looking for a link that was never produced — typically at minute fifty of a run
   whose configuration was already broken at minute zero.
2. **Three of the five are redundant.** `CLIPS_ORG_ID` is derived server-side from `org_domain`
   and can then only agree or fail; `allowed_domain` *is* the members' email domain by framework
   definition, so `CLIPS_ORG_DOMAIN` was derivable from `CLIPS_SUBJECT`. Two of the values exist
   solely to be checked against each other.
3. **The credential cannot be revoked.** `CLIPS_A2A_SECRET` is the organization's signing secret.
   There is no token-id denylist anywhere on the receiving side, so revoking one compromised
   machine means rotating that secret under **every** A2A caller in the org.

Meanwhile the transport those five variables feed — a signed POST to
`/_agent-native/actions/import-recording-from-url` — is no longer the sanctioned machine-caller
door. Clips now publishes an MCP endpoint at `/mcp` with full OAuth metadata and a device-code
flow that works headless.

## Solution

Replace the five variables with **one** opaque token, minted by the Clips deployment itself and
held in the workspace vault.

An operator connects once per machine and stores the result:

```
agent-native vault add CLIPS_MCP_TOKEN "Clips MCP bearer" --app dispatch-paulsjob
```

Every publish then runs under a **lease**:

```
agent-native vault exec --app dispatch-paulsjob --key CLIPS_MCP_TOKEN -- \
  node <skill-base>/scripts/publish-proof.mjs /tmp/pw-prove-manifest.json
```

The token carries `sub`, `org_id`, `org_domain` and its own destination (`aud`), so nothing else
needs configuring. It is individually revocable by `jti`, and it expires. `CLIPS_A2A_SECRET`
disappears entirely — the signing secret never leaves the Clips server, and `pw-prove` stops
performing cryptography at all.

Because the token's `aud` is bound to `<origin>/mcp`, it **cannot** authenticate the old
`/_agent-native/actions/…` route. The transport change is therefore forced, not stylistic:
`publish-proof.mjs` must speak JSON-RPC.

## User Stories

1. As an operator setting up a new machine, I want to connect to Clips once and store a single
   credential, so that I do not have to source five correlated values from three different places.
2. As an operator, I want the credential to live in the workspace vault, so that it never appears
   in my shell history, my transcript, or a dotfile I might commit.
3. As an operator, I want a run launched from a fresh environment — a subagent, a scheduled job, a
   new worktree — to tell me the credential is missing, so that a forgotten wrapper does not
   silently cost me a Proof page.
4. As an operator, I want that warning to arrive at **minute zero** rather than minute fifty, so
   that I can fix it while the run is still cheap to restart.
5. As an operator, I want the warning to print the **literal runnable command**, so that I can
   paste it rather than go read a skill file to reconstruct it.
6. As an operator whose laptop is compromised, I want to revoke exactly the credential that leaked,
   so that I do not have to rotate an org-wide secret under every other caller.
7. As an operator, I want the credential to expire on its own, so that an abandoned machine stops
   being able to publish without anyone remembering to clean it up.
8. As an operator, I want the credential's blast radius written down in measured terms, so that I
   can judge the risk rather than guess at it.
9. As an operator, I want `pw-prove` to work against a self-hosted Clips deployment, so that the
   skill is not hardcoded to one tenant.
10. As an E2E-proving agent in PR-mode, I want the publish step to report one of three
    distinguishable outcomes, so that I can write an accurate completion report rather than infer
    from an empty variable.
11. As an E2E-proving agent, I want a refused publish to leave the run **green** and hand me the
    local film, so that a server-side problem never destroys evidence that was otherwise complete.
12. As an E2E-proving agent, I want an oversized film to be refused **before** the request is
    built, so that I am not told about a 64 MiB ceiling after base64-encoding a video into memory.
13. As an E2E-proving agent, I want the preflight probe to distinguish "the credential is refused"
    from "this token cannot reach that action", so that I report the correct cause instead of a
    generic failure.
14. As an E2E-proving agent, I want the probe to exercise the credential by **running** the real
    call, so that reachability, org resolution and catalog gating are all confirmed at once and
    nothing is merely presence-checked.
15. As an E2E-proving agent, I want the probe to create nothing while doing so, so that a preflight
    never leaves a stray recording in someone's library.
16. As an E2E-proving agent, I want `HOSTING_READY` to keep its meaning as the conjunction of
    credential and video tooling, so that Step 8's existing skip logic needs no change.
17. As an E2E-proving agent, I want a publish failure to be detected by parsing the response body,
    so that an HTTP 200 carrying `isError` is never mistaken for success.
18. As an E2E-proving agent, I want the per-AC chapter comments to remain best-effort, so that a
    failed comment never retracts a Proof page that was already published.
19. As a reviewer opening a PR comment, I want exactly one Clips share link with per-AC timestamps,
    so that the delivered artifact is unchanged by this work.
20. As a security owner, I want `pw-prove` to stop holding an org-wide signing secret, so that the
    worst case for a compromised runner is bounded and reversible.
21. As a security owner, I want to know exactly which actions a leaked publish token can call, so
    that I can size the incident rather than assume the worst.
22. As a security owner, I want each publish to leave an audit receipt, so that "this credential
    was used here" is a claim I can check afterwards.
23. As a security owner, I want the documentation to state plainly that the vault is hygiene and
    **not** containment, so that nobody builds a policy on a boundary that does not exist.
24. As a maintainer, I want exactly one code path to Clips, so that a bug fixed in the publish path
    is fixed in the probe path by construction.
25. As a maintainer, I want the probe and the publish to authenticate **identically**, so that a
    green preflight is evidence about the publish rather than about itself.
26. As a maintainer, I want the retired HMAC path deleted rather than left as a fallback, so that
    the unrevocable credential cannot quietly become the path that actually runs.
27. As a maintainer, I want the shipped scripts to stay zero-dependency Node, so that `pw-prove`
    installs nothing into a user's repository and works for people outside this ecosystem.
28. As a maintainer, I want the scripts to be vault-**ignorant**, so that the skill does not acquire
    a hard dependency on a private CLI.
29. As a maintainer, I want the JSON-RPC success envelope exercised by a test, so that the first
    real execution of that parsing code is not a live PR run.
30. As a maintainer, I want the not-delegable case covered by a test, so that today's actual state
    of the world is asserted rather than assumed away.
31. As a maintainer, I want one test seam rather than several, so that the transport can change
    again without a scattered rewrite.
32. As a maintainer, I want the decision recorded as an ADR with its trade stated in measured terms,
    so that the next reader does not re-derive it at cost.
33. As a maintainer, I want the glossary's *Proof page* entry corrected, so that the domain model
    does not describe a mechanism that no longer exists.
34. As a future maintainer narrowing the credential, I want the catalog tier to be a property of the
    **token** and not of the code, so that re-minting narrower requires no skill change.

## Implementation Decisions

### Credential model

- **One required variable: `CLIPS_MCP_TOKEN`.** An opaque bearer minted by the Clips deployment via
  the `/mcp/connect` device-code flow.
- **One optional override: `PW_PROVE_CLIPS_ENDPOINT`.** The endpoint is otherwise read from the
  token's own `aud` claim (verified: `https://clips.paulsjob.ai/mcp`). The override is deliberately
  named `PW_PROVE_*`, not `CLIPS_*`, so it reads as a test/self-host knob rather than a sixth
  credential value. **Five required variables become one.**
- **The credential file is removed.** `clipsEnvFilePath()`, `readClipsEnvFile()`, `CLIPS_VARS` and
  the `PW_PROVE_CLIPS_ENV` override are deleted. The vault is the single sanctioned source.
- **The scripts are vault-ignorant.** They read `process.env.CLIPS_MCP_TOKEN`. `vault exec` injects
  it into the child process; no script ever spawns `agent-native`. This preserves the shipped-scripts
  convention: zero dependencies, Node standard library, nothing installed into a user's repo.
- **Clean break.** `mintToken`/`mintImportToken`/`mintCommentToken`, the `node:crypto` HMAC signing,
  `IMPORT_SCOPE`/`COMMENT_SCOPE`, `TOKEN_LIFETIME_S`, `clipsConfig` and both
  `/_agent-native/actions/…` URLs are deleted outright. No fallback, not even opt-in.

### Transport

- **JSON-RPC 2.0 over a single POST to the `/mcp` endpoint.** Verified against the live deployment:
  **no `initialize` handshake is required**, `tools/call` works standalone, and responses are plain
  `application/json` — no SSE framing, no `Mcp-Session-Id`. Request headers are `Authorization`,
  `Content-Type: application/json`, `Accept: application/json, text/event-stream`.
- **The payload shape is unchanged.** `import-recording-from-url` still receives the film as a
  base64 `data:video/webm;base64,…` URL with `title`, `description`, `chapters`, `durationMs`,
  `width`, `height`, `hasAudio`, `source` — now wrapped in `params.arguments`.
- **A 64 MiB size check runs before the request is built.** The action caps `data` at 67108864
  decoded bytes. The concatenated film is measured on disk *before* base64 encoding; over the
  ceiling it is refused locally as Undelivered, naming the ceiling and the actual size.
- **Chapter comments** continue to post one `add-comment` per chapter, best-effort, now as
  `tools/call`. Per-request token minting disappears — there is one long-lived token.

### Response classification

The critical contract, established empirically rather than assumed. **Auth failures carry an honest
HTTP 401 with a non-JSON-RPC body; everything after auth arrives as HTTP 200.** A parser that only
reads `result.content[0].text` crashes on the 401, which has no `result` key.

| Observation | Verdict |
|---|---|
| HTTP 401, `{"error":"Unauthorized",…}` | `rejected` — absent or revoked token |
| HTTP 200, `isError:true`, text `^Unknown tool` | `not-delegable` — this token's **callable catalog** lacks the action |
| HTTP 200, `isError:true`, any other text | `usable` — the **delegable action** was reached and rejected the args |
| HTTP 200, `isError:false` | `unexpected` — an empty-args probe must never succeed |
| transport throw | `unreachable` |

**`usable` is defined by exclusion, not by matching a phrase.** The passing sentence for
`import-recording-from-url` cannot be observed until the action is delegable, and pinning the gate
to a guessed string is the exact defect being replaced. To bound the fail-open risk, `usable`
**echoes the rejection sentence it accepted** into the preflight output, so a wrong verdict is
legible in the log rather than hidden behind a boolean.

### Preflight

- The existing `PROBE_HOSTING` block keeps its shape and the `PUBLISH_READY`/`VIDEO_TOOLING` →
  `HOSTING_READY` conjunction. Only the call underneath changes.
- **Absence warns; it never stops.** A missing `CLIPS_MCP_TOKEN` yields `PUBLISH_READY=no` and a
  warning that prints the literal `agent-native vault exec …` command, app name and key. It does not
  fail the run: the proof is the passing test plus the mutation verdict, and delivery is downstream
  of both.
- `not-delegable` reports the cause and the fix, rather than a generic refusal.

### Step 8 outcome taxonomy

The three outcomes are unchanged in shape. **All post-auth refusals are Undelivered** — exit 0,
`$PAGE` empty, `$KEPT` set, run stays green, film attached by hand. No new gate exit code is added.

The reasoning: the Undelivered/Gated split is not about severity but about a single question — *is
the artifact wrong, or is the door shut?* Every existing gate (empty recording, token leak,
homogeneity, duration reconciliation) answers "the artifact is wrong, and handing you the file would
hand you a bad proof." A refusal from Clips answers the opposite: the film is fine and is the only
copy in existence. Withholding it would destroy good evidence over a server-side problem.

### Documentation and domain model

- **ADR `0014`**, amending `0012`. States the trade in measured terms: two scopes
  (`recordings:import`, `recordings:comment`) → a **ten-tool callable catalog**; an unrevocable org
  signing secret → a `jti`-revocable, 365-day token; client-side HMAC → an opaque bearer the client
  never signs. Records that the vault is **transcript hygiene plus an audit receipt, explicitly not
  containment** — its own help text disclaims the boundary. Also records the two facts this work
  measured and the prior analysis got wrong: auth failures are 401, not 200; and the callable
  catalog is 10, while `tool-search` reports 188 because that is the *searchable index*.
- **`CONTEXT.md`** — the *Proof page* entry describes delivery as *"a single POST under a
  short-lived scoped token"*, which becomes false on all three counts. Three terms are added, since
  the change makes them load-bearing:
  - **Callable catalog** — the set of actions a given token may invoke, as returned by `tools/list`.
    Distinct from the searchable index surfaced by `tool-search`; an action can be findable and
    uncallable, and the failure arrives at HTTP 200.
  - **Delegable action** — an action present in the caller's callable catalog. Non-delegable is a
    property of the *token's tier*, not of the credential's validity.
  - **Lease** — a vault-issued, audited loan of a secret into a child process's environment. A
    receipt, not a boundary.
- **`README.md`** must gain links to both new `docs/` files. `review.sh`'s orphan check fails any
  `docs/**/*.md` not linked from README or named in a `scripts/**/*.sh` — a parity surface the
  original handoff omitted.
- **SKILL.md Step 8** — the five-variable paragraph collapses to "connect once per machine". The
  three-outcomes table, the gate exit list and the report invariant are unchanged. The
  HTTP-200-carrying-a-failure trap is written in the same voice as the existing `head -n1` warning.

## Testing Decisions

**What makes a good test here:** it asserts what an operator or agent can *observe* — the verdict
line, the exit code, whether a file was kept, what reached the wire — never how the module reached
it. No test should assert that a particular function was called, that the envelope was built in a
particular order, or that a specific internal string exists.

**One seam, and it already exists.** `scripts/ci/fixtures/clips-stub-server.mjs` — a throwaway local
HTTP server the scripts are pointed at via `PW_PROVE_CLIPS_ENDPOINT`. This is the highest available
seam: both `preflight.mjs` and `publish-proof.mjs` reach Clips through exactly one function, so a
fake origin exercises the probe verdicts, the refusal assertions, the success envelope and the size
check without a second runner and without touching the network.

This is precisely why `PW_PROVE_CLIPS_ENDPOINT` exists. Deriving the endpoint solely from the
token's `aud` would make the stub unreachable and the seam unbuildable.

**Prior art:** `test-publish-proof.sh` already drives that stub through modes
`ok|validation|unauthorized|error` and captures requests to a directory for assertion.
`test-hermetic.sh` and `test-probe-har.sh` are the models for asserting a script's printed contract.

**Modules and coverage:**

- **`clips-stub-server.mjs`** — taught JSON-RPC, and given a **fifth mode `unknown-tool`** returning
  `200 {"result":{"isError":true,"content":[{"text":"Unknown tool: …"}]}}`. The four existing modes
  are retargeted to the verified shapes: `unauthorized` becomes a real **401 with a non-JSON-RPC
  body**, not a JSON-RPC error.
- **`test-publish-proof.sh`** — assertions updated for the `/mcp` path and the JSON-RPC envelope.
  New: a success case proving a real recording id is parsed out of the envelope rather than a
  plausible-looking `undefined`; refusal cases proving exit 0 **with** `$KEPT` set; a size case
  proving a >64 MiB film is refused before the request is built. The four existing gates run before
  the request is built and are untouched by the transport change — their assertions stay as a smoke
  check.
- **The `PROBE_HOSTING` seam** — the three refusal assertions the design calls for: **no token**
  (`PUBLISH_READY=no` plus the runnable command in the warning), **revoked token** (`rejected` via
  401), **non-delegable tool** (`not-delegable` naming the cause). Plus the `usable`-by-exclusion
  branch, asserting the accepted sentence is echoed.
- **`test-run-ledger.sh`** — the run-ledger contract (`PWPROVE_RUN`) must stay green across the rewrite.

**Gate:** `bash scripts/ci/ci-local.sh` and `bash scripts/ci/pre-push-security.sh` must pass before
commit. Current greenness is **not** assumed — this checkout has no `.claude-plugin/`, so the
manifest-parity checks may not behave as `AGENTS.md` describes.

## Out of Scope

- **The Clips-side deploy.** Adding `mcpApp: { compactCatalog: true }` to
  `import-recording-from-url` and `add-comment` lives in `hyrdrocks/paul-clips` and is tracked
  separately. **It is the sole remaining blocker**: verified 2026-08-05 against the real vaulted
  token, both actions are absent from the callable catalog, so nothing publishes until it lands.
  This spec is written to be complete and correct without it, and to re-verify after.
- **Making runs never skip.** The goal is strictly fewer variables. A run without video tooling
  (`ffmpeg`/`ffprobe` absent → exit 4) still skips, and that is unchanged.
- **The Step-9 hygiene sweep** deleting `test-results/` after a skip that was known at minute zero,
  destroying the webms. A real defect with a cheap fix; deliberately not folded in.
- **Duplicate MCP registration.** `agent-native-clips` is registered twice with different bearers.
  Irrelevant here — the vault app is `dispatch-paulsjob`, which is unambiguous — and a user's MCP
  config is theirs to manage.
- **The upstream `--full-catalog` no-op.** `agent-native connect --full-catalog` posts
  `fullCatalog: true` to `/device/start`, which never reads it; it prints "Approved." and writes a
  token with no `catalog_scope`. Confirmed here — the vaulted token has no such claim. Worth
  reporting to `hyrdrocks/paul-agent-native`; not filed, and not required.
- **Narrowing the callable catalog below ten tools.** Requires Clips-side action definitions, not a
  skill change.

## Further Notes

**Everything except the catalog gate is already proven.** On 2026-08-05, against the real vaulted
credential: the vault lease issued, the token was injected into the child environment and never
printed, the bearer was accepted, `tools/list` returned 200, and `tools/call` dispatched. The chain
works today; only the two actions are missing from the tier.

**The token is compact-tier, and that is the intended end state.** `catalog_scope` is absent and the
callable catalog is ten tools. The earlier plan to accept a full-catalog token is superseded — the
narrow tier is achievable without widening the credential, once the Clips-side change lands.

**Do not confuse the searchable index with the callable catalog.** `tool-search` reports 188 tools
and finds `import-recording-from-url` complete with a description naming this exact use case. It is
still uncallable. This cost real time in a prior session and is the single most misleading surface
in the system.

**Never print the bearer.** Read it into a variable; never echo it, never paste a decoded payload
containing `sub`. Routing claims (`aud`, `iss`, `jti`) may be printed individually when diagnosing.
