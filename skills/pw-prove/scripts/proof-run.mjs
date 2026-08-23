#!/usr/bin/env node
// proof-run.mjs — Step 7's mechanics, as code. The judgement stays with the agent.
//
//   node proof-run.mjs audit --config <proof config> --test-dir <testDir> --base <ref>
//                           [--written <spec>]... [--project <name>] [--grep <title>]
//                           [--attempt-bound <n>] [--results-dir <dir>] [--state-dir <dir>]
//
// Step 7 was the largest section of pw-prove's body and the only large one with no module behind
// it: bring-up has preflight.mjs, recon has probe.mjs, the recording has har-scrub.mjs, the
// fidelity contract has clip-fidelity.mjs, the classification has hermetic.mjs — and the thing that
// ORCHESTRATES all of them was prose. Prose is the category of instruction that already failed
// here twice, both times as a wrong argument: a spec-set pathspec that returned nothing on a flat
// test dir, and an inherited `webServer` entry pointed the wrong way. Both were fixed in prose,
// landing on no test surface, so nothing stops either being reintroduced by an edit that reads
// fine. This module is the test surface. `audit` is its first verb; `film` and `mutate` follow.
//
// WHAT THIS VERB OWNS, AND WHY EACH PIECE IS HERE RATHER THAN IN THE BODY:
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
//   and a run that repeats an unchanged one is refused with its own exit code (7) rather than
//   reported as merely red (6). The heal loop's targeted reruns go through this same verb with
//   `--grep`, so every attempt the agent makes is an attempt the bound sees; a raw runner call
//   would leave the bound blind to exactly the attempts it exists to count.
//
//   THE MODULE'S STATE IS EXCLUDED REPO-LOCALLY, through `.git/info/exclude` and never through the
//   project's `.gitignore` — the convention the HAR bind already sets. The state is this run's
//   private working state; a stray `.gitignore` diff is churn the delivery step would have to
//   explain.
//
// WHAT STAYS WITH THE AGENT, unchanged: diagnosing a red test and writing the fix, judging whether
// a present carve-out is legitimate, and the handover stop when the loop is exhausted.
//
// Zero dependencies, Node stdlib only, per the shipped-scripts convention.
//
// Exit codes are the contract both the agent and the ledger read. They are one table across the
// three verbs, so a code never means two things:
//   0   success (for `audit`: the run went green)
//   1   usage
//   2   unreadable input, or no resolvable runner
//   3   spec set resolved empty
//   4   type check failed                    } reserved — the audit verb's first phase
//   5   HAR bind refused                     } reserved — the audit verb's bind phase
//   6   tests red
//   7   checkpoint refusal — an unchanged failure signature, or an attempt past the bound
//   8   mutation run green (the spec does not guard the change)   } reserved — `mutate`
//   9   tree residue after the revert, a hard stop                } reserved — `mutate`
//   10  clips clobbered or count mismatched                       } reserved — `film`/`mutate`
//   11  restart unproven                                          } reserved — `mutate`
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pwproveRun } from './pwprove-run.mjs';

const EXIT = {
  OK: 0,
  USAGE: 1,
  INPUT: 2,
  EMPTY_SET: 3,
  TESTS_RED: 6,
  CHECKPOINT: 7,
};

const VERBS = new Set(['audit']);
const SUMMARY_SCHEMA = 1;
const STATE_SCHEMA = 1;
const DEFAULT_ATTEMPT_BOUND = 3;
// The extension filter that runs AFTER the directory pathspec. Deliberately the same set the body
// documented: .spec/.test, any of js/jsx/ts/tsx, with the cjs/mjs prefixes projects do use.
const SPEC_RE = /\.(spec|test)\.[cm]?[jt]sx?$/;

const out = (s) => process.stdout.write(s);
const err = (s) => process.stderr.write(s);

const USAGE =
  'usage: proof-run.mjs audit --config <proof config> --test-dir <testDir> --base <ref>\n' +
  '                          [--written <spec>]... [--project <name>] [--grep <title>]\n' +
  '                          [--attempt-bound <n>] [--results-dir <dir>] [--state-dir <dir>]\n';

const verb = process.argv[2];
// Read before validation so even a usage-error exit leaves a ledger record; the phase is the verb.
pwproveRun(import.meta.url, VERBS.has(verb) ? verb : 'audit');

function usage(message) {
  err(`proof-run.mjs: ${message}\n${USAGE}`);
  process.exit(EXIT.USAGE);
}

if (!verb) usage('no verb — expected one of: audit');
if (!VERBS.has(verb)) usage(`unknown verb '${verb}' — expected one of: audit`);

const opts = {
  config: null,
  testDir: null,
  base: null,
  written: [],
  project: 'chromium',
  grep: null,
  attemptBound: DEFAULT_ATTEMPT_BOUND,
  resultsDir: 'test-results',
  stateDir: '.pw-prove',
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
  else if (a === '--attempt-bound') opts.attemptBound = Number(need(++i, a));
  else if (a === '--results-dir') opts.resultsDir = need(++i, a);
  else if (a === '--state-dir') opts.stateDir = need(++i, a);
  else usage(`unknown flag '${a}'`);
}

for (const [flag, value] of [
  ['--config', opts.config],
  ['--test-dir', opts.testDir],
  ['--base', opts.base],
]) {
  if (!value) usage(`${flag} is required`);
}
if (!Number.isInteger(opts.attemptBound) || opts.attemptBound < 1) {
  usage('--attempt-bound needs a positive integer');
}

function stop(code, message) {
  err(`proof-run ${verb}: ${message}\n`);
  process.exit(code);
}

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });

if (!fs.existsSync(opts.config)) {
  stop(EXIT.INPUT, `--config '${opts.config}' does not exist`);
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

fs.mkdirSync(opts.stateDir, { recursive: true });
// `.git/info/exclude`, never the project's `.gitignore`: this is the run's private working state.
try {
  const excludeFile = path.join(repoTop, '.git', 'info', 'exclude');
  const entry = `${opts.stateDir.replace(/\/+$/, '')}/`;
  fs.mkdirSync(path.dirname(excludeFile), { recursive: true });
  const current = fs.existsSync(excludeFile) ? fs.readFileSync(excludeFile, 'utf8') : '';
  if (!current.split('\n').includes(entry)) {
    fs.appendFileSync(excludeFile, current.endsWith('\n') || current === '' ? `${entry}\n` : `\n${entry}\n`);
  }
} catch (e) {
  stop(EXIT.INPUT, `cannot write the repo-local exclude entry (${e.message})`);
}

const statePath = path.join(opts.stateDir, 'audit-state.json');
function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (parsed?.schema !== STATE_SCHEMA) return { attempts: 0, signature: null };
    return { attempts: Number(parsed.attempts) || 0, signature: parsed.signature ?? null };
  } catch {
    return { attempts: 0, signature: null };
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
function summarize(fields) {
  out(`PWPROVE_SUMMARY ${JSON.stringify({ schema: SUMMARY_SCHEMA, verb, ...fields })}\n`);
}

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

if (specs.length === 0) {
  summarize({ specs: [], result: 'empty', signature: null, attempt: 0, attempt_bound: opts.attemptBound, grep: opts.grep, exit: EXIT.EMPTY_SET });
  stop(
    EXIT.EMPTY_SET,
    `no spec resolved from '${opts.testDir}' against --base '${opts.base}'. PR-mode reaches ` +
      'Step 7 with at least the spec this run wrote, so this is a wrong base ref or a test ' +
      'directory that is not where the specs landed. Fix the resolution; never run an empty set.',
  );
}

// ---- the no-progress checkpoint, before a run is spent ----------------------------------------
const state = readState();
if (state.attempts >= opts.attemptBound) {
  summarize({ specs, result: 'refused', signature: state.signature, attempt: state.attempts, attempt_bound: opts.attemptBound, grep: opts.grep, exit: EXIT.CHECKPOINT });
  stop(
    EXIT.CHECKPOINT,
    `${state.attempts} attempt(s) already spent against a bound of ${opts.attemptBound} — no run ` +
      'was made. Invoke playwright-debugger on playwright-report/ and take the handover stop.',
  );
}

// ---- the run ----------------------------------------------------------------------------------
// Cleared BEFORE the runner starts: whatever stands here at publish time becomes the evidence.
fs.rmSync(opts.resultsDir, { recursive: true, force: true });

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
const run = spawnSync('npx', runnerArgs, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
if (run.error) {
  stop(EXIT.INPUT, `cannot run the test runner (${run.error.message}). 'npx' must be on PATH.`);
}
const console_ = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
out(run.stdout ?? '');
err(run.stderr ?? '');

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

if (run.status === 0) {
  // A green run ends the heal loop, so the budget it was spending goes with it.
  writeState({ attempts: 0, signature: null });
  summarize({ specs, result: 'green', signature: null, attempt: state.attempts, attempt_bound: opts.attemptBound, grep: opts.grep, exit: EXIT.OK });
  process.exit(EXIT.OK);
}

const signature = signatureOf(console_);
const attempt = state.attempts + 1;
const unchanged = same(signature, state.signature);
writeState({ attempts: attempt, signature });
summarize({
  specs,
  result: unchanged ? 'refused' : 'red',
  signature,
  attempt,
  attempt_bound: opts.attemptBound,
  grep: opts.grep,
  exit: unchanged ? EXIT.CHECKPOINT : EXIT.TESTS_RED,
});

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
  `tests red on attempt ${attempt}/${opts.attemptBound} — ${signature.error_class} at ` +
    `${signature.locator}. Diagnose the failure and rerun through this verb with --grep so the ` +
    'bound sees the attempt.',
);
