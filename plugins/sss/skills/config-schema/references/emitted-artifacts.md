# Emitted artifacts

The four things `config-schema` writes, and why each is shaped that way. Every shape here is taken
from the working implementation in `hyrdrocks/nuxt-hyrd-chrysus` (PR #3064) — it boots, it has
caught real drift, and it added no dependency. Adapt it to the target repo; do not redesign it.

Terms are defined in [vocabulary.md](./vocabulary.md).

## Contents

- [1. The schema](#1-the-schema)
- [2. The template generator](#2-the-template-generator)
- [3. The run-time assertion](#3-the-run-time-assertion)
- [4. The build-time assertion and drift check](#4-the-build-time-assertion-and-drift-check)
- [Sizing](#sizing)

## 1. The schema

One module — `config/env.ts` or equivalent — that is the **single** declaration. Nothing else in the
repo may read `process.env` for a declared key.

```ts
export type ConfigClass = 'static' | 'secret'
export type ConfigScope = 'runtime' | 'build' | 'tooling'

export interface ConfigKey {
  /** The environment variable read, and the name the template documents. */
  readonly env: string
  /**
   * Legacy variables consulted in order *before* `env`, to preserve precedence that shipped
   * before the schema existed. Deliberately undocumented in the template; never add new ones.
   */
  readonly overrideEnvs?: readonly string[]
  readonly class: ConfigClass
  /** A key may be read at more than one scope — client and SSR server, for example. */
  readonly scope: readonly ConfigScope[]
  /** Whether the value reaches the browser. Framework concern; never call this `scope`. */
  readonly visibility?: 'public' | 'private'
  /** When true, absence stops the process at boot or the artifact at build. */
  readonly required: boolean
  /** Used only when the build or process is explicitly non-production. */
  readonly devDefault?: string
  /** Used in every environment, production included. Only for genuinely universal values. */
  readonly default?: string
  readonly description: string
}
```

The resolver is the load-bearing part, and the order matters:

```ts
export function devDefaultsApply(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv != null && nodeEnv !== '' && nodeEnv !== 'production'
}

export function resolve(key: ConfigKey, env = process.env): string | undefined {
  for (const name of key.overrideEnvs ?? []) {
    const override = env[name]
    if (override != null && override !== '') return override
  }
  const fromEnv = env[key.env]
  if (fromEnv != null && fromEnv !== '') return fromEnv
  if (key.default != null) return key.default
  if (key.devDefault != null && devDefaultsApply(env.NODE_ENV)) return key.devDefault
  return undefined
}
```

Three properties to preserve exactly:

- **Returns `undefined`, never `''`.** An empty string later reads as "configured". This one line is
  the whole `|| ''` ban made structural.
- **An unset `NODE_ENV` gets no development value.** Not a bug. An agent shell invoking a command
  directly, without the dev command setting `NODE_ENV`, must fail loudly rather than boot on a
  configuration it did not choose.
- **`default` is checked before `devDefault`.** `default` applies everywhere; `devDefault` cannot.

For a bundler, `devDefaultsApply` takes the build mode instead of `NODE_ENV`. Same rule, different
input: unreachable when the artifact is a production artifact.

## 2. The template generator

A script that writes `.env.example` from the schema, plus a `--check` mode that regenerates in memory
and **fails with the diff** if the committed file differs.

Generated, never hand-edited — this is what makes drift structurally impossible rather than merely
discouraged. Chrysus's `.env.example` had rotted to 21 dead keys and 11 undocumented live ones
precisely because it was hand-maintained.

Emit **every** key including Tooling Scope, so the template is discoverable. Emit Secret keys with
empty values and a comment naming where the value comes from — never a value, never a placeholder
that looks like one.

If the target repo runs Node ≥ 22.6 the script can import the TypeScript schema directly, since Node
strips erasable-syntax-only TypeScript natively. **Check the repo's Node major before relying on
this** — below it, the script needs a loader or the schema needs a plain-JS twin.

## 3. The run-time assertion

A boot hook — a Nitro plugin, a server entry, whatever runs first — that asserts required Run-time
Scope keys and **throws naming every missing key at once**:

```
Missing required configuration:
  - NUXT_API_BASE_URL
  - NUXT_PAUL_API_BASE_URL

These are declared in config/env.ts. In development they normally come from their
devDefault, which applies only when NODE_ENV is explicitly set and is not
"production" — NODE_ENV is currently undefined.
```

Two requirements:

- **All of them, in one pass.** A misconfigured environment gets fixed in one edit, not one boot per
  key.
- **Assert the *resolved* config, not `process.env`.** A production container supplying config
  purely through the environment, or a framework applying its own `NUXT_*` overrides, is then checked
  exactly as a dev machine is.

Never assert Tooling Scope keys here. Refusing to boot the app because a test helper wanted a Jira
token is a worse bug than the one being fixed.

## 4. The build-time assertion and drift check

Both go in the bundler config hook (`vite.config.ts`'s `config`, or `nuxt.config.ts`), which runs
before any bundling and before the dev server starts:

1. Assert required Build-time Scope keys — a missing one **fails the build**, because there is no
   boot at which to catch it and `undefined` would otherwise be inlined into the shipped artifact.
2. Run the template `--check`. Fail with the diff; **never** regenerate silently — a build that
   rewrites a committed file leaves a tree that is correct locally and stale in git.

This placement is deliberate. A git hook needs tooling the target repos do not have and is bypassed
by `--no-verify`; a CI step does nothing in a repo whose only workflows are deployments — which is
exactly why Chrysus's `check:env-example` script exists and has never once run.

## Sizing

Chrysus's schema is ~305 lines for ~35 keys, and that is proportionate. Right-size to the target:
the schema is a table, so it grows with the key count, but the resolver, generator and assertions are
fixed and small. If the emitted code is much larger than the table plus ~120 lines of machinery,
something is being over-built.
