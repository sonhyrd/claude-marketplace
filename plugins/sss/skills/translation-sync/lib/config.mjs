// Dependency-free config layer (zod removed; ported from the former config.ts).
//
// KEY DIFFERENCE vs. the old MCP: there is NO cached/memoized config. The env is
// read on EVERY getConfig() call. Because the CLI is a fresh process per
// invocation (the skill runs `node hyrd-trans.mjs <sub>` over Bash, which sources
// your shell profile), HYRD_TRANS_TOKEN is read at call time — the structural fix
// for the auth bug the launch-frozen MCP could not solve.

const DEFAULT_BASE_URL = 'https://i18n.paulsjob.ai'

/**
 * @typedef {{ HYRD_TRANS_TOKEN: string, HYRD_TRANS_BASE_URL: string }} Config
 */

/** Fail fast if the runtime lacks a global fetch (Node >= 20 provides it). */
export function assertRuntime() {
  if (typeof fetch !== 'function') {
    throw new Error('Node >=20 with a global fetch is required to run hyrd-trans.')
  }
}

/**
 * Validate + resolve config from process.env. Throws a plain Error on invalid
 * input (token missing, base URL malformed or non-https off localhost).
 * @returns {Config}
 */
export function getConfig() {
  const token = process.env.HYRD_TRANS_TOKEN
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('HYRD_TRANS_TOKEN is required')
  }

  const rawBaseUrl
    = typeof process.env.HYRD_TRANS_BASE_URL === 'string' && process.env.HYRD_TRANS_BASE_URL.length > 0
      ? process.env.HYRD_TRANS_BASE_URL
      : DEFAULT_BASE_URL

  let url
  try {
    url = new URL(rawBaseUrl)
  }
  catch {
    throw new Error('HYRD_TRANS_BASE_URL must be a valid URL')
  }

  // Require https so the Bearer token is never sent in plaintext to an
  // arbitrary/poisoned origin (http allowed only for localhost dev).
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && isLocal))) {
    throw new Error('HYRD_TRANS_BASE_URL must use https (http allowed only for localhost)')
  }

  return { HYRD_TRANS_TOKEN: token, HYRD_TRANS_BASE_URL: rawBaseUrl }
}
