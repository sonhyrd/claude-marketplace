#!/usr/bin/env node
// hyrd-trans — the dependency-free CLI that replaces the hyrd-translation MCP
// server. The translation-sync skill drives it over Bash:
//
//   node <skill-dir>/hyrd-trans.mjs check-auth
//   node <skill-dir>/hyrd-trans.mjs get   --project P --language L [--scope S] [--sub-project SP]
//   node <skill-dir>/hyrd-trans.mjs diff  --project P --language L --local-path FILE [--scope S] [--sub-project SP]
//   printf '%s' '{"adds":{…},"updates":{…},"deletes":[…]}' \
//     | node <skill-dir>/hyrd-trans.mjs apply --project P --language L [--sub-project SP] [--dry-run]
//   node <skill-dir>/hyrd-trans.mjs diff-all  --project P --languages de,en,id --locales-dir DIR [--scope S] [--exclude a,b] [--sub-project SP] [--no-gate] [--base-ref REF]
//   printf '%s' '{"de":{"adds":{…},"updates":{…},"deletes":[…]},"en":{…}}' \
//     | node <skill-dir>/hyrd-trans.mjs apply-all --project P [--sub-project SP] [--dry-run]
//   (diff-all/apply-all: one process, concurrent per-language calls, one JSON keyed by language;
//    exit 0 whenever the batch dispatched — per-language ok/error/status live in the JSON.)
//
// Output contract (so the skill can branch reliably):
//   exit 0 → success, clean JSON on STDOUT, nothing on stderr
//   exit 1 → usage/validation error (missing token, bad flag, unreadable file), {error} on stderr
//   exit 2 → 401 Unauthorized, {error,status:401} on stderr
//   exit 3 → other HTTP error (4xx/5xx), {error,status} on stderr
//
// The token is read from HYRD_TRANS_TOKEN per invocation (the auth fix). Base URL
// defaults to https://i18n.paulsjob.ai; override with HYRD_TRANS_BASE_URL.
import { fstatSync } from 'node:fs'
import { assertRuntime } from './lib/config.mjs'
import { HttpError } from './lib/http.mjs'
import { applyAll, applyTranslations, checkAuth, diffAll, diffTranslations, getTranslations } from './lib/tools.mjs'

/** Usage/validation error → exit 1. */
class UsageError extends Error {}

/**
 * Minimal argv parser: first positional is the subcommand; the rest are
 * `--flag value` pairs or bare `--bool` flags.
 * @param {string[]} argv
 * @returns {{ subcommand: string | undefined, opts: Record<string, string | boolean> }}
 */
function parseArgs(argv) {
  const [subcommand, ...rest] = argv
  /** @type {Record<string, string | boolean>} */
  const opts = {}
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i]
    if (!tok.startsWith('--'))
      continue
    const key = tok.slice(2)
    const next = rest[i + 1]
    if (next === undefined || next.startsWith('--')) {
      opts[key] = true
    }
    else {
      opts[key] = next
      i++
    }
  }
  return { subcommand, opts }
}

/**
 * True only when stdin actually has piped/redirected input — a FIFO from
 * `printf … | node …`, or a redirected regular file. A TTY, `/dev/null` (char
 * device), or an inherited socket (the Claude Code Bash tool's default stdin,
 * which never sends EOF) all count as "no input", so `readStdin` returns ''
 * immediately instead of blocking on a stream that never ends.
 */
function stdinHasPipedInput() {
  if (process.stdin.isTTY)
    return false
  try {
    const st = fstatSync(0)
    return st.isFIFO() || st.isFile()
  }
  catch {
    return false
  }
}

/** Read stdin to a trimmed string. Resolves '' immediately when nothing is piped. */
async function readStdin() {
  if (!stdinHasPipedInput())
    return ''
  /** @type {Buffer[]} */
  const chunks = []
  for await (const chunk of process.stdin)
    chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8').trim()
}

/**
 * @param {string} raw
 * @param {string} where
 * @returns {Record<string, unknown>}
 */
function parseJson(raw, where) {
  try {
    return JSON.parse(raw)
  }
  catch (err) {
    throw new UsageError(`Invalid JSON on ${where}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Parse a comma-separated CLI list flag (e.g. `--exclude widget,board`) into a
 * trimmed, de-duplicated string[]. Returns undefined when the flag is absent or empty
 * so callers can treat "not passed" and "passed empty" the same.
 * @param {string | boolean | undefined} val
 * @returns {string[] | undefined}
 */
function parseList(val) {
  if (typeof val !== 'string' || val === '')
    return undefined
  const arr = [...new Set(val.split(',').map(s => s.trim()).filter(Boolean))]
  return arr.length ? arr : undefined
}

/**
 * @param {Record<string, string | boolean>} opts
 * @param {string[]} required
 */
function requireFlags(opts, required) {
  for (const flag of required) {
    if (typeof opts[flag] !== 'string' || opts[flag] === '') {
      throw new UsageError(`Missing required --${flag}`)
    }
  }
}

/** @param {Record<string, string | boolean>} opts */
function projectParams(opts) {
  return {
    projectName: /** @type {string} */ (opts.project),
    languageCode: /** @type {string} */ (opts.language),
    subProjectName: typeof opts['sub-project'] === 'string' ? opts['sub-project'] : undefined,
    scope: typeof opts.scope === 'string' ? opts.scope : undefined,
  }
}

async function run() {
  assertRuntime()
  const { subcommand, opts } = parseArgs(process.argv.slice(2))

  switch (subcommand) {
    case 'check-auth':
      return await checkAuth()

    case 'get':
      requireFlags(opts, ['project', 'language'])
      return await getTranslations(projectParams(opts))

    case 'diff': {
      requireFlags(opts, ['project', 'language'])
      const base = projectParams(opts)
      // PR-aware gating is default-ON; `--no-gate` opts out (whole-file behavior).
      const gate = opts['no-gate'] !== true
      // A present-but-valueless `--base-ref` (parseArgs → boolean `true`, e.g.
      // `--base-ref --project`) is a usage error, not a silent auto-detect.
      if ('base-ref' in opts && typeof opts['base-ref'] !== 'string')
        throw new UsageError('--base-ref requires a <ref> value')
      const baseRef = typeof opts['base-ref'] === 'string' ? opts['base-ref'] : undefined
      // `--exclude widget,board` drops sibling-owned namespaces from the diff
      // (mirror of --scope). Comma-separated; top-level namespaces only.
      const exclude = parseList(opts.exclude)
      const cwd = process.cwd()
      if (opts['local-stdin']) {
        const raw = await readStdin()
        if (!raw)
          throw new UsageError('diff --local-stdin requires a JSON map on stdin')
        return await diffTranslations({ ...base, local: parseJson(raw, 'stdin'), exclude, gate, baseRef, cwd })
      }
      if (typeof opts['local-path'] !== 'string')
        throw new UsageError('diff requires --local-path <file> (or --local-stdin)')
      return await diffTranslations({ ...base, localPath: opts['local-path'], exclude, gate, baseRef, cwd })
    }

    case 'diff-all': {
      // Batch sibling of `diff`: same options, one process, HTTP per language run
      // concurrently. Per-language failures live in the JSON (ok/error/status); the
      // process exits 0 whenever the batch dispatched. Exit 1 is reserved for the
      // batch-level usage errors below.
      requireFlags(opts, ['project', 'languages', 'locales-dir'])
      const languages = parseList(opts.languages)
      if (!languages)
        throw new UsageError('diff-all requires a non-empty --languages list')
      const gate = opts['no-gate'] !== true
      if ('base-ref' in opts && typeof opts['base-ref'] !== 'string')
        throw new UsageError('--base-ref requires a <ref> value')
      const baseRef = typeof opts['base-ref'] === 'string' ? opts['base-ref'] : undefined
      const exclude = parseList(opts.exclude)
      const results = await diffAll({
        projectName: /** @type {string} */ (opts.project),
        languages,
        localesDir: /** @type {string} */ (opts['locales-dir']),
        subProjectName: typeof opts['sub-project'] === 'string' ? opts['sub-project'] : undefined,
        scope: typeof opts.scope === 'string' ? opts.scope : undefined,
        exclude,
        gate,
        baseRef,
        cwd: process.cwd(),
      })
      // The batch result is keyed by language, so the top-level `.then` warning check
      // (which inspects `result.gate.warning`) never fires. Emit each language's
      // fail-safe gate warning here, prefixed `[<lang>]`, to keep that loudness.
      for (const [lang, r] of Object.entries(results)) {
        const warning = /** @type {any} */ (r)?.gate?.warning
        if (typeof warning === 'string' && warning)
          process.stderr.write(`[${lang}] ${warning}\n`)
      }
      return results
    }

    case 'apply': {
      requireFlags(opts, ['project', 'language'])
      const base = projectParams(opts)
      const raw = await readStdin()
      const payload = raw ? parseJson(raw, 'stdin') : {}
      return await applyTranslations({
        ...base,
        adds: /** @type {Record<string, string> | undefined} */ (payload.adds),
        updates: /** @type {Record<string, string> | undefined} */ (payload.updates),
        deletes: /** @type {string[] | undefined} */ (payload.deletes),
        dryRun: Boolean(opts['dry-run']),
      })
    }

    case 'apply-all': {
      // Batch sibling of `apply`: stdin is a JSON object keyed by language, each value
      // the same {adds?,updates?,deletes?} payload `apply` accepts. PUTs run
      // concurrently; per-language failures live in the JSON (ok/error/status) and the
      // process exits 0 whenever the batch dispatched. Exit 1 is reserved for the
      // batch-level usage errors below (missing project / no or malformed / empty stdin).
      requireFlags(opts, ['project'])
      const raw = await readStdin()
      if (!raw)
        throw new UsageError('apply-all requires a JSON object keyed by language on stdin')
      const payload = parseJson(raw, 'stdin')
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
        throw new UsageError('apply-all stdin must be a JSON object keyed by language')
      if (Object.keys(payload).length === 0)
        throw new UsageError('apply-all stdin object is empty — nothing to apply')
      return await applyAll({
        projectName: /** @type {string} */ (opts.project),
        subProjectName: typeof opts['sub-project'] === 'string' ? opts['sub-project'] : undefined,
        dryRun: Boolean(opts['dry-run']),
        byLanguage: /** @type {Record<string, { adds?: Record<string, string>, updates?: Record<string, string>, deletes?: string[] }>} */ (payload),
      })
    }

    default:
      throw new UsageError(
        `Unknown subcommand: ${subcommand ?? '(none)'}. Expected check-auth | get | diff | diff-all | apply | apply-all.`,
      )
  }
}

run()
  .then((result) => {
    // A diff that fell back to fail-safe gating carries a warning. Surface it on
    // stderr (keeping exit 0) so CI sees the suppression even when it only reads
    // stderr; stdout JSON stays the machine contract. (Output-contract carve-out:
    // at exit 0 a gate warning MAY appear on stderr.)
    const warning = /** @type {any} */ (result)?.gate?.warning
    if (typeof warning === 'string' && warning)
      process.stderr.write(`${warning}\n`)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    process.exit(0)
  })
  .catch((err) => {
    if (err instanceof HttpError) {
      const status = err.statusCode
      process.stderr.write(`${JSON.stringify({ error: err.message, status })}\n`)
      process.exit(status === 401 ? 2 : 3)
    }
    process.stderr.write(`${JSON.stringify({ error: err instanceof Error ? err.message : String(err) })}\n`)
    process.exit(1)
  })
