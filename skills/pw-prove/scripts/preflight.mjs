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
//   PROBE_HOSTING  optional — set to 1 in PR-mode: also probe everything Step 8's publish needs NOW,
//                  while there is still time to fix it. The publish credential (PUBLISH_READY=yes|no)
//                  and the video tooling (VIDEO_TOOLING=yes|no) are what delivery actually rests on,
//                  and HOSTING_READY is their conjunction — the one line the Step-8 skip form reads.
//                  Chrome is probed too, for clip fidelity rather than for delivery, so it warns
//                  without moving HOSTING_READY. A rotated secret or a missing ffmpeg surfaces at
//                  minute zero rather than after a fifty-minute run, and none of it ever blocks: a
//                  run must still be able to prove a change and skip delivery.
//   CLIPS_MCP_TOKEN
//                  optional — publish-proof.mjs's one credential, described in clips.mjs. When
//                  PROBE_HOSTING=1 and it is set, it is round-tripped against the real import
//                  action; absent, that is a named WARN, never a block.
//   PW_PROVE_CLIPS_ENDPOINT
//                  optional — the MCP endpoint, for testing and self-hosted deployments. Absent,
//                  the endpoint is the token's own `aud` claim.
//
//   exit 3 = not ready
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VAULT_ADD_COMMAND, clipsConfig, probeImportCredential, vaultLeaseCommand } from './clips.mjs';
import { pwproveRun } from './pwprove-run.mjs';

const out = (s) => process.stdout.write(s);
const warn = (s) => process.stderr.write(s);

// Run ledger + version banner. The banner is the FIRST output line, before any validation, so
// every run's transcript records what executed — stale-install drift is visible at a glance instead
// of discovered mid-run.
const SKILL = pwproveRun(import.meta.url, 'readiness');
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

// --- clip-fidelity probe (PR-mode) — WARN-only, never blocks ----------------------------------
// Chrome affects how the proof clip RECORDS, not whether it can be delivered, so it warns and moves
// nothing: a run on bundled Chromium still publishes. Chrome is a real binary on PATH or in
// /Applications, so `command -v` is honest for it.
if (PROBE_HOSTING) {
  const chromeFound =
    fs.existsSync('/Applications/Google Chrome.app') ||
    commandExists('google-chrome') ||
    commandExists('google-chrome-stable');
  if (!chromeFound) {
    warn(
      'preflight: WARN - Chrome not found; the proof clips fall back to bundled Chromium (no PDF ' +
        'viewer, fewer codecs - inline-PDF/media surfaces record blank).\n',
    );
  }
}

// --- publish probes (PR-mode) — WARN-only, never block ----------------------------------------
// Everything publish-proof.mjs needs, learned at minute zero instead of at minute fifty: the
// credential and the video tooling. Both warn and neither blocks — a run must still be able to prove
// a change and skip delivery, because the proof is the passing test plus the mutation verdict.
let publishReady = 'no';
let videoTooling = 'no';
if (PROBE_HOSTING) {
  // The credential is round-tripped by RUNNING the real call, per this repo's probe doctrine —
  // probe by running the tool, never by presence-checking: call the import action with arguments
  // its schema must reject, so the whole path is exercised while nothing is created. A rejection of
  // the ARGUMENTS is the PASS — it means the call got past auth AND past catalog gating, so
  // reachability, credential currency, organization resolution and delegability all hold. A
  // presence check on the variable would prove none of that.
  //
  // The verdicts are NOT interchangeable: a refused credential (an honest 401) and an action this
  // token may not call (an HTTP 200 saying "Unknown tool") are different problems with different
  // fixes, and reporting them as one generic failure sends an operator to the wrong one.
  const config = clipsConfig();
  if (!config.ok) {
    // Absence WARNS; it never stops — the proof is the passing test plus the mutation verdict, and
    // delivery is downstream of both. What absence must not do is cost an operator a skill-file read
    // to fix: the warning prints the lease they can paste, reconstructed from THIS invocation, so the
    // pasted line re-runs this same probe rather than standing in for it.
    const relaunch = `env PROBE_HOSTING=1 BASE_URL='${BASE_URL}' node ${fileURLToPath(import.meta.url)}`;
    warn(`preflight: WARN - publish credential not configured (${config.reason}); the proof link will be skipped.\n`);
    warn(`preflight:   re-run under a lease: ${vaultLeaseCommand(relaunch)}\n`);
    warn(`preflight:   never stored it on this machine: ${VAULT_ADD_COMMAND}\n`);
  } else {
    const { verdict, detail } = await probeImportCredential(config);
    if (verdict === 'usable') {
      publishReady = 'yes';
      warn(`preflight: publish credential usable - ${detail}\n`);
    } else {
      warn('preflight: WARN - publish credential unusable; the proof link will be skipped. Probe output:\n');
      warn(`preflight:   ${verdict}: ${detail}\n`);
    }
  }

  // ffmpeg/ffprobe are real binaries on PATH, so `command -v` is honest for them — the doctrine
  // above is about tools a shell cannot see, which these are not.
  const missing = ['ffmpeg', 'ffprobe'].filter((tool) => !commandExists(tool));
  if (missing.length === 0) {
    videoTooling = 'yes';
  } else {
    warn(
      `preflight: WARN - ${missing.join(' and ')} not found; publish-proof.mjs cannot concatenate ` +
        'the clips into one recording. Install ffmpeg now.\n',
    );
  }
}

// --- summary (machine-readable) ---------------------------------------------------------------
out('---preflight---\n');
out(`BASE_URL=${BASE_URL}\n`);
out('READY=yes\n');
// HOSTING_READY is the conjunction, not a fourth probe: delivery needs BOTH a usable credential and
// the tooling to build the recording, so one line answers "can this run end at a proof link?" and
// the two beneath it say which half is missing.
if (PROBE_HOSTING) out(`HOSTING_READY=${publishReady === 'yes' && videoTooling === 'yes' ? 'yes' : 'no'}\n`);
if (PROBE_HOSTING) out(`PUBLISH_READY=${publishReady}\n`);
if (PROBE_HOSTING) out(`VIDEO_TOOLING=${videoTooling}\n`);
