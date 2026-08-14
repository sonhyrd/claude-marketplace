#!/usr/bin/env node
// Judge (b05): a stale handoff is deleted and declared — never folded, never dropped silently.
//
// This replaces `failure: output_contains` over `fold its findings`, `handoff is current`,
// `additive context`. The correct answer names all three in order to reject them ("I do not fold its
// findings as current"), so the substring rule red-flagged the right answer.
//
// The repair is to anchor on the DECISION SENTENCE. A forbidden option only counts against the
// answer when the answer states it affirmatively; a sentence carrying a negation is the answer
// rejecting the option, which is the behaviour this case exists to reward.
//
// Reads $EVAL_FINAL_MESSAGE, or a path argument when triaging one captured answer by hand.
import { readFileSync } from 'node:fs';

const text = process.env.EVAL_FINAL_MESSAGE ?? (process.argv[2] ? readFileSync(process.argv[2], 'utf8') : '');
if (!text.trim()) {
  console.error('FAIL: no $EVAL_FINAL_MESSAGE and no path argument — nothing to judge');
  process.exit(1);
}

// --- what the answer COMMITS to ---------------------------------------------------------------------
// Fenced blocks, block quotes, inline code and quoted spans are the answer reporting what it was
// GIVEN, or quoting the thing it refuses. They are not its own plan, so they are out of scope for a
// negative assertion by construction.
function commitments(t) {
  return t
    .replace(/```[^\n]*\n[\s\S]*?```/g, '\n')
    .replace(/^\s*>.*$/gm, '')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/[“"']([^"“”'\n]{0,400})[”"']/g, ' ');
}
// A sentence carrying a negation is the answer naming the forbidden option in order to reject it.
const NEGATED = /\b(?:not|never|no|nothing|none|nor|neither|don't|doesn't|didn't|cannot|can't|won't|wouldn't|shouldn't|rather than|instead of|without|avoid\w*|refus\w*|reject\w*|decline\w*|forbidden|ignor\w*)\b/i;
function offenders(t, phrases) {
  const out = [];
  for (const s of commitments(t).split(/(?<=[.!?;])\s+|\n+/)) {
    const line = s.trim();
    if (!line || NEGATED.test(line)) continue;
    for (const p of phrases) if (p.test(line)) out.push(line);
  }
  return [...new Set(out)];
}

// --- the decision ------------------------------------------------------------------------------------
const checks = [
  [/\bstale\b/i, 'the answer never calls the handoff stale'],
  [/\b(?:delete|deleting|deleted|remove|removing|removed|rm\b|unlink)\b/i, 'the answer never deletes the handoff file'],
  [/\bassumption/i, 'the answer never carries an Assumptions line'],
  [/9f1c4ae/, 'the answer never names the recorded head sha (9f1c4ae…)'],
  [/c3a77d1/, 'the answer never names the current HEAD sha (c3a77d1…)'],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

const bad = offenders(text, [
  /\bfold(?:ing|s|ed)?\b[^\n]*\bfinding/i,
  /\bfinding[^\n]*\bfold(?:ed|ing)?\b/i,
  /\bhandoff (?:is|remains|stays) current\b/i,
  /\badditive context\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer treats the stale handoff as usable:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

console.log('PASS: stale handoff deleted and declared, both shas named, nothing folded');
