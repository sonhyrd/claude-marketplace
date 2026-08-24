#!/usr/bin/env node
// proof-run.mjs — Step 7's mechanics, as code. The judgement stays with the agent.
//
//   node proof-run.mjs audit --config <proof config> --test-dir <testDir> --base <ref>
//                           [--written <spec>]... [--har <recording>] [--origin <url>]
//                           [--bindings <json>] [--project <name>] [--grep <title>]
//   node proof-run.mjs film  --config <proof config> --test-dir <testDir> --base <ref>
//                           --project-config <the project's own playwright.config>
//                           --verdict <pinned:WxH|deliberate:WxH> [--written <spec>]... [--project <name>]
//   node proof-run.mjs mutate --config <proof config> --test-dir <testDir> --base <ref>
//                           --written <spec>... --grep <the guarding test> --mutated <file>...
//                           [--project <name>]
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
//   THE NETWORK CLASSIFICATION IS DELEGATED TO `hermetic.mjs`, AND ONLY THE MECHANICAL HALF OF THE
//   CARVE-OUT CHECK IS COMPUTED HERE. The classification runs on the audit run's traces, on a green
//   run, because that is the run the body licenses filming from — a red run's traces describe a spec
//   that is still being healed, and reporting them would read as a finding about the PR. The module
//   renders no verdict by deliberate design (ADR-0010): matching live calls against the spec's
//   `// CARVE-OUT:` lines is a judgement about INTENT, and that stays with the agent. But PRESENCE is
//   not a judgement — a live call whose path appears in no carve-out line anywhere in the spec set is
//   undeclared, and that is a string comparison. So this verb computes presence and reports the
//   undeclared list; whether a carve-out that IS present earns its place is still the agent's call.
//   The hermetic module is invoked, never reimplemented and never modified: a second copy of that
//   classification is the copy that drifts.
//
//   IT IS INVOKED ONCE PER SPEC, because its `--spec` scan takes one file and the round-trip class it
//   finds — `route.fetch()`, which leaves the machine from the Playwright process and so appears
//   MOCKED in a trace — is per spec. The classification itself is read from the first invocation
//   only; every invocation reads the same traces, so the rest would be the same list re-derived. The
//   price is re-reading the traces per spec, and it is the price of not growing a second `--spec`
//   flag onto a module whose contract this change is not allowed to touch.
//
//   A RUN THAT RECORDED NO TRACES IS REPORTED, NOT REDEFINED. `hermetic.mjs` exits 2 when there is
//   nothing to classify — the proof config must set `trace: 'on'`, and the committed one does. That
//   is a phase result (`failed`, reason `no-traces`), not a new exit code: the run's own result is
//   what the exit code carries, and inventing a code here would make one code mean two things.
//
//   AN UNDECLARED LIVE CALL DOES NOT REFUSE THE AUDIT VERB. The audit pass REPORTS the network; the
//   refusal that costs a re-run rather than the clips belongs to the filming verb, which is where the
//   spend it protects actually happens.
//
//   AND IT REACHES THAT VERB THROUGH THE RUN'S STATE, NOT THROUGH THE SUMMARY. The summary is stdout
//   an agent reads; a later process cannot see it, and a refusal that depends on the agent
//   volunteering the finding is not a refusal. So `audit`'s classification phase persists the LIVE
//   CALLS it saw, and `film` recomputes the undeclared list from them against the spec text as it
//   stands at that moment. The split is along the same line the classification itself is split on: a
//   live call is a fact about a RUN and cannot be re-derived without paying for another one, while
//   the `// CARVE-OUT:` lines are a fact about the SPEC TEXT and cost a file read. Persisting the
//   derived list instead would freeze the spec half at audit time, so a declaration written the
//   minute after would go unseen and the refusal would outlive the edit that answered it — which is
//   no better than having no refusal at all.
//
//   A RECORD SAYS NOTHING ABOUT SPECS IT DID NOT SEE, AND SAYS SO. Mocking a call — the body's other
//   fix — is invisible in the spec's carve-out lines, so a record whose specs have moved cannot be
//   read as either clearance or indictment. `film` refuses that case under the same code and names it
//   for what it is: the finding predates the edit. One green audit settles it, and that is the cheap
//   re-run this refusal exists to sell. Every `audit` invocation drops the record first and only the
//   classification phase writes a new one, so a red audit, a failed type check or a run with no
//   traces leaves NO record — a run that never asked the question cannot leave a clean bill of health.
//   Whether a carve-out that IS present earns its place is still the agent's, in both verbs.
//
//   THE RE-FILM COUNT IS A FACT CARRIED FORWARD, NEVER A REFUSAL. The body allows exactly one
//   re-film, and a second illegible frame PUBLISHES ANYWAY with an explicit warning — so there is
//   nothing here to refuse; there is something to remember. The count lives in the run's state and
//   the second filming run sets `publish_with_warning` in the summary, which Step 8 and the
//   completion report carry. Today that warning depends on an agent recalling, across a diagnosis
//   and a re-run, which attempt this was. Only a run that produced clips spends the re-film, so a
//   refusal and a red run leave the count alone; and a GREEN AUDIT resets it, because a green audit
//   is what licenses filming and so opens the cycle the count is counting within — without that, the
//   count would outlive its proof and the next proof's very first clip would publish with a warning.
//
//   THE MODULE'S STATE IS EXCLUDED REPO-LOCALLY, through `.git/info/exclude` and never through the
//   project's `.gitignore` — the convention the HAR bind already sets. The state is this run's
//   private working state; a stray `.gitignore` diff is churn the delivery step would have to
//   explain. It is three files with one owner each, because they answer to different lifetimes:
//   `audit` owns the heal budget (`audit-state.json`) and the network finding (`audit-network.json`)
//   and clears both at the boundaries of the cycle it owns; `film` owns the re-film count
//   (`film-state.json`) and only increments it; `mutate` writes none, and reads none. A verb that
//   keeps no state creates no directory either.
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
//   THE MUTATION RUN'S OUTPUT IS ISOLATED BY CONSTRUCTION, AND IT IS THE REASON THE VERB EXISTS
//   SEPARATELY. `test-results/` holds the recorded evidence of the run that PASSED — the clips
//   Step 8 is about to publish. A mutation run writing there overwrites them with footage of
//   deliberately broken software, which is the worst artifact this pipeline could emit; it costs a
//   full extra proof run to regenerate, and only if anyone notices. So `--output` is fixed here
//   rather than passed, the results directory is NOT cleared on this verb — the one place that rule
//   is off, because here the standing contents are the thing being protected rather than stale
//   litter — and the reporter is `line`: a mutation run records nothing and publishes nothing.
//
//   A RED MUTATION RUN IS SUCCESS (exit 0) AND A GREEN ONE IS A FINDING (exit 8). The verb inverts
//   the usual reading on purpose: the question it asks is "does the spec guard this change?", so the
//   test going red is the answer that passes. Collapsing green into `tests red` (6) would report
//   "the spec does not guard the change" as "the tests failed", which is the opposite claim about
//   the same run. The agent reads 8 and strengthens the terminal assertion, or names the behaviour
//   unguardable at this layer; both of those are judgement and stay with it.
//
//   THE REVERT IS UNCONDITIONAL AND IMMEDIATE — it runs the moment the runner returns, before the
//   verdict is read at all, so no branch of this verb can leave a deliberately broken tree behind.
//   `--mutated` names the files the agent changed, because reverting anything it did not name would
//   throw away work the run did not make. The files are checked BEFORE the run: one that is not
//   tracked cannot be reverted, and one that carries no unstaged change means the mutation was
//   never applied (or was staged) — either way a green run would prove nothing, so both stop here
//   rather than being paid for.
//
//   RESIDUE AFTER THE REVERT IS A HARD STOP (exit 9), and it is measured against a pre-state taken
//   before anything ran. The pre-state is the tree MINUS the mutated files' own changes — which is
//   exactly what the tree must look like once they are reverted — so the comparison catches a revert
//   that did not take and anything the run itself left lying in the tree, tracked or not. It cannot
//   catch a mutation the agent applied to a file it did not declare: by the time this verb is
//   invoked that edit is already in the tree and is indistinguishable from the run's own work.
//   Declare every file you mutated. A proof never continues on a polluted working tree.
//
//   THE CLIPS ARE COUNTED AFTERWARDS, AGAINST THE SPEC SET (exit 10). Every clip standing before
//   the mutation run must still be standing, byte-for-byte unmoved, afterwards — and there must be
//   at least one per spec in the PR spec set, carried scenarios included, because that set is what
//   the filming run filmed. Evidence that was clobbered is then caught here rather than noticed by
//   a reviewer watching broken software. The mutation run is scoped to the scenarios THIS run wrote
//   (`--written` plus `--grep`), while the count is against the whole set: the two scopes are
//   different on purpose, and widening one leaves the other where it is. The floor this verb can
//   compute alone is one clip per SPEC; `--clips` carries the filming run's own scenario count, so
//   a multi-scenario spec's missing clips are caught rather than absorbed by the weaker floor.
//
// WHAT STAYS WITH THE AGENT, unchanged: diagnosing a red test and writing the fix, judging whether
// a present carve-out is legitimate, READING EACH EXTRACTED FRAME and naming what is wrong with it,
// CHOOSING WHICH LINE TO MUTATE, strengthening the terminal assertion once and rendering the
// unguardable-at-this-layer verdict, and the handover stop when the loop is exhausted.
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
//   8   mutation run green (the spec does not guard the change)   } `mutate` — 0 there means the
//   9   tree residue after the revert, a hard stop                }   run went RED, which is what
//   10  clips clobbered or count mismatched                       }   this verb is asking for
//   11  restart unproven                                          } reserved — `mutate`, see #148
//   12  filming precondition refused — the spec does not carry the clip-fidelity contract
//   13  filming refused — the audit's undeclared live call(s) stand
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pwproveRun } from './pwprove-run.mjs';
import { frameFor, probeVideo, videoTooling } from './video.mjs';

const EXIT = {
  OK: 0,
  USAGE: 1,
  INPUT: 2,
  EMPTY_SET: 3,
  TYPECHECK: 4,
  HAR_BIND: 5,
  TESTS_RED: 6,
  CHECKPOINT: 7,
  MUTATION_GREEN: 8,
  RESIDUE: 9,
  CLIPS: 10,
  FIDELITY: 12,
  UNDECLARED: 13,
};

const VERBS = new Set(['audit', 'film', 'mutate']);
// 2 added the `phases` record (the two preconditions report themselves whatever they did) and the
// film verb's fields: `clips`, `viewport` and `verdict`.
// 3 added `phases.hermetic` (the network classification and the undeclared live calls) and the
// mutate verb's fields: `mutation_run`, `output`, `mutated`, `reverted`, `residue`, and `clips` as
// a count record rather than the film verb's list.
// 4 added the film verb's `network` record (the audit finding this run was judged against) and its
// `films`/`publish_with_warning` pair.
// Fields are added over time, so a reader reads the schema before it reads anything else.
const SUMMARY_SCHEMA = 4;
const STATE_SCHEMA = 1;
// The two records `audit` hands to `film`, each versioned on its own: they are written and read by
// different invocations, so a reader that assumed one schema for all three files would break both
// halves of the handover to change either one.
const NETWORK_SCHEMA = 1;
const FILM_SCHEMA = 1;
// Fixed, not a flag. The bound is the body's bound, and a knob whose only caller would be a test is
// a test-only injection point — the one thing this module is not allowed to grow.
const ATTEMPT_BOUND = 3;
// Fixed for the same reason the runner's shape is fixed: these are the paths the body names, and a
// flag for either would let a caller point a recursive delete somewhere it does not belong.
const RESULTS_DIR = 'test-results';
const STATE_DIR = '.pw-prove';
// The mutation run's isolated output lives under the system temp directory, so nothing about it can
// land in the project's diff, and it is keyed by the repository it belongs to: proofs run in
// parallel worktrees are this repo's normal shape, and one fixed machine-global directory that each
// run deletes at start would have them deleting each other's. The name is still fixed by
// CONSTRUCTION rather than passed — a flag here could be pointed back at `test-results/`, which is
// the one thing this verb exists to keep it away from. It travels in the summary as `output`, which
// is where a later step reads it rather than reconstructing it.
const mutationOut = (repo) =>
  path.join(os.tmpdir(), `pw-prove-mutation-${crypto.createHash('sha1').update(repo).digest('hex').slice(0, 12)}`);
// The extension filter that runs AFTER the directory pathspec. Deliberately the same set the body
// documented: .spec/.test, any of js/jsx/ts/tsx, with the cjs/mjs prefixes projects do use.
const SPEC_RE = /\.(spec|test)\.[cm]?[jt]sx?$/;
// The sibling module that owns both halves of the fidelity contract — the Step-6 gate `film` runs as
// its precondition, and the Step-7 frame extraction that closes it. Resolved beside this file so the
// skill can be installed anywhere; never reimplemented here.
const CLIP_FIDELITY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'clip-fidelity.mjs');

// The hermetic module's own exit table, read rather than re-derived: 2 is "no traces to classify",
// which is a phase result here and never this verb's exit code.
const HERMETIC = { NO_TRACES: 2 };
// The methods a carve-out line can name. A line that names none declares the path for every method;
// a line that names one declares only that one, so a `POST` carve-out cannot cover a live `GET`.
const METHOD_RE = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
// Only the HEAD of the line declares — the text before the first separator. The documented form is
// `CARVE-OUT: POST /api/v2/drafts — why — restore: DELETE /api/v2/drafts/:id`, so a method scan over
// the WHOLE line reads the restore clause's verb as a second declared method and turns a
// leading-path-only carve-out into a false `undeclared` — the one direction this check must not err
// in, since it would send the agent to declare something already declared.
const DECLARATION_HEAD = /^([^\u2014\u2013]*)/;
// The scrubber's own exit table, read rather than re-derived. Its bind mode answers three ways that
// mean different things here: 4 an unbindable match key, 5 a destination git would commit, and
// 1/2 an input this module handed it wrong — which is this module's bug, not a bind refusal.
const SCRUB = { UNBOUND: 4, COMMITTABLE: 5 };
// The phase vocabulary, named for the same reason the exit table is: an agent branches on these.
// NOT_REACHED is distinct from SKIPPED on purpose — an exit that stops before the phases run (an
// empty spec set, a checkpoint refusal) never asked the question, and reporting that as `skipped`
// would say the project has no tsconfig and no recording when nothing of the sort was established.
const PHASE = {
  NOT_REACHED: 'not-reached',
  SKIPPED: 'skipped',
  OK: 'ok',
  FAILED: 'failed',
  REFUSED: 'refused',
};

const out = (s) => process.stdout.write(s);
const err = (s) => process.stderr.write(s);

const USAGE =
  'usage: proof-run.mjs audit --config <proof config> --test-dir <testDir> --base <ref>\n' +
  '                          [--written <spec>]... [--har <recording>] [--origin <url>]\n' +
  '                          [--bindings <json>] [--project <name>] [--grep <title>]\n' +
  '       proof-run.mjs film  --config <proof config> --test-dir <testDir> --base <ref>\n' +
  "                          --project-config <the project's own playwright.config>\n" +
  '                          --verdict <pinned:WxH|deliberate:WxH>\n' +
  '                          [--written <spec>]... [--project <name>]\n' +
  '       proof-run.mjs mutate --config <proof config> --test-dir <testDir> --base <ref>\n' +
  '                          --written <spec>... --grep <the guarding test> --mutated <file>...\n' +
  '                          [--project <name>]\n';

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
  har: null,
  origin: null,
  bindings: null,
  project: 'chromium',
  grep: null,
  projectConfig: null,
  verdict: null,
  mutated: [],
  clips: null,
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
  else if (a === '--project-config') opts.projectConfig = need(++i, a);
  else if (a === '--verdict') opts.verdict = need(++i, a);
  else if (a === '--mutated') opts.mutated.push(need(++i, a));
  else if (a === '--clips') opts.clips = need(++i, a);
  else usage(`unknown flag '${a}'`);
}

// One row per verb, so a fourth verb is one row rather than an edit in every table below.
// `required` and `accepted` are read in both directions: a flag missing from `required` stops the
// run, and a flag in neither list is a usage error rather than a silent no-op — a flag that reads as
// accepted and does nothing is exactly the class of defect this module exists to make impossible.
// `accepted` lists everything beyond the universal four (--config/--test-dir/--base/--project); two
// verbs legitimately share one, since the heal loop's --grep on `audit` and the guarding test's
// --grep on `mutate` are the same flag doing the same job.
const VERB_SPEC = {
  audit: {
    required: ['--config', '--test-dir', '--base'],
    accepted: ['--written', '--grep', '--har', '--origin', '--bindings'],
  },
  film: {
    required: ['--config', '--test-dir', '--base', '--project-config', '--verdict'],
    accepted: ['--written'],
  },
  mutate: {
    required: ['--config', '--test-dir', '--base', '--written', '--grep', '--mutated'],
    accepted: ['--clips'],
  },
};
const FLAG_VALUES = {
  '--config': opts.config,
  '--test-dir': opts.testDir,
  '--base': opts.base,
  '--project-config': opts.projectConfig,
  '--verdict': opts.verdict,
  '--har': opts.har,
  '--origin': opts.origin,
  '--bindings': opts.bindings,
  '--grep': opts.grep,
  '--written': opts.written.length ? opts.written : null,
  '--mutated': opts.mutated.length ? opts.mutated : null,
  '--clips': opts.clips,
};
const takes = (v, flag) => VERB_SPEC[v].required.includes(flag) || VERB_SPEC[v].accepted.includes(flag);
for (const flag of VERB_SPEC[verb].required) {
  if (!FLAG_VALUES[flag]) usage(`${flag} is required for '${verb}'`);
}
for (const flag of Object.keys(FLAG_VALUES)) {
  if (takes(verb, flag) || !FLAG_VALUES[flag]) continue;
  const owners = Object.keys(VERB_SPEC).filter((v) => takes(v, flag));
  usage(`${flag} belongs to '${owners.join("'/'")}', not to '${verb}'`);
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

// The filming run's own clip count, from its summary's `clips.length`. The spec SET is the floor
// this verb can compute alone — one clip per spec — but a spec holding three scenarios filmed three
// clips, and a floor of one would let two of them go missing unnoticed. So the real count is read
// from the run that produced it rather than re-derived here, and the flag is optional because a
// mutation check run without the filming summary to hand still gets the floor.
const expectedClips = (() => {
  if (opts.clips === null) return null;
  if (!/^\d+$/.test(opts.clips)) {
    usage(`--clips '${opts.clips}' is not a count — it is the film summary's \`clips.length\``);
  }
  return Number(opts.clips);
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
// A recording that was NAMED and is not there is a wrong flag, not a project without a recording:
// silently skipping the bind phase over it is how a run reaches the tests with every read aborting.
if (opts.har && !fs.existsSync(opts.har)) {
  stop(EXIT.INPUT, `--har '${opts.har}' is not on disk — omit the flag when there is no recording`);
}
if (opts.bindings && !fs.existsSync(opts.bindings)) {
  stop(EXIT.INPUT, `--bindings '${opts.bindings}' is not on disk`);
}
for (const file of opts.mutated) {
  if (!fs.existsSync(file)) {
    stop(EXIT.INPUT, `--mutated '${file}' is not on disk — it is the file you just mutated`);
  }
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
const MUTATION_OUT = mutationOut(repoTop);

// Only where state is actually kept. `mutate` reads and writes none, and a verb that leaves an
// empty directory behind is a side effect nobody asked for.
if (verb !== 'mutate') {
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
// Dropped before anything else this invocation does: from here until the classification phase
// writes a new one, there is no network finding, and every path that stops in between leaves none.
if (verb === 'audit') fs.rmSync(path.join(STATE_DIR, 'audit-network.json'), { force: true });
}

// THREE RECORDS UNDER THE RUN'S DOT-DIRECTORY, ONE OWNER EACH. They are separate files rather than
// one, because they answer to different lifetimes and a single blob would make every write a
// read-modify-write across two verbs:
//
//   audit-state.json    the heal budget — attempts, the last failure signature, the stalled flag.
//                       Written by `audit` alone, cleared by a green run.
//   audit-network.json  what the audit run put on the wire, for `film` to be refused by. Written by
//                       `audit`'s classification phase and by nothing else; DELETED at the top of
//                       every `audit` invocation, so the record exists only where the last audit
//                       actually classified a green run. An audit that went red, failed its type
//                       check or found no traces therefore leaves NO record — a run that never asked
//                       the question must not leave a clean bill of health behind.
//   film-state.json     the re-film count. Incremented by `film` after a run that produced clips,
//                       and reset by a green `audit` — a green audit is what licenses filming, so it
//                       is where a filming cycle begins. Without that reset the count would outlive
//                       its proof and the next proof's very first clip would publish with a warning.
const statePath = path.join(STATE_DIR, 'audit-state.json');
const networkPath = path.join(STATE_DIR, 'audit-network.json');
const filmStatePath = path.join(STATE_DIR, 'film-state.json');
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

// The spec set's text, as one hash. It is what tells `film` whether the audit's live list still
// describes the specs in front of it — see `networkCheck` for what that answer is used for. The
// paths go in beside their contents, so a spec added or dropped since the audit moves it too.
function specDigest(specPaths) {
  const h = crypto.createHash('sha1');
  for (const spec of [...specPaths].sort()) {
    let src;
    try {
      src = fs.readFileSync(spec, 'utf8');
    } catch {
      src = '\u0000absent';
    }
    h.update(spec).update('\u0000').update(src).update('\u0000');
  }
  return h.digest('hex');
}

// Only the LIVE CALLS are persisted, never the undeclared list the audit computed from them. A live
// call is a fact about a RUN and cannot be re-derived without paying for another one; the carve-out
// lines are a fact about the SPEC TEXT, which `film` can simply re-read. Persisting the derived list
// instead would freeze the spec half at audit time, and the refusal would then outlive the very edit
// that answered it — which is no better than having no refusal at all.
function writeNetwork(specPaths, live) {
  fs.writeFileSync(
    networkPath,
    `${JSON.stringify(
      { schema: NETWORK_SCHEMA, verb: 'audit', specs: specPaths, spec_digest: specDigest(specPaths), live },
      null,
      2,
    )}\n`,
  );
}
function readNetwork() {
  try {
    const parsed = JSON.parse(fs.readFileSync(networkPath, 'utf8'));
    if (parsed?.schema !== NETWORK_SCHEMA) return null;
    return {
      live: Array.isArray(parsed.live) ? parsed.live : [],
      spec_digest: parsed.spec_digest ?? null,
    };
  } catch {
    return null;
  }
}

function readFilms() {
  try {
    const parsed = JSON.parse(fs.readFileSync(filmStatePath, 'utf8'));
    return parsed?.schema === FILM_SCHEMA ? Number(parsed.films) || 0 : 0;
  } catch {
    return 0;
  }
}
function writeFilms(films) {
  fs.writeFileSync(filmStatePath, `${JSON.stringify({ schema: FILM_SCHEMA, verb: 'film', films }, null, 2)}\n`);
}

// ---- the summary ----------------------------------------------------------------------------
// ONE JSON line on stdout, so the agent reads a machine-readable account instead of re-deriving one
// from the runner's console output.
// Bound once the spec set is known, so the invariant half of the record is spelled in exactly one
// place and only the varying half travels to a call site.
// The core is the same for every verb — schema, verb, spec set, result, exit — and each verb adds
// the fields only it has. Two records that agree on the core can be read by one reader.
// The two preconditions report themselves whatever they did — ok, skipped, or the refusal and its
// reason — so "was the bind done?" is read out of one line rather than inferred from its absence.
const phases = {
  typecheck: { status: PHASE.NOT_REACHED, tsconfig: null },
  har_bind: { status: PHASE.NOT_REACHED, har: null, out: null, reason: null, argv: null },
  // The classification, the mechanical half of the carve-out check, and the round-trip class the
  // trace cannot see. `not-reached` until a green run, which is the only run it is asked about.
  hermetic: {
    status: PHASE.NOT_REACHED,
    traces: null,
    live: [],
    mocked: [],
    failed: [],
    carve_outs: [],
    undeclared: [],
    in_spec_round_trips: [],
    reason: null,
  },
};
let summarize = () => {};
// The fields every record from THIS verb carries whatever happened — spelled once, so a stop that
// exits early cannot report a smaller record than a stop that exits late.
const VERB_FIELDS = {
  audit: {},
  film: { viewport, verdict: opts.verdict },
  mutate: { grep: opts.grep, mutated: opts.mutated, output: MUTATION_OUT },
}[verb];
function bindSummary(specs) {
  summarize = (result, exit, extra = {}) => {
    out(
      `PWPROVE_SUMMARY ${JSON.stringify({
        schema: SUMMARY_SCHEMA,
        verb,
        specs,
        result,
        exit,
        ...VERB_FIELDS,
        ...extra,
      })}\n`,
    );
  };
}
const auditSummary = (result, exit, signature, attempt) =>
  summarize(result, exit, { phases, grep: opts.grep, attempt, attempt_bound: ATTEMPT_BOUND, signature });

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
  if (verb === 'audit') auditSummary('empty', EXIT.EMPTY_SET, null, 0);
  else summarize('empty', EXIT.EMPTY_SET);
  stop(
    EXIT.EMPTY_SET,
    `no spec resolved from '${opts.testDir}' against --base '${opts.base}'. PR-mode reaches ` +
      'Step 7 with at least the spec this run wrote, so this is a wrong base ref or a test ' +
      'directory that is not where the specs landed. Fix the resolution; never run an empty set.',
  );
}

// ---- the run, shared by all three verbs ---------------------------------------------------------
// The results directory is cleared BEFORE the runner starts, without anyone remembering to:
// whatever stands in test-results/ at publish time becomes the evidence, so a leftover webm from an
// earlier — or mutated — run published as proof is a lie. The runner's shape is fixed here rather
// than passed, so there is exactly one invocation to read and to assert.
//
// `mutate` is the ONE exception, and that exception is the point of the mutation verb: there the
// contents of test-results/ are the delivered evidence rather than stale litter, so the run is sent
// to an isolated `output`, records nothing, and leaves the directory exactly as it stood. Its three
// options travel together as MUTATION_RUN, below, because they are one decision and not three.
const MUTATION_RUN = { clear: false, reporter: 'line', output: MUTATION_OUT };
function runSpecSet(specs, extraEnv = {}, { clear = true, reporter = 'html', output = null } = {}) {
  if (clear) fs.rmSync(RESULTS_DIR, { recursive: true, force: true });
  const runnerArgs = [
    '--no-install',
    'playwright',
    'test',
    ...specs.map((s) => s.path),
    `--project=${opts.project}`,
    '--config',
    opts.config,
    `--reporter=${reporter}`,
    ...(output ? [`--output=${output}`] : []),
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

// ---- the carve-out presence test, shared by both verbs that ask about it ----------------------
// `audit` computes the undeclared list from the run it just made; `film` recomputes it from the
// live calls that run recorded against the spec text as it stands NOW. One implementation, because
// two readings of the same declaration are two readings that drift.
// A path a carve-out line can name: a bare path, or the path half of a full URL.
const PATH_TOKEN_RE = /(?:https?:\/\/\S+?)?(\/[^\s,;)"'`]*)/g;

// Every spec in the SET, not only the one this run wrote: a carried spec's carve-out declares the
// call it was written for, and re-declaring it in this run's spec is not something the body asks of
// anyone.
function carveOutsIn(specPaths) {
  const found = [];
  for (const spec of specPaths) {
    let src;
    try {
      src = fs.readFileSync(spec, 'utf8');
    } catch {
      continue;
    }
    src.split('\n').forEach((line, i) => {
      const m = line.match(/CARVE-OUT:\s*(.+)$/);
      if (m) found.push({ spec, line: i + 1, text: m[1].trim() });
    });
  }
  return found;
}

// A carve-out names a resource, so it declares the path it names and the paths under it: a
// `:param` segment stands for one segment and a `*` for any run of characters. Deliberately
// generous where it is unsure — a false "declared" leaves the agent the judgement it already owns,
// while a false "undeclared" would send it to declare something already declared.
function pathMatches(token, pathname) {
  const pattern = token
    .replace(/[.+^${}()|[\]\\?]/g, '\\$&')
    .replace(/\*+/g, '\\S*')
    .replace(/:[A-Za-z_]\w*/g, '[^/]+')
    .replace(/\/$/, '');
  return new RegExp(`^${pattern}(?:/|$)`).test(pathname);
}

function declaredBy(carveOuts, call) {
  // `METHOD URL`, the shape the classifier renders. Split defensively rather than on an index that
  // is -1 when it is not: that silently yields an empty method and a URL missing its first
  // character, and both would then be compared against every carve-out line as if they were real.
  const sep = call.indexOf(' ');
  const method = sep === -1 ? '' : call.slice(0, sep);
  const url = sep === -1 ? call : call.slice(sep + 1);
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    /* a URL the classifier could not parse either — compare it whole */
  }
  return carveOuts.some((c) => {
    // A line naming no method declares the path for every method; one naming a method declares
    // only that method, so a `POST` carve-out never covers a live `GET`.
    const methods = c.text.match(DECLARATION_HEAD)[1].match(METHOD_RE);
    if (method && methods && !methods.includes(method)) return false;
    if (c.text.includes(url)) return true;
    return [...c.text.matchAll(PATH_TOKEN_RE)]
      .map((m) => m[1])
      .filter((t) => t !== '/')
      .some((t) => pathMatches(t, pathname));
  });
}


/**
 * Whether the audit's network finding still refuses this filming run.
 *
 * The record carries the live calls the audit run made; the carve-out lines come from the spec text
 * as it stands right now. So declaring the carve-out clears the refusal on the next invocation with
 * no second audit run — the only input that moved is one this verb re-reads.
 *
 * MOCKING the call is the other fix the body offers, and it is invisible here: a route handler is
 * not a carve-out line, and no reading of the spec can establish what the browser would put on the
 * wire. That is what `specs_moved` is for. When the spec text has moved and calls are STILL
 * undeclared, this verb refuses under the same code but says the finding predates the edit, rather
 * than either asserting a finding it can no longer stand behind or waving through a filming run
 * nothing has cleared. One green audit — the cheap re-run this whole refusal exists to sell —
 * settles it either way.
 */
function networkCheck(specPaths) {
  const record = readNetwork();
  if (!record) {
    return { status: PHASE.NOT_REACHED, live: [], undeclared: [], specs_moved: false, reason: null };
  }
  const undeclared = record.live.filter((call) => !declaredBy(carveOutsIn(specPaths), call));
  const specsMoved = specDigest(specPaths) !== record.spec_digest;
  if (undeclared.length === 0) {
    return { status: PHASE.OK, live: record.live, undeclared, specs_moved: specsMoved, reason: null };
  }
  return {
    status: PHASE.REFUSED,
    live: record.live,
    undeclared,
    specs_moved: specsMoved,
    reason: specsMoved ? 'stale' : 'undeclared',
  };
}

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
 * The filming run's closing phase: measure every clip, extract one frame from each, and say which
 * ones were actually inspected.
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
function inspectClips(clips) {
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
    const beside = frameFor(clip.path);
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
  // 1. THE NETWORK REFUSAL, first because it is the cheapest thing this verb can do: it spends no
  //    subprocess, no run and no clip, and an undeclared live call is a spec edit waiting to
  //    happen — one that invalidates footage the moment it lands.
  const network = networkCheck(specs.map((s) => s.path));
  if (network.reason) {
    summarize('refused', EXIT.UNDECLARED, { network });
    err(
      `proof-run film: ${network.undeclared.length} UNDECLARED live call(s) from the audit run:\n` +
        network.undeclared.map((c) => `  ${c}\n`).join(''),
    );
    stop(
      EXIT.UNDECLARED,
      network.reason === 'undeclared'
        ? 'NOTHING was filmed and test-results/ is untouched. An undeclared live call is a spec ' +
            'edit waiting to happen, and a spec edit invalidates footage: fix it now and it costs ' +
            'one cheap re-run, fix it after filming and it costs the clips as well. Mock each call ' +
            'above, or declare it as a `// CARVE-OUT:` line when the real round-trip IS the AC — ' +
            'a declaration clears this refusal with no second audit. Whether a carve-out that IS ' +
            'present earns its place is still yours to judge.'
        : 'NOTHING was filmed and test-results/ is untouched. The spec set has MOVED since the ' +
            'audit that recorded these calls, so that record no longer describes it — this ' +
            'refusal predates your edit rather than answering it. If you mocked the calls, run ' +
            'the audit verb again: only a run can say what the browser now puts on the wire.',
    );
  }

  // 2. THE PRECONDITION. The Step-6 gate, run again over the spec set that is about to be filmed,
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
    summarize('refused', EXIT.FIDELITY, { network, fidelity_exit: pre.status });
    stop(
      EXIT.FIDELITY,
      `the clip-fidelity audit refused the spec set (its exit ${pre.status}, named above) — NOTHING ` +
        'was filmed and test-results/ is untouched. Filming a spec that carries no reader for ' +
        'PW_PROVE_CLIP records footage that shows nothing while every gate stays green. Fix the ' +
        'COMMITTED spec, then run this verb again.',
    );
  }

  // 3. THE RUN. The clip flag and the effective viewport arrive as ENVIRONMENT, because they are the
  //    run's only per-run values and the proof config is static and committed. The size is the one
  //    the verdict declared — never a literal.
  const run = runSpecSet(specs, {
    PW_PROVE_CLIP: '1',
    PW_PROVE_W: String(viewport.width),
    PW_PROVE_H: String(viewport.height),
  });
  if (run.status !== 0) {
    const signature = signatureOf(`${run.stdout ?? ''}\n${run.stderr ?? ''}`);
    summarize('red', EXIT.TESTS_RED, { clips: [], network, signature });
    stop(
      EXIT.TESTS_RED,
      `the filming run went red — ${signature.error_class} at ${signature.locator}. A spec that was ` +
        'green in the audit run and red under PW_PROVE_CLIP is a filming-law violation: the ' +
        'variable may only ADD time. Fix it, re-run the audit verb, then film again.',
    );
  }

  // 4. THE CLOSING PHASE. Never a gate: every outcome below leaves the run passing, and a clip that
  //    could not be inspected is reported uninspected rather than as good.
  const clips = collectClips(RESULTS_DIR);

  // 5. THE RE-FILM COUNT. Counted here, at the end, because only a run that produced clips spent
  //    the re-film: a refusal and a red run film nothing and must not consume it. The body allows
  //    exactly ONE re-film and a second illegible frame PUBLISHES ANYWAY with a warning, so this
  //    can never be a refusal — it is a fact carried forward, and carrying it is the point. Today
  //    the warning depends on an agent recalling, across a diagnosis and a re-run, which attempt
  //    this was; a number in the run's state does not forget.
  const films = readFilms() + 1;
  writeFilms(films);
  const publishWithWarning = films > 1;
  if (publishWithWarning) {
    err(
      `proof-run film: this is filming run ${films}. The body allows exactly ONE re-film, so a ` +
        'clip still illegible after this one is published with warning rather than re-filmed — ' +
        'carry `illegible (<diagnosis>), published with warning` into the completion report and ' +
        'the PR comment. A bad clip is not a failed test.\n',
    );
  }
  summarize('green', EXIT.OK, {
    clips: inspectClips(clips),
    network,
    films,
    publish_with_warning: publishWithWarning,
  });
  process.exit(EXIT.OK);
}

// ================================================================================== mutate
if (verb === 'mutate') {
  // Repo-relative, because every git call below is anchored at the top level: a residue check that
  // only looked under the cwd would miss a mutation that reached a sibling directory.
  const mutatedRepoRel = opts.mutated.map((f) => path.relative(repoTop, path.resolve(cwd, f)));

  // 1. THE PRE-STATE, captured before anything runs. Both halves are checked first because both
  //    are cheap and both make a green run meaningless: a file git does not track cannot be
  //    reverted at all, and a file carrying no unstaged change was never mutated (or was staged,
  //    which `git checkout --` would not undo either). Paying for a run to learn that is the one
  //    thing this verb is expensive enough to avoid.
  for (const rel of mutatedRepoRel) {
    if (git('-C', repoTop, 'ls-files', '--error-unmatch', '--', rel).status !== 0) {
      summarize('input', EXIT.INPUT);
      stop(
        EXIT.INPUT,
        `--mutated '${rel}' is not tracked by git, so the revert could not restore it. Mutate a ` +
          'committed source file — an untracked one has no pre-state to come back to.',
      );
    }
    if (git('-C', repoTop, 'diff', '--quiet', '--', rel).status === 0) {
      summarize('input', EXIT.INPUT);
      stop(
        EXIT.INPUT,
        `--mutated '${rel}' carries no unstaged change — nothing was mutated in it. This verb is ` +
          'invoked AFTER the mutation is applied and BEFORE it is staged; a run over an unmutated ' +
          'tree goes green by construction and proves nothing.',
      );
    }
  }

  const statusPathOf = (line) => {
    const p = line.slice(3).replace(/^"|"$/g, '');
    const arrow = p.indexOf(' -> ');
    return arrow === -1 ? p : p.slice(arrow + 4);
  };
  const porcelain = () => {
    const r = git('-C', repoTop, '-c', 'core.quotepath=false', 'status', '--porcelain');
    if (r.status !== 0) stop(EXIT.INPUT, `git status failed: ${r.stderr.trim()}`);
    return r.stdout.split('\n').filter(Boolean);
  };
  const worktreeDiff = (excluding = []) => {
    const r = git('-C', repoTop, 'diff', '--', '.', ...excluding.map((f) => `:(exclude)${f}`));
    if (r.status !== 0) stop(EXIT.INPUT, `git diff failed: ${r.stderr.trim()}`);
    return r.stdout;
  };
  // The pre-state is the tree MINUS the mutated files' own changes — which is exactly what the tree
  // must look like once they are reverted. Comparing against that catches a revert that did not
  // take, a mutation that reached a file the agent did not declare, and anything the run itself
  // left lying around, all with one comparison.
  const mutatedSet = new Set(mutatedRepoRel);
  const statusPre = porcelain().filter((l) => !mutatedSet.has(statusPathOf(l)));
  const diffPre = worktreeDiff(mutatedRepoRel);

  // The clips as they stand: path, size and mtime, so an overwrite is caught as surely as a delete.
  const fingerprint = (clip) => {
    const st = fs.statSync(clip);
    return `${clip}\u0000${st.size}\u0000${st.mtimeMs}`;
  };
  const clipsPre = collectClips(RESULTS_DIR).map(fingerprint);

  // 2. THE RUN. Scoped to the scenarios THIS run wrote and to the one test that should guard them,
  //    into the isolated output. No PW_PROVE_CLIP: a mutation run records nothing.
  fs.rmSync(MUTATION_OUT, { recursive: true, force: true });
  const run = runSpecSet(
    specs.filter((s) => s.tag === 'written'),
    {},
    MUTATION_RUN,
  );

  // 3. THE REVERT — unconditional and immediate, before the verdict is read at all, so no branch
  //    below can leave a deliberately broken tree behind.
  const revert = git('-C', repoTop, 'checkout', '--', ...mutatedRepoRel);
  const reverted = revert.status === 0;
  if (!reverted) err(`proof-run mutate: git checkout failed: ${revert.stderr.trim()}\n`);

  // 4. THE TREE, compared against the pre-state. A hard stop: a proof never continues on a
  //    polluted working tree, whatever the run just said.
  const statusPost = porcelain();
  const diffPost = worktreeDiff();
  const statusResidue = statusPost.filter((l) => !statusPre.includes(l));
  const residue = !reverted || diffPost !== diffPre || statusResidue.length > 0;

  // 5. THE CLIPS. Every one that stood before must still stand, unmoved; and the set must cover the
  //    PR spec set, carried scenarios included, because that set is what the filming run filmed.
  const clipsPost = new Set(collectClips(RESULTS_DIR).map(fingerprint));
  const survived = clipsPre.filter((c) => clipsPost.has(c)).length;
  const clips = {
    before: clipsPre.length,
    after: clipsPost.size,
    survived,
    expected_at_least: Math.max(specs.length, expectedClips ?? 0),
  };
  const clipsClobbered = survived !== clipsPre.length || survived < clips.expected_at_least;

  // A nonzero runner exit is only a RED TEST if a test actually ran. This is the one verb where
  // nonzero means success, so a grep that matched nothing — or a runner that refused its own
  // arguments — would otherwise be published as "the spec guards the change" on a run that executed
  // no assertion at all. That case names itself in the runner's output, so it is caught rather than
  // counted, and the signature of a genuine red travels in the summary so the agent can confirm the
  // failure is the assertion its mutation targeted and not the application falling over.
  const runnerOut = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
  if (run.status !== 0 && /no tests (?:found|match)/i.test(runnerOut)) {
    summarize('input', EXIT.INPUT);
    stop(
      EXIT.INPUT,
      `the runner matched NO test against --grep '${opts.grep}' — nothing was executed, so there ` +
        'is no verdict. A run that executes no assertion is not a red run. Name the guarding test ' +
        'exactly as its `test(...)` title reads in the spec you passed as --written.',
    );
  }
  const mutationRun = run.status === 0 ? 'green' : 'red';
  const signature = mutationRun === 'red' ? signatureOf(runnerOut) : null;
  const record = (result, exit) =>
    summarize(result, exit, { mutation_run: mutationRun, signature, reverted, residue, clips });

  if (residue) {
    record('residue', EXIT.RESIDUE);
    stop(
      EXIT.RESIDUE,
      `the working tree did not come back to its pre-state after the revert${
        reverted ? '' : ' (git checkout itself failed)'
      }. HARD STOP — never continue a proof on a polluted tree. Residue:\n` +
        `${statusResidue.join('\n') || '(the tracked diff moved; run `git diff` to see it)'}`,
    );
  }
  if (clipsClobbered) {
    record('clips-clobbered', EXIT.CLIPS);
    stop(
      EXIT.CLIPS,
      `${survived}/${clipsPre.length} clip(s) survived the mutation run and the spec set holds ` +
        `${specs.length}. The delivered evidence no longer shows the passing run — do NOT publish ` +
        'it. Delete test-results/ and re-run the audit and filming verbs before Step 8.',
    );
  }
  if (mutationRun === 'green') {
    record('unguarded', EXIT.MUTATION_GREEN);
    stop(
      EXIT.MUTATION_GREEN,
      'the mutation run went GREEN — the spec does not guard the change. This is a finding about ' +
        'the spec, NOT a failed run. Strengthen the terminal assertion and mutate once more; if it ' +
        'goes green again because another layer independently preserves the outcome, report it as ' +
        'unguardable at this layer and name the masking layer. Never a third cycle.',
    );
  }
  record('guards', EXIT.OK);
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
  phases.typecheck = { status: PHASE.SKIPPED, tsconfig: null };
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
    phases.typecheck = { status: PHASE.FAILED, tsconfig };
    auditSummary('typecheck-failed', EXIT.TYPECHECK, null, state.attempts);
    stop(
      EXIT.TYPECHECK,
      `the spec set does not compile against '${tsconfig}' — no run was made. Fix the type ` +
        'errors above and invoke this verb again; a type-only fix is gated by tsc, so batch it ' +
        'into the next behavioural rerun rather than paying a browser run for it.',
    );
  }
  phases.typecheck = { status: PHASE.OK, tsconfig };
}

// ---- phase 2: the HAR bind, delegated to the scrubber -------------------------------------------
// The destination is fixed under the run's own dot-directory, not a flag: it holds this run's live
// credential, and the one already-excluded directory is the only place it belongs.
let boundHar = null;
if (!opts.har) {
  phases.har_bind = { status: PHASE.SKIPPED, har: null, out: null, reason: null, argv: null };
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
  // The argv the module BUILT travels in the summary. The scrubber is a sibling module invoked by
  // absolute path, so it cannot be observed by putting a recording shim on PATH the way the runner
  // is — and the argv is the contract here just as much as it is there: both defects this module
  // exists to prevent were wrong arguments. Carrying it is also what makes the two documented
  // branches — a dropped `--origin` when the project owns rebinding, and a `--bindings` file —
  // readable after the fact instead of inferred from what landed on disk.
  const bindReport = bindArgv.slice(1);
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
      status: refused ? PHASE.REFUSED : PHASE.FAILED,
      har: opts.har,
      out: outPath,
      reason,
      argv: bindReport,
    };
    const code = refused ? EXIT.HAR_BIND : EXIT.INPUT;
    auditSummary('har-bind-refused', code, null, state.attempts);
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
  phases.har_bind = { status: PHASE.OK, har: opts.har, out: outPath, reason: null, argv: bindReport };
}


const run = runSpecSet(specs, boundHar ? { PW_PROVE_HAR: boundHar } : {});
const runnerOutput = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;

// ---- the network classification, delegated to the hermetic module ------------------------------
// It renders no verdict and this verb does not add one: it computes PRESENCE — a live call whose
// path appears in no `// CARVE-OUT:` line anywhere in the spec set — and leaves legitimacy alone.
// Its report is human-readable by design, so it is read as text here rather than re-implemented.
const ENTRY_RE = /^ {2}(\S+ \S+)\s+×(\d+)(?:\s+\[([^\]]*)\])?\s+\((\d+) tests?\)/;
const SITE_RE = /^ {2}(.+):(\d+) {2}(.*)$/;
function parseClassification(text) {
  const buckets = { live: [], mocked: [], failed: [] };
  let bucket = null;
  for (const line of text.split('\n')) {
    if (/^LIVE\b/.test(line)) bucket = buckets.live;
    else if (/^MOCKED\b/.test(line)) bucket = buckets.mocked;
    else if (/^FAILED\b/.test(line)) bucket = buckets.failed;
    else if (/^\S/.test(line)) bucket = null;
    else if (bucket) {
      const m = line.match(ENTRY_RE);
      if (m) {
        bucket.push({
          call: m[1],
          count: Number(m[2]),
          statuses: m[3] ? m[3].split(',') : [],
          tests: Number(m[4]),
        });
      }
    }
  }
  return buckets;
}

function parseRoundTrips(text, spec) {
  const sites = [];
  let inSection = false;
  for (const line of text.split('\n')) {
    if (/^IN-SPEC LIVE ROUND-TRIPS/.test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (/^\S/.test(line)) {
      inSection = false;
      continue;
    }
    const m = line.match(SITE_RE);
    if (m) sites.push({ spec, line: Number(m[2]), text: m[3] });
  }
  return sites;
}

function hermeticPhase(specPaths) {
  const script = fileURLToPath(new URL('./hermetic.mjs', import.meta.url));
  const roundTrips = [];
  let classification = null;
  let traces = null;
  for (const spec of specPaths) {
    const r = spawnSync(process.execPath, [script, RESULTS_DIR, '--spec', spec], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const first = classification === null && traces === null;
    // The classifier's whole account goes to stderr once — this verb's stdout stays the runner's
    // output plus one summary line. Once, because every invocation reports the same traces.
    if (first) err(`${r.stdout ?? ''}${r.stderr ?? ''}`);
    if (r.error) {
      return { status: PHASE.FAILED, reason: 'hermetic-not-run' };
    }
    if (r.status === HERMETIC.NO_TRACES) {
      return { status: PHASE.FAILED, reason: 'no-traces' };
    }
    if (r.status !== 0) {
      return { status: PHASE.FAILED, reason: 'hermetic-input' };
    }
    const text = r.stdout ?? '';
    if (first) {
      classification = parseClassification(text);
      traces = Number(text.match(/^--- hermetic audit --- (\d+) trace/m)?.[1] ?? 0);
    }
    roundTrips.push(...parseRoundTrips(text, spec));
  }
  const carveOuts = carveOutsIn(specPaths);
  const undeclared = classification.live.map((e) => e.call).filter((c) => !declaredBy(carveOuts, c));
  return {
    status: PHASE.OK,
    traces,
    ...classification,
    carve_outs: carveOuts,
    undeclared,
    in_spec_round_trips: roundTrips,
    reason: null,
  };
}

if (run.status === 0) {
  // The classification is asked only of a green run: it is the run the body licenses filming from,
  // and a red run's traces describe a spec still being healed.
  phases.hermetic = { ...phases.hermetic, ...hermeticPhase(specs.map((s) => s.path)) };
  if (phases.hermetic.reason === 'no-traces') {
    err(
      'proof-run audit: the run recorded no traces, so nothing was classified. The proof config ' +
        "must set `trace: 'on'` — the committed one does. Re-run the audit run through it.\n",
    );
  }
  if (phases.hermetic.undeclared.length) {
    err(
      `proof-run audit: ${phases.hermetic.undeclared.length} UNDECLARED live call(s) — no ` +
        `\`// CARVE-OUT:\` line in the spec set names them:\n` +
        phases.hermetic.undeclared.map((c) => `  ${c}\n`).join('') +
        'Mock each one, or declare it as a carve-out when the real round-trip IS the AC, and ' +
        're-run this verb. Judging whether a carve-out that IS present earns its place is still ' +
        'yours; presence is not.\n',
    );
  }
  // The finding `film` is refused by. Written by the classification phase and by nothing else, and
  // only when it actually classified something: a phase that failed has no live list to hand on.
  if (phases.hermetic.status === PHASE.OK) {
    writeNetwork(
      specs.map((s) => s.path),
      phases.hermetic.live.map((e) => e.call),
    );
  }
  // A green run ends the heal loop, so the budget it was spending goes with it — and it opens the
  // filming cycle the re-film count counts within, so that count goes with it too.
  writeState({ attempts: 0, signature: null, stalled: false });
  fs.rmSync(filmStatePath, { force: true });
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
