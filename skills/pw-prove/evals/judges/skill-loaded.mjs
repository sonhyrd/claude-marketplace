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
// Exit codes are three-valued on purpose — "the case was contaminated" and "the case never loaded
// the skill" call for different repairs:
//   0  LOADED and clean
//   1  NOT LOADED — the version under test never reached the model
//   2  CONTAMINATED — the run reached a marketplace plugin copy, so isolation did not hold
//
// Non-invocation stays a FAIL. The gate exists to make the failure diagnosable, not to excuse it.
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

const transcriptPath = process.env.EVAL_TRANSCRIPT_PATH || process.argv[2] || '';

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

const toolUses = [];
let records = 0;
for (const line of lines) {
  if (!line.trim()) continue;
  let rec;
  try { rec = JSON.parse(line); } catch { structural.push(line); continue; }
  records++;

  const msg = rec?.message;
  const content = msg?.content;
  if (msg?.role === 'assistant' && typeof content === 'string') {
    // skill-up's own serialization: the assistant's turn arrives as one flat string, and all of it
    // is prose the assistant wrote.
    prose.push(content);
  } else if (msg?.role === 'assistant' && Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === 'text' || block?.type === 'thinking') collect(block, prose);
      else collect(block, structural);
      if (block?.type === 'tool_use') toolUses.push(block);
    }
    // The record's own metadata is structural even when its content is prose.
    const { message: _m, ...meta } = rec;
    collect(meta, structural);
  } else {
    collect(rec, structural);
    if (Array.isArray(content)) for (const b of content) if (b?.type === 'tool_use') toolUses.push(b);
  }
}

if (records === 0) {
  console.error(`FAIL: ${transcriptPath} holds no transcript records`);
  process.exit(1);
}

const all = prose.concat(structural);

// --- contamination --------------------------------------------------------------------------------
// A marketplace install lives under ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/ and
// its marketplaces checkout beside it. Either path in the structural half means the run saw a
// plugin at all, which under an isolated runtime it must not.
const PLUGIN_PATH = /\.claude\/plugins\/(?:cache|marketplaces)\//;
const contaminatedBy = structural.filter((s) => PLUGIN_PATH.test(s));

// A namespaced invocation is the same finding by another route: `e2e:pw-prove` is the plugin's
// copy, `pw-prove` is the one skill-up installed for this run.
const namespaced = toolUses.filter(
  (t) => t?.name === 'Skill' && /^[A-Za-z0-9_-]+:pw-prove$/.test(String(t?.input?.skill ?? '')),
);

if (contaminatedBy.length || namespaced.length) {
  console.error('FAIL: CONTAMINATED — this run reached a marketplace plugin copy, not only the version under test');
  for (const t of namespaced) console.error(`   Skill tool invoked as '${t.input.skill}' — a plugin-namespaced skill`);
  // Deduplicated: one transcript names the same install path in a dozen records, and a wall of
  // identical lines hides how many DISTINCT paths were reached.
  const paths = new Set();
  for (const s of contaminatedBy) {
    const m = s.match(/[^\s"']*\.claude\/plugins\/(?:cache|marketplaces)\/[^\s"']*/);
    paths.add(m ? m[0] : s.slice(0, 160));
  }
  for (const p of [...paths].slice(0, 3)) console.error(`   ${p}`);
  if (paths.size > 3) console.error(`   … and ${paths.size - 3} more plugin path(s)`);
  process.exit(2);
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
const hit = marks.find((m) => all.some((s) => s.includes(m)));
if (hit) routes.push('skill-body');

if (routes.length === 0) {
  console.error('FAIL: NOT LOADED — the SKILL.md under test never reached the model in this case');
  console.error('   no Skill tool call, and no line of the body under test anywhere in the transcript');
  console.error(`   (fingerprinted ${marks.length} line(s) of ${skillMdPath} against ${records} transcript record(s))`);
  process.exit(1);
}

console.log(`PASS: LOADED via ${routes.join(', ')}`);
if (hit) console.log(`   body under test in context, e.g. "${hit.slice(0, 72)}${hit.length > 72 ? '…' : ''}"`);
console.log(`   no marketplace plugin path in ${records} transcript record(s)`);
