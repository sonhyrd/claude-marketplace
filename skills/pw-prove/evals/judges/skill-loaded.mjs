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
// none` (a path argument works too, for the post-run sweep in scripts/run-evals-isolated.sh).
// $PWPROVE_SKILL_MD overrides the body under test; it defaults to this repo's skills/pw-prove.
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
const DEFAULT_SKILL_MD = resolve(HERE, '../../SKILL.md');

const transcriptPath = process.env.EVAL_TRANSCRIPT_PATH || process.argv[2] || '';
const skillMdPath = process.env.PWPROVE_SKILL_MD || DEFAULT_SKILL_MD;

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
if (!existsSync(skillMdPath)) {
  console.error(`FAIL: no SKILL.md to fingerprint at ${skillMdPath}`);
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
const prose = [];
const structural = [];

function collect(node, sink) {
  if (typeof node === 'string') { sink.push(node); return; }
  if (Array.isArray(node)) { for (const v of node) collect(v, sink); return; }
  if (node && typeof node === 'object') { for (const v of Object.values(node)) collect(v, sink); }
}

const toolUses = [];
let records = 0;
for (const line of readFileSync(transcriptPath, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let rec;
  try { rec = JSON.parse(line); } catch { structural.push(line); continue; }
  records++;

  const msg = rec?.message;
  const content = msg?.content;
  if (msg?.role === 'assistant' && Array.isArray(content)) {
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
const hit = marks.find((m) => all.some((s) => s.includes(m)));
if (hit) routes.push('skill-body');
if (structural.some((s) => /pw-prove\/SKILL\.md/.test(s))) routes.push('skill-file');

if (routes.length === 0) {
  console.error('FAIL: NOT LOADED — the SKILL.md under test never reached the model in this case');
  console.error('   no Skill tool call, no body in context, no read of pw-prove/SKILL.md');
  console.error(`   (fingerprinted ${marks.length} line(s) of ${skillMdPath} against ${records} transcript record(s))`);
  process.exit(1);
}

console.log(`PASS: LOADED via ${routes.join(', ')}`);
if (hit) console.log(`   body under test in context, e.g. "${hit.slice(0, 72)}${hit.length > 72 ? '…' : ''}"`);
console.log(`   no marketplace plugin path in ${records} transcript record(s)`);
