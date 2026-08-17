#!/usr/bin/env node
// Classify every request a proof run made: which ones the browser actually put on the network,
// and which ones a mock answered in-browser. This is the mechanical half of the Step-7 hermetic
// audit — the half that was being re-derived as throwaway trace parsers on every run.
//
//   node hermetic.mjs [<test-results dir>] [--spec <spec file>] [--all]
//     <test-results dir>  default: test-results
//     --spec <file>       also scan the spec for round-trips the trace CANNOT see (see below)
//     --all               list asset/document loads too (default: XHR/fetch only, per the contract)
//
// It does NOT render a verdict. Matching the live list against the spec's `// CARVE-OUT:` lines is
// a judgement call about intent, and that stays with the agent — this script only guarantees the
// list it judges is complete and honestly classified.
//
// How the classification works (verified against Playwright 1.61 traces):
//   • a request the browser put on the wire carries `serverIPAddress` in the trace's resource
//     snapshot — even on a keep-alive reuse where `timings.connect` is -1
//   • a `route.fulfill()` response has NO `serverIPAddress` and only the headers the fulfil supplied
//   • an aborted/failed request has `status: -1` and a `_failureText`
//
// THE ONE THING A TRACE CANNOT SEE: `route.fetch()` / `request.fetch()` (the patch-in-flight
// idiom) performs the round-trip from the PLAYWRIGHT process and hands the browser a fulfilled
// response — so the trace records it as mocked while a real request left the machine. Missing that
// would make this script report "hermetic" over live traffic, which is the exact silent-pass class
// this bundle exists to prevent. `--spec` greps for those call sites and reports them separately;
// pass it, and declare what it finds as a carve-out or replace it with a static mock.
//
// Needs `unzip` (traces are zip archives). Exit: 0 report produced · 1 usage · 2 no traces found
// (the proof run must set `trace: 'on'` — the committed proof config does).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pwproveRun } from './pwprove-run.mjs';

pwproveRun(import.meta.url, 'audit');

const out = (s) => process.stdout.write(s);
const err = (s) => process.stderr.write(s);

const argv = process.argv.slice(2);
let DIR = 'test-results';
let SPEC = null;
let ALL = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--spec') SPEC = argv[++i];
  else if (a === '--all') ALL = true;
  else if (a.startsWith('-')) {
    err(`hermetic.mjs: unknown flag '${a}'\nusage: hermetic.mjs [<test-results dir>] [--spec <file>] [--all]\n`);
    process.exit(1);
  } else DIR = a;
}

// Traces live one level down per test: test-results/<test-slug>/trace.zip
const traces = [];
const walk = (d, depth = 0) => {
  let entries = [];
  try {
    entries = fs.readdirSync(d, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(d, e.name);
    if (e.isDirectory() && depth < 3) walk(p, depth + 1);
    else if (e.isFile() && e.name.endsWith('.zip') && e.name.includes('trace')) traces.push(p);
  }
};
walk(DIR);

if (traces.length === 0) {
  err(
    `hermetic: STOP — no trace.zip under '${DIR}'. The proof run must record traces ` +
      "(trace: 'on' — the committed proof config sets it). Re-run the proof, then re-audit.\n",
  );
  process.exit(2);
}

// `unzip -p <zip> '*.network'` streams every network sidecar (one JSONL per browser context).
function networkLines(zip) {
  const r = spawnSync('unzip', ['-p', zip, '*.network'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error) {
    err(`hermetic: STOP — cannot run unzip (${r.error.message}). It is required to read traces.\n`);
    process.exit(1);
  }
  return (r.stdout ?? '').split('\n').filter(Boolean);
}

const API_KINDS = new Set(['fetch', 'xhr']);
const live = new Map(); //   key -> {count, statuses:Set, tests:Set}
const mocked = new Map();
const failed = new Map();
let assetCount = 0;

const bump = (map, key, status, test) => {
  const cur = map.get(key) ?? { count: 0, statuses: new Set(), tests: new Set() };
  cur.count++;
  if (status != null) cur.statuses.add(status);
  cur.tests.add(test);
  map.set(key, cur);
};

for (const zip of traces) {
  const testName = path.basename(path.dirname(zip));
  for (const line of networkLines(zip)) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const snap = e.snapshot ?? e;
    const req = snap.request;
    if (!req?.url) continue;
    const kind = snap._resourceType ?? snap.resourceType ?? '';
    const isApi = API_KINDS.has(kind);
    if (!isApi && !ALL) {
      assetCount++;
      continue;
    }
    // Query strings are per-run noise (ids, cache-busters); the ORIGIN + PATH is the thing a
    // carve-out is declared against.
    let key;
    try {
      const u = new URL(req.url);
      key = `${req.method} ${u.origin}${u.pathname}`;
    } catch {
      key = `${req.method} ${req.url}`;
    }
    const status = snap.response?.status;
    if (status === -1 || snap.response?._failureText) bump(failed, key, snap.response?._failureText, testName);
    else if (snap.serverIPAddress) bump(live, key, status, testName);
    else bump(mocked, key, status, testName);
  }
}

const render = (title, map, note) => {
  const total = [...map.values()].reduce((a, b) => a + b.count, 0);
  out(`\n${title}: ${map.size} distinct (${total} request${total === 1 ? '' : 's'})${note ? ` — ${note}` : ''}\n`);
  for (const [k, v] of [...map.entries()].sort()) {
    const st = [...v.statuses].filter((s) => s != null).join(',');
    out(`  ${k}  ×${v.count}${st ? ` [${st}]` : ''}  (${v.tests.size} test${v.tests.size === 1 ? '' : 's'})\n`);
  }
};

out(`--- hermetic audit --- ${traces.length} trace(s) under ${DIR}\n`);
render('LIVE — the browser reached the network', live, 'each one must be a declared CARVE-OUT');
render('MOCKED — answered in-browser', mocked);
if (failed.size) render('FAILED / ABORTED', failed, 'expected for blocked third parties');
if (!ALL) out(`\n(${assetCount} document/asset load(s) omitted — pass --all to list them)\n`);

// The blind spot the trace cannot cover. Reported even when zero, because "the check ran and found
// none" and "nobody checked" must not look the same in a transcript.
if (SPEC) {
  let src = '';
  try {
    src = fs.readFileSync(SPEC, 'utf8');
  } catch {
    err(`hermetic: could not read --spec '${SPEC}'\n`);
    process.exit(1);
  }
  // ANY receiver, because the idiom is usually `page.route('…', async r => { const x = await
  // r.fetch() … })` — matching only `route.fetch`/`request.fetch` misses the one-letter parameter
  // name real specs use, which is how this check silently passed a live round-trip during its own
  // spike. `window.fetch`/`globalThis.fetch` and a bare `fetch(` are browser-side code inside
  // page.evaluate — the trace DOES see those, so they are excluded here.
  const hits = src
    .split('\n')
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /\b(?!window\.|globalThis\.|self\.)\w+\.fetch\s*\(/.test(l));
  out(`\nIN-SPEC LIVE ROUND-TRIPS (route.fetch / request.fetch): ${hits.length}\n`);
  for (const [n, l] of hits) out(`  ${SPEC}:${n}  ${l.trim().slice(0, 110)}\n`);
  if (hits.length)
    out(
      '  ^ these leave the machine but appear MOCKED above — the trace records the browser, not\n' +
        '    the Playwright process. Declare them as carve-outs or replace them with static mocks.\n',
    );
} else {
  out('\nIN-SPEC LIVE ROUND-TRIPS: not checked — pass --spec <file> (route.fetch is invisible here).\n');
}

out('\nverdict: match every LIVE line (and every in-spec round-trip) against the spec\'s CARVE-OUT\n');
out('header. Any undeclared one FAILS the run even though the tests passed.\n');
