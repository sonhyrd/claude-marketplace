// Dependency-free ports of the four translation tool functions (check-auth, get,
// diff, apply). Logic is verbatim from the previous implementation — only the
// transport (now plain functions over lib/http.mjs) and the types (now JSDoc) changed.
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { BaseRefUnresolvable, computeChangeset, repoRelPath, resolveBaseRef, resolveGitRoot } from './git.mjs'
import { HttpError, httpGet, httpPost, httpPut } from './http.mjs'

/** Shared empty changeset for the fail-safe gate (drops every update/delete). */
const EMPTY_CHANGESET = { changed: new Set(), removed: new Set() }

/**
 * Validate HYRD_TRANS_TOKEN against the server via the authenticated
 * `GET /api/translations/sync-whoami`. A bad/missing/inactive token throws a 401
 * here — instantly, with no file upload — instead of hiding until the first write.
 * @returns {Promise<{ ok: boolean, keyName: string, keyId: string }>}
 */
export async function checkAuth() {
  const result = await httpGet('/api/translations/sync-whoami', {})
  return /** @type {{ ok: boolean, keyName: string, keyId: string }} */ (result)
}

/**
 * Fetch the flat translation map for a project/language/scope.
 * Maps the `scope` param to the wire `path` query param.
 * @param {{ projectName: string, languageCode: string, subProjectName?: string, scope?: string }} input
 * @returns {Promise<{ translations: Record<string, string> }>}
 */
export async function getTranslations(input) {
  const params = {
    projectName: input.projectName,
    languageCode: input.languageCode,
    subProjectName: input.subProjectName,
    // scope -> wire param `path`
    path: input.scope,
  }

  const raw = await httpGet('/api/translations/json', params)

  // Server returns a flat Record<string,string> when a path (scope) is given,
  // but a NESTED Record<context, Record<term,string>> when it is omitted.
  // Detect the nested shape and fail loudly instead of returning garbage.
  const obj = /** @type {Record<string, unknown>} */ (
    typeof raw === 'object' && raw !== null ? raw : {}
  )
  const isFlat = Object.values(obj).every(v => typeof v === 'string')
  if (!isFlat) {
    throw new Error(
      'get_translations received a nested (multi-context) response. Pass a `scope` '
      + 'so the server returns a single flat context map.',
    )
  }

  return { translations: /** @type {Record<string, string>} */ (obj) }
}

/**
 * @typedef {object} SyncDiffEntry
 * @property {string} key
 * @property {string} [value]
 * @property {string} [oldValue]
 * @property {string} [newValue]
 * @property {'add' | 'update'} [kind]
 */
/**
 * @typedef {object} SyncDiffResult
 * @property {SyncDiffEntry[]} adds
 * @property {SyncDiffEntry[]} updates
 * @property {SyncDiffEntry[]} deletes
 * @property {SyncDiffEntry[]} emptyValued
 * @property {number} unchanged
 * @property {number} localKeyCount
 * @property {number} serverKeyCount
 */

/**
 * Restrict a whole-file sync-diff result to a single owned namespace, client-side.
 *
 * The server diffs the ENTIRE project, so a repo that owns one namespace inside a
 * shared project (e.g. a widget owning `widget.*` in an 8k-key project) sees every
 * sibling namespace as a spurious DELETE. When the repo declares its scope (`path`
 * in `hyrd-trans-bot.json` → CLI `--scope`), drop every changeset entry whose key
 * is outside `scope` and recompute the key counts so the M2 mass-delete guard
 * compares scoped-local vs scoped-server, not the whole project.
 *
 * Assumes the local file contains ONLY the owned namespace (the scoped contract):
 * `unchanged` is reported by the server as a bare count (not a key list), so it is
 * treated as fully in-scope. The wire request is unchanged — the server is never
 * told about the scope; filtering happens here on the response.
 *
 * @param {SyncDiffResult} result  raw whole-file server diff
 * @param {string} scope           owned namespace prefix (e.g. `"widget"`)
 * @returns {SyncDiffResult}
 */
export function scopeDiffResult(result, scope) {
  const inScope = (/** @type {string} */ key) =>
    key === scope || key.startsWith(`${scope}.`)

  const adds = (result.adds ?? []).filter(a => inScope(a.key))
  const updates = (result.updates ?? []).filter(u => inScope(u.key))
  const deletes = (result.deletes ?? []).filter(d => inScope(d.key))
  const emptyValued = (result.emptyValued ?? []).filter(e => inScope(e.key))
  const unchanged = result.unchanged ?? 0

  // Each in-scope LOCAL key is exactly one of: add | update | unchanged | emptyValued.
  // Each in-scope non-empty SERVER key is: delete | update | unchanged | the server
  // side of an emptyValued *update* (server had a value, local cleared it to "").
  const emptyValuedOnServer = emptyValued.filter(e => e.kind === 'update').length

  return {
    ...result,
    adds,
    updates,
    deletes,
    emptyValued,
    localKeyCount: adds.length + updates.length + unchanged + emptyValued.length,
    serverKeyCount: deletes.length + updates.length + unchanged + emptyValuedOnServer,
  }
}

/**
 * Drop every changeset entry that falls under an EXCLUDED top-level namespace,
 * client-side. The mirror image of {@link scopeDiffResult}: where `scope` keeps only
 * one owned namespace, `exclude` removes one (or more) namespaces a repo does NOT own
 * inside a shared project — e.g. a nuxt app that owns everything EXCEPT `widget.*`
 * (which the widget repo maintains on the same server). Without this, the whole-file
 * diff surfaces the sibling `widget` namespace's server/local drift as spurious
 * updates/deletes the consumer repo can neither track nor sync.
 *
 * Matching is top-level-namespace only (`key === ns || key.startsWith(`${ns}.`)`),
 * symmetric with `scopeDiffResult`. Like that function, `unchanged` is a bare
 * server-side count (not a key list), so excluded-but-unchanged keys still inflate it
 * — the recomputed `localKeyCount`/`serverKeyCount` therefore stay on the high side,
 * which is the safe direction for the M2 mass-delete guard (never under-counts).
 *
 * @param {SyncDiffResult} result   raw (or already scoped) server diff
 * @param {string[]} exclude        top-level namespaces to drop (e.g. `["widget"]`)
 * @returns {SyncDiffResult}
 */
export function excludeDiffResult(result, exclude) {
  if (!exclude || exclude.length === 0)
    return result

  const isExcluded = (/** @type {string} */ key) =>
    exclude.some(ns => key === ns || key.startsWith(`${ns}.`))
  const keep = (/** @type {SyncDiffEntry[] | undefined} */ arr) =>
    (arr ?? []).filter(e => !isExcluded(e.key))

  const adds = keep(result.adds)
  const updates = keep(result.updates)
  const deletes = keep(result.deletes)
  const emptyValued = keep(result.emptyValued)
  const unchanged = result.unchanged ?? 0

  const emptyValuedOnServer = emptyValued.filter(e => e.kind === 'update').length

  return {
    ...result,
    adds,
    updates,
    deletes,
    emptyValued,
    localKeyCount: adds.length + updates.length + unchanged + emptyValued.length,
    serverKeyCount: deletes.length + updates.length + unchanged + emptyValuedOnServer,
  }
}

/**
 * @typedef {object} GateMeta
 * @property {'gated' | 'off' | 'failed-safe'} mode
 * @property {string | null} gitRoot
 * @property {string | null} baseRef
 * @property {string | null} baseSha
 * @property {number | null} changedKeyCount
 * @property {number | null} removedKeyCount
 * @property {number} droppedUpdates
 * @property {number} droppedDeletes
 * @property {string} [reason]
 * @property {string} [warning]
 */

/**
 * Restrict a sync-diff result to the changes THIS branch actually made (PR-aware
 * gating). The shared server runs ahead of any single branch, so a whole-file diff
 * surfaces every not-yet-merged upstream key as a spurious local DELETE and every
 * upstream reword as a spurious UPDATE-to-revert. Gating keeps only the changes the
 * branch made, computed from git (base merge-base vs working tree, see lib/git.mjs):
 *
 * - `adds`    — kept unconditionally (local-only key → left wins).
 * - `updates` — survive only if `key ∈ changed` (branch changed the value); else the
 *   upstream value is kept (dropped from the diff).
 * - `deletes` — survive only if `key ∈ removed` (branch removed the key); else the
 *   upstream key is kept (dropped from the diff).
 *
 * Pure (mirrors {@link scopeDiffResult}): `changed`/`removed` are injected, no I/O,
 * counts recomputed for the M2 guard. A FAIL-SAFE gate passes empty sets → every
 * update/delete is dropped, adds intact (one code path, no separate "adds only"
 * branch to drift). Composes with {@link scopeDiffResult} (both are intersections).
 * @param {SyncDiffResult} result
 * @param {{ changed: Set<string>, removed: Set<string> }} changeset
 * @returns {SyncDiffResult}
 */
export function gateDiffResult(result, { changed, removed }) {
  const adds = result.adds ?? []
  const updates = (result.updates ?? []).filter(u => changed.has(u.key))
  const deletes = (result.deletes ?? []).filter(d => removed.has(d.key))
  const emptyValued = result.emptyValued ?? []
  const unchanged = result.unchanged ?? 0

  const emptyValuedOnServer = emptyValued.filter(e => e.kind === 'update').length

  return {
    ...result,
    adds,
    updates,
    deletes,
    emptyValued,
    localKeyCount: adds.length + updates.length + unchanged + emptyValued.length,
    serverKeyCount: deletes.length + updates.length + unchanged + emptyValuedOnServer,
  }
}

/**
 * Whole-file, server-side diff. Sends the ENTIRE local locale file to
 * `POST /api/translations/sync-diff`, which diffs it against the stored
 * translations in one authenticated call. Pass `localPath` (read here, so MBs of
 * JSON never transit the agent context) or an inline `local` object.
 *
 * When `scope` is set (a repo that owns a single namespace inside a shared
 * project), the whole-file diff is filtered to that namespace client-side via
 * {@link scopeDiffResult} — the server request is identical either way.
 * When `exclude` is set (a repo that owns everything EXCEPT one or more namespaces
 * maintained by a sibling repo on the same server, e.g. `widget`), those namespaces
 * are dropped from the diff via {@link excludeDiffResult}. `scope` and `exclude`
 * compose (scope keeps, then exclude removes).
 * When `gate` is true (the default), the result is further restricted to the changes
 * THIS branch actually made — see {@link gateDiffResult}. The gate reads the base
 * snapshot from git (rooted at `cwd`); when the base can't be resolved (no git repo,
 * shallow clone, inline `local` with no on-disk path, …) it degrades to a fail-safe
 * adds-only diff. The server request is identical regardless of scope/exclude/gate.
 * A batch caller may pass `resolvedBase` (the repo-wide git root + merge-base, resolved
 * ONCE) so N languages don't each re-run `resolveGitRoot` + merge-base; when absent the
 * single-language path resolves it here exactly as before (identical values, since cwd and
 * baseRef are the same). The per-file `computeChangeset` always runs per language regardless.
 * @param {{ projectName: string, languageCode: string, subProjectName?: string, localPath?: string, local?: Record<string, unknown>, scope?: string, exclude?: string[], gate?: boolean, baseRef?: string, cwd?: string, resolvedBase?: { gitRoot: string, baseRef: string, baseSha: string } }} input
 * @returns {Promise<SyncDiffResult & { gate: GateMeta }>}
 */
export async function diffTranslations(input) {
  const { localPath, local, projectName, languageCode, subProjectName, scope, exclude, gate = true, baseRef, cwd = process.cwd(), resolvedBase } = input

  /** @type {Record<string, unknown>} */
  let localObj
  /** @type {string | undefined} absolute on-disk path — set only for the localPath flow (the gated path) */
  let localeAbsPath
  if (localPath !== undefined) {
    const abs = isAbsolute(localPath) ? localPath : resolve(cwd, localPath)
    localeAbsPath = abs
    let raw
    try {
      raw = await readFile(abs, 'utf8')
    }
    catch (err) {
      throw new Error(`Could not read localPath "${abs}": ${err instanceof Error ? err.message : String(err)}`)
    }
    try {
      localObj = JSON.parse(raw)
    }
    catch (err) {
      throw new Error(`localPath "${abs}" is not valid JSON: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  else if (local !== undefined) {
    localObj = local
  }
  else {
    throw new Error('diff_translations requires either `localPath` (recommended) or `local`.')
  }

  const result = /** @type {SyncDiffResult} */ (await httpPost('/api/translations/sync-diff', {
    projectName,
    subProjectName,
    languageCode,
    local: localObj,
  }))

  // Scope filter first (existing behavior): a repo that owns one namespace inside a
  // shared project never proposes deleting siblings. Exclude filter next: drop any
  // namespace a sibling repo owns (e.g. `widget`) so its server/local drift never
  // surfaces here. Gating then runs on top. All three are intersections/filters.
  const scoped = scope ? scopeDiffResult(result, scope) : result
  const filtered = exclude && exclude.length ? excludeDiffResult(scoped, exclude) : scoped

  // Opt-out (--no-gate): whole-file (scoped + excluded) behavior, no git read.
  if (!gate)
    return { ...filtered, gate: offGate() }

  // PR-aware gating: keep only what THIS branch changed. Any unresolvable base (no
  // git, shallow clone, inline input with no on-disk path, mis-resolved path,
  // malformed base blob) degrades to a fail-safe adds-only diff — never a silent
  // whole-file delete.
  let gitRoot = /** @type {string | null} */ (null)
  try {
    if (localeAbsPath === undefined)
      throw new BaseRefUnresolvable('gating requires --local-path (inline input has no on-disk file to diff against base)')
    // Reuse a batch-resolved base when provided (diffAll resolves it once for all
    // languages); otherwise resolve here exactly as the single-language path always has.
    let resolvedRef
    let baseSha
    if (resolvedBase) {
      gitRoot = resolvedBase.gitRoot
      resolvedRef = resolvedBase.baseRef
      baseSha = resolvedBase.baseSha
    }
    else {
      gitRoot = resolveGitRoot(cwd)
      ;({ baseRef: resolvedRef, baseSha } = resolveBaseRef({ cwd, baseRefOverride: baseRef }))
    }
    const repoRel = repoRelPath(gitRoot, localeAbsPath)
    const { changed, removed } = computeChangeset({ cwd, repoRel, baseSha, headObj: localObj })
    const gated = gateDiffResult(filtered, { changed, removed })
    return {
      ...gated,
      gate: {
        mode: 'gated',
        gitRoot,
        baseRef: resolvedRef,
        baseSha,
        changedKeyCount: changed.size,
        removedKeyCount: removed.size,
        droppedUpdates: (filtered.updates?.length ?? 0) - gated.updates.length,
        droppedDeletes: (filtered.deletes?.length ?? 0) - gated.deletes.length,
      },
    }
  }
  catch (err) {
    if (!(err instanceof BaseRefUnresolvable))
      throw err
    // Fail safe: adds-only, drop every update/delete, warn loudly.
    const gated = gateDiffResult(filtered, EMPTY_CHANGESET)
    return {
      ...gated,
      gate: {
        mode: 'failed-safe',
        gitRoot,
        baseRef: null,
        baseSha: null,
        changedKeyCount: null,
        removedKeyCount: null,
        droppedUpdates: filtered.updates?.length ?? 0,
        droppedDeletes: filtered.deletes?.length ?? 0,
        reason: err.message,
        warning: 'gating could not run — base not resolved; updates/deletes suppressed',
      },
    }
  }
}

/** @returns {GateMeta} gate metadata for an opted-out (--no-gate) diff. */
function offGate() {
  return {
    mode: 'off',
    gitRoot: null,
    baseRef: null,
    baseSha: null,
    changedKeyCount: null,
    removedKeyCount: null,
    droppedUpdates: 0,
    droppedDeletes: 0,
  }
}

/**
 * Build a single translations map and issue one PUT to the server.
 * - adds / updates: plain key→value (empty values defensively dropped + reported)
 * - deletes: each key → "" (server interprets empty string as delete), except a key
 *   that is also an add/update — dropped and reported as `skippedConflicting`
 * - dryRun=true: returns the would-send payload WITHOUT calling PUT
 * Maps the `scope` param to the wire body param `path`.
 * @param {{ projectName: string, languageCode: string, subProjectName?: string, scope?: string, adds?: Record<string, string>, updates?: Record<string, string>, deletes?: string[], dryRun?: boolean }} input
 * @returns {Promise<{ success: boolean, applied: { adds: number, updates: number, deletes: number }, skippedEmpty: string[], skippedConflicting: string[], server: unknown }>}
 */
export async function applyTranslations(input) {
  const {
    projectName,
    languageCode,
    subProjectName,
    scope,
    adds = {},
    updates = {},
    deletes = [],
    dryRun = false,
  } = input

  /** @type {Record<string, string>} */
  const translations = {}
  /** @type {string[]} */
  const skippedEmpty = []

  // Merge adds and updates; defensively skip any empty values (M1).
  for (const [key, value] of Object.entries(adds)) {
    if (value === '' || value === null) {
      skippedEmpty.push(key)
    }
    else {
      translations[key] = value
    }
  }
  for (const [key, value] of Object.entries(updates)) {
    if (value === '' || value === null) {
      skippedEmpty.push(key)
    }
    else {
      translations[key] = value
    }
  }

  // Deletes are encoded as empty string — the server treats "" as delete.
  // Guard: never clobber a real add/update value if the same key is also in
  // `deletes` (the skill never does this, but the CLI is a public surface).
  // A dropped delete is REPORTED, not just skipped: silently returning
  // `deletes: 0` for a key the caller asked to delete reads as "already gone".
  /** @type {string[]} */
  const skippedConflicting = []
  let appliedDeletes = 0
  for (const key of deletes) {
    if (key in translations) {
      skippedConflicting.push(key)
      continue
    }
    translations[key] = ''
    appliedDeletes++
  }

  /** @type {Record<string, unknown>} */
  const payload = {
    projectName,
    languageCode,
    translations,
  }
  if (subProjectName !== undefined) {
    payload.subProjectName = subProjectName
  }
  // scope -> wire param `path`
  if (scope !== undefined) {
    payload.path = scope
  }

  if (dryRun) {
    return {
      success: true,
      applied: {
        adds: Object.keys(adds).length - skippedEmpty.filter(k => k in adds).length,
        updates: Object.keys(updates).length - skippedEmpty.filter(k => k in updates).length,
        deletes: appliedDeletes,
      },
      skippedEmpty,
      skippedConflicting,
      server: { dryRun: true, wouldSend: payload },
    }
  }

  const serverResponse = await httpPut('/api/translations/json', payload)

  const appliedAdds = Object.keys(adds).length - skippedEmpty.filter(k => k in adds).length
  const appliedUpdates = Object.keys(updates).length - skippedEmpty.filter(k => k in updates).length

  return {
    success: true,
    applied: {
      adds: appliedAdds,
      updates: appliedUpdates,
      deletes: appliedDeletes,
    },
    skippedEmpty,
    skippedConflicting,
    server: serverResponse,
  }
}

/**
 * Normalize a settled rejection into the per-language failure shape. Pulls the
 * HTTP status off an {@link HttpError} so a shared-token 401 surfaces as
 * `{ ok: false, error, status: 401 }` per language (the skill maps that back to
 * Step 0 auth guidance), and stays `{ ok: false, error }` for everything else.
 * @param {unknown} err
 * @returns {{ ok: false, error: string, status?: number }}
 */
function batchFailure(err) {
  const error = err instanceof Error ? err.message : String(err)
  if (err instanceof HttpError)
    return { ok: false, error, status: err.statusCode }
  return { ok: false, error }
}

/**
 * Batch wrapper over {@link diffTranslations}: diff every language in one process,
 * HTTP calls running concurrently via `Promise.allSettled`. Each language's local
 * file is derived as `{localesDir}/{lang}.json` and passed as `localPath`, so the
 * existing single-language gating/scope/exclude math runs verbatim — per-language
 * parity is guaranteed by construction. A per-language failure NEVER throws: it is
 * captured as `{ ok: false, error, status? }`. Returns one object keyed by language.
 * @param {{ projectName: string, languages: string[], localesDir: string, subProjectName?: string, scope?: string, exclude?: string[], gate?: boolean, baseRef?: string, cwd?: string }} input
 * @returns {Promise<Record<string, (SyncDiffResult & { gate: GateMeta, ok: true }) | { ok: false, error: string, status?: number }>>}
 */
export async function diffAll(input) {
  const { projectName, languages, localesDir, subProjectName, scope, exclude, gate = true, baseRef, cwd = process.cwd() } = input

  // Resolve the repo-wide git base ONCE for the whole batch (when gating). gitRoot and the
  // merge-base baseSha are identical for every language (same cwd, same baseRef), so sharing
  // them avoids N redundant resolveGitRoot + merge-base calls — only the per-file
  // computeChangeset stays per language (inside diffTranslations). If the base is repo-wide
  // unresolvable, leave resolvedBase undefined so each language resolves and fail-safes on its
  // own — same outcome as before, just not hoisted.
  /** @type {{ gitRoot: string, baseRef: string, baseSha: string } | undefined} */
  let resolvedBase
  if (gate) {
    try {
      const gitRoot = resolveGitRoot(cwd)
      const { baseRef: resolvedRef, baseSha } = resolveBaseRef({ cwd, baseRefOverride: baseRef })
      resolvedBase = { gitRoot, baseRef: resolvedRef, baseSha }
    }
    catch (err) {
      if (!(err instanceof BaseRefUnresolvable))
        throw err
      resolvedBase = undefined
    }
  }

  const settled = await Promise.allSettled(languages.map(lang =>
    diffTranslations({
      projectName,
      languageCode: lang,
      subProjectName,
      localPath: join(localesDir, `${lang}.json`),
      scope,
      exclude,
      gate,
      baseRef,
      cwd,
      resolvedBase,
    }),
  ))

  /** @type {Record<string, (SyncDiffResult & { gate: GateMeta, ok: true }) | { ok: false, error: string, status?: number }>} */
  const out = {}
  languages.forEach((lang, i) => {
    const r = settled[i]
    out[lang] = r.status === 'fulfilled'
      ? { ...r.value, ok: true }
      : batchFailure(r.reason)
  })
  return out
}

/**
 * Batch wrapper over {@link applyTranslations}: apply every language in one process,
 * PUTs running concurrently via `Promise.allSettled`. `input.byLanguage` is keyed by
 * language; each value is the same `{adds?,updates?,deletes?}` payload the
 * single-language apply accepts — passed through verbatim, so per-language parity is
 * guaranteed by construction. A per-language failure NEVER throws: it is captured as
 * `{ ok: false, error, status? }`. Returns one object keyed by language.
 * @param {{ projectName: string, subProjectName?: string, dryRun?: boolean, byLanguage: Record<string, { adds?: Record<string, string>, updates?: Record<string, string>, deletes?: string[] }> }} input
 * @returns {Promise<Record<string, (Awaited<ReturnType<typeof applyTranslations>> & { ok: true }) | { ok: false, error: string, status?: number }>>}
 */
export async function applyAll(input) {
  const { projectName, subProjectName, dryRun = false, byLanguage } = input
  const languages = Object.keys(byLanguage)

  const settled = await Promise.allSettled(languages.map((lang) => {
    const raw = byLanguage[lang]
    // A clearly-malformed per-language entry (number, string, array) surfaces as a
    // per-language failure rather than silently degrading to a no-op apply. A null
    // entry is treated as "nothing to apply" ({}), matching the single-language lax shape.
    if (raw != null && (typeof raw !== 'object' || Array.isArray(raw)))
      return Promise.reject(new Error(`apply-all entry for "${lang}" must be an object with adds/updates/deletes`))
    const entry = raw ?? {}
    return applyTranslations({
      projectName,
      languageCode: lang,
      subProjectName,
      adds: entry.adds,
      updates: entry.updates,
      deletes: entry.deletes,
      dryRun,
    })
  }))

  /** @type {Record<string, (Awaited<ReturnType<typeof applyTranslations>> & { ok: true }) | { ok: false, error: string, status?: number }>} */
  const out = {}
  languages.forEach((lang, i) => {
    const r = settled[i]
    out[lang] = r.status === 'fulfilled'
      ? { ...r.value, ok: true }
      : batchFailure(r.reason)
  })
  return out
}
