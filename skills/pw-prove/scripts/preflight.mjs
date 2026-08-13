#!/usr/bin/env node
// preflight.mjs — bring the PROOF TARGET up in three phases that fail distinctly (SKILL Step 3).
//
// The proof target is the BUILT application served by its preview server (`docs/adr/0016`), so
// bring-up is three separate things that used to collapse into one ninety-second readiness poll and
// one not-ready verdict. That verdict was a misdiagnosis often enough to matter: a run that was
// really missing an environment variable was read as "server not ready" and answered with five
// rebuilds and a port kill. Each phase now has its own budget, its own diagnostic, and its own exit
// code:
//
//   config  validate the app's OWN declared configuration contract, before anything expensive.
//           Seconds, and it names the keys. A production build does not supply the defaults a
//           development server did, so `Missing required configuration` after a 174-second build is
//           the exact failure this phase exists to move to the front.
//   build   run the build as a tracked subprocess and wait on it AS one, so a build failure is a
//           build failure carrying its standard error — not a server that never became ready.
//   serve   poll the preview server on a SHORT budget: a preview binds in under a second and serves
//           its first page in milliseconds, so one that is not answering quickly is broken, not slow.
//
// This script still does NOT start a server. The AGENT owns the preview server's lifecycle (pick the
// port, start it, read the port back out of its own log) — a script-started server can bind a
// sibling worktree on the WRONG branch. Auth and selector recon happen in the spec / first run.
//
//   node preflight.mjs [phase ...]        phases: config build serve   (default: all three, in order)
//
// The agent normally runs it twice, because it owns what happens in between:
//
//   REQUIRED_ENV=... BUILD_COMMAND='pnpm build' node preflight.mjs config build
//   # ...start the preview server on the resolved port...
//   BASE_URL=http://localhost:4000 node preflight.mjs serve
//
//   BASE_URL       required for the serve phase — the preview server you already started.
//   REQUIRED_ENV   optional — comma/space-separated keys the built app must have to boot.
//   ENV_CONTRACT   optional — path to the app's own declared contract (`.env.example` shape). A key
//                  declared with no value is REQUIRED; a key declared with a value carries its own
//                  default and is not.
//   ENV_FILES      optional — comma-separated dotenv files the build/preview will load, counted as
//                  suppliers of a key (default `.env` when it exists).
//   BUILD_COMMAND  required for the build phase — the app's build command. There is no skip: the
//                  proof target is the BUILT app, and a bring-up that quietly declines to build is
//                  the second, silent path this design removes.
//   APP_ROOT       optional — the application root: where the build runs and where a relative
//                  ENV_CONTRACT / ENV_FILES / .env is resolved (default: cwd). `BUILD_CWD` is
//                  accepted as its older name.
//   BUILD_TIMEOUT  optional — seconds (default 900). A build that outruns it is a build failure.
//   READY_TIMEOUT  optional — seconds to poll the preview server (default 20 — a short budget on
//                  purpose; see above).
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
//   exit 1 = usage   exit 4 = configuration failure   exit 5 = build failure   exit 3 = serve failure
//
// The three failure codes are the point: they are what makes "the key is missing", "the build broke"
// and "nothing is listening" three answers instead of one.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VAULT_ADD_COMMAND, clipsConfig, probeImportCredential, vaultLeaseCommand } from './clips.mjs';
import { pwproveRun } from './pwprove-run.mjs';

const out = (s) => process.stdout.write(s);
const warn = (s) => process.stderr.write(s);

const EXIT_USAGE = 1;
const EXIT_SERVE = 3;
const EXIT_CONFIG = 4;
const EXIT_BUILD = 5;

// Run ledger + version banner. The banner is the FIRST output line, before any validation, so
// every run's transcript records what executed — stale-install drift is visible at a glance instead
// of discovered mid-run.
const SKILL = pwproveRun(import.meta.url, 'bringup'); // was 'readiness' — the gate is three phases now
out(`preflight: ${SKILL.skill} v${SKILL.version} (${SKILL.commit})\n`);

// --- phase selection --------------------------------------------------------------------------
const ALL_PHASES = ['config', 'build', 'serve'];
const requested = process.argv.slice(2);
const unknown = requested.filter((p) => !ALL_PHASES.includes(p));
if (unknown.length) {
  warn(`preflight.mjs: unknown phase '${unknown[0]}' — expected one or more of ${ALL_PHASES.join(', ')}\n`);
  process.exit(EXIT_USAGE);
}
// Order is fixed, not argv order: validating configuration after paying for a build is the failure
// this script was rewritten to remove, and an invocation cannot opt into it by argument order.
const phases = ALL_PHASES.filter((p) => (requested.length ? requested.includes(p) : true));

const BASE_URL = process.env.BASE_URL;
if (phases.includes('serve') && !BASE_URL) {
  warn(
    'preflight.mjs: set BASE_URL to the preview server you already started on this worktree resolved ' +
      'port (see SKILL Step 3)\n',
  );
  process.exit(EXIT_USAGE);
}
// Validate rather than coerce. A non-numeric READY_TIMEOUT makes `waited >= NaN` forever false, and
// the readiness poll never terminates — the shell version had the same hole (`[ 2 -ge abc ]` is an
// error, not a stop), and a preflight that hangs forever is worse than one that refuses to start.
const READY_TIMEOUT = Number(process.env.READY_TIMEOUT ?? 20);
if (!Number.isFinite(READY_TIMEOUT) || READY_TIMEOUT <= 0) {
  warn(`preflight.mjs: READY_TIMEOUT must be a positive number of seconds (got '${process.env.READY_TIMEOUT}')\n`);
  process.exit(EXIT_USAGE);
}
const BUILD_TIMEOUT = Number(process.env.BUILD_TIMEOUT ?? 900);
if (!Number.isFinite(BUILD_TIMEOUT) || BUILD_TIMEOUT <= 0) {
  warn(`preflight.mjs: BUILD_TIMEOUT must be a positive number of seconds (got '${process.env.BUILD_TIMEOUT}')\n`);
  process.exit(EXIT_USAGE);
}
const PROBE_HOSTING = process.env.PROBE_HOSTING === '1';
// One root for every phase. The build runs here, the preview server is started from here by the
// agent, and the dotenv files the app loads are ITS files — resolving them against the caller's cwd
// makes a monorepo app's own `.env` invisible and turns phase 1 into the false stop this gate exists
// to avoid.
const APP_ROOT = process.env.APP_ROOT || process.env.BUILD_CWD || process.cwd();
const inApp = (p) => (path.isAbsolute(p) ? p : path.join(APP_ROOT, p));

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

// --- the machine-readable summary ---------------------------------------------------------------
// Printed on every exit that got as far as running a phase — success or failure — so the caller
// reads one block rather than parsing prose. A usage refusal (exit 1) prints no block at all: nothing
// was attempted, so there is no outcome to report. PHASE_FAILED is the line that keeps the three
// real outcomes apart.
const summary = [`PHASES=${phases.join(',')}`];
function finish(code, failedPhase) {
  out('---preflight---\n');
  if (failedPhase) out(`PHASE_FAILED=${failedPhase}\n`);
  for (const line of summary) out(`${line}\n`);
  process.exit(code);
}

// --- phase 1: configuration ---------------------------------------------------------------------
// Validated against the application's own DECLARED contract, never sniffed: the skill reads what the
// app says it needs (`REQUIRED_ENV` from recon, or the committed `.env.example`-shaped file the app
// ships) and answers in the time it takes to read two files.
function stripQuotes(raw) {
  const v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"') && v.length > 1) || (v.startsWith("'") && v.endsWith("'") && v.length > 1)) {
    return v.slice(1, -1);
  }
  return v.replace(/\s+#.*$/, '').trim(); // an unquoted trailing comment is not a value
}

function parseDeclarations(text) {
  const decls = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!m) continue;
    decls.push({ key: m[1], value: stripQuotes(m[2]) });
  }
  return decls;
}

function splitKeys(raw) {
  return (raw ?? '')
    .split(/[\s,]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

if (phases.includes('config')) {
  const required = new Map(); // key -> where it was declared
  for (const key of splitKeys(process.env.REQUIRED_ENV)) required.set(key, 'REQUIRED_ENV');

  const contractPath = process.env.ENV_CONTRACT ? inApp(process.env.ENV_CONTRACT) : undefined;
  if (contractPath) {
    if (!fs.existsSync(contractPath)) {
      warn(`preflight.mjs: ENV_CONTRACT names a file that does not exist: ${contractPath}\n`);
      process.exit(EXIT_USAGE);
    }
    for (const { key, value } of parseDeclarations(fs.readFileSync(contractPath, 'utf8'))) {
      // A declaration that carries a value is declaring its own default, so it is not required.
      if (value === '' && !required.has(key)) required.set(key, contractPath);
    }
  }

  if (required.size === 0) {
    // Nothing declared is not the same as nothing needed, and it must not read as a pass: the skill
    // cannot invent another repository's contract, so it says the check did not happen.
    summary.push('CONFIG=undeclared');
    warn(
      'preflight: WARN - no configuration contract declared; set REQUIRED_ENV=<keys> or ' +
        'ENV_CONTRACT=<path to the app .env.example> so a missing key fails here instead of after the build.\n',
    );
  } else {
    // Keys the build and the preview will pick up from a dotenv file count as supplied — the check
    // is "will the app boot", not "is this shell exhaustive".
    const envFiles = (process.env.ENV_FILES ?? '').trim()
      ? process.env.ENV_FILES.split(',').map((f) => inApp(f.trim())).filter(Boolean)
      : fs.existsSync(inApp('.env'))
        ? [inApp('.env')]
        : [];
    const fromFiles = new Map();
    for (const file of envFiles) {
      if (!fs.existsSync(file)) continue;
      for (const { key, value } of parseDeclarations(fs.readFileSync(file, 'utf8'))) {
        if (value !== '') fromFiles.set(key, file);
      }
    }

    const missing = [...required.keys()].filter(
      (key) => !(process.env[key] ?? '').trim() && !fromFiles.has(key),
    );
    if (missing.length) {
      warn(`preflight: STOP - configuration incomplete: ${missing.length} required key(s) not set\n`);
      for (const key of missing) warn(`preflight:   ${key} — declared required by ${required.get(key)}\n`);
      warn(
        'preflight:   set them in the environment the build and the preview server will run under, ' +
          `or in one of ${envFiles.length ? envFiles.join(', ') : 'the app dotenv files'}, and re-run.\n`,
      );
      summary.push('CONFIG=failed');
      summary.push(`MISSING_KEYS=${missing.join(',')}`);
      finish(EXIT_CONFIG, 'config');
    }
    warn(`preflight: configuration ok - ${required.size} required key(s) present\n`);
    summary.push('CONFIG=ok');
  }
}

// --- phase 2: build ------------------------------------------------------------------------------
// Waited on AS a subprocess. A non-zero exit is reported as a build failure with the build's own
// standard error attached, because "the server never became ready" sent an operator to the wrong
// half of the system.
if (phases.includes('build')) {
  const command = process.env.BUILD_COMMAND;
  if (!command) {
    // Refuse rather than skip. A skipped build is a bring-up that proves whatever server happens to
    // be listening — a development server included — which is exactly the silent second path
    // docs/adr/0016 removes. If a target genuinely needs no build, do not ask for the phase.
    warn(
      'preflight.mjs: the build phase needs BUILD_COMMAND. The proof target is the BUILT application ' +
        '(docs/adr/0016); there is no unbuilt fallback. Set it, or run only the phases you mean ' +
        '(`node preflight.mjs config serve`) and say in the report why nothing was built.\n',
    );
    process.exit(EXIT_USAGE);
  } else {
    const cwd = APP_ROOT;
    warn(`preflight: building (${command}) in ${cwd}, up to ${BUILD_TIMEOUT}s...\n`);
    const started = Date.now();
    const r = spawnSync(command, {
      shell: true,
      cwd,
      encoding: 'utf8',
      timeout: BUILD_TIMEOUT * 1000,
      maxBuffer: 64 * 1024 * 1024, // a real build's log; truncating it loses the error we are here for
    });
    const seconds = Math.round((Date.now() - started) / 1000);
    const timedOut = r.error && r.error.code === 'ETIMEDOUT';
    if (timedOut || r.status !== 0) {
      // The build's own stderr IS the diagnostic. Print its tail here and the whole log to a file,
      // rather than a summary of it — a paraphrased build error is not a build error.
      const log = `${r.stdout ?? ''}${r.stderr ?? ''}`;
      const errText = (r.stderr ?? '').trim() || (r.stdout ?? '').trim();
      const tail = errText.split('\n').slice(-40);
      const logFile = path.join(os.tmpdir(), `pwprove-build-${process.pid}.log`);
      try {
        fs.writeFileSync(logFile, log, { mode: 0o600 }); // a build log is the app's output, not the world's
      } catch {
        /* the tail below is the diagnostic; a temp-dir failure must not mask the build failure */
      }
      warn(
        timedOut
          ? `preflight: STOP - build FAILED: no exit after ${BUILD_TIMEOUT}s (${command})\n`
          : `preflight: STOP - build FAILED with exit ${r.status} after ${seconds}s (${command})\n`,
      );
      warn('preflight: build stderr (tail):\n');
      for (const line of tail) warn(`preflight:   | ${line}\n`);
      warn(`preflight:   full build log: ${logFile}\n`);
      summary.push('BUILD=failed');
      // `status` is null when the build died on a signal, and `BUILD_EXIT=null` tells an operator
      // nothing: name the signal (an OOM-killed build is SIGKILL, and reads as a broken build otherwise).
      summary.push(`BUILD_EXIT=${timedOut ? 'timeout' : (r.status ?? `signal:${r.signal ?? 'unknown'}`)}`);
      summary.push(`BUILD_LOG=${logFile}`);
      finish(EXIT_BUILD, 'build');
    }
    warn(`preflight: build ok in ${seconds}s\n`);
    summary.push('BUILD=ok');
    summary.push(`BUILD_SECONDS=${seconds}`);
  }
}

// --- phase 3: serve ------------------------------------------------------------------------------
// Poll until the preview server RESPONDS, on a short budget. 502/503/504 and a refused connection
// are "not up"; ANY other code — 2xx, 3xx, 401, 403, 404 — means "up and serving", so a 404 is a
// PASS: we are probing liveness, not routing. Keep using curl rather than fetch(): fetch would need
// its own abort/retry plumbing to distinguish "refused" from "slow", and curl already prints 000.
if (phases.includes('serve')) {
  warn(`preflight: waiting for ${BASE_URL} (up to ${READY_TIMEOUT}s)...\n`);

  // Measure the wall clock, not the loop count. Each attempt can itself take up to `--max-time 5`,
  // so counting two seconds per iteration made a "20-second budget" run for over a minute against a
  // hanging origin — and a short budget that is not short is the poll this rewrite replaced.
  const startedAt = Date.now();
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

    waited = Math.round((Date.now() - startedAt) / 1000);
    if (waited + 2 >= READY_TIMEOUT) {
      warn(
        `preflight: STOP - serve FAILED: ${BASE_URL} did not answer within ${READY_TIMEOUT}s ` +
          `(last HTTP ${code}). A preview server binds in under a second, so this is a broken or ` +
          'absent server, not a slow one: read the preview log, and check the port it actually bound.\n',
      );
      summary.push('SERVE=failed');
      summary.push(`BASE_URL=${BASE_URL}`);
      summary.push('READY=no');
      finish(EXIT_SERVE, 'serve');
    }
    sleep(2000);
  }
  summary.push('SERVE=ok');
  summary.push(`BASE_URL=${BASE_URL}`);
  summary.push('READY=yes');
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
    const relaunch =
      `env PROBE_HOSTING=1 ${BASE_URL ? `BASE_URL='${BASE_URL}' ` : ''}` +
      `node ${fileURLToPath(import.meta.url)} ${phases.join(' ')}`;
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

  // HOSTING_READY is the conjunction, not a fourth probe: delivery needs BOTH a usable credential and
  // the tooling to build the recording, so one line answers "can this run end at a proof link?" and
  // the two beneath it say which half is missing.
  summary.push(`HOSTING_READY=${publishReady === 'yes' && videoTooling === 'yes' ? 'yes' : 'no'}`);
  summary.push(`PUBLISH_READY=${publishReady}`);
  summary.push(`VIDEO_TOOLING=${videoTooling}`);
}

finish(0);
