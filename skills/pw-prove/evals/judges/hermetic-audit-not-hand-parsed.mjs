#!/usr/bin/env node
// Judge (case-28): the hermetic audit is a script that ships — do not hand-parse the trace.
//
// The old rule was `failure: output_contains` over `parse the trace`, `unzip trace.zip`, `jq `,
// `hand-roll`. A correct answer says "rather than unzipping trace.zip and parsing it by hand, run
// hermetic.mjs", and the bare substring cannot tell that from the thing it forbids. `jq ` was the
// worst of them: two characters of tool name and a space, hit by any sentence that mentions jq at
// all.
//
// The repair is artifact-shaped: the negative applies to the EMITTED COMMAND. A shell block that
// unzips a trace or pipes it through jq is the defect; prose naming either to reject it is not.
//
// Reads $EVAL_FINAL_MESSAGE, or a path argument when triaging one captured answer by hand.
import { readFileSync } from 'node:fs';

const text = process.env.EVAL_FINAL_MESSAGE ?? (process.argv[2] ? readFileSync(process.argv[2], 'utf8') : '');
if (!text.trim()) {
  console.error('FAIL: no $EVAL_FINAL_MESSAGE and no path argument — nothing to judge');
  process.exit(1);
}

const blocks = [...text.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1].trim().toLowerCase(), body: m[2] }));
const shell = blocks.filter((b) => b.lang === '' || /^(?:bash|sh|shell|zsh|console|shell-session)$/.test(b.lang));
const emitted = shell.map((b) => b.body).join('\n');

function commitments(t) {
  return t
    .replace(/```[^\n]*\n[\s\S]*?```/g, '\n')
    .replace(/^\s*>.*$/gm, '')
    .replace(/`[^`\n]*`/g, ' ')
    // Double quotes only. An apostrophe is not a quote delimiter in English prose: pairing
    // "doesn't" with "you're" swallowed the negation between them and turned a correct answer red.
    .replace(/[“"]([^"“”\n]{0,400})[”"]/g, ' ');
}
const NEGATED = /\b(?:would|risks?|worse|out of scope|not|never|no|nothing|none|nor|neither|don't|doesn't|didn't|cannot|can't|won't|wouldn't|shouldn't|rather than|instead of|without|avoid\w*|refus\w*|reject\w*|rule[ds]? out|forbidden|unnecessary|pointless)\b/i;
function offenders(t, phrases) {
  const out = [];
  for (const s of commitments(t).split(/(?<=[.!?;])\s+|\n+/)) {
    const line = s.trim();
    if (!line || NEGATED.test(line)) continue;
    for (const p of phrases) if (p.test(line)) out.push(line);
  }
  return [...new Set(out)];
}

// --- the command ---------------------------------------------------------------------------------------
if (!/hermetic\.mjs/.test(emitted)) {
  console.error('FAIL: no shell block running hermetic.mjs — this case is answered with that command');
  process.exit(1);
}
if (!/--spec\b/.test(emitted)) {
  console.error('FAIL: hermetic.mjs is invoked without --spec, so the in-spec round trips are never attributed');
  process.exit(1);
}

// --- the verdict ---------------------------------------------------------------------------------------
if (!/route\.fetch/.test(text)) {
  console.error('FAIL: the answer never names route.fetch — the in-spec round trips a trace records as MOCKED');
  process.exit(1);
}
if (!/carve-?out/i.test(text)) {
  console.error('FAIL: the answer never reaches a verdict against the declared CARVE-OUT lines');
  process.exit(1);
}

// --- and nothing hand-rolled -----------------------------------------------------------------------------
const handRolled = [];
for (const b of shell) {
  for (const line of b.body.split('\n')) {
    if (/\b(?:unzip|bsdtar|tar\s+-x)\b[^\n]*trace/i.test(line)) handRolled.push(line.trim());
    if (/\bjq\b/.test(line) && /trace|network|\.zip/i.test(line)) handRolled.push(line.trim());
    if (/\bnode\s+-e\b/.test(line)) handRolled.push(line.trim());
  }
}
if (handRolled.length) {
  console.error('FAIL: the emitted command hand-parses the trace instead of running the audit:');
  for (const l of [...new Set(handRolled)].slice(0, 3)) console.error('   ' + l);
  process.exit(1);
}
const bad = offenders(text, [
  /\bwrite (?:a|my own) (?:parser|script)\b/i,
  /\bhand-?roll\w*\b/i,
  /\bparse the trace\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer commits to parsing the trace by hand:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

console.log('PASS: hermetic.mjs --spec run; route.fetch round trips judged against the CARVE-OUT lines');
