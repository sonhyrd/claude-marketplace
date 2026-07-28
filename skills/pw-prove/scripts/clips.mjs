// clips.mjs — the ONE place that knows how to reach Paul Clips and how to prove it can.
//
// Both callers live on this file deliberately: preflight.mjs round-trips the credential at minute
// zero, publish-proof.mjs uses it at minute fifty. A probe that minted its token differently from
// the publish would prove nothing about the publish — so the minting lives here, once.
//
// Configuration is five environment variables, and all five are REQUIRED:
//   CLIPS_ORIGIN      the Clips deployment, e.g. https://clips.paulsjob.ai. Must equal the
//                     deployment's own APP_URL, which is what it checks the token's audience against.
//   CLIPS_A2A_SECRET  the organization's signing secret (its `a2a_secret` row value)
//   CLIPS_ORG_ID      the organization the import runs under (its `id`)
//   CLIPS_ORG_DOMAIN  the organization's `allowed_domain`
//   CLIPS_SUBJECT     an email that is ALREADY A MEMBER of that organization. The import runs as
//                     that person and the recording lands in their library.
//
// CLIPS_ORG_ID and CLIPS_ORG_DOMAIN are two different values doing two different jobs, and an
// earlier version of this file carried one variable for both. The domain is what selects which
// organization's secret the receiver even tries; the id is the organization the import then runs
// under, and the receiver refuses unless the domain owns the id. Collapsing them mints a token that
// travels the whole way and is refused at the far end with a bare 401.
//
// None of the three identity values is defaulted. A guess — the origin's hostname for the id, or
// pw-prove@<hostname> for the subject — produces a credential that is refused remotely (401 for a
// mismatched org, 403 for a non-member) and has to be diagnosed against someone else's server, when
// the absence was knowable here.
//
// Where those five come from: the process environment first, and failing that a credential FILE at
// ~/.config/pw-prove-clips.env (override with PW_PROVE_CLIPS_ENV). The file exists because a run is
// launched from a fresh environment every time — a different workspace, a subagent, a scheduled
// job — and "export them in your shell first" is a step that is silently skipped far more often
// than it is performed. The symptom is not an error: the preflight correctly reports the credential
// as absent and the run finishes green with `Proof page: skipped`, so the operator learns nothing
// is wrong until they go looking for a link that was never produced.
//
// The real environment WINS over the file, so CI and a one-off override keep working. Only the five
// names below are ever taken from it: a credential file is not a general-purpose way to inject
// environment into someone's test run.
//
// Zero dependencies, Node stdlib only, per the shipped-scripts convention: signing is HMAC-SHA256
// through node:crypto, so publishing a proof installs nothing into a user's repository.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The only names read from the credential file. Order is the order they are documented above. */
const CLIPS_VARS = [
  'CLIPS_ORIGIN',
  'CLIPS_A2A_SECRET',
  'CLIPS_ORG_ID',
  'CLIPS_ORG_DOMAIN',
  'CLIPS_SUBJECT',
];

export function clipsEnvFilePath(env = process.env) {
  const override = (env.PW_PROVE_CLIPS_ENV ?? '').trim();
  if (override) return override;
  return path.join(env.HOME || os.homedir(), '.config', 'pw-prove-clips.env');
}

/**
 * Read the five CLIPS_* values out of a `KEY=value` file. Absent or unreadable returns `{}` — a
 * missing file is the normal case for anyone who sets the variables directly, not a fault.
 *
 * Deliberately a minimal parser rather than a dotenv dependency: `export ` prefixes and surrounding
 * quotes are tolerated because the file is also meant to be `source`-able from a shell, and nothing
 * else is interpreted. No variable expansion, no multi-line values — a secret with a `$` in it must
 * survive verbatim.
 */
export function readClipsEnvFile(filePath = clipsEnvFilePath()) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return {};
  }
  const values = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const eq = withoutExport.indexOf('=');
    if (eq <= 0) continue;
    const key = withoutExport.slice(0, eq).trim();
    if (!CLIPS_VARS.includes(key)) continue;
    let value = withoutExport.slice(eq + 1).trim();
    if (value.length >= 2 && ((value[0] === '"' && value.endsWith('"')) || (value[0] === "'" && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export const IMPORT_ACTION = 'import-recording-from-url'; // the machine-caller door; no new endpoint
export const IMPORT_SCOPE = 'recordings:import'; //         authorises the import and nothing else
export const TOKEN_LIFETIME_S = 300; //                     minted per request, never stored

// Returns { ok: true, ...config } or { ok: false, reason } — a caller that must WARN and one that
// must STOP both need the same answer, so this reports rather than exits.
export function clipsConfig(env = process.env) {
  // File first, real environment over the top: an explicitly-set variable must always beat a
  // stale line in a file the operator forgot they wrote.
  const filePath = clipsEnvFilePath(env);
  const fromFile = readClipsEnvFile(filePath);
  const resolved = { ...fromFile };
  for (const name of CLIPS_VARS) {
    const direct = (env[name] ?? '').trim();
    if (direct) resolved[name] = direct;
  }
  env = resolved;

  const origin = (env.CLIPS_ORIGIN ?? '').trim().replace(/\/+$/, '');
  const secret = env.CLIPS_A2A_SECRET ?? '';
  if (!origin || !secret) {
    // Name the file that was consulted. Without it the operator is told the credential is unset
    // while a file holding it sits unread at a path they were never shown.
    const fileNote = Object.keys(fromFile).length
      ? `; ${filePath} was read but does not set both`
      : `; no credential file at ${filePath}`;
    return {
      ok: false,
      reason:
        'CLIPS_ORIGIN (the Clips deployment) and CLIPS_A2A_SECRET (its organization signing ' +
        `secret) are not both set${fileNote}`,
    };
  }
  try {
    new URL(origin);
  } catch {
    return { ok: false, reason: `CLIPS_ORIGIN is not a URL: '${origin}'` };
  }
  // Named one at a time rather than as a set: an operator holding two of the three needs to be told
  // which one is missing, not that "the identity is incomplete".
  const orgId = (env.CLIPS_ORG_ID ?? '').trim();
  const orgDomain = (env.CLIPS_ORG_DOMAIN ?? '').trim();
  const subject = (env.CLIPS_SUBJECT ?? '').trim();
  const missing = [
    !orgId && "CLIPS_ORG_ID (the organization's id)",
    !orgDomain && "CLIPS_ORG_DOMAIN (the organization's allowed_domain)",
    !subject && 'CLIPS_SUBJECT (an email that is already a member of that organization)',
  ].filter(Boolean);
  if (missing.length) {
    return { ok: false, reason: `not set: ${missing.join('; ')}` };
  }
  return {
    ok: true,
    origin,
    secret,
    orgId,
    orgDomain,
    subject,
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
    sub: config.subject, //          the member the import runs as; the recording lands in their library
    iss: 'pw-prove', //              who minted it, recorded with the resolved caller
    aud: config.origin, //           the receiver checks this against its own app URL
    org_id: config.orgId, //         the organization the import runs under
    org_domain: config.orgDomain, // selects WHICH organization's secret the receiver tries
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
