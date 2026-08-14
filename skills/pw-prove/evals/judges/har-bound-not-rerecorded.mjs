#!/usr/bin/env node
// Judge (case-43): an unbound HAR matches nothing — bind it, do not re-record it.
//
// The old rule was `failure: output_contains` over `re-record`, `hand-write mocks for`,
// `widen the url filter`, `remove notFound`. The correct diagnosis names every one of them in the
// sentence that rules it out ("the recording is fine, so re-recording changes nothing"), which is
// what failed this class of case in the 2026-08-13 run.
//
// The repair is artifact-shaped for the positive half — the emitted command block must carry the
// bind and the exported HAR path — and negation-anchored for the negative half.
//
// Reads $EVAL_FINAL_MESSAGE, or a path argument when triaging one captured answer by hand.
import { readFileSync } from 'node:fs';

const text = process.env.EVAL_FINAL_MESSAGE ?? (process.argv[2] ? readFileSync(process.argv[2], 'utf8') : '');
if (!text.trim()) {
  console.error('FAIL: no $EVAL_FINAL_MESSAGE and no path argument — nothing to judge');
  process.exit(1);
}

const blocks = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);
const emitted = blocks.join('\n');

function commitments(t) {
  return t
    .replace(/```[^\n]*\n[\s\S]*?```/g, '\n')
    .replace(/^\s*>.*$/gm, '')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/[“"']([^"“”'\n]{0,400})[”"']/g, ' ');
}
const NEGATED = /\b(?:not|never|no|nothing|none|nor|neither|don't|doesn't|didn't|cannot|can't|won't|wouldn't|shouldn't|rather than|instead of|without|avoid\w*|refus\w*|reject\w*|rule[ds]? out|forbidden|pointless|unnecessary|wrong)\b/i;
function offenders(t, phrases) {
  const out = [];
  for (const s of commitments(t).split(/(?<=[.!?;])\s+|\n+/)) {
    const line = s.trim();
    if (!line || NEGATED.test(line)) continue;
    for (const p of phrases) if (p.test(line)) out.push(line);
  }
  return [...new Set(out)];
}

// --- the fix, as a command -------------------------------------------------------------------------
if (blocks.length === 0) {
  console.error('FAIL: no fenced block — this case is answered with a command, and none was emitted');
  process.exit(1);
}
const need = [
  [/har-scrub\.mjs\s+bind/, 'the emitted command never runs `har-scrub.mjs bind`'],
  [/--origin/, 'the bind never passes --origin, so the HAR stays unbound to the running server'],
  [/PW_PROVE_HAR/, 'the emitted command never exports PW_PROVE_HAR at the bound copy'],
];
const missing = need.filter(([re]) => !re.test(emitted));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}
if (!/5199/.test(emitted)) {
  console.error('FAIL: the bind origin does not carry the running server\'s port (5199)');
  process.exit(1);
}

// --- and none of the remedies that abandon the recording ----------------------------------------------
const bad = offenders(text, [
  /\bre-?record\w*\b/i,
  /\brecord the HAR again\b/i,
  /\bhand-?(?:write|roll)\w*\b[^\n]{0,40}\bmocks?\b/i,
  /\bwiden\b[^\n]{0,40}\b(?:url|URL) filter\b/i,
  /\bremov\w+\b[^\n]{0,30}notFound/i,
  /\bnotFound[^\n]{0,20}(?:to|→)\s*'?(?:fallback|continue)/i,
  /\bthe recording is (?:too )?short\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer abandons the canonical recording instead of binding it:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

console.log('PASS: the HAR is bound to the running origin and carried on PW_PROVE_HAR; nothing re-recorded');
