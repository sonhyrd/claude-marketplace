#!/usr/bin/env node
// har-scrub.mjs — the HAR scrubber: one shipped transform for the authenticated recon capture, and
// one residue check that REFUSES instead of asking someone to confirm.
//
//   node har-scrub.mjs <file.har> [--out <path>] [--origin <url>] [--quiet]
//   node har-scrub.mjs <file.har> --verify [--quiet]
//   node har-scrub.mjs normalize <url> [--origin <url>]
//
// Exit: 0 scrubbed / clean · 1 usage · 2 unreadable or not a HAR · 3 residue found
//
// WHY THIS SHIPS. The documented approach — "remove Authorization and cookie headers" — is an
// under-scrub, and a correct reading of it still leaks: a bearer survives in `Referer` values and
// in `token=` query parameters, which is exactly what was observed in the field. Detection here
// therefore covers request AND response headers, cookie arrays, post data, referrer values, query
// parameters, URL userinfo, and any JWT-shaped string wherever it appears.
//
// Detection is by SHAPE and by NAME, because neither alone is enough. A JWT identifies itself; an
// opaque `sk_live_…` does not, and is only a credential because of the key it sits under. So bodies
// are also read by key (`api_key`, `accessToken`, `password`, …), and every secret learned anywhere
// is then back-propagated across the whole document — that is what stops one bearer being placeheld
// in `Authorization` and surviving verbatim in a response body.
//
// WHY REMOVAL IS NOT BLIND. The HAR is not an artifact, it is an INPUT: the deliverable spec
// replays it through `routeFromHAR(..., { notFound: 'abort' })`. Blindly deleting a `token=` query
// parameter changes the URL the replay matches against and turns a working spec into one that
// aborts on a call it recorded itself. So every secret becomes a STABLE placeholder, and there are
// deliberately two placeholder vocabularies:
//
//   __PWPROVE_SECRET_<n>__   value-keyed. Same secret -> same placeholder, different secrets ->
//                            different placeholders. Used for header, cookie, body and generic
//                            values, where preserving "these two are the same credential" is the
//                            useful property.
//   __PWPROVE_SCRUBBED__     shape-keyed, one constant. Used ONLY inside URLs. A replayed request
//                            carries a FRESH live credential, so a value-keyed placeholder could
//                            never equal it; a shape-keyed one makes normalizeUrl(recorded) ===
//                            normalizeUrl(live), which is the property replay actually needs.
//
// ORIGIN NORMALISATION, in the same pass. Replay matches on full URL, so a HAR carrying the literal
// port it was recorded on is fragile every time the port shifts between runs. A loopback origin is
// canonicalised to `http://localhost` (port dropped); `--origin <url>` re-points a canonical HAR at
// a live origin, which is how a committed recording is bound to whatever port THIS run got.
//
// It NEVER prints a credential. Residue is reported by location, kind and length only.
//
// Zero dependencies, Node stdlib only, per the shipped-scripts convention.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pwproveRun } from './pwprove-run.mjs';

const out = (s) => process.stdout.write(s);
const err = (s) => process.stderr.write(s);

export const URL_PLACEHOLDER = '__PWPROVE_SCRUBBED__';
// Deliberately NOT global: a `g` regex reused across `.test()` calls carries lastIndex between
// them and starts skipping matches. The global twin below is only ever handed to `.replace()`.
const PLACEHOLDER_RE = /__PWPROVE_(?:SCRUBBED|SECRET_\d+)__/;
const PLACEHOLDER_RE_G = /__PWPROVE_(?:SCRUBBED|SECRET_\d+)__/g;

// A JWT is the shape that leaked in the field, and it is self-identifying: `eyJ` is base64url for
// `{"` , so a three-segment string starting there is a JSON header and nothing else. The signature
// segment is allowed to be empty (alg:none tokens are still credentials in a HAR).
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/;
// `Bearer <opaque>` / `Basic <base64>` — the scheme survives so the recorded shape stays readable.
const SCHEME_RE = /\b(Bearer|Basic|Token)\s+([A-Za-z0-9._~+/=-]{12,})/i;

// Header names whose ENTIRE value is a credential.
const SECRET_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'authentication',
  'www-authenticate',
  'x-api-key',
  'api-key',
  'apikey',
  'x-auth-token',
  'x-access-token',
  'x-session-token',
  'x-csrf-token',
  'x-xsrf-token',
  'x-amz-security-token',
]);
// Header names whose value is a cookie jar (`a=1; b=2`, or one Set-Cookie with attributes).
const COOKIE_HEADERS = new Set(['cookie', 'set-cookie', 'cookie2', 'set-cookie2']);
// Header names whose value is a URL. `referer` is the observed under-scrub: the bearer is not in
// the header, it is in the query string of the URL the header carries.
const URL_HEADERS = new Set(['referer', 'referrer', 'location', 'content-location']);

// Query parameter names that carry a credential. Deliberately narrow — every name added here is a
// parameter whose value gets blanked in the recorded URL, and a false positive costs replay
// fidelity. Anything outside the list is still caught when its VALUE is secret-shaped.
const SECRET_PARAMS = new Set([
  'token',
  'access_token',
  'accesstoken',
  'id_token',
  'refresh_token',
  'auth',
  'auth_token',
  'authorization',
  'api_key',
  'apikey',
  'session_token',
  'sessiontoken',
  'jwt',
  'bearer',
  'signature',
  'sig',
  'secret',
  'client_secret',
  'password',
  'passwd',
]);

// A request or response BODY is the one place a credential has no shape to give it away: an opaque
// `sk_live_…` under `"api_key"` is just a string. So bodies are read by KEY as well as by shape,
// with the key normalised so `access_token`, `accessToken` and `Access-Token` are one name.
const normKey = (k) => String(k).toLowerCase().replace(/[_\-\s]/g, '');
const SECRET_KEYS = new Set(
  [
    ...SECRET_PARAMS,
    'password',
    'secret',
    'credential',
    'credentials',
    'client_secret',
    'private_key',
    'session_id',
    'csrf_token',
    'xsrf_token',
    'api_secret',
  ].map(normKey),
);

const LOOPBACK = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

// Set-Cookie metadata, which is not a credential and must survive both the scrub and the check.
const COOKIE_ATTRIBUTE_RE =
  /^\s*(path|domain|expires|max-age|samesite|priority|partitioned|version|comment)\s*$/i;

// ---------------------------------------------------------------- placeholder minting

// Value-keyed and monotonic: the Nth DISTINCT secret gets `__PWPROVE_SECRET_N__`, and every later
// occurrence of that same secret gets the same placeholder. Deterministic for a given file, which
// is what makes a scrub idempotent and a diff reviewable.
function makeMint() {
  const seen = new Map();
  const mint = (secret) => {
    let p = seen.get(secret);
    if (!p) {
      p = `__PWPROVE_SECRET_${seen.size + 1}__`;
      seen.set(secret, p);
    }
    return p;
  };
  mint.size = () => seen.size;
  // The secrets learned so far, longest first — so a value that contains another value is replaced
  // before its own substring is.
  mint.known = () => [...seen.entries()].sort((a, b) => b[0].length - a[0].length);
  return mint;
}

// The two shape regexes above are declared WITHOUT `g` and are never used directly: a global regex
// carries lastIndex between `.test()`/`.exec()` calls and silently starts skipping matches on the
// second string it sees. Every caller mints a fresh instance through these.
const jwtG = () => new RegExp(JWT_RE.source, 'g');
const schemeG = () => new RegExp(SCHEME_RE.source, 'gi');

const looksSecret = (v) => typeof v === 'string' && (jwtG().test(v) || schemeG().test(v));

// Strip the placeholders, then ask whether anything credential-shaped is left. Used by --verify on
// values whose NAME says "credential" but whose shape is opaque (an API key is just a long string).
const opaqueResidue = (v) => /[A-Za-z0-9_-]{16,}/.test(String(v).replace(PLACEHOLDER_RE_G, ''));

// A cookie jar's residue lives in its VALUES only. Testing the whole header string would read the
// NAMES too, and a long framework cookie name (`__Secure-next-auth.session-token`) then trips the
// opaque test on a correctly scrubbed jar — an exit 3 telling the operator to re-run a scrub that
// can never clear it.
const cookieHeaderResidue = (value) =>
  String(value)
    .split(';')
    .some((part, i) => {
      const eq = part.indexOf('=');
      if (eq < 0) return false;
      if (i > 0 && COOKIE_ATTRIBUTE_RE.test(part.slice(0, eq))) return false;
      return opaqueResidue(part.slice(eq + 1));
    });

// ---------------------------------------------------------------- string-level scrubbing

// Every JWT-shaped and `Bearer …`-shaped substring, wherever it appears. `place` selects the
// vocabulary: the value-keyed mint outside URLs, the shape-keyed constant inside them.
function scrubText(s, place) {
  if (typeof s !== 'string' || !s) return s;
  return s
    .replace(jwtG(), (m) => place(m))
    .replace(schemeG(), (m, scheme, cred) =>
      cred.startsWith('__PWPROVE_') ? m : `${scheme} ${place(cred)}`,
    );
}

const urlPlace = () => URL_PLACEHOLDER;

// Every string in a JSON body that sits under a credential-named key, as {key, value}. Returns
// nothing for a body that is not JSON — a form-encoded or binary body is covered by shape alone.
function jsonSecrets(text) {
  let root;
  try {
    root = JSON.parse(text);
  } catch {
    return [];
  }
  const found = [];
  const walk = (n) => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object')
      for (const [k, v] of Object.entries(n)) {
        if (typeof v === 'string' && v.trim() && SECRET_KEYS.has(normKey(k))) found.push({ key: k, value: v });
        else walk(v);
      }
  };
  walk(root);
  return found;
}

// Bodies get both passes: the shape sweep, then a literal replacement of each key-identified secret
// in the ORIGINAL text, so the body's formatting survives a re-serialisation this never performs.
function scrubBodyText(text, mint) {
  let s = scrubText(text, mint);
  for (const { value } of jsonSecrets(text)) {
    if (PLACEHOLDER_RE.test(value)) continue;
    s = s.split(JSON.stringify(value).slice(1, -1)).join(mint(value));
  }
  return s;
}

// ---------------------------------------------------------------- URL normalisation

// The one normaliser. Applied to recorded URLs when the HAR is written, and callable on a LIVE URL
// via `normalize` — two URLs that differ only in loopback port and in credential values normalise
// to the same string, which is the whole replay contract.
export function normalizeUrl(raw, targetOrigin) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    // Not an absolute URL (a relative Referer, a data: blob). Still sweep it for credentials.
    return scrubText(raw, urlPlace);
  }
  // `http://user:pa55word@host/…`. Userinfo is a credential that is neither a header, a cookie nor
  // a query parameter, so every targeted pass above misses it and the generic sweep never sees a
  // JWT shape. Placehold it in the URL vocabulary, like everything else inside a URL.
  if (u.username) u.username = URL_PLACEHOLDER;
  if (u.password) u.password = URL_PLACEHOLDER;
  if (LOOPBACK.has(u.hostname)) {
    if (targetOrigin) {
      const t = new URL(targetOrigin);
      u.protocol = t.protocol;
      u.hostname = t.hostname;
      u.port = t.port;
    } else {
      u.hostname = 'localhost';
      u.port = '';
    }
  }
  // Only rebuild the query when something actually changes — re-serialising URLSearchParams
  // re-encodes innocuous parameters and would make every recorded URL differ for no reason.
  const dirty = [...u.searchParams.entries()].filter(
    ([k, v]) => v && v !== URL_PLACEHOLDER && (SECRET_PARAMS.has(k.toLowerCase()) || looksSecret(v)),
  );
  if (dirty.length) {
    const next = new URLSearchParams();
    for (const [k, v] of u.searchParams.entries()) {
      const isSecret = v && v !== URL_PLACEHOLDER && (SECRET_PARAMS.has(k.toLowerCase()) || looksSecret(v));
      next.append(k, isSecret ? URL_PLACEHOLDER : v);
    }
    u.search = next.toString();
  }
  u.pathname = scrubText(u.pathname, urlPlace);
  u.hash = scrubText(u.hash, urlPlace);
  return u.toString();
}

// ---------------------------------------------------------------- HAR-shaped scrubbing

function scrubHeaders(headers, mint, targetOrigin) {
  if (!Array.isArray(headers)) return;
  for (const h of headers) {
    if (!h || typeof h.value !== 'string') continue;
    const name = String(h.name ?? '').toLowerCase();
    if (URL_HEADERS.has(name)) h.value = normalizeUrl(h.value, targetOrigin);
    else if (COOKIE_HEADERS.has(name)) h.value = scrubCookieHeader(h.value, mint);
    else if (SECRET_HEADERS.has(name)) h.value = scrubWholeCredential(h.value, mint);
    else h.value = scrubText(h.value, mint);
  }
}

// `Bearer eyJ…` keeps its scheme; an opaque `abc123…` is replaced whole. Either way the header is
// still present and still typed, so the recording keeps its shape.
function scrubWholeCredential(value, mint) {
  const swept = scrubText(value, mint);
  if (swept !== value) return swept;
  // Already placeheld — minting again would give the placeholder a placeholder and make the scrub
  // non-idempotent, so a second pass over a committed HAR would rewrite it for no reason.
  if (PLACEHOLDER_RE.test(value)) return value;
  return value.trim() ? mint(value) : value;
}

// One jar, or one Set-Cookie with attributes. Only the VALUE of each pair is replaced; `Path`,
// `HttpOnly`, `SameSite` and friends survive, because a scrubbed HAR that lost its cookie
// attributes is a different recording.
function scrubCookieHeader(value, mint) {
  return value
    .split(';')
    .map((part, i) => {
      const eq = part.indexOf('=');
      if (eq < 0) return part; // a bare attribute (HttpOnly, Secure)
      const name = part.slice(0, eq);
      const val = part.slice(eq + 1);
      // Set-Cookie attributes after the first pair are metadata, not credentials.
      if (i > 0 && COOKIE_ATTRIBUTE_RE.test(name)) return part;
      if (!val.trim() || PLACEHOLDER_RE.test(val)) return part;
      return `${name}=${mint(val.trim())}`;
    })
    .join(';');
}

// Every cookie value, not just the ones with a credential-sounding name: a cookie this script
// cannot classify is treated as a credential. The NAME survives, so the recording keeps its shape.
function scrubCookieArray(cookies, mint) {
  if (!Array.isArray(cookies)) return;
  for (const c of cookies) {
    if (c && typeof c.value === 'string' && c.value.trim() && !PLACEHOLDER_RE.test(c.value))
      c.value = mint(c.value);
  }
}

function scrubPostData(postData, mint) {
  if (!postData || typeof postData !== 'object') return;
  if (typeof postData.text === 'string') postData.text = scrubBodyText(postData.text, mint);
  if (Array.isArray(postData.params)) {
    for (const p of postData.params) {
      if (!p || typeof p.value !== 'string' || !p.value.trim()) continue;
      const name = String(p.name ?? '').toLowerCase();
      p.value = SECRET_PARAMS.has(name) ? mint(p.value) : scrubText(p.value, mint);
    }
  }
}

// content.text may be base64 (binary responses, and some tools encode JSON that way). Decode,
// scrub, re-encode — otherwise a login response body hides a live token behind an encoding.
function scrubContent(content, mint) {
  if (!content || typeof content.text !== 'string' || !content.text) return;
  if (content.encoding === 'base64') {
    let decoded;
    try {
      decoded = Buffer.from(content.text, 'base64').toString('utf8');
    } catch {
      return;
    }
    const swept = scrubBodyText(decoded, mint);
    if (swept !== decoded) content.text = Buffer.from(swept, 'utf8').toString('base64');
    return;
  }
  content.text = scrubBodyText(content.text, mint);
}

// The backstop: every remaining string in the document, so "any JWT-shaped string is caught
// wherever it appears" holds for HAR fields this script does not know about (custom `_` extensions,
// timing comments, page titles).
function sweepEverything(node, mint) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (typeof node[i] === 'string') node[i] = scrubText(node[i], mint);
      else sweepEverything(node[i], mint);
    }
  } else if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      if (typeof node[k] === 'string') node[k] = scrubText(node[k], mint);
      else sweepEverything(node[k], mint);
    }
  }
}

export function scrubHar(har, { origin } = {}) {
  const mint = makeMint();
  const entries = har?.log?.entries;
  if (Array.isArray(entries)) {
    for (const e of entries) {
      const req = e?.request;
      if (req) {
        if (typeof req.url === 'string') req.url = normalizeUrl(req.url, origin);
        scrubHeaders(req.headers, mint, origin);
        scrubCookieArray(req.cookies, mint);
        // queryString must be rewritten to agree with the URL, or --verify reads the leak back out
        // of the very field the URL pass just cleaned.
        if (Array.isArray(req.queryString)) {
          for (const q of req.queryString) {
            if (!q || typeof q.value !== 'string' || !q.value) continue;
            const name = String(q.name ?? '').toLowerCase();
            q.value = SECRET_PARAMS.has(name) || looksSecret(q.value) ? URL_PLACEHOLDER : q.value;
          }
        }
        scrubPostData(req.postData, mint);
      }
      const res = e?.response;
      if (res) {
        scrubHeaders(res.headers, mint, origin);
        scrubCookieArray(res.cookies, mint);
        scrubContent(res.content, mint);
        if (typeof res.redirectURL === 'string' && res.redirectURL)
          res.redirectURL = normalizeUrl(res.redirectURL, origin);
      }
    }
  }
  sweepEverything(har, mint);
  // Back-propagation. A secret learned in ONE place — a header, or a credential-named body key —
  // is now replaced by its literal value everywhere else in the document, in both directions. This
  // is what stops the same bearer being placeheld in `Authorization` and surviving verbatim in a
  // response body, which no shape rule and no key rule catches on its own.
  const known = mint.known();
  if (known.length) {
    const replaceKnown = (s) => {
      let v = s;
      for (const [secret, placeholder] of known) if (v.includes(secret)) v = v.split(secret).join(placeholder);
      return v;
    };
    const walk = (node) => {
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          if (typeof node[i] === 'string') node[i] = replaceKnown(node[i]);
          else walk(node[i]);
        }
      } else if (node && typeof node === 'object') {
        for (const k of Object.keys(node)) {
          if (typeof node[k] === 'string') node[k] = replaceKnown(node[k]);
          else walk(node[k]);
        }
      }
    };
    walk(har);
  }
  return { har, secrets: mint.size() };
}

// ---------------------------------------------------------------- residue check

// Read-only. Returns a list of {where, kind, len} — never a value, per the no-credential-printing
// rule this repo holds everywhere else.
export function findResidue(har) {
  const hits = [];
  const add = (where, kind, len) => hits.push({ where, kind, len });

  const checkString = (where, s) => {
    if (typeof s !== 'string' || !s) return;
    const jwt = s.match(jwtG());
    if (jwt) add(where, 'JWT-shaped string', jwt[0].length);
    for (const m of s.matchAll(schemeG())) {
      if (!m[2].startsWith('__PWPROVE_')) add(where, `${m[1].toLowerCase()} credential`, m[2].length);
    }
  };

  const checkUrl = (where, raw) => {
    checkString(where, raw);
    let u;
    try {
      u = new URL(raw);
    } catch {
      return;
    }
    for (const [k, v] of u.searchParams.entries()) {
      if (!v || v === URL_PLACEHOLDER) continue;
      if (SECRET_PARAMS.has(k.toLowerCase())) add(`${where}?${k}`, 'credential in query parameter', v.length);
    }
    // `http://user:pa55word@host/…` — a credential that is not a header, a cookie or a parameter.
    if (u.password && u.password !== URL_PLACEHOLDER) add(`${where}@userinfo`, 'credential in URL userinfo', u.password.length);
    else if (u.username && u.username !== URL_PLACEHOLDER && opaqueResidue(u.username))
      add(`${where}@userinfo`, 'credential in URL userinfo', u.username.length);
  };

  const walk = (node, where) => {
    if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${where}[${i}]`));
    else if (node && typeof node === 'object')
      for (const k of Object.keys(node)) walk(node[k], where ? `${where}.${k}` : k);
    else checkString(where, node);
  };

  const entries = har?.log?.entries;
  if (Array.isArray(entries)) {
    entries.forEach((e, i) => {
      const at = `entries[${i}]`;
      if (typeof e?.request?.url === 'string') checkUrl(`${at}.request.url`, e.request.url);
      if (typeof e?.response?.redirectURL === 'string' && e.response.redirectURL)
        checkUrl(`${at}.response.redirectURL`, e.response.redirectURL);
      for (const side of ['request', 'response']) {
        for (const h of e?.[side]?.headers ?? []) {
          const name = String(h?.name ?? '').toLowerCase();
          const where = `${at}.${side}.headers[${h?.name}]`;
          if (URL_HEADERS.has(name)) checkUrl(where, String(h?.value ?? ''));
          else if (SECRET_HEADERS.has(name) && opaqueResidue(h?.value ?? ''))
            add(where, 'unscrubbed credential header', String(h?.value ?? '').length);
          else if (COOKIE_HEADERS.has(name) && cookieHeaderResidue(h?.value ?? ''))
            add(where, 'unscrubbed cookie header', String(h?.value ?? '').length);
        }
        for (const c of e?.[side]?.cookies ?? []) {
          if (c?.value && !PLACEHOLDER_RE.test(String(c.value)) && opaqueResidue(c.value))
            add(`${at}.${side}.cookies[${c?.name}]`, 'unscrubbed cookie value', String(c.value).length);
        }
      }
      // Bodies, by key: an opaque secret under `"api_key"` has no shape to catch it by.
      const bodies = [
        [`${at}.request.postData.text`, e?.request?.postData?.text, e?.request?.postData?.encoding],
        [`${at}.response.content.text`, e?.response?.content?.text, e?.response?.content?.encoding],
      ];
      for (const [where, text, encoding] of bodies) {
        if (typeof text !== 'string' || !text) continue;
        let body = text;
        if (encoding === 'base64') {
          try {
            body = Buffer.from(text, 'base64').toString('utf8');
            checkString(where, body);
          } catch {
            continue;
          }
        }
        for (const { key, value } of jsonSecrets(body)) {
          if (!PLACEHOLDER_RE.test(value)) add(`${where}.${key}`, 'credential under a secret-named body key', value.length);
        }
      }
      for (const q of e?.request?.queryString ?? []) {
        if (!q?.value || q.value === URL_PLACEHOLDER) continue;
        if (SECRET_PARAMS.has(String(q?.name ?? '').toLowerCase()))
          add(`${at}.request.queryString[${q?.name}]`, 'credential in query parameter', String(q.value).length);
      }
    });
  }
  // And the same backstop the scrub uses: a JWT anywhere at all.
  walk(har, '');

  // One location may trip two rules (a bearer inside a referrer is both). Report it once.
  const seen = new Set();
  return hits.filter((h) => {
    const k = `${h.where}|${h.kind}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------- binding for replay

// WHY BINDING EXISTS. Playwright's HAR replay matches on EXACT request-URL string equality:
// `HarBackend._harFindResponse` skips every candidate where `candidate.request.url !== url`, and
// there is no tolerance for origin, port or query anywhere in that path (read in playwright-core
// 1.58.2 and confirmed unchanged in 1.62.1). A committed HAR is deliberately canonical — no port,
// every secret placeheld — so it can NEVER match a live run on its own: `routeFromHAR` returns
// `noentry` and `notFound: 'abort'` aborts a call the run itself recorded.
//
// So the committed file is bound to THIS run before it is replayed: its canonical origin becomes
// the run's real origin, and each placeholder in the match key becomes the run's own live value.
// That is what the stable, shape-keyed placeholders were for — the substitution is deterministic
// because the same secret always produced the same placeholder.
//
// Only the MATCH KEY is rebound — request URL, query string and post data. Headers, cookies and
// response bodies play no part in the lookup, so re-injecting credentials there would put a live
// bearer in a file for no gain. The result is a working copy, never the committed file.
export function bindHar(har, { origin, bindings = {} } = {}) {
  const unbound = [];
  let bound = 0;
  // `required` marks the positions the LOOKUP reads. A placeholder left in one of those cannot
  // match and must be refused; a placeholder anywhere else is bound when a value is offered and
  // left alone otherwise, because rebinding it buys nothing and costs a live credential in a file.
  const subst = (s, where, required) => {
    if (typeof s !== 'string' || !s) return s;
    return s.replace(PLACEHOLDER_RE_G, (m) => {
      const v = bindings[m];
      if (v === undefined) {
        if (required) unbound.push({ where, placeholder: m });
        return m;
      }
      bound += 1;
      return v;
    });
  };
  const entries = har?.log?.entries;
  if (Array.isArray(entries)) {
    entries.forEach((e, i) => {
      const req = e?.request;
      if (!req) return;
      const at = `entries[${i}].request`;
      // Re-point FIRST, substitute second: normalizeUrl leaves a placeholder alone, but a URL that
      // already carries a live token would look dirty to it and be placeheld right back.
      if (typeof req.url === 'string') {
        req.url = subst(origin ? normalizeUrl(req.url, origin) : req.url, `${at}.url`, true);
      }
      // queryString mirrors the URL and is not itself looked up; keep the two agreeing, but never
      // refuse over it — the URL above already refused if this run cannot bind the value.
      for (const q of req.queryString ?? []) {
        if (q && typeof q.value === 'string') q.value = subst(q.value, `${at}.queryString[${q.name}]`, false);
      }
      // Post data is compared byte for byte, but ONLY when the live request is a POST carrying a
      // body (`method === 'POST' && postData` in _harFindResponse). A GET's recorded body is never
      // read, so a placeholder there is not an unbindable entry.
      const isMatchedBody = String(req.method ?? '').toUpperCase() === 'POST';
      if (req.postData) {
        if (typeof req.postData.text === 'string')
          req.postData.text = subst(req.postData.text, `${at}.postData.text`, isMatchedBody);
        for (const p of req.postData.params ?? []) {
          if (p && typeof p.value === 'string')
            p.value = subst(p.value, `${at}.postData.params[${p.name}]`, isMatchedBody);
        }
      }
      // The response's redirect target is followed by the same exact-match loop, so it is match key
      // too — but only its ORIGIN needs to agree; a placeheld credential in it is not looked up.
      const res = e?.response;
      if (res && typeof res.redirectURL === 'string' && res.redirectURL && origin)
        res.redirectURL = normalizeUrl(res.redirectURL, origin);
    });
  }
  return { bound, unbound };
}

// ---------------------------------------------------------------- CLI

// Everything below runs only when this file IS the process. Imported — which is how probe.mjs
// reaches `scrubHar`/`findResidue` for the capture-time scrub (issue #41) — it stays a module: no
// ledger record, no argument parsing, no process.exit().
//
// The CLI therefore lives INSIDE the guard, not after it. ESM has no top-level `return`, so an
// `if (!isMain) { }` with the CLI below it reads like a guard and stops nothing: every importer
// inherited this file's argument parsing and died of "no HAR file given" before it could scrub.
const isMain = (() => {
  try {
    return path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (isMain) {
  // Called BEFORE any argument validation, so even a usage-error exit leaves a run record.
  pwproveRun(import.meta.url, 'scrub');

  const USAGE =
    'usage: har-scrub.mjs <file.har> [--out <path>] [--origin <url>] [--quiet]\n' +
    '       har-scrub.mjs <file.har> --verify [--quiet]\n' +
    '       har-scrub.mjs bind <file.har> --out <gitignored> --origin <url> [--bindings <json>]\n' +
    '       har-scrub.mjs normalize <url> [--origin <url>]\n' +
    'exit: 0 scrubbed/clean/bound · 1 usage · 2 unreadable or not a HAR · 3 residue found\n' +
    '      4 a placeholder in the match key has no run-time value · 5 the bound copy would be committable\n';

  const argv = process.argv.slice(2);
  // Two subcommands; every other invocation takes a HAR path as its positional.
  const MODE = argv[0] === 'normalize' || argv[0] === 'bind' ? argv[0] : 'har';
  const rest = MODE === 'har' ? argv : argv.slice(1);

  const positional = [];
  let OUT = null;
  let ORIGIN = null;
  let BINDINGS = null;
  let VERIFY = false;
  let QUIET = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--verify') VERIFY = true;
    else if (a === '--quiet') QUIET = true;
    else if (a === '--out') OUT = rest[++i];
    else if (a === '--origin') ORIGIN = rest[++i];
    else if (a === '--bindings') BINDINGS = rest[++i];
    else if (a === '-h' || a === '--help') {
      out(USAGE);
      process.exit(0);
    } else if (a.startsWith('-')) {
      err(`har-scrub: unknown flag '${a}'\n${USAGE}`);
      process.exit(1);
    } else positional.push(a);
  }
  if (positional.length > 1) {
    err(`har-scrub: unexpected argument '${positional[1]}'\n${USAGE}`);
    process.exit(1);
  }
  if (ORIGIN) {
    try {
      new URL(ORIGIN);
    } catch {
      err(`har-scrub: --origin '${ORIGIN}' is not an absolute URL\n`);
      process.exit(1);
    }
  }

  // `normalize <url>` — the same normaliser, callable on ONE url. This is how a caller proves that a
  // recorded entry and a live replayed request land on the same string.
  if (MODE === 'normalize') {
    if (!positional.length) {
      err(`har-scrub: normalize needs a url\n${USAGE}`);
      process.exit(1);
    }
    out(`${normalizeUrl(positional[0], ORIGIN)}\n`);
    process.exit(0);
  }

  const TARGET = positional[0];
  if (!TARGET) {
    err(`har-scrub: no HAR file given\n${USAGE}`);
    process.exit(1);
  }

  let raw;
  try {
    raw = fs.readFileSync(TARGET, 'utf8');
  } catch (e) {
    err(`har-scrub: cannot read '${TARGET}' (${e.code ?? e.message})\n`);
    process.exit(2);
  }
  let har;
  try {
    har = JSON.parse(raw);
  } catch (e) {
    err(`har-scrub: '${TARGET}' is not valid JSON (${e.message})\n`);
    process.exit(2);
  }
  if (!har?.log || !Array.isArray(har.log.entries)) {
    err(`har-scrub: '${TARGET}' has no log.entries — this is not a HAR\n`);
    process.exit(2);
  }

  // `bind <file.har> --out <gitignored>` — the replay binding (issue #41). See `bindHar` above for
  // why an exact-match replay cannot use the committed file directly.
  if (MODE === 'bind') {
    if (!OUT) {
      err(
        'har-scrub: bind needs --out <gitignored path> — it binds INTO a working copy and never\n' +
          `           rewrites the committed HAR\n${USAGE}`,
      );
      process.exit(1);
    }
    // The bound copy carries this run's live credential, so a path git would commit is the wrong
    // place for it. `git check-ignore` is the only authority on that question: exit 0 ignored,
    // exit 1 not ignored, anything else means git could not answer (no repo, no git).
    const ignored = spawnSync('git', ['check-ignore', '-q', OUT], { stdio: 'ignore' });
    if (ignored.status === 1) {
      err(
        `har-scrub: REFUSED — '${OUT}' is not gitignored, and a bound HAR carries a live credential.\n` +
          '  Bind into a gitignored path (e.g. .pw-prove/) — the committed HAR stays canonical.\n',
      );
      process.exit(5);
    }
    if (ignored.status !== 0 && !QUIET)
      err(`har-scrub: WARNING — git could not say whether '${OUT}' is ignored; never commit it\n`);

    let bindings = {};
    if (BINDINGS) {
      try {
        bindings = JSON.parse(fs.readFileSync(BINDINGS, 'utf8'));
      } catch (e) {
        err(`har-scrub: cannot read the bindings file '${BINDINGS}' (${e.code ?? e.message})\n`);
        process.exit(2);
      }
      if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) {
        err(`har-scrub: '${BINDINGS}' must be a JSON object of {"__PWPROVE_…__": "<this run's value>"}\n`);
        process.exit(2);
      }
    }

    const { bound, unbound } = bindHar(har, { origin: ORIGIN, bindings });
    if (unbound.length) {
      err(`har-scrub: REFUSED — ${unbound.length} placeholder(s) in the replay match key have no value:\n`);
      for (const u of unbound) err(`  ${u.where}  ${u.placeholder}\n`);
      err(
        '  Replay matches on the EXACT request URL, so these entries cannot match. Left alone they\n' +
          "  abort under notFound:'abort' and read as a broken application rather than an unbindable\n" +
          "  recording. Give each placeholder this run's own value in --bindings <json>, or re-record.\n",
      );
      process.exit(4);
    }
    try {
      fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
      fs.writeFileSync(OUT, `${JSON.stringify(har, null, 2)}\n`, { mode: 0o600 });
      fs.chmodSync(OUT, 0o600);
    } catch (e) {
      err(`har-scrub: cannot write the bound HAR to '${OUT}' (${e.code ?? e.message})\n`);
      process.exit(2);
    }
    if (!QUIET)
      out(
        `har-scrub: bound ${har.log.entries.length} entries to ` +
          `${ORIGIN ? new URL(ORIGIN).origin : 'the recorded origin'}, ` +
          `${bound} placeholder substitution(s) -> ${OUT}\n`,
      );
    out(
      `PWPROVE_SCRUB bound file=${OUT} entries=${har.log.entries.length} substitutions=${bound}\n`,
    );
    process.exit(0);
  }

  const report = (hits) => {
    for (const h of hits) err(`  ${h.where}  ${h.kind}  (len ${h.len})\n`);
  };

  if (VERIFY) {
    const hits = findResidue(har);
    if (hits.length) {
      err(`har-scrub: REFUSED — ${hits.length} credential residue(s) in '${TARGET}'\n`);
      report(hits);
      err('  Re-run the scrubber over this file; a leaked bearer in a committed HAR is the same\n');
      err('  incident as one in a log line.\n');
      out(`PWPROVE_SCRUB residue file=${TARGET} hits=${hits.length}\n`);
      process.exit(3);
    }
    if (!QUIET) out(`har-scrub: clean — no credential residue in '${TARGET}' (${har.log.entries.length} entries)\n`);
    out(`PWPROVE_SCRUB clean file=${TARGET} entries=${har.log.entries.length}\n`);
    process.exit(0);
  }

  const { secrets } = scrubHar(har, { origin: ORIGIN });
  const dest = OUT || TARGET;
  try {
    fs.writeFileSync(dest, `${JSON.stringify(har, null, 2)}\n`);
  } catch (e) {
    err(`har-scrub: cannot write '${dest}' (${e.code ?? e.message})\n`);
    process.exit(2);
  }

  // Self-verify: a scrub that leaves residue must not report success. This is the same check the
  // pre-commit refusal runs, so the two can never disagree.
  const left = findResidue(har);
  if (!QUIET)
    out(
      `har-scrub: ${secrets} distinct secret(s) placeheld, ${har.log.entries.length} entries, ` +
        `origins ${ORIGIN ? `re-pointed at ${new URL(ORIGIN).origin}` : 'canonicalised'} -> ${dest}\n`,
    );
  if (left.length) {
    err(`har-scrub: REFUSED — ${left.length} residue(s) SURVIVED the scrub in '${dest}'\n`);
    report(left);
    out(`PWPROVE_SCRUB residue file=${dest} hits=${left.length}\n`);
    process.exit(3);
  }
  out(`PWPROVE_SCRUB ok file=${dest} secrets=${secrets} entries=${har.log.entries.length}\n`);
  process.exit(0);
}
