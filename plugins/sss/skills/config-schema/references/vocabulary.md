# Vocabulary — run-time configuration

The shared language of `config-schema` and `dev-local`. This file is the **single owner** of these
terms. `dev-local` links here rather than restating them, because `class` and `scope` are the
contract between the two skills: `config-schema` classifies keys, `dev-local` consumes that
classification. Two definitions of a contract is the same disease as an unvalidated `.env.example`.

Originally established in `hyrdrocks/nuxt-hyrd-chrysus` (`CONTEXT.md` → "Dev environment
provisioning", ADR 0007 and ADR 0008), where the pattern was first implemented by hand. That copy
is now downstream of this one.

## The two axes

Every configuration key a repo reads has both a **class** (where the value is allowed to live) and a
**scope** (when it is resolved, and therefore how its absence can be caught). Chrysus needed only
`class`, because every key it reads is server-runtime. A client-bundled app needs both.

### Class

**Static Config**:
A configuration value identical on every developer's machine and not secret — an upstream service
URL, a model name, a timeout. Its source of truth is the committed schema, never a gitignored file.
_Avoid_: env var, setting, constant

**Local Config**:
A configuration value that legitimately differs per checkout on one machine, and is therefore
computed at run time rather than stored — the bound port, the app URL. Owned entirely by portless:
no component holds a port literal, and the URL is read from `PORTLESS_URL` or `portless get`.
_Avoid_: machine config, per-machine value, port

**Secret**:
A credential that must never be at rest in the repo, leased from the vault at run time and present
only in the spawned process's environment. A key is not a Secret merely because its name contains
`KEY` or `TOKEN` — a value compiled into a client bundle is public by construction, whatever it is
called.
_Avoid_: key, token, credential

### Scope

**Run-time Scope**:
A key read by the running server process, resolvable at boot. Its absence is caught by a boot
assertion that names every missing key at once.
_Avoid_: server config, runtime env

**Build-time Scope**:
A key inlined into an artifact by the bundler and frozen there — `import.meta.env.X` under Vite.
There is no boot at which to catch it: a missing key ships as `undefined` inside the bundle.
Enforcement must therefore move into the build, and its absence must fail the build.
_Avoid_: client config, public env, compile-time constant

**Tooling Scope**:
A key read only by scripts, tests, or CI, never by the application. Documented in the generated
template so it is discoverable, but never asserted — asserting it would make the app refuse to boot
because a test helper wanted a Jira token.
_Avoid_: dev env, script config

### Visibility — not a third axis, and not `scope`

**Visibility**:
Whether a Run-time Scope value is sent to the browser (`public`) or stays on the server
(`private`). A framework concern — Nuxt's `runtimeConfig` / `runtimeConfig.public` split — not a
property of the configuration itself.
_Avoid_: **scope** — the Chrysus reference implementation calls this `scope` in its `ALL_KEYS`
tuple, which collides head-on with Scope above. Emitted code must call it `visibility`, and the
Chrysus copy should be renamed when it is next touched.

## Enforcement

**Fail Fast**:
Missing required configuration terminates the process — at boot for Run-time Scope, at build for
Build-time Scope — in every environment. Its violation is the `|| ''` empty-string fallback, which
converts a configuration error into a per-request 502 that reads like a healthy server. In a client
bundle the same violation ships a broken artifact instead, with no error at all.
_Avoid_: validation, env check

**devDefault**:
A fallback for a Static Config value that is structurally unreachable in production, so a fresh
checkout can boot with no `.env` while a production deploy that forgets a key crashes rather than
silently inheriting a development value. Under Node the guard is `NODE_ENV` explicitly set and not
`production`. Under a bundler the guard is the build mode, evaluated when the artifact is produced.
_Avoid_: dev fallback, default — a plain `default` is exactly the thing this exists to prevent

## Bring-up

**Lease**:
One audited, all-or-nothing acquisition of a named set of Secrets for the lifetime of one spawned
command, via `agent-native vault exec`. A Lease is hygiene, not containment — anything running as
the developer can still reach the vault.
_Avoid_: fetch, injection, secret load

**Bring-up**:
Taking a fresh worktree from "just checked out" to "dev server bound, upstream proven live, auth
minted, e2e-runnable".
_Avoid_: setup, boot, start — "the dev server started" is the claim that hid the 502s

**Liveness Proof**:
One authenticated round-trip through the application's *own* API layer, returning 2xx. The only
evidence that Bring-up succeeded: a 200 on `/`, a registered portless route and a green `portless
doctor` are all compatible with a completely dead backend, because none of them crosses the proxy
layer where the 502 lives.
_Avoid_: health check, readiness, smoke test
