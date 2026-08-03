# 2. `config-schema` emits a hand-rolled two-axis table, not envalid

- **Status:** Accepted
- **Date:** 2026-08-03

## Context

`config-schema` audits a repo's run-time configuration and emits a patch declaring every key it
reads. The obvious implementation is [envalid](https://github.com/af/envalid): it is small, it is
the source of the `devDefault` concept this whole standard is built on, and its missing-variable
behaviour — log every missing key, then exit — is exactly the Fail Fast requirement.

We are not using it. The schema is a plain-TypeScript declarative table of key descriptors, the
shape proven by hand in `hyrdrocks/nuxt-hyrd-chrysus` (`config/env.ts`, PR #3064, ~300 lines, zero
new dependencies).

The reason is that the schema carries **two axes that no validator models**, and both are load-
bearing:

- **`class`** (`static` | `secret`) is the interface between this skill and `dev-local`. The
  `class: 'secret'` entries *are* the `--key` list that `agent-native vault exec` consumes. Without
  it the two skills have no contract.
- **`scope`** (`runtime` | `build` | `tooling`) determines *how* a missing key is caught, and it is
  not decoration either. Auditing `hyrdrocks/hyrd-widget` found 13 `VITE_*` keys inlined into the
  client bundle by Vite against ~47 read via `process.env` on the Node side. A build-inlined key has
  no boot to fail at — it ships as `undefined` inside the artifact. Enforcement has to move into the
  build, which means the emitted patch is never one file: it is the table plus framework-specific
  glue (`vite.config.ts`, `nuxt.config.ts`).

Chrysus needed only `class`, because every key it reads is server-runtime. It was not a general
enough sample to settle the shape.

## Considered options

- **envalid, with a sidecar for `class` and `scope`.** Rejected: the sidecar reconstructs most of
  the table, and must then be kept in sync with the envalid schema beside it. That is a second drift
  surface, in a skill whose entire purpose is eliminating the first one.
- **Detect the target repo's existing validator and emit into it** (zod → zod, envalid → envalid,
  neither → hand-rolled). Rejected: three generators, and three ways to get the `devDefault` guard
  subtly wrong. That guard — unreachable when the build or process is production — is the single
  property that makes defaults-in-code safe, and it is not a place to carry three implementations.

## Where the drift check runs

The generated template is only worth having if something regenerates it. Chrysus proves the
failure mode: it has a `check:env-example` script and nothing anywhere runs it, because the repo has
deployment workflows and no PR workflow.

The check therefore runs **inside the bundler config hook** — the same enforcement point
Build-time Scope already requires. Every CI that builds catches drift with no CI file edited, it
works in a repo that has no PR workflow, and a developer running the dev server hits it immediately
rather than at review time. It **fails with the diff**; it never silently regenerates, because a
build that rewrites a committed file produces a tree that is correct locally and stale in git.

Rejected: a git hook (introduces hook tooling to two repos that have none, and `--no-verify` bypasses
it) and a CI step alone (does nothing for a repo with no PR workflow). A CI step may be added
*additionally* where a PR workflow already exists.

## Consequences

- The target repo owns ~300 lines of generated code with no upstream to inherit fixes from. Accepted
  deliberately: it is plain readable code a repo owner can approve without taking a dependency.
- The skill needs an explicit supported-framework list for the glue, and must **refuse** rather than
  improvise outside it. Chrysus is Nuxt 3 + Vite 6; hyrd-widget is Vue 3 + Vite 7.
- `devDefault`'s guard is per-scope, not universal: `NODE_ENV` explicitly set and not `production`
  for Run-time Scope, the bundler's build mode for Build-time Scope. See
  [the vocabulary](../../plugins/sss/skills/config-schema/references/vocabulary.md).
