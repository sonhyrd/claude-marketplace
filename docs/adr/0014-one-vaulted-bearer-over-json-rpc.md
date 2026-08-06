# The Proof page publishes under ONE vaulted bearer over JSON-RPC — and the trade is measured, not adjectival

`docs/adr/0012` gave a pw-prove run one Clips link instead of N, and said how it got there:
`publish-proof.mjs` *"mints a short-lived scoped token and POSTs the whole recording in one
request"*. That minting is gone. **This amends 0012 on exactly that clause — the transport and the
credential. Everything else 0012 decided stands**: still one recording, still stream-copy
concatenation with nothing decoded, still the four gates before anything leaves the machine, still
a delivery failure that leaves the run green and keeps the file.

Decision: the publish authenticates with **one opaque bearer, minted by the Clips deployment
itself, leased out of the workspace vault for the call**, and speaks **JSON-RPC 2.0 `tools/call`
over a single POST to `<origin>/mcp`**. Five correlated environment variables (`CLIPS_ORIGIN`,
`CLIPS_A2A_SECRET`, `CLIPS_ORG_ID`, `CLIPS_ORG_DOMAIN`, `CLIPS_SUBJECT`) become one
(`CLIPS_MCP_TOKEN`), plus a `PW_PROVE_*`-named endpoint override that exists so the CI stub server
is reachable. The signed `/_agent-native/actions/…` route, the `node:crypto` HMAC and the
per-request token minting are **deleted, not deprecated**.

## The old route is unreachable, not unfashionable

This is the part worth writing down, because "we moved to the newer door" is the wrong story and
invites someone to move back. The token's `aud` claim is bound to `<origin>/mcp`. It **cannot**
authenticate `/_agent-native/actions/import-recording-from-url` — not "should not". And the thing
that could authenticate that route, the organization signing secret, no longer exists on this side
of the wire: it never leaves the Clips server now, and `pw-prove` performs no cryptography at all.
So the transport change is forced by the credential change, and keeping the signed path as a
fallback was not an option to weigh — there is nothing left to sign with. Deleting it is what stops
the unrevocable credential quietly becoming the path that actually runs.

## The trade, in measured terms

The loose version of this decision — "we swapped a wide credential for a narrow one" — is flattering
and wrong in both directions. Measured, on 2026-08-06, against the real vaulted credential:

- **Two action scopes become a twelve-action callable catalog.** The retired HMAC path signed a
  token per request carrying exactly `recordings:import` or `recordings:comment`. The MCP bearer
  carries no `catalog_scope` claim at all; `tools/list` returns **12** actions — `list_apps`,
  `open_app`, `create_embed_session`, `ask_app`, `ask_app_status`, `add-comment`,
  `get-recording-player-data`, `import-recording-from-url`, `search-recordings`,
  `set-resource-visibility`, `context-manifest-get`, `tool-search`. Two of those write. **This
  direction of the trade is wider, and saying so is the point.**
- **An unrevocable organization signing secret becomes an individually revocable token with a
  finite life.** `CLIPS_A2A_SECRET` had no token-id denylist anywhere on the receiving side, so
  revoking one compromised laptop meant rotating the secret under every A2A caller in the
  organization. The bearer carries a `jti` and a 365-day expiry: the blast radius of a leak is one
  credential, revoked by identifier, and an abandoned machine stops being able to publish on its
  own.
- **Client-side HMAC becomes an opaque bearer the client never signs.** The old scheme handed every
  runner the material to mint *any* token the organization could mint. The new one hands it a
  string it can only present.

Whether that is a net narrowing depends on which axis you price. It is a clear win on revocation
and on key custody, a clear loss on catalog breadth, and it is not a wash — it is a trade someone
made deliberately. Narrowing the catalog below twelve requires Clips-side action definitions, not a
skill change, and the tier is a property of the **token**: re-minting narrower needs no edit here.

## The vault is hygiene and an audit receipt. It is not containment

`agent-native vault exec` keeps the bearer out of the transcript on the happy path and prints a
lease id to stderr, so *"this credential was used here"* is a claim that can be checked afterwards.
That is the whole claim, and its own help text says so: **"This is hygiene, not containment"**, and
**"Nothing bounds a CLI lease — the lease id is a receipt, not a boundary."** Anything running as
the operator can read the same secret; the same connect bearer authenticates the same call from
`curl`. No policy should be built on a boundary that does not exist. What the vault buys is real
but bounded: no credential in a dotfile, no credential in shell history, no credential in a
transcript, and an audit trail. The scripts stay **vault-ignorant** — they read
`process.env.CLIPS_MCP_TOKEN` and never spawn `agent-native`, so a private CLI never becomes a
runtime dependency of a shipped script.

## Two things the earlier analysis got wrong, corrected by measurement

Both were re-derived at cost once already. They are recorded here so it does not happen a third
time.

**Authentication failures are an honest HTTP 401, not a 200.** The prior analysis assumed every
outcome arrived at 200 with the failure hidden in the body. Measured: a missing or bad
`Authorization` returns **401 with a body that is not JSON-RPC at all** — `{"error":"Unauthorized",…}`,
no `result` key. A parser that reaches for `result.content[0].text` *throws* on it rather than
reporting it. Everything *after* authentication does arrive at 200, which is the trap in the other
direction: an action rejecting its arguments and an action the token may not call are both 200s
carrying `isError`. `clips.mjs` therefore classifies by parsing the **body**, in one place both the
minute-zero probe and the minute-fifty publish share, so the two cannot disagree about what
happened.

**Findable is not callable: 12 callable against a searchable index of 188.** `tool-search` reports
188 tools and returns `import-recording-from-url` complete with a description naming this exact use
case — while the action may be uncallable, and that refusal arrives at **HTTP 200** as
`Unknown tool: <name>`. The searchable index and the [callable catalog](../../CONTEXT.md) are
different sets. This is the single most misleading surface in the system, and the reason the probe
*calls* the import action with arguments its schema must reject rather than looking it up: a schema
rejection proves reachability, credential currency, organization resolution and delegability at
once, and creates nothing.

The spec that preceded this work recorded the callable catalog as ten. It was ten when written, on
2026-08-05, with both publish actions absent from the tier; the Clips-side `compactCatalog` change
has since landed and the measured count is **12**, `import-recording-from-url` and `add-comment`
included. The number is a property of the deployment on the day it is read — the durable fact is
that it is small, bounded, and unrelated to 188.

## Consequences

- A run launched without the credential warns at **minute zero** with the literal runnable
  `agent-native vault exec …` command, and does not stop: the proof is the passing test plus the
  mutation verdict, and delivery is downstream of both.
- All post-auth refusals are **Undelivered**, not Gated — exit 0, run green, the concatenated film
  kept and printed. 0012's gates answer *"the artifact is wrong"*; a refusal from Clips answers
  *"the door is shut"*, and the film is the only copy in existence.
- A non-delegable action reports its cause and its remedy in one sentence, written once and shared
  by the probe and the publish, so an operator is not sent down two roads for one problem.
- Chapter comments stay best-effort: the page is already published and its URL is already worth
  reporting, so a failed comment never retracts it.
