// Dependency-free HTTP client (ported from the former http.ts). Uses the global
// fetch (Node >= 20). Logic is verbatim: same Bearer headers, same 401/404/5xx
// error normalization, same GET/PUT/POST/GETRAW helpers.
import { getConfig } from './config.mjs'

export class HttpError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   */
  constructor(statusCode, message) {
    super(message)
    /** @type {number} */
    this.statusCode = statusCode
    this.name = 'HttpError'
  }
}

// Test-only seam: the smoke tests inject a stub via __setFetchForTests so no real
// network call is made. At runtime this is always globalThis.fetch. Do NOT
// re-export this from the CLI entrypoint — it exists only for lib/*.test.mjs.
let _fetch = globalThis.fetch
/** @param {typeof globalThis.fetch | null | undefined} fn */
export function __setFetchForTests(fn) {
  _fetch = fn || globalThis.fetch
}

/** @param {string} token */
function buildHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

/**
 * @param {number} status
 * @param {unknown} body
 * @returns {HttpError}
 */
function normalizeError(status, body) {
  const msg = typeof body === 'object' && body !== null && 'statusMessage' in body
    ? String(/** @type {Record<string, unknown>} */ (body).statusMessage)
    : `HTTP ${status}`

  if (status === 401) {
    return new HttpError(401, `Unauthorized: ${msg}. Check HYRD_TRANS_TOKEN.`)
  }
  if (status === 404) {
    return new HttpError(404, `Not found: ${msg}`)
  }
  if (status >= 500) {
    return new HttpError(status, `Server error (${status}): ${msg}`)
  }
  return new HttpError(status, `Request failed (${status}): ${msg}`)
}

/**
 * @param {string} path
 * @param {Record<string, string | undefined>} params
 * @returns {Promise<unknown>}
 */
export async function httpGet(path, params) {
  const config = getConfig()
  const url = new URL(path, config.HYRD_TRANS_BASE_URL)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, value)
    }
  }

  const response = await _fetch(url.toString(), {
    method: 'GET',
    headers: buildHeaders(config.HYRD_TRANS_TOKEN),
  })

  let body
  try {
    body = await response.json()
  }
  catch {
    body = null
  }

  if (!response.ok) {
    throw normalizeError(response.status, body)
  }

  return body
}

/**
 * @param {string} path
 * @param {unknown} payload
 * @returns {Promise<unknown>}
 */
export async function httpPut(path, payload) {
  const config = getConfig()
  const url = new URL(path, config.HYRD_TRANS_BASE_URL)

  const response = await _fetch(url.toString(), {
    method: 'PUT',
    headers: buildHeaders(config.HYRD_TRANS_TOKEN),
    body: JSON.stringify(payload),
  })

  let body
  try {
    body = await response.json()
  }
  catch {
    body = null
  }

  if (!response.ok) {
    throw normalizeError(response.status, body)
  }

  return body
}

/**
 * @param {string} path
 * @param {unknown} payload
 * @returns {Promise<unknown>}
 */
export async function httpPost(path, payload) {
  const config = getConfig()
  const url = new URL(path, config.HYRD_TRANS_BASE_URL)

  const response = await _fetch(url.toString(), {
    method: 'POST',
    headers: buildHeaders(config.HYRD_TRANS_TOKEN),
    body: JSON.stringify(payload),
  })

  let body
  try {
    body = await response.json()
  }
  catch {
    body = null
  }

  if (!response.ok) {
    throw normalizeError(response.status, body)
  }

  return body
}
