// clips.mjs — the ONE place that knows how to reach Paul Clips and how to prove it can.
//
// Both callers live on this file deliberately: preflight.mjs round-trips the credential at minute
// zero, publish-proof.mjs uses it at minute fifty. A probe that authenticated differently from the
// publish would prove nothing about the publish — so the transport lives here, once.
//
// Configuration is ONE required environment variable:
//   CLIPS_MCP_TOKEN   an opaque bearer minted by the Clips deployment itself. It carries its own
//                     destination (`aud`), its subject and its organization, so nothing else needs
//                     configuring. It is individually revocable by `jti` and it expires.
//
// And ONE optional override, deliberately NOT named CLIPS_*, so it reads as a test / self-host knob
// rather than as a second credential value:
//   PW_PROVE_CLIPS_ENDPOINT   the MCP endpoint to POST to. Absent, the endpoint is the token's own
//                             `aud` claim (e.g. https://clips.paulsjob.ai/mcp).
//
// The scripts are VAULT-IGNORANT. They read the variable out of their own environment; they never
// spawn `agent-native`, so nothing private becomes a runtime dependency of a shipped script. An
// operator leases the credential into the child process instead:
//
//   agent-native vault exec --app <app> --key CLIPS_MCP_TOKEN -- node .../publish-proof.mjs <manifest>
//
// This replaced five correlated variables (an origin, an organization signing secret and three
// identity values) and the client-side HMAC that consumed them. The signing secret never leaves the
// Clips server now, and pw-prove performs no cryptography at all. The transport change is FORCED
// rather than stylistic: the token's audience is bound to `<origin>/mcp`, so it cannot authenticate
// the retired signed-action route at all.
//
// THE CRITICAL CONTRACT — measured against the live deployment, not assumed:
//
//   HTTP 401, body is NOT JSON-RPC  the credential was refused. There is no `result` to read, so a
//                                   parser that reaches for one throws instead of reporting.
//   HTTP 200, isError, "Unknown tool: …"  the token's CALLABLE CATALOG lacks this action. Findable
//                                   is not callable — `tool-search` indexes far more than a token
//                                   may invoke, and that failure arrives at 200.
//   HTTP 200, isError, anything else  the action was REACHED and rejected the arguments.
//   HTTP 200, no error              the call succeeded.
//
// Everything after authentication arrives at HTTP 200. Any check keyed on the status code alone
// passes vacuously, which is why outcomes are read from the BODY here and nowhere else.
//
// Zero dependencies, Node stdlib only, per the shipped-scripts convention: publishing a proof
// installs nothing into a user's repository.

export const IMPORT_ACTION = 'import-recording-from-url'; // the machine-caller door for the film
export const COMMENT_ACTION = 'add-comment'; //             the per-scenario narration lands here

/** How much of a foreign response body is worth quoting back at an operator. */
const EXCERPT = 400;
const excerpt = (text) => String(text ?? '').trim().slice(0, EXCERPT);

/**
 * Read a bearer's claims without verifying it. Verification is the receiver's job and this client
 * holds no key to do it with — the claims are read for ROUTING only (`aud`), never for trust.
 * Returns null for anything that is not a three-part token with a decodable payload.
 */
export function tokenClaims(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Returns { ok: true, token, endpoint, origin } or { ok: false, reason }.
 *
 * A caller that must WARN (preflight, minute zero) and one that must STOP (the publish) both need
 * the same answer, so this reports rather than exits.
 *
 * There is NO file fallback and no opt-in legacy path. A credential the scripts can find without
 * being handed it is a credential nobody can reason about: the retired file under $HOME made a run
 * that believed itself unconfigured publish to a real account.
 */
export function clipsConfig(env = process.env) {
  const token = (env.CLIPS_MCP_TOKEN ?? '').trim();
  if (!token) {
    return {
      ok: false,
      reason:
        'CLIPS_MCP_TOKEN is not set — the publish needs the Clips MCP bearer in its environment ' +
        '(lease it from the workspace vault for the call; never export it into a shell)',
    };
  }
  const override = (env.PW_PROVE_CLIPS_ENDPOINT ?? '').trim().replace(/\/+$/, '');
  let endpoint = override;
  if (!endpoint) {
    // The token addresses itself. `aud` is the endpoint the deployment minted it for, so an
    // operator who holds a token holds its destination too and configures no origin.
    const claims = tokenClaims(token);
    const aud = Array.isArray(claims?.aud) ? claims.aud[0] : claims?.aud;
    endpoint = (typeof aud === 'string' ? aud : '').trim().replace(/\/+$/, '');
  }
  if (!endpoint) {
    return {
      ok: false,
      reason:
        'CLIPS_MCP_TOKEN carries no `aud` claim to address, so there is no endpoint to POST to; ' +
        'set PW_PROVE_CLIPS_ENDPOINT to the deployment MCP endpoint, or re-mint the token',
    };
  }
  let origin;
  try {
    origin = new URL(endpoint).origin;
  } catch {
    return { ok: false, reason: `the Clips MCP endpoint is not a URL: '${endpoint}'` };
  }
  return { ok: true, token, endpoint, origin };
}

let nextId = 1;

/**
 * ONE JSON-RPC `tools/call` over a single POST. Returns { status, text } — the raw body, because
 * the outcome lives in it and a status code alone cannot tell success from refusal.
 *
 * No `initialize` handshake precedes it: verified against the live deployment, a bare `tools/call`
 * works, responses are plain application/json, and there is no session header to carry.
 */
export async function callClipsAction(config, action, args, timeoutMs = 30_000) {
  const res = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: nextId++,
      method: 'tools/call',
      params: { name: action, arguments: args },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  // The body is REDACTED of the bearer before anyone can quote it. Every failure path here ends in
  // an excerpt of a foreign response printed into a run log, and a deployment that echoes the
  // Authorization header it was sent — several do, in validation errors — would put the credential
  // in that log without this. The client cannot stop a server echoing; it can refuse to repeat it.
  // The empty guard is not theatre: `''.split()` on an empty needle shreds the body into characters.
  const text = await res.text();
  return {
    status: res.status,
    text: config.token ? text.split(config.token).join('<redacted bearer>') : text,
  };
}

/** The text of a tool result's content blocks, joined — what an error actually says. */
function contentText(result) {
  const blocks = Array.isArray(result?.content) ? result.content : [];
  return blocks
    .map((b) => (typeof b?.text === 'string' ? b.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

/**
 * The action's OWN return value, dug out of the tool result: `structuredContent` when the wrapper
 * supplies it, otherwise the JSON carried as the text of a content block.
 *
 * Returns null when there is nothing parseable. A caller must treat that as a failure rather than
 * reading fields off it — an absent id that reads as `undefined` is the plausible-looking nothing
 * this exists to prevent.
 */
function actionPayload(result) {
  if (result?.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent;
  }
  const blocks = Array.isArray(result?.content) ? result.content : [];
  for (const block of blocks) {
    if (typeof block?.text !== 'string') continue;
    try {
      const parsed = JSON.parse(block.text);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* a prose block is not the payload — keep looking */
    }
  }
  return null;
}

/**
 * Classify one response by PARSING ITS BODY. The single place the response matrix is encoded, so a
 * probe and a publish cannot disagree about what happened.
 *
 * Returns { outcome, detail, payload } where outcome is one of:
 *   'rejected'      the credential was refused (HTTP 401/403, body is not JSON-RPC)
 *   'not-delegable' HTTP 200, and this token's callable catalog lacks the action
 *   'rejected-args' HTTP 200, and the action was reached and rejected the arguments
 *   'ok'            HTTP 200 with no error; `payload` is the action's own return value
 *   'unexpected'    anything else — a 5xx, an unparseable body, a result with no content
 *
 * 'rejected-args' is deliberately defined BY EXCLUSION rather than by matching a sentence: the
 * wording is the server's to change, and pinning a gate to a guessed string is the exact defect
 * this replaced. `detail` carries the sentence that was accepted, so a wrong verdict is legible in
 * the log rather than hidden behind a boolean.
 */
export function classifyClipsResponse(status, text) {
  if (status === 401 || status === 403) {
    return { outcome: 'rejected', detail: `HTTP ${status} — the credential was refused: ${excerpt(text)}` };
  }
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* handled below — an unparseable body is never an outcome this can name */
  }
  if (status !== 200 || !json || typeof json !== 'object') {
    return { outcome: 'unexpected', detail: `HTTP ${status}: ${excerpt(text)}` };
  }
  const result = json.result;
  // A JSON-RPC envelope error (a bad method, a malformed request) says the same thing a tool error
  // does for our purposes: the call reached the server and did not run.
  const envelopeError =
    json.error && typeof json.error === 'object'
      ? String(json.error.message ?? JSON.stringify(json.error))
      : '';
  const errorText = envelopeError || (result?.isError ? contentText(result) : '');
  if (errorText) {
    if (/^unknown tool/i.test(errorText)) {
      return { outcome: 'not-delegable', detail: errorText.slice(0, EXCERPT) };
    }
    return { outcome: 'rejected-args', detail: errorText.slice(0, EXCERPT) };
  }
  if (!result || typeof result !== 'object') {
    return { outcome: 'unexpected', detail: `HTTP 200 with no JSON-RPC result: ${excerpt(text)}` };
  }
  return { outcome: 'ok', detail: '', payload: actionPayload(result) };
}

/**
 * Attach one timestamped comment per chapter to a published recording.
 *
 * Why comments rather than chapter titles: a chapter title renders as a scrubber tooltip, which is a
 * label-sized space. Acceptance criteria are sentences — the ones that prompted this were 54 to 167
 * characters — and at that length the tooltip overlays the video and clips. The comments panel is the
 * default tab on a share page, is readable by a signed-out reviewer, and has room to wrap.
 *
 * Best-effort by design: the film is already published and its URL is already worth reporting, so a
 * failed comment must not retract it. Returns { posted, failed, firstError } and lets the caller say
 * so plainly rather than throwing away the link.
 */
export async function postChapterComments(config, recordingId, entries, timeoutMs = 30_000) {
  let posted = 0;
  let failed = 0;
  let firstError = '';
  for (const entry of entries) {
    try {
      const { status, text } = await callClipsAction(
        config,
        COMMENT_ACTION,
        { recordingId, content: entry.content, videoTimestampMs: entry.startMs },
        timeoutMs,
      );
      const { outcome, detail } = classifyClipsResponse(status, text);
      if (outcome === 'ok') {
        posted += 1;
      } else {
        failed += 1;
        if (!firstError) firstError = `${outcome}: ${detail}`;
      }
    } catch (e) {
      failed += 1;
      if (!firstError) firstError = e.message;
    }
  }
  return { posted, failed, firstError };
}

/**
 * Round-trip the credential by CALLING the import action with arguments its schema must reject.
 *
 * The failure mode is the point: a schema rejection means the call reached the action after auth
 * resolved AND after catalog gating, so reachability, credential currency, organization resolution
 * and delegability are all confirmed at once — while creating nothing. A presence check on the
 * variable proves none of that, and neither does a bare GET.
 *
 * Returns { verdict, detail } where verdict is
 * 'usable' | 'rejected' | 'not-delegable' | 'unexpected' | 'unreachable'.
 */
export async function probeImportCredential(config, timeoutMs = 15_000) {
  let response;
  try {
    response = await callClipsAction(config, IMPORT_ACTION, {}, timeoutMs);
  } catch (e) {
    return { verdict: 'unreachable', detail: `${config.endpoint} unreachable: ${e.message}` };
  }
  const { outcome, detail } = classifyClipsResponse(response.status, response.text);
  switch (outcome) {
    case 'rejected':
      return { verdict: 'rejected', detail };
    case 'not-delegable':
      return {
        verdict: 'not-delegable',
        detail:
          `this token's callable catalog does not include ${IMPORT_ACTION} — the credential is ` +
          `valid, the action is not delegable to it ("${detail}"). Re-mint the token against a ` +
          'deployment that exposes the action to machine callers.',
      };
    case 'rejected-args':
      // Defined by exclusion, and the accepted sentence is echoed so a wrong verdict is legible.
      return {
        verdict: 'usable',
        detail: `the action was reached and rejected the empty-argument probe: "${detail}"`,
      };
    case 'ok':
      return {
        verdict: 'unexpected',
        detail:
          'an EMPTY-ARGUMENT probe SUCCEEDED — the action should have rejected it, so either the ' +
          'probe reached something other than the import action or it just created something',
      };
    default:
      return { verdict: 'unexpected', detail };
  }
}
