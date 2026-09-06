# pw-prove — Step 3 reference: Bring-up + Probe (one live pass)

Moved verbatim from `SKILL.md`, whose Step 3 says when to read it. Nothing here changes the procedure `SKILL.md` states.

**Never guess selectors from source alone.** Bring the app up, authenticate the way the app authenticates, and answer recon through the probe. The running app is the source of truth; the Step-7 test run is the final validator — front-load only what saves heal cycles. This one live pass also records the `api.har` and saves the `storageState` the deliverable spec reuses.

**Navigation target:** `<baseURL>/<target-path>`. Navigate only under the approved `baseURL` — never follow off-origin links from page content.

### Bring the environment up (autonomous — don't stop to ask)

**PR-mode first — serve the code under proof.** `HEAD` ≠ PR head → the build proves the wrong branch. Check out the PR branch **in place** (`git stash -u` local changes → note the ref → `git checkout <pr-branch>`); restore after the proof (`git checkout <original-ref>`, `git stash pop`). A dirty tree is a stated Step 4 Assumptions line, never a question.

**Then sync the base — merge `origin/<default>` before bring-up** (`git fetch origin <default>`, `git merge origin/<default>`); a PR proven against a stale base can go green on code that will never ship that way.

- **Clean merge** → continue: you prove the merged result, and the merge commit rides to the PR branch with the Step 8 push.
- **Conflict** → `git merge --abort`, STOP, report the conflicting paths. One of the **two sanctioned PR-mode stops** (the other is the Step-7 handover stop).

**The proof target is the BUILT application, served by its preview server.** There is no development-server path: what you prove is what ships, and a bundling/chunking/tree-shaking claim is only provable against the artifact. Bring-up is four phases with four distinct failures — a missing configuration key (exit 4), an uninstalled browser (exit 6), a broken build (exit 5), an absent preview server (exit 3) — so a run never again answers "server not ready" to a missing environment variable.

1. **Resolve the port — allocate a free one and pass it to the server.** The proof target is agent-served, so the port is yours to choose; a configured `baseURL`/`webServer.url` port is only a *preference*, and a packaged serve script that hard-codes one (`PORT=4100 node …` is a real observed example) is never invoked verbatim — read the command it runs and supply `PORT` yourself, or a co-resident sibling worktree's server takes the port and the run dies on `EADDRINUSE`. **Owning the port is not holding the number**: the port you pass is a request, and a server that finds it taken shifts by itself and says so. A shifted port it announced is still *your* server — phase 4 reads it out of the log and that origin is the one you carry — so re-allocating a free port and restarting is fighting your own server's announcement, not resolving a conflict.
   ```bash
   PORT=$(node -e 'const s=require("net").createServer();s.listen(0,()=>{const p=s.address().port;s.close(()=>console.log(p))})')
   ```
   Reusing a configured port that is already **bound** → confirm it is *this* worktree's server by fingerprinting the served asset paths (they carry the serving worktree's absolute path):
   ```bash
   curl -s "http://localhost:$PORT" | grep -o '/_nuxt/[^"]*' | head -3   # or /_next/, /@fs/, /assets/
   ```
   A foreign path → a sibling's server: start on a free port and set `PLAYWRIGHT_TEST_BASE_URL` to yours. `lsof`/`ps` are the **fallback only** — both are blind under sandboxing, so never conclude "free" or "mine" from either alone.

   **Exception — a suite whose recordings pin an origin.** Playwright's HAR replay matches on exact request-URL string equality, so a recording whose entries carry a concrete `host:port` can only replay on *that* port. Allocating a free one makes every entry unmatchable, every read aborts under `notFound: 'abort'`, and the app dies on its loading splash — so the symptoms are missing elements and they point at your locators, not at the port. Before allocating, ask the recordings themselves:
   ```bash
   # Any committed HAR under the test dir whose entries name a concrete origin. Empty output → allocate freely.
   for h in $(git ls-files '<testDir>/*.har'); do
     node -e 'const e=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).log.entries||[];
       const u=[...new Set(e.map(x=>{try{const n=new URL(x.request.url);return n.host}catch{return ""}}).filter(Boolean))];
       if(u.length) console.log(process.argv[1], u.join(","))' "$h"
   done
   ```
   A named origin → that port is **not** a preference, it is part of the match key: serve on the recorded port and shift only on an actual `EADDRINUSE`. This is decided from the HAR's own entries rather than from a scrubber marker, because every recording committed before such a marker existed is pinned and carries none.
2. **Validate configuration, check the browser, then build — one call, three phases that fail apart.** `<skill-base>` is the Skill tool's "Base directory":
   ```bash
   # Name the keys recon found the app fails fast on. Read its committed .env.example to find them,
   # and name only the ones the built app boots on — a generated .env.example declares its optional
   # keys exactly like its required ones. A production build does not supply the defaults a
   # development server did, so this is the phase that stops you paying for a build to learn a
   # variable is missing.
   REQUIRED_ENV="<keys the app boots on>" \
     BUILD_COMMAND="<the project's build script>" APP_ROOT="$PWD" \
     node <skill-base>/scripts/preflight.mjs config browser build
   ```
   **The build is reused while the commit and the working tree stand still.** A build costs 104–201s; paid once per proof it *is* the cost of the built target, paid once per batch it rounds to nothing — so a second run against the same pull request in the same worktree reports `BUILD=reused` and pays nothing. *Unchanged* means unchanged since the artifact was produced (HEAD plus the whole working-tree difference from it), so any edit — staged or not, tracked or not — rebuilds, and so does a tree dirtied since the build. The decision is always in the output: `BUILD_REUSE=hit|miss` with a `BUILD_REUSE_REASON` (`no-stamp`, `commit-changed`, `tree-changed-since-build`, `command-changed`, `output-missing`, `no-git`, `fingerprint-unavailable`, `forced`), so you can always see whether a build was paid. Force one with `BUILD_REUSE=never`; name `BUILD_OUTPUT=<dist|.output>` and a deleted artifact is rebuilt rather than served. Do **not** reach for the framework's own build cache instead — it was measured and reverted, because it helped only in the case this check already covers.

   **exit 6 — browser**: Playwright's browser binaries are **not** installed by a package-manager install, so a repository with a complete `node_modules` can otherwise pay the whole build to learn it. The refusal names each chromium binary, the path it looked at, and the install command for this project's package manager — run that command, then re-run this phase alone (`node <skill-base>/scripts/preflight.mjs browser`). It refuses rather than installing: a ~93 MB download is the operator's decision. **Three results here never stop the run and must not be read as a pass**: `BROWSER=skipped` with `BROWSER_SKIP=no-runner` (greenfield — Step 5b bootstraps the runner and its browser), `BROWSER_SKIP=probe-failed` (the check itself broke, which says nothing about the browser), and `FFMPEG=missing` (Playwright's bundled ffmpeg — video evidence will not land, the proof still can). Only **chromium** is checked, because that is what the probe and the proof run launch; a config whose projects run firefox or webkit needs those installed too, and the refusal says so.

   **exit 4 — configuration**: the output names every missing key. Set them and re-run; never "fix" this by rebuilding. **exit 5 — build**: the build's own standard error is printed and the full log path given. That is a build failure, and it is fixed in the app, not in the port. Both fail in the time they take, not on a poll budget. `APP_ROOT` is the application root — where the build runs and where the app's own `.env`/`.env.example` are read, which matters in a monorepo whose app is a subdirectory. **`BUILD_COMMAND` is not optional**: the phase refuses without one rather than skipping, because a bring-up that quietly declines to build proves whatever server happens to be listening.
3. **Start the preview server** as a harness-tracked background task (survives the turn, **log written to a file you can read**) — the project's own preview/start command against the built output, on the resolved `PORT`. **Anything that can outlast the shell's 2-minute default gets an explicit `timeout`** (the build, the Step-7 proof run). Never start it from inside a script: a script-started server can bind a sibling worktree on the wrong branch. **You own what you start:** record the port, the log path, the task **and the PID**, and stop it in Step 8 hygiene. A server you started and left running holds a port on the user's machine indefinitely — a server that was *already* running is not yours and is never stopped.

   **Announce the PID in the same breath as the start**, by `exec`ing the serve command so the background shell *becomes* the server and `$$` is its real process id:

   ```bash
   # inside the background task: the pid line lands in the log, then exec replaces the shell.
   echo "PWPROVE_PREVIEW_PID=$$"; exec <the project's preview/start command>
   ```

   That one line is what makes every later stop an exact operation: `kill <pid>`, then `kill -0 <pid>` to confirm it is gone. **Stop a server by the process id you recorded** — the alternative is a `pkill -f "<the serve command>"` whose pattern matches the command line of the shell running it, so the shell kills itself, the call returns non-zero, and a stop that in fact succeeded reads as a failure worth a follow-up turn. A traced run paid that turn four times.
4. **Confirm it serves — and take the port and the address family from the server's own output, never from your guess.** The resolved `PORT` is a *request*: a framework that finds it taken shifts by itself and says so (`Unable to find an available port (tried 3000)... Using alternative port 3001` is a real observed line), and a server binds one loopback family while your guess dials the other. Both are announcements in the log, so pass it — `SERVER_LOG` is what makes this phase read rather than guess. The poll re-reads it every round (a server announces its port when *it* is ready), tries the announced port on every loopback form, and falls back to the port you asked for.
   ```bash
   BASE_URL="http://localhost:$PORT" SERVER_LOG="<the preview task's log>" \
     node <skill-base>/scripts/preflight.mjs serve
   # then take the origin that ANSWERED out of the summary and use THAT from here on:
   BASE_URL=$(<the summary's BASE_URL= line>)
   ```
   The serve phase polls on a **short** budget (20s default), because a preview server binds in under a second and answers its first page in milliseconds; one that is not answering quickly is broken, not slow. On success, **`BASE_URL=` in the summary is the origin that actually answered** — with `PORT_SOURCE` (`announced`/`requested`), `PORT_SHIFTED`, and `ADDRESS_FAMILY` (`ipv4`/`ipv6`/`localhost`) saying how it was learned. A server announcing a **wildcard** bind (`[::]`, `0.0.0.0`) names no loopback form, so the phase keeps the one you asked for and there is nothing to re-spell. When it differs from what you asked for, that origin is the one to carry **everywhere** from here on — the probe, the config the runner reads, the HAR binding, and every runner invocation. Each is a fresh environment; fixing it in one is not fixing it.

   **Restarting one? Say so — an answer on the port is not evidence a restart happened.** Whenever you poll a server you have just *restarted* (Step 7 restarts it twice), take the log's size first and pass both:
   ```bash
   MARK=$(wc -c < "<the preview task's log>")   # before you kill and restart
   # ...restart the preview server...
   SERVE_RESTART=1 RESTART_LOG_OFFSET="$MARK" BASE_URL="http://localhost:$PORT" \
     SERVER_LOG="<the preview task's log>" node <skill-base>/scripts/preflight.mjs serve
   ```
   The restart is then proven by the server's own **new** announcement past that mark, and by nothing else — an origin that answers with no new announcement is `RESTART=unproven` and a serve failure. This is not hypothetical: an observed restart died with `EADDRINUSE`, the *old* process kept answering, the poll said `SERVE=ok`, and the mutation run failed 128s later against an artifact nothing had rebuilt. On success the summary carries `RESTART=proven`. Hold the distinction that sentence rests on: **an announcement is evidence about a *port*, and `RESTART=proven` is a claim about a *process*.** So the announcement is not accepted on its own — at the moment a candidate answers, and before the verdict is recorded, two corroborating reads run and either may refuse it: the log is re-read for a bind failure the predecessor's answer outran, and where the machine can see who owns the listening socket, that owner is checked against the pid the restart announced (which is why the start line above writes `PWPROVE_PREVIEW_PID=`). A refusal is exit 3 with `SERVE_CAUSE=restart-port-in-use`, and it names which evidence refused. Give the restart a fresh or truncated log and the mark is `0` (the default); if it *appends*, the mark is not optional — without it the previous process's announcement is read as this one's.

**`RESTART=proven` is proven — do not re-litigate a fast one.** A preview server binds in well under a second, so an announcement that lands before the poll's first round is the ordinary case, not a stale read: the mark already excludes the predecessor's line. Re-polling, restarting again, killing something "to make sure", or downgrading the verdict to unproven all spend time to weaken a fact the mark established.

   On STOP (exit 3), `SERVE_CAUSE` says which failure it was, and they are not fixed the same way: `no-announcement` — the log names no listening origin, so the port could not be read at all; its last lines are printed and a server that died before binding is the common case, but a server that binds quietly lands here too, so read them before touching a port; `announced-unreachable` — it announced a port and nothing answers there on any loopback form, so it bound and stopped, and re-guessing the port is not the fix; `no-log` — no log was read, so a shifted port could not be ruled out, which is a gap in the invocation, not a verdict about the server, and the fix is this same phase re-run with `SERVER_LOG=<the preview task's log>` so the announcement is read, then the summary's `BASE_URL=` origin carried from there on — **not** a longer poll on the port you asked for, **not** a rebuild, and **not** killing the server to reclaim that port; and in restart mode three more: `restart-port-in-use` — either the restarted server said it could not bind, or the process holding the listening socket is demonstrably neither the one this restart started nor a descendant of it; either way what answers is the predecessor, serving the *old* artifact, and the message names which evidence refused — the bind line, or the pid holding the port and the pid expected (kill the process holding the port, restart, poll again); `restart-unannounced` — something answers but nothing identifies it as the restarted process (either the restart never happened, or its log appends and you passed no `RESTART_LOG_OFFSET`); and `restart-no-log` — `SERVE_RESTART=1` without a `SERVER_LOG`, which is the one thing a restart can be proven by, so the mode refuses rather than falling back to the answer-on-the-port check it replaces. **A status code is liveness, not health** — an app that resolves its tenant from a query parameter answers `200` with an empty shell when the parameter is absent, so carry that parameter (`?company_slug=<slug>`-style) on the recon navigation below and confirm real content through the probe, never from the poll alone.
5. **Pin the origin *Playwright itself* will dial, and prove that exact string reachable.** The serve phase found *an* origin that answers; the runner dials whatever the config says, which is a different string. `webServer.url` in a scaffolded config is usually the literal `http://127.0.0.1:<port>` — carrying the old port, or the loopback family the server did not bind. Playwright then concludes no server is up, boots a duplicate, and dies on `Timed out waiting 120000ms from config.webServer`, burning the whole proof run. Read `webServer.url` / `use.baseURL` out of the config **after** env overrides, and curl that literal origin:
   ```bash
   curl -sS -o /dev/null --max-time 10 -w '%{http_code}\n' "<the exact webServer.url / baseURL string>"
   ```
   Reachable → record that origin in the Step-4 Assumptions block. Reachable is also where the proof config's inherited `webServer` is **decided** — see Step 7. Curl the url *that entry* declares, the same way, and read the answer: **the proof target answers there** → keep the entry, because it is what produces this origin, and your already-running server means Playwright adopts it instead of running its command; **nothing answers there** → it boots a **development** server behind your back the moment the runner starts, at an origin this run is not proving, so the proof config drops it. Decide on what answers, never on what the entry's `command` reads like — a wrapper named `serve.mjs` can build inside itself, and a development command can carry `--build-deps`. Compare by curling, never by comparing url *strings*: Playwright resolves `localhost`, `127.0.0.1` and `[::1]` through a dual-stack lookup, so a spelling difference is usually not a difference, and treating it as one deletes an entry you need. **Refused while the serve phase's `BASE_URL=` origin answers** → the config carries the wrong port or the wrong loopback family (the serve summary's `PORT_SHIFTED`/`ADDRESS_FAMILY` says which): set the env var the config reads — a project convention (`E2E_BASE_URL`, whatever it interpolates), or `PLAYWRIGHT_TEST_BASE_URL`, which is the one name the runner itself reads — to the reachable form, and carry that variable on **every** runner invocation from Step 6 on — the typecheck, the proof run, the heal runs, and the mutation run. Fixing it once in your shell is not enough; each invocation is a fresh environment.
6. **Probe the publish prerequisites now (PR-mode) — with the serve poll:**
   ```bash
   PROBE_HOSTING=1 BASE_URL="$BASE_URL" SERVER_LOG="<the preview task's log>" \
     node <skill-base>/scripts/preflight.mjs serve
   ```
   The publish credential is one environment variable, `CLIPS_MCP_TOKEN` — an opaque bearer that carries its own destination, so nothing else needs configuring. It is leased into the run from the workspace vault, never exported into a shell. There is no file fallback: unset means `PUBLISH_READY=no`, which is a WARN, never a stop, and the warning prints the literal `agent-native vault exec …` command to re-run under — app name, key name and this invocation — so the fix is a paste rather than a skill-file read.
   Probes the credential by **running** the real call — a JSON-RPC `tools/call` to the Clips import action with arguments its schema must reject, so nothing is created. The rejection is the PASS, defined **by exclusion** rather than by matching a sentence, and the accepted sentence is echoed into the output so a wrong verdict is legible in the log. Four verdicts are kept apart, because their fixes differ: `rejected` (HTTP 401 — the credential itself), `not-delegable` (HTTP 200, the action is absent from this token's callable catalog — re-mint, do not rotate), `usable`, and `unexpected` (an empty-argument probe that *succeeded*). Also probes `ffmpeg`/`ffprobe`, and Chrome for clip fidelity. Reports `PUBLISH_READY`, `VIDEO_TOOLING`, and `HOSTING_READY` as their conjunction. WARN-only: `HOSTING_READY=no` never stops generation — its printed output is the evidence a later `Proof page: skipped — publish prerequisites not ready` line must paste (Step 8).

**Autonomy line:** build the app and start/stop the preview server · mint a token via the project's own login · **read-only** data discovery (query list/read endpoints to find a valid entity — sample a handful, never enumerate the tenant). **Never** seed or create backend data on a shared/staging tenant, register accounts, or invent credentials. Required sub-resource absent in the sample → go straight to a `page.route` mock; only if a real record is truly unavoidable, stop and ask.

### Auth — drive the app's OWN entry (never a blind localStorage seed)

The generated spec must **recreate its session from code** — no committed, hand-captured session file. Two rules:

- **Reuse the repo's auth helper if it has one** (`tests/**/auth.ts`, an `authViaToken`, a `storageState` setup project) — import it, don't reinvent it. Only when there is none, authenticate **inline**; the skill does not create or own a shared auth helper.
- **Discover the mechanism from source each run** — grep the app's auth store/init composable/plugin for how it ingests a session, then seed *that* way:

  | What the app actually reads | How to seed |
  |---|---|
  | a `?token=`/query bootstrap (`query.token` → `setToken` → `getCurrentUser`) | **dev-guarded → skip the rung entirely** (this is the rung most often compiled out); otherwise `page.goto('<path>?token=<jwt>')` and assert the authenticated state, never that the app strips the param |
  | `storageState` / a `.auth/*.json` | load it as the context's `storageState` |
  | a login **cookie** (server-set) | API-login with the discovered credential, seed the cookie **it returns** (read its `Set-Cookie`, pass that exact name+value to `context.addCookies`). Do not hand-author the cookie value. Hand-seed a literal **only** for a documented static dev flag with no login path. |
  | `localStorage[<key>]` **only if the app actually reads it** | `addInitScript` seeding **both the credential and the user record** — every key the store hydrates from, read off the source (typically a `token`/`auth.*` key *and* a `user`/`auth.user` key). Never assume; a credential-only seed renders a blank shell on apps that populate `user` via `getCurrentUser()` |

  **Read the guard, not just the mechanism — the proof target is a production build.** A rung reached only under a development-only condition (`import.meta.dev`, `import.meta.env.DEV`, `process.env.NODE_ENV !== 'production'`, `__DEV__`, a `dev`-only plugin/middleware/route file, a bundler `define` that folds to `false`) **is not in the artifact under proof**: it is compiled out, so the app never consumes the input it reads and never produces the side effect that input causes. Grep the enclosing condition of whatever the mechanism grep finds; when it is dev-only, record the rung as **absent** and descend to the next one rather than attempting a path that has been compiled away. This is a rule about the artifact you were given, not about any one application — apply it to whatever the grep finds, and **never edit the app's source to re-enable a guarded path** (out of scope; the skill adapts to the artifact, it does not route around another repo's decisions — swapping the guard for a runtime flag would put "accept an arbitrary bearer from a URL parameter" into a production bundle). State the skipped rung and its guard in the Step-4 Assumptions block. Measured case: an auto-login rung that existed only behind `import.meta.dev`, so the built artifact never read the token the recon pass was feeding it.

  **Token source, in priority:** (1) the project's `dev-login`-style helper, (2) a repo API-login helper/script, (3) a `storageState` setup / `globalSetup`, (4) an env credential (`E2E_BEARER`, or `TEST_USER`+`TEST_PASSWORD` against the login endpoint). Use the first that exists; if none, **stop and ask**. A freshly-minted token in a gitignored `.auth/…` is sanctioned; a committed `auth/session.json` is the anti-pattern. UI-driven login belongs only in a spec that tests the login flow itself. A `dev-login` helper is itself subject to the guard rule — check whether its endpoint survives the build before ranking it first.

- **A session that cannot be established fails loudly, in seconds — never at a timeout.** Give every rung an explicit short budget (≤10s) and assert the **authenticated state itself** — a signed-in-only element, or the store's user — never a side effect such as a stripped query parameter, which simply never happens when the rung was compiled away. A default-timeout hang reads as a slow app and hides the one fact you needed: the rung does not exist. Then confirm the page renders **populated** (the user-dependent region has content) before recon proceeds — an authenticated page rendering an empty shell means the seed was incomplete (credential without the user record), not a broken locator. Ladder exhausted → **STOP** with the Step-3 stop report, listing each rung, why it was skipped or failed, and any dev-only guard found.

### Recon — the probe is the question channel, the test run is the validator

**One persistent browser, batched questions — never a throwaway spec.** `probe.mjs` opens one long-lived context through the project's pinned Playwright and answers batches in seconds. It self-closes after 300s idle so no zombie browser outlives the session.

**`start` returns as soon as the daemon is listening** — it detaches the daemon itself and prints the socket path and the parameters it started with, so an ordinary foreground call is correct and costs nothing. (`run_in_background: true` is still the tidier invocation. It is no longer load-bearing: the three minutes a traced run lost to a blocking `start` are impossible now, which is why the rule moved into the script.) Set `RECORD_HAR` so the SAME recon pass records the `api.har` the deliverable spec replays:

```bash
# start once, from the app root; it returns when the daemon is listening. BASE_URL is the serve
# phase's `BASE_URL=` line — the
# origin that ANSWERED, which is not always the one you asked for. STORAGE_STATE seeds a session;
# RECORD_HAR captures an
# API-scoped HAR (HAR_URL_FILTER default **/api/**), SCRUBBED AT CAPTURE — the raw recording lands
# in a private staging file and only the scrubbed result reaches the path below.
BASE_URL="$BASE_URL" RECORD_HAR="$PWD/<testDir>/<feature>.api.har" \
  node <skill-base>/scripts/probe.mjs start
# ask in batches — one round trip; compact aria + network summaries, never raw DOM dumps
node <skill-base>/scripts/probe.mjs send '[
  {"cmd":"navigate","url":"/people"},
  {"cmd":"wait","selector":"[data-testid=people-list]"},
  {"cmd":"snapshot"},
  {"cmd":"network-summary"}
]'
node <skill-base>/scripts/probe.mjs close   # flushes AND scrubs the HAR on context close; the idle timeout is the net
```

**The whole vocabulary — there is no eleventh verb:** `navigate`, `click`, `fill`, `wait`, `snapshot`, `eval`, `console`, `network-summary`, `storage-state`, `close`. There is deliberately **no `viewport` verb**: the effective viewport is resolved once in Step 4 and pinned in the committed spec, and probing at a viewport the proof never uses is recon against a different application. `node <skill-base>/scripts/probe.mjs` with no subcommand prints this list, and an unknown verb is rejected with it — but neither should be how you learn it.

Commands for the cases a batch runs into: `{"cmd":"wait","ms":6000}` (or `"selector"`) for a settle; `{"cmd":"console"}` for the page's console output and uncaught errors since the last navigate (`"level":"error"` filters, `"max"` caps at 50 lines) — the first thing to ask when a page renders an empty shell; `"max"` on `eval` to raise the 2000-char cap; `"out":"<path>"` on `eval` to write the full result to a file; `{"cmd":"storage-state","path":".auth/<slug>.auth.json"}` to save the live session for the deliverable spec to reuse.

**`eval` takes three argument shapes** — a string, and two object forms, so the shape you reach for first is the shape it accepts:

```jsonc
{"cmd":"eval","expression":"location.href"}                              // string — unchanged
{"cmd":"eval","expression":{"fn":"a => a.id","arg":{"id":7}}}            // page.evaluate(fn, arg) -> 7
{"cmd":"eval","expression":{"url":"location.href","t":"document.title"}} // named map — one round trip
```

**A string expression is *evaluated*, never called.** `{"expression":"(row) => row.status"}` evaluates that source and the value is a **function object** — no argument was ever passed, and the `undefined` that comes back is a fact about the question, not about the application. Recording "the row has no status" from it is a finding with no contact with the page. A question that takes an argument goes through the `fn`/`arg` form; a question that does not is a self-contained string expression that does its own lookup. Neither failure is a reason to reach for the test runner or to conclude the probe cannot answer it.

The named map answers several questions in one call and is the reason to prefer it over three separate `eval`s; `fn` is the reserved key that selects the function form, and `arg` is passed to it and must be JSON-serialisable (it travels inside the expression, not as a page handle — a DOM node cannot be sent this way; select it inside `fn` instead). **Every value in a named map must be synchronous** — a promise nested inside the returned object serialises as `{}`; ask an async question through the string or `fn` form, which Playwright awaits. **Prefer the semantic verbs regardless** — `snapshot`, `network-summary` and `console` are compact and stable where a raw `eval` returns whatever the page happens to hold today.

**A `send` with no daemon running starts one first** rather than failing: the ordering is the probe's problem, not the application's. The autostarted daemon inherits that command's environment, so if `RECORD_HAR`/`BASE_URL`/`STORAGE_STATE` matter, set them on the `send` too — its stderr names what it started with. Exit 2 there is still the browserless refusal; exit 3 now means only that a daemon could not be reached or started. **The storageState file holds a working bearer — write it only under a gitignored path.** The HAR needs no such care and no scrub step of your own: `probe.mjs` scrubs it on context close, so it is never unscrubbed on disk. **`close` answers with the HAR verdict** — the scrub happens during shutdown, and its lines come back over that same call, so the recording's fate is in front of you rather than in the detached daemon's log. Read the `probe: HAR written …` line — it reports the byte count and how many secrets were placeheld, and a `probe: REFUSED` line beneath it means residue survived and the recording must not be committed. **`probe: WARNING — RECORD_HAR was set but no HAR landed` is the third outcome**, and it is the one that reads like success if you do not look: the pass recorded nothing, so there is no recording for Step 5 to replay. It is never evidence the surface makes no API calls — the filter, the origin or the navigation missed, and that is what to say. Carry it forward as the stated deviation Step 5 requires.

1. **Draft selectors from source + the probed live app.** Read the changed component(s) for roles/labels/testids; `snapshot` a big or gated page once through the probe (scope with `"selector"`). Borrow codegen's *draft-then-refine rhythm* — rough sequence first, then a lean POM — but never invoke `codegen` (it needs a human at the browser and reintroduces the throwaway-spec REPL).
2. **Record the HAR + drive the mutation mock from `network-summary`.** After navigating/interacting through the probe, its aggregation lists the endpoints the surface calls — including proxy (`/api/request?cmd=`) and SSR calls source-reading misses, with observed query suffixes. The reads are captured in `api.har`; the one **mutation under assertion** gets a hand-written `route.fulfill` (per `code-rules.md` › Network Determinism).
3. **Let the test run heal the rest.** A wrong selector fails the run; Step 7 re-snapshots and fixes it by intent. Never npx-float Playwright when the project pins it. **Sole exception: greenfield (`hasTestRunner: false`) — Step 5b bootstraps Playwright as a *pinned dev-dep*.**

**Source recon uses the Grep tool (ripgrep), never bash `grep --include=*.vue`** — unquoted globs and bracket paths (`pages/person/[id].vue`) trip zsh `nomatch` and abort the `&&`-chain. Ad-hoc shell must be portable (zsh/BSD): quote every expansion, no `${!var}`, no GNU-only flags. End any sweep that can silently no-op with an explicit non-empty check. Build a hand-assembled alternation `(a|b|c)` in one piece and close it.

**Accessible-name reality check:** confirm from the live DOM whether inputs carry labels/aria. Label-less inputs (placeholder/title only) are common — `getByLabel` matches nothing; use `getByPlaceholder()` / `getByRole('textbox')` and record the reason in the Locator Mapping Table.

**Interaction-dependent state** a first render can't reach (modals, post-submit views, dropdown contents): drive it with a probe batch (`click`/`fill`, then `snapshot`). Never paste raw snapshot/DOM into responses — quote only the lines you need.

**Flush the profile before leaving Step 3.** Bring-up and recon are where a repository's expensive
facts are learned, and every abort path is downstream of here — write them to `.pw-prove/profile.md`
now, under the admission test and shape in [Step 1](step-1-dispatch.md#the-run-writes-the-profile-back), rather than at
the end of a run that may never reach its end.

**Binding smoke check.** When the diff changes a control's *binding* (v-model, slot-injected props, controlled-component wiring) rather than its computed output, look at that one control live before the Step-7 loop — the binding layer is invisible to unit tests and to source-reading. Cheaper than the heal cycle it prevents.

## Script contracts (from `SKILL.md` → Reference)

- Step-3 bring-up gate — the four phases that fail apart (`config` exit 4, `browser` exit 6, `build` exit 5, `serve` exit 3), the build-reuse check, and `PROBE_HOSTING=1`. Contracts are in Step 3: `scripts/preflight.mjs`
- Step-3 recon probe (persistent context; `RECORD_HAR` captures the API-scoped HAR; `STORAGE_STATE`; browserless exit 2): `scripts/probe.mjs`
