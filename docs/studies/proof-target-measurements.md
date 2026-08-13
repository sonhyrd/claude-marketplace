# Proof target — measurements, and the two claims that were checked

Two things live in this file:

1. A **rescued measurement study**. A prior session measured the development server against a built
   preview server on a real application, reached the trade that `#33` records, and wrote it to
   `/tmp/handoff-pw-prove-preview-target-2026-08-12.md` — a path that does not survive a reboot. Its
   numbers and findings are preserved below.
2. The **verification of the two claims** that `#33` inherited from that write-up without
   re-checking them (`#39`). Both were checked by running something, and both are recorded with the
   commands that produced them.

Nothing here is a decision. `docs/adr/` holds decisions; this file holds the evidence one of them
rests on.

---

## Part 1 — the rescued study (2026-08-12)

**Application under study:** a Nuxt 4 / Vite (Rolldown) application, multi-tenant, worktree on a
feature branch. Called *the Nuxt application* below.

### Bring-up and navigation, measured

| Target | Boot | First page | Repeat page |
|---|---|---|---|
| `pnpm dev` | binds in 1.7 s | **24.4 s** | **4.3 s** |
| built + `node .output/server/index.mjs` | 0.82 s | 14 ms | 14 ms |
| `nuxt build` | — | 2:29 warm / 3:21 cold | — |

**The honest trade, which the skill must not hide.** For a *single* run touching about five routes,
the development server is faster overall — roughly 41 s against roughly 150 s, because the preview
must be built first. The preview wins on **recording quality**, and (added by `#33`) on the
session-level total once the serialised-worker mandate and the warm lead are removed with it. Where
a run's output is diagnostic evidence rather than a watched artifact, the development server was
never the wrong answer.

**Root cause of the development server's cost, for context: not Vite.** The application is already
on Rolldown (vite 8.2.1 → rolldown 1.2.3). About 98 % of client build time is inside JS plugin
hooks — roughly 4,881 modules × roughly 8 per-module transforms. No configuration removes it.

### The auto-login blocker

`?token=` auto-login is **dead-code-eliminated from production builds**: the composable guards it
with `import.meta.dev`, a build-time constant replaced with `false` by `nuxt build`. Against a
preview server the parameter is never read *and never stripped*, so a helper that waits for it to
disappear hangs its full 60 s and then fails.

What still works against a preview:

- The bearer is portable — it is minted against the upstream API, not against the local port, and
  the stored session file holds a plain upstream JWT that is not origin-bound.
- The application's development API routes ship in the production output, so Node-side API helpers
  work.
- Only *browser* auto-login breaks.

The chosen workaround is to seed **both** the credential and the user record into client storage via
`addInitScript`. Seeding the credential alone yields a blank authenticated shell — a failure mode the
application's own test helper already documents.

Explicitly **rejected**: replacing the `import.meta.dev` guard with a runtime flag. That would put
"accept an arbitrary bearer from a URL parameter" into production bundles. It should not be
revisited for filming convenience.

### Generalisable versus application-specific

Generalisable — belongs in the skill:

- The proof target as a concept; selected explicitly, never sniffed.
- The agent owns the server lifecycle.
- Free-port allocation and worktree fingerprinting. A sibling worktree was observed serving its own
  preview during that session — a live collision, not a hypothetical one.
- Rebuild unconditionally before a filming run, after the mandated base merge. The skill never told
  anyone to rebuild, which is a real gap for any prebuilt target.
- A full-green-run gate: because targets authenticate differently, a spec can pass against a
  development server and fail against a preview.
- Do not delegate startup to `webServer` (`docs/adr/0011`, and Part 2 below).

Application-specific — must stay pluggable, never hard-coded:

- The `import.meta.dev` auto-login guard and the client-storage seeding shape.
- Required environment for a production boot. That application fails fast on two upstream URL keys
  because `NODE_ENV=production` makes their development defaults unreachable — by design. The values
  are committed static configuration, not secrets, so no vault lease is involved.
- The multi-tenant subdomain scheme.
- Client storage is **origin-scoped**. Running the preview on the *same origin* the specs already
  use — swapping which server holds the port — carries the session over; two co-resident servers on
  different ports would need re-seeding per origin.

### Machinery that exists only to absorb development-server cost

Harmless against a preview, but pointless: the browser warm lead (`docs/adr/0013`), `--workers=1`
(`docs/adr/0010`), and the 90-second readiness budget. `#33` removes them, staged.

### Also established, and worth not re-deriving

- An `experimental.buildCache` run was tried and **reverted**: 3× on unchanged source, useless once
  source changed, so it does not help real deploys. Do not re-propose it without reading that
  finding. (`#33` records the same rejection.)

---

## Part 2 — the two inherited claims, verified (`#39`, 2026-08-13)

### Claim 1 — the committed proof config inherits the project's development-server command

**Verdict: CONFIRMED**, and it is worse than a latent risk in one of the two sampled applications.

The template in `skills/pw-prove/SKILL.md` (and both committed copies found in the sample) is:

```ts
export default defineConfig({
  ...base,
  use: { ...(base.use ?? {}), video: { mode: 'on', size }, trace: 'on' },
})
```

`...base` copies every top-level key, `webServer` among them; only `use` is overridden. Read
statically that is obvious, so it was checked by running it instead — a fixture whose project config
declares a `webServer.command` that writes a marker file before listening:

```
npx playwright test --config playwright.proof.config.ts   # the template, spreading the project config
→ 1 passed, and DEV-SERVER-STARTED.marker exists
```

The command ran. Both sampled applications carry a committed proof config with exactly this shape,
and both project configs declare a development-server `webServer.command`.

**When it actually bites.** `webServer` also carries `reuseExistingServer`, and both sampled configs
set it to `!process.env.CI`. The full matrix, all four measured on the fixture:

| Situation | What happens |
|---|---|
| Nothing listening at `webServer.url` | **The development server boots.** The whole change is defeated, silently. |
| The agent's preview is listening at `webServer.url`, `CI` unset | Reused. The command does not run. |
| The agent's preview is listening, `CI=1` | **Hard error** — `http://…:4399 is already used…`. The proof run dies before any test. |
| The agent's preview is on a different origin than `webServer.url` (a shifted port, or the `127.0.0.1` versus `[::1]` mismatch of `docs/adr/0011`) | Nothing is listening *at that URL*, so the first row applies: the development server boots. |

So the inheritance is not merely theoretical, and "it usually gets reused" is not a defence: the two
cases where reuse does not save the run — a shifted port and a loopback-family mismatch — are
precisely the port-discovery failures `#33` already counts among its eight readiness failures.

**Remedy (the fix belongs to the bring-up ticket, not here).** Setting `webServer: undefined` in the
proof config after the spread suppresses the inherited command while leaving everything else
inherited. Measured on the same fixture, with an agent-owned server already on the port:

```
npx playwright test --config playwright.proof.remedy.config.ts
→ 1 passed; PREVIEW-SERVER-STARTED.marker exists, DEV-SERVER-STARTED.marker does not
```

Two notes for whoever implements it. First, this is an edit to the committed proof config, which
`docs/adr/0008` freezes as a static artifact — so it is a **one-time, committed migration** of the
template plus any config already in a repository, not a per-run edit, and it needs saying in 0008's
terms. Second, `webServer: undefined` also removes Playwright's own readiness wait, which is correct
only because the agent owns the lifecycle and `preflight.mjs` already gates readiness; it is not
correct if any run is ever expected to bring its own server up.

### Claim 2 — the second sampled application's preview path has never been exercised

**Verdict: the path works.** It was run, end to end, not read.

The application is a Vite / Vike SSR widget. Its build-and-serve scripts are
`build:start-ssr:staging` and `serve:start-ssr:staging`. Measured on this machine, 8 cores, load
average 0.77:

| Step | Result |
|---|---|
| `pnpm run build:start-ssr:staging` | **exit 0 in 63 s** (client + server + precompression) |
| serve, then first request | listening in **under 1 s**, binds `::` (dual-stack — no loopback-family trap) |
| first page `/chat/embed/start` | **210 ms** |
| repeat page | **50 ms** |
| a real browser load (`probe.mjs warm`) | **200 in 2,072 ms**, cold process included |
| the page itself | full SSR render — tenant logo, 242 job listings, map tiles, translations |
| a real spec against it (`start-palette-layout.spec.ts`) | **5 passed, 2 failed in 22.4 s** |
| the same spec against the development server, as a control | **5 passed, 2 failed in 21.7 s** — *identical* |

The two failures are pre-existing spec drift, not preview-induced: the control run reproduces them
exactly. Likewise the two non-2xx calls the page makes (a guest-mint `403` and an aborted
design-service fetch) appear on the development server too.

One number is worth carrying into `#33`: for the same page, the preview requested **28**
asset/script endpoints against the development server's **256**. That is the unbundled module graph
`#33` describes, counted.

**Blockers found, specific enough to schedule:**

1. **`serve:start-ssr:staging` hard-codes `PORT=4100`.** Run verbatim it died with `EADDRINUSE` on
   `::4100`, because a co-resident `dev:start-ssr:staging` from another session already held it —
   the same collision the rescued study saw between worktrees. `PORT` is read from the environment,
   so `PORT=<free> node build/start-ssr/server/index.mjs` works and is what every measurement above
   used. Bring-up must allocate the port itself rather than invoke the packaged script.
2. **The page is tenant-resolved by query parameter**, not by host. Without `?company_slug=<slug>`
   the API returns `403` three times and the page renders an empty shell that still answers `200`.
   A readiness probe that only checks the status code would call that healthy. Recon must carry the
   tenant parameter.
3. **The application's own documented run instruction for one suite does not work.** Its header says
   to run it with a caller-owned server, but the path sits in an unconditional `testIgnore` entry,
   and `playwright test <that path>` answers `No tests found` — a hard `testIgnore` cannot be
   overridden from the command line. Not a preview problem; it is why the parity control above uses
   a differently gated suite. Worth reporting to that application's owners.

**What "never exercised" turned out to mean.** The build directory carried artifacts dated eight
days before this check, so *something* had built it once; no observed session ever served and drove
it. The claim was right about the proof path, and the risk it named — that the scripts might simply
not work — is now closed.

### How to re-run any of this

The claim-1 fixture is four files (a project config with a marker-writing `webServer.command`, the
proof-config template, a one-line spec, and a stub server) and takes about five seconds to
reproduce; it deliberately lives outside the repository, because this repository carries no
Playwright. The claim-2 numbers are `pnpm run build:start-ssr:staging`, then
`PORT=<free> node build/start-ssr/server/index.mjs`, then `curl` and
`node skills/pw-prove/scripts/probe.mjs warm <url>`.
