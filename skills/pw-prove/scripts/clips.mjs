// clips.mjs — the ONE place that knows how to reach Paul Clips and how to prove it can.
//
// Both callers live on this file deliberately: preflight.mjs round-trips the credential at minute
// zero, publish-proof.mjs uses it at minute fifty. A probe that minted its token differently from
// the publish would prove nothing about the publish — so the minting lives here, once.
//
// Configuration is two environment variables:
//   CLIPS_ORIGIN      the Clips deployment, e.g. https://clips.paulsjob.ai
//   CLIPS_A2A_SECRET  its organization-level signing secret
// Two optional refinements carry the token's identity claims when a deployment needs them:
//   CLIPS_ORG         organization id / domain hint (default: the origin's hostname)
//   CLIPS_SUBJECT     the caller identity the token asserts (default: pw-prove@<hostname>)
//
// Zero dependencies, Node stdlib only, per the shipped-scripts convention: signing is HMAC-SHA256
// through node:crypto, so publishing a proof installs nothing into a user's repository.
import crypto from 'node:crypto';

export const IMPORT_ACTION = 'import-recording-from-url'; // the machine-caller door; no new endpoint
export const IMPORT_SCOPE = 'recordings:import'; //         authorises the import and nothing else
export const TOKEN_LIFETIME_S = 300; //                     minted per request, never stored

// Returns { ok: true, ...config } or { ok: false, reason } — a caller that must WARN and one that
// must STOP both need the same answer, so this reports rather than exits.
export function clipsConfig(env = process.env) {
  const origin = (env.CLIPS_ORIGIN ?? '').trim().replace(/\/+$/, '');
  const secret = env.CLIPS_A2A_SECRET ?? '';
  if (!origin || !secret) {
    return {
      ok: false,
      reason:
        'CLIPS_ORIGIN (the Clips deployment) and CLIPS_A2A_SECRET (its organization signing ' +
        'secret) are not both set',
    };
  }
  let hostname;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return { ok: false, reason: `CLIPS_ORIGIN is not a URL: '${origin}'` };
  }
  return {
    ok: true,
    origin,
    secret,
    org: (env.CLIPS_ORG ?? '').trim() || hostname,
    subject: (env.CLIPS_SUBJECT ?? '').trim() || `pw-prove@${hostname}`,
    actionUrl: `${origin}/_agent-native/actions/${IMPORT_ACTION}`,
  };
}

const b64url = (value) => Buffer.from(value).toString('base64url');

// A short-lived HS256 bearer scoped to the import alone. With no token-id denylist on the receiving
// side, revocation costs a secret rotation either way — so a five-minute minted token is strictly
// better than a long-lived one sitting on disk, and a compromised machine cannot delete or export
// recordings with it.
export function mintImportToken(config, now = Math.floor(Date.now() / 1000)) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: config.subject,
    iss: config.origin,
    aud: config.origin, //      the receiver checks this against its own app URL
    org_id: config.org,
    org_domain: config.org, //  the org-secret lookup hint
    jti: crypto.randomUUID(),
    scope: IMPORT_SCOPE,
    iat: now,
    exp: now + TOKEN_LIFETIME_S,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac('sha256', config.secret).update(signingInput).digest();
  return `${signingInput}.${b64url(signature)}`;
}

// Round-trip the credential by POSTing a body the action's schema MUST reject.
//
// The failure mode is the point: a schema-validation rejection means the request reached the action
// AFTER auth resolved, so reachability, secret currency, adapter wiring, scope acceptance and org
// resolution are all confirmed at once — while creating nothing. A bare GET proves none of that: the
// route answers it with its method check before auth is ever consulted.
//
// Returns { verdict: 'usable' | 'rejected' | 'unreachable' | 'unexpected', detail }.
export async function probeImportCredential(config, timeoutMs = 15_000) {
  let res;
  let text = '';
  try {
    res = await fetch(config.actionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mintImportToken(config)}`,
      },
      body: JSON.stringify({}), // deliberately invalid: the schema requires bytes or a URL
      signal: AbortSignal.timeout(timeoutMs),
    });
    text = await res.text();
  } catch (e) {
    return { verdict: 'unreachable', detail: `${config.origin} unreachable: ${e.message}` };
  }
  if (res.status === 401 || res.status === 403) {
    return { verdict: 'rejected', detail: `HTTP ${res.status} — the credential was refused: ${text.slice(0, 200)}` };
  }
  if (res.status === 400 && /invalid action parameters/i.test(text)) {
    return { verdict: 'usable', detail: 'schema validation rejected the probe body — auth resolved first' };
  }
  return { verdict: 'unexpected', detail: `HTTP ${res.status}: ${text.slice(0, 200)}` };
}
