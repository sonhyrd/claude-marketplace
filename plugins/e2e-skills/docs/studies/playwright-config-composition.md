# Playwright config composition and `webServer` — what the primary sources actually say

This file answers one question with primary sources only: **how does Playwright itself say a second
config should be derived from a project's config, and what does it say about that second config
controlling server bring-up?** It exists because `skills/pw-prove/SKILL.md` mandates
`webServer: undefined` in the committed proof config unconditionally (`docs/adr/0008`, amended by
`docs/adr/0016`), and `#107` reports that the mandate is wrong when the inherited `webServer` is what
builds and boots the target under proof.

Nothing here is a decision. `docs/adr/` holds decisions; this file holds what Playwright documents
and implements, so a rule can be checked against it.

## Sources and how they are cited

Two kinds of primary source, and no others:

- **Documentation** — `playwright.dev`, plus the Markdown it is generated from in
  `microsoft/playwright` under `docs/src/`. Cited by URL.
- **Implementation** — the Playwright source on GitHub, pinned to commit
  [`c377b7f4`](https://github.com/microsoft/playwright/commit/c377b7f47b00d41f4639b99b66ef62a458529f46)
  (`main`, read 2026-08-19), and the type definitions. Cited as `path:line`, with the permalink form
  `https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/<path>#L<line>`.

Corroborated against a released build where the wording differed: **Playwright 1.61.1**, read at
`/home/orca/work/nuxt-hyrd-chrysus/node_modules/playwright/` (this repository carries no Playwright
of its own). Where `main` and 1.61.1 differ the difference is called out; the `webServer` logic is
identical between them.

No blog posts, no Stack Overflow, no tutorials. Where a claim in this repository's own documents
could only be traced to a secondary source, it was dropped rather than repeated.

---

## 1 — `testConfig.webServer`, the full documented contract

The property is `TestConfig.webServer`, `since: v1.10`, typed
`?<[Object]|[Array]<[Object]>>` — a single entry or an array of entries
([`docs/src/test-api/class-testconfig.md`, property TestConfig.webServer](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/docs/src/test-api/class-testconfig.md#L714),
rendered at <https://playwright.dev/docs/api/class-testconfig#test-config-web-server>). The TypeScript
form is `webServer?: TestConfigWebServer | TestConfigWebServer[]`
(`packages/playwright/types/test.d.ts`, 1.61.1 line 1043).

Every field, documented verbatim at that URL:

| Field | Documented contract | Version added |
|---|---|---|
| `command` | "Shell command to start. For example `npm run start`." Required. | 1.14 (announced) |
| `url` | "The url on your http server that is expected to return a 2xx, 3xx, 400, 401, 402, or 403 status code when the server is ready to accept connections. Redirects (3xx status codes) are being followed and the new location is checked. Either `port` or `url` should be specified." | 1.19 (`url` option) |
| `port` | "The port that your http server is expected to appear on. It does wait until it accepts connections." The guide additionally marks it **"Deprecated. Use `url` instead."** | 1.14 |
| `reuseExistingServer` | "If true, it will re-use an existing server on the `port` or `url` when available. If no server is running on that `port` or `url`, it will run the command to start a new server. If `false`, it will throw if an existing process is listening on the `port` or `url`." | 1.14 |
| `timeout` | "How long to wait for the process to start up and be available in milliseconds. Defaults to 60000." | 1.14 |
| `stdout` | `"pipe"` pipes to the parent's stdout, `"ignore"` drops it. **Defaults to `"ignore"`.** | 1.34 |
| `stderr` | `"pipe"` or `"ignore"`. **Defaults to `"pipe"`.** | 1.34 |
| `cwd` | "Current working directory of the spawned process, defaults to the directory of the configuration file." | 1.14 |
| `env` | "Environment variables to set for the command, `process.env` by default." | 1.14 |
| `gracefulShutdown` | "If unspecified, the process group is forcefully `SIGKILL`ed." `{ signal: 'SIGTERM' \| 'SIGINT', timeout }` sends the signal to the process group, then `SIGKILL` after `timeout`; `0` means no `SIGKILL`. Ignored on Windows. | 1.50 |
| `ignoreHTTPSErrors` | "Whether to ignore HTTPS errors when fetching the `url`. Defaults to `false`." | — |
| `name` | "Specifies a custom name for the web server. This name will be prefixed to log messages. Defaults to `[WebServer]`." | — |
| `wait` | `{ stdout?: RegExp, stderr?: RegExp }` — "Consider command started only when given output has been produced." Named capture groups are written to `process.env` upper-cased. | 1.57 |

Version attributions come from the release notes
(<https://playwright.dev/docs/release-notes>, source
[`docs/src/release-notes-js.md`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/docs/src/release-notes-js.md)):
arrays of entries are the **1.24** headline "🌍 Multiple Web Servers in `playwright.config.ts`";
`stdout`/`stderr` land in 1.34; `gracefulShutdown` in 1.50; `wait` in 1.57; the `url` option in 1.19.
`ignoreHTTPSErrors` and `name` have no release-note entry, so no version is claimed for them here.

Two contract details the tables above do not carry, both from the guide page
<https://playwright.dev/docs/test-webserver>:

- "If both `url` and `wait` are specified, the server is considered started when at least one of the
  conditions is met."
- The guide's `env` row claims the command inherits `process.env` "with `PLAYWRIGHT_TEST=1` added".
  **The source does not do that.** The injected defaults are exactly
  `BROWSER=none`, `FORCE_COLOR=1`, `DEBUG_COLORS=1`
  ([`webServerPlugin.ts:48`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/playwright/src/plugins/webServerPlugin.ts#L48)),
  merged as `{...defaults, ...process.env, ...options.env}` (`webServerPlugin.ts:110-115`). Same in
  1.61.1. Do not build a rule on `PLAYWRIGHT_TEST` being set for a `webServer` command.

### What `reuseExistingServer: true` actually checks

It checks nothing itself. The availability probe runs **unconditionally**, before the flag is
consulted, and `reuseExistingServer` only decides what to do with the answer
([`webServerPlugin.ts:96-103`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/playwright/src/plugins/webServerPlugin.ts#L96)):

```ts
const isAlreadyAvailable = await this._isAvailableCallback?.();
if (isAlreadyAvailable) {
  if (this._options.reuseExistingServer)
    return;                      // skip the command entirely
  throw new Error(`${...} is already used, make sure that nothing is running on the port/url or set reuseExistingServer:true in config.webServer.`);
}
```

So there are three outcomes, not two: **available + reuse** → command never runs; **available +
no reuse** → hard error before any test; **not available** → the command runs, whatever the flag says.

Which probe runs depends on which of `url`/`port` was given
([`webServerPlugin.ts:250-256`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/playwright/src/plugins/webServerPlugin.ts#L250)) —
and giving both is a hard error, `Either 'port' or 'url' should be specified in config.webServer.`
(`webServerPlugin.ts:267`).

**`url` form — an HTTP GET, and it is a status-range test, not "any response".**
[`packages/utils/network.ts:255-263`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/utils/network.ts#L255):

```ts
let statusCode = await httpStatusCode(url, ignoreHTTPSErrors, onLog, onStdErr);
if (statusCode === 404 && url.pathname === '/') {
  const indexUrl = new URL(url);
  indexUrl.pathname = '/index.html';
  statusCode = await httpStatusCode(indexUrl, ignoreHTTPSErrors, onLog, onStdErr);
}
return statusCode >= 200 && statusCode < 404;
```

Consequences worth stating plainly, because they decide whether a run reuses a server or boots one:

- `200`–`403` counts as *already running* — including `400`, `401`, `402`, `403`. An app that
  answers `401` at its root because nobody is authenticated **is** "available".
- `404` at any path other than `/` is **not** available; `404` at `/` gets one retry at
  `/index.html` before being judged.
- `5xx` is **not** available. A preview server behind a proxy answering `502` reads as "no server",
  and the command runs.
- A transport error (connection refused, DNS failure, TLS rejection) resolves the status to `0`
  (`network.ts:281`), so: not available.
- 3xx redirects are followed and the *final* status is what is tested
  ([`network.ts:74-81`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/utils/network.ts#L74)).
- This widening is a documented breaking change of **1.23**: "WebServer is now considered 'ready' if
  request to the specified url has any of the following HTTP status codes: `200-299`, `300-399`
  (new), `400`, `401`, `402`, `403` (new)."

**`port` form — a raw TCP connect, tried on both loopback families.**
[`webServerPlugin.ts:213-236`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/playwright/src/plugins/webServerPlugin.ts#L213)
opens `net.connect(port, host)` for `'127.0.0.1'` **and** `'::1'` in parallel and resolves true if
either connects. No HTTP is spoken; anything holding the port counts. That is the documented
sentence "If the port is specified, Playwright Test will wait for it to be available on `127.0.0.1`
or `::1`".

### The loopback-family question, answered from source

This is the part that bears directly on a url-comparison rule, and the answer is **not** "a url is
family-blind".

- **`port` form: family-agnostic by construction.** Both `127.0.0.1` and `::1` are probed
  (`webServerPlugin.ts:233-234`). A server bound to either family is found.
- **`url` form: whatever the hostname resolves to, resolved deliberately across both families.**
  Playwright's own HTTP client passes a custom `lookup` plus Node's `autoSelectFamily`
  ([`network.ts:163-196`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/utils/network.ts#L163)),
  and the comment above it names exactly the failure this repository has been designing against:

  > Node.js family-agnostic lookup passes `AI_ADDRCONFIG` to `getaddrinfo()`, which can filter out
  > addresses of a family that has no non-loopback interface, and "localhost" may miss addresses of a
  > family that is not listed in `/etc/hosts` — e.g. resolving to only `127.0.0.1` even though `::1`
  > is served. Separate `family: 4` and `family: 6` lookups do not have these problems. Native Happy
  > Eyeballs (`autoSelectFamily`) then races connection attempts across the families.

  So `url: 'http://localhost:4000'` reaches a server bound to `::1` *or* `127.0.0.1`; the lookup
  interleaves IPv6 and IPv4 addresses per RFC 8305 and races the connections. 1.61.1 implements the
  same intent with its own staggered racing loop (`playwright-core/lib/coreBundle.js:7966-8037`,
  300 ms between attempts).
- **A url naming a literal address is the family-sensitive case, and only that case.**
  `http://127.0.0.1:4000` resolves to one IPv4 address; a server bound only to `::1` is unreachable
  through it, and Playwright concludes no server is running and launches the command. The mirror case
  (`http://[::1]:4000` against an IPv4-only bind) behaves the same way.

That distinction sharpens `docs/adr/0011`. The observed failure — scaffolded
`webServer.url` of `http://127.0.0.1:4000` against a server on `[::1]`, Playwright booting a
duplicate — is real and reproduced by this source reading, but it is a property of the **literal IP
in the url string**, not of urls in general. The same config with `localhost` in the url would have
reused the server. A rule that compares config origin against served origin as *strings* is
therefore conservative in the right direction (it never wrongly says "reachable"), but it will report
a mismatch for `localhost` urls that Playwright would have resolved fine. Curling the literal string
remains the honest check, because it tests reachability rather than spelling — with the caveat that
`curl`'s resolver is not Playwright's, and only the `port` form is guaranteed dual-family by
Playwright's own code.

---

## 2 — Is `webServer: undefined` a documented way to suppress an inherited `webServer`?

**No. It is undocumented — but it is correct, for the single-argument `defineConfig` form only.**

The type is optional (`webServer?: TestConfigWebServer | TestConfigWebServer[]`,
`packages/playwright/types/test.d.ts` 1.61.1 line 1043), so `undefined` type-checks.

At runtime, nothing distinguishes "key present with value `undefined`" from "key absent" on this
path. The config loader reads it through `takeFirst`, which skips `undefined` explicitly
([`packages/playwright/src/util.ts:378-384`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/playwright/src/util.ts#L378)):

```ts
export function takeFirst<T>(...args: (T | undefined)[]): T {
  for (const arg of args) {
    if (arg !== undefined)
      return arg;
  }
  return undefined as any as T;
}
```

and the `webServer` normalisation is
[`packages/playwright/src/common/config.ts:120-130`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/playwright/src/common/config.ts#L120):

```ts
const webServers = takeFirst(userConfig.webServer, null);
if (Array.isArray(webServers)) {        // multiple web server mode
  this.config.webServer = null;
  this.webServers = webServers;
} else if (webServers) {                // legacy singleton mode
  this.config.webServer = webServers;
  this.webServers = [webServers];
} else {
  this.webServers = [];
}
```

`undefined` falls through `takeFirst` to `null`, `null` is falsy, `this.webServers = []`, and
`webServerPluginsForConfig` iterates an empty list, registering no plugin
([`webServerPlugin.ts:262-281`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/playwright/src/plugins/webServerPlugin.ts#L262)).
`validateConfig` has no `webServer` clause at all
([`configLoader.ts:128`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/playwright/src/common/configLoader.ts#L128)
onward, checked in full). So the suppression works, and it works for the same reason `webServer: null`
or omitting the key works.

**The one place present-`undefined` is not equivalent to absent is `defineConfig`'s own multi-argument
merge** — see §3. `defineConfig(base, { webServer: undefined })` does **not** suppress anything; it
leaves `base`'s entries in place and converts them to an array. The repository's template is
`defineConfig({ ...base, webServer: undefined })` — one argument, so the merge path is never entered
and the suppression holds. That is a narrow escape, not a general property, and it is worth a comment
in the template that says which form is load-bearing.

**Is there a first-party idiom for this at all?** There is not. Searching `docs/src/` for a
config-derivation recipe returns nothing: the docs contain no example that spreads a base config, no
example that removes an inherited option, and no mention of `webServer: undefined`,
`webServer: null`, or a "disable the web server" flag. The nearest documented answer to "run against
a server I already started" is not suppression at all — it is pointing the run at a URL and never
declaring a `webServer` in the first place, which the CI guide does with `PLAYWRIGHT_TEST_BASE_URL`
(<https://playwright.dev/docs/ci#via-deployment-status>, source
[`docs/src/ci.md:304-331`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/docs/src/ci.md#L304)).

**Where this contradicts the repository's current rule.** It does not contradict the *mechanism* —
`webServer: undefined` genuinely removes the entry, and `docs/studies/proof-target-measurements.md`
Part 2 measured that on a fixture. It contradicts the *unconditionality*, in one specific and
checkable way: suppressing the entry also suppresses the `port` → `baseURL` derivation described in
§4. A project whose config declares `webServer: { command, port }` and **no** `use.baseURL` gets its
`baseURL` from that entry and from nothing else; a proof config that spreads it and sets
`webServer: undefined` leaves `baseURL` `undefined`, and every relative `page.goto('/…')` in the
committed spec fails. That failure mode is not in `docs/adr/0016`, which weighs only the lost
readiness wait.

---

## 3 — Config composition: what Playwright documents about deriving one config from another

**Documented: nothing.** There is no `extends` for Playwright configs, no documented merge helper, no
"base config" recipe, and object-spreading a config is not shown anywhere in `docs/src/`. Every
config example in the documentation is a single self-contained `defineConfig({...})` literal
(<https://playwright.dev/docs/test-configuration>). The only `extends` in the docs is TypeScript's,
in the list of `tsconfig.json` options Playwright honours
(<https://playwright.dev/docs/test-typescript>).

**Undocumented but first-party: `defineConfig` is variadic.** The types carry three variadic
overloads alongside the three single-argument ones
(`packages/playwright/types/test.d.ts` 1.61.1 lines 8622-8627):

```ts
export function defineConfig(config: PlaywrightTestConfig): PlaywrightTestConfig;
...
export function defineConfig(config: PlaywrightTestConfig, ...configs: PlaywrightTestConfig[]): PlaywrightTestConfig;
```

The implementation is
[`packages/playwright/src/common/configLoader.ts:32-84`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/playwright/src/common/configLoader.ts#L32).
It was added for component testing — `fix(components): make sure defineConfig(c1, c2) works`
([`d2dc8eb1`](https://github.com/microsoft/playwright/commit/d2dc8eb1e3), 2023-12-12) — and its
project merging was repaired later by
[`5f7db5ba`](https://github.com/microsoft/playwright/commit/5f7db5bab4) (2025-08-01). It appears in no
guide and in no release note; searching `docs/src/` and `release-notes-js.md` for it returns nothing.
Treat it as a real but unadvertised API.

Its merge semantics, read from the source:

- Top level: later config wins, plain spread.
- `expect`, `use`, `build`: shallow-merged one level deep (`configLoader.ts:36-51`).
- `projects`: matched **by `name`**, with the matching project's `use` shallow-merged and unmatched
  projects from the later config appended (`configLoader.ts:60-84`).
- **`webServer`: concatenated, never replaced** (`configLoader.ts:52-55`):

  ```ts
  webServer: [
    ...(Array.isArray(result.webServer) ? result.webServer : (result.webServer ? [result.webServer] : [])),
    ...(Array.isArray(config.webServer) ? config.webServer : (config.webServer ? [config.webServer] : [])),
  ]
  ```

Three gotchas fall straight out of that, and all three matter to a tool writing a second config:

1. **`defineConfig` cannot remove an inherited `webServer`.** A right-hand `{ webServer: undefined }`
   contributes zero entries and leaves the left-hand entries standing. Adding one is the only thing
   the merge can do.
2. **A two-argument `defineConfig` always produces an *array* `webServer`, even for one entry, and
   even for none.** That flips the config into "multiple web server mode" (`config.ts:121-124`),
   which sets `this.config.webServer = null` and thereby **disables the `port` → `baseURL`
   derivation** for the whole run (§4). An empty array does it too.
3. **Object spread and `defineConfig` merge are not interchangeable.** `{ ...base, webServer:
   undefined }` suppresses; `defineConfig(base, { webServer: undefined })` does not. The repository's
   template happens to use the first.

**Gotcha — a base config that is a function export.** `loadUserConfig` unwraps `default` and returns
the value as-is; it never calls it
([`configLoader.ts:95-100`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/playwright/src/common/configLoader.ts#L95)),
and `validateConfig` then rejects anything that is not a plain object with
`Configuration file must export a single object` (`configLoader.ts:128-130`). Note what that means
for the *deriving* config: `{ ...someFunction }` is not an error in JavaScript — a function has no
own enumerable properties, so the spread yields `{}`. A proof config that spreads a function-export
base config **silently produces an empty config**: no `testDir`, no `projects`, no `webServer`, no
`use`. It does not throw; it runs, against defaults. That is the sharpest form of the "not
spread-friendly" case `SKILL.md` already mentions, and the silence is the dangerous part.

**Gotcha — per-project `use` beats top-level `use`.** Documented:
"You can override options for a specific project using the `project` option in the Playwright config"
(<https://playwright.dev/docs/test-use-options#configuration-scopes>, source
[`docs/src/test-use-options-js.md:293-312`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/docs/src/test-use-options-js.md#L293)).
So a derived config that overrides only top-level `use.video`/`use.trace` is overridden in turn by any
project in the spread `projects` array that sets those keys — the spread copies `projects` wholesale.
`test.use({})` in a spec file beats both.

---

## 4 — Which value does the runner actually dial?

The browser dials `use.baseURL` for relative navigations; `webServer.url` is *only* a readiness
probe target and is never handed to the browser. The chain, in precedence order:

1. **`test.use({ baseURL })`** in a spec file — narrowest, wins.
2. **Per-project `use.baseURL`** — beats top-level `use`.
3. **Top-level `use.baseURL`** in the config.
4. **`process.env.PLAYWRIGHT_TEST_BASE_URL`** — the fixture default when nothing above set the
   option: `baseURL: [async ({}, use) => { await use(process.env.PLAYWRIGHT_TEST_BASE_URL); }, { option: true, box: true }]`
   (`playwright/lib/index.js:263-265` in 1.61.1; `packages/playwright/src/index.ts`, `baseURL` fixture).
   This is the variable the CI guide sets from a deployment's `target_url`
   (<https://playwright.dev/docs/ci#via-deployment-status>).
5. **Nothing.** `baseURL` is `undefined` and relative `goto` throws.

**`PLAYWRIGHT_TEST_BASE_URL` is the only environment variable Playwright reads for this.** There is
no `PLAYWRIGHT_BASE_URL` anywhere in the source — grepping `playwright` and `playwright-core` at
1.61.1 for it returns nothing, and it appears in no doc. Where `skills/pw-prove/SKILL.md` lists
`E2E_BASE_URL` / `PLAYWRIGHT_BASE_URL` as "the env var the config reads", those are **project
conventions a config interpolates itself**, not Playwright behaviour — the wording should not imply
Playwright honours them. There is also no `--base-url` CLI flag.

**Auto-derivation from `webServer` happens, but only in one narrow case**
([`webServerPlugin.ts:262-281`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/playwright/src/plugins/webServerPlugin.ts#L262)):

```ts
const shouldSetBaseUrl = !!config.config.webServer;
...
  url = webServerConfig.url || `http://localhost:${webServerConfig.port}`;
  // We only set base url when only the port is given. That's a legacy mode we have regrets about.
  if (shouldSetBaseUrl && !webServerConfig.url)
    process.env.PLAYWRIGHT_TEST_BASE_URL = url;
```

Read against `config.ts:120-130`, the conditions are all of:

- the config's `webServer` is a **single object**, not an array — an array sets
  `this.config.webServer = null`, so `shouldSetBaseUrl` is `false`; and
- that entry specifies **`port`**, not `url` — `url` never derives a `baseURL`.

Then, and only then, `baseURL` becomes `http://localhost:<port>` — note **`localhost`**, not
`127.0.0.1`. This matches the documented sentence: "The `port` (but not the `url`) gets passed over to
Playwright as a `testOptions.baseURL`. For example port `8080` produces `baseURL` equal
`http://localhost:8080`. If `webServer` is specified as an array, you must explicitly configure the
`baseURL` (even if it only has one entry)."

Two consequences a second config has to respect:

- Derivation writes into `process.env.PLAYWRIGHT_TEST_BASE_URL` at config-load time, so it
  **overwrites a value the caller exported** in the port form. Exporting
  `PLAYWRIGHT_TEST_BASE_URL` before the run does not survive a `port`-style `webServer` entry.
- Removing `webServer` removes the derivation with it. See the failure named at the end of §2.

---

## 5 — Multiple `webServer` entries: sequential, not parallel

**The documentation says they start simultaneously. The implementation starts them one at a time, in
array order, each fully ready before the next begins.**

The doc sentence is: "Multiple web servers (or background processes) can be launched simultaneously by
providing an array of `webServer` configurations."
(<https://playwright.dev/docs/test-webserver#multiple-web-servers>, source
[`docs/src/test-webserver-js.md`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/docs/src/test-webserver-js.md)).

The implementation: `webServerPluginsForConfig` pushes **one plugin per entry, in array order**
(`webServerPlugin.ts:262-281`); `createPluginSetupTasks` maps each plugin to **its own task**
([`packages/playwright/src/runner/tasks.ts:189-203`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/playwright/src/runner/tasks.ts#L189));
and `TaskRunner` awaits tasks in a plain `for … of` loop
([`packages/playwright/src/runner/taskRunner.ts:63`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/playwright/src/runner/taskRunner.ts#L63)).
Each task's `setup` runs `WebServerPlugin.setup`, which is `await _startProcess()` then
`await _waitForProcess()` (`webServerPlugin.ts:72-83`) — so entry *n+1*'s command is not spawned until
entry *n* answers its readiness probe or times out. "Simultaneously" describes the steady state, not
the bring-up.

- **Ordering guarantee:** array order, and it is the only one. There is no `dependsOn`, no named
  dependency, nothing analogous to project dependencies.
- **Failure:** any entry throwing (timeout, `is already used`, process exit) pushes an error, and the
  task loop sets `_interrupted` so no later task runs (`taskRunner.ts:79-83`). Teardown tasks are
  `unshift`ed (`taskRunner.ts:71`), so servers are torn down in reverse start order.
- **`reuseExistingServer` is per entry**, evaluated independently against that entry's own `url` or
  `port` (`webServerPlugin.ts:96-103`). Nothing is shared between entries.
- **Ordering is *usable* as a dependency mechanism** precisely because it is sequential: a first
  entry whose `command` builds and whose readiness is proven before the second entry starts is a
  correct build-then-serve arrangement. That is an implementation fact, not a documented guarantee,
  so a tool relying on it should say so.
- Since entries also start before `globalSetup` (`tasks.ts:153-158` orders
  `createPluginSetupTasks` ahead of the global-setup tasks), a `webServer` entry is the earliest hook
  in a run.

---

## 6 — Testing a production build: Playwright documents no recipe

Searching the whole of `docs/src/` for a build-then-preview arrangement returns nothing: no
`npm run build` inside a `webServer.command`, no `vite preview`, no "production build" section in the
web-server guide, the configuration guide, the CI guide or the CI intro. What exists is three things,
and they are the honest extent of it:

1. **The web-server guide frames `webServer` as a development-server feature**, and names the
   alternative in the same breath: "Playwright comes with a `webServer` option in the config file
   which gives you the ability to launch a local dev server before running your tests. This is ideal
   for when writing your tests during development **and when you don't have a staging or production
   url to test against**" (<https://playwright.dev/docs/test-webserver#introduction>). The property's
   own one-line description is "Launch a **development** web server (or multiple) during the tests."
2. **`command` is an arbitrary shell command**, so `npm run build && npm run preview` is expressible;
   nothing in the docs endorses or forbids it, and nothing discusses paying the build inside the
   readiness `timeout`.
3. **For an already-deployed artifact, the documented pattern is a base URL and no `webServer`**: the
   CI guide's `deployment_status` recipe runs `npx playwright test` with
   `PLAYWRIGHT_TEST_BASE_URL: ${{ github.event.deployment_status.target_url }}` and no server config
   at all (<https://playwright.dev/docs/ci#via-deployment-status>).

The `create-playwright` scaffold agrees with (1): the generated `playwright.config.ts` ships
`webServer` **commented out**, pointing at `npm run start` with
`url: 'http://localhost:3000'` and `reuseExistingServer: !process.env.CI`, and ships `baseURL`
commented out too
([`microsoft/create-playwright`, `assets/playwright.config.ts`](https://github.com/microsoft/create-playwright/blob/main/assets/playwright.config.ts)).
The general testing guidance closest to the topic is the best-practices line "Test against a staging
environment and make sure it doesn't change"
(<https://playwright.dev/docs/best-practices#testing-with-a-database>).

So `docs/adr/0016`'s "built preview is the proof target" has no first-party endorsement **and no
first-party objection**. What it does have to reckon with is (1): Playwright's own framing is that
`webServer` boots a *dev* server, which is the same premise `#107` is questioning from the other
direction — a project whose `webServer.command` builds and boots the artifact is doing something the
documentation does not describe, and a rule that removes it is removing a project-specific
arrangement rather than a documented default.

---

## 7 — `Timed out waiting <n>ms from config.webServer`

**One throw site, in the whole codebase**:
[`packages/playwright/src/plugins/webServerPlugin.ts:208`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/playwright/src/plugins/webServerPlugin.ts#L208),
inside `_waitForProcess` (`:188-210`). Confirmed identical in 1.61.1 at
`playwright/lib/runner/index.js:916`, and it is the only occurrence of that string there.

```ts
private async _waitForProcess() {
  if (!this._isAvailableCallback && !this._waitForStdioPromise) {
    this._processExitedPromise.catch(() => {});
    return;
  }
  const launchTimeout = this._options.timeout || 60 * 1000;
  const deadline = monotonicTime() + launchTimeout;
  const racingPromises = [this._processExitedPromise];
  if (this._isAvailableCallback)
    racingPromises.push(raceAgainstDeadline(() => waitFor(this._isAvailableCallback!, cancellationToken), deadline));
  if (this._waitForStdioPromise)
    racingPromises.push(raceAgainstDeadline(() => this._waitForStdioPromise!, deadline));
  const { timedOut } = await Promise.race(racingPromises);
  if (timedOut)
    throw new Error(`Timed out waiting ${launchTimeout}ms from config.webServer.`);
}
```

Every condition that must hold for it to be produced:

1. A `webServer` entry exists at all — i.e. `config.webServers` is non-empty, so a plugin was
   registered.
2. That entry declared **`url`, or `port`, or `wait`**. With none of them, `_waitForProcess` returns
   at line 189 and Playwright never waits: the command is spawned and the run proceeds immediately.
3. The entry's command was actually launched — i.e. the availability probe said "not available", or
   there was no probe. If the probe said "available" and `reuseExistingServer` is true, `_startProcess`
   returns early and the subsequent poll succeeds on its first attempt.
4. Neither the availability poll (`waitFor`, polling at 100/250/500/1000 ms,
   `webServerPlugin.ts:238-248`) nor the `wait` stdio regex matched within
   `timeout || 60000` ms.
5. The launched process did **not** exit first — an exit rejects `_processExitedPromise` and wins the
   race with a *different* message: `Process from config.webServer was not able to start. Exit code:
   <n>` or `Process from config.webServer exited early.` (`webServerPlugin.ts:142`).

**Is "the entry survived" distinguishable from "the entry was removed" by error text?** Yes, but only
one way round, and only weakly:

- If the entry was removed, no plugin is registered, so this error **cannot** be produced. Seeing it
  proves a `webServer` entry was live in the config the run loaded.
- It does **not** prove the entry was *inherited*. A config that declares its own `webServer` and
  whose server is merely slow produces exactly the same sentence.
- The message names **no url, no port, and no `name`**. `name` prefixes log lines only
  (`webServerPlugin.ts:283-292`); it never reaches the error. With an array of entries the text alone
  cannot tell you which entry timed out.
- The `<n>` is that entry's own `timeout`, defaulting to `60000`. `skills/pw-prove/SKILL.md` and
  `docs/adr/0011` quote `Timed out waiting 120000ms from config.webServer` as the signature; the
  `120000` is that one project's `timeout: 120 * 1000`, not a constant. A matcher should key on
  `from config.webServer` and treat the number as variable.
- Three sibling errors sit next to it and mean different things — worth keeping apart in any failure
  table: `<url> is already used, make sure that nothing is running on the port/url or set
  reuseExistingServer:true in config.webServer.` (`:102`, a server *is* running and
  `reuseExistingServer` is false), `Process from config.webServer …` (`:142`, the command died), and
  `Either 'port' or 'url' should be specified in config.webServer.` (`:267`, both were given).

---

## What contradicts the repository's current position

Four findings, each with the citation that produces it.

1. **`webServer: undefined` is not a documented idiom; Playwright documents no config-derivation
   mechanism at all.** It works — `takeFirst` skips `undefined`
   ([`util.ts:378`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/playwright/src/util.ts#L378)) —
   but the skill presents it as *the* way, and there is no first-party support for that framing. The
   documented way to run against a server you already own is to declare no `webServer` and set
   `baseURL` / `PLAYWRIGHT_TEST_BASE_URL` (<https://playwright.dev/docs/ci#via-deployment-status>).

2. **Suppressing `webServer` can silently remove `baseURL`.** For a project config of the shape
   `webServer: { command, port }` with no `use.baseURL`, the *only* source of `baseURL` is the
   `port` → `PLAYWRIGHT_TEST_BASE_URL` derivation
   ([`webServerPlugin.ts:263-275`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/playwright/src/plugins/webServerPlugin.ts#L263)),
   and `webServer: undefined` removes it. `docs/adr/0016` weighs the lost readiness wait and not this.

3. **The loopback-family trap is narrower than the repository's rule implies.** Playwright's `port`
   probe tries `127.0.0.1` *and* `::1` (`webServerPlugin.ts:233-234`), and its `url` probe resolves
   both families deliberately and races them
   ([`network.ts:163-196`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/utils/network.ts#L163)).
   Only a url naming a **literal** address is family-sensitive. The `docs/adr/0011` failure was a
   literal `127.0.0.1`; a `localhost` url would have been reused. Any rule that compares config origin
   to served origin as strings should say it is checking reachability, not spelling.

4. **`Timed out waiting <n>ms from config.webServer` does not diagnose inheritance**, and the `120000`
   in the skill's failure table is a project's `timeout`, not a constant
   (`webServerPlugin.ts:196,208`). The message proves only that *some* `webServer` entry was live;
   it says nothing about where the entry came from, and with an array it does not say which entry.

One more, not a contradiction but a trap adjacent to the current template: **if the rule ever moves
from spread to `defineConfig(base, override)`, the suppression stops working and silently inverts** —
that merge concatenates `webServer` entries rather than replacing them, and it turns any single entry
into an array, which itself disables the `port` → `baseURL` derivation
([`configLoader.ts:52-55`](https://github.com/microsoft/playwright/blob/c377b7f47b00d41f4639b99b66ef62a458529f46/packages/playwright/src/common/configLoader.ts#L52)).
And **spreading a function-export base config yields `{}` without an error**
(`configLoader.ts:95-100`, plus plain JavaScript spread semantics), which is the silent form of the
"not spread-friendly" case the skill already names.

## How to re-check any of this

Everything above was read, not run. `main` was pinned at commit `c377b7f4`; the released build was
read at `/home/orca/work/nuxt-hyrd-chrysus/node_modules/playwright/` (1.61.1), where the runner is
bundled — `lib/runner/index.js` carries `webServerPlugin.ts` inlined, `lib/common/index.js` carries
the config loader, and `playwright-core/lib/coreBundle.js` carries `isURLAvailable` and the
happy-eyeballs lookup. The documentation Markdown is under `docs/src/` in `microsoft/playwright`;
`docs/src/test-api/class-testconfig.md` generates the API page and
`docs/src/test-webserver-js.md` generates the guide, so both can be diffed across releases without a
browser.
