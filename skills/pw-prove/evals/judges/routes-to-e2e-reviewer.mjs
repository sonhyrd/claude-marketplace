#!/usr/bin/env node
// Issue #81, the other direction. With BOTH skills installed, a spec-QUALITY request — the suite is
// green and the user does not believe it — must reach e2e-reviewer, and pw-prove must stay out of
// it.
//
// It is deliberately a pw-prove case that pw-prove must NOT answer. The clause #73/#74 added to
// pw-prove's description is the thing at risk: a clause broad enough to swallow "review the tests we
// already have" would take work e2e-reviewer does better, and no single-skill arm can see that
// happening.
//
// The routing core below is duplicated verbatim into both routing judges; its exit codes are in
// judgeRouting().
// >>> routing core — DUPLICATED VERBATIM into every routing judge.
// skill-up copies a judge to a temp directory before it runs, so a relative import of a sibling
// resolves to nothing (judges/README.md, and #81 spent one run learning it again). The copies are
// compared to each other by scripts/ci/test-eval-judges.sh instead, so one copy cannot quietly keep
// an older rule.
//
// Routes, in the order they are believed:
//
//   skill-tool   The Skill tool was called with the skill's bare name AND the call was SERVED. A
//                refused call (`Unknown skill`, a deny rule) is an attempt, not contact — the same
//                distinction #71 drew for tool arguments and #83 for the namespaced route.
//   skill-body   A long, distinctive line of that skill's SKILL.md is somewhere in the transcript
//                that the case's own prompt did not put there. Present because a body can arrive by
//                injection with no tool call, and a routing verdict taken on the tool call alone
//                would read NOT ROUTED on a run that was handed the whole skill.
//
// And one refusal that is neither: a PLUGIN-NAMESPACED invocation (`e2e:pw-prove`) that was served
// is a marketplace copy, not the version under test, so the run measured something else. The judges
// exit 2 on it rather than grading it, exactly as `skill-loaded.mjs` does.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// A refused Skill call. Measured against the host runtime by #83, reused verbatim here so the two
// judges cannot drift apart on what "served" means.
const REFUSED_SKILL = /Unknown skill|blocked by permission rules|has been denied|denied by your permission settings/i;
const PLUGIN_PATH = /\.claude\/plugins\/(?:cache|marketplaces)\//;

// usage: findSkillMd(name, envVar, fromTranscript) — the body of ONE skill, on disk.
// In band a judge is copied to a temp directory before it runs, so this file's own location says
// nothing about where either skill lives. Walk up from the transcript, this file, and the working
// directory, and accept only a SKILL.md whose frontmatter actually names the skill asked for.
function findSkillMd(name, envVar, fromTranscript, here) {
  if (process.env[envVar]) return { path: process.env[envVar], searched: [] };
  const searched = [];
  const named = new RegExp(`^---\\n[\\s\\S]*?^name:\\s*${name}\\s*$`, 'm');
  for (const start of [fromTranscript, here, process.cwd()].filter(Boolean)) {
    let dir = resolve(start);
    for (;;) {
      for (const rel of [`.claude/skills/${name}/SKILL.md`, `skills/${name}/SKILL.md`, 'SKILL.md']) {
        const candidate = resolve(dir, rel);
        if (searched.includes(candidate)) continue;
        searched.push(candidate);
        if (!existsSync(candidate)) continue;
        if (named.test(readFileSync(candidate, 'utf8'))) return { path: candidate, searched };
      }
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  return { path: '', searched };
}

// Long, distinctive lines of a body. Short lines ("## Step 2") occur in prose that never came from
// any skill, so they would report contact that did not happen.
function fingerprints(md) {
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, '');
  const seen = new Set();
  const out = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (line.length < 40 || line.startsWith('#') || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

function collect(node, sink) {
  if (typeof node === 'string') { sink.push(node); return; }
  if (Array.isArray(node)) { for (const v of node) collect(v, sink); return; }
  if (node && typeof node === 'object') { for (const v of Object.values(node)) collect(v, sink); }
}

// usage: readTranscript(path) — the two shapes a judge is handed, read into one report.
// In band skill-up serializes to a JSON array of {role, content}; the post-run sweep hands over the
// raw Claude Code session .jsonl, which additionally carries the tool calls this judge grades on.
function readTranscript(transcriptPath) {
  const raw = readFileSync(transcriptPath, 'utf8');
  let lines;
  if (raw.trimStart().startsWith('[')) {
    lines = JSON.parse(raw).map((m) => JSON.stringify({ message: m }));
  } else {
    lines = raw.split('\n');
  }

  const strings = [];   // everything, prose and structural alike
  const seeded = [];    // what the CASE handed the model — never evidence of what it read
  const toolUses = [];
  const resultOf = new Map();
  let records = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { strings.push(line); continue; }
    records++;
    const msg = rec?.message;
    const content = msg?.content;

    if (rec?.type === 'queue-operation' && typeof rec.content === 'string') seeded.push(rec.content);
    if (msg?.role === 'user' && rec?.isMeta !== true) {
      const texts = typeof content === 'string'
        ? [content]
        : Array.isArray(content) && !content.some((b) => b?.type === 'tool_result')
          ? content.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text)
          : [];
      for (const t of texts) if (!/<(?:skill|system-reminder|command-name|local-command)\b/i.test(t)) seeded.push(t);
    }
    if (Array.isArray(content)) {
      for (const b of content) {
        if (b?.type === 'tool_use') toolUses.push(b);
        if (b?.type === 'tool_result') {
          const bucket = [];
          collect(b, bucket);
          const prior = resultOf.get(b.tool_use_id);
          resultOf.set(b.tool_use_id, {
            isError: (prior?.isError ?? false) || b.is_error === true,
            text: `${prior?.text ?? ''}${bucket.join('\n')}`,
          });
        }
      }
    }
    collect(rec, strings);
  }
  return { strings, seeded, toolUses, resultOf, records };
}

function callRefused(t, resultOf) {
  const r = resultOf.get(t?.id);
  // A call whose result the transcript never recorded is assumed to have landed. Over-reporting
  // contact is the safe direction: it can only cost a case a PASS it did not earn.
  if (!r) return false;
  return r.isError || REFUSED_SKILL.test(r.text);
}

// usage: contact(skillName, marks, data) — did this skill reach the model, and how.
function contact(skillName, marks, data) {
  const { strings, seeded, toolUses, resultOf } = data;
  const calls = toolUses.filter((t) => t?.name === 'Skill' && String(t?.input?.skill ?? '') === skillName);
  const namespaced = toolUses.filter(
    (t) => t?.name === 'Skill' && new RegExp(`^[A-Za-z0-9_-]+:${skillName}$`).test(String(t?.input?.skill ?? '')),
  );
  const served = calls.filter((t) => !callRefused(t, resultOf));
  const refused = calls.filter((t) => callRefused(t, resultOf));
  const namespacedServed = namespaced.filter((t) => !callRefused(t, resultOf));

  // Only a mark the case did NOT supply is evidence about what the model read (#71).
  const seedText = seeded.join('\n');
  const evidence = marks.filter((m) => !seedText.includes(m));
  const bodyHit = evidence.find((m) => strings.some((s) => s.includes(m))) ?? null;

  const routes = [];
  if (served.length) routes.push('skill-tool');
  if (bodyHit) routes.push('skill-body');
  return { routes, served, refused, namespacedServed, bodyHit, evidence: evidence.length, marks: marks.length };
}

function pluginPaths(strings) {
  const out = new Set();
  for (const s of strings) {
    if (!PLUGIN_PATH.test(s)) continue;
    const m = s.match(/[^\s"']*\.claude\/plugins\/(?:cache|marketplaces)\/[^\s"']*/);
    if (m) out.add(m[0]);
  }
  return [...out];
}

// usage: judgeRouting({owner, neighbour, question, here})
// `owner` is the skill this request belongs to; `neighbour` is the one whose description used to
// claim the same words. Exits the process — a judge is a process, and the exit code is its verdict.
//
//   0  ROUTED       the owner reached the model and the neighbour did not
//   1  NOT ROUTED   neither did — the request tripped no trigger surface at all
//   2  CONTAMINATED a plugin-namespaced invocation was served, so this measured a marketplace copy
//   3  WRONG OWNER  only the neighbour reached the model
//   4  COLLISION    both did — the ambiguity this ticket exists to remove, still there
function judgeRouting({ owner, neighbour, question, here }) {
  const transcriptPath = process.env.EVAL_TRANSCRIPT_PATH || process.argv.slice(2)[0] || '';
  if (!transcriptPath) {
    console.error('FAIL: no $EVAL_TRANSCRIPT_PATH and no path argument — nothing to judge');
    process.exit(1);
  }
  if (!existsSync(transcriptPath)) {
    console.error(`FAIL: transcript does not exist: ${transcriptPath}`);
    process.exit(1);
  }
  const from = dirname(resolve(transcriptPath));

  const bodies = {};
  for (const [name, envVar] of [[owner, ownerEnv(owner)], [neighbour, ownerEnv(neighbour)]]) {
    const found = findSkillMd(name, envVar, from, here);
    if (!found.path || !existsSync(found.path)) {
      console.error(`FAIL: no SKILL.md to fingerprint for ${name}`);
      console.error(`   set $${envVar}; searched, from the transcript, this judge, and the working directory:`);
      for (const s of found.searched.slice(0, 6)) console.error(`   ${s}`);
      process.exit(1);
    }
    const marks = fingerprints(readFileSync(found.path, 'utf8'));
    if (marks.length === 0) {
      console.error(`FAIL: ${found.path} yielded no fingerprint lines — the body route would detect nothing`);
      process.exit(1);
    }
    bodies[name] = { path: found.path, marks };
  }

  const data = readTranscript(transcriptPath);
  if (data.records === 0) {
    console.error(`FAIL: ${transcriptPath} holds no transcript records`);
    process.exit(1);
  }

  const o = contact(owner, bodies[owner].marks, data);
  const n = contact(neighbour, bodies[neighbour].marks, data);

  const namespacedServed = [...o.namespacedServed, ...n.namespacedServed];
  if (namespacedServed.length) {
    console.error('FAIL: CONTAMINATED — a plugin-namespaced skill was served, so this run measured a marketplace copy');
    for (const t of namespacedServed) console.error(`   Skill(${t.input.skill}) was invoked and served`);
    for (const p of pluginPaths(data.strings).slice(0, 3)) console.error(`   ${p}`);
    process.exit(2);
  }

  const note = () => {
    console.log(`   question: ${question}`);
    console.log(`   ${owner}: ${o.routes.length ? o.routes.join(', ') : 'no contact'}` +
      `${o.refused.length ? ` (${o.refused.length} refused attempt(s) — an attempt is not contact)` : ''}`);
    console.log(`   ${neighbour}: ${n.routes.length ? n.routes.join(', ') : 'no contact'}` +
      `${n.refused.length ? ` (${n.refused.length} refused attempt(s))` : ''}`);
    console.log(`   (fingerprinted ${o.evidence}/${o.marks} line(s) of ${bodies[owner].path} and ` +
      `${n.evidence}/${n.marks} of ${bodies[neighbour].path} against ${data.records} record(s))`);
  };

  if (o.routes.length && n.routes.length) {
    console.error(`FAIL: COLLISION — this request reached BOTH ${owner} and ${neighbour}`);
    console.error('   both trigger surfaces claim these words, so which skill answers is not decided by the descriptions');
    note();
    process.exit(4);
  }
  if (!o.routes.length && n.routes.length) {
    console.error(`FAIL: WRONG OWNER — this request reached ${neighbour}, and ${owner} owns it`);
    note();
    process.exit(3);
  }
  if (!o.routes.length) {
    console.error(`FAIL: NOT ROUTED — neither ${owner} nor ${neighbour} reached the model`);
    console.error(`   no served Skill call and no line of either body — a defect in ${owner}'s description: frontmatter`);
    note();
    process.exit(1);
  }
  console.log(`PASS: ROUTED to ${owner} via ${o.routes.join(', ')}, and ${neighbour} stayed out of it`);
  note();
  process.exit(0);
}

// The env var that overrides a skill's body path. Named per skill so a fixture can point BOTH
// halves at fixture-local copies and stay hermetic against edits to the real bodies. pw-prove keeps
// the name `skill-loaded.mjs` already established, so one export points both judges at one copy.
function ownerEnv(name) {
  if (name === 'pw-prove') return 'PWPROVE_SKILL_MD';
  return `${name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_SKILL_MD`;
}
// <<< routing core

judgeRouting({
  owner: 'e2e-reviewer',
  neighbour: 'pw-prove',
  question: 'which skill owns "these specs pass but I do not believe them"',
  here: dirname(fileURLToPath(import.meta.url)),
});
