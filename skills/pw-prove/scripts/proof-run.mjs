#!/usr/bin/env node
// proof-run.mjs — Step 7's mechanics, as code. The judgement stays with the agent.
//
//   node proof-run.mjs audit --config <proof config> --test-dir <testDir> --base <ref>
//                           [--written <spec>]... [--har <recording>] [--origin <url>]
//                           [--bindings <json>] [--project <name>] [--grep <title>]
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
//   TWO PRECONDITIONS RUN BEFORE ANYTHING IS SPENT, EACH REFUSING UNDER ITS OWN CODE. A browser run
//   is the expensive thing in this pass, and both of these are questions that can be answered
//   without one. They run after the spec set resolves and after the no-progress checkpoint —
//   resolution is a git query and the checkpoint pays for nothing, so a stalled loop is refused
//   before it buys even a type check — and before the runner, which is the whole point.
//
//   THE TYPE CHECK IS THE FIRST PHASE, AND WHICH TSCONFIG IT TAKES IS THE VERB'S BRANCH. The e2e
//   tsconfig when the project has one, the root one otherwise, and the phase is SKIPPED when it has
//   neither rather than guessed at — a JavaScript project is not a defect. There is deliberately no
//   flag pointing it elsewhere: a reader who has to make the branch is a reader who can get it
//   wrong, and a flag for it would be one more thing every invocation has to carry correctly.
//   `--no-install` is fixed here for the reason it is fixed everywhere in this skill. A spec that
//   does not compile fails in seconds; learning that from a browser run costs the run.
//
//   THE HAR BIND IS THE SECOND PHASE, AND IT IS DELEGATED, NEVER REIMPLEMENTED. The committed
//   recording is canonical — no port, every secret a stable placeholder — and Playwright's replay
//   matches a recorded entry by EXACT request-URL string equality, so an unbound recording cannot
//   match anything this run does: under `notFound: 'abort'` every read aborts and the transcript
//   reads as a broken application. So the recording is bound to this run's origin before any test
//   executes, by `har-scrub.mjs bind`, which already owns that transform. The bound copy carries
//   this run's live credential, so its destination is fixed under the run's own dot-directory —
//   already excluded repo-locally above — rather than being a flag a caller could point at a
//   committable path. It reaches the run that follows through `PW_PROVE_HAR`, set on the runner's
//   environment here rather than left to a caller to export: every runner invocation is a fresh
//   environment, and setting it once in a shell is how a bound recording goes missing.
//
//   A BIND THAT CANNOT BE MADE SAFE IS A STOP (exit 5), IN BOTH ITS FORMS. A placeholder sitting in
//   the replay match key — a `token=` in a URL, a matched POST body — has no value this run can
//   supply, so that entry can never match; left alone it surfaces later as an aborted call and gets
//   diagnosed as an application defect rather than as a bind that was never done. And a bind
//   destination git would commit is a live credential heading for the index. The summary
//   distinguishes the two (`unbound-placeholder` / `committable-output`) so the next move is read
//   rather than inferred. A project with NO recording skips the phase; only a recording that was
//   named and cannot be bound stops the run.
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
// WHAT STAYS WITH THE AGENT, unchanged: diagnosing a red test and writing the fix, judging whether
// a present carve-out is legitimate, and the handover stop when the loop is exhausted.
//
// Zero dependencies, Node stdlib only, per the shipped-scripts convention.
//
// Exit codes are the contract both the agent and the ledger read. They are one table across the
// three verbs, so a code never means two things:
//   0   success (for `audit`: the run went green)
//   1   usage                                  } no summary line: these exit before the spec set
//   2   unreadable input, or no resolvable runner }   exists, so there is nothing to summarize
//   3   spec set resolved empty
//   4   type check failed
//   5   HAR bind refused — a placeholder in the replay match key, or a committable bind output
//   6   tests red
//   7   checkpoint refusal — an unchanged failure signature, or an attempt past the bound
//   8   mutation run green (the spec does not guard the change)   } reserved — `mutate`
//   9   tree residue after the revert, a hard stop                } reserved — `mutate`
//   10  clips clobbered or count mismatched                       } reserved — `film`/`mutate`
//   11  restart unproven                                          } reserved — `mutate`
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pwproveRun } from './pwprove-run.mjs';

const EXIT = {
  OK: 0,
  USAGE: 1,
  INPUT: 2,
  EMPTY_SET: 3,
  TYPECHECK: 4,
  HAR_BIND: 5,
  TESTS_RED: 6,
  CHECKPOINT: 7,
};

const VERBS = new Set(['audit']);
// 2 added the `phases` record: the two preconditions report themselves whatever they did.
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
// The scrubber's own exit table, read rather than re-derived. Its bind mode answers three ways that
// mean different things here: 4 an unbindable match key, 5 a destination git would commit, and
// 1/2 an input this module handed it wrong — which is this module's bug, not a bind refusal.
const SCRUB = { UNBOUND: 4, COMMITTABLE: 5 };

const out = (s) => process.stdout.write(s);
const err = (s) => process.stderr.write(s);

const USAGE =
  'usage: proof-run.mjs audit --config <proof config> --test-dir <testDir> --base <ref>\n' +
  '                          [--written <spec>]... [--har <recording>] [--origin <url>]\n' +
  '                          [--bindings <json>] [--project <name>] [--grep <title>]\n';

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
  har: null,
  origin: null,
  bindings: null,
  project: 'chromium',
  grep: null,
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
  else if (a === '--har') opts.har = need(++i, a);
  else if (a === '--origin') opts.origin = need(++i, a);
  else if (a === '--bindings') opts.bindings = need(++i, a);
  else if (a === '--project') opts.project = need(++i, a);
  else if (a === '--grep' || a === '-g') opts.grep = need(++i, a);
  else usage(`unknown flag '${a}'`);
}

for (const [flag, value] of [
  ['--config', opts.config],
  ['--test-dir', opts.testDir],
  ['--base', opts.base],
]) {
  if (!value) usage(`${flag} is required`);
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
// A recording that was NAMED and is not there is a wrong flag, not a project without a recording:
// silently skipping the bind phase over it is how a run reaches the tests with every read aborting.
if (opts.har && !fs.existsSync(opts.har)) {
  stop(EXIT.INPUT, `--har '${opts.har}' is not on disk — omit the flag when there is no recording`);
}
if (opts.bindings && !fs.existsSync(opts.bindings)) {
  stop(EXIT.INPUT, `--bindings '${opts.bindings}' is not on disk`);
}
if (opts.origin) {
  try {
    new URL(opts.origin);
  } catch {
    usage(`--origin '${opts.origin}' is not an absolute URL`);
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
// The two preconditions report themselves whatever they did — ok, skipped, or the refusal and its
// reason — so "was the bind done?" is read out of one line rather than inferred from its absence.
const phases = {
  typecheck: { status: 'pending', tsconfig: null },
  har_bind: { status: 'pending', har: null, out: null, reason: null },
};
let summarize = () => {};
function bindSummary(specs) {
  summarize = (result, exit, signature, attempt) => {
    out(
      `PWPROVE_SUMMARY ${JSON.stringify({
        schema: SUMMARY_SCHEMA,
        verb,
        specs,
        phases,
        grep: opts.grep,
        attempt,
        attempt_bound: ATTEMPT_BOUND,
        result,
        signature,
        exit,
      })}\n`,
    );
  };
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

bindSummary(specs);

if (specs.length === 0) {
  summarize('empty', EXIT.EMPTY_SET, null, 0);
  stop(
    EXIT.EMPTY_SET,
    `no spec resolved from '${opts.testDir}' against --base '${opts.base}'. PR-mode reaches ` +
      'Step 7 with at least the spec this run wrote, so this is a wrong base ref or a test ' +
      'directory that is not where the specs landed. Fix the resolution; never run an empty set.',
  );
}

// ---- the no-progress checkpoint, before a run is spent ----------------------------------------
const state = readState();
// Both halves refuse BEFORE a run is spent. The stalled flag is what makes that possible for the
// signature half: an unchanged signature can only be recognised on the attempt that repeats it, so
// that attempt records the stall and every invocation after it is refused without paying for a run.
if (state.stalled) {
  summarize('refused', EXIT.CHECKPOINT, state.signature, state.attempts);
  stop(
    EXIT.CHECKPOINT,
    `the loop already stalled on an unchanged failure signature (${state.signature?.error_class} ` +
      `at ${state.signature?.locator}) — no run was made. Invoke playwright-debugger on ` +
      'playwright-report/ and take the handover stop.',
  );
}
if (state.attempts >= ATTEMPT_BOUND) {
  summarize('refused', EXIT.CHECKPOINT, state.signature, state.attempts);
  stop(
    EXIT.CHECKPOINT,
    `${state.attempts} attempt(s) already spent against a bound of ${ATTEMPT_BOUND} — no run ` +
      'was made. Invoke playwright-debugger on playwright-report/ and take the handover stop.',
  );
}

// ---- phase 1: the type check -------------------------------------------------------------------
// The branch is the verb's. `-p` takes the e2e tsconfig when the project has one, the root one
// otherwise, and neither means a project with nothing to type check rather than a phase to fail.
const e2eTsconfig = path.join(opts.testDir, 'tsconfig.json');
const tsconfig = fs.existsSync(e2eTsconfig)
  ? e2eTsconfig
  : fs.existsSync('tsconfig.json')
    ? 'tsconfig.json'
    : null;

if (!tsconfig) {
  phases.typecheck = { status: 'skipped', tsconfig: null };
} else {
  const tsc = spawnSync('npx', ['--no-install', 'tsc', '--noEmit', '-p', tsconfig], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (tsc.error) {
    stop(EXIT.INPUT, `cannot run the type checker (${tsc.error.message}). 'npx' must be on PATH.`);
  }
  // On stderr, not stdout: stdout carries this verb's one summary line and the runner's own output,
  // and a compiler's diagnosis belongs beside the refusal it caused. tsc prints errors to stdout.
  err(`${tsc.stdout ?? ''}${tsc.stderr ?? ''}`);
  if (tsc.status !== 0) {
    phases.typecheck = { status: 'failed', tsconfig };
    summarize('typecheck-failed', EXIT.TYPECHECK, null, state.attempts);
    stop(
      EXIT.TYPECHECK,
      `the spec set does not compile against '${tsconfig}' — no run was made. Fix the type ` +
        'errors above and invoke this verb again; a type-only fix is gated by tsc, so batch it ' +
        'into the next behavioural rerun rather than paying a browser run for it.',
    );
  }
  phases.typecheck = { status: 'ok', tsconfig };
}

// ---- phase 2: the HAR bind, delegated to the scrubber -------------------------------------------
// The destination is fixed under the run's own dot-directory, not a flag: it holds this run's live
// credential, and the one already-excluded directory is the only place it belongs.
let boundHar = null;
if (!opts.har) {
  phases.har_bind = { status: 'skipped', har: null, out: null, reason: null };
} else {
  const outPath = path.join(STATE_DIR, path.basename(opts.har));
  const scrubber = fileURLToPath(new URL('./har-scrub.mjs', import.meta.url));
  const bindArgv = [
    scrubber,
    'bind',
    opts.har,
    '--out',
    outPath,
    // Omitted when the project owns rebinding at run time — that judgement is the agent's, made in
    // Step 1, and expressed by leaving the flag off. Everything else about the bind still runs.
    ...(opts.origin ? ['--origin', opts.origin] : []),
    ...(opts.bindings ? ['--bindings', opts.bindings] : []),
  ];
  const bind = spawnSync(process.execPath, bindArgv, { encoding: 'utf8' });
  if (bind.error) {
    stop(EXIT.INPUT, `cannot run the scrubber (${bind.error.message})`);
  }
  // The delegate's whole account goes to stderr — including its own stdout lines — so this verb's
  // stdout stays one summary line plus the runner's output.
  err(`${bind.stdout ?? ''}${bind.stderr ?? ''}`);
  if (bind.status !== 0) {
    const reason =
      bind.status === SCRUB.UNBOUND
        ? 'unbound-placeholder'
        : bind.status === SCRUB.COMMITTABLE
          ? 'committable-output'
          : 'scrubber-input';
    const refused = reason !== 'scrubber-input';
    phases.har_bind = {
      status: refused ? 'refused' : 'failed',
      har: opts.har,
      out: outPath,
      reason,
    };
    const code = refused ? EXIT.HAR_BIND : EXIT.INPUT;
    summarize('har-bind-refused', code, null, state.attempts);
    stop(
      code,
      reason === 'unbound-placeholder'
        ? `'${opts.har}' cannot be bound to this run: the placeholder(s) named above sit in the ` +
            'replay match key, so those entries can never match and would abort mid-run as if the ' +
            'application were broken. Give each one this run\'s own value in a bindings file and ' +
            'pass it as --bindings, or re-record.'
        : reason === 'committable-output'
          ? `the bound copy of '${opts.har}' would land at a path git tracks ('${outPath}'), and ` +
              'it carries this run\'s live credential. Stop un-ignoring the run\'s own ' +
              `directory ('${STATE_DIR}/') in the project's .gitignore; the committed recording ` +
              'stays canonical either way.'
          : `the scrubber could not read '${opts.har}' — no run was made.`,
    );
  }
  boundHar = path.resolve(outPath);
  phases.har_bind = { status: 'ok', har: opts.har, out: outPath, reason: null };
}

// ---- the run ----------------------------------------------------------------------------------
// Cleared BEFORE the runner starts: whatever stands here at publish time becomes the evidence.
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
// PW_PROVE_HAR is set HERE and not left to a caller: every runner invocation is a fresh
// environment, so a bound recording exported once in a shell goes missing on the next one.
const run = spawnSync('npx', runnerArgs, {
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
  env: boundHar ? { ...process.env, PW_PROVE_HAR: boundHar } : process.env,
});
if (run.error) {
  stop(EXIT.INPUT, `cannot run the test runner (${run.error.message}). 'npx' must be on PATH.`);
}
const runnerOutput = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
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
  writeState({ attempts: 0, signature: null, stalled: false });
  summarize('green', EXIT.OK, null, state.attempts);
  process.exit(EXIT.OK);
}

const signature = signatureOf(runnerOutput);
const attempt = state.attempts + 1;
const unchanged = same(signature, state.signature);
writeState({ attempts: attempt, signature, stalled: unchanged });
summarize(
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
