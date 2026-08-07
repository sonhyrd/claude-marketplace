// PR-aware changeset layer for the `diff` command. Dependency-free: shells out to
// `git` via node:child_process (a subprocess, NOT an npm dependency). Everything
// here is a local git read + pure functions — the wire `sync-diff` request is never
// touched. When the git base can't be resolved, the consumer (diffTranslations)
// catches BaseRefUnresolvable and degrades to a safe adds-only diff.
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

/**
 * Thrown when the git base ref / changeset can't be resolved (no git repo, git not
 * on PATH, no default branch, shallow clone missing the merge-base, a mis-resolved
 * path, or a malformed base blob). The diff command catches this and falls back to
 * a fail-safe adds-only gate — never a silent whole-file delete.
 */
export class BaseRefUnresolvable extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'BaseRefUnresolvable'
  }
}

/**
 * Run a git subprocess; returns `{ ok, stdout }` and never throws, so callers branch
 * on absence vs failure without try/catch noise. `execFileSync` (not `exec`) avoids
 * shell quoting/injection on branch & path names.
 *
 * `maxBuffer` is set explicitly: the 1 MB default is smaller than a real locale file.
 * `git show <base>:<locale>.json` on a multi-MB blob would exceed it and throw, and
 * the caller (computeChangeset) reads a failed `show` on a path that DOES exist at
 * base as a mis-resolved path -- fail-safe adds-only, reported as
 * "path-resolution failure". Safe direction, wrong reason, and it would arrive as a
 * function of file size on a repo whose locale files only grow.
 * @param {string[]} args
 * @param {string} cwd
 * @returns {{ ok: boolean, stdout: string }}
 */
function gitTry(args, cwd) {
  try {
    return { ok: true, stdout: execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 }).trim() }
  }
  catch {
    return { ok: false, stdout: '' }
  }
}

/**
 * Flatten a nested locale object to dot-notation leaf keys.
 *
 * BYTE-FOR-BYTE PORT of the server's `flattenTranslations`
 * (`server/utils/translationSyncDiff.ts:42-75`) — the function that produces the
 * keys carried by the `sync-diff` response. The gate compares its `changed`/`removed`
 * sets against those exact keys, so any divergence here would make a branch-touched
 * key fail the membership test and silently drop its legit update/delete. The
 * server↔CLI parity test pins this. Divergences that MUST be preserved:
 *   - a bare top-level STRING `{ foo: "x" }` → `{ "default.foo": "x" }`
 *     (PUT routes a dot-less key to context "default"; we normalize to match)
 *   - `null` / number / boolean leaves are SKIPPED (never become keys) — NOT coerced
 *   - arrays recurse as objects (`typeof [] === 'object'`) → `a.0`, `a.1`
 * Real data is exactly 2-level; the deeper recursion is a defensive guard.
 * @param {Record<string, unknown> | null | undefined} input
 * @returns {Record<string, string>}
 */
export function flattenTranslations(input) {
  /** @type {Record<string, string>} */
  const out = {}
  if (!input || typeof input !== 'object')
    return out

  for (const [key, value] of Object.entries(input)) {
    if (value == null)
      continue

    if (typeof value === 'string') {
      // Top-level string = no namespace → server stores it under "default".
      out[`default.${key}`] = value
      continue
    }

    if (typeof value === 'object') {
      flattenInto(out, /** @type {Record<string, unknown>} */ (value), key)
    }
  }

  return out
}

/**
 * @param {Record<string, string>} out
 * @param {Record<string, unknown>} obj
 * @param {string} prefix
 */
function flattenInto(out, obj, prefix) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null)
      continue
    const path = `${prefix}.${k}`
    if (typeof v === 'string')
      out[path] = v
    else if (typeof v === 'object')
      flattenInto(out, /** @type {Record<string, unknown>} */ (v), path)
  }
}

/**
 * Resolve the git working-tree root for `cwd`. Throws {@link BaseRefUnresolvable}
 * when `cwd` is not inside a git repo (or git is not on PATH).
 * @param {string} cwd
 * @returns {string}
 */
export function resolveGitRoot(cwd) {
  const r = gitTry(['rev-parse', '--show-toplevel'], cwd)
  if (!r.ok || !r.stdout)
    throw new BaseRefUnresolvable('not a git repository (or git is not on PATH)')
  return r.stdout
}

/**
 * Resolve the BEFORE commit to diff against.
 * - `baseRefOverride` (CLI `--base-ref`, e.g. a CI PR-target SHA) → resolved via
 *   `rev-parse <ref>^{commit}`.
 * - else auto-detect the default branch, PREFERRING the remote-tracking ref
 *   (`origin/HEAD` → `origin/development`); the bare local `development`/`main`
 *   are used only when the corresponding remote ref is absent. The resolved ref is
 *   used verbatim in `git merge-base <ref> HEAD`.
 * @param {{ cwd: string, baseRefOverride?: string }} input
 * @returns {{ baseRef: string, baseSha: string }}
 */
export function resolveBaseRef({ cwd, baseRefOverride }) {
  if (baseRefOverride) {
    const r = gitTry(['rev-parse', '--verify', '--quiet', `${baseRefOverride}^{commit}`], cwd)
    if (!r.ok || !r.stdout)
      throw new BaseRefUnresolvable(`--base-ref "${baseRefOverride}" did not resolve to a commit`)
    return { baseRef: baseRefOverride, baseSha: r.stdout }
  }

  /** @type {string | undefined} */
  let defaultRef
  const head = gitTry(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], cwd)
  if (head.ok && head.stdout)
    defaultRef = head.stdout.replace(/^refs\/remotes\//, '') // e.g. origin/development

  if (!defaultRef) {
    for (const cand of ['origin/development', 'origin/main', 'development', 'main']) {
      const v = gitTry(['rev-parse', '--verify', '--quiet', cand], cwd)
      if (v.ok && v.stdout) {
        defaultRef = cand
        break
      }
    }
  }

  if (!defaultRef)
    throw new BaseRefUnresolvable('could not detect a default branch (origin/HEAD, development, main all absent)')

  const mb = gitTry(['merge-base', defaultRef, 'HEAD'], cwd)
  if (!mb.ok || !mb.stdout)
    throw new BaseRefUnresolvable(`git merge-base ${defaultRef} HEAD failed (shallow clone or unrelated history?)`)

  return { baseRef: defaultRef, baseSha: mb.stdout }
}

/**
 * Map a working-tree path to a repo-root-relative POSIX path for `git show <sha>:<path>`.
 * Monorepo-safe: `cwd` may be a sub-directory of the repo, so the path is taken
 * relative to the git root, not `cwd`, and normalized to forward slashes (git
 * pathspecs are always `/`-separated).
 * @param {string} gitRoot
 * @param {string} localeAbsPath
 * @returns {string}
 */
export function repoRelPath(gitRoot, localeAbsPath) {
  const abs = isAbsolute(localeAbsPath) ? localeAbsPath : resolve(gitRoot, localeAbsPath)
  // `git rev-parse --show-toplevel` canonicalizes symlinks (e.g. macOS /tmp →
  // /private/tmp); canonicalize the locale path the same way so `relative` yields a
  // clean repo-relative path instead of a spurious `../…` traversal that would look
  // like a mis-resolved path and trip the fail-safe.
  return relative(safeRealpath(gitRoot), safeRealpath(abs)).split(sep).join('/')
}

/**
 * `realpathSync` that returns the input unchanged when the path can't be resolved
 * (e.g. it doesn't exist) — best-effort canonicalization, never throws.
 * @param {string} p
 * @returns {string}
 */
function safeRealpath(p) {
  try {
    return realpathSync(p)
  }
  catch {
    return p
  }
}

/**
 * Compute the per-language changeset THIS branch actually made: the keys it
 * added/modified (`changed`) and the keys it removed (`removed`), both in the
 * server's dot-notation key space (via {@link flattenTranslations}).
 *
 * BEFORE snapshot is read straight from the git object DB (`git show <baseSha>:<path>`)
 * — no checkout, no working-tree mutation. A failed `git show` is disambiguated with
 * `git ls-tree`: an EMPTY listing means the file genuinely did not exist at base
 * (a new file on this branch → `flatBase = {}`, which is correct: every key is the
 * branch's to add, and nothing can be "removed"); a NON-EMPTY listing means the path
 * exists but couldn't be read (mis-resolved path / unreadable blob) → fail-safe.
 * A present-but-malformed base blob also fails safe (never a silent `{}`).
 * @param {{ cwd: string, repoRel: string, baseSha: string, headObj: Record<string, unknown> }} input
 * @returns {{ changed: Set<string>, removed: Set<string> }}
 */
export function computeChangeset({ cwd, repoRel, baseSha, headObj }) {
  const show = gitTry(['show', `${baseSha}:${repoRel}`], cwd)

  /** @type {Record<string, string>} */
  let flatBase
  if (show.ok) {
    try {
      flatBase = flattenTranslations(JSON.parse(show.stdout))
    }
    catch {
      throw new BaseRefUnresolvable(`base blob ${repoRel}@${baseSha.slice(0, 8)} is not valid JSON`)
    }
  }
  else {
    // Distinguish "absent at base" (correct → {}) from "present but unreadable" (fail-safe).
    const ls = gitTry(['ls-tree', baseSha, '--', repoRel], cwd)
    if (ls.ok && ls.stdout === '')
      flatBase = {} // genuinely absent at base → a new file on this branch
    else
      throw new BaseRefUnresolvable(`could not read "${repoRel}" at base ${baseSha.slice(0, 8)} (path-resolution failure)`)
  }

  const flatHead = flattenTranslations(headObj)

  /** @type {Set<string>} */
  const changed = new Set()
  for (const [k, v] of Object.entries(flatHead)) {
    if (flatBase[k] !== v) // added (absent in base) or modified
      changed.add(k)
  }

  /** @type {Set<string>} */
  const removed = new Set()
  for (const k of Object.keys(flatBase)) {
    if (!(k in flatHead))
      removed.add(k)
  }

  return { changed, removed }
}

/**
 * One-shot orchestrator: resolve git root + base ref + changeset for a locale file.
 * Throws {@link BaseRefUnresolvable} at the first unresolvable step; `gitRoot` is
 * returned even on later failure via the thrown error's `.gitRoot` when available.
 * @param {{ cwd: string, localeAbsPath: string, headObj: Record<string, unknown>, baseRefOverride?: string }} input
 * @returns {{ gitRoot: string, baseRef: string, baseSha: string, changed: Set<string>, removed: Set<string> }}
 */
export function computeGate({ cwd, localeAbsPath, headObj, baseRefOverride }) {
  const gitRoot = resolveGitRoot(cwd)
  const { baseRef, baseSha } = resolveBaseRef({ cwd, baseRefOverride })
  const repoRel = repoRelPath(gitRoot, localeAbsPath)
  const { changed, removed } = computeChangeset({ cwd, repoRel, baseSha, headObj })
  return { gitRoot, baseRef, baseSha, changed, removed }
}
