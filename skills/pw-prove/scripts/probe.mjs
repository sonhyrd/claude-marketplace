#!/usr/bin/env node
// probe.mjs — persistent live-recon probe (SKILL Step 3, issue #7): ONE long-lived browser context
// through the TARGET project's pinned Playwright, answering batched recon questions in seconds.
//
// Before this script, every recon question booted Playwright from scratch — or worse, became a
// throwaway `_recon.spec.ts` run through the test runner as a REPL (the worst audited run wrote 8
// probe specs and invoked `playwright test` 48 times). The probe replaces both: start once, ask in
// batches, close. Non-deliverable spec probes are forbidden by SKILL Step 3.
//
//   node probe.mjs start               # boot the daemon — run from the APP ROOT, background shell
//   node probe.mjs send '<json>'       # run a batch of commands, print compact summaries
//   node probe.mjs send -              # ...batch read from stdin
//   node probe.mjs close               # explicit close (the idle timeout is the net)
//
// `send` with no daemon listening STARTS ONE FIRST and then runs the batch. A batch sent before a
// start is an ordering mistake about the probe, not a fact about the application under test, and it
// was every probe failure in the audited sample; sequencing it correctly is the fix. The autostarted
// daemon inherits this process's environment and cwd, so BASE_URL/STORAGE_STATE/RECORD_HAR still
// apply if they are set on the `send` — the notice on stderr says what it was started with.
//
//   BASE_URL       optional, `start` — context baseURL; `navigate` then accepts relative paths.
//   STORAGE_STATE  optional, `start` — storageState file for the context (Step 3 auth table).
//   RECORD_HAR     optional, `start` — path to record an API-scoped HAR of the recon pass, flushed
//                  on context close and SCRUBBED IN THE SAME BREATH (har-scrub.mjs): the raw
//                  recording lands in a private staging file, never at this path, so the working
//                  tree never holds an unscrubbed authenticated capture. The deliverable spec
//                  replays the scrubbed file via routeFromHAR.
//   HAR_URL_FILTER optional, `start` — HAR glob (default `**/api/**`); pairs with RECORD_HAR.
//   PROBE_IDLE     optional, `start` — idle seconds before self-close (default 300), so no zombie
//                  browser outlives a session even when the agent forgets to `close`.
//   PROBE_SOCK     optional — Unix-socket path (default: $TMPDIR/ptg-probe-<cwd-hash>.sock, so each
//                  project root gets its own daemon).
//   PROBE_START_TIMEOUT optional, `send` — seconds to wait for a daemon this send started itself to
//                  begin listening (default 60; a cold browser launch is seconds, not milliseconds).
//
// A batch is a JSON array of {cmd, ...} objects, executed in order, one compact result each.
// Failures are reported per command and the batch continues — recon wants maximum signal per round
// trip. Commands:
//
//   {"cmd":"navigate","url":"/login"}                  goto + short networkidle grace; resets the
//                                                      network log (summaries are per-page)
//   {"cmd":"click","selector":"text=Sign in"}          5s timeout ("timeout" overrides, ms)
//   {"cmd":"fill","selector":"#email","value":"a@b.c"}
//   {"cmd":"wait","ms":6000}                           settle wait; or {"selector":…,"state":…} to
//                                                      wait for a condition (default state: visible)
//   {"cmd":"snapshot"}                                 compact aria snapshot of body — "selector"
//                                                      scopes it, "max" caps lines (default 120).
//                                                      NEVER a raw DOM dump.
//   {"cmd":"eval","expression":"location.href"}        JSON-stringified result, truncated at 2000
//                                                      chars — "max" raises the cap, "out":"<path>"
//                                                      writes the FULL result to a file instead.
//                                                      "expression" also takes two OBJECT forms:
//                                                        {"fn":"a => a.id","arg":{...}}  — the
//                                                          page.evaluate(fn, arg) shape, for a
//                                                          question that needs an argument
//                                                        {"url":"location.href","t":"document.title"}
//                                                          — a map of named expressions, answered
//                                                          in ONE round trip as one object. Each
//                                                          value must be SYNCHRONOUS: a promise
//                                                          nested inside the returned object
//                                                          serialises as {}. Ask an async question
//                                                          through the string or "fn" form, both of
//                                                          which Playwright awaits.
//   {"cmd":"console"}                                  console output + uncaught page errors since
//                                                      the last navigate — "level" filters by type
//                                                      ("error", "warning", …), "max" caps lines
//                                                      (default 50)
//   {"cmd":"network-summary"}                          method+path aggregation since last navigate;
//                                                      document/xhr/fetch only (the mock targets) —
//                                                      "all": true includes scripts/styles/assets
//   {"cmd":"storage-state","path":".auth/x.json"}      save the live session for the film/spec to
//                                                      reuse. Holds a working bearer — write ONLY
//                                                      under a gitignored path.
//   {"cmd":"close"}                                    same as the close subcommand
//
// The browser is the TARGET project's own pinned Playwright, resolved from the cwd — never an
// npx-floated one (a floated runner breaks the heal loop; same rule as SKILL Step 3). No Playwright
// resolvable, or the browser cannot launch → clean refusal: a browserless environment (CI) has no
// probe by design, and recon there falls back to source reading + the heal loop.
//
//   exit 2 = browserless refusal (no pinned Playwright from cwd, or the browser failed to launch)
//   exit 3 = the daemon could not be reached or could not be started (`send` starts one itself, so
//            this is no longer the "you forgot to start it" code — read the log tail it prints)
//
// Zero dependencies, Node stdlib only, per the shipped-scripts convention.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pwproveRun } from './pwprove-run.mjs';
// The ONE shipped transform. The probe never hand-rolls a scrub: eight audited sessions each wrote
// their own, six in `node -e`, and seven needed two passes because a header-only scrub under-scrubs.
import {
  scrubHar,
  findResidue,
  findOverScrub,
  overScrubReport,
  shortSecretReport,
} from './har-scrub.mjs';

// Run ledger — registered before validation, so a refusal is recorded too.
pwproveRun(import.meta.url, 'recon');

const out = (s) => process.stdout.write(s);
const err = (s) => process.stderr.write(s);

const SOCK =
  process.env.PROBE_SOCK ||
  path.join(
    os.tmpdir(),
    `ptg-probe-${createHash('sha256').update(process.cwd()).digest('hex').slice(0, 12)}.sock`,
  );

// The ONE vocabulary. The usage text, the unknown-verb rejection and the header all read from here,
// so an agent can never learn a verb that does not exist or miss one that does — the audited sample
// shows the model reaching for verbs the DSL never had (`console` most often, now real) and learning
// the real ones only by rejection. `viewport` is deliberately absent: the effective viewport is
// resolved once during planning and pinned in the committed spec, and a probe verb that changed
// rendering outside that resolution would invite recon against a viewport the proof never uses.
const VERBS = [
  'navigate',
  'click',
  'fill',
  'wait',
  'snapshot',
  'eval',
  'console',
  'network-summary',
  'storage-state',
  'close',
];

const MODE = process.argv[2];
if (!['start', 'send', 'close'].includes(MODE)) {
  err(
    "probe.mjs: usage: node probe.mjs start | send '<json-batch>'|- | close\n" +
      `probe.mjs: batch verbs: ${VERBS.join(' | ')}\n` +
      "probe.mjs: each verb's arguments are documented in this script's header\n",
  );
  process.exit(1);
}

// --- eval's argument forms --------------------------------------------------------------------
// Forty-two percent of probe traffic is raw `eval`, and fifteen of twenty audited sessions paid one
// rejected call on first contact because they wrote the object shape the DSL did not take. Both
// object shapes below are now accepted alongside the string form, which is untouched: 250 recorded
// calls already use it. Resolved in ONE place, so the client's early rejection and the daemon's
// execution can never disagree about what a legal eval is.
function evalPlan(c) {
  const e = c.expression;
  if (typeof e === 'string') return { source: e, args: [] };
  if (e && typeof e === 'object' && !Array.isArray(e)) {
    // `fn` is the reserved discriminator — page.evaluate(fn, arg), the shape a model mirroring
    // Playwright itself reaches for. Everything else is read as a map of named expressions.
    if (typeof e.fn === 'string') return { source: e.fn, args: 'arg' in e ? [e.arg] : [] };
    const names = Object.keys(e);
    if (names.length && names.every((k) => typeof e[k] === 'string')) {
      // One round trip, several answers. Each value is parenthesised so an expression containing a
      // comma or an operator cannot leak into its neighbour.
      const body = names.map((k) => `${JSON.stringify(k)}: (${e[k]})`).join(', ');
      return { source: `(() => ({${body}}))()`, args: [] };
    }
  }
  throw new Error(
    'eval needs "expression" as a string ("location.href"), a function object ' +
      '({"fn":"a => a.id","arg":{...}}), or a map of named string expressions ' +
      '({"url":"location.href","title":"document.title"})',
  );
}

// --- the browserless gate: resolve the TARGET project's pinned Playwright, or refuse -------------
// createRequire from the cwd walks node_modules UP the tree, so a monorepo app dir resolves the
// hoisted install. Checked before any socket or launch work: this is the path CI proves.
function resolvePinnedPlaywright(subcommand) {
  const req = createRequire(path.join(process.cwd(), 'package.json'));
  for (const pkg of ['playwright', '@playwright/test', 'playwright-core']) {
    try {
      return req.resolve(pkg);
    } catch {
      /* try the next name */
    }
  }
  err(
    `probe: STOP — no pinned Playwright resolvable from ${process.cwd()}.\n` +
      "       The probe drives the TARGET project's own pinned Playwright, never an npx-floated\n" +
      `       one. Run \`${subcommand}\` from the app root of a project that installs @playwright/test.\n` +
      '       A browserless environment (CI) has no probe by design — recon there falls back to\n' +
      '       source reading + the heal loop. (exit 2)\n',
  );
  process.exit(2);
}

// ============================================================ client (send / close)
// A short-lived process per batch: write the batch, print the daemon's response verbatim, exit.
// This is the shape an agent's shell tool wants — the daemon holds the browser between calls.

function readBatch() {
  const arg = process.argv[3];
  if (arg === undefined) {
    err("probe.mjs: send needs a batch: send '<json>' or send - (batch on stdin)\n");
    process.exit(1);
  }
  const raw = arg === '-' ? fs.readFileSync(0, 'utf8') : arg;
  let batch;
  try {
    batch = JSON.parse(raw);
  } catch {
    err('probe.mjs: the batch is not valid JSON\n');
    process.exit(1);
  }
  const shaped =
    Array.isArray(batch) &&
    batch.length >= 1 &&
    batch.length <= 50 &&
    batch.every((c) => c !== null && typeof c === 'object' && typeof c.cmd === 'string');
  if (!shaped) {
    err('probe.mjs: the batch must be a JSON ARRAY of 1-50 {"cmd": ...} objects\n');
    process.exit(1);
  }
  // An eval the daemon could only reject is rejected HERE, before a browser is started for it —
  // same rule, one implementation. An unknown VERB is deliberately not caught here: the daemon
  // reports it per command and runs the rest of the batch, so one typo never costs nine answers.
  for (const [i, c] of batch.entries()) {
    if (c.cmd !== 'eval') continue;
    try {
      evalPlan(c);
    } catch (e) {
      err(`probe.mjs: command ${i + 1}: ${e.message}\n`);
      process.exit(1);
    }
  }
  return JSON.stringify(batch);
}

function client(payload) {
  const sock = net.connect(SOCK);
  // Per-command timeouts in the daemon bound a batch; 120s of silence means it is wedged, and a
  // hung client would block the whole recon session.
  sock.setTimeout(120000);
  sock.on('connect', () => sock.write(payload + '\n'));
  sock.on('data', (d) => out(d.toString()));
  // Exit naturally (no process.exit): a hard exit drops async stdout writes still in flight, so a
  // large recon response (a full snapshot, an all:true network-summary) captured through a pipe could
  // be silently truncated. Setting exitCode and letting the socket close drains the tail first.
  sock.on('end', () => { process.exitCode = 0; });
  sock.on('timeout', () => {
    sock.destroy();
    err('probe: the daemon did not answer within 120s — kill it and start a fresh one\n');
    process.exit(3);
  });
  sock.on('error', (e) => {
    err(
      `probe: no probe daemon at ${SOCK} (${e.code ?? e.message}).\n` +
        '       A `send` starts one itself, so reaching this means the daemon went away mid-batch —\n' +
        '       re-send. A bare `close` needs one already running, and closing nothing is not a\n' +
        '       failure to fix.\n',
    );
    process.exit(3);
  });
}

// --- sequencing: a batch sent before a start starts the daemon, then runs -----------------------
// All six probe failures in the audited sample were this one ordering mistake, surfacing as a run
// failure that said nothing about the application under test. Starting the daemon is something the
// probe can do for itself, so it does.
//
// The browserless gate still runs, and runs FIRST: in an environment with no pinned Playwright the
// operator sees the refusal that explains the environment (exit 2), not "no daemon" (exit 3). Exit 3
// now means what it says — a daemon that could not be reached or could not be started.
const connectOnce = (ms) =>
  new Promise((res) => {
    const s = net.connect(SOCK);
    const done = (v) => {
      s.destroy();
      res(v);
    };
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
    setTimeout(() => done(false), ms).unref();
  });

async function ensureDaemon() {
  if (await connectOnce(1000)) return;
  err(`probe: no daemon at ${SOCK} — starting one first (sequencing, not a failure)\n`);
  resolvePinnedPlaywright('send');
  // The autostarted daemon inherits cwd and environment, so a RECORD_HAR/BASE_URL set on this send
  // still takes effect — and is named here, because a daemon started with neither is a legal but
  // very different recon session and the operator must not have to guess which one they got.
  err(
    `probe: starting with BASE_URL=${process.env.BASE_URL || '(none)'} ` +
      `RECORD_HAR=${process.env.RECORD_HAR || '(none)'} ` +
      `STORAGE_STATE=${process.env.STORAGE_STATE || '(none)'}\n`,
  );
  const logPath = `${SOCK}.log`;
  let stdio = 'ignore';
  try {
    stdio = fs.openSync(logPath, 'a');
  } catch {
    /* an unwritable log never blocks a start */
  }
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'start'], {
    detached: true,
    stdio: ['ignore', stdio, stdio],
  });
  child.unref();
  if (typeof stdio === 'number') fs.closeSync(stdio);
  let died = null;
  child.on('exit', (code) => {
    died = code ?? 1;
  });
  // A cold browser launch is seconds, not milliseconds; PROBE_START_TIMEOUT is the ceiling.
  const budget = (Number(process.env.PROBE_START_TIMEOUT) || 60) * 1000;
  const deadline = Date.now() + budget;
  while (Date.now() < deadline) {
    if (await connectOnce(500)) {
      err(`probe: daemon ready (pid ${child.pid}) — running the batch\n`);
      return;
    }
    // A daemon that exited may still have lost a race to another start that is now listening, so
    // the socket is asked once more before this is called a failure.
    if (died !== null) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (await connectOnce(1000)) return;
  const tail = (() => {
    try {
      return fs.readFileSync(logPath, 'utf8').trimEnd().split('\n').slice(-6).join('\n  ');
    } catch {
      return '(no log)';
    }
  })();
  err(
    `probe: STOP — the daemon did not come up within ${budget / 1000}s` +
      `${died === null ? '' : ` (it exited ${died})`}. Its own output:\n  ${tail}\n`,
  );
  // A browserless daemon exits 2, and that is the answer worth propagating verbatim.
  process.exit(died === 2 ? 2 : 3);
}

if (MODE === 'send') {
  const payload = readBatch();
  // An unexpected throw in here must still leave through the script's own exit codes: an unhandled
  // rejection would print a Node stack trace where the probe's refusals are what a caller reads.
  void ensureDaemon()
    .then(() => client(payload))
    .catch((e) => {
      err(`probe: STOP — could not start a daemon: ${String(e?.message ?? e).split('\n')[0]}\n`);
      process.exit(3);
    });
}
if (MODE === 'close') client('[{"cmd":"close"}]');

// ============================================================ daemon (start)

if (MODE === 'start') {
  const IDLE = Number(process.env.PROBE_IDLE ?? 300);
  if (!Number.isFinite(IDLE) || IDLE <= 0) {
    err(`probe.mjs: PROBE_IDLE must be a positive number of seconds (got '${process.env.PROBE_IDLE}')\n`);
    process.exit(1);
  }

  const resolved = resolvePinnedPlaywright('start');

  const daemon = async () => {
    // A second `start` against a live daemon is a mistake worth catching before we launch a
    // browser; a stale socket file left by a SIGKILLed daemon is just removed.
    const alive = await new Promise((res) => {
      const s = net.connect(SOCK);
      const done = (v) => {
        s.destroy();
        res(v);
      };
      s.once('connect', () => done(true));
      s.once('error', () => done(false));
      setTimeout(() => done(false), 1000).unref();
    });
    if (alive) {
      err(
        `probe: a daemon is already listening at ${SOCK} — use send/close, not a second start.\n` +
          '       A `send` starts a daemon when none is running, and it inherits THAT command\'s\n' +
          '       environment — so if this start was meant to set BASE_URL/RECORD_HAR/STORAGE_STATE,\n' +
          '       the running daemon does not have them: `node probe.mjs close`, then start again.\n',
      );
      process.exit(1);
    }
    fs.rmSync(SOCK, { force: true });

    let browser;
    let chromium;
    try {
      const mod = await import(pathToFileURL(resolved).href);
      chromium = mod.chromium ?? mod.default?.chromium;
      if (!chromium) throw new Error(`${resolved} exports no chromium`);
      browser = await chromium.launch();
    } catch (e) {
      err(
        `probe: STOP — the pinned Playwright could not open a browser here: ` +
          `${String(e.message ?? e).split('\n')[0]}\n` +
        '       If browsers are missing: npx playwright install chromium. A browserless\n' +
        '       environment has no probe by design. (exit 2)\n',
      );
      process.exit(2);
    }

    // RECORD_HAR set -> the recon pass ALSO records an API-scoped HAR (HAR_URL_FILTER, default
    // `**/api/**`) that the deliverable spec replays via routeFromHAR — recon and HAR capture happen
    // in the SAME live pass. Playwright flushes the HAR when the context closes.
    //
    // The capture is authenticated, so it is SCRUBBED AT CAPTURE, not before commit (issue #41).
    // Playwright can only flush to a path, so the raw flush goes to a private staging file that this
    // shutdown scrubs and then destroys; the path the operator named only ever receives the scrubbed
    // result. That is what makes "the HAR is never unscrubbed on disk" true rather than aspirational,
    // and it removes the placement decision seven audited sessions each made alone and did not agree
    // on — one of them scrubbing a recording the final spec never used.
    //
    // Staging is a 0700 directory in $TMPDIR, outside the working tree, and it is destroyed on every
    // exit this process can observe (explicit close, idle self-close, SIGINT, SIGTERM). A SIGKILLed
    // daemon is the one case that leaves it behind — private, outside the repo, and impossible to
    // stage by accident, which is the property that matters.
    const HAR_TARGET = process.env.RECORD_HAR || null;
    let harStageDir = null;
    try {
      if (HAR_TARGET) harStageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwprove-har-'));
    } catch (e) {
      err(
        `probe: STOP — RECORD_HAR is set but no private staging directory could be created in ` +
          `${os.tmpdir()} (${e.code ?? e.message}).\n` +
          '       The recording is not made rather than made unscrubbed. Fix TMPDIR, or unset\n' +
          '       RECORD_HAR and re-record once it is writable. (exit 2)\n',
      );
      process.exit(2);
    }
    const harStage = harStageDir ? path.join(harStageDir, 'capture.har') : null;
    const context = await browser.newContext({
      baseURL: process.env.BASE_URL || undefined,
      storageState: process.env.STORAGE_STATE || undefined,
      ...(harStage
        ? { recordHar: { path: harStage, urlFilter: process.env.HAR_URL_FILTER || '**/api/**' } }
        : {}),
    });
    const page = await context.newPage();
    // A surprise alert()/confirm() would wedge every later command behind a modal nobody can see.
    page.on('dialog', (d) => d.dismiss().catch(() => {}));

    // --- console log: the recon question that had no answer ------------------------------------
    // A page that renders an empty shell usually said why in the console, and until now the probe
    // had no way to ask. Uncaught page errors land in the same buffer, because "the surface is
    // blank" and "the surface threw" are the same question asked twice. Reset on navigate, like the
    // network log — a summary is per page, not per session — and bounded, so a chatty app cannot
    // grow the daemon's memory across a long recon.
    const CONSOLE_CAP = 500;
    const consoleLog = [];
    const pushConsole = (type, text) => {
      consoleLog.push({ type, text: String(text ?? '').split('\n')[0].slice(0, 300) });
      if (consoleLog.length > CONSOLE_CAP) consoleLog.shift();
    };
    page.on('console', (m) => pushConsole(m.type(), m.text()));
    page.on('pageerror', (e) => pushConsole('pageerror', e?.message ?? e));

    // --- network log: aggregated per method+path, reset on navigate ----------------------------
    // The summary answers "what does this surface actually call" (mock targets, observed query
    // suffixes) without ever dumping request bodies.
    const netLog = new Map();
    const keyOf = (r) => {
      try {
        const u = new URL(r.url());
        return `${r.method()} ${u.origin}${u.pathname}`;
      } catch {
        return `${r.method()} ${r.url()}`;
      }
    };
    context.on('request', (r) => {
      const k = keyOf(r);
      const e = netLog.get(k) ?? { count: 0, status: '…', type: r.resourceType(), last: r.url() };
      e.count += 1;
      e.last = r.url();
      netLog.set(k, e);
    });
    context.on('response', (resp) => {
      const e = netLog.get(keyOf(resp.request()));
      if (e) e.status = String(resp.status());
    });
    context.on('requestfailed', (r) => {
      const e = netLog.get(keyOf(r));
      if (e) e.status = `FAILED ${r.failure()?.errorText ?? ''}`.trim();
    });

    // --- the capture-time scrub ----------------------------------------------------------------
    // Runs inside shutdown, immediately after the context flushed its recording to the private
    // staging file: read it, scrub it with the shipped transform, write the operator's path, and
    // destroy the staging directory on every path out — including the failures, because a capture
    // this cannot scrub is a capture it must not copy into a working tree.
    //
    // It never prints a credential. Residue is reported by location, kind and length only, the same
    // contract `har-scrub.mjs --verify` holds.
    function scrubCaptureToTarget() {
      const filter = process.env.HAR_URL_FILTER || '**/api/**';
      const drop = () => fs.rmSync(harStageDir, { recursive: true, force: true });
      const staged = (() => {
        try {
          return fs.statSync(harStage).size;
        } catch {
          return -1;
        }
      })();
      if (staged <= 0) {
        drop();
        err(
          `probe: WARNING — RECORD_HAR was set but no HAR landed at ${HAR_TARGET}. Nothing matched\n` +
            `       ${filter}, or the path is unwritable. Do NOT\n` +
            '       commit a routeFromHAR spec against a HAR that does not exist.\n',
        );
        return;
      }
      let har;
      try {
        har = JSON.parse(fs.readFileSync(harStage, 'utf8'));
      } catch (e) {
        drop();
        err(
          `probe: STOP — the recorded HAR did not parse (${String(e.message ?? e).split('\n')[0]}).\n` +
            `       Nothing was written to ${HAR_TARGET}: an unscrubbed capture is never copied into\n` +
            '       the working tree. Re-run the recon pass.\n',
        );
        return;
      }
      // Loopback origins are canonicalised in the same pass, so the committed recording is not bound
      // to the port this run happened to get (`har-scrub.mjs --origin` re-points it before replay).
      let secrets = 0;
      let withheld = [];
      try {
        ({ secrets, withheld } = scrubHar(har, {}));
        // The over-scrub gate, BEFORE the write: a scrub whose substitution count is implausible
        // destroyed the recording (a two-character locale cookie substituted 125,403 times — see
        // `docs/studies/live-proof-pr2866.md` §1), and a destroyed capture must never reach the
        // working tree, where a residue check would go on calling it clean. The refusal text is the
        // shipped one, imported like the transform itself, so this cannot drift from `--verify`.
        const wrecked = findOverScrub(har);
        if (wrecked.length) {
          // `finally` below destroys the staging directory on this path out too, so neither the
          // wreckage nor the raw authenticated capture survives.
          err(overScrubReport(wrecked, 'probe', HAR_TARGET));
          err(`       Nothing was written to ${HAR_TARGET}. Re-record the recon pass.\n`);
          return;
        }
        fs.mkdirSync(path.dirname(path.resolve(HAR_TARGET)), { recursive: true });
        fs.writeFileSync(HAR_TARGET, `${JSON.stringify(har, null, 2)}\n`);
      } catch (e) {
        err(
          `probe: STOP — the capture could not be scrubbed to ${HAR_TARGET} ` +
            `(${e.code ?? String(e.message ?? e).split('\n')[0]}).\n` +
            '       The raw capture was destroyed rather than written unscrubbed.\n',
        );
        return;
      } finally {
        drop();
      }
      const size = (() => {
        try {
          return fs.statSync(HAR_TARGET).size;
        } catch {
          return 0;
        }
      })();
      err(
        `probe: HAR written ${HAR_TARGET} (${size} bytes, filter ${filter}) — ` +
          `scrubbed at capture, ${secrets} secret(s) placeheld, loopback origins canonicalised\n`,
      );
      // Short values are placeheld where they were found and never swept across the recording. Say
      // which, by learn site and length only, so a short-but-real secret is reported and not skipped.
      err(shortSecretReport(withheld, 'probe'));
      // The same residue check the pre-commit refusal runs, so the two can never disagree. A scrub
      // that left something behind must say so HERE, while the recon context is still the thing the
      // operator is looking at — not six steps later.
      const left = findResidue(har);
      if (left.length) {
        err(`probe: REFUSED — ${left.length} credential residue(s) SURVIVED the scrub in ${HAR_TARGET}\n`);
        for (const h of left) err(`  ${h.where}  ${h.kind}  (len ${h.len})\n`);
        err(
          '       Do NOT commit this HAR. A leaked bearer in a committed HAR is the same incident\n' +
            '       as one in a log line.\n',
        );
      }
    }

    // --- shutdown: explicit close, idle timeout, or signal — all one path ----------------------
    let closing = false;
    const shutdown = async (why) => {
      if (closing) return;
      closing = true;
      err(`probe: closing (${why}) — no zombie browser outlives the session\n`);
      // The context closes FIRST and on its own: Playwright flushes recordHar on context close, and
      // browser.close() alone does not produce the file. Skipping this made RECORD_HAR a silent
      // no-op — the recon pass reported clean, wrote nothing, and the spec fell back to hand-mocks.
      try {
        await context.close();
      } catch {
        /* already gone */
      }
      if (HAR_TARGET) scrubCaptureToTarget();
      try {
        await browser.close();
      } catch {
        /* already gone */
      }
      fs.rmSync(SOCK, { force: true });
      process.exit(0);
    };
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));

    let idleTimer;
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => void shutdown(`idle ${IDLE}s`), IDLE * 1000);
    };

    // --- the commands ---------------------------------------------------------------------------
    const CAP = { snapshotLines: 120, evalChars: 2000, networkRows: 80 };
    const pageOrigin = () => {
      try {
        return new URL(page.url()).origin;
      } catch {
        return '';
      }
    };

    async function runCommand(c) {
      const t = Number(c.timeout) || 5000;
      switch (c.cmd) {
        case 'navigate': {
          if (typeof c.url !== 'string') throw new Error('navigate needs a string "url"');
          netLog.clear();
          consoleLog.length = 0;
          const resp = await page.goto(c.url, { waitUntil: 'load', timeout: Number(c.timeout) || 15000 });
          // Grace for the XHRs a load event does not wait for — they are the network-summary's food.
          await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
          const status = resp ? `HTTP ${resp.status()}` : 'no response (in-page route?)';
          return `navigate ${page.url()} -> ${status} "${await page.title()}"`;
        }
        case 'click': {
          if (typeof c.selector !== 'string') throw new Error('click needs a string "selector"');
          await page.locator(c.selector).click({ timeout: t });
          return `click ${c.selector} -> ok`;
        }
        case 'fill': {
          if (typeof c.selector !== 'string') throw new Error('fill needs a string "selector"');
          await page.locator(c.selector).fill(String(c.value ?? ''), { timeout: t });
          return `fill ${c.selector} -> ok`;
        }
        case 'wait': {
          // Both forms: "selector" for a condition, "ms" for a settle. A batch without a settle-wait
          // is the most common reason an agent gives up on the probe and reaches for the test runner.
          if (typeof c.selector === 'string') {
            await page.locator(c.selector).waitFor({ state: c.state || 'visible', timeout: t });
            return `wait ${c.selector} (${c.state || 'visible'}) -> ok`;
          }
          const ms = Number(c.ms);
          if (!Number.isFinite(ms) || ms < 0) throw new Error('wait needs a "ms" number or a "selector"');
          await page.waitForTimeout(ms);
          return `wait ${ms}ms -> ok`;
        }
        case 'snapshot': {
          const scope = typeof c.selector === 'string' ? c.selector : 'body';
          const loc = page.locator(scope);
          if (typeof loc.ariaSnapshot !== 'function') {
            throw new Error('this Playwright predates locator.ariaSnapshot() (needs >=1.49) — use eval');
          }
          const lines = (await loc.ariaSnapshot({ timeout: t })).split('\n');
          const max = Number(c.max) || CAP.snapshotLines;
          const cut =
            lines.length > max
              ? `\n… truncated (${lines.length - max} more lines — scope with "selector" or raise "max")`
              : '';
          return `snapshot ${scope} (${lines.length} lines)\n${lines.slice(0, max).join('\n')}${cut}`;
        }
        case 'eval': {
          // String, {fn, arg} or a named map — one resolver, shared with the client's early check.
          const plan = evalPlan(c);
          const v = await page.evaluate(plan.source, ...plan.args);
          let s;
          try {
            s = JSON.stringify(v) ?? String(v);
          } catch {
            s = String(v);
          }
          // "out" is the escape hatch for a result too big to read through the transcript — truncated
          // JSON is unparsable, and reconstructing it by hand is what produces throwaway specs.
          if (typeof c.out === 'string') {
            fs.writeFileSync(c.out, s);
            return `eval -> ${s.length} chars written to ${c.out}`;
          }
          const max = Number(c.max) || CAP.evalChars;
          if (s.length > max) {
            s = `${s.slice(0, max)}… truncated (${s.length} chars — raise "max" or use "out")`;
          }
          return `eval -> ${s}`;
        }
        case 'console': {
          if (c.level !== undefined && typeof c.level !== 'string') {
            throw new Error('console "level" must be a string ("error", "warning", "pageerror", …)');
          }
          const wanted = c.level ? consoleLog.filter((m) => m.type === c.level) : consoleLog;
          const max = Number(c.max) || 50;
          const shown = wanted.slice(-max);
          const cut =
            wanted.length > shown.length
              ? `\n… truncated (${wanted.length - shown.length} older messages — raise "max")`
              : '';
          const scope = c.level ? ` at level ${c.level}` : '';
          return (
            `console (${wanted.length} message(s)${scope} since last navigate)` +
            (shown.length ? `\n${shown.map((m) => `${m.type}: ${m.text}`).join('\n')}` : '') +
            cut
          );
        }
        case 'network-summary': {
          const origin = pageOrigin();
          // Mock targets are documents and xhr/fetch calls; a dev server's module soup (a Nuxt/Vite
          // page loads 100+ scripts) would bury them. "all": true when the asset traffic matters.
          const wanted = ([, e]) => c.all === true || ['document', 'xhr', 'fetch'].includes(e.type);
          const total = netLog.size;
          const rows = [...netLog.entries()].filter(wanted).map(([key, e]) => {
            const [method, full] = [key.slice(0, key.indexOf(' ')), key.slice(key.indexOf(' ') + 1)];
            const shown = full.startsWith(origin) ? full.slice(origin.length) : full;
            let search = '';
            try {
              search = new URL(e.last).search;
            } catch {
              /* non-URL request */
            }
            return `${method} ${shown}${search} -> ${e.status} ${e.type} x${e.count}`;
          });
          const cut =
            rows.length > CAP.networkRows
              ? `\n… truncated (${rows.length - CAP.networkRows} more endpoints)`
              : '';
          const skipped =
            c.all === true ? '' : ` (+${total - rows.length} asset/script endpoints — "all": true to list)`;
          return (
            `network-summary (${rows.length} endpoints since last navigate${skipped})` +
            (rows.length ? `\n${rows.slice(0, CAP.networkRows).join('\n')}` : '')
          ) + cut;
        }
        case 'storage-state': {
          // The bridge between Step 3's auth ladder and Step 8's film: mint the session once here,
          // hand the file to the spec. STORAGE_STATE loads one at start; this saves one back.
          if (typeof c.path !== 'string') throw new Error('storage-state needs a "path"');
          await context.storageState({ path: c.path });
          return `storage-state -> ${c.path} (live session — keep it under a gitignored path)`;
        }
        case 'close':
          return 'closing — browser down, socket removed';
        default:
          // Names the WHOLE vocabulary, from the one list the usage text also prints: a rejection
          // that shows only the verb you got wrong is how a model learns the DSL one error at a time.
          throw new Error(`unknown cmd '${c.cmd}' (${VERBS.join('|')})`);
      }
    }

    // --- the socket server: one newline-terminated batch per connection ------------------------
    async function handleBatch(raw, sock) {
      resetIdle();
      let batch;
      try {
        batch = JSON.parse(raw);
      } catch {
        sock.end('ERROR: unparsable batch\n');
        return;
      }
      if (!Array.isArray(batch)) {
        sock.end('ERROR: the batch must be a JSON array\n');
        return;
      }
      let wantClose = false;
      for (let i = 0; i < batch.length; i++) {
        const c = batch[i] ?? {};
        let line;
        try {
          line = await runCommand(c);
        } catch (e) {
          line = `${c.cmd ?? '?'} ERROR: ${String(e.message ?? e).split('\n')[0].slice(0, 300)}`;
        }
        sock.write(`[${i + 1}] ${line}\n`);
        // Per command, not per batch: a legal 50-command batch of slow navigates outlasts
        // PROBE_IDLE, and a daemon mid-work is not idle.
        resetIdle();
        if (c.cmd === 'close') {
          wantClose = true;
          break;
        }
      }
      sock.end();
      if (wantClose) await shutdown('explicit close');
    }

    // Batches run strictly one at a time across ALL connections: concurrent sends would interleave
    // on the single page, and one batch's navigate (netLog.clear()) would corrupt the other's
    // network-summary. ponytail: one global queue — revisit only if the probe ever grows tabs.
    let queue = Promise.resolve();
    const server = net.createServer((sock) => {
      let buf = '';
      sock.on('error', () => {});
      sock.on('data', (d) => {
        buf += d;
        const nl = buf.indexOf('\n');
        if (nl === -1) return;
        const raw = buf.slice(0, nl);
        buf = '';
        queue = queue.then(() => handleBatch(raw, sock)).catch(() => {});
      });
    });
    server.on('error', (e) => {
      err(`probe: cannot listen on ${SOCK}: ${e.message}\n`);
      void shutdown('listen error');
    });
    server.listen(SOCK, () => {
      resetIdle();
      err(`probe: ready — pid ${process.pid}, socket ${SOCK}, idle self-close ${IDLE}s\n`);
      err(`probe: playwright ${path.dirname(resolved)}\n`);
      if (process.env.BASE_URL) err(`probe: baseURL ${process.env.BASE_URL}\n`);
    });
  };

  daemon().catch((e) => {
    err(`probe: unexpected failure: ${String(e?.stack ?? e)}\n`);
    process.exit(1);
  });
}
