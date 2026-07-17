#!/usr/bin/env node
// preflight.mjs — confirm the app is READY before the pipeline drives it (SKILL Step 3).
// One job: a warmup-aware readiness poll. A dead or still-booting origin STOPs here (exit 3) so it
// fails fast instead of throwing opaque errors three steps later.
//
// This script does NOT start a server, mint auth, or recon the DOM. The AGENT owns the server
// lifecycle (pick the port, start THIS worktree's dev server in a background shell) — a
// script-started `dev` can bind a sibling worktree on the WRONG branch. Auth and selector recon
// happen in the spec / first run (SKILL Step 3), not here.
//
//   BASE_URL=http://localhost:4000 node preflight.mjs
//
//   BASE_URL       required — the server you already started on this worktree's resolved port.
//   READY_TIMEOUT  optional — seconds to wait (default 90; a cold dev server's first heavy route
//                  can compile for ~1 min).
//   PROBE_HOSTING  optional — set to 1 in PR-mode: also probe the Step-8 watch-link prerequisites
//                  (wrangler auth, Chrome, ffmpeg) NOW, while there is still time to fix them —
//                  not after filming. WARN-only: hosting never blocks readiness; the summary
//                  reports HOSTING_READY=yes|no.
//
//   exit 3 = not ready
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ptgRun } from './ptg-run.mjs';

const out = (s) => process.stdout.write(s);
const warn = (s) => process.stderr.write(s);

// Run ledger + version banner (issue #5). The banner is the FIRST output line, before any
// validation, so every run's transcript records what executed — stale-install drift is visible at
// a glance instead of discovered mid-run.
const SKILL = ptgRun(import.meta.url, 'readiness');
out(`preflight: ${SKILL.skill} v${SKILL.version} (${SKILL.commit})\n`);

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) {
  warn(
    'preflight.mjs: set BASE_URL to the server you already started on this worktree resolved port ' +
      '(see SKILL Step 3)\n',
  );
  process.exit(1);
}
// Validate rather than coerce. A non-numeric READY_TIMEOUT makes `waited >= NaN` forever false, and
// the readiness poll never terminates — the shell version had the same hole (`[ 2 -ge abc ]` is an
// error, not a stop), and a preflight that hangs forever is worse than one that refuses to start.
// This is the port's ONE deliberate divergence from the old behavior.
const READY_TIMEOUT = Number(process.env.READY_TIMEOUT ?? 90);
if (!Number.isFinite(READY_TIMEOUT) || READY_TIMEOUT <= 0) {
  warn(`preflight.mjs: READY_TIMEOUT must be a positive number of seconds (got '${process.env.READY_TIMEOUT}')\n`);
  process.exit(1);
}
const PROBE_HOSTING = process.env.PROBE_HOSTING === '1';

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function commandExists(name) {
  return (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .some((dir) => {
      try {
        fs.accessSync(path.join(dir, name), fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
}

// --- readiness: poll until the server RESPONDS (warmup-aware) --------------------------------
// A dev server answers connection-refused while booting and 502/503/504 while Nitro/Vite warm the
// route. ANY other code — 2xx, 3xx, 401, 403, 404 — means "up and serving", so a 404 is a PASS: we
// are probing liveness, not routing. Keep using curl rather than fetch(): fetch would need its own
// abort/retry plumbing to distinguish "refused" from "slow", and curl already prints 000 for it.
warn(`preflight: waiting for ${BASE_URL} (up to ${READY_TIMEOUT}s)...\n`);

let waited = 0;
for (;;) {
  const r = spawnSync(
    'curl',
    ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '5', BASE_URL],
    { encoding: 'utf8' },
  );
  const code = (r.stdout || '').trim() || '000'; // curl prints 000 on refused; '' if curl is absent

  if (!['000', '502', '503', '504'].includes(code)) {
    warn(`preflight: ready - HTTP ${code} after ${waited}s\n`);
    break;
  }

  waited += 2;
  if (waited >= READY_TIMEOUT) {
    warn(
      `preflight: STOP - ${BASE_URL} not ready after ${READY_TIMEOUT}s (last HTTP ${code}). ` +
        'Did the server start on this port?\n',
    );
    process.exit(3);
  }
  sleep(2000);
}

// --- hosting probe (PR-mode) — WARN-only, never blocks ----------------------------------------
// Probe by RUNNING the tool, never by `command -v` alone: npx-provisioned tools (wrangler) are
// invisible to PATH in a non-interactive shell, so `command -v wrangler` false-negatives. The
// failing probe output printed here is the evidence a later `Watch link: skipped - <gate>` report
// line must paste (SKILL Step 9).
let hostingReady = 'yes';
if (PROBE_HOSTING) {
  const who = spawnSync('npx', ['wrangler', 'whoami'], { encoding: 'utf8' });
  const whoText = `${who.stdout ?? ''}${who.stderr ?? ''}`;
  if (/logged in/i.test(whoText)) {
    warn('preflight: wrangler authenticated\n');
  } else {
    hostingReady = 'no';
    warn(
      'preflight: WARN - wrangler not authenticated; the watch link will be skipped unless you ' +
        '`wrangler login` now. Probe output:\n',
    );
    for (const line of whoText.replace(/\n+$/, '').split('\n').slice(-3)) {
      warn(`preflight:   ${line}\n`);
    }
  }

  if (!commandExists('ffmpeg')) {
    hostingReady = 'no';
    warn(
      'preflight: WARN - ffmpeg not found. record.mjs hard-stops without it (poster + contact ' +
        'sheet are the film-QA evidence).\n',
    );
  }

  // Chrome is a real binary on PATH or in /Applications — command -v is honest for it, unlike
  // wrangler above.
  const chromeFound =
    fs.existsSync('/Applications/Google Chrome.app') ||
    commandExists('google-chrome') ||
    commandExists('google-chrome-stable');
  if (!chromeFound) {
    hostingReady = 'no';
    warn(
      'preflight: WARN - Chrome not found; the film falls back to bundled Chromium (no PDF viewer, ' +
        'fewer codecs - inline-PDF/media features film blank).\n',
    );
  }
}

// --- summary (machine-readable) ---------------------------------------------------------------
out('---preflight---\n');
out(`BASE_URL=${BASE_URL}\n`);
out('READY=yes\n');
if (PROBE_HOSTING) out(`HOSTING_READY=${hostingReady}\n`);
