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
//   node probe.mjs warm <url>          # one-shot UNFILMED browser load — the Step-7 warm lead
//
//   BASE_URL       optional, `start` — context baseURL; `navigate` then accepts relative paths.
//   STORAGE_STATE  optional, `start` — storageState file for the context (Step 3 auth table).
//   RECORD_HAR     optional, `start` — path to record an API-scoped HAR of the recon pass, flushed
//                  on context close; the deliverable spec replays it via routeFromHAR.
//   HAR_URL_FILTER optional, `start` — HAR glob (default `**/api/**`); pairs with RECORD_HAR.
//   PROBE_IDLE     optional, `start` — idle seconds before self-close (default 300), so no zombie
//                  browser outlives a session even when the agent forgets to `close`.
//   PROBE_SOCK     optional — Unix-socket path (default: $TMPDIR/ptg-probe-<cwd-hash>.sock, so each
//                  project root gets its own daemon).
//   PROBE_WARM_TIMEOUT optional, `warm` — navigation timeout ms (default 120000).
//
// `warm` exists because the Step-7 warm lead used to be a `curl`, and a curl warms the wrong half.
// It fetches the HTML document; it never executes JS, so it never requests the client module graph
// and never makes Vite discover-and-pre-bundle its deps (Vite's own docs: a dep found after server
// start makes it "re-run the dep bundling process and reload the page if needed" — driven by real
// module requests, which curl does not make). On a Vite-family dev server the browser then pays the
// whole 20s+ inside the recorded context, because Playwright video is context-scoped: recording
// starts at context creation and there is no delayed-start or trim option. You cannot warm inside
// the context you are filming. So `warm` warms from a SEPARATE short-lived process: same server-side
// caches (route transform, optimizeDeps), no video, nothing to edit afterwards.
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
//                                                      writes the FULL result to a file instead
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
//   exit 3 = no daemon listening at the socket (start one: `node probe.mjs start`)
//
// Zero dependencies, Node stdlib only, per the shipped-scripts convention.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pwproveRun } from './pwprove-run.mjs';

// Run ledger — registered before validation. The phase splits on the subcommand so the ledger can
// answer "what did the warm lead cost this run?", which is the whole reason `warm` exists.
pwproveRun(import.meta.url, process.argv[2] === 'warm' ? 'warm' : 'recon');

const out = (s) => process.stdout.write(s);
const err = (s) => process.stderr.write(s);

const SOCK =
  process.env.PROBE_SOCK ||
  path.join(
    os.tmpdir(),
    `ptg-probe-${createHash('sha256').update(process.cwd()).digest('hex').slice(0, 12)}.sock`,
  );

const MODE = process.argv[2];
if (!['start', 'send', 'close', 'warm'].includes(MODE)) {
  err(
    "probe.mjs: usage: node probe.mjs start | send '<json-batch>'|- | close | warm <url>" +
      '   (see the header)\n',
  );
  process.exit(1);
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
      `probe: no probe daemon at ${SOCK} (${e.code ?? e.message}) — start one from the app root: ` +
        'node probe.mjs start\n',
    );
    process.exit(3);
  });
}

if (MODE === 'send') client(readBatch());
if (MODE === 'close') client('[{"cmd":"close"}]');

// ============================================================ warm (one-shot, unfilmed)
// Deliberately NOT a daemon command: by Step 7 the recon daemon is closed, and the warm must be a
// process the proof run can neither see nor record. No video, no HAR, no storageState — the only
// artifact is the server-side cache state left behind.
//
// Failure policy mirrors the curl it replaces: a warm that did not land is REPORTED, never fatal.
// The one exception is the browserless refusal (exit 2), which is a signal, not a failure — it tells
// the caller to fall back to the curl warm.
if (MODE === 'warm') {
  const arg = process.argv[3];
  if (!arg) {
    err('probe.mjs: warm needs a url: warm <url>   (relative is allowed when BASE_URL is set)\n');
    process.exit(1);
  }
  const base = (process.env.BASE_URL ?? '').replace(/\/+$/, '');
  const url = /^https?:\/\//.test(arg) ? arg : `${base}${arg.startsWith('/') ? '' : '/'}${arg}`;
  if (!/^https?:\/\//.test(url)) {
    err(`probe.mjs: '${arg}' is relative and BASE_URL is not set — pass an absolute url\n`);
    process.exit(1);
  }
  const timeout = Number(process.env.PROBE_WARM_TIMEOUT ?? 120000);
  const resolved = resolvePinnedPlaywright('warm');
  const started = Date.now();

  const warm = async () => {
    let browser;
    try {
      const mod = await import(pathToFileURL(resolved).href);
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (!chromium) throw new Error(`${resolved} exports no chromium`);
      browser = await chromium.launch();
    } catch (e) {
      err(
        'probe: STOP — the pinned Playwright could not open a browser here: ' +
          `${String(e.message ?? e).split('\n')[0]}\n` +
          '       Fall back to the curl warm; the clip will be boot-heavy. (exit 2)\n',
      );
      process.exit(2);
    }
    try {
      const page = await browser.newPage();
      const resp = await page.goto(url, { waitUntil: 'load', timeout });
      // The `load` event fires before a Vite-family app has finished discovering deps — and it is
      // exactly that discovery pass (and the reload it can trigger) we are here to pay for. A short
      // networkidle grace absorbs it; expiring is fine, the transform work already happened.
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      out(`warm: ${resp?.status() ?? 'no-response'} ${url} in ${Date.now() - started}ms\n`);
    } catch (e) {
      out(`warm-failed: ${url} — ${String(e.message ?? e).split('\n')[0].slice(0, 200)}\n`);
    } finally {
      await browser.close().catch(() => {});
    }
  };

  warm().catch((e) => {
    // Unreachable in practice — warm() swallows navigation failure by contract. If it ever throws,
    // still do not fail the run: the caller treats a warm miss as a report line.
    out(`warm-failed: ${url} — ${String(e?.message ?? e).split('\n')[0].slice(0, 200)}\n`);
  });
}

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
      err(`probe: a daemon is already listening at ${SOCK} — use send/close, not a second start\n`);
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
    // in the SAME live pass. Playwright flushes the HAR when the context closes. Auth headers must be
    // scrubbed before commit.
    const context = await browser.newContext({
      baseURL: process.env.BASE_URL || undefined,
      storageState: process.env.STORAGE_STATE || undefined,
      ...(process.env.RECORD_HAR
        ? { recordHar: { path: process.env.RECORD_HAR, urlFilter: process.env.HAR_URL_FILTER || '**/api/**' } }
        : {}),
    });
    const page = await context.newPage();
    // A surprise alert()/confirm() would wedge every later command behind a modal nobody can see.
    page.on('dialog', (d) => d.dismiss().catch(() => {}));

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
      if (process.env.RECORD_HAR) {
        const p = process.env.RECORD_HAR;
        const size = (() => {
          try {
            return fs.statSync(p).size;
          } catch {
            return -1;
          }
        })();
        err(
          size > 0
            ? `probe: HAR written ${p} (${size} bytes, filter ${process.env.HAR_URL_FILTER || '**/api/**'})\n`
            : `probe: WARNING — RECORD_HAR was set but no HAR landed at ${p}. Nothing matched\n` +
              `       ${process.env.HAR_URL_FILTER || '**/api/**'}, or the path is unwritable. Do NOT\n` +
              `       commit a routeFromHAR spec against a HAR that does not exist.\n`,
        );
      }
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
          if (typeof c.expression !== 'string') throw new Error('eval needs a string "expression"');
          const v = await page.evaluate(c.expression);
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
          throw new Error(
            `unknown cmd '${c.cmd}' ` +
              '(navigate|click|fill|wait|snapshot|eval|network-summary|storage-state|close)',
          );
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
