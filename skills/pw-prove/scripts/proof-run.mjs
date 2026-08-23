#!/usr/bin/env node
// proof-run.mjs — Step 7's mechanics, as code. The judgement stays with the agent.
//
//   node proof-run.mjs audit --config <proof config> --test-dir <testDir> --base <ref>
//                           [--written <spec>]... [--project <name>] [--grep <title>]
//   node proof-run.mjs film  --config <proof config> --test-dir <testDir> --base <ref>
//                           --project-config <the project's own playwright.config>
//                           --verdict <pinned:WxH|deliberate:WxH> [--written <spec>]... [--project <name>]
//
// Step 7 was the largest section of pw-prove's body and the only large one with no module behind
// it: bring-up has preflight.mjs, recon has probe.mjs, the recording has har-scrub.mjs, the
// fidelity contract has clip-fidelity.mjs, the classification has hermetic.mjs — and the thing that
// ORCHESTRATES all of them was prose. Prose is the category of instruction that already failed
// here twice, both times as a wrong argument: a spec-set pathspec that returned nothing on a flat
// test dir, and an inherited `webServer` entry pointed the wrong way. Both were fixed in prose,
// landing on no test surface, so nothing stops either being reintroduced by an edit that reads
// fine. This module is the test surface. `audit` and `film` are its verbs; `mutate` follows.
//
// WHAT THESE VERBS OWN, AND WHY EACH PIECE IS HERE RATHER THAN IN THE BODY:
//
//   THE SPEC SET IS RESOLVED MECHANICALLY, AND THE PATHSPEC FORM IS THE WHOLE TRICK. In PR-mode
//   both runs execute every spec that proves the PR, not only the one this run wrote — a run that
//   films its own delta delivers a proof page holding two chapters of a thirteen-scenario PR, and
//   nothing in the artifact says so. pw-prove commits its specs to the PR branch, so an earlier
//   run's spec is in the diff by construction. The set is resolved by pathspec-ing the DIRECTORY
//   and filtering by extension AFTERWARDS: git's default pathspec is not glob mode, so a
//   `<testDir>/**/*.spec.*` pathspec demands a subdirectory most projects do not have and returns
//   NOTHING on a flat test dir. Measured against a real 7-spec PR: the pathspec form returned 0,
//   this one 7. A set that came back empty films an empty set without saying so.
//
//   AN EMPTY SET IS A STOP (exit 3), NEVER A FILMING INSTRUCTION. PR-mode reaches Step 7 with at
//   least the spec this run wrote, so an empty resolution means the resolution is wrong — the wrong
//   base ref, or a test directory that is not where the specs landed. Fix the resolution; never run
//   what the command returned.
//
//   EVERY SPEC IS TAGGED `carried` OR `written`. A carried spec that goes red passed on the run
//   that wrote it, so its failure says the PR moved the behaviour underneath it: that is a FINDING
//   about the PR, not a spec to heal, and loosening its assertion to get green deletes the only
//   guard that caught the regression. The tag is carried in the summary so a heal loop never spends
//   an attempt on one.
//
//   THE RESULTS DIRECTORY IS CLEARED BEFORE THE RUN, without anyone remembering to. Whatever sits
//   in test-results/ at publish time becomes the evidence, so a leftover webm from an earlier — or
//   mutated — run published as proof is a lie.
//
//   THE RUN CARRIES NO WORKER OVERRIDE (ADR-0017). Scaffolded configs leave `workers` undefined off
//   CI, so the run takes Playwright's default of cores/2 and the scenarios go together: measured
//   over 31 runs and 120 test instances at 1.76–1.89× less wall clock, with zero failures and zero
//   flaky verdicts at every concurrency from 1 to 6. A literal count was right on one 8-core
//   machine and is wrong on the next, so the flag does not exist here. `--no-install` is fixed for
//   the same reason it is fixed everywhere in this skill: a runner invocation must never
//   auto-install into a stranger's project.
//
//   THE FAILURE SIGNATURE BOUNDS THE HEAL LOOP, AND A RAW COUNT CANNOT. The bound is three
//   attempts, but not three retries: three attempts at one unmoving timeout is one retry paid three
//   times. So each attempt's signature — the error class plus the failing locator — is persisted,
//   the attempt that repeats an unchanged one exits 7 rather than merely red (6) and records the
//   loop as stalled, so every invocation after it is refused without paying for a run at all. The heal loop's targeted reruns go through this same verb with
//   `--grep`, so every attempt the agent makes is an attempt the bound sees; a raw runner call
//   would leave the bound blind to exactly the attempts it exists to count.
//
//   THE MODULE'S STATE IS EXCLUDED REPO-LOCALLY, through `.git/info/exclude` and never through the
//   project's `.gitignore` — the convention the HAR bind already sets. The state is this run's
//   private working state; a stray `.gitignore` diff is churn the delivery step would have to
//   explain.
//
//   FILMING IS GATED ON THE SPEC ACTUALLY CARRYING THE FIDELITY CONTRACT. `film` runs the Step-6
//   spec-side audit again, as a PRECONDITION, with the Step-4 viewport verdict. This is the hole
//   `clip-fidelity.mjs` was written for: a real run passed `PW_PROVE_CLIP=1` at Step 7 while the
//   generated spec contained no reader for the variable, so the flag was inert, the dwell never
//   happened, and every gate stayed green over a recording that showed nothing. The audit already
//   ran once at Step 6 — and that is exactly why it runs again here: a precondition the verb
//   enforces cannot be skipped by an agent that believes it already ran it, and a heal-loop edit
//   between Step 6 and Step 7 can have dropped the dwell it checks for. A refusal (exit 12) leaves
//   the results directory ALONE: nothing was filmed, so nothing about the standing evidence changed.
//
//   THE EFFECTIVE VIEWPORT IS CARRIED, NEVER A LITERAL. `--verdict` is the Step-4 Assumptions
//   block's Effective viewport line verbatim, and it does two jobs with one value: it is what the
//   fidelity audit compares against the config text, and its size is what travels to the recording
//   as `PW_PROVE_W`/`PW_PROVE_H`. One flag rather than two because a second one could disagree with
//   the first, and the disagreement would be silent — the clip would record at a size the app never
//   rendered at, which is the failure the verdict check exists to catch one level up.
//
//   FRAME EXTRACTION CLOSES THE RUN AND NEVER FAILS IT. One frame per clip, delegated to
//   `clip-fidelity.mjs frames` rather than reimplemented, because that module owns where in the clip
//   the frame comes from and why. Absent video tooling leaves the run PASSING with every clip
//   reported uninspected, and a clip that yields no frame is uninspected while the rest keep theirs:
//   an unread clip is not a good one, and "uninspected" is the honest verdict. A missing `ffmpeg` is
//   not a failed test, and a gate that trips here would abort a whole recording over an inspection.
//
//   THE CLIPS AND THEIR MEASURED DURATIONS TRAVEL IN THE SUMMARY, so Step 8's publish step reads a
//   manifest source rather than assembling one by globbing the results directory afterwards — by
//   which time it cannot tell this run's webms from anything else standing there. Durations come
//   through `video.mjs`, the one place a Proof clip is measured, because a live-recorded webm often
//   declares no duration in its container and a second copy of that logic is the copy that trusts it.
//
// WHAT STAYS WITH THE AGENT, unchanged: diagnosing a red test and writing the fix, judging whether
// a present carve-out is legitimate, READING EACH EXTRACTED FRAME and naming what is wrong with it,
// and the handover stop when the loop is exhausted.
//
// Zero dependencies, Node stdlib only, per the shipped-scripts convention.
//
// Exit codes are the contract both the agent and the ledger read. They are one table across the
// three verbs, so a code never means two things:
//   0   success (for `audit`: the run went green)
//   1   usage                                  } no summary line: these exit before the spec set
//   2   unreadable input, or no resolvable runner }   exists, so there is nothing to summarize
//   3   spec set resolved empty
//   4   type check failed                    } reserved — the audit verb's first phase
//   5   HAR bind refused                     } reserved — the audit verb's bind phase
//   6   tests red
//   7   checkpoint refusal — an unchanged failure signature, or an attempt past the bound
//   8   mutation run green (the spec does not guard the change)   } reserved — `mutate`
//   9   tree residue after the revert, a hard stop                } reserved — `mutate`
//   10  clips clobbered or count mismatched                       } reserved — `film`/`mutate`
//   11  restart unproven                                          } reserved — `mutate`
//   12  filming precondition refused — the spec does not carry the clip-fidelity contract
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pwproveRun } from './pwprove-run.mjs';
import { probeVideo, videoTooling } from './video.mjs';

const EXIT = {
  OK: 0,
  USAGE: 1,
  INPUT: 2,
  EMPTY_SET: 3,
  TESTS_RED: 6,
  CHECKPOINT: 7,
  FIDELITY: 12,
};

const VERBS = new Set(['audit', 'film']);
// Schema 2 added the film verb's fields: `clips`, `viewport` and `verdict`. Fields are added over
// time, so a reader reads the schema before it reads anything else.
const SUMMARY_SCHEMA = 2;
const STATE_SCHEMA = 1;
// Fixed, not a flag. The bound is the body's bound, and a knob whose only caller would be a test is
// a test-only injection point — the one thing this module is not allowed to grow.
const ATTEMPT_BOUND = 3;
// Fixed for the same reason the runner's shape is fixed: these are the paths the body names, and a
// flag for either would let a caller point a recursive delete somewhere it does not belong.
const RESULTS_DIR = 'test-results';
const STATE_DIR = '.pw-prove';
// The extension filter that runs AFTER the directory pathspec. Deliberately the same set the body
// documented: .spec/.test, any of js/jsx/ts/tsx, with the cjs/mjs prefixes projects do use.
const SPEC_RE = /\.(spec|test)\.[cm]?[jt]sx?$/;
// The sibling module that owns both halves of the fidelity contract — the Step-6 gate `film` runs as
// its precondition, and the Step-7 frame extraction that closes it. Resolved beside this file so the
// skill can be installed anywhere; never reimplemented here.
const CLIP_FIDELITY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'clip-fidelity.mjs');

const out = (s) => process.stdout.write(s);
const err = (s) => process.stderr.write(s);

const USAGE =
  'usage: proof-run.mjs audit --config <proof config> --test-dir <testDir> --base <ref>\n' +
  '                          [--written <spec>]... [--project <name>] [--grep <title>]\n' +
  '       proof-run.mjs film  --config <proof config> --test-dir <testDir> --base <ref>\n' +
  "                          --project-config <the project's own playwright.config>\n" +
  '                          --verdict <pinned:WxH|deliberate:WxH>\n' +
  '                          [--written <spec>]... [--project <name>]\n';

const verb = process.argv[2];
// Read before validation so even a usage-error exit leaves a ledger record; the phase is the verb.
pwproveRun(import.meta.url, VERBS.has(verb) ? verb : 'audit');

function usage(message) {
  err(`proof-run.mjs: ${message}\n${USAGE}`);
  process.exit(EXIT.USAGE);
}

const VERB_LIST = [...VERBS].join(', ');
if (!verb) usage(`no verb — expected one of: ${VERB_LIST}`);
if (!VERBS.has(verb)) usage(`unknown verb '${verb}' — expected one of: ${VERB_LIST}`);

const opts = {
  config: null,
  testDir: null,
  base: null,
  written: [],
  project: 'chromium',
  grep: null,
  projectConfig: null,
  verdict: null,
};

const argv = process.argv.slice(3);
const need = (i, flag) => {
  if (i >= argv.length) usage(`${flag} needs a value`);
  return argv[i];
};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--config') opts.config = need(++i, a);
  else if (a === '--test-dir') opts.testDir = need(++i, a);
  else if (a === '--base') opts.base = need(++i, a);
  else if (a === '--written') opts.written.push(need(++i, a));
  else if (a === '--project') opts.project = need(++i, a);
  else if (a === '--grep' || a === '-g') opts.grep = need(++i, a);
  else if (a === '--project-config') opts.projectConfig = need(++i, a);
  else if (a === '--verdict') opts.verdict = need(++i, a);
  else usage(`unknown flag '${a}'`);
}

// Per-verb, in both directions. A flag a verb does not use is a usage error rather than a silent
// no-op: a flag that reads as accepted and does nothing is exactly the class of defect — a wrong
// argument nothing notices — this module exists to make impossible.
const REQUIRED = {
  audit: ['--config', '--test-dir', '--base'],
  film: ['--config', '--test-dir', '--base', '--project-config', '--verdict'],
};
const FLAG_VALUES = {
  '--config': opts.config,
  '--test-dir': opts.testDir,
  '--base': opts.base,
  '--project-config': opts.projectConfig,
  '--verdict': opts.verdict,
  '--grep': opts.grep,
};
const OWNED = { audit: ['--grep'], film: ['--project-config', '--verdict'] };
for (const flag of REQUIRED[verb]) {
  if (!FLAG_VALUES[flag]) usage(`${flag} is required for '${verb}'`);
}
for (const [owner, flags] of Object.entries(OWNED)) {
  if (owner === verb) continue;
  for (const flag of flags) {
    if (FLAG_VALUES[flag]) usage(`${flag} belongs to '${owner}', not to '${verb}'`);
  }
}

// The Step-4 Assumptions block's Effective viewport line, verbatim — the same value the fidelity
// audit is handed, and the source of the recording size. Parsed strictly: a verdict whose size
// cannot be read has no viewport to carry, and a default substituted here would be the fixed
// literal the whole flag exists to prevent.
const viewport = (() => {
  if (verb !== 'film') return null;
  const m = /^\s*(pinned|deliberate)\s*:\s*(\d+)\s*[xX\u00d7]\s*(\d+)\s*$/.exec(opts.verdict);
  if (!m) {
    usage(
      `--verdict '${opts.verdict}' is neither pinned:<WxH> nor deliberate:<WxH> — it is the ` +
        "Step-4 Assumptions block's Effective viewport line, verbatim",
    );
  }
  return { width: Number(m[2]), height: Number(m[3]) };
})();
function stop(code, message) {
  err(`proof-run ${verb}: ${message}\n`);
  process.exit(code);
}

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });

if (!fs.existsSync(opts.config)) {
  stop(EXIT.INPUT, `--config '${opts.config}' does not exist`);
}
if (opts.projectConfig && !fs.existsSync(opts.projectConfig)) {
  stop(EXIT.INPUT, `--project-config '${opts.projectConfig}' does not exist`);
}
for (const spec of opts.written) {
  if (!fs.existsSync(spec)) {
    stop(EXIT.INPUT, `--written '${spec}' is not on disk — the spec this run wrote must be there`);
  }
}

// ---- the run's own state, excluded repo-locally --------------------------------------------
const top = git('rev-parse', '--show-toplevel');
if (top.status !== 0) stop(EXIT.INPUT, 'not inside a git repository — the spec set is resolved from a merge base');
const repoTop = top.stdout.trim();

fs.mkdirSync(STATE_DIR, { recursive: true });
// `.git/info/exclude`, never the project's `.gitignore`: this is the run's private working state.
// The path comes from `--git-common-dir` and NOT from `<toplevel>/.git`, because in a worktree or a
// submodule `.git` is a FILE pointing elsewhere: joining onto it yields ENOTDIR and stops the run
// before it resolves anything. Worktrees share one exclude file, which is the right scope here —
// the entry is about this repository, not about one checkout of it.
try {
  const common = git('rev-parse', '--git-common-dir');
  if (common.status !== 0) throw new Error('cannot resolve the git common directory');
  const gitDir = path.resolve(repoTop, common.stdout.trim());
  const excludeFile = path.join(gitDir, 'info', 'exclude');
  const entry = `${STATE_DIR.replace(/\/+$/, '')}/`;
  fs.mkdirSync(path.dirname(excludeFile), { recursive: true });
  const current = fs.existsSync(excludeFile) ? fs.readFileSync(excludeFile, 'utf8') : '';
  if (!current.split('\n').includes(entry)) {
    fs.appendFileSync(excludeFile, current.endsWith('\n') || current === '' ? `${entry}\n` : `\n${entry}\n`);
  }
} catch (e) {
  stop(EXIT.INPUT, `cannot write the repo-local exclude entry (${e.message})`);
}

const statePath = path.join(STATE_DIR, 'audit-state.json');
function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (parsed?.schema !== STATE_SCHEMA) return { attempts: 0, signature: null, stalled: false };
    return {
      attempts: Number(parsed.attempts) || 0,
      signature: parsed.signature ?? null,
      stalled: parsed.stalled === true,
    };
  } catch {
    return { attempts: 0, signature: null, stalled: false };
  }
}
function writeState(state) {
  fs.writeFileSync(
    statePath,
    `${JSON.stringify({ schema: STATE_SCHEMA, verb, ...state }, null, 2)}\n`,
  );
}

// ---- the summary ----------------------------------------------------------------------------
// ONE JSON line on stdout, so the agent reads a machine-readable account instead of re-deriving one
// from the runner's console output.
// Bound once the spec set is known, so the invariant half of the record is spelled in exactly one
// place and only the varying half travels to a call site.
// The core is the same for every verb — schema, verb, spec set, result, exit — and each verb adds
// the fields only it has. Two records that agree on the core can be read by one reader.
let summarize = () => {};
function bindSummary(specs) {
  summarize = (result, exit, extra = {}) => {
    out(
      `PWPROVE_SUMMARY ${JSON.stringify({
        schema: SUMMARY_SCHEMA,
        verb,
        specs,
        result,
        exit,
        ...extra,
      })}\n`,
    );
  };
}
const auditSummary = (result, exit, signature, attempt) =>
  summarize(result, exit, { grep: opts.grep, attempt, attempt_bound: ATTEMPT_BOUND, signature });

// ---- spec-set resolution ---------------------------------------------------------------------
const mergeBase = git('merge-base', opts.base, 'HEAD');
if (mergeBase.status !== 0 || !mergeBase.stdout.trim()) {
  stop(EXIT.INPUT, `cannot resolve a merge base for --base '${opts.base}'`);
}
const diff = git('diff', '--name-only', `${mergeBase.stdout.trim()}...HEAD`, '--', opts.testDir);
if (diff.status !== 0) {
  stop(EXIT.INPUT, `git diff over '${opts.testDir}' failed: ${diff.stderr.trim()}`);
}

const cwd = process.cwd();
const fromRepo = (p) => path.relative(cwd, path.resolve(repoTop, p)) || p;
const writtenKeys = new Set(opts.written.map((p) => path.resolve(cwd, p)));

const carried = [...new Set(diff.stdout.split('\n').filter(Boolean).map(fromRepo))]
  .filter((p) => SPEC_RE.test(p))
  .filter((p) => !writtenKeys.has(path.resolve(cwd, p)))
  .sort();
const written = [...new Set(opts.written)].sort();
const specs = [
  ...carried.map((p) => ({ path: p, tag: 'carried' })),
  ...written.map((p) => ({ path: p, tag: 'written' })),
];

bindSummary(specs);

if (specs.length === 0) {
  summarize('empty', EXIT.EMPTY_SET);
  stop(
    EXIT.EMPTY_SET,
    `no spec resolved from '${opts.testDir}' against --base '${opts.base}'. PR-mode reaches ` +
      'Step 7 with at least the spec this run wrote, so this is a wrong base ref or a test ' +
      'directory that is not where the specs landed. Fix the resolution; never run an empty set.',
  );
}

// ---- the run, shared by both verbs -------------------------------------------------------------
// The results directory is cleared BEFORE the runner starts, on EVERY verb and without anyone
// remembering to: whatever stands in test-results/ at publish time becomes the evidence, so a
// leftover webm from an earlier — or mutated — run published as proof is a lie. The runner's shape
// is fixed here rather than passed, so there is exactly one invocation to read and to assert.
function runSpecSet(specs, extraEnv = {}) {
  fs.rmSync(RESULTS_DIR, { recursive: true, force: true });
  const runnerArgs = [
    '--no-install',
    'playwright',
    'test',
    ...specs.map((s) => s.path),
    `--project=${opts.project}`,
    '--config',
    opts.config,
    '--reporter=html',
    ...(opts.grep ? ['-g', opts.grep] : []),
  ];
  const run = spawnSync('npx', runnerArgs, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, ...extraEnv },
  });
  if (run.error) {
    stop(EXIT.INPUT, `cannot run the test runner (${run.error.message}). 'npx' must be on PATH.`);
  }
  out(run.stdout ?? '');
  err(run.stderr ?? '');
  return run;
}

// ---- the failure signature ---------------------------------------------------------------------
// The error class plus the failing locator: what a raw attempt count cannot see. `expect(...)`
// assertions are read at their call shape rather than as a bare `Error`, because every one of them
// would otherwise collapse into one indistinguishable class.
function signatureOf(text) {
  const expectMatch = text.match(/(expect\([^)]*\)(?:\.\w+)+)/);
  const errorMatch = text.match(/\b([A-Z]\w*Error)\b/);
  const errorClass = expectMatch ? expectMatch[1] : errorMatch ? errorMatch[1] : 'unknown';
  const locatorMatch = text.match(/locator\((['"`])([\s\S]*?)\1\)/);
  const getByMatch = text.match(/(getBy\w+\([^\n]*?\))/);
  const siteMatch = text.match(/([\w./-]+\.(?:spec|test)\.[cm]?[jt]sx?:\d+:\d+)/);
  const locator = locatorMatch
    ? locatorMatch[2]
    : getByMatch
      ? getByMatch[1]
      : siteMatch
        ? siteMatch[1]
        : 'unknown';
  return { error_class: errorClass, locator };
}
const same = (a, b) => a && b && a.error_class === b.error_class && a.locator === b.locator;

// ---- the filming run's closing phase ------------------------------------------------------------
/**
 * Every webm the filming run left behind, depth-first and sorted, so the manifest source is stable
 * between runs. Playwright writes one per test under a per-test directory whose name it chooses, so
 * the shape below is a walk rather than a pattern: a fixed depth would silently miss clips the next
 * Playwright version nests differently.
 */
function collectClips(dir) {
  const found = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.webm')) found.push(full);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return found.sort();
}

/**
 * Measure every clip, extract one frame from each, and say which ones were actually inspected.
 *
 * NOTHING HERE FAILS THE RUN. Absent video tooling, an unreadable recording and a frame ffmpeg
 * declined to write all land the same way: that clip is reported `inspected: false`, and the others
 * still get theirs. A missing `ffmpeg` is not a failed test, and an unread clip is not a good one —
 * "uninspected" is the honest verdict and the report is required to carry it.
 *
 * The extraction is delegated to `clip-fidelity.mjs frames`, which owns WHERE in the clip the frame
 * comes from (inside the payoff hold) and prints the diagnosis table the agent reads next. Its
 * output is forwarded verbatim; only the frame FILES it wrote are read back, beside their clips,
 * because a path read off disk cannot drift from a sentence the way a parsed line can.
 */
function measureClips(clips) {
  if (clips.length === 0) return [];
  const tooling = videoTooling();
  const measured = clips.map((clip) => ({
    path: clip,
    // `video.mjs` is the one place a Proof clip is measured: a live-recorded webm frequently
    // declares no duration in its container, and a second copy of this would be the copy that
    // trusts it and reports a boot screen as a ten-second proof.
    seconds: tooling.ok ? (probeVideo(clip, () => ({ seconds: null })).seconds ?? null) : null,
    frame: null,
    inspected: false,
  }));

  const frames = spawnSync(process.execPath, [CLIP_FIDELITY, 'frames', ...clips], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  out(frames.stdout ?? '');
  err(frames.stderr ?? '');
  if (frames.error) {
    err(`proof-run film: frame extraction could not run (${frames.error.message}). THE RUN STANDS — ` +
      'every clip is reported uninspected.\n');
    return measured;
  }
  for (const clip of measured) {
    const beside = path.join(
      path.dirname(clip.path),
      `${path.basename(clip.path).replace(/\.[^.]+$/, '')}.frame.png`,
    );
    if (fs.existsSync(beside) && fs.statSync(beside).size > 0) {
      clip.frame = beside;
      clip.inspected = true;
    }
  }
  const uninspected = measured.filter((c) => !c.inspected);
  if (uninspected.length) {
    err(
      `proof-run film: ${uninspected.length}/${measured.length} clip(s) yielded no frame. THE RUN ` +
        'STANDS — report each of them as `uninspected` in the completion report, never as good.\n',
    );
  }
  return measured;
}

// ================================================================================== film
if (verb === 'film') {
  // 1. THE PRECONDITION. The Step-6 gate, run again over the spec set that is about to be filmed,
  //    before anything is cleared or spent. A refusal here costs nothing and leaves the standing
  //    evidence alone; the same defect discovered after the run costs the clips as well.
  const pre = spawnSync(
    process.execPath,
    [CLIP_FIDELITY, 'spec', ...specs.map((s) => s.path), '--config', opts.projectConfig, '--verdict', opts.verdict],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (pre.error) {
    stop(EXIT.INPUT, `cannot run the clip-fidelity audit (${pre.error.message})`);
  }
  out(pre.stdout ?? '');
  err(pre.stderr ?? '');
  if (pre.status !== 0) {
    summarize('refused', EXIT.FIDELITY, { fidelity_exit: pre.status, viewport, verdict: opts.verdict });
    stop(
      EXIT.FIDELITY,
      `the clip-fidelity audit refused the spec set (its exit ${pre.status}, named above) — NOTHING ` +
        'was filmed and test-results/ is untouched. Filming a spec that carries no reader for ' +
        'PW_PROVE_CLIP records footage that shows nothing while every gate stays green. Fix the ' +
        'COMMITTED spec, then run this verb again.',
    );
  }

  // 2. THE RUN. The clip flag and the effective viewport arrive as ENVIRONMENT, because they are the
  //    run's only per-run values and the proof config is static and committed. The size is the one
  //    the verdict declared — never a literal.
  const run = runSpecSet(specs, {
    PW_PROVE_CLIP: '1',
    PW_PROVE_W: String(viewport.width),
    PW_PROVE_H: String(viewport.height),
  });
  if (run.status !== 0) {
    const signature = signatureOf(`${run.stdout ?? ''}\n${run.stderr ?? ''}`);
    summarize('red', EXIT.TESTS_RED, { clips: [], viewport, verdict: opts.verdict, signature });
    stop(
      EXIT.TESTS_RED,
      `the filming run went red — ${signature.error_class} at ${signature.locator}. A spec that was ` +
        'green in the audit run and red under PW_PROVE_CLIP is a filming-law violation: the ' +
        'variable may only ADD time. Fix it, re-run the audit verb, then film again.',
    );
  }

  // 3. THE CLOSING PHASE. Never a gate: every outcome below leaves the run passing, and a clip that
  //    could not be inspected is reported uninspected rather than as good.
  const clips = collectClips(RESULTS_DIR);
  const measured = measureClips(clips);
  summarize('green', EXIT.OK, { clips: measured, viewport, verdict: opts.verdict });
  process.exit(EXIT.OK);
}

// ================================================================================== audit
// ---- the no-progress checkpoint, before a run is spent ----------------------------------------
const state = readState();
// Both halves refuse BEFORE a run is spent. The stalled flag is what makes that possible for the
// signature half: an unchanged signature can only be recognised on the attempt that repeats it, so
// that attempt records the stall and every invocation after it is refused without paying for a run.
if (state.stalled) {
  auditSummary('refused', EXIT.CHECKPOINT, state.signature, state.attempts);
  stop(
    EXIT.CHECKPOINT,
    `the loop already stalled on an unchanged failure signature (${state.signature?.error_class} ` +
      `at ${state.signature?.locator}) — no run was made. Invoke playwright-debugger on ` +
      'playwright-report/ and take the handover stop.',
  );
}
if (state.attempts >= ATTEMPT_BOUND) {
  auditSummary('refused', EXIT.CHECKPOINT, state.signature, state.attempts);
  stop(
    EXIT.CHECKPOINT,
    `${state.attempts} attempt(s) already spent against a bound of ${ATTEMPT_BOUND} — no run ` +
      'was made. Invoke playwright-debugger on playwright-report/ and take the handover stop.',
  );
}

const run = runSpecSet(specs);
const runnerOutput = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;

if (run.status === 0) {
  // A green run ends the heal loop, so the budget it was spending goes with it.
  writeState({ attempts: 0, signature: null, stalled: false });
  auditSummary('green', EXIT.OK, null, state.attempts);
  process.exit(EXIT.OK);
}

const signature = signatureOf(runnerOutput);
const attempt = state.attempts + 1;
const unchanged = same(signature, state.signature);
writeState({ attempts: attempt, signature, stalled: unchanged });
auditSummary(
  unchanged ? 'refused' : 'red',
  unchanged ? EXIT.CHECKPOINT : EXIT.TESTS_RED,
  signature,
  attempt,
);

if (unchanged) {
  stop(
    EXIT.CHECKPOINT,
    `the failure signature did not move — ${signature.error_class} at ${signature.locator}. The ` +
      'fix changed nothing the app can see, so this was a retry rather than a fix. Stop the loop: ' +
      'invoke playwright-debugger on playwright-report/ and take the handover stop.',
  );
}
stop(
  EXIT.TESTS_RED,
  `tests red on attempt ${attempt}/${ATTEMPT_BOUND} — ${signature.error_class} at ` +
    `${signature.locator}. Diagnose the failure and rerun through this verb with --grep so the ` +
    'bound sees the attempt.',
);
