#!/usr/bin/env node
// Gate: did the SKILL.md UNDER TEST actually reach the model, and was the run clean?
//
// In the only recorded run (2026-08-13) the skill reached the model in 4 of 12 cases: the Skill
// tool was called 3 times, the body arrived by some route 6 times, and 4 cases never touched the
// skill at all — one of which was graded a PASS. A case that never loaded the skill is not
// measuring the skill, so its verdict, either way, means nothing. This gate makes that visible per
// case instead of leaving it to whoever reads the transcripts afterwards.
//
// A `tool_called` rule on the Skill tool cannot do this job: it sees the explicit invocation only,
// and would have scored 3/12 where the truth was 6/12. The serialized transcript carries every
// route — the tool call, the injected body, and tool-result content — so one scan over it sees
// them all.
//
// Input: $EVAL_TRANSCRIPT_PATH, which skill-up hands a `script` judge under `environment.type:
// none`. A path argument does the same job when triaging one transcript by hand, matching the
// argv convention of the other judge in this directory.
// $PWPROVE_SKILL_MD names the body under test; without it the gate searches for pw-prove's
// SKILL.md (see findSkillMd below) and refuses rather than guessing if it finds none.
//
// Exit codes are four-valued on purpose — "the case was contaminated", "the case never loaded
// the skill" and "the baseline arm read the body anyway" call for different repairs:
//   0  LOADED and clean  (or, under $PWPROVE_EXPECT_SKILL_FREE, SKILL-FREE and clean)
//   1  NOT LOADED — the version under test never reached the model
//   2  CONTAMINATED — the run reached a marketplace plugin copy, so isolation did not hold
//   3  BASELINE DIRTY — a `without_skill` arm carried the body under test
//
// Non-invocation stays a FAIL. The gate exists to make the failure diagnosable, not to excuse it.
//
// $PWPROVE_EXPECT_SKILL_FREE=1 (or `--baseline` in argv) INVERTS the load question, for the
// `without_skill` arm of an uplift run. There the body reaching the model is the defect, because an
// uplift measured against a baseline that read the skill is not an uplift (issue #75): in the
// 2026-08-14 run three of ten baseline arms found another checkout of this repository on the host
// and `cat`-ed SKILL.md out of it. A Skill tool call is still expected in that arm — it errors with
// `Unknown skill: pw-prove`, and an errored call carries no body — so the tool call alone is not the
// finding. A fingerprint line is.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// In band, skill-up copies the judge to a temp directory before running it, so this file's own
// location says nothing about where the skill lives — `../../SKILL.md` resolved to `/SKILL.md` on
// the first real run. So: walk up from the judge AND from the working directory, and accept only a
// SKILL.md whose frontmatter actually names pw-prove. $PWPROVE_SKILL_MD skips the search.
const SEARCHED = [];
function findSkillMd(fromTranscript) {
  if (process.env.PWPROVE_SKILL_MD) return process.env.PWPROVE_SKILL_MD;
  const searched = [];
  // The transcript is the most reliable root of the three: in band the judge is copied to
  // /tmp/skill-up-judge-*/ and run from there, so neither this file nor the working directory is
  // anywhere near the skill, while the retained transcript sits inside the run's output tree.
  for (const start of [fromTranscript, HERE, process.cwd()].filter(Boolean)) {
    let dir = resolve(start);
    for (;;) {
      // `.claude/skills/pw-prove/SKILL.md` first: in band the working directory IS the case
      // workspace, and that copy is literally the version skill-up installed for this case.
      for (const rel of ['.claude/skills/pw-prove/SKILL.md', 'skills/pw-prove/SKILL.md', 'SKILL.md']) {
        const candidate = resolve(dir, rel);
        if (searched.includes(candidate)) continue;
        searched.push(candidate);
        if (!existsSync(candidate)) continue;
        if (/^---\n[\s\S]*?^name:\s*pw-prove\s*$/m.test(readFileSync(candidate, 'utf8'))) return candidate;
      }
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  SEARCHED.push(...searched);
  return '';
}

const rawArgv = process.argv.slice(2);
const argv = rawArgv.filter((a) => a !== '--baseline');
const BASELINE =
  /^(1|true|yes)$/i.test(process.env.PWPROVE_EXPECT_SKILL_FREE ?? '') ||
  rawArgv.length !== argv.length;

const transcriptPath = process.env.EVAL_TRANSCRIPT_PATH || argv[0] || '';

// An absent transcript is never a pass. skill-up only WARNS when it has none to hand over
// ("ScriptJudge.TranscriptPath is empty; EVAL_TRANSCRIPT_PATH will be unset"), so a judge that
// shrugged here would report a vacuous pass on every case in that run.
if (!transcriptPath) {
  console.error('FAIL: no $EVAL_TRANSCRIPT_PATH and no path argument — nothing to judge');
  process.exit(1);
}
if (!existsSync(transcriptPath)) {
  console.error(`FAIL: transcript does not exist: ${transcriptPath}`);
  process.exit(1);
}
const skillMdPath = findSkillMd(dirname(resolve(transcriptPath)));
if (!skillMdPath || !existsSync(skillMdPath)) {
  console.error(`FAIL: no SKILL.md to fingerprint${skillMdPath ? ` at ${skillMdPath}` : ''}`);
  console.error(`   transcript: ${transcriptPath}`);
  console.error('   set $PWPROVE_SKILL_MD; searched, from the transcript, this judge, and the working directory:');
  for (const s of SEARCHED.slice(0, 6)) console.error(`   ${s}`);
  process.exit(1);
}

// --- what the body under test looks like ----------------------------------------------------------
// Fingerprints are long, distinctive lines of the body. Long, because a short line ("## Step 2")
// appears in prose that never came from the skill; from the body under test, because that is the
// whole question — a line the stale plugin copy also carries is a line that proves nothing about
// which copy was loaded, and the plugin-path check below covers that half anyway.
function fingerprints(md) {
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, '');
  const seen = new Set();
  const out = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (line.length < 40) continue;
    if (line.startsWith('#')) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

const marks = fingerprints(readFileSync(skillMdPath, 'utf8'));
if (marks.length === 0) {
  console.error(`FAIL: ${skillMdPath} yielded no fingerprint lines — the gate would pass everything`);
  process.exit(1);
}

// --- read the transcript --------------------------------------------------------------------------
// Strings are collected in two buckets. `prose` is what the assistant itself wrote (text and
// thinking blocks); everything else — system records, skill injections, tool arguments, tool
// results — is `structural`. The split matters for one specific verdict: an answer that NAMES the
// plugin cache path in order to reject it is a correct answer, not a contaminated run. Only a
// plugin path in the structural half means the run actually reached the plugin copy.
//
// The case PROMPT is structural, not prose, and that is the deliberate side of the trade: a skill
// injection also arrives as non-assistant content, so exempting everything the assistant did not
// write would blind the gate to the very route contamination takes. The cost is that a case prompt
// naming a plugin path would read as contaminated. No case prompt does; an injected plugin body is
// the thing we cannot afford to miss.
//
// For the FINGERPRINT question specifically there is a third bucket, `seeded` — see it below. A
// prompt that quotes a line of the body is not a plugin path: it is the case handing the model a
// mark, and counting it as contact is the over-count #71 found on `b32-dwell-inline`.
const prose = [];
const structural = [];

function collect(node, sink) {
  if (typeof node === 'string') { sink.push(node); return; }
  if (Array.isArray(node)) { for (const v of node) collect(v, sink); return; }
  if (node && typeof node === 'object') { for (const v of Object.values(node)) collect(v, sink); }
}

// Two transcript shapes reach this judge, and it reads both. In band skill-up hands over its own
// serialization — one JSON array of {role, content, turn}. The post-run sweep hands over the raw
// Claude Code session `.jsonl` the run retained, which is the richer of the two: it carries the
// tool calls and the injected body that skill-up's array flattens away. Anything the in-band shape
// cannot show, the sweep still sees.
const rawTranscript = readFileSync(transcriptPath, 'utf8');
let lines;
if (rawTranscript.trimStart().startsWith('[')) {
  try {
    lines = JSON.parse(rawTranscript).map((m) => JSON.stringify({ message: m }));
  } catch {
    console.error(`FAIL: ${transcriptPath} starts as a JSON array but does not parse`);
    process.exit(1);
  }
} else {
  lines = rawTranscript.split('\n');
}

// A REFUSED access is the boundary holding, not a breach. Claude Code answers a denied file read
// with one of these, naming the path it would not open — and the path is the only thing that
// crossed. Counting that as contamination would fail every run in which the deny rules did their
// job, which is the run this instrument is trying to produce.
const DENIAL = /has been denied|denied by your permission settings|Permission to use \w+ with/i;

// The discount applies only to a result that is WHOLLY a refusal. Matching the phrase anywhere in
// the result would hand the transcript a way to hide the body: one Bash call whose output carries
// both real body lines and the string "has been denied" would take the entire result out of the
// scan — down the exact route (Bash) the deny rules cannot close and this gate is the only cover
// for. So every substantial string in the result has to be the refusal; short scaffolding
// (`tool_result`, an id, `true`) does not count against it.
//
// A real tool_use_id is 30 characters (`toolu_01EngPMVf8ECsBeRkp4DaUD3`), so the length threshold
// alone does NOT hold it back — and #69's first baseline run is where that showed: a denied
// `ls -d ~/.claude/plugins/cache/*/*/*/` was read as contamination because its own id defeated the
// discount. Every fixture here was hand-authored with `t1`-shaped ids, which is exactly why no
// fixture could see it. Ids are named rather than measured now.
const TOOL_ID = /^toolu_[A-Za-z0-9_-]+$/;
function isWhollyDenial(strings) {
  const substantial = strings.filter((s) => s.trim().length > 24 && !TOOL_ID.test(s.trim()));
  if (substantial.length === 0) return false;
  // A refusal is one line. Anything with a second line is a result that merely MENTIONS a refusal.
  if (!substantial.every((s) => !s.includes('\n') && DENIAL.test(s))) return false;
  // And whatever else it is, a result carrying a line of the body under test is never discounted.
  return !strings.some((s) => marks.some((m) => s.includes(m)));
}

// And a `find` LISTING is not a read either. Under the deny rules an agent that cannot open a copy
// will still enumerate the disk, so the path lands in a tool result while not one line of the file
// does. What separates the two is the shape of the result: a listing is paths and nothing else.
// A file's contents are not. The moment the agent opens one of those paths, the tool argument that
// opened it is undenied and structural, and the run reads CONTAMINATED again.
function isPathListing(s) {
  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  let paths = 0;
  for (const l of lines) {
    if (/^[=~-]{2,}$/.test(l)) continue; // an `echo "==="` separator between two searches
    if (/\s/.test(l)) return false;
    if (l.includes('/')) paths++;
  }
  return paths > 0;
}

const toolUses = [];
// Tool arguments are held back until the result is known: a `cat <plugin path>` that was refused is
// an attempt, and its argument is not evidence that anything was read.
const attempted = new Map();
const denied = new Set();
// A THIRD bucket: the case's own prompt. Every turn of a case file is enqueued and then replayed as
// a plain user message, and a line the case HANDED the model is not evidence about what the model
// READ. `b32-dwell-inline`'s turn 1 quotes `if (process.env.PW_PROVE_CLIP) await
// page.waitForTimeout(2500);` verbatim to set the scene, which is a 58-character line of the body —
// so its baseline arm read BASELINE DIRTY on a transcript whose agent said "there is no `pw-prove`
// skill available" and never opened a file (#71). The over-count runs the other way too: the same
// line would have reported `skill-body` in an arm that loaded nothing.
//
// This is the provenance half of the wrong-unit family the rest of #71 is about: presence of a mark
// is not contact with the body, and where it came from decides which. The bucket is deliberately
// only user PROSE — a tool result and a skill injection both arrive as non-assistant content too,
// and exempting those would blind the gate to the route contamination actually takes.
const seeded = [];
let records = 0;
for (const line of lines) {
  if (!line.trim()) continue;
  let rec;
  try { rec = JSON.parse(line); } catch { structural.push(line); continue; }
  records++;

  const msg = rec?.message;
  const content = msg?.content;
  // The enqueued prompt, before it is replayed as a user message. Claude Code writes one
  // `queue-operation` record per turn of the case file.
  if (rec?.type === 'queue-operation' && typeof rec.content === 'string') seeded.push(rec.content);
  // …and its replay as a user message. Two guards keep an INJECTION out of this bucket, because an
  // injected body arrives as a user record too and exempting it would blind the gate outright:
  // `isMeta`, which is how Claude Code marks content the user did not type, and the injection
  // wrapper itself. A tool result is excluded by the same reasoning and is handled below.
  if (msg?.role === 'user' && rec?.isMeta !== true) {
    const texts = typeof content === 'string'
      ? [content]
      : Array.isArray(content) && !content.some((b) => b?.type === 'tool_result')
        ? content.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text)
        : [];
    for (const t of texts) if (!/<(?:skill|system-reminder|command-name|local-command)\b/i.test(t)) seeded.push(t);
  }
  if (msg?.role === 'assistant' && typeof content === 'string') {
    // skill-up's own serialization: the assistant's turn arrives as one flat string, and all of it
    // is prose the assistant wrote.
    prose.push(content);
  } else if (msg?.role === 'assistant' && Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === 'text' || block?.type === 'thinking') collect(block, prose);
      else if (block?.type === 'tool_use') {
        const bucket = [];
        collect(block, bucket);
        attempted.set(block.id ?? `#${attempted.size}`, bucket);
        toolUses.push(block);
      } else collect(block, structural);
    }
    // The record's own metadata is structural even when its content is prose.
    const { message: _m, ...meta } = rec;
    collect(meta, structural);
  } else {
    if (Array.isArray(content)) {
      for (const b of content) {
        if (b?.type === 'tool_result') {
          const bucket = [];
          collect(b, bucket);
          if (isWhollyDenial(bucket)) denied.add(b.tool_use_id);
          else structural.push(...bucket.filter((s) => !isPathListing(s)));
          continue;
        }
        if (b?.type === 'tool_use') toolUses.push(b);
        collect(b, structural);
      }
      const { message: _m, ...meta } = rec;
      // Claude Code MIRRORS the tool result at the record level in `toolUseResult`, so a refusal the
      // block-level discount has just taken out of the scan walks straight back in as metadata.
      // #69's first baseline run failed on exactly that mirror and on nothing else. The mirror is
      // dropped only when it is wholly the refusal — a real result stays structural, and a mirror
      // carrying a line of the body is never discounted (`isWhollyDenial` decides both).
      if (typeof meta.toolUseResult === 'string' && isWhollyDenial([meta.toolUseResult])) delete meta.toolUseResult;
      collect(meta, structural);
    } else {
      collect(rec, structural);
    }
  }
}
for (const [id, bucket] of attempted) if (!denied.has(id)) structural.push(...bucket);

if (records === 0) {
  console.error(`FAIL: ${transcriptPath} holds no transcript records`);
  process.exit(1);
}

const all = prose.concat(structural);

// Only a fingerprint the case did NOT supply is evidence about what the model read. `marks` stays
// whole for the denial and deny-rule discounts above, which are conservative on purpose: a refusal
// message that carries ANY line of the body is not wholly a refusal, whoever wrote the line.
const seedText = seeded.join('\n');
const evidence = marks.filter((m) => !seedText.includes(m));
const seedSupplied = marks.length - evidence.length;
if (evidence.length === 0) {
  console.error(`FAIL: every fingerprint line of ${skillMdPath} appears in this case's own prompt`);
  console.error('   the gate would report the prompt back as the body — there is nothing left to detect with');
  process.exit(1);
}
const fingerprintNote = () =>
  `   (fingerprinted ${evidence.length} line(s) of ${skillMdPath} against ${records} transcript record(s)` +
  `${seedSupplied ? `; ${seedSupplied} discounted as supplied by the case prompt` : ''})`;

// --- contamination --------------------------------------------------------------------------------
// A marketplace install lives under ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/ and
// its marketplaces checkout beside it. Either path in the structural half means the run saw a
// plugin at all, which under an isolated runtime it must not.
const PLUGIN_PATH = /\.claude\/plugins\/(?:cache|marketplaces)\//;

// The runner's OWN deny list is not contact with a plugin, and #69 is where that bit. #75 writes one
// `Read(<copy>/**)` rule per host copy into the isolated home's settings.json — so every marketplace
// path the census found now lives inside the run's own home, and a baseline agent that cannot find
// the skill reads that settings file while hunting for it. The whole deny list then lands in a tool
// result and the run reads CONTAMINATED: the remedy failing the run for working. Both wet-case
// baseline arms did exactly this, and neither had read a line of any body.
//
// Discounted is exactly the rule form the runner writes — `Read(…/plugins/…/**)`, a glob inside a
// permission rule, never a bare path — and, as with every other discount here, never a string that
// also carries a line of the body under test.
const DENY_RULE = /\bRead\(\/*[^)\n]*\.claude\/plugins\/(?:cache|marketplaces)\/[^)\n]*\)/g;
const withoutDenyRules = (s) => (marks.some((m) => s.includes(m)) ? s : s.replace(DENY_RULE, ' '));
const contaminatedBy = structural.filter((s) => PLUGIN_PATH.test(withoutDenyRules(s)));
const pluginPaths = () => {
  const paths = new Set();
  for (const raw of contaminatedBy) {
    const s = withoutDenyRules(raw);
    const m = s.match(/[^\s"']*\.claude\/plugins\/(?:cache|marketplaces)\/[^\s"']*/);
    paths.add(m ? m[0] : s.slice(0, 160));
  }
  return [...paths];
};

// A namespaced invocation is the same finding by another route: `e2e:pw-prove` is the plugin's
// copy, `pw-prove` is the one skill-up installed for this run.
const namespaced = toolUses.filter(
  (t) => t?.name === 'Skill' && /^[A-Za-z0-9_-]+:pw-prove$/.test(String(t?.input?.skill ?? '')),
);

// In a baseline arm the body arriving is asked FIRST, and the reason is a real 2026-08-14 verdict:
// `case-48`'s baseline was refused the plugin cache and the other checkouts by the deny rules, went
// looking anyway, and read the body out of a CONCURRENT case's skill-up install under /tmp. The gate
// reported CONTAMINATED — true, and not the finding that mattered. A dirty baseline voids the
// measurement the arm exists to take, so it outranks the path it took to get there, which the
// verdict names on its own line rather than dropping.
if (BASELINE) {
  const dirty = evidence.find((m) => all.some((s) => s.includes(m)));
  if (dirty) {
    console.error('FAIL: BASELINE DIRTY — the without_skill arm carried the body under test');
    console.error(`   line of the body in context: "${dirty.slice(0, 88)}${dirty.length > 88 ? '…' : ''}"`);
    // The path and the body arrive in DIFFERENT records — the `cat` command in one, the file
    // contents in the next — so this scans the whole structural half rather than the record that
    // carried the fingerprint.
    const sources = new Set();
    for (const s of structural) {
      for (const m of s.matchAll(/[^\s"'\\]*\/skills\/pw-prove\/[^\s"'\\]*/g)) sources.add(m[0]);
    }
    for (const p of [...sources].slice(0, 3)) console.error(`   read from ${p}`);
    for (const p of pluginPaths().slice(0, 2)) console.error(`   and a marketplace plugin path was reached: ${p}`);
    console.error('   uplift measured against this arm is void — seal the host copies and re-run');
    process.exit(3);
  }
}

if (contaminatedBy.length || namespaced.length) {
  console.error('FAIL: CONTAMINATED — this run reached a marketplace plugin copy, not only the version under test');
  for (const t of namespaced) console.error(`   Skill tool invoked as '${t.input.skill}' — a plugin-namespaced skill`);
  // Deduplicated: one transcript names the same install path in a dozen records, and a wall of
  // identical lines hides how many DISTINCT paths were reached.
  const paths = pluginPaths();
  for (const p of paths.slice(0, 3)) console.error(`   ${p}`);
  if (paths.length > 3) console.error(`   … and ${paths.length - 3} more plugin path(s)`);
  process.exit(2);
}

// --- the baseline arm: the body must NOT be here ----------------------------------------------------
// The DIRTY half of this question was asked BEFORE the contamination check above, deliberately.
// Reaching here means the arm is clean and the run is entitled to an uplift reading from it.
if (BASELINE) {
  console.log('PASS: SKILL-FREE — no line of the body under test reached the model in this arm');
  if (toolUses.some((t) => t?.name === 'Skill' && String(t?.input?.skill ?? '') === 'pw-prove')) {
    console.log('   the Skill tool was called and no body followed it — the expected baseline shape');
  }
  console.log(fingerprintNote());
  process.exit(0);
}

// --- did the body reach the model, by any route? ----------------------------------------------------
const routes = [];

if (toolUses.some((t) => t?.name === 'Skill' && String(t?.input?.skill ?? '') === 'pw-prove')) {
  routes.push('skill-tool');
}
// The body itself, wherever it came from: the Skill tool's result, an injection, or a plain Read of
// the file. Deliberately NOT "a tool argument mentioned pw-prove/SKILL.md" — a Read that errored, or
// a grep whose pattern names the path, mentions it without a single line of the body reaching the
// model, and reporting that as LOADED is the same over-count this gate exists to end.
const hit = evidence.find((m) => all.some((s) => s.includes(m)));
if (hit) routes.push('skill-body');

if (routes.length === 0) {
  console.error('FAIL: NOT LOADED — the SKILL.md under test never reached the model in this case');
  console.error('   no Skill tool call, and no line of the body under test anywhere in the transcript');
  console.error(fingerprintNote());
  process.exit(1);
}

console.log(`PASS: LOADED via ${routes.join(', ')}`);
if (hit) console.log(`   body under test in context, e.g. "${hit.slice(0, 72)}${hit.length > 72 ? '…' : ''}"`);
console.log(`   no marketplace plugin path in ${records} transcript record(s)`);
